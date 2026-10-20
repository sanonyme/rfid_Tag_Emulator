import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Copy, Heart, Loader2, MessageCircle, Send, Ban, UserPlus, Users, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CloudApi } from '@/lib/workshop-cloud'
import type { Identity } from '@/lib/workshop-cloud-model'
import type { FriendAction, FriendEntry, PrivateMessage } from '@/lib/workshop-social'
import { cn } from '@/lib/utils'

const BUTTON='inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40'
export function WorkshopFriends({open,onOpenChange,identity,online,endpoint,refreshToken,onBadge,onSignIn}:{
  open:boolean;onOpenChange:(open:boolean)=>void;identity:Identity|null;online:boolean;endpoint:string;refreshToken:number
  onBadge:(count:number)=>void;onSignIn:()=>void
}) {
  const [friends,setFriends]=useState<FriendEntry[]>([]),[selected,setSelected]=useState('')
  const [conversation,setConversation]=useState<{peer:string;messages:PrivateMessage[]}>({peer:'',messages:[]})
  const [handle,setHandle]=useState(''),[draft,setDraft]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false)
  const [revision,setRevision]=useState(0)
  const historyRef=useRef<HTMLDivElement>(null)
  const self=identity?.userId
  const active=friends.find(f=>f.userId===selected)
  const canConnect=!!self&&online&&!!endpoint
  useEffect(()=>{setFriends([]);setSelected('');setConversation({peer:'',messages:[]});setNote('');setDraft('')},[self])
  useEffect(()=>{
    if(!canConnect){onBadge(0);return}
    let alive=true,running=false
    const refresh=async()=>{
      if(running)return;running=true
      try{
        const api=new CloudApi(endpoint),next=await api.friends()
        if(!alive)return
        let current=next.find(f=>f.userId===selected&&f.status==='friend')
        if(open&&current){
          const messages=await api.privateHistory(current.userId)
          if(!alive)return
          setConversation({peer:current.userId,messages})
          next.forEach(f=>{if(f.userId===current!.userId)f.unread=0})
        }
        if(!alive)return
        setFriends(next);onBadge(next.reduce((n,f)=>n+f.unread+(f.status==='incoming'?1:0),0))
      }catch(e){if(alive&&open)setNote(e instanceof Error?e.message:'Friends are temporarily unavailable')}
      finally{running=false}
    }
    void refresh();const timer=window.setInterval(()=>void refresh(),10000)
    return()=>{alive=false;window.clearInterval(timer)}
  },[self,canConnect,endpoint,open,selected,refreshToken,revision,onBadge])
  const messages=conversation.peer===selected?conversation.messages:[]
  useEffect(()=>{const el=historyRef.current;if(el)el.scrollTop=el.scrollHeight},[messages.length,messages[messages.length-1]?.id,selected])
  const action=async(kind:FriendAction,target:string)=>{
    if(busy)return
    setBusy(true);setNote('')
    try{await new CloudApi(endpoint).friendAction(kind,target);setRevision(n=>n+1);if(kind==='request'){setHandle('');setNote('Friend request sent. They can accept it in their Friends window.')}}
    catch(e){setNote(e instanceof Error?e.message:'Could not update friendship')}
    finally{setBusy(false)}
  }
  const send=async(e:FormEvent)=>{
    e.preventDefault();if(!draft.trim()||!active||busy)return
    const target=active.userId
    setBusy(true);setNote('')
    try{await new CloudApi(endpoint).privateMessage(target,draft);setDraft('');setRevision(n=>n+1)}
    catch(e){setNote(e instanceof Error?e.message:'Message could not be sent')}
    finally{setBusy(false)}
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88dvh] w-[calc(100vw-2rem)] max-w-[780px] gap-0 overflow-y-auto rounded-2xl p-0">
      <DialogHeader className="border-b bg-emerald-500/5 px-5 py-5 pr-12">
        <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600"/>Friends & messages</DialogTitle>
        <DialogDescription>{self?'Messages are encrypted with your account. Sign in on any device to read the same conversation.':'Sign in to find friends and keep your conversations.'}</DialogDescription>
        {identity?.handle&&<button type="button" className="flex w-fit items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300" onClick={async()=>{try{await navigator.clipboard.writeText('@'+identity.handle);setNote('Handle copied.')}catch{setNote('@'+identity.handle)}}}><span>@{identity.handle}</span><Copy className="h-3 w-3"/></button>}
      </DialogHeader>
      {!canConnect?<div className="space-y-3 px-6 py-12 text-center"><Heart className="mx-auto h-9 w-9 text-rose-300"/><p className="text-sm text-muted-foreground">{self?'Open General or a crew room to connect with your friends.':'Create a verified account to add friends and send private messages.'}</p>{!self&&<button className={cn(BUTTON,'bg-emerald-700 text-white')} onClick={()=>{onOpenChange(false);onSignIn()}}>Sign in / create account</button>}</div>:
      <div className="grid sm:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 sm:border-b-0 sm:border-r">
          <form className="space-y-2 border-b p-4" onSubmit={e=>{e.preventDefault();void action('request',handle)}}>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="workshop-friend-handle">Find a friend</label>
            <div className="flex gap-1.5"><input id="workshop-friend-handle" aria-label="Friend handle" value={handle} onChange={e=>setHandle(e.target.value)} maxLength={41} placeholder="@their_handle" required className="h-9 min-w-0 flex-1 rounded-xl border bg-background px-2.5 text-xs outline-none focus:border-emerald-500"/><button aria-label="Send friend request" disabled={busy||!handle.trim()} className={cn(BUTTON,'w-9 shrink-0 bg-emerald-700 px-0 text-white')}><UserPlus className="h-4 w-4"/></button></div>
          </form>
          <div className="max-h-44 overflow-y-auto p-2 sm:max-h-[410px]">
            {friends.length===0&&<div className="space-y-2 px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground"><Heart className="mx-auto h-6 w-6 text-rose-300"/>Share your @handle or add someone to start your friends list.</div>}
            {friends.map(f=><button key={f.userId} aria-label={`${f.name} @${f.handle} ${f.status}`} onClick={()=>{setSelected(f.userId);setDraft('');setNote('')}} className={cn('mb-1 flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors hover:bg-emerald-500/5',selected===f.userId&&'bg-emerald-500/10')}>
              <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300">{f.name[0]?.toUpperCase()||'E'}{f.status==='friend'&&<i className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background',f.online?'bg-emerald-500':'bg-slate-300')}/>}</span>
              <span className="min-w-0 flex-1"><b className="block truncate text-xs">{f.name}</b><span className="block truncate text-[10px] text-muted-foreground">{f.status==='incoming'?'Wants to be friends':f.status==='outgoing'?'Request sent':f.status==='blocked'?'Blocked':'@'+f.handle}</span></span>
              {f.unread>0&&<span className="rounded-full bg-emerald-700 px-1.5 text-[10px] leading-5 text-white">{f.unread}</span>}
              {f.status==='incoming'&&<span className="h-2 w-2 rounded-full bg-rose-400"/>}
            </button>)}
          </div>
        </aside>
        <section className="flex min-h-[360px] min-w-0 flex-col sm:h-[480px]">
          {!active?<div className="grid flex-1 place-items-center p-8 text-center"><div><MessageCircle className="mx-auto mb-4 h-10 w-10 text-emerald-500/40"/><p className="font-semibold">Good conversations belong here.</p><p className="mt-2 max-w-64 text-xs leading-relaxed text-muted-foreground">Choose a friend to say hello. Messages stay private between the two accounts, even across rooms.</p></div></div>:<>
            <div className="flex items-center gap-3 border-b px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{active.name}</p><p className="truncate text-[11px] text-muted-foreground">@{active.handle} · {active.status==='friend'?(active.online?'Online':'Offline · messages will wait'):active.crew}</p></div>
              {active.status==='friend'&&<details className="relative text-xs"><summary className="list-none cursor-pointer rounded-lg p-2 text-muted-foreground [&::-webkit-details-marker]:hidden" aria-label="Friend options">•••</summary><div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border bg-popover p-1 shadow-lg"><button disabled={busy} className={cn(BUTTON,'w-full justify-start')} onClick={()=>void action('remove',active.handle)}>Remove friend</button><button disabled={busy} className={cn(BUTTON,'w-full justify-start text-red-600')} onClick={()=>void action('block',active.handle)}><Ban className="h-3.5 w-3.5"/>Block player</button></div></details>}
            </div>
            {active.status==='incoming'?<div className="grid flex-1 place-items-center p-6 text-center"><div><Heart className="mx-auto mb-3 h-8 w-8 text-rose-400"/><p className="text-sm">{active.name} wants to be friends.</p><div className="mt-4 flex justify-center gap-2"><button disabled={busy} className={cn(BUTTON,'bg-emerald-700 text-white')} onClick={()=>void action('accept',active.handle)}><Check className="h-4 w-4"/>Accept</button><button disabled={busy} className={cn(BUTTON,'border')} onClick={()=>void action('decline',active.handle)}><X className="h-4 w-4"/>Decline</button></div><button disabled={busy} className="mt-5 text-xs text-muted-foreground underline" onClick={()=>void action('block',active.handle)}>Block this player</button></div></div>:
            active.status==='outgoing'?<div className="grid flex-1 place-items-center p-6 text-center"><div><p className="text-sm">Your request is on its way.</p><p className="mt-2 text-xs text-muted-foreground">You can chat after they accept.</p><button disabled={busy} className={cn(BUTTON,'mt-4 border')} onClick={()=>void action('decline',active.handle)}>Cancel request</button></div></div>:
            active.status==='blocked'?<div className="grid flex-1 place-items-center p-6 text-center"><div><Ban className="mx-auto mb-3 h-8 w-8 text-muted-foreground"/><p className="text-sm">This player is blocked.</p><button disabled={busy} className={cn(BUTTON,'mt-4 border')} onClick={()=>void action('unblock',active.handle)}>Unblock</button></div></div>:<>
              <div ref={historyRef} role="log" aria-label="Private conversation" className="max-h-[300px] flex-1 space-y-3 overflow-y-auto bg-emerald-500/[0.025] p-4 sm:max-h-none">
                {messages.length===0&&<p className="py-10 text-center text-xs text-muted-foreground">A fresh conversation. Say something kind.</p>}
                {messages.map(m=><div key={m.id} className={cn('flex',m.from===self?'justify-end':'justify-start')}><div className={cn('max-w-[88%] rounded-2xl px-3 py-2',m.from===self?'rounded-br-sm bg-emerald-700 text-white':'rounded-bl-sm border bg-background')}><p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{m.text}</p><time className={cn('mt-1 block text-right text-[9px]',m.from===self?'text-emerald-100/70':'text-muted-foreground')}>{new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></div></div>)}
              </div>
              <form onSubmit={send} className="border-t p-3"><div className="flex items-end gap-2"><textarea aria-label="Private message" rows={2} maxLength={1000} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit()}}} placeholder={`Message @${active.handle}…`} className="min-h-16 min-w-0 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-xs outline-none focus:border-emerald-500"/><button aria-label="Send private message" disabled={busy||!draft.trim()} className={cn(BUTTON,'h-10 w-10 shrink-0 bg-emerald-700 px-0 text-white')}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}</button></div><p className="mt-2 text-[10px] text-muted-foreground">Encrypted with your account · readable wherever you sign in · last 50 messages · Enter to send</p></form>
            </>}
          </>}
        </section>
      </div>}
      {note&&<p role="status" className="border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground">{note}</p>}
    </DialogContent>
  </Dialog>
}
