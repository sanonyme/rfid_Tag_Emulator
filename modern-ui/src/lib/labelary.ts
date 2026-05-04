/** Dots per millimeter supported by Labelary. */
export type LabelaryDpmm = 6 | 8 | 12 | 24

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type })
}

/**
 * Render ZPL to a PNG via the Labelary public API.
 * In Electron, uses main-process fetch when available (avoids browser CORS on file://).
 * In Vite dev, uses `/labelary/` proxy.
 */
export async function renderZplToBlob(
  zpl: string,
  opts: { dpmm: LabelaryDpmm; widthIn: number; heightIn: number }
): Promise<Blob> {
  const body = zpl.trim()
  if (!body) throw new Error('ZPL is empty')

  const { dpmm, widthIn, heightIn } = opts
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
    throw new Error('Invalid label size (width × height in inches)')
  }

  const path = `v1/printers/${dpmm}dpmm/labels/${widthIn}x${heightIn}/0/`

  if (typeof window !== 'undefined' && window.electronAPI?.labelaryRender) {
    const b64 = await window.electronAPI.labelaryRender(body, dpmm, widthIn, heightIn)
    return base64ToBlob(b64, 'image/png')
  }

  const baseUrl = import.meta.env.DEV ? `/labelary/` : `http://api.labelary.com/`
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'image/png',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error((errText || `HTTP ${res.status}`).slice(0, 900))
  }
  return await res.blob()
}
