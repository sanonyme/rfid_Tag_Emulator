import crypto from 'crypto'

const EDGE_PASSWORD_SALT = 'QGFjdGl2ZQ=='

function embeddedAleUsername(): string {
  return typeof __ZEUS_EMBED_ALE_USERNAME__ !== 'undefined' ? __ZEUS_EMBED_ALE_USERNAME__ : ''
}

function embeddedAlePassword(): string {
  return typeof __ZEUS_EMBED_ALE_PASSWORD__ !== 'undefined' ? __ZEUS_EMBED_ALE_PASSWORD__ : ''
}

export function getAleCredentials(): { username: string; password: string } | null {
  const username = (
    process.env.ZEUS_ALE_USERNAME ??
    process.env.VITE_ALE_USERNAME ??
    embeddedAleUsername()
  ).trim()
  const password =
    process.env.ZEUS_ALE_PASSWORD ??
    process.env.VITE_ALE_PASSWORD ??
    embeddedAlePassword()
  if (!username || !password) return null
  return { username, password }
}

export function hasAleCredentials(): boolean {
  return getAleCredentials() !== null
}

export function passwordLooksHashed(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.trim())
}

export function resolveAleSecret(password: string): string {
  const trimmed = password.trim()
  return passwordLooksHashed(trimmed) ? trimmed : crypto.createHash('sha256').update(trimmed + EDGE_PASSWORD_SALT).digest('hex')
}

export function makeAleBasicAuthHeader(username: string, password: string): string {
  const secret = resolveAleSecret(password)
  return `Basic ${Buffer.from(`${username.trim()}:${secret}`, 'utf8').toString('base64')}`
}
