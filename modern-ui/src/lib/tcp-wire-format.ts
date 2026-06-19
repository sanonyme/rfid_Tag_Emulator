/** Wire-format helpers for fixed-reader TCP tag messages (shared with electron main). */

export type TcpTagPayload = {
  epc: string
  tid: string
  uid: string
  antenna: number
  rssi: string
}

export function formatTcpTagMessage(tag: TcpTagPayload, driver: string): string {
  return `driver=${driver} epc=${tag.epc} @tid=${tag.tid} uid=${tag.uid} antenna=${tag.antenna} @rssi=${tag.rssi}\n`
}
