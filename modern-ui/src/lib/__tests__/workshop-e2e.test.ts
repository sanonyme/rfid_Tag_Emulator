import { beforeEach, describe, expect, it } from 'vitest'
import { decryptPrivateMessage, encryptPrivateMessage, ensureE2eKeys, isE2eEnvelope } from '../workshop-e2e'
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
    expect(storedPrivateText(sealed)).toBe(sealed)
    expect(await decryptPrivateMessage(bob, alicePub, sealed)).toBe('Meet at the tree')
    expect(await decryptPrivateMessage(alice, bobPub, sealed)).toBe('Meet at the tree')
    expect(await decryptPrivateMessage(bob, bobPub, sealed)).toMatch(/^🔒/)
  })

  it('accepts sealed payloads on the DM wire and history parser', () => {
    const sealed = 'zeus1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    expect(parseClientCommand({ op: 'dm', to: 'abcdefgh', text: sealed })).toEqual({ op: 'dm', to: 'abcdefgh', text: sealed })
    const notice = parseServerNotice({
      op: 'dm',
      message: { from: 'abcdefgh', to: 'ijklmnop', name: 'Elf', text: sealed, at: 1 },
    })
    expect(notice).toMatchObject({ op: 'dm', message: { text: sealed } })
    const id = '00000000-0000-0000-0000-000000000001'
    expect(parsePrivateMessages([{ id, from: id, to: bob, name: 'Elf', text: sealed, at: 1 }])[0].text).toBe(sealed)
  })

  it('leaves legacy plaintext readable', async () => {
    const bobPub = await ensureE2eKeys(bob)
    expect(await decryptPrivateMessage(bob, bobPub, 'old hello')).toBe('old hello')
  })
})
