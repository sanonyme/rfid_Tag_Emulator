import { ITEM_BY_ID } from './workshop-items'
import type { WorkshopProfile } from './workshop-profile'

export const MISSION_CADENCES = ['daily','weekly'] as const
export type MissionCadence = typeof MISSION_CADENCES[number]
export const MISSION_METRICS = ['tags','fixed','handheld'] as const
export type MissionMetric = typeof MISSION_METRICS[number]

export type MissionDefinition = {
  id: string
  cadence: MissionCadence
  title: string
  description: string
  metric: MissionMetric
  target: number
  rewardItem: string
}

export type MissionView = MissionDefinition & {
  periodKey: string
  value: number
  claimed: boolean
  ready: boolean
  resetAt: string
}

/** RFID-first missions: real tag throughput and reader runs, not passive game clicks. */
export const RFID_MISSIONS: readonly MissionDefinition[] = [
  { id:'daily-tag-throughput',cadence:'daily',title:'Tag Throughput Check',description:'Transmit 50 RFID tags from Fixed or Handheld emulation.',metric:'tags',target:50,rewardItem:'paper-label' },
  { id:'daily-fixed-commissioning',cadence:'daily',title:'Fixed Reader Commissioning',description:'Complete 3 successful Fixed reader send runs.',metric:'fixed',target:3,rewardItem:'label-roll' },
  { id:'daily-handheld-cycle',cadence:'daily',title:'Handheld Cycle Count',description:'Complete 2 successful Handheld send runs.',metric:'handheld',target:2,rewardItem:'scanner-sled' },
  { id:'weekly-epc-marathon',cadence:'weekly',title:'EPC Marathon',description:'Transmit 500 RFID tags during the UTC week.',metric:'tags',target:500,rewardItem:'rfid-tabletop' },
  { id:'weekly-fixed-validation',cadence:'weekly',title:'Fixed Validation Sprint',description:'Complete 15 Fixed reader send runs during the UTC week.',metric:'fixed',target:15,rewardItem:'fixed-reader' },
  { id:'weekly-mobile-inventory',cadence:'weekly',title:'Mobile Inventory Sweep',description:'Complete 10 Handheld send runs during the UTC week.',metric:'handheld',target:10,rewardItem:'elf-handheld' },
] as const

export const MISSION_BY_ID: ReadonlyMap<string,MissionDefinition> = new Map(RFID_MISSIONS.map(mission=>[mission.id,mission]))

export function missionMetricValue(profile:WorkshopProfile,metric:MissionMetric):number {
  return profile.stats[metric]
}

const dateKey=(date:Date)=>date.toISOString().slice(0,10)
export function missionPeriod(cadence:MissionCadence,at=new Date()):{key:string;resetAt:string} {
  const cursor=new Date(at)
  if(cadence==='daily') {
    const reset=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth(),cursor.getUTCDate()+1))
    return {key:dateKey(cursor),resetAt:reset.toISOString()}
  }
  const day=(cursor.getUTCDay()+6)%7
  const monday=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth(),cursor.getUTCDate()-day))
  const reset=new Date(monday.getTime()+7*86400000)
  return {key:dateKey(monday),resetAt:reset.toISOString()}
}

export function parseMissionView(raw:unknown):MissionView|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
  const value=raw as Record<string,unknown>
  const definition=typeof value.id==='string'?MISSION_BY_ID.get(value.id):undefined
  if(!definition||typeof value.periodKey!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.periodKey)
    ||typeof value.value!=='number'||!Number.isInteger(value.value)||value.value<0
    ||typeof value.resetAt!=='string'||!Number.isFinite(Date.parse(value.resetAt)))return null
  return {...definition,periodKey:value.periodKey,value:Math.min(definition.target,value.value),claimed:value.claimed===true,
    ready:value.claimed!==true&&value.value>=definition.target,resetAt:value.resetAt}
}

export function missionRewardName(mission:MissionDefinition):string {
  return ITEM_BY_ID.get(mission.rewardItem)?.name??mission.rewardItem
}
