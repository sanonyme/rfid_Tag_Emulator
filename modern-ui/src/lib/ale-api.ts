import { makeEdgeSecret } from './edge-auth'
import { ALE_ENV_MISSING_MSG, getAleEnvCredentials } from './edge-env-credentials'

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

export class AleApiClient {
  private cookies: string | null = null;

  constructor() {}

  private async request(url: string, options: RequestInit): Promise<string> {
    if (window.electronAPI?.aleRequest) {
      const headers = { ...(options.headers as Record<string, string> || {}) }
      if (this.cookies) {
        headers['Cookie'] = this.cookies
      }

      const res = await window.electronAPI.aleRequest(url, { ...options, headers })

      if (!res.ok) throw new Error(`Request failed: ${res.statusText} (${res.status})`)

      if (res.headers && res.headers['set-cookie']) {
        this.cookies = res.headers['set-cookie']
      }

      return res.data || ''
    } else {
      const res = await fetch(url, options)
      if (!res.ok) throw new Error(`Request failed: ${res.statusText}`)
      return await res.text()
    }
  }

  async authenticate(host: string, port: string = '80'): Promise<string> {
    const creds = await getAleEnvCredentials()
    if (!creds) {
      throw new Error(ALE_ENV_MISSING_MSG)
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
                username: 'use_env_vars',
                password: 'use_env_vars',
            }),
        })

        if (!response.ok) {
            throw new Error(`Auth failed: ${response.statusText}`)
        }

        if (response.headers && response.headers['set-cookie']) {
            this.cookies = response.headers['set-cookie']
        }

        const data = response.data || ''
        try {
          const json = JSON.parse(data)
          if (json && typeof json === 'object' && 'error' in json && json.error) {
            throw new Error(String(json.error))
          }
          if (json.token) return json.token
          if (data && !data.startsWith('{')) return data
        } catch (e) {
          if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) throw e
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
      const password = creds.passwordIsHashed
        ? creds.password
        : await makeEdgeSecret(creds.password)
      const data = await this.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: creds.username,
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
      if (json && typeof json === 'object' && 'error' in json && json.error) {
        throw new Error(String(json.error))
      }
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
