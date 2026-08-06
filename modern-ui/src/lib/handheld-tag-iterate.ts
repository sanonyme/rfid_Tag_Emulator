import { EPCGenerator, parseStartSerial } from './tcp-client'
import { countHandheldSlotTags } from './tag-list-count'
import { iterateNonBlankLines } from './tag-list-lines'

export interface HandheldTagPayload {
  epc: string
  tid?: string
  rssi: string
  userdata?: string
}

/** Slot fields sent to main process — expanded one tag at a time (no giant IPC array). */
export interface HandheldSendRecipe {
  upcList: string
  epcList: string
  startSerial?: string
  rssi: string
  serialContinuesAcrossUpcLines: boolean
}

export function handheldRecipeFromSlot(
  slot: { upcList: string; epcList: string; startSerial?: string },
  rssi: string,
  serialContinuesAcrossUpcLines: boolean,
): HandheldSendRecipe {
  return {
    upcList: slot.upcList,
    epcList: slot.epcList,
    startSerial: slot.startSerial,
    rssi,
    serialContinuesAcrossUpcLines,
  }
}

export function countHandheldRecipeTags(recipe: HandheldSendRecipe): number {
  return countHandheldSlotTags(recipe)
}

/** Yield handheld tags one at a time — constant memory regardless of list size. */
export function* iterateHandheldTags(recipe: HandheldSendRecipe): Generator<HandheldTagPayload> {
  const rssi = recipe.rssi

  const upcText = recipe.upcList.trim()
  if (upcText) {
    const baseSerial = parseStartSerial(recipe.startSerial)
    let serial = baseSerial
    for (const line of iterateNonBlankLines(upcText)) {
      const [upc, countStr, customTid, userdata] = line.split(',')
      const qty = parseInt(countStr?.trim() || '0', 10)
      if (qty <= 0 || !upc?.trim()) continue
      const start = recipe.serialContinuesAcrossUpcLines ? serial : baseSerial
      const tid = customTid?.trim()
      const user = userdata?.trim()
      for (let i = 0; i < qty; i++) {
        const epc = EPCGenerator.generateFromUpc(upc.trim(), 1, start + i)[0]
        if (epc) yield { epc, tid: tid || epc, rssi, userdata: user || undefined }
      }
      if (recipe.serialContinuesAcrossUpcLines) serial += qty
    }
  }

  const epcText = recipe.epcList.trim()
  if (epcText) {
    for (const line of iterateNonBlankLines(epcText)) {
      const parts = line.split(',')
      const epc = parts[0]?.trim()
      const customTid = parts[1]?.trim()
      const userdata = parts[2]?.trim()
      if (epc) yield { epc, tid: customTid || epc, rssi, userdata: userdata || undefined }
    }
  }
}
