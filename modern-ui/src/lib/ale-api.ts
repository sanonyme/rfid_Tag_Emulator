export interface LogicalDevice {
  name: string
  composite: boolean
  logicalReaders: string[]
  vendor: string
  uid: string
  locationX: string
  locationY: string
  groupName: string
  antennas: number[]
}

function getAleCredentials(): { username: string; password: string } {
  const username = (import.meta.env.VITE_ALE_USERNAME as string | undefined)?.trim() || ''
  const password = (import.meta.env.VITE_ALE_PASSWORD as string | undefined) ?? ''
  return { username, password }
}

/** Capacitor / fetch use different header casings; cookies must match for ALE session. */
function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined
  const key = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : undefined
}

export class AleApiClient {
  private cookies: string | null = null;

  constructor() {}

  private async request(url: string, options: RequestInit): Promise<string> {
    if (window.electronAPI?.aleRequest) {
      const headers = { ...(options.headers as any || {}) }
      if (this.cookies) {
        headers['Cookie'] = this.cookies
      }
      
      const res = await window.electronAPI.aleRequest(url, { ...options, headers })
      
      if (!res.ok) throw new Error(`Request failed: ${res.statusText} (${res.status})`)
      
      const setCookie = getHeader(res.headers, 'set-cookie')
      if (setCookie) {
        this.cookies = setCookie
      }
      
      return res.data || ''
    } else {
      const res = await fetch(url, options)
      if (!res.ok) throw new Error(`Request failed: ${res.statusText}`)
      return await res.text()
    }
  }

  async authenticate(host: string, port: string = '80'): Promise<string> {
    const { username, password } = getAleCredentials()
    if (!username) {
      throw new Error(
        'ALE username missing. Add VITE_ALE_USERNAME and VITE_ALE_PASSWORD to modern-ui/.env, then rebuild the app (e.g. npm run cap:sync).',
      )
    }

    if (window.electronAPI?.aleRequest) {
      const url = `http://${host}:${port}/ALE/api/auth`
      try {
        const response = await window.electronAPI.aleRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username,
                password,
            }),
        })
        
        if (!response.ok) {
            throw new Error(`Auth failed: ${response.statusText}`)
        }

        const setCookie = getHeader(response.headers, 'set-cookie')
        if (setCookie) {
            this.cookies = setCookie
        }

        const data = response.data || ''
        try {
          const json = JSON.parse(data)
          if (json.token) return json.token
          if (data && !data.startsWith('{')) return data 
        } catch {
          return data
        }
        return data
      } catch (error) {
        console.error('ALE Auth Error:', error)
        throw error
      }
    }
    
    const url = `http://${host}:${port}/ALE/api/auth`
    try {
      const data = await this.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      })

      try {
        const json = JSON.parse(data)
        if (json.token) return json.token
      } catch {
        // Not JSON
      }
      
      return data
    } catch (error) {
      console.error('ALE Auth Error:', error)
      throw error
    }
  }

  async getLogicalDevices(host: string, port: string = '80'): Promise<LogicalDevice[]> {
    const token = await this.authenticate(host, port)

    const url = `http://${host}:${port}/ALE/api/logical-device/`
    try {
      const data = await this.request(url, {
        method: 'GET',
        headers: {
             'Authorization': token,
             'Content-Type': 'application/json'
        }
      })

      const json = JSON.parse(data)
      if (Array.isArray(json)) {
        return json as LogicalDevice[]
      }
      
      return []
    } catch (error) {
        console.error('ALE Fetch Error:', error)
        throw error
    }
  }
}
