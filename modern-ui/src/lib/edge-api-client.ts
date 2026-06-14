import { resolveEdgeSecret } from './edge-auth'
import { mergeCookieHeader } from './edge-cookies'
import { computeInvokeTimeoutMs } from './edge-api-errors'
import {
  buildSerialInvokeBody,
  parseEdgeParamName,
  type AuthenticateBody,
  type DefineBlockBodyListItem,
} from './edge-api-types'

/** Edge REST contract: `src/assets/edge-openapi.json` (official Anexya Edge OpenAPI). */

/** Default for list/get calls (invoke uses a longer timeout from ReadDuration). */
const EDGE_GET_TIMEOUT_MS = 8_000

export type AleResponse = {
  ok: boolean
  status: number
  statusText: string
  data: string | null
  headers?: Record<string, string>
}

export type EdgeProcessInfo = {
  name: string
  started?: boolean
}

export type EdgeBlockInfo = {
  name: string
}

export type EdgeLogicalDevice = {
  name: string
  vendor?: string
  uid?: string
  composite?: boolean
}

/** UI-friendly block param; sourced from defineBlockBody_list (+ optional default). */
export type EdgeBlockParam = {
  name: string
  type?: string
  editor?: string
  defaultValue?: string
}

export {
  buildInvokeBlockBody,
  buildSerialInvokeBody,
  isLogicalDeviceParam,
  recordToInvokeParams,
} from './edge-api-types'
export type { InvokeBlockBodyParams } from './edge-api-types'

function baseUrl(host: string, port: string): string {
  const p = port.trim() || '80'
  return `http://${host.trim()}:${p}`
}

function parseJson<T>(text: string): T | null {
  if (!text?.trim()) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function normalizeBlockList(data: unknown): EdgeBlockInfo[] {
  if (!data) return []
  if (Array.isArray(data)) {
    return data.map((item) => {
      if (typeof item === 'string') return { name: item }
      if (item && typeof item === 'object' && 'name' in item) {
        return { name: String((item as { name: unknown }).name) }
      }
      return { name: String(item) }
    })
  }
  return []
}

function parseProcessItem(item: unknown): EdgeProcessInfo | null {
  if (typeof item === 'string') return { name: item }
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const name = o.name
  if (name == null || String(name).trim() === '') return null
  const startedRaw = o.started ?? o.running ?? o.isStarted ?? o.isRunning
  return {
    name: String(name),
    started: startedRaw !== undefined ? Boolean(startedRaw) : undefined,
  }
}

function normalizeProcessList(data: unknown): EdgeProcessInfo[] {
  if (!data) return []
  if (typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.workflows)) return normalizeProcessList(o.workflows)
  }
  if (Array.isArray(data)) {
    return data
      .map(parseProcessItem)
      .filter((p): p is EdgeProcessInfo => p != null)
  }
  const single = parseProcessItem(data)
  return single ? [single] : []
}

export function mergeProcessIntoList(
  list: EdgeProcessInfo[],
  updated: EdgeProcessInfo,
): EdgeProcessInfo[] {
  const i = list.findIndex((p) => p.name === updated.name)
  if (i < 0) return [...list, updated]
  const next = [...list]
  next[i] = { ...next[i], ...updated }
  return next
}

function fromDefineBlockListItem(item: DefineBlockBodyListItem): EdgeBlockParam {
  return {
    name: item.name,
    type: item.type,
    editor: item.editor,
  }
}

function normalizeBlockParams(data: unknown): EdgeBlockParam[] {
  if (data == null) return []

  if (Array.isArray(data)) {
    return data
      .map((item): EdgeBlockParam | null => {
        if (typeof item === 'string') return { name: item }
        if (!item || typeof item !== 'object') return null
        const o = item as Record<string, unknown>
        const rawName = o.name ?? o.key
        if (rawName == null || String(rawName).trim() === '') return null
        const parsed = parseEdgeParamName(
          String(rawName),
          o.type != null ? String(o.type) : undefined,
        )
        const def = o.default ?? o.defaultValue ?? o.value
        return {
          name: parsed.name,
          type: parsed.type,
          editor: o.editor != null ? String(o.editor) : undefined,
          defaultValue: def != null ? String(def) : undefined,
        }
      })
      .filter((p): p is EdgeBlockParam => p != null)
  }

  if (typeof data === 'object') {
    const o = data as Record<string, unknown>
    // defineBlockBody.list (OpenAPI)
    if (Array.isArray(o.list)) {
      return o.list
        .map((item) => {
          if (!item || typeof item !== 'object' || !('name' in item)) return null
          return fromDefineBlockListItem(item as DefineBlockBodyListItem)
        })
        .filter((p): p is EdgeBlockParam => p != null)
    }
    if (Array.isArray(o.params)) return normalizeBlockParams(o.params)
    if (Array.isArray(o.parameters)) return normalizeBlockParams(o.parameters)

    const entries = Object.entries(o).filter(([k]) => k !== 'name' && k !== 'list')
    if (entries.length > 0 && typeof entries[0][1] !== 'object') {
      return entries.map(([name, value]) => ({
        name,
        defaultValue: value != null ? String(value) : undefined,
      }))
    }
  }

  return []
}

type SessionCreds = {
  username: string
  password: string
  passwordIsHashed: boolean
}

export type EdgeInvokeDebug = {
  url: string
  body: string
  status: number
  response: string | null
  hadCookie: boolean
  hadBasicAuth: boolean
}

export class EdgeApiClient {
  private cookies: string | null = null
  private basicAuth: string | null = null
  private sessionCreds: SessionCreds | null = null
  private authSecret: string | null = null
  private authenticated = false
  private blockParamsCache = new Map<string, EdgeBlockParam[]>()
  private logicalDevicesCache: EdgeLogicalDevice[] | null = null
  lastInvokeDebug: EdgeInvokeDebug | null = null

  isAuthenticated(): boolean {
    return this.authenticated
  }

  clearSession(): void {
    this.cookies = null
    this.basicAuth = null
    this.sessionCreds = null
    this.authSecret = null
    this.authenticated = false
    this.blockParamsCache.clear()
    this.logicalDevicesCache = null
    this.lastInvokeDebug = null
  }

  /** Hash password once; enables Basic auth before cookie is ready. */
  private async prepareCredentials(
    username: string,
    password: string,
    passwordIsHashed: boolean,
  ): Promise<void> {
    this.sessionCreds = { username, password, passwordIsHashed }
    this.authSecret = await resolveEdgeSecret(password, passwordIsHashed)
    this.basicAuth = `Basic ${btoa(`${username.trim()}:${this.authSecret}`)}`
  }

  /** Prepare Basic auth (call before fetchCatalog). */
  async initCredentials(
    username: string,
    password: string,
    passwordIsHashed = false,
  ): Promise<void> {
    await this.prepareCredentials(username, password, passwordIsHashed)
  }

  /**
   * Load block/process lists (Basic auth). Cookie auth runs in background for invoke.
   */
  async fetchCatalog(
    host: string,
    port: string,
    username: string,
    password: string,
    passwordIsHashed = false,
  ): Promise<{ blocks: EdgeBlockInfo[]; processes: EdgeProcessInfo[] }> {
    if (!this.basicAuth) {
      await this.prepareCredentials(username, password, passwordIsHashed)
    }
    void this.authenticate(host, port, username, password, passwordIsHashed).catch(() => {
      /* invoke will re-auth; lists work with Basic auth */
    })
    return this.fetchCatalogLists(host, port)
  }

  /** GET /activity + /workflow in one IPC round-trip (parallel fetches in main, like Bruno). */
  async fetchCatalogLists(
    host: string,
    port: string,
  ): Promise<{ blocks: EdgeBlockInfo[]; processes: EdgeProcessInfo[] }> {
    const getOpts = { timeoutMs: EDGE_GET_TIMEOUT_MS }
    const [blocksRes, processesRes] = await this.requestBatch(host, port, [
      { path: '/ALE/api/activity', options: getOpts },
      { path: '/ALE/api/workflow', options: getOpts },
    ])
    if (!blocksRes.ok) {
      throw new Error(blocksRes.data?.trim() || `List blocks failed (${blocksRes.status})`)
    }
    if (!processesRes.ok) {
      throw new Error(processesRes.data?.trim() || `List processes failed (${processesRes.status})`)
    }
    return {
      blocks: normalizeBlockList(parseJson(blocksRes.data || '[]')),
      processes: normalizeProcessList(parseJson(processesRes.data || '[]')),
    }
  }

  /** @deprecated use initCredentials + fetchCatalog */
  async connectSession(
    host: string,
    port: string,
    username: string,
    password: string,
    passwordIsHashed = false,
  ): Promise<{ blocks: EdgeBlockInfo[]; processes: EdgeProcessInfo[] }> {
    await this.initCredentials(username, password, passwordIsHashed)
    return this.fetchCatalog(host, port, username, password, passwordIsHashed)
  }

  private buildAlePayload(
    host: string,
    port: string,
    path: string,
    options: {
      method?: string
      body?: string
      headers?: Record<string, string>
      timeoutMs?: number
    } = {},
  ): { url: string; options: Record<string, unknown> } {
    const url = `${baseUrl(host, port)}${path.startsWith('/') ? path : `/${path}`}`
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    }
    if (this.basicAuth) headers.Authorization = this.basicAuth
    if (this.cookies) headers.Cookie = this.cookies
    return {
      url,
      options: {
        method: options.method || 'GET',
        headers,
        body: options.body,
        timeoutMs: options.timeoutMs,
      },
    }
  }

  private applySetCookiesFromResponses(responses: AleResponse[]): void {
    for (const res of responses) {
      if (res.headers?.['set-cookie']) {
        this.cookies = mergeCookieHeader(this.cookies, res.headers['set-cookie'])
      }
    }
  }

  /** Multiple Edge HTTP calls with one renderer→main IPC hop when batch is available. */
  private async requestBatch(
    host: string,
    port: string,
    specs: { path: string; options?: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number } }[],
  ): Promise<AleResponse[]> {
    if (!window.electronAPI?.aleRequest) {
      throw new Error('Electron API not available')
    }
    const payloads = specs.map((s) => this.buildAlePayload(host, port, s.path, s.options))
    let results: AleResponse[]
    if (window.electronAPI.aleRequestBatch && specs.length > 1) {
      results = await window.electronAPI.aleRequestBatch(payloads)
    } else {
      results = await Promise.all(
        payloads.map((p) => window.electronAPI!.aleRequest(p.url, p.options)),
      )
    }
    this.applySetCookiesFromResponses(results)
    return results
  }

  private async request(
    host: string,
    port: string,
    path: string,
    options: {
      method?: string
      body?: string
      headers?: Record<string, string>
      timeoutMs?: number
    } = {},
  ): Promise<AleResponse> {
    const [res] = await this.requestBatch(host, port, [{ path, options }])
    return res
  }

  async authenticate(
    host: string,
    port: string,
    username: string,
    password: string,
    passwordIsHashed = false,
  ): Promise<void> {
    if (!this.authSecret || !this.basicAuth) {
      await this.prepareCredentials(username, password, passwordIsHashed)
    }

    const body: AuthenticateBody = {
      username: username.trim(),
      password: this.authSecret!,
    }

    const res = await this.request(host, port, '/ALE/api/auth', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: EDGE_GET_TIMEOUT_MS,
    })

    if (!res.ok && res.status !== 204) {
      throw new Error(
        res.data?.trim() || `Authentication failed (${res.status} ${res.statusText})`,
      )
    }
    this.authenticated = true
  }

  /** Bruno flow: fresh POST /auth immediately before invoke (new JSESSIONID). */
  private async ensureSession(host: string, port: string): Promise<void> {
    if (!this.sessionCreds) {
      throw new Error('Edge session not configured — check .env credentials')
    }
    const { username, password, passwordIsHashed } = this.sessionCreds
    await this.authenticate(host, port, username, password, passwordIsHashed)
  }

  async listBlocks(host: string, port: string): Promise<EdgeBlockInfo[]> {
    const res = await this.request(host, port, '/ALE/api/activity', {
      timeoutMs: EDGE_GET_TIMEOUT_MS,
    })
    if (!res.ok) {
      throw new Error(res.data?.trim() || `List blocks failed (${res.status})`)
    }
    const parsed = parseJson<unknown>(res.data || '[]')
    return normalizeBlockList(parsed)
  }

  async getBlockParams(host: string, port: string, blockName: string): Promise<EdgeBlockParam[]> {
    const cached = this.blockParamsCache.get(blockName)
    if (cached) return cached

    const encoded = encodeURIComponent(blockName)
    const reqOpts = { timeoutMs: EDGE_GET_TIMEOUT_MS }

    const [paramRes, blockRes] = await this.requestBatch(host, port, [
      { path: `/ALE/api/activity/${encoded}/param`, options: reqOpts },
      { path: `/ALE/api/activity/${encoded}`, options: reqOpts },
    ])

    let result: EdgeBlockParam[] = []
    if (paramRes.ok && paramRes.data) {
      result = normalizeBlockParams(parseJson(paramRes.data))
    }
    if (result.length === 0 && blockRes.ok && blockRes.data) {
      result = normalizeBlockParams(parseJson(blockRes.data))
    }

    if (result.length === 0 && !paramRes.ok && !blockRes.ok) {
      throw new Error(
        blockRes.data?.trim() ||
          paramRes.data?.trim() ||
          `Failed to load params (${blockRes.status})`,
      )
    }

    this.blockParamsCache.set(blockName, result)
    return result
  }

  /** GET /ALE/api/logical-device — operationId: ListStations */
  async listLogicalDevices(host: string, port: string): Promise<EdgeLogicalDevice[]> {
    if (this.logicalDevicesCache) return this.logicalDevicesCache

    const res = await this.request(host, port, '/ALE/api/logical-device/', {
      timeoutMs: EDGE_GET_TIMEOUT_MS,
    })
    if (!res.ok) {
      throw new Error(res.data?.trim() || `List logical devices failed (${res.status})`)
    }
    const parsed = parseJson<unknown>(res.data || '[]')
    if (!Array.isArray(parsed)) {
      this.logicalDevicesCache = []
      return []
    }
    const devices = parsed
      .map((item) => {
        if (typeof item === 'string') return { name: item }
        if (item && typeof item === 'object' && 'name' in item) {
          const o = item as Record<string, unknown>
          return {
            name: String(o.name),
            vendor: o.vendor != null ? String(o.vendor) : undefined,
          }
        }
        return null
      })
      .filter((d): d is EdgeLogicalDevice => d != null && d.name.trim() !== '')

    this.logicalDevicesCache = devices
    return devices
  }

  /**
   * Invoke block (Bruno flow): re-auth → POST /activity/invoke with cookie + Basic auth.
   */
  async invokeBlock(
    host: string,
    port: string,
    blockName: string,
    params: Record<string, unknown>,
    orderedParamNames?: string[],
  ): Promise<AleResponse> {
    await this.ensureSession(host, port)

    const timeoutMs = computeInvokeTimeoutMs(params)
    // Bruno / OpenAPI serialInvokeBlocks: activityName + params[{ key, value }]
    const body = buildSerialInvokeBody(blockName, params, orderedParamNames)
    const bodyStr = JSON.stringify(body)
    const res = await this.request(host, port, '/ALE/api/activity/invoke', {
      method: 'POST',
      body: bodyStr,
      timeoutMs,
    })
    this.lastInvokeDebug = {
      url: `${baseUrl(host, port)}/ALE/api/activity/invoke`,
      body: bodyStr,
      status: res.status,
      response: res.data,
      hadCookie: Boolean(this.cookies),
      hadBasicAuth: Boolean(this.basicAuth),
    }
    return res
  }

  async listProcesses(host: string, port: string): Promise<EdgeProcessInfo[]> {
    const res = await this.request(host, port, '/ALE/api/workflow', {
      timeoutMs: EDGE_GET_TIMEOUT_MS,
    })
    if (!res.ok) {
      throw new Error(res.data?.trim() || `List processes failed (${res.status})`)
    }
    const parsed = parseJson<unknown>(res.data || '[]')
    return normalizeProcessList(parsed)
  }

  /** GET /workflow/{name} — operationId: GetProcess */
  async getProcess(host: string, port: string, processName: string): Promise<EdgeProcessInfo> {
    const encoded = encodeURIComponent(processName)
    const res = await this.request(host, port, `/ALE/api/workflow/${encoded}`, {
      timeoutMs: EDGE_GET_TIMEOUT_MS,
    })
    if (!res.ok) {
      throw new Error(res.data?.trim() || `Get process failed (${res.status})`)
    }
    const list = normalizeProcessList(parseJson(res.data ?? '{}'))
    const found = list.find((p) => p.name === processName)
    if (found) return found
    if (list.length === 1) return list[0]
    return { name: processName }
  }

  /** PUT /workflow/{processName}/invoke — operationId: InvokeProcess */
  async startProcess(host: string, port: string, processName: string): Promise<AleResponse> {
    const encoded = encodeURIComponent(processName)
    return this.request(host, port, `/ALE/api/workflow/${encoded}/invoke`, {
      method: 'PUT',
    })
  }

  /** PUT /workflow/{processName}/stop — operationId: StopProcess */
  async stopProcess(host: string, port: string, processName: string): Promise<AleResponse> {
    const encoded = encodeURIComponent(processName)
    return this.request(host, port, `/ALE/api/workflow/${encoded}/stop`, {
      method: 'PUT',
    })
  }

  async ping(host: string, port: string): Promise<boolean> {
    const res = await this.request(host, port, '/ALE/api/ping')
    return res.ok
  }

  async getVersion(host: string, port: string): Promise<string | null> {
    const res = await this.request(host, port, '/ALE/api/version', {
      timeoutMs: EDGE_GET_TIMEOUT_MS,
    })
    if (!res.ok || !res.data?.trim()) return null
    const parsed = parseJson<{ version?: string } | string>(res.data)
    if (typeof parsed === 'string') return parsed.trim() || null
    return parsed?.version?.trim() || res.data.trim() || null
  }

  async getSetup(host: string, port: string): Promise<string | null> {
    const res = await this.request(host, port, '/ALE/api/setup', {
      timeoutMs: EDGE_GET_TIMEOUT_MS,
    })
    if (!res.ok || !res.data?.trim()) return null
    const parsed = parseJson<{ name?: string; setup?: string } | string>(res.data)
    if (typeof parsed === 'string') return parsed.trim() || null
    return parsed?.name?.trim() || parsed?.setup?.trim() || res.data.trim() || null
  }

  async checkLicenseValid(host: string, port: string): Promise<boolean | null> {
    const res = await this.request(host, port, '/ALE/api/valid', {
      timeoutMs: EDGE_GET_TIMEOUT_MS,
    })
    if (!res.ok) return null
    const raw = res.data?.trim().toLowerCase() ?? ''
    if (raw === 'true' || raw === '1') return true
    if (raw === 'false' || raw === '0') return false
    const parsed = parseJson<{ valid?: boolean } | boolean>(res.data || '')
    if (typeof parsed === 'boolean') return parsed
    if (parsed && typeof parsed === 'object' && 'valid' in parsed) return Boolean(parsed.valid)
    return null
  }

  async getSystemMonitor(host: string, port: string): Promise<Record<string, unknown> | null> {
    const res = await this.request(host, port, '/ALE/api/system-monitor', {
      timeoutMs: EDGE_GET_TIMEOUT_MS,
    })
    if (!res.ok || !res.data?.trim()) return null
    const parsed = parseJson<Record<string, unknown>>(res.data)
    return parsed && typeof parsed === 'object' ? parsed : { raw: res.data }
  }
}
