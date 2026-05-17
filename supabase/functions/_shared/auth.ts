import { createSupabaseAdminClient } from './supabaseAdmin.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_OPEN_IDS = (Deno.env.get('ALLOWED_OPEN_IDS') || '').split(',').filter(Boolean)

interface User {
  id: string
  email?: string
  user_metadata?: {
    feishu_uid?: string
    name?: string
    avatar?: string
  }
  app_metadata?: {
    provider?: string
    provider_id?: string
  }
}

interface VerifyResult {
  authorized: boolean
  user?: User
  open_id?: string
}

export async function getUserFromToken(token: string): Promise<User | null> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
    },
  })

  if (!response.ok) {
    return null
  }

  return await response.json()
}

export async function verifyUser(req: Request): Promise<VerifyResult> {
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

  if (ALLOWED_OPEN_IDS.length > 0 && !ALLOWED_OPEN_IDS.includes(feishuUid || '')) {
    return { authorized: false, open_id: feishuUid }
  }

  return { authorized: true, user, open_id: feishuUid }
}

export async function verifyUserSimple(token: string): Promise<VerifyResult> {
  const user = await getUserFromToken(token)

  if (!user) {
    return { authorized: false }
  }

  const feishuUid = user.user_metadata?.feishu_uid || user.app_metadata?.provider_id

  if (ALLOWED_OPEN_IDS.length > 0 && !ALLOWED_OPEN_IDS.includes(feishuUid || '')) {
    return { authorized: false, open_id: feishuUid }
  }

  return { authorized: true, user, open_id: feishuUid }
}

export { createSupabaseAdminClient }