import { beforeEach, describe, expect, it } from 'vitest'
import { createGame, receive, step } from '../../components/workshop/workshop-engine'
import { newProfile } from '../workshop-profile'

const net = { send: () => {}, sound: false }
beforeEach(() => localStorage.clear())

describe('wing equipment and movement', () => {
  it('grants starter wings once and allows exactly one extra airborne jump', () => {
    const profile=newProfile()
    const game=createGame('home','Elf',0,profile)
    expect(profile.bag.filter(i=>i.item==='leaf-wings')).toHaveLength(1)
    expect(game.self.equip.wings).toBe('leaf-wings')
    createGame('home','Elf',0,profile)
    expect(profile.bag.filter(i=>i.item==='leaf-wings')).toHaveLength(1)
    let now=performance.now()
    game.jumpQueued=true;step(game,1/60,now+=1000/60,true,net)
    expect(game.self.jumpV).toBeGreaterThan(0)
    while(game.self.jumpV>0) step(game,1/60,now+=1000/60,true,net)
    game.jumpQueued=true;step(game,1/60,now+=1000/60,true,net)
    expect(game.self.wingJumped).toBe(true)
    expect(game.self.jumpV).toBeGreaterThan(0)
    const velocity=game.self.jumpV
    game.jumpQueued=true;step(game,1/60,now+=1000/60,true,net)
    expect(game.self.jumpV).toBeLessThan(velocity)
    for(let i=0;i<180;i++) step(game,1/60,now+=1000/60,true,net)
    expect(game.self.lift).toBe(0)
    expect(game.self.wingJumped).toBe(false)
  })
  it('validates remote wings and preserves them across legacy equipment packets', () => {
    const game=createGame('home','Elf',0,newProfile())
    const state={id:'peer0000',t:'state' as const,name:'Peer',hat:0,x:0.5,y:0,dir:1 as const,mv:false}
    receive(game,{...state,seq:1,wg:'angel-wings'},net)
    expect(game.peers.get(state.id)?.equip.wings).toBe('angel-wings')
    receive(game,{...state,seq:2,eq:['','','']},net)
    expect(game.peers.get(state.id)?.equip.wings).toBe('angel-wings')
    receive(game,{...state,seq:3,wg:'santa-hat'},net)
    expect(game.peers.get(state.id)?.equip.wings).toBeNull()
  })
})
