import type { AutomationEdge, AutomationSequence, AutomationStep } from './automation-types'
import { deriveLinearEdges } from './automation-types'

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  id: string
  stepId: string
  stepName: string
  severity: ValidationSeverity
  message: string
}

/**
 * Inspect a sequence for configuration mistakes and graph anomalies so users
 * can spot issues before running.
 */
export function validateSequence(
  sequence: AutomationSequence | undefined,
  allSequences: AutomationSequence[],
): ValidationIssue[] {
  if (!sequence) return []
  const steps = sequence.steps
  if (steps.length === 0) return []

  const edges: AutomationEdge[] = sequence.edges ?? deriveLinearEdges(steps)
  const seqIds = new Set(allSequences.map((s) => s.id))
  const issues: ValidationIssue[] = []
  const push = (step: AutomationStep, severity: ValidationSeverity, message: string) => {
    issues.push({
      id: `${step.id}:${issues.length}`,
      stepId: step.id,
      stepName: step.name,
      severity,
      message,
    })
  }

  const outgoingByStep = new Map<string, AutomationEdge[]>()
  const incomingByStep = new Map<string, AutomationEdge[]>()
  for (const e of edges) {
    if (e.from === e.to) continue
    const out = outgoingByStep.get(e.from) ?? []
    out.push(e)
    outgoingByStep.set(e.from, out)
    const inc = incomingByStep.get(e.to) ?? []
    inc.push(e)
    incomingByStep.set(e.to, inc)
  }

  const activeSteps = steps.filter((s) => s.type !== 'COMMENT' && !s.params.disabled)

  for (const step of steps) {
    if (step.type === 'COMMENT' || step.params.disabled) continue
    const p = step.params

    switch (step.type) {
      case 'FIXED_TAG': {
        const hasTags = Boolean(p.upcList?.trim() || p.epcList?.trim() || p.upc?.trim() || p.epc?.trim())
        if (!hasTags) push(step, 'error', 'No UPC or EPC tags configured')
        break
      }
      case 'HANDHELD_TAG': {
        const hasTags = Boolean(p.upcList?.trim() || p.epcList?.trim())
        if (!hasTags) push(step, 'error', 'No UPC or EPC list configured')
        break
      }
      case 'OCR': {
        if (!p.message?.trim()) push(step, 'warning', 'OCR payload is empty')
        break
      }
      case 'CUSTOM_MESSAGE': {
        const mode = p.tcpMode ?? 'oneshot'
        if (mode === 'oneshot' || mode === 'client_send' || mode === 'server_send') {
          if (!p.message?.trim()) push(step, 'error', 'TCP message payload is empty')
        }
        if (mode === 'oneshot' || mode === 'client_connect' || mode === 'server_start') {
          const portStr = (p.port ?? '').trim()
          if (portStr && !portStr.includes('{{')) {
            const n = Number(portStr)
            if (!Number.isFinite(n) || n < 1 || n > 65535) {
              push(step, 'error', `Invalid TCP port: ${portStr}`)
            }
          }
        }
        break
      }
      case 'EDGE_BLOCK': {
        if (!p.edgeBlockName?.trim()) push(step, 'error', 'No Edge block selected')
        break
      }
      case 'EDGE_PROCESS': {
        if (!p.edgeProcessName?.trim()) push(step, 'error', 'No Edge process selected')
        break
      }
      case 'SET_VARIABLE': {
        if (!p.varName?.trim()) push(step, 'error', 'Variable name is missing')
        break
      }
      case 'DB_QUERY':
      case 'DB_EXEC': {
        if (!p.dbSql?.trim()) push(step, 'error', 'SQL query is empty')
        break
      }
      case 'HTTP_REQUEST': {
        if (!p.httpUrl?.trim()) push(step, 'error', 'HTTP request URL is empty')
        break
      }
      case 'RUN_SCRIPT': {
        if (p.scriptInline ? !p.scriptInlineText?.trim() : !p.scriptPath?.trim()) {
          push(step, 'error', p.scriptInline ? 'Inline script is empty' : 'Script path is missing')
        }
        break
      }
      case 'CODE': {
        if (!p.codeSource?.trim()) push(step, 'warning', 'JavaScript code block is empty')
        break
      }
      case 'CALL_SEQUENCE': {
        if (!p.callSequenceId) push(step, 'error', 'No target sequence selected')
        else if (!seqIds.has(p.callSequenceId)) push(step, 'error', 'Target sequence was deleted')
        break
      }
      case 'FOR_EACH': {
        if (!p.forEachSource?.trim()) push(step, 'error', 'List source is empty')
        if (!p.forEachSequenceId) push(step, 'error', 'No loop target sequence selected')
        else if (!seqIds.has(p.forEachSequenceId)) push(step, 'error', 'Loop target sequence was deleted')
        break
      }
      case 'LOOP_N': {
        if (!p.loopCount?.trim()) push(step, 'error', 'Loop count is empty')
        if (!p.loopSequenceId) push(step, 'error', 'No loop target sequence selected')
        else if (!seqIds.has(p.loopSequenceId)) push(step, 'error', 'Loop target sequence was deleted')
        break
      }
      case 'CONDITION': {
        const outs = outgoingByStep.get(step.id) ?? []
        const hasTrue = outs.some((e) => e.sourceHandle === 'true')
        const hasFalse = outs.some((e) => e.sourceHandle === 'false')
        if (!hasTrue && !hasFalse) {
          push(step, 'warning', 'Condition has neither TRUE nor FALSE branch wired')
        }
        break
      }
      case 'SWITCH': {
        const outs = outgoingByStep.get(step.id) ?? []
        if (outs.length === 0) push(step, 'warning', 'Switch has no outgoing branches wired')
        break
      }
      case 'FILE_READ':
      case 'FILE_WRITE':
      case 'FILE_LIST': {
        if (!p.filePath?.trim()) push(step, 'error', 'File or folder path is empty')
        break
      }
      default:
        break
    }

    // Warn on completely isolated nodes when the sequence has multiple runnable nodes
    if (activeSteps.length > 1) {
      const hasIn = (incomingByStep.get(step.id)?.length ?? 0) > 0
      const hasOut = (outgoingByStep.get(step.id)?.length ?? 0) > 0
      if (!hasIn && !hasOut) {
        push(step, 'warning', 'Node is disconnected (no links in or out)')
      }
    }
  }

  return issues
}
