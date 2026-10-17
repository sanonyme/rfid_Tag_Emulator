import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WorkshopFloor } from '@/components/workshop/WorkshopFloor'
import { CloudApi, CloudConnection, SessionLostError, clearLocalSession, isWorkshopStaging, restoreGuestSession, storedAccount } from '../workshop-cloud'
import { PROFILE_KEY, addToBag, loadProfile, newProfile, saveProfile } from '../workshop-profile'
import { ITEMS } from '../workshop-items'

class FakeSocket {
  static OPEN = 1
  static instances: FakeSocket[] = []
  readyState = 1
  bufferedAmount = 0
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  sent: unknown[] = []
  constructor() { FakeSocket.instances.push(this) }
  send(text: string) { this.sent.push(JSON.parse(text)) }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }) }
  emit(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }) }
}
const guest = { userId: null, name: 'Elf', crew: null, king: null, titles: [] }
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }
function mount() { return render(<TooltipProvider><WorkshopFloor /></TooltipProvider>) }
beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  localStorage.setItem('workshop-pinned','1')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  FakeSocket.instances = []
  vi.stubGlobal('WebSocket',FakeSocket)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear() })
describe('Workshop cloud client', () => {
  it('falls back to offline when a configured cloud endpoint stalls', async () => {
    const link = vi.fn()
    const connection = new CloudConnection('http://localhost:8787', { op: 'hello', device: 'ABCDEFGH', session: 'abcdefgh', name: 'Elf', token: null }, 'anexya-general', () => {}, link)
    await vi.advanceTimersByTimeAsync(10000)
    expect(link).toHaveBeenCalledWith(false)
    expect(FakeSocket.instances[0].readyState).toBe(3)
    connection.close()
  })
  it('opens General offline and Home without opening a connection or requiring an account', async () => {
    vi.stubGlobal('electronAPI', { workshopConfig: async () => ({ url: '' }) })
    const fetch = vi.fn(); vi.stubGlobal('fetch',fetch)
    mount(); await flush()
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Workshop room' })).toHaveValue('anexya-general')
    expect(screen.queryByRole('button', { name: 'Floor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'HH' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Home' })); await flush()
    expect(screen.getByText('Your world')).toBeInTheDocument()
    expect(FakeSocket.instances).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('covers the crew floor until Allow, then shows the floor', async () => {
    vi.stubGlobal('electronAPI', { workshopConfig: async () => ({ url: 'http://localhost:8787' }) })
    vi.stubGlobal('fetch',vi.fn(async () => ({ ok: true, json: async () => [] })))
    mount(); await flush()
    fireEvent.change(screen.getByRole('combobox', { name: 'Workshop room' }), { target: { value: 'vsbl' } }); await flush()
    const socket = FakeSocket.instances.at(-1)!
    act(() => socket.emit({ op: 'waiting', room: 'vsbl', status: 'knock' }))
    expect(screen.getByRole('button',{ name: 'Knock' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{ name: 'Knock' }))
    expect(socket.sent).toContainEqual({ op: 'knock' })
    act(() => socket.emit({ op: 'waiting', room: 'vsbl', status: 'pending' }))
    expect(screen.getByText(/Waiting outside/)).toBeInTheDocument()
    act(() => socket.emit({ op: 'joined', room: 'vsbl', identity: guest }))
    expect(screen.queryByText(/Waiting outside/)).toBeNull()
  })
  it('keeps the chip compact and opens account controls outside the clipped game surface', async () => {
    vi.stubGlobal('electronAPI', { workshopConfig: async () => ({ url: '' }) })
    mount(); await flush()
    const chip = screen.getByRole('button', { name: /^Workshop floor:/ })
    expect(chip).not.toHaveTextContent('Anexya General')
    expect(chip).not.toHaveTextContent('solo')
    fireEvent.click(screen.getByRole('button', { name: /^Guest ·/ })); await flush()
    const dialog = screen.getByRole('dialog')
    expect(document.querySelector('[data-workshop-panel]')?.contains(dialog)).toBe(false)
    expect(screen.getByLabelText('Password', { exact: true })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save server address' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByLabelText('Signup crew')).toBeVisible()
  })
  it('keeps the email verification step when switching Sign in and Create account', async () => {
    vi.stubGlobal('electronAPI', { workshopConfig: async () => ({ url: 'http://localhost:8787' }) })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => String(url).includes('/auth/handle-available')
        ? { handle: 'snowelf', available: true, reason: null }
        : { verificationRequired: true, requestId: '00000000-0000-0000-0000-000000000002', email: 'elf@example.com' },
    })))
    mount(); await flush()
    fireEvent.click(screen.getByRole('button', { name: /^Guest ·/ })); await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'elf@example.com' } })
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'strong-password' } })
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'snowelf' } })
    await act(async () => { vi.advanceTimersByTime(450); await Promise.resolve(); await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: 'Send verification code' })); await flush()
    expect(screen.getByLabelText('Verification code')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); await flush()
    expect(screen.queryByLabelText('Verification code')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' })); await flush()
    expect(screen.getByLabelText('Verification code')).toBeVisible()
  })
  it('uses a saved player server address before the desktop default', async () => {
    vi.stubGlobal('electronAPI', { workshopConfig: async () => ({ url: 'https://default.example.com' }) })
    localStorage.setItem('workshop-cloud-url','https://players.example.com')
    const { workshopEndpoint } = await import('../workshop-cloud')
    expect(await workshopEndpoint()).toBe('https://players.example.com')
  })
  it('treats Funnel :10000 and CT 251 as staging, not production or localhost', () => {
    expect(isWorkshopStaging('https://proxmox.stalk-great.ts.net:10000')).toBe(true)
    expect(isWorkshopStaging('https://proxmox.stalk-great.ts.net:8444')).toBe(true)
    expect(isWorkshopStaging('http://192.168.10.251:8787')).toBe(true)
    expect(isWorkshopStaging('https://proxmox.stalk-great.ts.net:8443')).toBe(false)
    expect(isWorkshopStaging('http://192.168.10.250:8787')).toBe(false)
    expect(isWorkshopStaging('http://localhost:8787')).toBe(false)
    expect(isWorkshopStaging('')).toBe(false)
  })
  it('shows a staging banner only when the workshop server is staging', async () => {
    vi.stubGlobal('electronAPI', { workshopConfig: async () => ({ url: 'https://proxmox.stalk-great.ts.net:10000' }) })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })))
    mount(); await flush()
    expect(screen.getByText(/Staging — not production\. Accounts/)).toBeInTheDocument()
    cleanup()
    vi.stubGlobal('electronAPI', { workshopConfig: async () => ({ url: 'https://proxmox.stalk-great.ts.net:8443' }) })
    mount(); await flush()
    expect(screen.queryByText(/Staging — not production/)).toBeNull()
  })
  it('keeps the guest profile and session untouched until the email code is verified', async () => {
    const local=newProfile();addToBag(local,ITEMS[0].id,'present');saveProfile(local)
    const identity={...guest,userId:'00000000-0000-0000-0000-000000000001',crew:'QA'}
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>url.endsWith('/auth/signup')
      ?{verificationRequired:true,requestId:'00000000-0000-0000-0000-000000000002',email:'elf@example.com'}
      :url.endsWith('/auth/verify')?{token:'a'.repeat(64),identity}
      :{profile:local,revision:1,identity}})))
    const api=new CloudApi('http://localhost:8787')
    const challenge=await api.login(true,{email:'elf@example.com',password:'strong-password',crew:'QA',name:'Elf',handle:'snowelf'},local)
    expect(challenge?.email).toBe('elf@example.com')
    expect(storedAccount()).toBeNull()
    expect(loadProfile().bag.map(i=>i.uid)).toEqual(local.bag.map(i=>i.uid))
    await api.verifySignup(challenge!.requestId,'12345678',local)
    expect(storedAccount()?.identity.userId).toBe(identity.userId)
  })
  it('surfaces a session-lost error when the account token is rejected', async () => {
    const identity = { ...guest, userId: '00000000-0000-0000-0000-000000000099', crew: 'QA' }
    sessionStorage.setItem('workshop-account-session', JSON.stringify({ token: 'a'.repeat(64), identity, revision: 1 }))
    localStorage.setItem('workshop-active-account', identity.userId)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in again' }) })))
    await expect(new CloudApi('http://localhost:8787').request('/profile')).rejects.toBeInstanceOf(SessionLostError)
    expect(clearLocalSession()).toBe(true)
    expect(storedAccount()).toBeNull()
  })
  it('clears guest bag UIDs that were imported into a new account so logout cannot re-gift them', async () => {
    const local = newProfile(); const entry = addToBag(local, ITEMS[0].id, 'present')!; saveProfile(local)
    const identity = { ...guest, userId: '00000000-0000-0000-0000-000000000003', crew: 'QA' }
    const accountBag = [...local.bag]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/auth/signup')
        ? { token: 'a'.repeat(64), identity }
        : { profile: { ...local, bag: accountBag }, revision: 1, identity },
    })))
    const api = new CloudApi('http://localhost:8787')
    await api.login(true, { email: 'elf@example.com', password: 'strong-password', crew: 'QA', name: 'Elf', handle: 'snowelf' }, local)
    expect(loadProfile().bag.map((e) => e.uid)).toContain(entry.uid)
    await api.logout(loadProfile())
    expect(loadProfile().bag.map((e) => e.uid)).not.toContain(entry.uid)
    expect(JSON.parse(localStorage.getItem('workshop-guest-profile-v1')!).bag).toEqual([])
  })
  it('removes a database-disabled banner on the next 60-second poll', async () => {
    vi.stubGlobal('electronAPI', { workshopConfig: async () => ({ url: 'http://localhost:8787' }) })
    let enabled = true
    const event = { id: 'announcement', title: 'Owner announcement', body: 'Live from the database', startAt: new Date(Date.now()-1000).toISOString(), endAt: new Date(Date.now()+86400000).toISOString(), enabled: true, kind: 'announcement', metric: 'sends', target: 1, reward: null, crews: null, optIn: false, value: 0, optedIn: false, recipient: null }
    vi.stubGlobal('fetch',vi.fn(async () => ({ ok: true, json: async () => enabled ? [event] : [] })))
    mount(); await flush()
    const socket = FakeSocket.instances.at(-1)!
    act(() => socket.emit({ op: 'joined', room: 'anexya-general', identity: guest }))
    expect(screen.getByText('Owner announcement')).toBeInTheDocument()
    enabled = false
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(screen.queryByText('Owner announcement')).toBeNull()
  })
  it('keeps account progress out of the guest profile after logout or a closed session', async () => {
    const local = newProfile(); addToBag(local,ITEMS[0].id,'present'); saveProfile(local)
    const server = newProfile(); addToBag(server,ITEMS[1].id,'present')
    const identity = { ...guest, userId: '00000000-0000-0000-0000-000000000001', crew: 'VSBL' }
    vi.stubGlobal('fetch',vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/auth/login') ? { token: 'a'.repeat(64), identity } : { profile: server, revision: 1, identity } })))
    const api = new CloudApi('http://localhost:8787')
    await api.login(false,{ email: 'elf@example.com', password: 'password-long', crew: '', name: 'Elf' },local)
    expect(storedAccount()?.identity.userId).toBe(identity.userId)
    expect(loadProfile().bag[0].item).toBe(ITEMS[1].id)
    sessionStorage.clear(); restoreGuestSession()
    expect(loadProfile().bag[0].item).toBe(ITEMS[0].id)
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY)!).bag).toHaveLength(1)
    const offline = loadProfile({ getItem: () => localStorage.getItem(`workshop-account-cache:${identity.userId}`) })
    const pending = addToBag(offline,ITEMS[2].id,'present')!
    localStorage.setItem(`workshop-account-cache:${identity.userId}`,JSON.stringify(offline))
    const request = vi.spyOn(api,'request')
    await api.login(false,{ email: 'elf@example.com', password: 'password-long', crew: '', name: 'Elf' },loadProfile())
    const accountSync = request.mock.calls.find(([path,body]) => path === '/profile' && !!body && !('firstLogin' in (body as object)))
    expect((accountSync?.[1] as { profile: typeof offline }).profile.bag.map(e => e.uid)).toContain(pending.uid)
  })
  it('expires cached events locally when the backend becomes unreachable', async () => {
    vi.stubGlobal('electronAPI', { workshopConfig: async () => ({ url: 'http://localhost:8787' }) })
    const event = { id: 'short-event', title: 'Short event', body: 'Ends soon', startAt: new Date(Date.now()-1000).toISOString(), endAt: new Date(Date.now()+2000).toISOString(), enabled: true, kind: 'announcement', metric: 'sends', target: 1, reward: null, crews: null, optIn: false, value: 0, optedIn: false, recipient: null }
    const fetch = vi.fn(async () => ({ ok: true, json: async () => [event] }))
    vi.stubGlobal('fetch',fetch)
    mount(); await flush()
    act(() => FakeSocket.instances.at(-1)!.emit({ op: 'joined', room: 'anexya-general', identity: guest }))
    expect(screen.getByText('Short event')).toBeInTheDocument()
    fetch.mockRejectedValue(new Error('Offline'))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.queryByText('Short event')).toBeNull()
  })
})
