import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FEISHU_APP_ID = Deno.env.get('FEISHU_APP_ID')!
const FEISHU_APP_SECRET = Deno.env.get('FEISHU_APP_SECRET')!
const FEISHU_REDIRECT_URI = Deno.env.get('FEISHU_REDIRECT_URI') || 'http://localhost:5173/login'

console.log('FEISHU_APP_ID:', FEISHU_APP_ID)
console.log('FEISHU_REDIRECT_URI:', FEISHU_REDIRECT_URI)

const supabase = createClient(SupabaseUrl(), SupabaseServiceKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
})

function SupabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') || Deno.env.get('MY_SUPABASE_URL') || ''
}

function SupabaseServiceKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('MY_SERVICE_ROLE_KEY') || ''
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')

  if (!code) {
    return Response.json({ error: '缺少 code' }, { headers: corsHeaders, status: 400 })
  }

  const frontendOrigin = req.headers.get('origin') || `https://${url.hostname}`
  const redirectUri = FEISHU_REDIRECT_URI || `${frontendOrigin}/login`

  console.log('Request origin:', frontendOrigin)
  console.log('Using redirect_uri:', redirectUri)

  const corsHeadersWithOrigin = {
    ...corsHeaders,
    'Access-Control-Allow-Origin': frontendOrigin,
  }

  try {
    const userTokenRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: FEISHU_APP_ID,
          client_secret: FEISHU_APP_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri
        }),
      }
    )

    const userTokenData = await userTokenRes.json()
    console.log('Feishu token response:', JSON.stringify(userTokenData))

    if (userTokenData.code !== 0 || !userTokenData.access_token) {
      console.error('Feishu auth failed:', userTokenData)
      return Response.json({ error: '飞书授权失败', detail: userTokenData }, { headers: corsHeadersWithOrigin, status: 401 })
    }

    const userAccessToken = userTokenData.access_token
    console.log('Successfully got Feishu access token')

    const userRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        },
      }
    )

    const userData = await userRes.json()
    console.log('Feishu user info:', JSON.stringify(userData))

    if (!userData.data) {
      console.error('Failed to get user data')
      return Response.json({ error: '获取用户信息失败', detail: userData }, { headers: corsHeadersWithOrigin, status: 401 })
    }

    const feishuUser = userData.data
    console.log('User open_id:', feishuUser.open_id)
    const userEmail = feishuUser.email || `${feishuUser.open_id}@feishu.local`
    const userPassword = `feishu_${feishuUser.open_id}`

    let authData

    try {
      console.log('Creating Supabase user...')
      const createResult = await supabase.auth.admin.createUser({
        email: userEmail,
        email_confirm: true,
        password: userPassword,
        user_metadata: {
          feishu_uid: feishuUser.open_id,
          name: feishuUser.name,
          avatar: feishuUser.avatar_url,
        },
        app_metadata: {
          provider: 'feishu',
          provider_id: feishuUser.open_id,
        },
      })

      console.log('Create user result:', JSON.stringify(createResult))

      if (createResult.error) {
        if (!createResult.error.message.includes('already been registered')) {
          console.error('Failed to create user:', createResult.error)
          return Response.json({ error: '创建用户失败', detail: createResult.error.message }, { headers: corsHeadersWithOrigin, status: 500 })
        }
        console.log('User already exists, trying to sign in...')
      }

      console.log('Signing in user...')
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: userPassword
      })

      console.log('Sign in result:', JSON.stringify({ data: signInData, error: signInError }))

      if (signInError) {
        console.error('Failed to sign in:', signInError)
        return Response.json({ error: '用户登录失败', detail: signInError.message }, { headers: corsHeadersWithOrigin, status: 500 })
      }

      authData = signInData

    } catch (err) {
      console.error('User operation exception:', err)
      return Response.json({ error: '用户操作异常', detail: err.message }, { headers: corsHeadersWithOrigin, status: 500 })
    }

    if (!authData.session) {
      console.error('Failed to create session')
      return Response.json({ error: '无法创建用户会话' }, { headers: corsHeadersWithOrigin, status: 500 })
    }

    console.log('Login successful!')
    const response = Response.json({
      code: 0,
      message: '登录成功',
      data: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        user: authData.user,
        feishu_user: feishuUser,
      }
    }, { headers: corsHeadersWithOrigin })

    console.log('Returning response with status:', response.status)
    return response

  } catch (err) {
    return Response.json({
      error: '服务器错误',
      message: err.message,
    }, { headers: corsHeadersWithOrigin, status: 500 })
  }
})
