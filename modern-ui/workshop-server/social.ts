import { randomUUID } from 'node:crypto'
import type { Database } from './database'
import { RequestError } from './service'
import { isAccountId, isHandle, storedPrivateText, type FriendAction, type FriendEntry, type PrivateMessage } from '../src/lib/workshop-social'
import { record } from '../src/lib/workshop-cloud-model'
import { isE2ePublicJwk, type E2ePublicJwk } from '../src/lib/workshop-e2e'

const pair=(a:string,b:string)=>[a,b].sort()
export class WorkshopSocial {
  constructor(private db:Database) {}
  private async lock(db:Database,a:string,b:string) {
    await db.query('SELECT id FROM users WHERE id IN ($1,$2) ORDER BY id FOR UPDATE',[a,b])
  }
  async permitted(a:string,b:string,db=this.db,requireFriend=false) {
    const {rows:blocks}=await db.query('SELECT 1 FROM user_blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)',[a,b])
    if(blocks.length)throw new RequestError('This conversation is unavailable',403)
    if(requireFriend){
      const [first,second]=pair(a,b)
      const {rows}=await db.query("SELECT 1 FROM friend_links WHERE user_a=$1 AND user_b=$2 AND status='accepted'",[first,second])
      if(!rows.length)throw new RequestError('Accept the friend request before opening a private conversation',403)
    }
  }
  async friends(userId:string,online=new Set<string>()):Promise<FriendEntry[]> {
    const {rows}=await this.db.query(`SELECT u.id,u.display_name,u.handle,u.crew,
      CASE WHEN f.status='accepted' THEN 'friend' WHEN f.requested_by=$1 THEN 'outgoing' ELSE 'incoming' END AS status,
      (SELECT count(*)::int FROM messages m WHERE m.from_id=u.id AND m.to_id=$1 AND m.read_at IS NULL) AS unread
      FROM friend_links f JOIN users u ON u.id=CASE WHEN f.user_a=$1 THEN f.user_b ELSE f.user_a END
      WHERE f.user_a=$1 OR f.user_b=$1 ORDER BY u.display_name LIMIT 250`,[userId])
    const {rows:blocked}=await this.db.query("SELECT u.id,u.display_name,u.handle,u.crew,'blocked' AS status,0 AS unread FROM user_blocks b JOIN users u ON u.id=b.blocked WHERE b.blocker=$1 LIMIT 250",[userId])
    return [...rows,...blocked].map(r=>({userId:r.id,name:r.display_name,handle:r.handle,crew:r.crew,status:r.status,online:online.has(r.id),unread:Number(r.unread)}))
  }
  async action(userId:string,raw:unknown):Promise<string> {
    if(!record(raw)||typeof raw.handle!=='string')throw new RequestError('Enter a friend’s @handle')
    const handle=raw.handle.trim().replace(/^@/,'').toLowerCase()
    const action=raw.action as FriendAction
    if(!isHandle(handle)||!['request','accept','decline','remove','block','unblock'].includes(action))throw new RequestError('Invalid friend request')
    const {rows:[target]}=await this.db.query('SELECT id FROM users WHERE handle=$1',[handle])
    if(!target||target.id===userId)throw new RequestError('That @handle is unavailable')
    await this.db.transaction(async db=>{
      await this.lock(db,userId,target.id)
      const [a,b]=pair(userId,target.id)
      if(action==='block'){
        await db.query('INSERT INTO user_blocks(blocker,blocked) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,target.id])
        await db.query('DELETE FROM friend_links WHERE user_a=$1 AND user_b=$2',[a,b]);return
      }
      if(action==='unblock'){await db.query('DELETE FROM user_blocks WHERE blocker=$1 AND blocked=$2',[userId,target.id]);return}
      await this.permitted(userId,target.id,db)
      if(action==='request'){
        const {rows:[count]}=await db.query('SELECT count(*)::int AS count FROM friend_links WHERE user_a=$1 OR user_b=$1',[userId])
        if(count.count>=250)throw new RequestError('Your friends list is full')
        const {rows:[otherCount]}=await db.query('SELECT count(*)::int AS count FROM friend_links WHERE user_a=$1 OR user_b=$1',[target.id])
        if(otherCount.count>=250)throw new RequestError('That player’s friends list is full')
        await db.query('INSERT INTO friend_links(user_a,user_b,requested_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[a,b,userId])
      }else if(action==='accept'){
        const {rows}=await db.query("UPDATE friend_links SET status='accepted' WHERE user_a=$1 AND user_b=$2 AND requested_by<>$3 AND status='pending' RETURNING user_a",[a,b,userId])
        if(!rows.length)throw new RequestError('No incoming request to accept')
      }else if(action==='decline'){
        await db.query("DELETE FROM friend_links WHERE user_a=$1 AND user_b=$2 AND status='pending'",[a,b])
      }else await db.query('DELETE FROM friend_links WHERE user_a=$1 AND user_b=$2',[a,b])
    })
    return target.id
  }
  async history(userId:string,target:unknown):Promise<PrivateMessage[]> {
    if(!isAccountId(target)||target===userId)throw new RequestError('Choose a friend')
    return this.db.transaction(async db=>{
      await this.lock(db,userId,target);await this.permitted(userId,target,db,true)
      const {rows}=await db.query('SELECT * FROM messages WHERE pair=$1 ORDER BY at DESC,id DESC LIMIT 50',[pair(userId,target).join(':')])
      await db.query('UPDATE messages SET read_at=now() WHERE from_id=$1 AND to_id=$2 AND read_at IS NULL',[target,userId])
      return rows.reverse().map(m=>({id:m.id,from:m.from_id,to:m.to_id,name:m.name,text:m.text,at:new Date(m.at).getTime()}))
    })
  }
  async message(userId:string,raw:unknown):Promise<PrivateMessage> {
    if(!record(raw)||!isAccountId(raw.to)||raw.to===userId)throw new RequestError('Choose a friend')
    const text=storedPrivateText(raw.text);if(!text)throw new RequestError('Messages must contain 1–1000 characters')
    const target=raw.to
    return this.db.transaction(async db=>{
      await this.lock(db,userId,target);await this.permitted(userId,target,db,true)
      const {rows:[sender]}=await db.query('SELECT display_name FROM users WHERE id=$1',[userId])
      const id=randomUUID(),key=pair(userId,target).join(':')
      const {rows:[saved]}=await db.query('INSERT INTO messages(id,pair,from_id,to_id,name,text) VALUES($1,$2,$3,$4,$5,$6) RETURNING at',[id,key,userId,target,sender.display_name,text])
      await db.query('DELETE FROM messages WHERE pair=$1 AND id NOT IN (SELECT id FROM messages WHERE pair=$1 ORDER BY at DESC,id DESC LIMIT 50)',[key])
      return {id,from:userId,to:target,name:sender.display_name,text,at:new Date(saved.at).getTime()}
    })
  }
  async savePublicKey(userId:string,raw:unknown):Promise<{ok:true}> {
    if(!record(raw)||!isE2ePublicJwk(raw.publicKey))throw new RequestError('Invalid secure-message key')
    const publicKey=JSON.stringify({kty:'EC',crv:'P-256',x:raw.publicKey.x,y:raw.publicKey.y})
    await this.db.query('UPDATE users SET e2e_public=$2 WHERE id=$1',[userId,publicKey])
    return {ok:true}
  }
  async publicKey(userId:string,target:unknown):Promise<{publicKey:E2ePublicJwk|null}> {
    if(!isAccountId(target))throw new RequestError('Choose a player')
    if(target!==userId)await this.permitted(userId,target,this.db,true)
    const {rows:[row]}=await this.db.query('SELECT e2e_public FROM users WHERE id=$1',[target])
    if(!row?.e2e_public)return {publicKey:null}
    try{
      const parsed=JSON.parse(row.e2e_public) as unknown
      return {publicKey:isE2ePublicJwk(parsed)?parsed:null}
    }catch{return {publicKey:null}}
  }
}
