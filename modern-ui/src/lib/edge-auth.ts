/** Edge REST secret key: SHA256(plainPassword + salt) per Edge OpenAPI docs. */
const EDGE_PASSWORD_SALT = 'QGFjdGl2ZQ=='

export async function makeEdgeSecret(plainPassword: string): Promise<string> {
  const message = plainPassword + EDGE_PASSWORD_SALT
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 64-char hex = already a hashed Edge secret. */
export function looksLikeEdgeSecret(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.trim())
}

export async function resolveEdgeSecret(
  password: string,
  passwordIsHashed = false,
): Promise<string> {
  return passwordIsHashed || looksLikeEdgeSecret(password)
    ? password.trim()
    : await makeEdgeSecret(password)
}

/** OpenAPI Basic auth: Base64(username + ":" + hashedSecret). */
export async function makeEdgeBasicAuthHeader(
  username: string,
  password: string,
  passwordIsHashed = false,
): Promise<string> {
  const secret = await resolveEdgeSecret(password, passwordIsHashed)
  return `Basic ${btoa(`${username.trim()}:${secret}`)}`
}
