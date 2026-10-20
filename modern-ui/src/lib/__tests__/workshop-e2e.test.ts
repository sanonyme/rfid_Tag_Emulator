import { beforeEach, describe, expect, it } from 'vitest'
import { adoptExtraKeys, copyLocalKeyEntries, createAccountKeyBackup, decryptPrivateMessage, encryptPrivateMessage, ensureE2eKeys, installAccountKeyBackup, isE2eEnvelope } from '../workshop-e2e'
import { parsePrivateMessages, storedPrivateText } from '../workshop-social'
import { parseClientCommand, parseServerNotice } from '../workshop-cloud-model'

const alice = '00000000-0000-0000-0000-0000000000a1'
const bob = '00000000-0000-0000-0000-0000000000b2'

describe('Workshop end-to-end private messages', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips ciphertext that only the peer device can open', async () => {
    const alicePub = await ensureE2eKeys(alice)
    const bobPub = await ensureE2eKeys(bob)
    const sealed = await encryptPrivateMessage(alice, bobPub, 'Meet at the tree')
    expect(isE2eEnvelope(sealed)).toBe(true)
    expect(sealed.startsWith('zeus2.')).toBe(true)
    expect(storedPrivateText(sealed)).toBe(sealed)
    expect(await decryptPrivateMessage(bob, alicePub, sealed)).toBe('Meet at the tree')
    expect(await decryptPrivateMessage(alice, bobPub, sealed)).toBe('Meet at the tree')
    // Wrong fallback key still works for v2 because pubs are inside the envelope.
    expect(await decryptPrivateMessage(bob, bobPub, sealed)).toBe('Meet at the tree')
  })

  it('sender can still read after the peer republishes a different server key', async () => {
    await ensureE2eKeys(alice)
    const bobPub = await ensureE2eKeys(bob)
    const sealed = await encryptPrivateMessage(alice, bobPub, 'Still readable')
    localStorage.removeItem(`workshop-e2e-v1:${bob}`)
    const bobPubNew = await ensureE2eKeys(bob)
    expect(bobPubNew.x).not.toBe(bobPub.x)
    expect(await decryptPrivateMessage(alice, bobPubNew, sealed)).toBe('Still readable')
    expect(await decryptPrivateMessage(bob, null, sealed)).toMatch(/^🔒/)
  })

  it('accepts sealed payloads on the DM wire and history parser', () => {
    const sealed = 'zeus2.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD.EEEEEEEEEEEE.FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
    expect(storedPrivateText(sealed)).toBe(sealed)
    expect(parseClientCommand({ op: 'dm', to: 'abcdefgh', text: sealed })).toEqual({ op: 'dm', to: 'abcdefgh', text: sealed })
    const notice = parseServerNotice({
      op: 'dm',
      message: { from: 'abcdefgh', to: 'ijklmnop', name: 'Elf', text: sealed, at: 1 },
    })
    expect(notice).toMatchObject({ op: 'dm', message: { text: sealed } })
    const id = '00000000-0000-0000-0000-000000000001'
    expect(parsePrivateMessages([{ id, from: id, to: bob, name: 'Elf', text: sealed, at: 1 }])[0].text).toBe(sealed)
  })

  it('opens the same messages on a fresh device after a password sign-in', async () => {
    const bobPub = await ensureE2eKeys(bob)
    await ensureE2eKeys(alice)
    const sealed = await encryptPrivateMessage(alice, bobPub, 'See you at the cabin')
    const carried = copyLocalKeyEntries(alice)
    const backup = await createAccountKeyBackup(alice, 'password-long')
    localStorage.removeItem(`workshop-e2e-v1:${alice}`)
    await installAccountKeyBackup(alice, 'password-long', backup.wrapped)
    expect(await decryptPrivateMessage(alice, bobPub, sealed)).toBe('See you at the cabin')
    localStorage.removeItem(`workshop-e2e-v1:${alice}`)
    await ensureE2eKeys(alice)
    const newer = await encryptPrivateMessage(alice, bobPub, 'sent before the backup caught up')
    const newerKeys = copyLocalKeyEntries(alice)
    await installAccountKeyBackup(alice, 'password-long', backup.wrapped)
    expect(adoptExtraKeys(alice, newerKeys)).toBe(true)
    expect(await decryptPrivateMessage(alice, bobPub, sealed)).toBe('See you at the cabin')
    expect(await decryptPrivateMessage(alice, bobPub, newer)).toBe('sent before the backup caught up')
    const merged = await createAccountKeyBackup(alice, 'password-long')
    localStorage.clear()
    await installAccountKeyBackup(alice, 'password-long', merged.wrapped)
    expect(await decryptPrivateMessage(alice, bobPub, sealed)).toBe('See you at the cabin')
    expect(await decryptPrivateMessage(alice, bobPub, newer)).toBe('sent before the backup caught up')
    expect(carried[0]?.publicJwk.x).toBeTruthy()
  })

  it('leaves legacy plaintext readable', async () => {
    const bobPub = await ensureE2eKeys(bob)
    expect(await decryptPrivateMessage(bob, bobPub, 'old hello')).toBe('old hello')
  })
})
