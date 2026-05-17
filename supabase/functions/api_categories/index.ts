import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, getCorsHeadersWithOrigin } from 'cors'
import { successResponse, errorResponse } from 'response'
import { feishuRequest } from 'feishu'
import { verifyUser } from 'auth'

const FEISHU_APP_TOKEN = Deno.env.get('FEISHU_APP_TOKEN')!
const FEISHU_TABLE_CATEGORIES = Deno.env.get('FEISHU_TABLE_CATEGORIES')!
const ALLOWED_OPEN_IDS = (Deno.env.get('ALLOWED_OPEN_IDS') || '').split(',').filter(Boolean)

serve(async (req) => {
  const url = new URL(req.url)
  const frontendOrigin = req.headers.get('origin') || `https://${url.hostname}`
  const corsHeadersWithOrigin = getCorsHeadersWithOrigin(frontendOrigin)

  if (req.method === 'OPTIONS') {
    return new Response('OK', { headers: corsHeadersWithOrigin })
  }

  try {
    const auth = await verifyUser(req)

    if (req.method === 'GET') {
      if (!auth.authorized) {
        return errorResponse('未授权访问', undefined, 401)
      }

      const type = url.searchParams.get('type')
      const user_id = url.searchParams.get('user_id')

      const data = await feishuRequest(
        'GET',
        `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_CATEGORIES}/records?page_size=500`
      ) as { items: Array<{ record_id: string; fields: { id: string; name: string; type: string; icon?: string; user_id?: string } }> }

      let categories = data.items.map((item) => ({
        record_id: item.record_id,
        id: item.fields.id,
        name: item.fields.name,
        type: item.fields.type,
        icon: item.fields.icon || '',
        user_id: item.fields.user_id || null,
      }))

      if (type && ['收入', '支出'].includes(type)) {
        categories = categories.filter((cat) => cat.type === type)
      }

      if (user_id) {
        categories = categories.filter((cat) => cat.user_id === user_id)
      } else if (ALLOWED_OPEN_IDS.length > 0) {
        categories = categories.filter((cat) => !cat.user_id || cat.user_id === auth.open_id)
      }

      return successResponse(categories)
    }

    if (req.method === 'POST') {
      if (!auth.authorized) {
        return errorResponse('未授权访问', undefined, 401)
      }

      let body
      try {
        body = await req.json()
      } catch {
        return errorResponse('无效的 JSON 数据', undefined, 400)
      }

      const { name, type, icon } = body
      if (!name || !type) {
        return errorResponse('缺少必要参数: name 和 type', undefined, 400)
      }

      const categoryId = crypto.randomUUID()

      const data = await feishuRequest(
        'POST',
        `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_CATEGORIES}/records`,
        {
          fields: {
            id: categoryId,
            name,
            type,
            icon: icon || '',
            user_id: auth.open_id || '',
          },
        }
      ) as { record: { record_id: string } }

      return new Response(JSON.stringify({
        code: 0,
        message: '创建成功',
        data: {
          record_id: data.record.record_id,
          id: categoryId,
          name,
          type,
          icon: icon || '',
          user_id: auth.open_id || null,
        },
      }), {
        headers: { ...corsHeadersWithOrigin, 'Content-Type': 'application/json' },
        status: 201,
      })
    }

    if (req.method === 'PUT') {
      if (!auth.authorized) {
        return errorResponse('未授权访问', undefined, 401)
      }

      let body
      try {
        body = await req.json()
      } catch {
        return errorResponse('无效的 JSON 数据', undefined, 400)
      }

      const { record_id, name, type, icon } = body
      if (!record_id) {
        return errorResponse('缺少必要参数: record_id', undefined, 400)
      }

      const updateData: Record<string, unknown> = {}
      if (name) updateData.name = name
      if (type) updateData.type = type
      if (icon !== undefined) updateData.icon = icon

      if (Object.keys(updateData).length === 0) {
        return errorResponse('没有需要更新的字段', undefined, 400)
      }

      await feishuRequest(
        'PUT',
        `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_CATEGORIES}/records/${record_id}`,
        { fields: updateData }
      )

      return successResponse({ message: '更新成功' })
    }

    if (req.method === 'DELETE') {
      if (!auth.authorized) {
        return errorResponse('未授权访问', undefined, 401)
      }

      const record_id = url.searchParams.get('record_id')

      if (!record_id) {
        return errorResponse('缺少必要参数: record_id', undefined, 400)
      }

      await feishuRequest(
        'DELETE',
        `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_CATEGORIES}/records/${record_id}`
      )

      return successResponse({ message: '删除成功' })
    }

    return errorResponse('不支持的请求方法', undefined, 405)

  } catch (error) {
    return errorResponse(error.message || '服务器错误', undefined, 500)
  }
})