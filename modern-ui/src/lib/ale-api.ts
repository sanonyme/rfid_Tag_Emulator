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
      // Add stored cookies to headers if available
      const headers = { ...(options.headers as any || {}) }
      if (this.cookies) {
        headers['Cookie'] = this.cookies
      }
      
      const res = await window.electronAPI.aleRequest(url, { ...options, headers })
      
      if (!res.ok) throw new Error(`Request failed: ${res.statusText} (${res.status})`)
      
      // Store cookies if present in response
      if (res.headers && res.headers['set-cookie']) {
        this.cookies = res.headers['set-cookie']
      }
      
      return res.data || ''
    } else {
      // Fallback for browser (might hit CORS)
      const res = await fetch(url, options)
      if (!res.ok) throw new Error(`Request failed: ${res.statusText}`)
      return await res.text()
    }
  }

  async authenticate(host: string, port: string = '8080'): Promise<string> {
    if (window.electronAPI?.aleRequest) {
      // Use standard request proxy but with special credential injection in main process
      const url = `http://${host}:${port}/ALE/api/auth`
      try {
        const response = await window.electronAPI.aleRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: "use_env_vars", 
                password: "use_env_vars",
            }),
        })
        
        if (!response.ok) {
            throw new Error(`Auth failed: ${response.statusText}`)
        }

        // Store cookie if present
        if (response.headers && response.headers['set-cookie']) {
            this.cookies = response.headers['set-cookie']
        }

        const data = response.data || ''
        try {
          const json = JSON.parse(data)
          if (json.token) return json.token
          if (data && !data.startsWith('{')) return data 
        } catch (e) {
          return data
        }
        return data
      } catch (error) {
        console.error('ALE Auth Error:', error)
        throw error
      }
    }
    
    // Fallback for browser (will fail without CORS/Proxy if not electron)
    const url = `http://${host}:${port}/ALE/api/auth`
    try {
      const data = await this.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: import.meta.env.VITE_ALE_USERNAME,
          password: import.meta.env.VITE_ALE_PASSWORD,
        }),
      })

      try {
        const json = JSON.parse(data)
        if (json.token) return json.token
      } catch (e) {
        // Not JSON
      }
      
      return data
    } catch (error) {
      console.error('ALE Auth Error:', error)
      throw error
    }
  }

  async getLogicalDevices(host: string, port: string = '8080'): Promise<LogicalDevice[]> {
    // First authenticate
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
      // Data is an array of LogicalDevice objects
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
