import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const FEISHU_APP_ID = Deno.env.get('FEISHU_APP_ID')!
const FEISHU_APP_SECRET = Deno.env.get('FEISHU_APP_SECRET')!
const FEISHU_APP_TOKEN = Deno.env.get('FEISHU_APP_TOKEN')!
const FEISHU_TABLE_CATEGORIES = Deno.env.get('FEISHU_TABLE_CATEGORIES')!

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_OPEN_IDS = (Deno.env.get('ALLOWED_OPEN_IDS') || '').split(',').filter(Boolean)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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

  const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const data = await response.json()

  if (data.code !== 0) {
    throw new Error(data.msg || '飞书 API 调用失败')
  }

  return data.data
}

async function getUserFromToken(token: string): Promise<any> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY
    }
  })

  if (!response.ok) {
    return null
  }

  return await response.json()
}

async function verifyUser(req: Request): Promise<{ authorized: boolean; user?: any; open_id?: string }> {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false }
  }

  const token = authHeader.replace('Bearer ', '')
  const user = await getUserFromToken(token)

  if (!user) {
    return { authorized: false }
  }

  const feishuUid = user.user_metadata?.feishu_uid || user.app_metadata?.provider_id

  if (ALLOWED_OPEN_IDS.length > 0 && !ALLOWED_OPEN_IDS.includes(feishuUid)) {
    return { authorized: false, open_id: feishuUid }
  }

  return { authorized: true, user, open_id: feishuUid }
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status
  })
}

serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response('OK', { headers: corsHeaders })
  }

  try {
    const auth = await verifyUser(req)

    if (req.method === 'GET') {
      if (!auth.authorized) {
        return jsonResponse({
          code: -1,
          message: '未授权访问'
        }, 401)
      }

      const type = url.searchParams.get('type')
      const user_id = url.searchParams.get('user_id')

      const data = await feishuRequest(
        'GET',
        `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_CATEGORIES}/records?page_size=500`
      )

      let categories = data.items.map((item: any) => ({
        record_id: item.record_id,
        id: item.fields.id,
        name: item.fields.name,
        type: item.fields.type,
        icon: item.fields.icon || '',
        user_id: item.fields.user_id || null
      }))

      if (type && ['收入', '支出'].includes(type)) {
        categories = categories.filter((cat: any) => cat.type === type)
      }

      if (user_id) {
        categories = categories.filter((cat: any) => cat.user_id === user_id)
      } else if (ALLOWED_OPEN_IDS.length > 0) {
        categories = categories.filter((cat: any) => !cat.user_id || cat.user_id === auth.open_id)
      }

      return jsonResponse({
        code: 0,
        message: 'success',
        data: categories
      })
    }

    if (req.method === 'POST') {
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

      const { name, type, icon } = body
      if (!name || !type) {
        return jsonResponse({
          code: -1,
          message: '缺少必要参数: name 和 type'
        }, 400)
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
            user_id: auth.open_id || ''
          }
        }
      )

      return jsonResponse({
        code: 0,
        message: '创建成功',
        data: {
          record_id: data.record.record_id,
          id: categoryId,
          name,
          type,
          icon: icon || '',
          user_id: auth.open_id || null
        }
      }, 201)
    }

    if (req.method === 'PUT') {
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

      const { record_id, name, type, icon } = body
      if (!record_id) {
        return jsonResponse({
          code: -1,
          message: '缺少必要参数: record_id'
        }, 400)
      }

      const updateData: Record<string, unknown> = {}
      if (name) updateData.name = name
      if (type) updateData.type = type
      if (icon !== undefined) updateData.icon = icon

      if (Object.keys(updateData).length === 0) {
        return jsonResponse({
          code: -1,
          message: '没有需要更新的字段'
        }, 400)
      }

      await feishuRequest(
        'PUT',
        `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_CATEGORIES}/records/${record_id}`,
        { fields: updateData }
      )

      return jsonResponse({
        code: 0,
        message: '更新成功'
      })
    }

    if (req.method === 'DELETE') {
      if (!auth.authorized) {
        return jsonResponse({
          code: -1,
          message: '未授权访问'
        }, 401)
      }

      const record_id = url.searchParams.get('record_id')

      if (!record_id) {
        return jsonResponse({
          code: -1,
          message: '缺少必要参数: record_id'
        }, 400)
      }

      await feishuRequest(
        'DELETE',
        `/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_CATEGORIES}/records/${record_id}`
      )

      return jsonResponse({
        code: 0,
        message: '删除成功'
      })
    }

    return jsonResponse({
      code: -1,
      message: '不支持的请求方法'
    }, 405)

  } catch (error) {
    console.error('API Error:', error.message)
    return jsonResponse({
      code: -1,
      message: error.message
    }, 500)
  }
})
