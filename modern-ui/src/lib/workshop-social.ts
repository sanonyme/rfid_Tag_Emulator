import { isCrew, record, type Crew } from './workshop-cloud-model'

export type FriendStatus='friend'|'incoming'|'outgoing'|'blocked'
export type FriendAction='request'|'accept'|'decline'|'remove'|'block'|'unblock'
export type FriendEntry={userId:string;name:string;handle:string;crew:Crew;status:FriendStatus;online:boolean;unread:number}
export type PrivateMessage={id:string;from:string;to:string;name:string;text:string;at:number}
export const isAccountId=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)
export const isHandle=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9_]{2,39}$/.test(v)
/** Strip @, lowercase, and validate. Returns null when the value is not a legal handle. */
export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const handle = raw.trim().replace(/^@+/, '').toLowerCase()
  return isHandle(handle) ? handle : null
}
export function privateText(v:unknown):string|null {
  if(typeof v!=='string'||v.length>1000)return null
  const clean=v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim()
  return clean || null
}
/** Wire format after optional E2E encryption (ciphertext is longer than the plaintext). */
export function storedPrivateText(v:unknown):string|null {
  if(typeof v!=='string'||v.length<1||v.length>4000)return null
  if(/^zeus1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v))return v
  // zeus2.<senderX>.<senderY>.<recipientX>.<recipientY>.<iv>.<ciphertext>
  if(/^zeus2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v))return v
  return privateText(v)
}
export function parseFriends(raw:unknown):FriendEntry[] {
  if(!Array.isArray(raw)||raw.length>500)throw new Error('Invalid friends response')
  return raw.map(v=>{
    if(!record(v)||!isAccountId(v.userId)||!isHandle(v.handle)||typeof v.name!=='string'||!isCrew(v.crew)
      ||!['friend','incoming','outgoing','blocked'].includes(String(v.status))||typeof v.online!=='boolean'
      ||!Number.isInteger(v.unread)||Number(v.unread)<0||Number(v.unread)>50)throw new Error('Invalid friend entry')
    return {userId:v.userId,name:v.name.slice(0,16),handle:v.handle,crew:v.crew,status:v.status as FriendStatus,online:v.online,unread:Number(v.unread)}
  })
}
export function parsePrivateMessages(raw:unknown):PrivateMessage[] {
  if(!Array.isArray(raw)||raw.length>50)throw new Error('Invalid conversation response')
  return raw.map(v=>{
    if(!record(v)||!isAccountId(v.id)||!isAccountId(v.from)||!isAccountId(v.to)||typeof v.name!=='string'
      ||typeof v.at!=='number'||!Number.isFinite(v.at))throw new Error('Invalid private message')
    const text=storedPrivateText(v.text);if(!text)throw new Error('Invalid private message text')
    return {id:v.id,from:v.from,to:v.to,name:v.name.slice(0,16),text,at:v.at}
  })
}
