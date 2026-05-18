import { describe, it, expect, beforeEach } from 'vitest'
import {
  __resetRecorderForTests,
  buildRecordingFile,
  clearRecording,
  getRecorderState,
  isRecording,
  isTagRecordFile,
  recordSendEvent,
  startRecording,
  stopRecording,
  subscribeRecorder,
  TAG_RECORD_FORMAT,
} from '../recorder'

describe('recorder', () => {
  beforeEach(() => {
    __resetRecorderForTests()
  })

  it('starts inactive', () => {
    expect(isRecording()).toBe(false)
    expect(getRecorderState().events).toEqual([])
  })

  it('captures send events with monotonically increasing timestamps', async () => {
    startRecording()
    recordSendEvent({ source: 'fixed', tags: [{ epc: 'A' }] })
    await new Promise((r) => setTimeout(r, 10))
    recordSendEvent({ source: 'fixed', tags: [{ epc: 'B' }, { epc: 'C' }] })
    const state = getRecorderState()
    expect(state.events).toHaveLength(2)
    expect(state.events[0].count).toBe(1)
    expect(state.events[1].count).toBe(2)
    expect(state.events[1].t).toBeGreaterThan(state.events[0].t)
  })

  it('ignores send events when not recording', () => {
    recordSendEvent({ source: 'fixed', tags: [{ epc: 'A' }] })
    expect(getRecorderState().events).toEqual([])
  })

  it('stopRecording flips active and freezes events', () => {
    startRecording()
    recordSendEvent({ source: 'handheld', tags: [{ epc: 'A' }], port: 10472 })
    stopRecording()
    expect(isRecording()).toBe(false)
    recordSendEvent({ source: 'handheld', tags: [{ epc: 'B' }] })
    expect(getRecorderState().events).toHaveLength(1)
  })

  it('clearRecording resets all state', () => {
    startRecording()
    recordSendEvent({ source: 'fixed', tags: [{ epc: 'A' }] })
    clearRecording()
    const state = getRecorderState()
    expect(state.active).toBe(false)
    expect(state.events).toEqual([])
    expect(state.startedAt).toBeNull()
  })

  it('notifies subscribers of state changes', () => {
    let calls = 0
    const off = subscribeRecorder(() => calls++)
    startRecording()
    recordSendEvent({ source: 'fixed', tags: [{ epc: 'A' }] })
    stopRecording()
    expect(calls).toBeGreaterThanOrEqual(3)
    off()
    const before = calls
    startRecording()
    expect(calls).toBe(before)
  })

  it('builds a recording file with the format header and events', () => {
    startRecording()
    recordSendEvent({ source: 'fixed', tags: [{ epc: 'A' }] })
    stopRecording()
    const file = buildRecordingFile('1.2.3')
    expect(file.format).toBe(TAG_RECORD_FORMAT)
    expect(file.formatVersion).toBeGreaterThanOrEqual(1)
    expect(file.appVersion).toBe('1.2.3')
    expect(file.events).toHaveLength(1)
    expect(typeof file.startedAt).toBe('string')
    expect(typeof file.stoppedAt).toBe('string')
  })

  it('isTagRecordFile validates structure', () => {
    expect(isTagRecordFile(buildRecordingFile())).toBe(true)
    expect(isTagRecordFile({})).toBe(false)
    expect(isTagRecordFile(null)).toBe(false)
    expect(isTagRecordFile({ format: 'wrong', formatVersion: 1, events: [] })).toBe(false)
  })

  it('deep-copies tag arrays so caller mutations do not affect the recording', () => {
    startRecording()
    const tags = [{ epc: 'A' }]
    recordSendEvent({ source: 'fixed', tags })
    tags[0].epc = 'mutated'
    expect(getRecorderState().events[0].tags[0].epc).toBe('A')
  })
})
