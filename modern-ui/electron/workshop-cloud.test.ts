// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import { migrate, type Database } from '../workshop-server/database'
import { createWorkshopServer } from '../workshop-server/server'
import { addToBag, newProfile } from '../src/lib/workshop-profile'
import { ITEMS } from '../src/lib/workshop-items'
import type { ServerNotice } from '../src/lib/workshop-cloud-model'

const local = new PGlite()
const wrap = (q: typeof local): Database => ({ query: (sql, params) => q.query(sql, params),
  transaction: fn => q.transaction(tx => fn(wrap(tx as unknown as typeof local))), close: () => local.close() })
const db = wrap(local)
const emailCodes = new Map<string,string>()
let emailFailure = false
const app = createWorkshopServer(db, undefined, async ({email,code}) => {
  if (emailFailure) throw new Error('Test delivery failed')
  emailCodes.set(email,code)
})
let base: string
const sockets: WebSocket[] = []
async function api(path: string, body?: unknown, token?: string) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, data: await response.json() }
}
async function account(crew: string, name: string) {
  const email = `${randomUUID()}@example.com`
  const response = await api('/auth/signup', { email, password: 'a strong password', crew, name })
  expect(response.status).toBe(200)
  expect(response.data.verificationRequired).toBe(true)
  return await app.service.verifySignup({requestId:response.data.requestId,code:emailCodes.get(email)}) as { token: string; identity: { userId: string } }
}
async function windowClient(id: string, token: string | null = null) {
  const ws = new WebSocket(base.replace('http','ws') + '/socket', { origin: 'file://' })
  sockets.push(ws)
  const messages: ServerNotice[] = []
  ws.on('message', data => messages.push(JSON.parse(data.toString())))
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  const send = (v: unknown) => ws.send(JSON.stringify(v))
  const next = async (test: (n: ServerNotice) => boolean) => {
    const started = Date.now()
    while (Date.now()-started < 5000) {
      const index = messages.findIndex(test)
      if (index !== -1) return messages.splice(index,1)[0]
      await new Promise(resolve => setTimeout(resolve,10))
    }
    throw new Error(`Notice timed out; received ${JSON.stringify(messages)}`)
  }
  send({ op: 'hello', session: id, device: id.toUpperCase(), name: id, token })
  return { ws, send, next, messages }
}
beforeAll(async () => {
  await migrate(db)
  await new Promise<void>(resolve => app.server.listen(0,'127.0.0.1',resolve))
  const address = app.server.address() as { port: number }
  base = `http://127.0.0.1:${address.port}`
},30000)
afterAll(async () => { sockets.forEach(ws => ws.terminate()); await app.close(); await db.close() })

describe('Workshop database and real socket clients', () => {
  it('assigns permanent unique handles and supports consent-based friends and offline private conversations', async () => {
    const make=async()=>{
      const email=`${randomUUID()}@example.com`
      const pending=await app.service.auth({email,password:'strong-password',crew:'QA',name:'Snow Elf'},true) as {requestId:string}
      return app.service.verifySignup({requestId:pending.requestId,code:emailCodes.get(email)})
    }
    const a=await make(),b=await make(),outsider=await make()
    const aSocket=await windowClient('socialaa',a.token),bSocket=await windowClient('socialbb',b.token),outsiderSocket=await windowClient('socialcc',outsider.token)
    for(const client of [aSocket,bSocket,outsiderSocket]){client.send({op:'join',room:'anexya-general'});await client.next(n=>n.op==='joined')}
    expect(a.identity.handle).toMatch(/^snowelf_\d+$/)
    expect(a.identity.handle).not.toBe(b.identity.handle)
    expect((await api('/friends')).status).toBe(401)
    expect((await api('/friends',{action:'request',handle:'@'+b.identity.handle},a.token)).status).toBe(200)
    await aSocket.next(n=>n.op==='social');await bSocket.next(n=>n.op==='social')
    expect(outsiderSocket.messages.some(n=>n.op==='social')).toBe(false)
    const incoming=await api('/friends',undefined,b.token)
    expect(incoming.data).toEqual([expect.objectContaining({handle:a.identity.handle,status:'incoming'})])
    expect(incoming.data[0]).not.toHaveProperty('email')
    expect((await api('/friends',{action:'accept',handle:b.identity.handle},a.token)).status).toBe(400)
    expect((await api('/friends/messages',{to:b.identity.userId,text:'Not accepted yet'},a.token)).status).toBe(403)
    expect((await api('/friends',{action:'accept',handle:a.identity.handle},b.token)).status).toBe(200)
    const sent=await api('/friends/messages',{to:b.identity.userId,text:'Meet by the campfire?\nI brought cocoa.'},a.token)
    expect(sent.status).toBe(200)
    expect(outsiderSocket.messages.some(n=>n.op==='dm'||JSON.stringify(n).includes('I brought cocoa'))).toBe(false)
    expect((await api('/friends',undefined,b.token)).data[0].unread).toBe(1)
    expect((await api(`/friends/messages?to=${a.identity.userId}`,undefined,outsider.token)).status).toBe(403)
    const history=await api(`/friends/messages?to=${a.identity.userId}`,undefined,b.token)
    expect(history.data[0].text).toBe('Meet by the campfire?\nI brought cocoa.')
    expect((await api('/friends',undefined,b.token)).data[0].unread).toBe(0)
    const snapshot=await app.service.profile(a.identity.userId!)
    await app.service.sync(a.identity.userId!,{profile:snapshot.profile,revision:snapshot.revision,name:'New display name'})
    expect((await app.service.identity(a.identity.userId!)).handle).toBe(a.identity.handle)
    await migrate(db)
    expect((await app.service.identity(a.identity.userId!)).handle).toBe(a.identity.handle)
    for(let n=0;n<51;n++)await app.social.message(a.identity.userId!,{to:b.identity.userId,text:`Cozy message ${n}`})
    expect((await app.social.history(b.identity.userId!,a.identity.userId)).map(m=>m.text)).toHaveLength(50)
    expect((await api('/friends',{action:'block',handle:a.identity.handle},b.token)).status).toBe(200)
    expect((await api('/friends/messages',{to:b.identity.userId,text:'Blocked'},a.token)).status).toBe(403)
    expect((await api(`/friends/messages?to=${b.identity.userId}`,undefined,a.token)).status).toBe(403)
    expect((await api('/friends',{action:'request',handle:b.identity.handle},a.token)).status).toBe(403)
    await app.social.action(b.identity.userId!,{action:'unblock',handle:a.identity.handle})
    expect(await app.social.friends(a.identity.userId!)).toEqual([])
    await expect(app.social.message(a.identity.userId!,{to:b.identity.userId,text:'Still not friends'})).rejects.toThrow('Accept')
    await app.service.logout(a.token)
    expect((await api('/friends',undefined,a.token)).status).toBe(401)
    for(const client of [aSocket,bSocket,outsiderSocket])client.ws.close()
  },15000)
  it('creates no account or session before email verification, then consumes the code exactly once', async () => {
    const email=`${randomUUID()}@example.com`
    const pending=await app.service.auth({email,password:'strong-password',crew:'QA',name:'Verified'},true)
    expect(pending).toHaveProperty('verificationRequired',true)
    expect(pending).not.toHaveProperty('token')
    expect((await db.query('SELECT id FROM users WHERE email=$1',[email])).rows).toHaveLength(0)
    const requestId=(pending as {requestId:string}).requestId
    const verified=await api('/auth/verify',{requestId,code:emailCodes.get(email)})
    expect(verified.status).toBe(200)
    expect(verified.data.token).toMatch(/^[a-f0-9]{64}$/)
    expect((await db.query('SELECT email_verified_at FROM users WHERE email=$1',[email])).rows[0].email_verified_at).toBeTruthy()
    await expect(app.service.verifySignup({requestId,code:emailCodes.get(email)})).rejects.toThrow('expired')
  })
  it('limits attempts and resends, expires codes, and refuses signup on delivery failure', async () => {
    const email=`${randomUUID()}@example.com`, fields={email,password:'strong-password',crew:'UI',name:'Check'}
    const pending=await app.service.auth(fields,true) as {requestId:string}
    await expect(app.service.auth(fields,true)).rejects.toThrow('wait')
    const wrong=emailCodes.get(email)==='00000000'?'11111111':'00000000'
    for(let n=0;n<5;n++) await expect(app.service.verifySignup({requestId:pending.requestId,code:wrong})).rejects.toThrow('incorrect')
    await expect(app.service.verifySignup({requestId:pending.requestId,code:emailCodes.get(email)})).rejects.toThrow('Too many')
    await db.query("UPDATE signup_verifications SET sent_at=now()-interval '2 minutes' WHERE email=$1",[email])
    const fresh=await app.service.auth(fields,true) as {requestId:string}
    expect(fresh.requestId).not.toBe(pending.requestId)
    await expect(app.service.verifySignup({requestId:pending.requestId,code:emailCodes.get(email)})).rejects.toThrow('expired')
    await db.query("UPDATE signup_verifications SET expires_at=now()-interval '1 second' WHERE email=$1",[email])
    await expect(app.service.verifySignup({requestId:fresh.requestId,code:emailCodes.get(email)})).rejects.toThrow('expired')
    emailFailure=true
    const failedEmail=`${randomUUID()}@example.com`
    try { await expect(app.service.auth({...fields,email:failedEmail},true)).rejects.toThrow('could not be sent') }
    finally { emailFailure=false }
    expect((await db.query('SELECT id FROM users WHERE email=$1',[failedEmail])).rows).toHaveLength(0)
    expect((await db.query('SELECT id FROM signup_verifications WHERE email=$1',[failedEmail])).rows).toHaveLength(0)
  })
  it('enforces one King per crew, account-only Kings, and first-login merge exactly once', async () => {
    const a = await account('VSBL','King'), b = await account('VSBL','Other')
    await db.query('INSERT INTO kings(user_id,crew) VALUES($1,$2)', [a.identity.userId,'VSBL'])
    await expect(db.query('INSERT INTO kings(user_id,crew) VALUES($1,$2)', [b.identity.userId,'VSBL'])).rejects.toThrow()
    await expect(db.query('INSERT INTO kings(user_id,crew) VALUES($1,$2)', ['guest','EDGE'])).rejects.toThrow()
    await expect(db.query('INSERT INTO kings(user_id,crew) VALUES($1,$2)', [b.identity.userId,'EDGE'])).rejects.toThrow()
    const p = newProfile(); addToBag(p, ITEMS[0].id, 'present')
    const first = await api('/profile', { firstLogin: true, profile: p, crew: 'EDGE', titles: ['King'] }, a.token)
    expect(first.status).toBe(200)
    const uid = first.data.profile.bag[0].uid
    addToBag(p, ITEMS[1].id, 'present')
    const again = await api('/profile', { firstLogin: true, profile: p }, a.token)
    expect(again.data.profile.bag.map((e: { uid: string }) => e.uid)).toEqual([uid])
    expect(again.data.identity.crew).toBe('VSBL')
    expect(again.data.identity.titles).toEqual([])
    const king = await app.service.identity(a.identity.userId), member = await app.service.identity(b.identity.userId)
    const subject = `user:${member.userId}`
    await app.service.moderate(king,'vsbl',subject,'kick')
    expect(await app.service.allowed(member,'vsbl',subject)).toBe(false)
    await app.service.moderate(king,'vsbl',subject,'deny')
    expect(await app.service.allowed(member,'vsbl',subject)).toBe(false)
    await app.service.moderate(king,'vsbl',subject,'allow')
    expect(await app.service.allowed(member,'vsbl',subject)).toBe(true)
    await db.query('DELETE FROM kings WHERE user_id=$1',[a.identity.userId])
  })

  it('shares General, keeps a knocker invisible, allows, reconnects and kicks to General', async () => {
    const owner = await account('VSBL','King'), visitor = await account('EDGE','Visitor')
    await db.query('INSERT INTO kings(user_id,crew) VALUES($1,$2)', [owner.identity.userId,'VSBL'])
    const king = await windowClient('kingaaaa',owner.token), edge = await windowClient('edgeaaaa',visitor.token), guest = await windowClient('guestaaa')
    for (const c of [king,edge,guest]) { c.send({ op: 'join', room: 'anexya-general' }); await c.next(n => n.op === 'joined') }
    const directory = await guest.next(n => n.op === 'directory' && n.counts['anexya-general'] === 3)
    expect(directory.op).toBe('directory')
    guest.send({ op: 'packet', message: { id: 'guestaaa', seq: 1, t: 'state', name: 'Guest', hat: 0, x: 0.5, y: 0, dir: 1, mv: false, tree: { guestaaa: 3 } } })
    await king.next(n => n.op === 'packet' && n.message.t === 'state' && n.message.id === 'guestaaa')
    edge.send({ op: 'join', room: 'anexya-general' })
    const joined = await edge.next(n => n.op === 'joined')
    expect(joined.op === 'joined' && joined.tree.guestaaa).toBe(3)
    king.send({ op: 'join', room: 'vsbl' }); await king.next(n => n.op === 'joined' && n.room === 'vsbl')
    edge.send({ op: 'join', room: 'vsbl' }); await edge.next(n => n.op === 'waiting' && n.status === 'knock')
    edge.send({ op: 'packet', message: { id: 'edgeaaaa', seq: 1, t: 'chat', text: 'Cannot leak' } })
    edge.send({ op: 'knock' }); await edge.next(n => n.op === 'waiting' && n.status === 'pending')
    await king.next(n => n.op === 'knocks' && n.entries.length === 1)
    expect(king.messages.some(n => n.op === 'packet' && n.message.id === 'edgeaaaa' && n.message.t !== 'bye')).toBe(false)
    expect(king.messages.some(n => n.op === 'directory' && n.players.some(p => p.id === 'edgeaaaa' && p.room === 'vsbl'))).toBe(false)
    king.send({ op: 'moderate', subject: `user:${visitor.identity.userId}`, action: 'deny' })
    await edge.next(n => n.op === 'waiting' && n.status === 'denied')
    edge.send({ op: 'knock' }); await edge.next(n => n.op === 'waiting' && n.status === 'pending')
    king.send({ op: 'moderate', subject: `user:${visitor.identity.userId}`, action: 'allow' })
    await edge.next(n => n.op === 'joined' && n.room === 'vsbl')
    edge.ws.close(); await new Promise(resolve => edge.ws.once('close',resolve))
    const reconnected = await windowClient('edgeaaab',visitor.token)
    reconnected.send({ op: 'join', room: 'vsbl' }); await reconnected.next(n => n.op === 'joined' && n.room === 'vsbl')
    king.send({ op: 'moderate', subject: `user:${visitor.identity.userId}`, action: 'kick' })
    await reconnected.next(n => n.op === 'joined' && n.room === 'anexya-general')
    reconnected.send({ op: 'join', room: 'vsbl' }); await reconnected.next(n => n.op === 'waiting')
    for (const c of [king,reconnected,guest]) c.ws.close()
    await db.query('DELETE FROM kings WHERE user_id=$1',[owner.identity.userId])
  })

  it('keeps guest DMs ephemeral, routes across rooms, and retains exactly 50 account DMs', async () => {
    const a = await account('QA','Alice'), b = await account('UI','Bob')
    const alice = await windowClient('aliceaaa',a.token), bob = await windowClient('bobbbbbb',b.token), guest = await windowClient('guestbbb')
    for (const [c,room] of [[alice,'qa'],[bob,'ui'],[guest,'anexya-general']] as const) { c.send({ op: 'join', room }); await c.next(n => n.op === 'joined') }
    guest.send({ op: 'dm', to: 'aliceaaa', text: 'Ephemeral' }); await alice.next(n => n.op === 'dm')
    expect((await db.query("SELECT * FROM messages WHERE text='Ephemeral'")).rows).toHaveLength(0)
    for (let i = 0; i < 51; i++) { alice.send({ op: 'dm', to: 'bobbbbbb', text: `Private ${i}` }); await bob.next(n => n.op === 'dm') }
    expect((await db.query('SELECT * FROM messages WHERE from_id=$1',[a.identity.userId])).rows).toHaveLength(50)
    expect(guest.messages.some(n => n.op === 'dm' && n.message.text.startsWith('Private'))).toBe(false)
    alice.ws.close(); bob.ws.close(); guest.ws.close()
  },15000)

  it('runs database events, pairs same-crew accounts, gives rewards once, and closes without a build', async () => {
    const a = await account('CNCT','Santa'), b = await account('CNCT','Recipient')
    const id = 'secret-santa'
    await db.query("INSERT INTO live_events(id,title,start_at,end_at,enabled,kind,metric,target,reward,opt_in,pairing) VALUES($1,'Secret Santa',now()-interval '1 hour',now()+interval '7 days',true,'opt-in','given',1,$2,true,'same-crew')", [id,JSON.stringify({ item: ITEMS[0].id })])
    expect((await api(`/events/${id}/join`,{},a.token)).data[0].recipient).toBe(null)
    await api(`/events/${id}/join`,{},b.token)
    expect((await api('/events',undefined,a.token)).data[0].recipient).toBe('Recipient')
    const snapshot = (await api('/profile',undefined,a.token)).data
    snapshot.profile.stats.given++
    await api('/profile', { profile: snapshot.profile, revision: snapshot.revision },a.token)
    const rewarded = (await api('/profile',undefined,a.token)).data
    expect(rewarded.profile.bag).toHaveLength(1)
    await api('/events',undefined,a.token); expect((await api('/profile',undefined,a.token)).data.profile.bag).toHaveLength(1)
    await db.query('UPDATE live_events SET enabled=false,end_at=now() WHERE id=$1',[id])
    expect((await api('/events',undefined,a.token)).data).toEqual([])
    expect((await api(`/events/${id}/join`,{},a.token)).status).toBe(400)
  })

  it('lets only administrators manage visual bags and event definitions', async () => {
    const admin=await account('UI','Workshop Admin'),player=await account('QA','Bag Owner')
    await db.query('UPDATE users SET is_admin=true WHERE id=$1',[admin.identity.userId])
    expect((await api('/admin/events',undefined,player.token)).status).toBe(403)

    const wearable=ITEMS.find(entry=>entry.kind==='wings')!
    const item=wearable.id
    expect((await api('/admin/bag',{user:player.identity.userId,action:'add',item,amount:2},admin.token)).status).toBe(200)
    let snapshot=(await api('/profile',undefined,player.token)).data
    expect(snapshot.profile.bag.filter((entry:{item:string})=>entry.item===item)).toHaveLength(2)
    snapshot.profile.equipped.wings=item
    snapshot=(await api('/profile',{profile:snapshot.profile,revision:snapshot.revision},player.token)).data
    const staleRemovedEntries=[...snapshot.profile.bag]
    expect((await api('/admin/bag',{user:player.identity.userId,action:'remove',item,amount:2},admin.token)).status).toBe(200)
    snapshot=(await api('/profile',undefined,player.token)).data
    expect(snapshot.profile.bag.filter((entry:{item:string})=>entry.item===item)).toHaveLength(0)
    expect(Object.values(snapshot.profile.equipped)).not.toContain(item)
    snapshot.profile.bag=staleRemovedEntries
    snapshot=(await api('/profile',{profile:snapshot.profile,revision:snapshot.revision},player.token)).data
    expect(snapshot.profile.bag.filter((entry:{item:string})=>entry.item===item)).toHaveLength(0)

    const event={id:'admin-created',title:'Made in the admin UI',body:'No SQL required.',startAt:new Date(Date.now()-1000).toISOString(),
      endAt:new Date(Date.now()+3600000).toISOString(),enabled:true,kind:'challenge',metric:'opened',target:2,
      reward:{item},crews:['QA'],optIn:false}
    const created=await api('/admin/events',{event},admin.token)
    expect(created.status).toBe(200)
    expect(created.data).toEqual(expect.arrayContaining([expect.objectContaining({id:event.id,title:event.title,crews:['QA']})]))
    expect((await api('/admin/events',{event:{...event,reward:{item:'not-an-item'}}},admin.token)).status).toBe(400)

    await api('/events',undefined,player.token)
    expect((await db.query('SELECT event_id FROM event_progress WHERE event_id=$1',[event.id])).rows).toHaveLength(1)
    await api('/admin/events',{event:{...event,target:3,resetProgress:true}},admin.token)
    expect((await db.query('SELECT event_id FROM event_progress WHERE event_id=$1',[event.id])).rows).toHaveLength(0)
    expect((await api('/admin/events',{action:'delete',id:event.id},admin.token)).status).toBe(200)
    expect((await db.query('SELECT id FROM live_events WHERE id=$1',[event.id])).rows).toHaveLength(0)
  })
})
