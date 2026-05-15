import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const FEISHU_APP_ID = Deno.env.get('FEISHU_APP_ID')!
const FEISHU_APP_SECRET = Deno.env.get('FEISHU_APP_SECRET')!
const FEISHU_APP_TOKEN = Deno.env.get('FEISHU_APP_TOKEN')!
const FEISHU_TABLE_RECORDS = Deno.env.get('FEISHU_TABLE_RECORDS')!
const FEISHU_TABLE_CATEGORIES = Deno.env.get('FEISHU_TABLE_CATEGORIES')!

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('MY_SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('MY_SERVICE_ROLE_KEY') || ''

const ALLOWED_OPEN_IDS = (Deno.env.get('ALLOWED_OPEN_IDS') || '').split(',').filter(Boolean)

console.log('api_records initialized')
console.log('SUPABASE_URL:', SUPABASE_URL ? 'set' : 'empty')
console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'empty')
console.log('FEISHU_APP_ID:', FEISHU_APP_ID)
console.log('FEISHU_APP_TOKEN:', FEISHU_APP_TOKEN)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

function normalizeType(type: string): string {
  if (type === '收入') return 'income';
  if (type === '支出') return 'expense';
  if (type === 'income' || type === 'expense') return type;
  return type;
}

// 高精度计算工具函数
function toFixed(num: number, precision: number = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round(num * factor) / factor;
}

function add(a: number, b: number): number {
  return toFixed(a + b);
}

function sub(a: number, b: number): number {
  return toFixed(a - b);
}

function parseTimestamp(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return d.getTime();
  }
  return 0;
}

let accessToken = ''
let tokenExpireTime = 0

async function getFeishuToken(): Promise<string> {
  const now = Date.now() / 1000

  if (accessToken && now < tokenExpireTime) {
    return accessToken
  }

  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET
      })
    }
  )

  const data = await response.json()

  if (data.code === 0) {
    accessToken = data.tenant_access_token
    tokenExpireTime = now + (data.expire - 300)
    return accessToken
  }

  throw new Error(data.msg || '获取飞书 Token 失败')
}

async function feishuRequest(method: string, path: string, body?: unknown): Promise<any> {
  const token = await getFeishuToken()

  console.log('feishuRequest called:', { method, path })
  if (body) console.log('feishuRequest body:', body)

  const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const data = await response.json()
  console.log('feishuRequest response:', JSON.stringify(data))

  if (data.code !== 0) {
    console.error('feishuRequest error:', data)
    throw new Error(data.msg || '飞书 API 调用失败')
  }

  return data.data
}

async function getAllRecords(appToken: string, tableId: string): Promise<any[]> {
  const allRecords: any[] = []
  let pageToken = ''

  while (true) {
    const data = await feishuRequest(
      'GET',
      `/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=500&page_token=${pageToken}`
    )

    const items = data.items || []
    allRecords.push(...items)

    pageToken = data.page_token || ''
    if (!pageToken || !data.has_more) {
      break
    }
  }

  return allRecords
}

async function getUserFromToken(token: string): Promise<any> {
  console.log('Getting user from token, SUPABASE_URL:', SUPABASE_URL.substring(0, 20) + '...')
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY
    }
  })

  console.log('User API response status:', response.status)

  if (!response.ok) {
    const text = await response.text()
    console.error('User API error:', text)
    return null
  }

  return await response.json()
}

async function verifyUser(req: Request): Promise<{ authorized: boolean; user?: any; open_id?: string }> {
  const authHeader = req.headers.get('Authorization')
  console.log('Verifying user, auth header:', authHeader ? 'present' : 'missing')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false }
  }

  const token = authHeader.replace('Bearer ', '')
  console.log('Token:', token.substring(0, 20) + '...')
  const user = await getUserFromToken(token)

  console.log('User from token:', user ? 'found' : 'not found')

  if (!user) {
    return { authorized: false }
  }

  const feishuUid = user.user_metadata?.feishu_uid || user.app_metadata?.provider_id
  console.log('Feishu UID:', feishuUid)

  if (ALLOWED_OPEN_IDS.length > 0 && !ALLOWED_OPEN_IDS.includes(feishuUid)) {
    console.log('User not in allowed list')
    return { authorized: false, open_id: feishuUid }
  }

  console.log('User authorized')
  return { authorized: true, user, open_id: feishuUid }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status
  })
}

// Handler 函数定义
async function handleGetSingleRecord(record_id: string): Promise<Response> {
  console.log('handleGetSingleRecord called:', record_id)
  const data = await feishuRequest(
    'GET',
    `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records/${record_id}`
  )

  const record = data.record ? {
    record_id: data.record.record_id,
    id: data.record.fields.id,
    user_id: data.record.fields.user_id || null,
    amount: parseFloat(data.record.fields.amount) || 0,
    type: normalizeType(data.record.fields.type || ''),
    category_id: data.record.fields.category_id || '',
    category_name: data.record.fields.category_name || '',
    note: data.record.fields.note || '',
    created_at: parseTimestamp(data.record.fields.created_at)
  } : null

  return jsonResponse({
    code: 0,
    message: 'success',
    data: record
  })
}

async function handleChartsSummary(
  year: string | null, 
  month: string | null, 
  user_id: string | null, 
  authOpenId: string | undefined
): Promise<Response> {
  console.log('handleChartsSummary called with:', { year, month, user_id })
  
  if (!year) {
    console.log('charts_summary missing year parameter')
    return jsonResponse({
      code: -1,
      message: 'invalid param: year is required'
    }, 400)
  }

  const TZ_OFFSET = 8 * 60 * 60 * 1000
  const items = await getAllRecords(FEISHU_APP_TOKEN, FEISHU_TABLE_RECORDS)
  
  let filteredItems = items.filter((item: any) => {
    const itemUserId = item.fields.user_id || ''
    return (!user_id || itemUserId === user_id || (!itemUserId && authOpenId))
  })

  const yearNum = parseInt(year)
  
  const monthData: any[] = []
  for (let m = 1; m <= 12; m++) {
    const startDate = new Date(yearNum, m - 1, 1).getTime() - TZ_OFFSET
    const endDate = new Date(yearNum, m, 0, 23, 59, 59, 999).getTime() - TZ_OFFSET
    
    let monthIncome = 0
    let monthExpense = 0
    const monthCategoryStats: Record<string, { income: number; expense: number }> = {}
    
    const monthItems = filteredItems.filter((item: any) => {
      const createdAt = parseTimestamp(item.fields.created_at)
      return createdAt >= startDate && createdAt <= endDate
    })
    
    monthItems.forEach((item: any) => {
      const amount = parseFloat(item.fields.amount) || 0
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
      month: m,
      total_income: monthIncome,
      total_expense: monthExpense,
      balance: sub(monthIncome, monthExpense),
      category_stats: monthCategoryStats
    })
  }
  
  const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1
  const currentMonthData = monthData.find(m => m.month === targetMonth) || {
    total_income: 0,
    total_expense: 0,
    balance: 0,
    category_stats: {}
  }
  
  const expenseCategoryStats = currentMonthData.category_stats
  const topCategories = Object.entries(expenseCategoryStats)
    .map(([name, stats]: [string, any]) => ({ name, expense: stats.expense }))
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
        top_categories: topCategories
      },
      year_months: monthData
    }
  })
}

async function handleSummary(
  year: string, 
  month: string, 
  user_id: string | null, 
  authOpenId: string | undefined
): Promise<Response> {
  console.log('handleSummary called:', { year, month, user_id })
  
  if (!year || !month) {
    return jsonResponse({
      code: -1,
      message: 'invalid param: year and month required'
    }, 400)
  }

  const TZ_OFFSET = 8 * 60 * 60 * 1000
  const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).getTime() - TZ_OFFSET
  const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999).getTime() - TZ_OFFSET
  console.log(`Summary query: year=${year}, month=${month}, startDate=${startDate}, endDate=${endDate}`)

  const items = await getAllRecords(FEISHU_APP_TOKEN, FEISHU_TABLE_RECORDS)

  let filteredItems = items.filter((item: any) => {
    const createdAt = parseTimestamp(item.fields.created_at)
    const itemUserId = item.fields.user_id || ''
    return createdAt >= startDate && createdAt <= endDate && (!user_id || itemUserId === user_id || (!itemUserId && authOpenId))
  })

  let total_income = 0
  let total_expense = 0
  const category_stats: Record<string, { income: number; expense: number }> = {}

  filteredItems.forEach((item: any) => {
    const amount = parseFloat(item.fields.amount) || 0
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
      category_stats
    }
  })
}

async function handleGetRecordList(
  url: URL, 
  authOpenId: string | undefined
): Promise<Response> {
  console.log('handleGetRecordList called')
  
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

  const TZ_OFFSET = 8 * 60 * 60 * 1000
  const items = await getAllRecords(FEISHU_APP_TOKEN, FEISHU_TABLE_RECORDS)

  let records = items.map((item: any) => ({
    record_id: item.record_id,
    id: item.fields.id,
    user_id: item.fields.user_id || null,
    amount: parseFloat(item.fields.amount) || 0,
    type: normalizeType(item.fields.type || ''),
    category_id: item.fields.category_id || '',
    category_name: item.fields.category_name || '',
    note: item.fields.note || '',
    created_at: parseTimestamp(item.fields.created_at)
  }))

  if (type && ['income', 'expense'].includes(type)) {
    records = records.filter((r: any) => r.type === type)
  }

  if (category_id) {
    records = records.filter((r: any) => r.category_id === category_id)
  }

  if (user_id) {
    records = records.filter((r: any) => r.user_id === user_id)
  } else if (ALLOWED_OPEN_IDS.length > 0) {
    records = records.filter((r: any) => !r.user_id || r.user_id === authOpenId)
  }

  if (year && month) {
    const startTs = new Date(parseInt(year), parseInt(month) - 1, 1).getTime() - TZ_OFFSET
    const endTs = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999).getTime() - TZ_OFFSET
    records = records.filter((r: any) => {
      return r.created_at >= startTs && r.created_at <= endTs
    })
  } else if (start_date && end_date) {
    const startTs = new Date(start_date).getTime()
    const endTs = new Date(end_date + 'T23:59:59.999').getTime()
    records = records.filter((r: any) => {
      return r.created_at >= startTs && r.created_at <= endTs
    })
  }

  if (note) {
    const keyword = note.toLowerCase()
    records = records.filter((r: any) => r.note && r.note.toLowerCase().includes(keyword))
  }

  if (amount_min || amount_max) {
    const min = amount_min ? parseFloat(amount_min) : 0
    const max = amount_max ? parseFloat(amount_max) : Infinity
    records = records.filter((r: any) => r.amount >= min && r.amount <= max)
  }

  return jsonResponse({
    code: 0,
    message: 'success',
    data: records
  })
}

async function handleBatchCreate(
  body: any, 
  authOpenId: string | undefined
): Promise<Response> {
  console.log('handleBatchCreate called')
  
  const { records } = body
  if (!Array.isArray(records) || records.length === 0) {
    return jsonResponse({
      code: -1,
      message: '缺少必要参数: records (数组)'
    }, 400)
  }

  const errors: string[] = []
  const validRecords: any[] = []

  for (const record of records) {
    const { amount, type, category_id, category_name, note, created_at } = record
    
    if (!amount || !type || !category_id || !category_name) {
      errors.push(`记录缺少必要参数: ${JSON.stringify(record)}`)
      continue
    }

    const createdAt = created_at ? parseInt(created_at) : Date.now()
    
    validRecords.push({
      fields: {
        user_id: authOpenId || '',
        amount: parseFloat(amount),
        type,
        category_id,
        category_name,
        note: note || '',
        created_at: createdAt
      }
    })
  }

  if (validRecords.length === 0) {
    return jsonResponse({
      code: -1,
      message: '没有可导入的记录',
      data: { success_count: 0, error_count: errors.length, results: [], errors }
    }, 400)
  }

  try {
    const data = await feishuRequest(
      'POST',
      `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records/batch_create`,
      { records: validRecords }
    )

    const createdRecords = (data.records || []).map((record: any, index: number) => ({
      record_id: record.record_id,
      user_id: validRecords[index].fields.user_id,
      amount: validRecords[index].fields.amount,
      type: validRecords[index].fields.type,
      category_id: validRecords[index].fields.category_id,
      category_name: validRecords[index].fields.category_name,
      note: validRecords[index].fields.note,
      created_at: validRecords[index].fields.created_at
    }))

    return jsonResponse({
      code: 0,
      message: '批量创建完成',
      data: {
        success_count: createdRecords.length,
        error_count: errors.length,
        results: createdRecords,
        errors
      }
    }, 201)
  } catch (e: any) {
    return jsonResponse({
      code: -1,
      message: `批量创建失败: ${e.message}`,
      data: { success_count: 0, error_count: validRecords.length + errors.length, results: [], errors: [`${e.message}`] }
    }, 500)
  }
}

async function handleCreateRecord(
  body: any, 
  authOpenId: string | undefined
): Promise<Response> {
  console.log('handleCreateRecord called')
  
  const { amount, type, category_id, category_name, note, created_at } = body
  if (!amount || !type || !category_id || !category_name) {
    return jsonResponse({
      code: -1,
      message: '缺少必要参数: amount, type, category_id, category_name'
    }, 400)
  }

  const createdAt = created_at ? parseInt(created_at) : Date.now()

  const data = await feishuRequest(
    'POST',
    `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records`,
    {
      fields: {
        user_id: authOpenId || '',
        amount: parseFloat(amount),
        type,
        category_id,
        category_name,
        note: note || '',
        created_at: createdAt
      }
    }
  )

  return jsonResponse({
    code: 0,
    message: '创建成功',
    data: {
      record_id: data.record.record_id,
      user_id: authOpenId || null,
      amount: parseFloat(amount),
      type,
      category_id,
      category_name,
      note: note || '',
      created_at: createdAt
    }
  }, 201)
}

async function handleUpdateRecord(
  body: any
): Promise<Response> {
  console.log('handleUpdateRecord called')
  
  const { record_id, amount, type, category_id, category_name, note, created_at } = body
  if (!record_id) {
    return jsonResponse({
      code: -1,
      message: '缺少必要参数: record_id'
    }, 400)
  }

  const updateData: Record<string, unknown> = {}
  if (amount !== undefined) updateData.amount = parseFloat(amount)
  if (type) updateData.type = type
  if (category_id) updateData.category_id = category_id
  if (category_name) updateData.category_name = category_name
  if (note !== undefined) updateData.note = note
  if (created_at !== undefined) updateData.created_at = parseInt(created_at)

  if (Object.keys(updateData).length === 0) {
    return jsonResponse({
      code: -1,
      message: '没有需要更新的字段'
    }, 400)
  }

  await feishuRequest(
    'PUT',
    `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records/${record_id}`,
    { fields: updateData }
  )

  return jsonResponse({
    code: 0,
    message: '更新成功'
  })
}

async function handleDeleteRecord(
  record_id: string | null
): Promise<Response> {
  console.log('handleDeleteRecord called:', record_id)
  
  if (!record_id) {
    return jsonResponse({
      code: -1,
      message: '缺少必要参数: record_id'
    }, 400)
  }

  await feishuRequest(
    'DELETE',
    `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_RECORDS}/records/${record_id}`
  )

  return jsonResponse({
    code: 0,
    message: '删除成功'
  })
}

serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response('OK', { headers: corsHeaders })
  }

  try {
    // 检查必需的环境变量
    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET || !FEISHU_APP_TOKEN || !FEISHU_TABLE_RECORDS || !FEISHU_TABLE_CATEGORIES) {
      console.error('Missing required environment variables')
      return jsonResponse({
        code: -1,
        message: '服务器配置错误: 缺少必需的环境变量'
      }, 500)
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables')
      return jsonResponse({
        code: -1,
        message: '服务器配置错误: 缺少 Supabase 配置'
      }, 500)
    }

    const auth = await verifyUser(req)

    switch (req.method) {
      case 'GET': {
        console.log('GET request received:', {
          action: url.searchParams.get('action'),
          year: url.searchParams.get('year'),
          month: url.searchParams.get('month'),
          authorized: auth.authorized
        })

        if (!auth.authorized) {
          return jsonResponse({
            code: -1,
            message: '未授权访问'
          }, 401)
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
          default:
            return await handleGetRecordList(url, auth.open_id)
        }
      }

      case 'POST': {
        if (!auth.authorized) {
          return jsonResponse({
            code: -1,
            message: '未授权访问'
          }, 401)
        }

        let body
        try { body = await req.json() } catch {
          return jsonResponse({
            code: -1,
            message: '无效的 JSON 数据'
          }, 400)
        }

        const action = url.searchParams.get('action')
        if (action === 'batch') {
          return await handleBatchCreate(body, auth.open_id)
        }
        return await handleCreateRecord(body, auth.open_id)
      }

      case 'PUT': {
        if (!auth.authorized) {
          return jsonResponse({
            code: -1,
            message: '未授权访问'
          }, 401)
        }

        let body
        try { body = await req.json() } catch {
          return jsonResponse({
            code: -1,
            message: '无效的 JSON 数据'
          }, 400)
        }

        return await handleUpdateRecord(body)
      }

      case 'DELETE': {
        if (!auth.authorized) {
          return jsonResponse({
            code: -1,
            message: '未授权访问'
          }, 401)
        }

        const record_id = url.searchParams.get('record_id')
        return await handleDeleteRecord(record_id)
      }

      default:
        return jsonResponse({
          code: -1,
          message: '不支持的请求方法'
        }, 405)
    }

  } catch (error: any) {
    console.error('API Error:', error.message)
    return jsonResponse({
      code: -1,
      message: error.message
    }, 500)
  }
})
