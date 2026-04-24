/**
 * Supabase Edge Function: accepts the same JSON body as the Zeus app (install-registry.ts).
 * URL: https://<PROJECT_REF>.supabase.co/functions/v1/register-install
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Body = {
  machineId?: string
  macAddress?: string | null
  version?: string
  os?: string
  arch?: string
}

function parseBody(r: unknown): Body | null {
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  const machineId = typeof o.machineId === 'string' ? o.machineId.trim() : ''
  const version = typeof o.version === 'string' ? o.version.trim() : ''
  const os = typeof o.os === 'string' ? o.os.trim() : ''
  const arch = typeof o.arch === 'string' ? o.arch.trim() : ''
  const mac = o.macAddress
  const macAddress = mac === null || mac === undefined ? null : String(mac).trim() || null
  if (machineId.length < 4 || version.length < 1 || os.length < 1 || arch.length < 1) return null
  return { machineId, macAddress, version, os, arch }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  const registryToken = Deno.env.get('REGISTRY_TOKEN')
  if (registryToken) {
    const auth = req.headers.get('Authorization')
    if (auth !== `Bearer ${registryToken}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'content-type': 'application/json' },
      })
    }
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }
  const body = parseBody(raw)
  if (!body) {
    return new Response(
      JSON.stringify({ error: 'Invalid body: need machineId, version, os, arch; macAddress optional' }),
      { status: 400, headers: { ...cors, 'content-type': 'application/json' } }
    )
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(url, key)

  const { error } = await supabase.rpc('register_zeus_install', {
    p_machine_id: body.machineId,
    p_mac_address: body.macAddress,
    p_app_version: body.version,
    p_os: body.os,
    p_arch: body.arch,
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, machineId: body.machineId }), {
    status: 200,
    headers: { ...cors, 'content-type': 'application/json' },
  })
})
