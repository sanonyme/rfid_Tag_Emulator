export type WorkshopActivity =
  /** `epc` is any tag from the batch; its last digits label the present it drops. */
  | { kind: 'tags-sent'; count: number; source?: 'fixed' | 'handheld'; epc?: string }
  | { kind: 'process'; started: boolean }

type Listener = (activity: WorkshopActivity) => void

const listeners = new Set<Listener>()

/** Reports app activity to the workshop floor. A no-op when the floor isn't mounted. */
export function emitWorkshopActivity(activity: WorkshopActivity) {
  listeners.forEach((l) => l(activity))
}

export function subscribeWorkshopActivity(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
