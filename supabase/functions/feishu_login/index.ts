import { getCorsHeadersWithOrigin } from 'cors'
import { feishuRequestWithToken } from 'feishu'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { errorResponse } from 'response'
import { supabaseAdmin } from 'supabaseAdmin'

const FEISHU_APP_ID = Deno.env.get('FEISHU_APP_ID')!
const FEISHU_APP_SECRET = Deno.env.get('FEISHU_APP_SECRET')!
const FEISHU_REDIRECT_URI = Deno.env.get('FEISHU_REDIRECT_URI') || 'http://localhost:5173/login'

console.log('=== feishu_login function started ===')

serve(async (req) => {
  console.log('Request method:', req.method)
  console.log('Request URL:', req.url)
  
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request')
    return new Response('ok', { headers: getCorsHeadersWithOrigin('*') })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')

  console.log('Received code:', code ? '***' : 'null')

  if (!code) {
    console.error('Error: Missing code parameter')
    return errorResponse('缺少 code', undefined, 400)
  }

  const frontendOrigin = req.headers.get('origin') || `https://${url.hostname}`
  const redirectUri = FEISHU_REDIRECT_URI || `${frontendOrigin}/login`
  const corsHeaders = getCorsHeadersWithOrigin(frontendOrigin)

  console.log('Redirect URI:', redirectUri)
  console.log('Frontend Origin:', frontendOrigin)

  try {
    console.log('Step 1: Getting user token from Feishu OAuth...')
    const userTokenData = await feishuRequestWithToken(
      '',
      'POST',
      'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
      {
        client_id: FEISHU_APP_ID,
        client_secret: FEISHU_APP_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }
    ) as { code?: number; access_token?: string; data?: { access_token?: string }; msg?: string }

    console.log('User token response:', JSON.stringify(userTokenData))

    const accessToken = userTokenData.access_token || userTokenData.data?.access_token

    if (userTokenData.code !== 0 || !accessToken) {
      console.error('Feishu OAuth failed:', JSON.stringify(userTokenData))
      return errorResponse('飞书授权失败', userTokenData, 401)
    }

    const userAccessToken = accessToken
    console.log('User access token obtained:', userAccessToken ? '***' : 'null')

    console.log('Step 2: Getting user info from Feishu...')
    const userData = await feishuRequestWithToken(
      userAccessToken,
      'GET',
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      undefined
    ) as { data?: { open_id: string; email?: string; name?: string; avatar_url?: string } }

    console.log('User info response:', JSON.stringify(userData))

    if (!userData.data) {
      console.error('Failed to get user info:', JSON.stringify(userData))
      return errorResponse('获取用户信息失败', userData, 401)
    }

    const feishuUser = userData.data
    console.log('Feishu user:', JSON.stringify(feishuUser))

    const userEmail = feishuUser.email || `${feishuUser.open_id}@feishu.local`
    const userPassword = `feishu_${feishuUser.open_id}`

    console.log('User email:', userEmail)

    let authData

    try {
      console.log('Step 3: Creating user in Supabase...')
      const createResult = await supabaseAdmin.auth.admin.createUser({
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

      console.log('Create user result:', JSON.stringify({
        error: createResult.error?.message,
        user: createResult.data?.user?.id
      }))

      if (createResult.error && !createResult.error.message.includes('already been registered')) {
        console.error('Failed to create user:', createResult.error.message)
        return errorResponse('创建用户失败', createResult.error.message, 500)
      }

      console.log('Step 4: Signing in user...')
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: userEmail,
        password: userPassword,
      })

      if (signInError) {
        console.error('Sign in failed:', signInError.message)
        return errorResponse('用户登录失败', signInError.message, 500)
      }

      authData = signInData
      console.log('Sign in successful, session exists:', !!authData.session)
    } catch (err) {
      const message = err instanceof Error ? err.message : '用户操作异常'
      console.error('User operation error:', message)
      return errorResponse('用户操作异常', message, 500)
    }

    if (!authData.session) {
      console.error('No session created')
      return errorResponse('无法创建用户会话', undefined, 500)
    }

    console.log('Step 5: Returning success response...')
    return new Response(JSON.stringify({
      code: 0,
      message: '登录成功',
      data: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        user: authData.user,
        feishu_user: feishuUser,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器错误'
    console.error('Unexpected error:', message)
    return errorResponse('服务器错误', message, 500)
  }
})