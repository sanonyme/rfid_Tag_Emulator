/**
 * End-to-end private messages for Workshop accounts.
 * Private keys never leave this device. The server only stores public keys and ciphertext.
 */
const PREFIX = 'zeus1'
const STORAGE = (userId: string) => `workshop-e2e-v1:${userId}`

export type E2ePublicJwk = JsonWebKey & { kty: 'EC'; crv: 'P-256'; x: string; y: string }

type StoredBundle = { privateJwk: JsonWebKey; publicJwk: E2ePublicJwk }

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64(text: string): Uint8Array {
  const pad = '='.repeat((4 - (text.length % 4)) % 4)
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function isE2eEnvelope(text: string): boolean {
  return /^zeus1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)
}

export function isE2ePublicJwk(v: unknown): v is E2ePublicJwk {
  if (!v || typeof v !== 'object') return false
  const j = v as JsonWebKey
  return j.kty === 'EC' && j.crv === 'P-256' && typeof j.x === 'string' && typeof j.y === 'string'
    && j.x.length >= 40 && j.x.length <= 64 && j.y.length >= 40 && j.y.length <= 64
}

function readBundle(userId: string): StoredBundle | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE(userId)) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object') return null
    const bundle = raw as StoredBundle
    if (!bundle.privateJwk || !isE2ePublicJwk(bundle.publicJwk)) return null
    return bundle
  } catch {
    return null
  }
}

function writeBundle(userId: string, bundle: StoredBundle) {
  localStorage.setItem(STORAGE(userId), JSON.stringify(bundle))
}

async function importPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey'])
}

async function importPublic(jwk: E2ePublicJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
}

async function sharedAes(privateKey: CryptoKey, peerPublic: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublic },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Create or load this account's key pair on this device and return the public half. */
export async function ensureE2eKeys(userId: string): Promise<E2ePublicJwk> {
  const existing = readBundle(userId)
  if (existing) return existing.publicJwk
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicRaw = await crypto.subtle.exportKey('jwk', pair.publicKey)
  if (!isE2ePublicJwk(publicRaw)) throw new Error('Could not create secure message keys')
  const publicJwk: E2ePublicJwk = { kty: 'EC', crv: 'P-256', x: publicRaw.x, y: publicRaw.y }
  writeBundle(userId, { privateJwk, publicJwk })
  return publicJwk
}

export function hasLocalE2eKeys(userId: string): boolean {
  return !!readBundle(userId)
}

/** Encrypt plaintext for a friend. Result is safe to store on the server. */
export async function encryptPrivateMessage(userId: string, peerPublic: E2ePublicJwk, plaintext: string): Promise<string> {
  const bundle = readBundle(userId)
  if (!bundle) throw new Error('Secure keys are missing on this device. Sign in again to create them.')
  const aes = await sharedAes(await importPrivate(bundle.privateJwk), await importPublic(peerPublic))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(plaintext))
  return `${PREFIX}.${b64(iv)}.${b64(ct)}`
}

/**
 * Decrypt a stored envelope. Returns null when this device cannot open it.
 * Plain (legacy) text is returned unchanged.
 */
export async function decryptPrivateMessage(userId: string, peerPublic: E2ePublicJwk | null, text: string): Promise<string> {
  if (!isE2eEnvelope(text)) return text
  if (!peerPublic) return '🔒 Encrypted message — this friend has not published a key yet.'
  const bundle = readBundle(userId)
  if (!bundle) return '🔒 Encrypted message — open Zeus on the device where you first signed in.'
  try {
    const [, ivPart, ctPart] = text.split('.')
    if (!ivPart || !ctPart) return '🔒 Encrypted message — unreadable.'
    const aes = await sharedAes(await importPrivate(bundle.privateJwk), await importPublic(peerPublic))
    const iv = Uint8Array.from(unb64(ivPart))
    const data = Uint8Array.from(unb64(ctPart))
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, data)
    return new TextDecoder().decode(plain)
  } catch {
    return '🔒 Encrypted message — key changed or this device cannot open it.'
  }
}
