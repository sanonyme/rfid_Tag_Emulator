import {
  Clock,
  ScanLine,
  Radio,
  Smartphone,
  Terminal,
  Box,
  Workflow,
  Variable,
  Database,
  Server,
  FileCode2,
  Globe,
  Network,
  Code2,
  GitBranch,
  FileText,
  ShieldCheck,
  Timer,
  Repeat,
  Ban,
  Sparkles,
  StickyNote,
  Wand2,
  Bell,
  Repeat2,
  Split,
  Shuffle,
  FolderOpen,
  Save,
  ListOrdered,
  type LucideIcon,
} from 'lucide-react'
import { CONDITION_OPS, type ActionType, type AutomationStep } from './automation-types'
import { catalogEntry, type NodeCategory } from './automation-node-catalog'

export interface NodeVisualStyle {
  Icon: LucideIcon
  /** Short uppercase badge label (e.g. "HTTP", "RFID", "IF") */
  badge: string
  /** Top accent bar gradient / color class */
  accentBar: string
  /** Icon chip background + ring + text */
  iconBg: string
  iconText: string
  /** Hover/selected subtle ring tint */
  borderTint: string
  /** MiniMap hex color */
  hex: string
  category: NodeCategory
}

export const NODE_VISUAL_STYLES: Record<ActionType, NodeVisualStyle> = {
  FIXED_TAG: {
    Icon: Radio,
    badge: 'FIXED RFID',
    accentBar: 'from-blue-500 to-indigo-500',
    iconBg: 'bg-blue-500/15 ring-blue-500/30',
    iconText: 'text-blue-500 dark:text-blue-400',
    borderTint: 'border-blue-500/30 hover:border-blue-500/60',
    hex: '#3b82f6',
    category: 'devices',
  },
  HANDHELD_TAG: {
    Icon: Smartphone,
    badge: 'HANDHELD',
    accentBar: 'from-emerald-500 to-teal-500',
    iconBg: 'bg-emerald-500/15 ring-emerald-500/30',
    iconText: 'text-emerald-500 dark:text-emerald-400',
    borderTint: 'border-emerald-500/30 hover:border-emerald-500/60',
    hex: '#10b981',
    category: 'devices',
  },
  OCR: {
    Icon: ScanLine,
    badge: 'OCR',
    accentBar: 'from-pink-500 to-rose-500',
    iconBg: 'bg-pink-500/15 ring-pink-500/30',
    iconText: 'text-pink-500 dark:text-pink-400',
    borderTint: 'border-pink-500/30 hover:border-pink-500/60',
    hex: '#ec4899',
    category: 'devices',
  },
  CUSTOM_MESSAGE: {
    Icon: Terminal,
    badge: 'TCP',
    accentBar: 'from-violet-500 to-purple-500',
    iconBg: 'bg-violet-500/15 ring-violet-500/30',
    iconText: 'text-violet-500 dark:text-violet-400',
    borderTint: 'border-violet-500/30 hover:border-violet-500/60',
    hex: '#8b5cf6',
    category: 'devices',
  },
  EDGE_BLOCK: {
    Icon: Box,
    badge: 'EDGE BLOCK',
    accentBar: 'from-cyan-500 to-sky-500',
    iconBg: 'bg-cyan-500/15 ring-cyan-500/30',
    iconText: 'text-cyan-500 dark:text-cyan-400',
    borderTint: 'border-cyan-500/30 hover:border-cyan-500/60',
    hex: '#06b6d4',
    category: 'edge',
  },
  EDGE_PROCESS: {
    Icon: Workflow,
    badge: 'EDGE PROC',
    accentBar: 'from-teal-500 to-emerald-500',
    iconBg: 'bg-teal-500/15 ring-teal-500/30',
    iconText: 'text-teal-500 dark:text-teal-400',
    borderTint: 'border-teal-500/30 hover:border-teal-500/60',
    hex: '#14b8a6',
    category: 'edge',
  },
  SET_VARIABLE: {
    Icon: Variable,
    badge: 'SET VAR',
    accentBar: 'from-orange-500 to-amber-500',
    iconBg: 'bg-orange-500/15 ring-orange-500/30',
    iconText: 'text-orange-500 dark:text-orange-400',
    borderTint: 'border-orange-500/30 hover:border-orange-500/60',
    hex: '#f97316',
    category: 'data',
  },
  TRANSFORM: {
    Icon: Wand2,
    badge: 'TRANSFORM',
    accentBar: 'from-teal-500 to-cyan-500',
    iconBg: 'bg-teal-500/15 ring-teal-500/30',
    iconText: 'text-teal-500 dark:text-teal-400',
    borderTint: 'border-teal-500/30 hover:border-teal-500/60',
    hex: '#14b8a6',
    category: 'data',
  },
  GENERATE: {
    Icon: Sparkles,
    badge: 'GENERATE',
    accentBar: 'from-amber-500 to-yellow-500',
    iconBg: 'bg-amber-500/15 ring-amber-500/30',
    iconText: 'text-amber-500 dark:text-amber-400',
    borderTint: 'border-amber-500/30 hover:border-amber-500/60',
    hex: '#f59e0b',
    category: 'data',
  },
  DB_QUERY: {
    Icon: Database,
    badge: 'DB QUERY',
    accentBar: 'from-indigo-500 to-blue-600',
    iconBg: 'bg-indigo-500/15 ring-indigo-500/30',
    iconText: 'text-indigo-500 dark:text-indigo-400',
    borderTint: 'border-indigo-500/30 hover:border-indigo-500/60',
    hex: '#6366f1',
    category: 'data',
  },
  DB_EXEC: {
    Icon: Server,
    badge: 'SQL EXEC',
    accentBar: 'from-indigo-500 to-violet-600',
    iconBg: 'bg-indigo-500/15 ring-indigo-500/30',
    iconText: 'text-indigo-500 dark:text-indigo-400',
    borderTint: 'border-indigo-500/30 hover:border-indigo-500/60',
    hex: '#6366f1',
    category: 'data',
  },
  HTTP_REQUEST: {
    Icon: Globe,
    badge: 'HTTP',
    accentBar: 'from-rose-500 to-pink-600',
    iconBg: 'bg-rose-500/15 ring-rose-500/30',
    iconText: 'text-rose-500 dark:text-rose-400',
    borderTint: 'border-rose-500/30 hover:border-rose-500/60',
    hex: '#f43f5e',
    category: 'data',
  },
  CODE: {
    Icon: Code2,
    badge: 'JS CODE',
    accentBar: 'from-yellow-500 to-amber-500',
    iconBg: 'bg-yellow-500/15 ring-yellow-500/30',
    iconText: 'text-yellow-600 dark:text-yellow-400',
    borderTint: 'border-yellow-500/30 hover:border-yellow-500/60',
    hex: '#eab308',
    category: 'data',
  },
  RUN_SCRIPT: {
    Icon: FileCode2,
    badge: 'SCRIPT',
    accentBar: 'from-lime-500 to-emerald-500',
    iconBg: 'bg-lime-500/15 ring-lime-500/30',
    iconText: 'text-lime-600 dark:text-lime-400',
    borderTint: 'border-lime-500/30 hover:border-lime-500/60',
    hex: '#84cc16',
    category: 'data',
  },
  FILE_READ: {
    Icon: FolderOpen,
    badge: 'FILE READ',
    accentBar: 'from-emerald-500 to-green-500',
    iconBg: 'bg-emerald-500/15 ring-emerald-500/30',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    borderTint: 'border-emerald-500/30 hover:border-emerald-500/60',
    hex: '#10b981',
    category: 'data',
  },
  FILE_WRITE: {
    Icon: Save,
    badge: 'FILE WRITE',
    accentBar: 'from-blue-500 to-cyan-500',
    iconBg: 'bg-blue-500/15 ring-blue-500/30',
    iconText: 'text-blue-500 dark:text-blue-400',
    borderTint: 'border-blue-500/30 hover:border-blue-500/60',
    hex: '#3b82f6',
    category: 'data',
  },
  FILE_LIST: {
    Icon: ListOrdered,
    badge: 'FILE LIST',
    accentBar: 'from-cyan-500 to-teal-500',
    iconBg: 'bg-cyan-500/15 ring-cyan-500/30',
    iconText: 'text-cyan-500 dark:text-cyan-400',
    borderTint: 'border-cyan-500/30 hover:border-cyan-500/60',
    hex: '#06b6d4',
    category: 'data',
  },
  DELAY: {
    Icon: Clock,
    badge: 'DELAY',
    accentBar: 'from-amber-400 to-orange-500',
    iconBg: 'bg-amber-500/15 ring-amber-500/30',
    iconText: 'text-amber-500 dark:text-amber-400',
    borderTint: 'border-amber-500/30 hover:border-amber-500/60',
    hex: '#f59e0b',
    category: 'flow',
  },
  CONDITION: {
    Icon: GitBranch,
    badge: 'IF / ELSE',
    accentBar: 'from-fuchsia-500 to-purple-500',
    iconBg: 'bg-fuchsia-500/15 ring-fuchsia-500/30',
    iconText: 'text-fuchsia-500 dark:text-fuchsia-400',
    borderTint: 'border-fuchsia-500/30 hover:border-fuchsia-500/60',
    hex: '#d946ef',
    category: 'flow',
  },
  SWITCH: {
    Icon: Split,
    badge: 'SWITCH',
    accentBar: 'from-sky-500 to-blue-500',
    iconBg: 'bg-sky-500/15 ring-sky-500/30',
    iconText: 'text-sky-500 dark:text-sky-400',
    borderTint: 'border-sky-500/30 hover:border-sky-500/60',
    hex: '#0ea5e9',
    category: 'flow',
  },
  RANDOM: {
    Icon: Shuffle,
    badge: 'RANDOM',
    accentBar: 'from-purple-500 to-fuchsia-500',
    iconBg: 'bg-purple-500/15 ring-purple-500/30',
    iconText: 'text-purple-500 dark:text-purple-400',
    borderTint: 'border-purple-500/30 hover:border-purple-500/60',
    hex: '#a855f7',
    category: 'flow',
  },
  FOR_EACH: {
    Icon: Repeat,
    badge: 'FOR EACH',
    accentBar: 'from-purple-500 to-indigo-500',
    iconBg: 'bg-purple-500/15 ring-purple-500/30',
    iconText: 'text-purple-500 dark:text-purple-400',
    borderTint: 'border-purple-500/30 hover:border-purple-500/60',
    hex: '#a855f7',
    category: 'flow',
  },
  LOOP_N: {
    Icon: Repeat2,
    badge: 'LOOP ×N',
    accentBar: 'from-violet-500 to-indigo-500',
    iconBg: 'bg-violet-500/15 ring-violet-500/30',
    iconText: 'text-violet-500 dark:text-violet-400',
    borderTint: 'border-violet-500/30 hover:border-violet-500/60',
    hex: '#8b5cf6',
    category: 'flow',
  },
  CALL_SEQUENCE: {
    Icon: Network,
    badge: 'CALL SEQ',
    accentBar: 'from-purple-500 to-pink-500',
    iconBg: 'bg-purple-500/15 ring-purple-500/30',
    iconText: 'text-purple-500 dark:text-purple-400',
    borderTint: 'border-purple-500/30 hover:border-purple-500/60',
    hex: '#a855f7',
    category: 'flow',
  },
  WAIT_UNTIL: {
    Icon: Timer,
    badge: 'WAIT UNTIL',
    accentBar: 'from-cyan-500 to-blue-500',
    iconBg: 'bg-cyan-500/15 ring-cyan-500/30',
    iconText: 'text-cyan-500 dark:text-cyan-400',
    borderTint: 'border-cyan-500/30 hover:border-cyan-500/60',
    hex: '#06b6d4',
    category: 'flow',
  },
  ASSERT: {
    Icon: ShieldCheck,
    badge: 'ASSERT',
    accentBar: 'from-red-500 to-rose-600',
    iconBg: 'bg-red-500/15 ring-red-500/30',
    iconText: 'text-red-500 dark:text-red-400',
    borderTint: 'border-red-500/30 hover:border-red-500/60',
    hex: '#ef4444',
    category: 'flow',
  },
  STOP: {
    Icon: Ban,
    badge: 'STOP',
    accentBar: 'from-stone-500 to-zinc-600',
    iconBg: 'bg-stone-500/15 ring-stone-500/30',
    iconText: 'text-stone-500 dark:text-stone-400',
    borderTint: 'border-stone-500/30 hover:border-stone-500/60',
    hex: '#78716c',
    category: 'flow',
  },
  LOG: {
    Icon: FileText,
    badge: 'LOG',
    accentBar: 'from-sky-400 to-blue-500',
    iconBg: 'bg-sky-500/15 ring-sky-500/30',
    iconText: 'text-sky-500 dark:text-sky-400',
    borderTint: 'border-sky-500/30 hover:border-sky-500/60',
    hex: '#38bdf8',
    category: 'utility',
  },
  NOTIFY: {
    Icon: Bell,
    badge: 'NOTIFY',
    accentBar: 'from-sky-500 to-indigo-500',
    iconBg: 'bg-sky-500/15 ring-sky-500/30',
    iconText: 'text-sky-500 dark:text-sky-400',
    borderTint: 'border-sky-500/30 hover:border-sky-500/60',
    hex: '#0ea5e9',
    category: 'utility',
  },
  COMMENT: {
    Icon: StickyNote,
    badge: 'NOTE',
    accentBar: 'from-amber-300 to-yellow-400',
    iconBg: 'bg-amber-500/15 ring-amber-500/30',
    iconText: 'text-amber-600 dark:text-amber-300',
    borderTint: 'border-amber-400/40 hover:border-amber-400/70',
    hex: '#fbbf24',
    category: 'utility',
  },
}

export interface NodeSummary {
  /** Optional small colored pill prefix (e.g., "GET", "POST", "SFTP", "1500ms") */
  chip?: string
  chipTone?: 'neutral' | 'emerald' | 'blue' | 'amber' | 'rose' | 'violet'
  /** Main one-line configuration detail */
  text: string
  /** Optional target variable arrow badge, e.g. `→ myVar` */
  outputVar?: string
}

/** Rich structured summary displayed inside the upgraded canvas node card. */
export function getStepSummary(step: AutomationStep, sequenceNameById?: Map<string, string>): NodeSummary {
  const p = step.params
  switch (step.type) {
    case 'DELAY': {
      const ms = p.duration ?? 1000
      const formatted = ms >= 1000 && ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`
      return { chip: formatted, chipTone: 'amber', text: 'Pause execution' }
    }
    case 'OCR':
      return {
        chip: p.ocrHost?.trim() ? p.ocrHost.trim() : `${(p.message || '').length}ch`,
        chipTone: 'rose',
        text: p.message?.trim() || 'Configure payload',
        outputVar: p.ocrSaveAs?.trim() || undefined,
      }
    case 'FIXED_TAG': {
      const upcLines = (p.upcList || '').split('\n').filter((l) => l.trim()).length
      const epcLines = (p.epcList || '').split('\n').filter((l) => l.trim()).length
      const parts: string[] = []
      if (upcLines > 0) parts.push(`${upcLines} UPC`)
      if (epcLines > 0) parts.push(`${epcLines} EPC`)
      if (parts.length === 0 && (p.upc || p.epc)) parts.push(p.upc || p.epc || '')
      return {
        chip: (p.driver || 'llrp').toUpperCase(),
        chipTone: 'blue',
        text: parts.length > 0 ? parts.join(' + ') : 'Configure tags',
        outputVar: 'epcs',
      }
    }
    case 'HANDHELD_TAG': {
      const upcLines = (p.upcList || '').split('\n').filter((l) => l.trim()).length
      const epcLines = (p.epcList || '').split('\n').filter((l) => l.trim()).length
      const parts: string[] = []
      if (upcLines > 0) parts.push(`${upcLines} UPC`)
      if (epcLines > 0) parts.push(`${epcLines} EPC`)
      return {
        chip: p.handheldPort && p.handheldPort !== '10472' ? `:${p.handheldPort}` : 'HH',
        chipTone: 'emerald',
        text: parts.length > 0 ? parts.join(' + ') : 'Configure tags',
        outputVar: 'epcs',
      }
    }
    case 'CUSTOM_MESSAGE': {
      const mode = p.tcpMode ?? 'oneshot'
      const hostPort = `${p.tcpHost?.trim() || '{{host}}'}:${p.port || '12345'}`
      if (mode === 'client_connect') {
        return { chip: 'CONNECT', chipTone: 'emerald', text: hostPort }
      }
      if (mode === 'client_disconnect') {
        return { chip: 'CLOSE', chipTone: 'neutral', text: 'Disconnect TCP client' }
      }
      if (mode === 'client_send') {
        return {
          chip: p.tcpHex ? 'CLI HEX' : 'CLI SEND',
          chipTone: 'violet',
          text: p.message?.trim() || 'Configure payload',
          outputVar: p.tcpSaveResponseAs?.trim() || undefined,
        }
      }
      if (mode === 'server_start') {
        return {
          chip: 'LISTEN',
          chipTone: 'emerald',
          text: `${p.tcpHost?.trim() || '0.0.0.0'}:${p.port || '9000'}`,
        }
      }
      if (mode === 'server_stop') {
        return { chip: 'STOP SRV', chipTone: 'rose', text: 'Stop TCP server' }
      }
      if (mode === 'server_send') {
        return {
          chip: p.tcpHex ? 'SRV HEX' : 'BROADCAST',
          chipTone: 'blue',
          text: p.message?.trim() || 'Configure broadcast payload',
        }
      }
      if (mode === 'server_wait') {
        return {
          chip: 'WAIT RX',
          chipTone: 'amber',
          text: `Timeout ${p.tcpTimeoutMs ?? 10000}ms`,
          outputVar: p.tcpSaveResponseAs?.trim() || 'tcpRx',
        }
      }
      return {
        chip: p.tcpHex ? 'HEX' : p.port ? `:${p.port}` : 'TCP',
        chipTone: 'violet',
        text: p.message?.trim() || hostPort,
        outputVar: p.tcpSaveResponseAs?.trim() || undefined,
      }
    }
    case 'EDGE_BLOCK':
      return {
        chip: 'INVOKE',
        chipTone: 'blue',
        text: p.edgeBlockName || 'Select Edge block',
      }
    case 'EDGE_PROCESS': {
      const action = p.edgeProcessAction === 'stop' ? 'STOP' : 'START'
      return {
        chip: action,
        chipTone: action === 'STOP' ? 'rose' : 'emerald',
        text: p.edgeProcessName || 'Select process',
      }
    }
    case 'SET_VARIABLE':
      return {
        chip: (p.varType || 'string').toUpperCase(),
        chipTone: 'amber',
        text: p.varValue ? `= ${p.varValue}` : '(empty)',
        outputVar: p.varName || undefined,
      }
    case 'DB_QUERY':
      return {
        chip: 'SELECT',
        chipTone: 'violet',
        text: p.dbSql?.trim() || 'Configure SQL query',
        outputVar: p.dbSaveAs || undefined,
      }
    case 'DB_EXEC':
      return {
        chip: 'SQL',
        chipTone: 'violet',
        text: p.dbSql?.trim() || 'Configure SQL statement',
        outputVar: p.dbSaveAffectedAs || p.dbSaveInsertIdAs || undefined,
      }
    case 'HTTP_REQUEST': {
      const m = (p.httpMethod || 'GET').toUpperCase()
      const tone =
        m === 'GET' ? 'emerald' : m === 'POST' ? 'blue' : m === 'DELETE' ? 'rose' : 'amber'
      return {
        chip: m,
        chipTone: tone,
        text: p.httpUrl?.trim() || 'Configure URL',
        outputVar: p.httpSaveJsonAs || p.httpSaveBodyAs || p.httpSaveStatusAs || undefined,
      }
    }
    case 'RUN_SCRIPT':
      return {
        chip: p.scriptInline ? 'INLINE' : 'FILE',
        chipTone: 'emerald',
        text: p.scriptInline
          ? (p.scriptInlineText?.split('\n')[0] || 'Inline shell script')
          : (p.scriptPath || 'Select script'),
        outputVar: p.scriptSaveStdoutAs || undefined,
      }
    case 'CODE':
      return {
        chip: 'JS',
        chipTone: 'amber',
        text:
          p.codeSource
            ?.split('\n')
            .find((l) => l.trim() && !l.trim().startsWith('//'))
            ?.trim() || 'JavaScript snippet',
      }
    case 'CALL_SEQUENCE': {
      const name = p.callSequenceId ? sequenceNameById?.get(p.callSequenceId) : undefined
      return {
        chip: 'SUB',
        chipTone: 'violet',
        text: name ? `"${name}"` : p.callSequenceId ? 'Linked sequence' : 'Select sequence',
      }
    }
    case 'CONDITION': {
      const opMeta = CONDITION_OPS.find((o) => o.value === (p.condOp ?? 'eq'))
      const left = p.condLeft || '?'
      return {
        chip: 'IF',
        chipTone: 'violet',
        text:
          opMeta?.needsRight === false
            ? `${left} ${opMeta.label}`
            : `${left} ${opMeta?.label ?? '='} ${p.condRight ?? ''}`,
      }
    }
    case 'ASSERT': {
      const opMeta = CONDITION_OPS.find((o) => o.value === (p.condOp ?? 'eq'))
      return {
        chip: 'CHECK',
        chipTone: 'rose',
        text: `${p.condLeft || '?'} ${opMeta?.label ?? '='} ${opMeta?.needsRight === false ? '' : p.condRight ?? ''}`.trim(),
      }
    }
    case 'WAIT_UNTIL':
      return {
        chip: `≤${p.waitTimeoutMs ?? 10000}ms`,
        chipTone: 'blue',
        text: `${p.condLeft || '?'} (poll ${p.waitPollMs ?? 500}ms)`,
      }
    case 'FOR_EACH': {
      const name = p.forEachSequenceId ? sequenceNameById?.get(p.forEachSequenceId) : undefined
      return {
        chip: 'EACH',
        chipTone: 'violet',
        text: name ? `${p.forEachSource || '?'} → "${name}"` : p.forEachSource || 'Configure source',
        outputVar: p.forEachItemAs || 'item',
      }
    }
    case 'LOOP_N': {
      const name = p.loopSequenceId ? sequenceNameById?.get(p.loopSequenceId) : undefined
      return {
        chip: `×${p.loopCount || '?'}`,
        chipTone: 'violet',
        text: name ? `Run "${name}"` : 'Select target sequence',
        outputVar: p.loopIndexAs || 'i',
      }
    }
    case 'STOP':
      return {
        chip: p.stopScope === 'run' ? 'HALT RUN' : 'END SEQ',
        chipTone: 'neutral',
        text: p.stopMessage || (p.stopScope === 'run' ? 'End whole run' : 'End sequence'),
      }
    case 'GENERATE':
      return {
        chip: (p.generateKind ?? 'uuid').toUpperCase(),
        chipTone: 'amber',
        text: 'Generate value',
        outputVar: p.generateSaveAs || undefined,
      }
    case 'COMMENT':
      return {
        text: p.commentText?.trim() || 'Double-click to write a note…',
      }
    case 'LOG':
      return {
        chip: (p.logLevel || 'info').toUpperCase(),
        chipTone: p.logLevel === 'error' ? 'rose' : p.logLevel === 'warn' ? 'amber' : 'blue',
        text: p.logMessage?.trim() || 'Configure log message',
      }
    case 'TRANSFORM':
      return {
        chip: (p.transformOp ?? 'trim').toUpperCase(),
        chipTone: 'emerald',
        text: p.transformInput || 'Input value',
        outputVar: p.transformSaveAs || undefined,
      }
    case 'NOTIFY':
      return {
        chip: (p.notifyLevel || 'info').toUpperCase(),
        chipTone: p.notifyLevel === 'error' ? 'rose' : p.notifyLevel === 'success' ? 'emerald' : 'blue',
        text: p.notifyMessage?.trim() || 'Toast message',
      }
    case 'SWITCH': {
      const n = p.switchCases?.length ?? 0
      return {
        chip: `${n} CASES`,
        chipTone: 'blue',
        text: p.switchValue || 'Switch value',
      }
    }
    case 'RANDOM': {
      const n = p.randomBranches?.length ?? 0
      return {
        chip: `${n} PATHS`,
        chipTone: 'violet',
        text: 'Weighted random router',
        outputVar: p.randomSaveAs || undefined,
      }
    }
    case 'FILE_READ':
    case 'FILE_WRITE':
    case 'FILE_LIST': {
      const prov = (p.fileLocation || p.fileStorageProvider || 'local').toUpperCase()
      return {
        chip: prov,
        chipTone: prov === 'S3' ? 'amber' : prov === 'SFTP' || prov === 'FTP' ? 'violet' : 'emerald',
        text: p.filePath?.trim() || 'Configure path',
        outputVar: p.fileSaveAs || p.fileSaveListAs || undefined,
      }
    }
    default: {
      const entry = catalogEntry(step.type)
      return { text: entry?.description ?? '' }
    }
  }
}
