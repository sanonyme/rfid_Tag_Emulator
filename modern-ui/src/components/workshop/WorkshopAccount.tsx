import { useEffect, useState, type FormEvent } from 'react'
import { Check, ChevronRight, Copy, Loader2, LogOut, Mail, Server, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CloudApi, isWorkshopStaging, workshopEndpoint, type VerificationChallenge } from '@/lib/workshop-cloud'
import { CREWS, type Identity } from '@/lib/workshop-cloud-model'
import { normalizeHandle } from '@/lib/workshop-social'
import type { WorkshopProfile } from '@/lib/workshop-profile'
import { cn } from '@/lib/utils'
import { WorkshopAdmin } from './WorkshopAdmin'

const FIELD = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15'
const BUTTON = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export function WorkshopAccount({ open, onOpenChange, identity, online, endpoint, name, profile, onPrepare, onAccountChanged, onEndpoint, onGuestCrewChange }: {
  open: boolean; onOpenChange: (open: boolean) => void; identity: Identity | null
  online: boolean; endpoint: string; name: string; profile: WorkshopProfile
  onPrepare: () => void; onAccountChanged: () => void; onEndpoint: (url: string) => void; onGuestCrewChange: () => void
}) {
  const [signup, setSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [handle, setHandle] = useState('')
  const [handleStatus, setHandleStatus] = useState<HandleStatus>('idle')
  const [handleNote, setHandleNote] = useState('')
  const [crew, setCrew] = useState<string>(CREWS[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [server, setServer] = useState<string | null>(null)
  const [verification, setVerification] = useState<VerificationChallenge | null>(null)
  const [code, setCode] = useState('')
  const [adminOpen, setAdminOpen] = useState(false)

  useEffect(() => {
    if (!signup || verification) { setHandleStatus('idle'); setHandleNote(''); return }
    const normalized = normalizeHandle(handle)
    if (!handle.trim()) { setHandleStatus('idle'); setHandleNote(''); return }
    if (!normalized) {
      setHandleStatus('invalid')
      setHandleNote('3–40 characters, start with a letter, letters/numbers/underscores only.')
      return
    }
    if (!endpoint || !online) {
      setHandleStatus('idle')
      setHandleNote('Connect to a Workshop server to check availability.')
      return
    }
    let cancelled = false
    setHandleStatus('checking')
    setHandleNote('Checking availability…')
    const timer = window.setTimeout(() => {
      void new CloudApi(endpoint).handleAvailable(normalized, email).then((result) => {
        if (cancelled) return
        setHandleStatus(result.available ? 'available' : 'taken')
        setHandleNote(result.available ? `@${result.handle} is available.` : (result.reason ?? 'That username is taken.'))
      }).catch((error) => {
        if (cancelled) return
        setHandleStatus('idle')
        setHandleNote(error instanceof Error ? error.message : 'Could not check username')
      })
    }, 400)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [handle, email, signup, verification, endpoint, online])

  const authenticate = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setNote('')
    try {
      onPrepare()
      const api = new CloudApi(endpoint)
      if (verification && signup) await api.verifySignup(verification.requestId, code, profile)
      else {
        const normalized = signup ? normalizeHandle(handle) : null
        if (signup && !normalized) throw new Error('Choose a username: 3–40 characters, start with a letter, letters/numbers/underscores only.')
        if (signup && handleStatus === 'taken') throw new Error(handleNote || 'That username is taken. Try another.')
        const next = await api.login(signup, { email, password, crew, name, ...(normalized ? { handle: normalized } : {}) }, profile)
        if (next) { setVerification(next); setSignup(true); setCode(''); setNote('Code sent. Your account will be created after verification.'); return }
      }
      setVerification(null); setCode('')
      setPassword(''); onAccountChanged()
    } catch (e) { setNote(e instanceof Error ? e.message : 'Sign in failed') }
    finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl p-6" onCloseAutoFocus={e => e.preventDefault()}>
      <DialogHeader className="pr-6">
        <DialogTitle>{identity?.userId ? 'Your Workshop account' : 'Welcome to the Workshop'}</DialogTitle>
        <DialogDescription>{identity?.userId ? 'Your collection travels with you.' : 'Play freely as a guest. Sign in whenever you want to sync your collection.'}</DialogDescription>
      </DialogHeader>
      {identity?.userId ? <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <div className="min-w-0"><p className="font-semibold">{identity.name}</p>{identity.handle&&<p className="break-all font-mono text-xs text-emerald-700 dark:text-emerald-300">@{identity.handle}</p>}<p className="text-sm text-muted-foreground">{identity.crew}{identity.king ? ` · King ${identity.king}` : ''}</p></div>
          <Check className="ml-auto h-4 w-4 text-emerald-600" />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Your crew and granted titles are managed by the game owner.</p>
        {identity.handle&&<button type="button" className={cn(BUTTON,'w-full border hover:bg-accent')} onClick={async()=>{
          try{await navigator.clipboard.writeText('@'+identity.handle);setNote('Handle copied. Share it so friends can find you.')}catch{setNote('Your handle is @'+identity.handle)}
        }}><Copy className="h-4 w-4"/>Copy my handle</button>}
        {identity.isAdmin && <button type="button" className={cn(BUTTON,'w-full border border-amber-500/50 text-amber-700 hover:bg-amber-500/10')} onClick={()=>setAdminOpen(true)}><ShieldCheck className="h-4 w-4"/>Admin tools</button>}
        <button type="button" className={cn(BUTTON, 'w-full border hover:bg-accent')} disabled={busy} onClick={async () => {
          setBusy(true)
          try { onPrepare(); await new CloudApi(endpoint).logout(profile); onAccountChanged() }
          catch (e) { setNote(String(e)) } finally { setBusy(false) }
        }}><LogOut className="h-4 w-4"/>Log out</button>
        <p className="text-xs text-muted-foreground">Logging out returns to your guest collection. Your account and friends stay saved.</p>
      </div> : <>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          <button type="button" aria-pressed={!signup} className={cn(BUTTON, 'h-9', !signup && 'bg-background shadow-sm')} onClick={() => { setSignup(false); setNote('') }}>Sign in</button>
          <button type="button" aria-pressed={signup} className={cn(BUTTON, 'h-9', signup && 'bg-background shadow-sm')} onClick={() => { setSignup(true); setNote('') }}>Create account</button>
        </div>
        <form onSubmit={authenticate} className="space-y-4">
          {verification && signup ? <div className="space-y-3 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-4">
            <Mail className="h-6 w-6 text-cyan-600" /><p className="text-sm font-semibold">Check your inbox</p>
            <p className="text-xs leading-relaxed text-muted-foreground">We sent an eight-digit code to <strong>{verification.email}</strong>. Enter it below within 10 minutes to create your account{normalizeHandle(handle) ? <> as <strong>@{normalizeHandle(handle)}</strong></> : null}.</p>
            <label className="block space-y-1.5 text-xs font-medium"><span>Verification code</span><input autoFocus className={cn(FIELD,'text-center font-mono text-xl tracking-[0.25em]')} aria-label="Verification code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))} required /></label>
            <button type="button" disabled={busy} className="text-xs font-medium text-primary underline underline-offset-4 disabled:opacity-50" onClick={async () => {
              if (Date.now()<verification.resendAfter) { setNote('Please wait one minute before resending.'); return }
              setBusy(true); setNote('')
              try {
                const normalized = normalizeHandle(handle)
                if (!normalized) throw new Error('Choose a username before requesting another code.')
                const next=await new CloudApi(endpoint).login(true,{email,password,crew,name,handle:normalized},profile)
                if (next) { setVerification(next); setCode(''); setNote('A fresh code was sent. Only the newest code works.') }
              } catch(e) { setNote(e instanceof Error?e.message:'Could not resend code') } finally { setBusy(false) }
            }}>Resend code</button>
            <button type="button" className="ml-4 text-xs text-muted-foreground underline underline-offset-4" onClick={() => { setVerification(null); setCode(''); setNote('') }}>Change email</button>
          </div> : <>
          <label className="block space-y-1.5 text-xs font-medium"><span>Email</span><input className={FIELD} type="email" autoComplete="username" aria-label="Email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label className="block space-y-1.5 text-xs font-medium"><span>Password</span><input className={FIELD} type="password" minLength={10} maxLength={256} autoComplete={signup ? 'new-password' : 'current-password'} aria-label="Password" placeholder="At least 10 characters" value={password} onChange={e => setPassword(e.target.value)} required /></label>
          {signup && <label className="block space-y-1.5 text-xs font-medium"><span>Username</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">@</span>
              <input className={cn(FIELD, 'pl-7 font-mono lowercase')} aria-label="Username" autoComplete="nickname" spellCheck={false} maxLength={40} placeholder="your_handle" value={handle} onChange={e => setHandle(e.target.value.replace(/[^a-zA-Z0-9_@]/g, '').replace(/^@+/, ''))} required />
            </div>
            <span className={cn('block font-normal', handleStatus === 'available' && 'text-emerald-700 dark:text-emerald-300', (handleStatus === 'taken' || handleStatus === 'invalid') && 'text-amber-700 dark:text-amber-300', (handleStatus === 'idle' || handleStatus === 'checking') && 'text-muted-foreground')}>
              {handleStatus === 'checking' ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />{handleNote}</span> : handleNote || 'Friends will find you with this @handle. Choose carefully — it stays with the account.'}
            </span>
          </label>}
          {signup && <label className="block space-y-1.5 text-xs font-medium"><span>Your crew</span><select className={FIELD} aria-label="Signup crew" value={crew} onChange={e => setCrew(e.target.value)}>{CREWS.map(c => <option key={c}>{c}</option>)}</select><span className="block font-normal text-muted-foreground">Choose once. The game owner can change this later.</span></label>}
          {signup && <p className="text-xs leading-relaxed text-muted-foreground">We’ll email you a verification code before creating the account.</p>}
          </>}
          {!online && <p className="text-xs text-muted-foreground">Home stays on this device. Switch to General to sign in.</p>}
          <button className={cn(BUTTON, 'w-full bg-primary text-primary-foreground hover:bg-primary/90')} type="submit" disabled={busy || !online || (signup && !verification && (handleStatus === 'taken' || handleStatus === 'invalid' || handleStatus === 'checking'))}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}{busy ? 'Connecting…' : verification ? 'Verify email & create account' : signup ? 'Send verification code' : 'Sign in'}</button>
        </form>
        <div className="space-y-3 border-t pt-4">
          <button className={cn(BUTTON, 'w-full border hover:bg-accent')} type="button" onClick={() => onOpenChange(false)}>Continue as guest</button>
          <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Guest crew <span className="block text-[11px]">Only saved on this device</span></span><select className="h-9 max-w-[160px] rounded-lg border bg-background px-2 text-xs text-foreground" aria-label="Guest crew" defaultValue={localStorage.getItem('workshop-guest-crew') ?? ''} onChange={e => { localStorage.setItem('workshop-guest-crew',e.target.value); onGuestCrewChange() }}><option value="">Unaffiliated</option>{CREWS.map(c => <option key={c}>{c}</option>)}</select></label>
        </div>
      </>}
      {note && <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">{note}</p>}
      {identity?.isAdmin && <WorkshopAdmin open={adminOpen} onOpenChange={setAdminOpen} endpoint={endpoint} identity={identity} />}
      {online && <details className="border-t pt-3" open={!endpoint || undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground"><Server className="h-3.5 w-3.5" />Workshop server<span className="ml-auto text-[11px]">{!endpoint ? 'Not connected' : isWorkshopStaging(endpoint) ? 'Staging' : 'Configured'}</span></summary>
        <div className="mt-3 space-y-2">
          {isWorkshopStaging(endpoint) && <p role="status" className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-amber-950">Staging — not production.</p>}
          <p className="text-xs leading-relaxed text-muted-foreground">Everyone should use the same server address. Without a server, you can still play solo.</p>
          <input className={FIELD} aria-label="Workshop server URL" placeholder="https://workshop.yourcompany.com" value={server ?? endpoint} onChange={e => setServer(e.target.value)} />
          <button className={cn(BUTTON, 'w-full border hover:bg-accent')} type="button" onClick={async () => {
            const previous = localStorage.getItem('workshop-cloud-url')
            try {
              localStorage.setItem('workshop-cloud-url',(server ?? endpoint).trim())
              const url = await workshopEndpoint(); onEndpoint(url); setNote(url ? 'Server address saved.' : 'Playing solo on this device.')
            } catch (e) {
              if (previous === null) localStorage.removeItem('workshop-cloud-url'); else localStorage.setItem('workshop-cloud-url',previous)
              setNote(e instanceof Error ? e.message : 'Invalid server address')
            }
          }}>Save server address</button>
        </div>
      </details>}
    </DialogContent>
  </Dialog>
}
