import { CheckCircle2, Gift, Loader2, Lock, Radio, Server, Smartphone } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ITEM_BY_ID } from '@/lib/workshop-items'
import { RFID_MISSIONS, missionPeriod, missionRewardName, type MissionMetric, type MissionView } from '@/lib/workshop-missions'
import { cn } from '@/lib/utils'
import { GAME_DIALOG, ItemIcon, RarityTag } from './workshop-ui'

const metricIcon:Record<MissionMetric,typeof Radio>={tags:Radio,fixed:Server,handheld:Smartphone}
const metricLabel:Record<MissionMetric,string>={tags:'RFID tags',fixed:'Fixed runs',handheld:'Handheld runs'}
const BUTTON='inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'

function resetLabel(iso:string) {
  const ms=Date.parse(iso)-Date.now()
  if(ms<=0)return 'Refreshing…'
  const hours=Math.ceil(ms/3600000)
  return hours<24?`Resets in ${hours}h`:`Resets in ${Math.ceil(hours/24)}d`
}

export function WorkshopMissions({open,onOpenChange,missions,signedIn,busy,onClaim}:{
  open:boolean;onOpenChange:(open:boolean)=>void;missions:MissionView[];signedIn:boolean;busy:string|null;onClaim:(id:string)=>void
}) {
  const fallback=RFID_MISSIONS.map(mission=>{const period=missionPeriod(mission.cadence);return {...mission,periodKey:period.key,value:0,claimed:false,ready:false,resetAt:period.resetAt}})
  const rows=missions.length?missions:fallback
  const ready=rows.filter(mission=>mission.ready).length
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={cn(GAME_DIALOG,'w-[calc(100vw-1.5rem)] max-w-3xl')}>
    <div className="border-b-2 border-[#1c2840] bg-[#0d1527] px-5 py-4 pr-12">
      <DialogTitle className="flex items-center gap-2 text-base font-black text-white"><Radio className="h-5 w-5 text-emerald-400"/>RFID Mission Board{ready>0&&<span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">{ready} ready</span>}</DialogTitle>
      <DialogDescription className="mt-1 text-xs text-slate-400">Complete real Fixed and Handheld emulator work. Progress counts successful send runs and individual RFID tags transmitted.</DialogDescription>
    </div>
    {!signedIn&&<div className="mx-5 mt-4 flex items-start gap-3 border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100"><Lock className="mt-0.5 h-4 w-4 shrink-0"/><span>Sign in to start mission baselines, sync progress between devices, and claim rewards. Guest RFID activity still drops presents normally.</span></div>}
    <div className="max-h-[65dvh] overflow-y-auto p-5">
      {(['daily','weekly'] as const).map(cadence=><section key={cadence} className="mb-6 last:mb-0">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-300">{cadence} missions</h3><span className="text-[10px] text-slate-500">{resetLabel(rows.find(m=>m.cadence===cadence)?.resetAt??new Date().toISOString())}</span></div>
        <div className="grid gap-2 md:grid-cols-3">{rows.filter(mission=>mission.cadence===cadence).map(mission=><MissionCard key={mission.id} mission={mission} signedIn={signedIn} busy={busy===mission.id} claimLocked={busy!==null} onClaim={onClaim}/>)}</div>
      </section>)}
    </div>
  </DialogContent></Dialog>
}

function MissionCard({mission,signedIn,busy,claimLocked,onClaim}:{mission:MissionView;signedIn:boolean;busy:boolean;claimLocked:boolean;onClaim:(id:string)=>void}) {
  const Icon=metricIcon[mission.metric]
  const item=ITEM_BY_ID.get(mission.rewardItem)
  const percent=Math.min(100,Math.round(mission.value/mission.target*100))
  return <article className={cn('flex min-h-64 flex-col border-2 bg-[#101a2d] p-3',mission.ready?'border-emerald-500/60':mission.claimed?'border-[#263552] opacity-70':'border-[#263552]')}>
    <div className="flex items-start gap-2"><div className="grid h-8 w-8 shrink-0 place-items-center bg-[#16233b]"><Icon className="h-4 w-4 text-cyan-300"/></div><div className="min-w-0"><h4 className="text-xs font-black leading-4 text-white">{mission.title}</h4><span className="text-[10px] text-slate-500">{metricLabel[mission.metric]}</span></div></div>
    <p className="mt-2 text-[11px] leading-4 text-slate-400">{mission.description}</p>
    <div className="mt-3"><div className="mb-1 flex justify-between text-[10px] font-bold tabular-nums text-slate-300"><span>{mission.value}/{mission.target}</span><span>{percent}%</span></div><div className="h-2 bg-[#0a1020]"><div className={cn('h-full transition-[width]',mission.ready||mission.claimed?'bg-emerald-500':'bg-cyan-500')} style={{width:`${percent}%`}}/></div></div>
    <div className="mt-3 flex items-center gap-2 border-t border-[#263552] pt-3">{item&&<div className="grid h-10 w-10 shrink-0 place-items-center bg-[#0b1220]"><ItemIcon item={item} size={32}/></div>}<div className="min-w-0"><p className="truncate text-[10px] text-slate-500">RFID reward</p><p className="truncate text-[11px] font-bold text-white">{missionRewardName(mission)}</p>{item&&<RarityTag rarity={item.rarity}/>}</div></div>
    <div className="mt-auto pt-3">{mission.claimed?<div className="flex h-9 items-center justify-center gap-1.5 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4"/>Claimed</div>:<button type="button" className={cn(BUTTON,'w-full',mission.ready&&'border-emerald-500/60 bg-emerald-500/15 text-emerald-200')} disabled={!signedIn||!mission.ready||claimLocked} onClick={()=>onClaim(mission.id)}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Gift className="h-4 w-4"/>}{mission.ready?'Claim reward':'In progress'}</button>}</div>
  </article>
}
