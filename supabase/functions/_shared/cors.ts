export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

export function getCorsHeadersWithOrigin(origin: string) {
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': origin,
  }
}