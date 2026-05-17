const FEISHU_APP_ID = Deno.env.get('FEISHU_APP_ID')!
const FEISHU_APP_SECRET = Deno.env.get('FEISHU_APP_SECRET')!

let accessToken = ''
let tokenExpireTime = 0

export async function getFeishuToken(): Promise<string> {
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
        app_secret: FEISHU_APP_SECRET,
      }),
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

export async function feishuRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getFeishuToken()

  const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json()

  if (data.code !== 0) {
    throw new Error(data.msg || '飞书 API 调用失败')
  }

  return data.data
}

export async function feishuRequestWithToken(token: string, method: string, url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json()

  return data
}