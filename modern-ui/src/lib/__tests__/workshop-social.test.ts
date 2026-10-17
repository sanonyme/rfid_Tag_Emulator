import { describe,expect,it } from 'vitest'
import { normalizeHandle,parseFriends,parsePrivateMessages,privateText } from '../workshop-social'
import { parseIdentity,parseServerNotice,parseClientCommand } from '../workshop-cloud-model'

const id='00000000-0000-0000-0000-000000000001'
describe('Workshop social boundaries',()=>{
  it('retains valid handles while rejecting forged handles and client social notifications',()=>{
    const who={userId:id,name:'Snow Elf',handle:'snowelf_1',crew:'QA',king:null,titles:[]}
    expect(parseIdentity(who)?.handle).toBe('snowelf_1')
    expect(parseIdentity({...who,handle:'@not an id'})).toBeNull()
    expect(normalizeHandle('@SnowElf_1')).toBe('snowelf_1')
    expect(normalizeHandle('1bad')).toBeNull()
    expect(parseClientCommand({op:'social'})).toBeNull()
    expect(parseServerNotice({op:'social',token:'private'})).toEqual({op:'social'})
  })
  it('keeps message line breaks, removes control characters and validates private payloads',()=>{
    expect(privateText('  Hello\nfriend\u202e!  ')).toBe('Hello\nfriend!')
    expect(privateText('a'.repeat(1001))).toBeNull()
    const row={id,from:id,to:'00000000-0000-0000-0000-000000000002',name:'Elf',text:'Hi',at:1,token:'private'}
    expect(parsePrivateMessages([row])[0]).not.toHaveProperty('token')
    expect(()=>parsePrivateMessages([{...row,to:'guestaaa'}])).toThrow()
    expect(()=>parseFriends([{userId:id,name:'Elf',handle:'elf_1',crew:'QA',status:'friend',online:true,unread:-1}])).toThrow()
  })
})
