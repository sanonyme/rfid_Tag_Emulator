import { describe,expect,it } from 'vitest'
import { ITEM_BY_ID } from '../workshop-items'
import { RFID_MISSIONS,missionPeriod,parseMissionView } from '../workshop-missions'

describe('RFID Workshop missions',()=>{
  it('uses UTC day and Monday-based UTC week boundaries',()=>{
    expect(missionPeriod('daily',new Date('2026-10-17T23:59:00Z'))).toEqual({key:'2026-10-17',resetAt:'2026-10-18T00:00:00.000Z'})
    expect(missionPeriod('weekly',new Date('2026-10-18T23:59:00Z'))).toEqual({key:'2026-10-12',resetAt:'2026-10-19T00:00:00.000Z'})
    expect(missionPeriod('weekly',new Date('2026-10-19T00:00:00Z'))).toEqual({key:'2026-10-19',resetAt:'2026-10-26T00:00:00.000Z'})
  })

  it('defines RFID-only tag, Fixed, and Handheld goals',()=>{
    expect(RFID_MISSIONS).toHaveLength(6)
    expect(new Set(RFID_MISSIONS.map(mission=>mission.metric))).toEqual(new Set(['tags','fixed','handheld']))
    expect(RFID_MISSIONS.every(mission=>mission.target>0&&ITEM_BY_ID.has(mission.rewardItem))).toBe(true)
  })

  it('rebuilds mission views from known definitions and caps displayed progress',()=>{
    expect(parseMissionView({id:'daily-tag-throughput',periodKey:'2026-10-17',value:999,claimed:false,resetAt:'2026-10-18T00:00:00.000Z'})).toMatchObject({value:50,ready:true})
    expect(parseMissionView({id:'unknown',periodKey:'2026-10-17',value:1,resetAt:'2026-10-18T00:00:00.000Z'})).toBeNull()
  })
})
