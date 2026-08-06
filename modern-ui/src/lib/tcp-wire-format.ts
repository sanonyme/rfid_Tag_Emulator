/** Wire-format helpers for fixed-reader TCP tag messages (shared with electron main). */

export type TcpTagPayload = {
  epc: string
  tid: string
  uid: string
  antenna: number
  rssi: string
  /** Optional user-memory bank payload; emitted as `@userdata=` when set. */
  userdata?: string
}

export function formatTcpTagMessage(tag: TcpTagPayload, driver: string): string {
  const userdata =
    tag.userdata && tag.userdata.trim()
      ? ` @userdata=${tag.userdata.trim()}`
      : ''
  return `driver=${driver} epc=${tag.epc} @tid=${tag.tid}${userdata} uid=${tag.uid} antenna=${tag.antenna} @rssi=${tag.rssi}\n`
}
