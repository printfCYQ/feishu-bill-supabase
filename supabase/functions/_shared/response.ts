import { corsHeaders } from './cors.ts'

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

export function successResponse(data: unknown, message = 'success'): Response {
  return jsonResponse({
    code: 0,
    message,
    data,
  })
}

export function errorResponse(message: string, detail?: unknown, status = 400): Response {
  let detailStr: string | undefined
  if (detail instanceof Error) {
    detailStr = detail.message
  } else if (typeof detail === 'string') {
    detailStr = detail
  } else if (detail !== undefined) {
    try {
      detailStr = JSON.stringify(detail)
    } catch {
      detailStr = String(detail)
    }
  }
  return jsonResponse({
    code: -1,
    message,
    detail: detailStr,
  }, status)
}