/**
 * End-to-end private messages for Workshop accounts.
 * The server stores ciphertext plus a password-wrapped copy of this account's private key,
 * so signing in on any device can open the same history. A database copy is not enough to read it.
 *
 * Envelope v2 embeds both public keys used at seal time. Older device keys are kept in the
 * backup so messages sealed before a key change can still be opened.
 */
const PREFIX_V1 = 'zeus1'
const PREFIX_V2 = 'zeus2'
const STORAGE = (userId: string) => `workshop-e2e-v1:${userId}`
const WRAP_ITERS = 120_000

export type E2ePublicJwk = JsonWebKey & { kty: 'EC'; crv: 'P-256'; x: string; y: string }
export type E2eKeyBackup = { v: 1; salt: string; iv: string; ct: string }

type KeyEntry = { privateJwk: JsonWebKey; publicJwk: E2ePublicJwk }
type StoredBundle = KeyEntry & { history?: KeyEntry[] }

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

const COORD = '[A-Za-z0-9_-]+'
const V1_RE = new RegExp(`^${PREFIX_V1}\\.${COORD}\\.${COORD}$`)
const V2_RE = new RegExp(`^${PREFIX_V2}\\.${COORD}\\.${COORD}\\.${COORD}\\.${COORD}\\.${COORD}\\.${COORD}$`)

export function isE2eEnvelope(text: string): boolean {
  return V1_RE.test(text) || V2_RE.test(text)
}

export function isE2ePublicJwk(v: unknown): v is E2ePublicJwk {
  if (!v || typeof v !== 'object') return false
  const j = v as JsonWebKey
  return j.kty === 'EC' && j.crv === 'P-256' && typeof j.x === 'string' && typeof j.y === 'string'
    && j.x.length >= 40 && j.x.length <= 64 && j.y.length >= 40 && j.y.length <= 64
}

function samePublic(a: E2ePublicJwk, b: E2ePublicJwk): boolean {
  return a.x === b.x && a.y === b.y
}

export function isE2eKeyBackup(v: unknown): v is E2eKeyBackup {
  if (!v || typeof v !== 'object') return false
  const b = v as E2eKeyBackup
  return b.v === 1 && typeof b.salt === 'string' && typeof b.iv === 'string' && typeof b.ct === 'string'
    && b.salt.length >= 16 && b.salt.length <= 80 && b.iv.length >= 8 && b.iv.length <= 40
    && b.ct.length >= 16 && b.ct.length <= 20000
    && /^[A-Za-z0-9_-]+$/.test(b.salt) && /^[A-Za-z0-9_-]+$/.test(b.iv) && /^[A-Za-z0-9_-]+$/.test(b.ct)
}

function isKeyEntry(v: unknown): v is KeyEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as KeyEntry
  return !!e.privateJwk && typeof e.privateJwk.d === 'string' && isE2ePublicJwk(e.publicJwk)
}

function allEntries(bundle: StoredBundle): KeyEntry[] {
  const out: KeyEntry[] = [{ privateJwk: bundle.privateJwk, publicJwk: bundle.publicJwk }]
  for (const old of bundle.history ?? []) {
    if (!isKeyEntry(old) || out.some((e) => samePublic(e.publicJwk, old.publicJwk))) continue
    out.push(old)
  }
  return out
}

function readBundle(userId: string): StoredBundle | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE(userId)) ?? 'null') as unknown
    if (!isKeyEntry(raw)) return null
    const history = Array.isArray((raw as StoredBundle).history)
      ? (raw as StoredBundle).history!.filter(isKeyEntry).slice(-8)
      : []
    return { privateJwk: raw.privateJwk, publicJwk: raw.publicJwk, history }
  } catch {
    return null
  }
}

function writeBundle(userId: string, bundle: StoredBundle) {
  localStorage.setItem(STORAGE(userId), JSON.stringify(bundle))
}

async function importPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  const slim: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x,
    y: jwk.y,
    d: jwk.d,
  }
  return crypto.subtle.importKey('jwk', slim, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey'])
}

async function importPublic(jwk: E2ePublicJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )
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

/** Private keys currently on this device, including ones kept after a key change. */
export function copyLocalKeyEntries(userId: string): KeyEntry[] {
  const bundle = readBundle(userId)
  return bundle ? allEntries(bundle) : []
}

/** Keep keys from another device so older messages sealed with them still open. */
export function adoptExtraKeys(userId: string, extras: KeyEntry[]): boolean {
  const bundle = readBundle(userId)
  if (!bundle || extras.length === 0) return false
  const history = [...(bundle.history ?? [])]
  let added = false
  for (const extra of extras) {
    if (!isKeyEntry(extra)) continue
    if (samePublic(extra.publicJwk, bundle.publicJwk) || history.some((h) => samePublic(h.publicJwk, extra.publicJwk))) continue
    history.push(extra)
    added = true
  }
  if (!added) return false
  writeBundle(userId, { ...bundle, history: history.slice(-8) })
  return true
}

async function wrapKey(password: string, purpose: 'encrypt' | 'decrypt'): Promise<{ key: CryptoKey; salt: Uint8Array; iv?: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: Uint8Array.from(salt), iterations: WRAP_ITERS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [purpose],
  )
  return { key, salt }
}

/** Password-wrapped copy of every private key this device holds for the account. */
export async function createAccountKeyBackup(userId: string, password: string): Promise<{ publicKey: E2ePublicJwk; wrapped: E2eKeyBackup }> {
  const bundle = readBundle(userId)
  if (!bundle) throw new Error('Secure keys are missing on this device. Sign in again to create them.')
  const { key, salt } = await wrapKey(password, 'encrypt')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(bundle)))
  return { publicKey: bundle.publicJwk, wrapped: { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) } }
}

/** Install a password backup, replacing the device copy with the account copy. */
export async function installAccountKeyBackup(userId: string, password: string, wrapped: E2eKeyBackup): Promise<E2ePublicJwk> {
  const salt = Uint8Array.from(unb64(wrapped.salt))
  const iv = Uint8Array.from(unb64(wrapped.iv))
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: WRAP_ITERS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, Uint8Array.from(unb64(wrapped.ct)))
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as unknown
  if (!isKeyEntry(parsed)) throw new Error('Secure chat backup could not be opened')
  const history = Array.isArray((parsed as StoredBundle).history) ? (parsed as StoredBundle).history!.filter(isKeyEntry).slice(-8) : []
  writeBundle(userId, { privateJwk: parsed.privateJwk, publicJwk: parsed.publicJwk, history })
  return parsed.publicJwk
}

/** Encrypt plaintext for a friend. Result is safe to store on the server. */
export async function encryptPrivateMessage(userId: string, peerPublic: E2ePublicJwk, plaintext: string): Promise<string> {
  const bundle = readBundle(userId)
  if (!bundle) throw new Error('Secure keys are missing on this device. Sign in again to create them.')
  const aes = await sharedAes(await importPrivate(bundle.privateJwk), await importPublic(peerPublic))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(plaintext))
  const self = bundle.publicJwk
  return `${PREFIX_V2}.${self.x}.${self.y}.${peerPublic.x}.${peerPublic.y}.${b64(iv)}.${b64(ct)}`
}

async function tryOpen(privateJwk: JsonWebKey, peer: E2ePublicJwk, ivPart: string, ctPart: string): Promise<string | null> {
  try {
    const aes = await sharedAes(await importPrivate(privateJwk), await importPublic(peer))
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(unb64(ivPart)) },
      aes,
      Uint8Array.from(unb64(ctPart)),
    )
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

/**
 * Decrypt a stored envelope. Returns a lock message when this device cannot open it.
 * Plain (legacy) text is returned unchanged.
 */
export async function decryptPrivateMessage(userId: string, peerPublic: E2ePublicJwk | null, text: string): Promise<string> {
  if (!isE2eEnvelope(text)) return text
  const bundle = readBundle(userId)
  if (!bundle) return '🔒 Encrypted message — sign in again to restore messages on this device.'
  const parts = text.split('.')
  let peers: E2ePublicJwk[] = []
  let ivPart: string | undefined
  let ctPart: string | undefined
  if (parts[0] === PREFIX_V2 && parts.length === 7) {
    const sender: E2ePublicJwk = { kty: 'EC', crv: 'P-256', x: parts[1]!, y: parts[2]! }
    const recipient: E2ePublicJwk = { kty: 'EC', crv: 'P-256', x: parts[3]!, y: parts[4]! }
    if (!isE2ePublicJwk(sender) || !isE2ePublicJwk(recipient)) return '🔒 Encrypted message — unreadable.'
    peers = [sender, recipient]
    ivPart = parts[5]
    ctPart = parts[6]
  } else if (parts[0] === PREFIX_V1 && parts.length === 3) {
    if (!peerPublic) return '🔒 Encrypted message — this friend has not published a key yet.'
    peers = [peerPublic]
    ivPart = parts[1]
    ctPart = parts[2]
  } else {
    return '🔒 Encrypted message — unreadable.'
  }
  if (!ivPart || !ctPart) return '🔒 Encrypted message — unreadable.'
  for (const entry of allEntries(bundle)) {
    for (const peer of peers) {
      const opened = await tryOpen(entry.privateJwk, peer, ivPart, ctPart)
      if (opened !== null) return opened
    }
  }
  return '🔒 Encrypted message — key changed or this device cannot open it.'
}
