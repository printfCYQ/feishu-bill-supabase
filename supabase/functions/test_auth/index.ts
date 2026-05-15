// 简单的 API 测试函数 - 用来验证 disable_auth 逻辑
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

serve(async (req) => {
  const url = new URL(req.url)
  
  if (req.method === 'OPTIONS') {
    return new Response('OK', { headers: corsHeaders })
  }
  
  console.log('收到请求:', req.method, url.pathname, url.searchParams.toString())
  
  // 检查 disable_auth 参数
  const disableAuth = url.searchParams.get('disable_auth') === 'true'
  const authHeader = req.headers.get('Authorization')
  
  console.log('disable_auth 参数:', disableAuth)
  console.log('Authorization header:', authHeader)
  console.log('环境变量检查:')
  console.log('- FEISHU_APP_ID:', Deno.env.get('FEISHU_APP_ID') ? '已设置' : '未设置')
  console.log('- DISABLE_AUTH:', Deno.env.get('DISABLE_AUTH'))
  
  // 如果明确要求禁用认证
  if (disableAuth) {
    return new Response(JSON.stringify({
      code: 0,
      message: 'success',
      data: {
        disable_auth: true,
        test_value: '认证已禁用，API 应该可以正常访问',
        env_status: {
          FEISHU_APP_ID: Deno.env.get('FEISHU_APP_ID') ? '已设置' : '未设置',
          FEISHU_APP_SECRET: Deno.env.get('FEISHU_APP_SECRET') ? '已设置' : '未设置',
          SUPABASE_URL: Deno.env.get('SUPABASE_URL') ? '已设置' : '未设置'
        }
      }
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      }
    })
  }
  
  // 如果需要认证且有 Authorization header
  if (!disableAuth && authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        code: 0,
        message: 'success',
        data: {
          authenticated: true,
          token_present: true,
          env_status: {
            FEISHU_APP_ID: Deno.env.get('FEISHU_APP_ID') ? '已设置' : '未设置',
            FEISHU_APP_SECRET: Deno.env.get('FEISHU_APP_SECRET') ? '已设置' : '未设置',
            SUPABASE_URL: Deno.env.get('SUPABASE_URL') ? '已设置' : '未设置'
          }
        }
      }), {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      })
    }
  }
  
  // 需要认证但没有 token
  return new Response(JSON.stringify({
    code: -1,
    message: '未授权，请先登录'
  }), {
    headers: { 
      ...corsHeaders, 
      'Content-Type': 'application/json' 
    },
    status: 401
  })
})