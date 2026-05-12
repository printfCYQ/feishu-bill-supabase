// Hello World Edge Function
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

console.log('Hello World Edge Function 已启动!')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

serve(async (req) => {
  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    return new Response('OK', { headers: corsHeaders })
  }

  // GET 请求
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      message: 'Hello World! 👋',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      author: 'Supabase Edge Functions'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
  }

  // POST 请求
  if (req.method === 'POST') {
    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({
        code: -1,
        message: '无效的 JSON 数据'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const { name } = body

    return new Response(JSON.stringify({
      message: `Hello, ${name || 'World'}! 👋`,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      received: { name }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
  }

  // 默认 404
  return new Response(JSON.stringify({
    code: -1,
    message: '不支持的请求方法'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 405
  })
})