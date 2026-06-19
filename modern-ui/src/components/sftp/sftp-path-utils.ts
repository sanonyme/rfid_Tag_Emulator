export function posixJoin(dir: string, name: string): string {
  const d = dir.replace(/\/+$/, '') || '/'
  const seg = name.replace(/^\/+/, '')
  if (d === '/') return `/${seg}`.replace(/\/+/g, '/')
  return `${d}/${seg}`.replace(/\/+/g, '/')
}

export function parentDir(filePath: string): string {
  if (filePath === '/' || !filePath) return '/'
  const trimmed = filePath.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i <= 0) return '/'
  return trimmed.slice(0, i) || '/'
}

export function joinLocalDir(base: string, fileName: string): string {
  const win = window.electronAPI?.platform === 'win32'
  const sep = win ? '\\' : '/'
  return `${base.replace(/[/\\]+$/, '')}${sep}${fileName.replace(/^[/\\]+/, '')}`
}

export function joinLocalSegments(base: string, relPath: string): string {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean)
  let p = base.replace(/[/\\]+$/, '')
  for (const part of parts) {
    p = joinLocalDir(p, part)
  }
  return p
}

export function fileExtension(name: string): string | undefined {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return undefined
  return name.slice(i + 1).toLowerCase()
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}
