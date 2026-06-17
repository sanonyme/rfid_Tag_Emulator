export const S_IFMT = 0o170000
export const S_IFDIR = 0o040000
export const S_IFREG = 0o100000
export const S_ISUID = 0o4000
export const S_ISGID = 0o2000
export const S_ISVTX = 0o1000

export interface PermissionTriplet {
  r: boolean
  w: boolean
  x: boolean
}

export interface PermissionSet {
  owner: PermissionTriplet
  group: PermissionTriplet
  others: PermissionTriplet
  setUid: boolean
  setGid: boolean
  sticky: boolean
}

function tripletFromBits(n: number): PermissionTriplet {
  return {
    r: (n & 4) !== 0,
    w: (n & 2) !== 0,
    x: (n & 1) !== 0,
  }
}

function bitsFromTriplet(t: PermissionTriplet): number {
  return (t.r ? 4 : 0) + (t.w ? 2 : 0) + (t.x ? 1 : 0)
}

export function modeToPermissions(mode: number): PermissionSet {
  const perm = mode & 0o777
  return {
    owner: tripletFromBits((perm >> 6) & 7),
    group: tripletFromBits((perm >> 3) & 7),
    others: tripletFromBits(perm & 7),
    setUid: (mode & S_ISUID) !== 0,
    setGid: (mode & S_ISGID) !== 0,
    sticky: (mode & S_ISVTX) !== 0,
  }
}

export function permissionsToMode(typeBits: number, perms: PermissionSet): number {
  const perm =
    (bitsFromTriplet(perms.owner) << 6) |
    (bitsFromTriplet(perms.group) << 3) |
    bitsFromTriplet(perms.others)
  let mode = (typeBits & S_IFMT) | perm
  if (perms.setUid) mode |= S_ISUID
  if (perms.setGid) mode |= S_ISGID
  if (perms.sticky) mode |= S_ISVTX
  return mode
}

export function formatOctalMode(mode: number): string {
  const special =
    ((mode & S_ISUID) ? 4 : 0) + ((mode & S_ISGID) ? 2 : 0) + ((mode & S_ISVTX) ? 1 : 0)
  const perm = mode & 0o777
  return `${special}${perm.toString().padStart(3, '0')}`
}

export function parseOctalMode(input: string, typeBits: number): number | null {
  const raw = input.trim()
  if (!raw) return null
  const digits = raw.replace(/^0+/, '') || '0'
  if (!/^\d{1,4}$/.test(digits)) return null

  let special = 0
  let perm = 0
  if (digits.length <= 3) {
    perm = parseInt(digits.padStart(3, '0'), 8)
  } else {
    const specialDigit = parseInt(digits.slice(0, digits.length - 3), 10)
    perm = parseInt(digits.slice(-3), 8)
    if (specialDigit & 4) special |= S_ISUID
    if (specialDigit & 2) special |= S_ISGID
    if (specialDigit & 1) special |= S_ISVTX
  }

  if (perm > 0o777) return null
  return (typeBits & S_IFMT) | special | perm
}

export function formatOwnerLabel(uid: number): string {
  if (uid === 0) return 'root [0]'
  return `uid ${uid} [${uid}]`
}

export function formatGroupLabel(gid: number): string {
  if (gid === 0) return 'root [0]'
  return `gid ${gid} [${gid}]`
}
