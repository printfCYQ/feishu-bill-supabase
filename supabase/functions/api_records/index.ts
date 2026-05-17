import { verifyUser } from 'auth'
import { corsHeaders, getCorsHeadersWithOrigin } from 'cors'
import { feishuRequest } from 'feishu'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { errorResponse } from 'response'
import { add, parseTimestamp, sub } from 'utils'

const FEISHU_APP_TOKEN = Deno.env.get('FEISHU_APP_TOKEN')!
const FEISHU_TABLE_RECORDS = Deno.env.get('FEISHU_TABLE_RECORDS')!
const ALLOWED_OPEN_IDS = (Deno.env.get('ALLOWED_OPEN_IDS') || '').split(',').filter(Boolean)

const TZ_OFFSET = 8 * 60 * 60 * 1000

function normalizeType(type: string): string {
  if (type === '收入') return 'income'
  if (type === '支出') return 'expense'
  if (type === 'income' || type === 'expense') return type
  return type
}

async function getAllRecords(appToken: string, tableId: string): Promise<unknown[]> {
  const allRecords: unknown[] = []
  let pageToken = ''

  while (true) {
    const data = await feishuRequest(
      'GET',
      `/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500&page_token=${pageToken}`
    ) as { items?: unknown[]; page_token?: string; has_more?: boolean }

    const items = data.items || []
    allRecords.push(...items)

    pageToken = data.page_token || ''
    if (!pageToken || !data.has_more) {
      break
    }
  }

  return allRecords
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

interface RecordItem {
  record_id: string
  fields: {
    id?: string
    user_id?: string
    amount?: number | string
    type?: string
    category_id?: string
    category_name?: string
    note?: string
    created_at?: number | string
  }
}

async function handleGetSingleRecord(record_id: string): Promise<Response> {
  const data = await feishuRequest(
    'GET',
    `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records/${record_id}`
  ) as { record?: RecordItem }

  const record = data.record ? {
    record_id: data.record.record_id,
    id: data.record.fields.id,
    user_id: data.record.fields.user_id || null,
    amount: parseFloat(String(data.record.fields.amount)) || 0,
    type: normalizeType(data.record.fields.type || ''),
    category_id: data.record.fields.category_id || '',
    category_name: data.record.fields.category_name || '',
    note: data.record.fields.note || '',
    created_at: parseTimestamp(data.record.fields.created_at),
  } : null

  return jsonResponse({ code: 0, message: 'success', data: record })
}

async function handleChartsSummary(
  year: string | null,
  month: string | null,
  user_id: string | null,
  authOpenId: string | undefined
): Promise<Response> {
  if (!year) {
    return jsonResponse({ code: -1, message: 'invalid param: year is required' }, 400)
  }

  const items = await getAllRecords(FEISHU_APP_TOKEN, FEISHU_TABLE_RECORDS) as RecordItem[]

  let filteredItems = items.filter((item) => {
    const itemUserId = item.fields.user_id || ''
    return (!user_id || itemUserId === user_id || (!itemUserId && authOpenId))
  })

  const yearNum = parseInt(year)

  const monthData: unknown[] = []
  for (let m = 1; m <= 12; m++) {
    const startDate = new Date(yearNum, m - 1, 1).getTime() - TZ_OFFSET
    const endDate = new Date(yearNum, m, 0, 23, 59, 59, 999).getTime() - TZ_OFFSET

    let monthIncome = 0
    let monthExpense = 0
    const monthCategoryStats: Record<string, { income: number; expense: number }> = {}

    const monthItems = filteredItems.filter((item) => {
      const createdAt = parseTimestamp(item.fields.created_at)
      return createdAt >= startDate && createdAt <= endDate
    })

    monthItems.forEach((item) => {
      const amount = parseFloat(String(item.fields.amount)) || 0
      const itemType = normalizeType(item.fields.type || '')
      const categoryName = item.fields.category_name || '其他'

      if (!monthCategoryStats[categoryName]) {
        monthCategoryStats[categoryName] = { income: 0, expense: 0 }
      }

      if (itemType === 'income') {
        monthIncome = add(monthIncome, amount)
        monthCategoryStats[categoryName].income = add(monthCategoryStats[categoryName].income, amount)
      } else {
        monthExpense = add(monthExpense, amount)
        monthCategoryStats[categoryName].expense = add(monthCategoryStats[categoryName].expense, amount)
      }
    })

    monthData.push({
      year: yearNum,
      month: m,
      total_income: monthIncome,
      total_expense: monthExpense,
      balance: sub(monthIncome, monthExpense),
      category_stats: monthCategoryStats,
    })
  }

  const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1
  const currentMonthData = (monthData as Array<{
    month: number
    total_income: number
    total_expense: number
    balance: number
    category_stats: Record<string, { expense: number }>
  }>).find((m) => m.month === targetMonth) || {
    total_income: 0,
    total_expense: 0,
    balance: 0,
    category_stats: {},
  }

  const expenseCategoryStats = currentMonthData.category_stats
  const topCategories = Object.entries(expenseCategoryStats)
    .map(([name, stats]) => ({ name, expense: stats.expense }))
    .filter((item) => item.expense > 0)
    .sort((a, b) => b.expense - a.expense)
    .slice(0, 5)

  let yearTotalIncome = 0
  let yearTotalExpense = 0
  const yearCategoryStats: Record<string, { income: number; expense: number }> = {}

  const yearStart = new Date(yearNum, 0, 1).getTime() - TZ_OFFSET
  const yearEnd = new Date(yearNum, 11, 31, 23, 59, 59, 999).getTime() - TZ_OFFSET

  const yearItems = filteredItems.filter((item) => {
    const createdAt = parseTimestamp(item.fields.created_at)
    return createdAt >= yearStart && createdAt <= yearEnd
  })

  yearItems.forEach((item) => {
    const amount = parseFloat(String(item.fields.amount)) || 0
    const itemType = normalizeType(item.fields.type || '')
    const categoryName = item.fields.category_name || '其他'

    if (!yearCategoryStats[categoryName]) {
      yearCategoryStats[categoryName] = { income: 0, expense: 0 }
    }

    if (itemType === 'income') {
      yearTotalIncome = add(yearTotalIncome, amount)
      yearCategoryStats[categoryName].income = add(yearCategoryStats[categoryName].income, amount)
    } else {
      yearTotalExpense = add(yearTotalExpense, amount)
      yearCategoryStats[categoryName].expense = add(yearCategoryStats[categoryName].expense, amount)
    }
  })

  const yearTopCategories = Object.entries(yearCategoryStats)
    .map(([name, stats]) => ({ name, expense: stats.expense }))
    .filter((item) => item.expense > 0)
    .sort((a, b) => b.expense - a.expense)
    .slice(0, 5)

  return jsonResponse({
    code: 0,
    message: 'success',
    data: {
      year: yearNum,
      month: targetMonth,
      current_month: {
        total_income: currentMonthData.total_income,
        total_expense: currentMonthData.total_expense,
        balance: currentMonthData.balance,
        category_stats: currentMonthData.category_stats,
        top_categories: topCategories,
      },
      year_total: {
        total_income: yearTotalIncome,
        total_expense: yearTotalExpense,
        balance: sub(yearTotalIncome, yearTotalExpense),
        category_stats: yearCategoryStats,
        top_categories: yearTopCategories,
      },
      year_months: monthData,
    },
  })
}

async function handleAllSummary(
  user_id: string | null,
  authOpenId: string | undefined
): Promise<Response> {
  const items = await getAllRecords(FEISHU_APP_TOKEN, FEISHU_TABLE_RECORDS) as RecordItem[]

  let filteredItems = items.filter((item) => {
    const itemUserId = item.fields.user_id || ''
    return (!user_id || itemUserId === user_id || (!itemUserId && authOpenId))
  })

  const yearMonthData: Record<string, unknown> = {}
  const categoryStats: Record<string, { income: number; expense: number }> = {}
  let totalIncome = 0
  let totalExpense = 0

  filteredItems.forEach((item) => {
    const createdAt = parseTimestamp(item.fields.created_at)
    if (!createdAt) return

    const localDate = new Date(createdAt + TZ_OFFSET)
    const year = localDate.getUTCFullYear()
    const month = localDate.getUTCMonth() + 1
    const key = `${year}-${month.toString().padStart(2, '0')}`

    const amount = parseFloat(String(item.fields.amount)) || 0
    const itemType = normalizeType(item.fields.type || '')
    const categoryName = item.fields.category_name || '其他'

    if (!yearMonthData[key]) {
      yearMonthData[key] = {
        year,
        month,
        total_income: 0,
        total_expense: 0,
        balance: 0,
        category_stats: {},
      }
    }

    if (!((yearMonthData[key] as { category_stats: Record<string, { income: number; expense: number }> }).category_stats[categoryName])) {
      (yearMonthData[key] as { category_stats: Record<string, { income: number; expense: number }> }).category_stats[categoryName] = { income: 0, expense: 0 }
    }

    if (!categoryStats[categoryName]) {
      categoryStats[categoryName] = { income: 0, expense: 0 }
    }

    if (itemType === 'income') {
      totalIncome = add(totalIncome, amount)
      ;(yearMonthData[key] as { total_income: number }).total_income = add((yearMonthData[key] as { total_income: number }).total_income, amount)
      ;(yearMonthData[key] as { category_stats: Record<string, { income: number; expense: number }> }).category_stats[categoryName].income = add((yearMonthData[key] as { category_stats: Record<string, { income: number; expense: number }> }).category_stats[categoryName].income, amount)
      categoryStats[categoryName].income = add(categoryStats[categoryName].income, amount)
    } else {
      totalExpense = add(totalExpense, amount)
      ;(yearMonthData[key] as { total_expense: number }).total_expense = add((yearMonthData[key] as { total_expense: number }).total_expense, amount)
      ;(yearMonthData[key] as { category_stats: Record<string, { income: number; expense: number }> }).category_stats[categoryName].expense = add((yearMonthData[key] as { category_stats: Record<string, { income: number; expense: number }> }).category_stats[categoryName].expense, amount)
      categoryStats[categoryName].expense = add(categoryStats[categoryName].expense, amount)
    }

    ;(yearMonthData[key] as { balance: number }).balance = sub((yearMonthData[key] as { total_income: number }).total_income, (yearMonthData[key] as { total_expense: number }).total_expense)
  })

  const yearMonths = Object.values(yearMonthData).sort((a: any, b: any) => {
    if (a.year !== b.year) return a.year - b.year
    return a.month - b.month
  })

  const topCategories = Object.entries(categoryStats)
    .map(([name, stats]) => ({ name, expense: stats.expense }))
    .filter((item) => item.expense > 0)
    .sort((a, b) => b.expense - a.expense)
    .slice(0, 5)

  const yearData: Record<number, { year: number; total_income: number; total_expense: number; balance: number }> = {}

  filteredItems.forEach((item) => {
    const createdAt = parseTimestamp(item.fields.created_at)
    if (!createdAt) return

    const localDate = new Date(createdAt + TZ_OFFSET)
    const year = localDate.getUTCFullYear()
    const amount = parseFloat(String(item.fields.amount)) || 0
    const itemType = normalizeType(item.fields.type || '')

    if (!yearData[year]) {
      yearData[year] = { year, total_income: 0, total_expense: 0, balance: 0 }
    }

    if (itemType === 'income') {
      yearData[year].total_income = add(yearData[year].total_income, amount)
    } else {
      yearData[year].total_expense = add(yearData[year].total_expense, amount)
    }
  })

  Object.values(yearData).forEach((y) => {
    y.balance = sub(y.total_income, y.total_expense)
  })

  const years = Object.values(yearData).sort((a, b) => a.year - b.year)

  const sortedYears = [...years].map((y) => y.year).sort((a, b) => a - b)
  const cumulativeData: { year: number; cumulative_income: number; cumulative_expense: number }[] = []

  let totalCumIncome = 0
  let totalCumExpense = 0

  sortedYears.forEach((year) => {
    const yearStart = new Date(year, 0, 1).getTime() - TZ_OFFSET
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999).getTime() - TZ_OFFSET

    filteredItems.forEach((item) => {
      const createdAt = parseTimestamp(item.fields.created_at)
      if (!createdAt || createdAt < yearStart || createdAt > yearEnd) return

      const amount = parseFloat(String(item.fields.amount)) || 0
      const itemType = normalizeType(item.fields.type || '')

      if (itemType === 'income') {
        totalCumIncome = add(totalCumIncome, amount)
      } else {
        totalCumExpense = add(totalCumExpense, amount)
      }
    })

    cumulativeData.push({
      year,
      cumulative_income: totalCumIncome,
      cumulative_expense: totalCumExpense,
    })
  })

  return jsonResponse({
    code: 0,
    message: 'success',
    data: {
      total_income: totalIncome,
      total_expense: totalExpense,
      balance: sub(totalIncome, totalExpense),
      total_records: filteredItems.length,
      top_categories: topCategories,
      year_months: yearMonths,
      category_stats: categoryStats,
      years: years,
      cumulative_years: cumulativeData,
    },
  })
}

async function handleSummary(
  year: string,
  month: string,
  user_id: string | null,
  authOpenId: string | undefined
): Promise<Response> {
  if (!year || !month) {
    return jsonResponse({ code: -1, message: 'invalid param: year and month required' }, 400)
  }

  const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).getTime() - TZ_OFFSET
  const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999).getTime() - TZ_OFFSET

  const items = await getAllRecords(FEISHU_APP_TOKEN, FEISHU_TABLE_RECORDS) as RecordItem[]

  let filteredItems = items.filter((item) => {
    const createdAt = parseTimestamp(item.fields.created_at)
    const itemUserId = item.fields.user_id || ''
    return createdAt >= startDate && createdAt <= endDate && (!user_id || itemUserId === user_id || (!itemUserId && authOpenId))
  })

  let total_income = 0
  let total_expense = 0
  const category_stats: Record<string, { income: number; expense: number }> = {}

  filteredItems.forEach((item) => {
    const amount = parseFloat(String(item.fields.amount)) || 0
    const itemType = normalizeType(item.fields.type || '')
    const category_name = item.fields.category_name || '其他'

    if (!category_stats[category_name]) {
      category_stats[category_name] = { income: 0, expense: 0 }
    }

    if (itemType === 'income') {
      total_income = add(total_income, amount)
      category_stats[category_name].income = add(category_stats[category_name].income, amount)
    } else {
      total_expense = add(total_expense, amount)
      category_stats[category_name].expense = add(category_stats[category_name].expense, amount)
    }
  })

  return jsonResponse({
    code: 0,
    message: 'success',
    data: {
      year,
      month,
      total_income,
      total_expense,
      balance: sub(total_income, total_expense),
      category_stats,
    },
  })
}

async function handleGetRecordList(
  url: URL,
  authOpenId: string | undefined
): Promise<Response> {
  const user_id = url.searchParams.get('user_id')
  const type = url.searchParams.get('type')
  const year = url.searchParams.get('year')
  const month = url.searchParams.get('month')
  const start_date = url.searchParams.get('start_date')
  const end_date = url.searchParams.get('end_date')
  const note = url.searchParams.get('note')
  const amount_min = url.searchParams.get('amount_min')
  const amount_max = url.searchParams.get('amount_max')
  const category_id = url.searchParams.get('category_id')
  const page = parseInt(url.searchParams.get('page') || '1')
  const pageSize = parseInt(url.searchParams.get('pageSize') || '50')
  const sortBy = url.searchParams.get('sortBy') || 'created_at'
  const sortOrder = url.searchParams.get('sortOrder') || 'desc'
  const category_ids = url.searchParams.get('category_ids')
  const include_stats = url.searchParams.get('include_stats') === 'true'

  const items = await getAllRecords(FEISHU_APP_TOKEN, FEISHU_TABLE_RECORDS) as RecordItem[]

  let records = items.map((item) => ({
    record_id: item.record_id,
    id: item.fields.id,
    user_id: item.fields.user_id || null,
    amount: parseFloat(String(item.fields.amount)) || 0,
    type: normalizeType(item.fields.type || ''),
    category_id: item.fields.category_id || '',
    category_name: item.fields.category_name || '',
    note: item.fields.note || '',
    created_at: parseTimestamp(item.fields.created_at),
  }))

  if (type && ['income', 'expense'].includes(type)) {
    records = records.filter((r) => r.type === type)
  }

  if (category_id) {
    records = records.filter((r) => r.category_id === category_id)
  }

  if (category_ids) {
    const ids = category_ids.split(',')
    records = records.filter((r) => ids.includes(r.category_id))
  }

  if (user_id) {
    records = records.filter((r) => r.user_id === user_id)
  } else if (ALLOWED_OPEN_IDS.length > 0) {
    records = records.filter((r) => !r.user_id || r.user_id === authOpenId)
  }

  if (year && month) {
    const startTs = new Date(parseInt(year), parseInt(month) - 1, 1).getTime() - TZ_OFFSET
    const endTs = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999).getTime() - TZ_OFFSET
    records = records.filter((r) => r.created_at >= startTs && r.created_at <= endTs)
  } else if (start_date && end_date) {
    const startTs = new Date(start_date).getTime()
    const endTs = new Date(end_date + 'T23:59:59.999').getTime()
    records = records.filter((r) => r.created_at >= startTs && r.created_at <= endTs)
  }

  if (note) {
    const keyword = note.toLowerCase()
    records = records.filter((r) => r.note && r.note.toLowerCase().includes(keyword))
  }

  if (amount_min || amount_max) {
    const min = amount_min ? parseFloat(amount_min) : 0
    const max = amount_max ? parseFloat(amount_max) : Infinity
    records = records.filter((r) => r.amount >= min && r.amount <= max)
  }

  records.sort((a, b) => {
    let valA: number | string = a[sortBy as keyof typeof a] as number | string
    let valB: number | string = b[sortBy as keyof typeof b] as number | string

    if (sortBy === 'created_at' || sortBy === 'amount') {
      valA = a[sortBy as keyof typeof a] as number
      valB = b[sortBy as keyof typeof b] as number
    }

    if (sortOrder === 'asc') {
      return valA > valB ? 1 : -1
    } else {
      return valA < valB ? 1 : -1
    }
  })

  const total = records.length
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const paginatedRecords = records.slice(start, end)

  const result: Record<string, unknown> = {
    records: paginatedRecords,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }

  if (include_stats) {
    let totalIncome = 0
    let totalExpense = 0
    records.forEach((r) => {
      if (r.type === 'income') {
        totalIncome = add(totalIncome, r.amount)
      } else {
        totalExpense = add(totalExpense, r.amount)
      }
    })
    result.totalIncome = totalIncome
    result.totalExpense = totalExpense
    result.balance = sub(totalIncome, totalExpense)
  }

  return jsonResponse({ code: 0, message: 'success', data: result })
}

async function handleBatchCreate(
  body: Record<string, unknown>,
  authOpenId: string | undefined
): Promise<Response> {
  const records = body.records as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(records) || records.length === 0) {
    return jsonResponse({ code: -1, message: '缺少必要参数: records (数组)' }, 400)
  }

  const errors: string[] = []
  const validRecords: { fields: Record<string, unknown> }[] = []

  for (const record of records) {
    const { id, amount, type, category_id, category_name, note, created_at } = record

    if (!amount || !type) {
      errors.push(`记录缺少必要参数: ${JSON.stringify(record)}`)
      continue
    }

    if (!category_id && !category_name) {
      errors.push(`记录缺少分类信息 (category_id 或 category_name): ${JSON.stringify(record)}`)
      continue
    }

    const createdAt = created_at ? parseInt(String(created_at)) : Date.now()
    const resolvedId = id || crypto.randomUUID()

    validRecords.push({
      fields: {
        user_id: authOpenId || '',
        id: resolvedId,
        amount: parseFloat(String(amount)),
        type,
        category_id: category_id || '',
        category_name: category_name || '',
        note: note || '',
        created_at: createdAt,
      },
    })
  }

  if (validRecords.length === 0) {
    return jsonResponse({
      code: -1,
      message: '没有可导入的记录',
      data: { success_count: 0, error_count: errors.length, duplicate_count: 0, results: [], errors },
    }, 400)
  }

  const existingRecords = await getAllRecords(FEISHU_APP_TOKEN, FEISHU_TABLE_RECORDS) as RecordItem[]
  const existingRecordKeys = new Set(
    existingRecords.map((record) =>
      `${record.fields.amount}_${record.fields.type}_${record.fields.category_name || ''}_${record.fields.created_at}`
    )
  )

  const newRecords: { fields: Record<string, unknown> }[] = []
  let duplicateCount = 0
  for (const record of validRecords) {
    const key = `${record.fields.amount}_${record.fields.type}_${record.fields.category_name || ''}_${record.fields.created_at}`
    if (existingRecordKeys.has(key)) {
      duplicateCount++
    } else {
      newRecords.push(record)
    }
  }

  if (newRecords.length === 0) {
    return jsonResponse({
      code: 0,
      message: `没有新记录需要导入，跳过 ${duplicateCount} 条重复记录`,
      data: {
        success_count: 0,
        error_count: errors.length,
        duplicate_count: duplicateCount,
        results: [],
        errors,
      },
    })
  }

  const BATCH_SIZE = 1000
  const totalBatches = Math.ceil(newRecords.length / BATCH_SIZE)

  const allCreatedRecords: unknown[] = []
  const allErrors: string[] = [...errors]
  let successCount = 0
  let errorCount = errors.length

  try {
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * BATCH_SIZE
      const end = Math.min(start + BATCH_SIZE, newRecords.length)
      const batch = newRecords.slice(start, end)

      try {
        const data = await feishuRequest(
          'POST',
          `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records/batch_create`,
          { records: batch }
        ) as { records?: Array<{ record_id: string }> }

        const createdRecords = (data.records || []).map((record, index) => ({
          record_id: record.record_id,
          user_id: batch[index].fields.user_id,
          amount: batch[index].fields.amount,
          type: batch[index].fields.type,
          category_id: batch[index].fields.category_id,
          category_name: batch[index].fields.category_name,
          note: batch[index].fields.note,
          created_at: batch[index].fields.created_at,
        }))

        allCreatedRecords.push(...createdRecords)
        successCount += createdRecords.length
      } catch (batchError: unknown) {
        const errorMsg = `第 ${batchIndex + 1} 批失败: ${(batchError as Error).message}`
        allErrors.push(errorMsg)
        errorCount += batch.length
      }

      if (batchIndex < totalBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    if (successCount === 0 && errorCount > 0) {
      return jsonResponse({
        code: -1,
        message: `批量创建失败：${allErrors.length} 条记录导入失败，跳过 ${duplicateCount} 条重复记录`,
        data: {
          success_count: 0,
          error_count: errorCount,
          duplicate_count: duplicateCount,
          results: [],
          errors: allErrors.slice(0, 10),
        },
      }, 500)
    }

    return jsonResponse({
      code: 0,
      message: `批量创建完成：成功 ${successCount} 条，失败 ${errorCount} 条，跳过 ${duplicateCount} 条重复记录`,
      data: {
        success_count: successCount,
        error_count: errorCount,
        duplicate_count: duplicateCount,
        results: allCreatedRecords,
        errors: allErrors,
      },
    }, 201)
  } catch (e: unknown) {
    return jsonResponse({
      code: -1,
      message: `批量创建失败: ${(e as Error).message}，跳过 ${duplicateCount} 条重复记录`,
      data: {
        success_count: successCount,
        error_count: errorCount,
        duplicate_count: duplicateCount,
        results: allCreatedRecords,
        errors: [...allErrors, `${(e as Error).message}`],
      },
    }, 500)
  }
}

async function handleCreateRecord(
  body: Record<string, unknown>,
  authOpenId: string | undefined
): Promise<Response> {
  const { id, amount, type, category_id, category_name, note, created_at } = body
  if (!amount || !type || !category_id || !category_name) {
    return jsonResponse({ code: -1, message: '缺少必要参数: amount, type, category_id, category_name' }, 400)
  }

  const createdAt = created_at ? parseInt(String(created_at)) : Date.now()
  const resolvedId = id || crypto.randomUUID()

  const data = await feishuRequest(
    'POST',
    `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records`,
    {
      fields: {
        user_id: authOpenId || '',
        id: resolvedId,
        amount: parseFloat(String(amount)),
        type,
        category_id,
        category_name,
        note: note || '',
        created_at: createdAt,
      },
    }
  ) as { record: { record_id: string } }

  return jsonResponse({
    code: 0,
    message: '创建成功',
    data: {
      record_id: data.record.record_id,
      id: resolvedId,
      user_id: authOpenId || null,
      amount: parseFloat(String(amount)),
      type,
      category_id,
      category_name,
      note: note || '',
      created_at: createdAt,
    },
  }, 201)
}

async function handleUpdateRecord(body: Record<string, unknown>): Promise<Response> {
  const { record_id, amount, type, category_id, category_name, note, created_at } = body
  if (!record_id) {
    return jsonResponse({ code: -1, message: '缺少必要参数: record_id' }, 400)
  }

  const updateData: Record<string, unknown> = {}
  if (amount !== undefined) updateData.amount = parseFloat(String(amount))
  if (type) updateData.type = type
  if (category_id) updateData.category_id = category_id
  if (category_name) updateData.category_name = category_name
  if (note !== undefined) updateData.note = note
  if (created_at !== undefined) updateData.created_at = parseInt(String(created_at))

  if (Object.keys(updateData).length === 0) {
    return jsonResponse({ code: -1, message: '没有需要更新的字段' }, 400)
  }

  await feishuRequest(
    'PUT',
    `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records/${record_id}`,
    { fields: updateData }
  )

  return jsonResponse({ code: 0, message: '更新成功' })
}

async function handleDeleteRecord(record_id: string | null): Promise<Response> {
  if (!record_id) {
    return jsonResponse({ code: -1, message: '缺少必要参数: record_id' }, 400)
  }

  await feishuRequest(
    'DELETE',
    `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records/${record_id}`
  )

  return jsonResponse({ code: 0, message: '删除成功' })
}

serve(async (req) => {
  const url = new URL(req.url)
  const frontendOrigin = req.headers.get('origin') || `https://${url.hostname}`
  const corsHeadersWithOrigin = getCorsHeadersWithOrigin(frontendOrigin)

  if (req.method === 'OPTIONS') {
    return new Response('OK', { headers: corsHeadersWithOrigin })
  }

  try {
    const auth = await verifyUser(req)

    switch (req.method) {
      case 'GET': {
        if (!auth.authorized) {
          return errorResponse('未授权访问', undefined, 401)
        }

        const action = url.searchParams.get('action')
        const record_id = url.searchParams.get('record_id')
        const user_id = url.searchParams.get('user_id')
        const year = url.searchParams.get('year')
        const month = url.searchParams.get('month')

        if (record_id) {
          return await handleGetSingleRecord(record_id)
        }

        switch (action) {
          case 'charts_summary':
            return await handleChartsSummary(year, month, user_id, auth.open_id)
          case 'summary':
            return await handleSummary(year!, month!, user_id, auth.open_id)
          case 'all_summary':
            return await handleAllSummary(user_id, auth.open_id)
          default:
            return await handleGetRecordList(url, auth.open_id)
        }
      }

      case 'POST': {
        if (!auth.authorized) {
          return errorResponse('未授权访问', undefined, 401)
        }

        let body: Record<string, unknown>
        try {
          body = await req.json()
        } catch {
          return errorResponse('无效的 JSON 数据', undefined, 400)
        }

        const action = url.searchParams.get('action')
        if (action === 'batch') {
          return await handleBatchCreate(body, auth.open_id)
        }
        return await handleCreateRecord(body, auth.open_id)
      }

      case 'PUT': {
        if (!auth.authorized) {
          return errorResponse('未授权访问', undefined, 401)
        }

        let body: Record<string, unknown>
        try {
          body = await req.json()
        } catch {
          return errorResponse('无效的 JSON 数据', undefined, 400)
        }

        return await handleUpdateRecord(body)
      }

      case 'DELETE': {
        if (!auth.authorized) {
          return errorResponse('未授权访问', undefined, 401)
        }

        const record_id = url.searchParams.get('record_id')
        return await handleDeleteRecord(record_id)
      }

      default:
        return errorResponse('不支持的请求方法', undefined, 405)
    }
  } catch (error) {
    console.error('API Error:', error)
    const message = error instanceof Error ? error.message : '服务器错误'
    return errorResponse(message, undefined, 500)
  }
})