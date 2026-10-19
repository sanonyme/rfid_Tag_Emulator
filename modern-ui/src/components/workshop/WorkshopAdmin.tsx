import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Backpack, CalendarDays, ChevronLeft, ChevronRight, Loader2, PackagePlus, Pencil, Search, ShieldCheck, Trash2, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CloudApi, type WorkshopAdminUser } from '@/lib/workshop-cloud'
import { CREWS, METRICS, parseCloudProfile, type Identity, type LiveEvent, type Metric } from '@/lib/workshop-cloud-model'
import { ACHIEVEMENTS, bagStacks } from '@/lib/workshop-profile'
import { ITEMS, RARITY_INFO } from '@/lib/workshop-items'
import { cn } from '@/lib/utils'
import { ItemIcon, RarityTag } from './workshop-ui'

const FIELD='h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15'
const BUTTON='inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY=cn(BUTTON,'border-primary bg-primary text-primary-foreground hover:bg-primary/90')
type Panel='people'|'events'

const pad=(n:number)=>String(n).padStart(2,'0')
function localInput(iso:string){const d=new Date(iso);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
function futureIso(hours:number){return new Date(Date.now()+hours*3600000).toISOString()}
function newEvent():LiveEvent{return{id:'',title:'',body:'',startAt:futureIso(0),endAt:futureIso(24),enabled:false,kind:'challenge',metric:'sends',target:1,reward:null,crews:null,optIn:false}}
const titleRewards=[...new Set([...ACHIEVEMENTS.map(a=>a.title),...ITEMS.flatMap(item=>item.titleText?[item.titleText]:[])])].sort()

export function WorkshopAdmin({open,onOpenChange,endpoint,identity}:{open:boolean;onOpenChange:(v:boolean)=>void;endpoint:string;identity:Identity}) {
  const [panel,setPanel]=useState<Panel>('people')
  const [query,setQuery]=useState('')
  const [users,setUsers]=useState<WorkshopAdminUser[]>([])
  const [selected,setSelected]=useState<WorkshopAdminUser|null>(null)
  const [events,setEvents]=useState<LiveEvent[]>([])
  const [busy,setBusy]=useState(false)
  const [note,setNote]=useState('')
  const [wizard,setWizard]=useState<{draft:LiveEvent;editing:boolean}|null>(null)
  const api=()=>new CloudApi(endpoint)

  const search=async()=>{setBusy(true);setNote('');try{const found=await api().adminUsers(query);setUsers(found);if(selected){const fresh=found.find(u=>u.id===selected.id);if(fresh)setSelected(fresh)}}catch(e){setNote(e instanceof Error?e.message:'Admin request failed')}finally{setBusy(false)}}
  const loadEvents=async()=>{setBusy(true);setNote('');try{setEvents(await api().adminEvents())}catch(e){setNote(e instanceof Error?e.message:'Could not load events')}finally{setBusy(false)}}
  useEffect(()=>{if(!open)return;void search();void loadEvents()},[open]) // eslint-disable-line react-hooks/exhaustive-deps

  const replaceUser=(fresh:WorkshopAdminUser[])=>{const next=fresh.find(u=>u.id===selected?.id)??fresh[0];if(!next)return;setSelected(next);setUsers(old=>old.map(u=>u.id===next.id?next:u))}
  const changeBag=async(action:'add'|'remove',item:string,amount:number)=>{if(!selected||!item||amount<1)return;setBusy(true);setNote('');try{replaceUser(await api().adminBag(selected.id,action,item,amount));setNote(`${action==='add'?'Added':'Removed'} ${amount} × ${ITEMS.find(i=>i.id===item)?.name??item}.`)}catch(e){setNote(e instanceof Error?e.message:'Bag update failed')}finally{setBusy(false)}}

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-6xl overflow-y-auto rounded-2xl p-0">
    <DialogHeader className="border-b px-6 pb-4 pt-6 pr-14"><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600"/>Workshop admin</DialogTitle><DialogDescription>Signed in as @{identity.handle}. Manage account bags and run Workshop events without SQL.</DialogDescription></DialogHeader>
    <div className="flex border-b px-4 pt-2">
      <button className={cn('flex h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium',panel==='people'?'border-primary text-foreground':'border-transparent text-muted-foreground')} onClick={()=>{setPanel('people');setWizard(null)}}><Users className="h-4 w-4"/>Players & bags</button>
      <button className={cn('flex h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium',panel==='events'?'border-primary text-foreground':'border-transparent text-muted-foreground')} onClick={()=>{setPanel('events');setWizard(null)}}><CalendarDays className="h-4 w-4"/>Events</button>
    </div>
    <div className="min-h-[560px] p-5">
      {panel==='people'?<PeoplePanel query={query} setQuery={setQuery} users={users} selected={selected} setSelected={setSelected} busy={busy} onSearch={search} onBagChange={changeBag}/>:wizard?<EventWizard state={wizard} busy={busy} onCancel={()=>setWizard(null)} onSave={async(draft,reset)=>{setBusy(true);setNote('');try{setEvents(await api().adminSaveEvent(draft,reset));setWizard(null);setNote(`Event “${draft.title}” saved.`)}catch(e){setNote(e instanceof Error?e.message:'Could not save event')}finally{setBusy(false)}}}/>:<EventsPanel events={events} busy={busy} onCreate={()=>setWizard({draft:newEvent(),editing:false})} onEdit={event=>setWizard({draft:{...event,reward:event.reward?{...event.reward}:null,crews:event.crews?[...event.crews]:null},editing:true})} onToggle={async event=>{setBusy(true);setNote('');try{setEvents(await api().adminSaveEvent({...event,enabled:!event.enabled}));setNote(`${event.title} ${event.enabled?'disabled':'enabled'}.`)}catch(e){setNote(e instanceof Error?e.message:'Could not update event')}finally{setBusy(false)}}} onDelete={async id=>{setBusy(true);setNote('');try{setEvents(await api().adminDeleteEvent(id));setNote('Event deleted.')}catch(e){setNote(e instanceof Error?e.message:'Could not delete event')}finally{setBusy(false)}}}/>} 
      {note&&<p role="status" className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">{note}</p>}
    </div>
  </DialogContent></Dialog>
}

function PeoplePanel({query,setQuery,users,selected,setSelected,busy,onSearch,onBagChange}:{query:string;setQuery:(v:string)=>void;users:WorkshopAdminUser[];selected:WorkshopAdminUser|null;setSelected:(v:WorkshopAdminUser)=>void;busy:boolean;onSearch:()=>Promise<void>;onBagChange:(action:'add'|'remove',item:string,amount:number)=>Promise<void>}){
  return <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
    <aside className="space-y-3"><div className="flex gap-2"><input aria-label="Search players" className={FIELD} placeholder="Handle, email, or name" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void onSearch()}}/><button aria-label="Search" className={BUTTON} disabled={busy} onClick={()=>void onSearch()}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Search className="h-4 w-4"/>}</button></div>
      <div className="max-h-[470px] space-y-1 overflow-y-auto rounded-xl border bg-muted/20 p-2">{users.length?users.map(u=><button key={u.id} className={cn('w-full rounded-lg border border-transparent p-3 text-left text-sm hover:bg-background',selected?.id===u.id&&'border-primary bg-background shadow-sm')} onClick={()=>setSelected(u)}><strong>{u.display_name}</strong><span className="ml-1 text-muted-foreground">@{u.handle}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{u.email}</span><span className="text-[11px] text-muted-foreground">{u.crew} · {parseCloudProfile(u.data).bag.length} items</span></button>):<p className="p-4 text-center text-xs text-muted-foreground">No accounts found.</p>}</div>
    </aside>
    {selected?<PlayerBag user={selected} busy={busy} onBagChange={onBagChange}/>:<div className="grid min-h-96 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground"><div className="text-center"><Backpack className="mx-auto mb-2 h-8 w-8"/>Select a player to open their bag.</div></div>}
  </div>
}

function PlayerBag({user,busy,onBagChange}:{user:WorkshopAdminUser;busy:boolean;onBagChange:(action:'add'|'remove',item:string,amount:number)=>Promise<void>}){
  const profile=useMemo(()=>parseCloudProfile(user.data),[user])
  const stacks=useMemo(()=>bagStacks(profile),[profile])
  const [selectedItem,setSelectedItem]=useState<string|null>(null)
  const [amount,setAmount]=useState(1)
  const [addItem,setAddItem]=useState(ITEMS[0]?.id??'')
  const [addAmount,setAddAmount]=useState(1)
  useEffect(()=>{setSelectedItem(null);setAmount(1)},[user.id])
  const current=stacks.find(s=>s.item.id===selectedItem)??null
  const removeQty=current?Math.min(amount,current.entries.length):0
  return <section className="overflow-hidden rounded-xl border">
    <header className="border-b bg-muted/20 px-4 py-3">
      <h3 className="font-semibold">{user.display_name}’s bag</h3>
      <p className="text-xs text-muted-foreground">@{user.handle} · {profile.bag.length} total items · click a stack to manage it</p>
    </header>
    <div className="grid min-h-[390px] lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="max-h-[440px] overflow-y-auto p-3">
        {stacks.length?<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {stacks.map(stack=>{
            const active=current?.item.id===stack.item.id
            const rarity=RARITY_INFO[stack.item.rarity]
            return <button key={stack.item.id} type="button" title={stack.item.name} onClick={()=>{setSelectedItem(stack.item.id);setAmount(1)}}
              className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border bg-background/60 p-2.5 text-left transition-colors hover:bg-accent',active&&'border-primary bg-primary/5 ring-2 ring-primary/15')}>
              <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-lg" style={{background:`${rarity.color}18`}}>
                <ItemIcon item={stack.item} size={44}/>
                <span className="absolute -bottom-1 -right-1 rounded-md bg-background px-1.5 text-[10px] font-bold tabular-nums shadow ring-1 ring-border">×{stack.entries.length}</span>
              </div>
              <p className="mt-2 truncate text-center text-[11px] font-semibold leading-tight">{stack.item.name}</p>
              <p className="mt-0.5 truncate text-center text-[10px] font-bold uppercase tracking-wide" style={{color:rarity.color}}>{rarity.label}</p>
            </button>
          })}
        </div>:<div className="grid h-full min-h-48 place-items-center text-sm text-muted-foreground">This bag is empty.</div>}
      </div>
      <aside className="space-y-4 border-t bg-muted/15 p-4 lg:border-l lg:border-t-0">
        {current?<div className="space-y-4">
          <div className="text-center">
            <ItemIcon item={current.item} size={72} className="mx-auto"/>
            <h4 className="mt-2 text-sm font-semibold leading-snug">{current.item.name}</h4>
            <div className="mt-1 flex items-center justify-center gap-2"><RarityTag rarity={current.item.rarity}/><span className="text-xs text-muted-foreground">{current.entries.length} in stack</span></div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium">Remove quantity</p>
            <div className="grid grid-cols-4 gap-1">{[1,2,5].map(n=><button key={n} type="button" disabled={n>current.entries.length} className={cn(BUTTON,'h-8 px-2 text-xs',amount===n&&'border-primary bg-primary/5')} onClick={()=>setAmount(n)}>{n}</button>)}
              <button type="button" className={cn(BUTTON,'h-8 px-2 text-xs',amount===current.entries.length&&'border-primary bg-primary/5')} onClick={()=>setAmount(current.entries.length)}>All</button>
            </div>
            <input aria-label="Custom removal quantity" className={cn(FIELD,'mt-2')} type="number" min={1} max={current.entries.length} value={amount} onChange={e=>setAmount(Math.max(1,Math.min(current.entries.length,Number(e.target.value)||1)))}/>
          </div>
          <button type="button" className={cn(BUTTON,'w-full border-destructive/40 text-destructive hover:bg-destructive/10')} disabled={busy} onClick={()=>void onBagChange('remove',current.item.id,removeQty)}>
            <Trash2 className="h-4 w-4"/>Remove {removeQty===current.entries.length?'entire stack':`${removeQty} item${removeQty===1?'':'s'}`}
          </button>
        </div>:<p className="text-center text-xs text-muted-foreground">Select a stack from the bag to remove items.</p>}
        <div className="space-y-2 border-t pt-4">
          <p className="flex items-center gap-2 text-xs font-semibold"><PackagePlus className="h-4 w-4"/>Add items</p>
          <select aria-label="Item to add" className={FIELD} value={addItem} onChange={e=>setAddItem(e.target.value)}>{ITEMS.map(item=><option key={item.id} value={item.id}>{item.name} · {RARITY_INFO[item.rarity].label}</option>)}</select>
          <div className="flex gap-2"><input aria-label="Amount to add" className={FIELD} type="number" min={1} max={1000} value={addAmount} onChange={e=>setAddAmount(Math.max(1,Math.min(1000,Number(e.target.value)||1)))}/><button type="button" className={PRIMARY} disabled={busy} onClick={()=>void onBagChange('add',addItem,addAmount)}>Add</button></div>
        </div>
      </aside>
    </div>
  </section>
}

function EventsPanel({events,busy,onCreate,onEdit,onToggle,onDelete}:{events:LiveEvent[];busy:boolean;onCreate:()=>void;onEdit:(e:LiveEvent)=>void;onToggle:(e:LiveEvent)=>Promise<void>;onDelete:(id:string)=>Promise<void>}){
  const [confirm,setConfirm]=useState<string|null>(null)
  const now=Date.now()
  return <div><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Workshop events</h3><p className="text-xs text-muted-foreground">Create announcements, challenges, opt-ins, rewards, crew targeting, and schedules.</p></div><button className={PRIMARY} onClick={onCreate}><CalendarDays className="h-4 w-4"/>Create event</button></div>
    <div className="space-y-3">{events.length?events.map(event=>{const start=Date.parse(event.startAt),end=Date.parse(event.endAt);const status=!event.enabled?'Disabled':now<start?'Scheduled':now>=end?'Ended':'Live';return <article key={event.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{event.title}</h4><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',status==='Live'?'bg-emerald-500/15 text-emerald-700':status==='Scheduled'?'bg-blue-500/15 text-blue-700':'bg-muted text-muted-foreground')}>{status}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{event.kind}</span></div><p className="mt-1 text-sm text-muted-foreground">{event.body||'No description'}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(event.startAt).toLocaleString()} → {new Date(event.endAt).toLocaleString()} · {event.crews?.join(', ')||'All crews'}{event.kind!=='announcement'?` · ${event.target} ${event.metric}`:''}</p>{event.reward&&<p className="mt-1 text-xs text-muted-foreground">Reward: {[event.reward.item&&ITEMS.find(i=>i.id===event.reward!.item)?.name,event.reward.title].filter(Boolean).join(' + ')}</p>}</div><div className="flex flex-wrap gap-2"><button className={BUTTON} disabled={busy} onClick={()=>void onToggle(event)}>{event.enabled?'Disable':'Enable'}</button><button aria-label={`Edit ${event.title}`} className={BUTTON} onClick={()=>onEdit(event)}><Pencil className="h-4 w-4"/></button>{confirm===event.id?<><button className={cn(BUTTON,'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90')} disabled={busy} onClick={()=>void onDelete(event.id)}>Confirm delete</button><button className={BUTTON} onClick={()=>setConfirm(null)}>Cancel</button></>:<button aria-label={`Delete ${event.title}`} className={cn(BUTTON,'text-destructive')} onClick={()=>setConfirm(event.id)}><Trash2 className="h-4 w-4"/></button>}</div></div></article>}):<div className="grid min-h-72 place-items-center rounded-xl border border-dashed text-center text-sm text-muted-foreground"><div><CalendarDays className="mx-auto mb-2 h-8 w-8"/>No events yet. Create the first one with the guided wizard.</div></div>}</div>
  </div>
}

function EventWizard({state,busy,onCancel,onSave}:{state:{draft:LiveEvent;editing:boolean};busy:boolean;onCancel:()=>void;onSave:(event:LiveEvent,reset:boolean)=>Promise<void>}){
  const [draft,setDraft]=useState(state.draft)
  const [step,setStep]=useState(0)
  const [reset,setReset]=useState(false)
  const set=<K extends keyof LiveEvent>(key:K,value:LiveEvent[K])=>setDraft(old=>({...old,[key]:value}))
  const errors=[!draft.id||!/^[a-zA-Z0-9_-]{1,80}$/.test(draft.id)||draft.title.trim().length<2,!Number.isFinite(Date.parse(draft.startAt))||Date.parse(draft.endAt)<=Date.parse(draft.startAt),draft.kind!=='announcement'&&(!Number.isInteger(draft.target)||draft.target<1),false]
  const steps=['Basics','Schedule & audience','Goal & rewards','Review']
  const next=()=>{if(!errors[step])setStep(n=>Math.min(3,n+1))}
  return <div><button className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={onCancel}><ChevronLeft className="h-4 w-4"/>Back to events</button><div className="mx-auto max-w-3xl"><div className="mb-6"><h3 className="text-lg font-semibold">{state.editing?'Edit event':'Create an event'}</h3><p className="text-sm text-muted-foreground">Step {step+1} of 4 · {steps[step]}</p><div className="mt-3 grid grid-cols-4 gap-2">{steps.map((name,i)=><button key={name} className={cn('h-2 rounded-full',i<=step?'bg-primary':'bg-muted')} aria-label={`Go to ${name}`} onClick={()=>{if(i<step)setStep(i)}}/>)}</div></div>
    {step===0&&<div className="space-y-4 rounded-xl border p-5"><Field label="Event ID" hint="Stable identifier; letters, numbers, underscores, and hyphens."><input disabled={state.editing} className={FIELD} value={draft.id} placeholder="winter-challenge-2026" onChange={e=>set('id',e.target.value.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80))}/></Field><Field label="Title"><input className={FIELD} maxLength={100} value={draft.title} onChange={e=>set('title',e.target.value)}/></Field><Field label="Description"><textarea className="min-h-28 w-full resize-y rounded-lg border bg-background p-3 text-sm outline-none focus:border-primary" maxLength={1000} value={draft.body} onChange={e=>set('body',e.target.value)}/><span className="text-[11px] text-muted-foreground">{draft.body.length}/1000</span></Field><Field label="Event type"><div className="grid gap-2 sm:grid-cols-3">{(['announcement','challenge','opt-in'] as const).map(kind=><button key={kind} className={cn(BUTTON,'h-auto min-h-16 flex-col capitalize',draft.kind===kind&&'border-primary bg-primary/5')} onClick={()=>setDraft(old=>({...old,kind,optIn:kind==='opt-in',...(kind==='announcement'?{reward:null,metric:'sends' as Metric,target:1,pairing:undefined}:{})}))}><b>{kind}</b><span className="text-[10px] font-normal text-muted-foreground">{kind==='announcement'?'Message only':kind==='challenge'?'Automatic progress':'Players choose to join'}</span></button>)}</div></Field>{errors[0]&&<p className="text-xs text-destructive">Enter a valid ID and a title of at least two characters.</p>}</div>}
    {step===1&&<div className="space-y-4 rounded-xl border p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Starts"><input className={FIELD} type="datetime-local" value={localInput(draft.startAt)} onChange={e=>{const d=new Date(e.target.value);if(Number.isFinite(d.getTime()))set('startAt',d.toISOString())}}/></Field><Field label="Ends"><input className={FIELD} type="datetime-local" value={localInput(draft.endAt)} onChange={e=>{const d=new Date(e.target.value);if(Number.isFinite(d.getTime()))set('endAt',d.toISOString())}}/></Field></div><Field label="Audience" hint="No crew selected means everyone."><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{CREWS.map(crew=>{const checked=draft.crews?.includes(crew)??false;return <label key={crew} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs',checked&&'border-primary bg-primary/5')}><input type="checkbox" checked={checked} onChange={()=>{const next=checked?(draft.crews??[]).filter(c=>c!==crew):[...(draft.crews??[]),crew];set('crews',next.length?next:null)}}/>{crew}</label>})}</div></Field><label className="flex items-center justify-between rounded-lg border p-4"><span><b className="block text-sm">Enabled</b><span className="text-xs text-muted-foreground">Enabled events appear only during their scheduled window.</span></span><input type="checkbox" className="h-5 w-5" checked={draft.enabled} onChange={e=>set('enabled',e.target.checked)}/></label>{errors[1]&&<p className="text-xs text-destructive">The end time must be after the start time.</p>}</div>}
    {step===2&&<div className="space-y-4 rounded-xl border p-5">{draft.kind==='announcement'?<div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Announcements have no progress goal or reward. The message is shown to the selected crews during the scheduled window.</div>:<><div className="grid gap-4 sm:grid-cols-2"><Field label="Progress metric"><select className={FIELD} value={draft.metric} onChange={e=>set('metric',e.target.value as Metric)}>{METRICS.map(metric=><option key={metric} value={metric}>{metric[0].toUpperCase()+metric.slice(1)}</option>)}</select></Field><Field label="Target"><input className={FIELD} type="number" min={1} max={10000000} value={draft.target} onChange={e=>set('target',Math.max(1,Math.min(10000000,Number(e.target.value)||1)))}/></Field></div><label className="flex items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={draft.optIn} disabled={draft.kind==='opt-in'} onChange={e=>set('optIn',e.target.checked)}/>Require players to join before progress begins</label><div className="grid gap-4 sm:grid-cols-2"><Field label="Item reward" hint="Optional; granted once when the target is reached."><select className={FIELD} value={draft.reward?.item??''} onChange={e=>set('reward',e.target.value?{...(draft.reward??{}),item:e.target.value}:{...(draft.reward??{}),item:undefined})}><option value="">No item</option>{ITEMS.map(item=><option key={item.id} value={item.id}>{item.name} · {RARITY_INFO[item.rarity].label}</option>)}</select></Field><Field label="Title reward" hint="Optional; can be combined with an item."><select className={FIELD} value={draft.reward?.title??''} onChange={e=>set('reward',e.target.value?{...(draft.reward??{}),title:e.target.value}:{...(draft.reward??{}),title:undefined})}><option value="">No title</option>{titleRewards.map(title=><option key={title}>{title}</option>)}</select></Field></div></>}{errors[2]&&<p className="text-xs text-destructive">Choose a target of at least one.</p>}</div>}
    {step===3&&<div className="space-y-4 rounded-xl border p-5"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p><h4 className="mt-1 text-xl font-semibold">{draft.title}</h4><p className="mt-1 text-sm text-muted-foreground">{draft.body||'No description'}</p></div><dl className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2"><Summary label="Type" value={draft.kind}/><Summary label="Status" value={draft.enabled?'Enabled':'Disabled'}/><Summary label="Window" value={`${new Date(draft.startAt).toLocaleString()} → ${new Date(draft.endAt).toLocaleString()}`}/><Summary label="Audience" value={draft.crews?.join(', ')||'All crews'}/>{draft.kind!=='announcement'&&<><Summary label="Goal" value={`${draft.target} ${draft.metric}`}/><Summary label="Participation" value={draft.optIn?'Opt-in':'Automatic'}/><Summary label="Reward" value={[draft.reward?.item&&ITEMS.find(i=>i.id===draft.reward?.item)?.name,draft.reward?.title].filter(Boolean).join(' + ')||'None'}/></>}</dl>{state.editing&&<label className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><input type="checkbox" checked={reset} onChange={e=>setReset(e.target.checked)}/><span><b className="block">Reset participant progress</b><span className="text-xs text-muted-foreground">Use this when the metric or target changed and everyone should start over. Existing rewards are not removed from bags.</span></span></label>}</div>}
    <div className="mt-5 flex justify-between"><button className={BUTTON} disabled={step===0||busy} onClick={()=>setStep(n=>Math.max(0,n-1))}><ChevronLeft className="h-4 w-4"/>Previous</button>{step<3?<button className={PRIMARY} disabled={errors[step]} onClick={next}>Continue<ChevronRight className="h-4 w-4"/></button>:<button className={PRIMARY} disabled={busy||errors.some(Boolean)} onClick={()=>void onSave({...draft,reward:draft.reward&&Object.values(draft.reward).some(Boolean)?draft.reward:null},reset)}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:null}Save event</button>}</div>
    </div></div>
}

function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){return <label className="block space-y-1.5 text-xs font-medium"><span>{label}</span>{children}{hint&&<span className="block font-normal text-muted-foreground">{hint}</span>}</label>}
function Summary({label,value}:{label:string;value:string}){return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 capitalize">{value}</dd></div>}
