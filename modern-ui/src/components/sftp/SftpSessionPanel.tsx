import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  SftpFileTree,
  SFTP_DND_MIME,
  type SftpFileNode,
  type SftpSortKey,
} from './SftpFileTree'
import { LocalDirList, LOCAL_DND_MIME, type LocalEntryRow } from './LocalDirList'
import { collectRemoteFiles } from './sftp-remote-download'
import { bindSftpSession } from '@/lib/sftp-session-api'
import { SftpPropertiesDialog } from './SftpPropertiesDialog'
import { SftpMoveDialog } from './SftpMoveDialog'
import { SftpRemoteContextMenu } from './SftpRemoteContextMenu'
import { SftpFindDialog } from './SftpFindDialog'
import { SftpToolbar } from './SftpToolbar'
import {
  FolderInput,
  Loader2,
  PlugZap,
  AlertCircle,
  Monitor,
  ChevronRight,
  ChevronDown,
  PanelBottom,
  Database,
  ShieldAlert,
  FlaskConical,
  Rocket,
  Cloud,
  Server,
  HardDrive,
  KeyRound,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useTourInteractionOptional } from '@/contexts/TourInteractionContext'
import { publishStatus, clearStatus } from '@/lib/workspace-status'
import {
  connectionIdentity,
  isObjectStoreConnection,
  isObjectStoreProtocol,
  loadSavedConnections,
  persistSavedConnections,
  protocolShortLabel,
  removeSavedConnection,
  resolvedConnectionName,
  upsertSavedConnection,
  type ExplorerProtocol,
  type SavedConnectionDraft,
  type SavedExplorerConnection,
  type SavedS3Connection,
} from '@/lib/sftp-saved-connections'
import { SftpSavedConnections } from './SftpSavedConnections'

import {
  posixJoin,
  parentDir,
  joinLocalDir,
  joinLocalSegments,
  fileExtension,
  arrayBufferToBase64,
} from './sftp-path-utils'
import {
  setNodeLoading,
  setChildrenAtPath,
  findNode,
  getDirectChildPaths,
  rebuildSftpTreeWithExpanded,
} from './sftp-tree-mutations'

const PROTOCOL_KEY = 'sftp-explorer-protocol'
const DB_CREDS_KEY = 'db-credentials'

type S3Creds = {
  bucket?: string
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  prefix?: string
  endpoint?: string
  assumeRole?: boolean
  roleArn?: string
  roleSessionName?: string
  externalId?: string
  sourceIdentity?: string
}

const S3_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
  'me-south-1',
]

function s3ConnectionLabel(bucket: string, prefix: string): string {
  const b = bucket.trim() || 'bucket'
  const p = prefix.trim().replace(/^\/+|\/+$/g, '')
  return p ? `s3://${b}/${p}` : `s3://${b}`
}

function parseStoredProtocol(raw: string | null): ExplorerProtocol {
  if (raw === 's3' || raw === 'ftp' || raw === 's3compat') return raw
  return 'sftp'
}

function protocolTitle(p: ExplorerProtocol): string {
  if (p === 's3') return 'Amazon S3'
  if (p === 's3compat') return 'S3-compatible'
  if (p === 'ftp') return 'FTP'
  return 'SFTP'
}

function protocolHint(p: ExplorerProtocol): string {
  if (p === 's3') return 'IAM access key. Turn on Assume Role if the bucket needs STS.'
  if (p === 's3compat') return 'MinIO, Cloudflare R2, Wasabi, and other S3 APIs.'
  if (p === 'ftp') return 'Plain FTP or FTPS file drops.'
  return 'SSH file transfer to Edge hosts and Linux servers.'
}

const PROTOCOL_CHOICES: { id: ExplorerProtocol; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'sftp', label: 'SFTP', hint: 'SSH to Edge hosts and Linux servers', icon: FolderInput },
  { id: 'ftp', label: 'FTP', hint: 'Classic FTP or FTPS file drops', icon: Server },
  { id: 's3', label: 'Amazon S3', hint: 'IAM keys, optional Assume Role', icon: Cloud },
  { id: 's3compat', label: 'S3-compatible', hint: 'MinIO, R2, Wasabi, LocalStack', icon: HardDrive },
]

function connectedToast(p: ExplorerProtocol): string {
  if (p === 's3') return 'S3 connected'
  if (p === 's3compat') return 'S3-compatible connected'
  if (p === 'ftp') return 'FTP connected'
  return 'SFTP connected'
}

function ProtocolGlyph({ protocol, className }: { protocol: ExplorerProtocol; className?: string }) {
  if (protocol === 's3') return <Cloud className={className} />
  if (protocol === 's3compat') return <HardDrive className={className} />
  if (protocol === 'ftp') return <Server className={className} />
  return <FolderInput className={className} />
}

function ExpandSection({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={cn('space-y-3', open && 'pt-3')}>{children}</div>
      </div>
    </div>
  )
}

type MigrateEnv = 'prod' | 'staging'

type TransferItem = {
  id: string
  label: string
  kind: 'download' | 'upload' | 'copy'
  status: 'running' | 'done' | 'error'
  progress: number
  error?: string
}

interface SftpSessionPanelProps {
  tabId: string
  isActive: boolean
  defaultHost: string
  onConnectionChange?: (info: {
    connected: boolean
    host?: string
    port?: number
    label?: string
  }) => void
  onRegisterDisconnect?: (fn: () => Promise<void>) => void
  onUnregisterDisconnect?: () => void
}

export function SftpSessionPanel({
  tabId,
  isActive,
  defaultHost,
  onConnectionChange,
  onRegisterDisconnect,
  onUnregisterDisconnect,
}: SftpSessionPanelProps) {
  const tourIx = useTourInteractionOptional()
  const api = window.electronAPI
  const hasSftp = Boolean(api?.sftpConnect)

  const [host, setHost] = useState(defaultHost)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sftp = useMemo(
    () => (api && sessionId ? bindSftpSession(api, sessionId) : null),
    [api, sessionId],
  )
  const sftpRef = useRef(sftp)
  sftpRef.current = sftp

  useEffect(() => {
    if (!isActive) return
    setHost((prev) => prev || defaultHost)
  }, [defaultHost, isActive])

  const [sftpPort, setSftpPort] = useState('22')
  const [sftpUser, setSftpUser] = useState('')
  const [sftpPass, setSftpPass] = useState('')
  const [sftpUseKey, setSftpUseKey] = useState(false)
  const [sftpKeyPath, setSftpKeyPath] = useState('')
  const [sftpKeyPass, setSftpKeyPass] = useState('')
  const [ftpSecure, setFtpSecure] = useState<'off' | 'explicit' | 'implicit'>('off')
  const keyFileInputRef = useRef<HTMLInputElement>(null)
  const [saveConnectionName, setSaveConnectionName] = useState('')
  const [savedConnections, setSavedConnections] = useState<SavedExplorerConnection[]>([])
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null)
  const [credsLoaded, setCredsLoaded] = useState(false)
  const [protocol, setProtocol] = useState<ExplorerProtocol>(() => {
    try {
      return parseStoredProtocol(localStorage.getItem(PROTOCOL_KEY))
    } catch {
      return 'sftp'
    }
  })
  const [protocolChosen, setProtocolChosen] = useState(false)
  const [s3Bucket, setS3Bucket] = useState('')
  const [s3Region, setS3Region] = useState('eu-west-1')
  const [s3AccessKey, setS3AccessKey] = useState('')
  const [s3Secret, setS3Secret] = useState('')
  const [s3Prefix, setS3Prefix] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [s3SessionToken, setS3SessionToken] = useState('')
  const [s3AssumeRole, setS3AssumeRole] = useState(false)
  const [s3RoleArn, setS3RoleArn] = useState('')
  const [s3RoleSessionName, setS3RoleSessionName] = useState('')
  const [s3ExternalId, setS3ExternalId] = useState('')
  const [s3SourceIdentity, setS3SourceIdentity] = useState('')
  const [showS3Advanced, setShowS3Advanced] = useState(false)

  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (!isActive) return
    if (connected) {
      const label = isObjectStoreProtocol(protocol)
        ? s3ConnectionLabel(s3Bucket, s3Prefix)
        : protocol === 'ftp'
          ? `ftp://${host}:${sftpPort}`
          : `${host}:${sftpPort}`
      publishStatus('sftp', {
        status: 'connected',
        host: isObjectStoreProtocol(protocol) ? s3Bucket || undefined : host || undefined,
        port: isObjectStoreProtocol(protocol) ? undefined : parseInt(sftpPort, 10) || (protocol === 'ftp' ? 21 : 22),
        label: protocolShortLabel(protocol),
      })
      onConnectionChange?.({
        connected: true,
        host: isObjectStoreProtocol(protocol) ? s3Bucket || undefined : host || undefined,
        port: isObjectStoreProtocol(protocol) ? undefined : parseInt(sftpPort, 10) || (protocol === 'ftp' ? 21 : 22),
        label,
      })
    } else if (connecting) {
      publishStatus('sftp', {
        status: 'connecting',
        host: isObjectStoreProtocol(protocol) ? s3Bucket || undefined : host || undefined,
        label: protocolShortLabel(protocol),
      })
      onConnectionChange?.({
        connected: false,
        host: isObjectStoreProtocol(protocol) ? s3Bucket || undefined : host || undefined,
        label: 'Connecting…',
      })
    } else {
      clearStatus('sftp')
      onConnectionChange?.({ connected: false, label: 'New connection' })
    }
    return () => { /* keep status across re-renders */ }
  }, [connected, connecting, host, sftpPort, isActive, onConnectionChange, protocol, s3Bucket, s3Prefix])

  useEffect(() => {
    if (!isActive) return
    return () => clearStatus('sftp')
  }, [isActive])
  const [connError, setConnError] = useState('')

  const [tree, setTree] = useState<SftpFileNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [uploadTargetDir, setUploadTargetDir] = useState('/')
  const [dropHighlightPath, setDropHighlightPath] = useState<string | null>(null)
  const [expandedPaths, setExpandedPaths] = useState(() => new Set<string>())
  const [sortKey, setSortKey] = useState<SftpSortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [localSortDir, setLocalSortDir] = useState<'asc' | 'desc'>('asc')
  const [foldersFirst, setFoldersFirst] = useState(true)
  const [pathGoInput, setPathGoInput] = useState('/')

  const [selectMode, setSelectMode] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState(() => new Set<string>())

  const [deleteTargets, setDeleteTargets] = useState<
    { path: string; name: string; isFolder: boolean }[] | null
  >(null)
  const [deleting, setDeleting] = useState(false)

  const [createKind, setCreateKind] = useState<'folder' | 'file' | null>(null)
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editText, setEditText] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editPath, setEditPath] = useState<string | null>(null)

  const [transferQueue, setTransferQueue] = useState<TransferItem[]>([])
  const [queueOpen, setQueueOpen] = useState(true)
  const [migrateOpen, setMigrateOpen] = useState(false)
  const [migrateEnv, setMigrateEnv] = useState<MigrateEnv>('staging')
  const [migrateConfirmText, setMigrateConfirmText] = useState('')
  const [migrateBusy, setMigrateBusy] = useState(false)
  const [migrateDbUser, setMigrateDbUser] = useState('')
  const [migrateDbPass, setMigrateDbPass] = useState('')
  const [migrateCredsLoaded, setMigrateCredsLoaded] = useState(false)

  const [localRoot, setLocalRoot] = useState<string | null>(null)
  const [localCwd, setLocalCwd] = useState<string | null>(null)
  const [localRows, setLocalRows] = useState<LocalEntryRow[]>([])
  const [localSelectedPath, setLocalSelectedPath] = useState<string | null>(null)
  const [localDropHighlight, setLocalDropHighlight] = useState(false)
  const [localSortKey, setLocalSortKey] = useState<SftpSortKey>('name')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const treeRef = useRef<SftpFileNode[]>([])
  const expandedPathsRef = useRef(expandedPaths)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: SftpFileNode } | null>(null)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [propertiesNode, setPropertiesNode] = useState<SftpFileNode | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveNode, setMoveNode] = useState<SftpFileNode | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  useEffect(() => {
    treeRef.current = tree
  }, [tree])

  useEffect(() => {
    expandedPathsRef.current = expandedPaths
  }, [expandedPaths])

  useEffect(() => {
    if (!ctxMenu) return
    const close = (e: Event) => {
      const menu = document.getElementById('sftp-remote-ctx-menu')
      if (menu?.contains(e.target as Node)) return
      setCtxMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  useEffect(() => {
    if (!isActive) return
    tourIx?.setSftpShellConnected(connected)
  }, [connected, tourIx, isActive])

  useEffect(() => {
    if (!isActive) return
    tourIx?.setSftpRemoteListed(connected && tree.length > 0)
  }, [connected, tree.length, tourIx, isActive])

  const nextOpId = () => `${tabId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const pushTransfer = useCallback((item: Omit<TransferItem, 'status' | 'progress'>) => {
    setTransferQueue((q) => [
      ...q,
      { ...item, status: 'running', progress: 0 },
    ])
  }, [])

  const updateTransfer = useCallback(
    (id: string, patch: Partial<Pick<TransferItem, 'status' | 'progress' | 'error'>>) => {
      setTransferQueue((q) => q.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    },
    [],
  )

  useEffect(() => {
    if (!api?.onSftpTransferProgress) return
    return api.onSftpTransferProgress(({ operationId, loaded, total }) => {
      const pct = total > 0 ? Math.min(100, Math.round((100 * loaded) / total)) : 0
      setTransferQueue((q) =>
        q.map((t) => (t.id === operationId ? { ...t, progress: pct } : t)),
      )
    })
  }, [api])

  const loadDir = useCallback(async (remotePath: string): Promise<SftpFileNode[]> => {
    if (!sftp?.readdir) return []
    const r = await sftp.readdir(remotePath)
    if (!r.ok) throw new Error(r.error)
    return r.entries.map((e) => ({
      path: posixJoin(remotePath, e.name),
      name: e.name,
      type: e.type,
      extension: e.type === 'file' ? fileExtension(e.name) : undefined,
      loaded: e.type === 'file' ? true : false,
      children: e.type === 'folder' ? undefined : undefined,
      sizeBytes: e.type === 'file' ? e.size : undefined,
      mtimeSec: e.mtime,
      mode: e.mode,
      uid: e.uid,
      gid: e.gid,
    }))
  }, [sftp])

  const refreshRoot = useCallback(
    async (silent?: boolean) => {
      if (!connected || !sftp?.readdir) return
      try {
        const { tree: nextTree, expandedPaths: nextExpanded } = await rebuildSftpTreeWithExpanded(
          loadDir,
          expandedPathsRef.current,
        )
        setTree(nextTree)
        setExpandedPaths(nextExpanded)
        if (!silent) toast.success('Refreshed')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Refresh failed')
      }
    },
    [connected, sftp, loadDir],
  )

  const refreshDirectory = useCallback(
    async (dirPath: string, silent?: boolean) => {
      if (!connected || !sftp?.readdir) return
      try {
        if (dirPath === '/') {
          await refreshRoot(silent)
          return
        }
        const nodes = await loadDir(dirPath)
        const prev = treeRef.current
        if (findNode(prev, dirPath)) {
          setTree(setChildrenAtPath(prev, dirPath, nodes))
          if (!silent) toast.success('Updated')
          return
        }
        const { tree: nextTree, expandedPaths: nextExpanded } = await rebuildSftpTreeWithExpanded(
          loadDir,
          expandedPathsRef.current,
        )
        setTree(nextTree)
        setExpandedPaths(nextExpanded)
        if (!silent) {
          toast.message('Refreshed root listing', {
            description: `Could not merge ${dirPath} into the open tree.`,
          })
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Refresh failed')
      }
    },
    [connected, sftp, loadDir, refreshRoot],
  )

  const migrateTarget =
    migrateEnv === 'prod'
      ? {
          label: 'Production',
          dbName: 'ats_db',
          sftpPath: '/usr/local/edge/data/vsbl',
          confirmKeyword: 'prod',
        }
      : {
          label: 'Staging',
          dbName: 'ats_db_staging',
          sftpPath: '/usr/local/edge/data/vsbl-staging',
          confirmKeyword: 'staging',
        }

  const isMissingPathError = (msg: string): boolean =>
    /no such file|not exist|does not exist|enoent/i.test(msg)

  const runMigrateCleanup = useCallback(async () => {
    if (!sftp?.rmrf || !api?.dbConnect || !api?.dbExecuteQuery || !api?.dbDisconnect) return
    if (migrateConfirmText.trim().toLowerCase() !== migrateTarget.confirmKeyword) {
      toast.error(`Type "${migrateTarget.confirmKeyword}" to confirm`)
      return
    }
    if (!migrateDbUser.trim()) {
      toast.error('Database username is required')
      return
    }
    setMigrateBusy(true)
    try {
      const dropSql = `DROP DATABASE IF EXISTS \`${migrateTarget.dbName.replace(/`/g, '``')}\``
      const conn = await api.dbConnect(host.trim(), migrateDbUser.trim(), migrateDbPass)
      if (!conn.ok) throw new Error(`DB connect failed: ${conn.error}`)
      const dbResult = await api.dbExecuteQuery(dropSql)
      if (!dbResult.ok) {
        throw new Error(`DB cleanup failed: ${dbResult.error}`)
      }

      const rmResult = await sftp.rmrf(migrateTarget.sftpPath)
      if (!rmResult.ok && !isMissingPathError(rmResult.error)) {
        throw new Error(`SFTP cleanup failed: ${rmResult.error}`)
      }

      setMigrateOpen(false)
      setMigrateConfirmText('')
      toast.success(`${migrateTarget.label} cleanup completed`, {
        description: `Dropped ${migrateTarget.dbName} and removed ${migrateTarget.sftpPath}`,
      })
      await refreshRoot(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Migration cleanup failed')
    } finally {
      await api.dbDisconnect()
      setMigrateBusy(false)
    }
  }, [
    api,
    host,
    migrateConfirmText,
    migrateDbPass,
    migrateDbUser,
    migrateTarget.confirmKeyword,
    migrateTarget.dbName,
    migrateTarget.label,
    migrateTarget.sftpPath,
    sftp,
    refreshRoot,
  ])

  const refreshLocalListing = useCallback(async () => {
    if (!api?.localReaddir || !localRoot || !localCwd) return
    const r = await api.localReaddir(localRoot, localCwd)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    setLocalRows(
      r.entries.map((e) => ({
        name: e.name,
        path: joinLocalDir(localCwd, e.name),
        type: e.type,
        sizeBytes: e.type === 'file' ? e.size : undefined,
        mtimeSec: e.mtime,
        mode: e.mode,
      })),
    )
  }, [api, localRoot, localCwd])

  useEffect(() => {
    void refreshLocalListing()
  }, [refreshLocalListing])

  const handleSortChange = useCallback((key: SftpSortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('asc')
      return key
    })
  }, [])

  const handleLocalSortChange = useCallback((key: SftpSortKey) => {
    setLocalSortKey((prev) => {
      if (prev === key) {
        setLocalSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setLocalSortDir('asc')
      return key
    })
  }, [])

  const navigateRemotePath = useCallback(
    async (targetPath: string) => {
      const norm = targetPath.replace(/\/+/g, '/').trim().replace(/\/$/, '') || '/'
      if (!connected || !sftp?.readdir) return
      try {
        let t = await loadDir('/')
        setTree(t)
        const exp = new Set<string>()
        if (norm === '/') {
          setUploadTargetDir('/')
          setSelectedPath(null)
          setExpandedPaths(exp)
          setPathGoInput('/')
          return
        }
        const parts = norm.split('/').filter(Boolean)
        let parentPath = '/'
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]!
          const nextPath = posixJoin(parentPath, part)
          if (parentPath !== '/') {
            const pn = findNode(t, parentPath)
            if (!pn?.loaded) {
              const loaded = await loadDir(parentPath)
              t = setChildrenAtPath(t, parentPath, loaded)
              setTree(t)
            }
          }
          const siblings =
            parentPath === '/' ? t : findNode(t, parentPath)?.children
          if (!siblings?.length) {
            const loaded = await loadDir(parentPath)
            t = parentPath === '/' ? loaded : setChildrenAtPath(t, parentPath, loaded)
            setTree(t)
          }
          const sib = (parentPath === '/' ? t : findNode(t, parentPath)!.children!).find(
            (x) => x.name === part,
          )
          if (!sib) {
            toast.error(`Path not found: ${nextPath}`)
            return
          }
          if (sib.type === 'file') {
            if (i === parts.length - 1) {
              setSelectedPath(nextPath)
              setUploadTargetDir(parentPath)
              setExpandedPaths(exp)
              setTree(t)
              setPathGoInput(norm)
              return
            }
            toast.error('Not a directory')
            return
          }
          exp.add(nextPath)
          if (!sib.loaded) {
            const kids = await loadDir(nextPath)
            t = setChildrenAtPath(t, nextPath, kids)
            setTree(t)
          }
          parentPath = nextPath
        }
        setUploadTargetDir(parentPath)
        setSelectedPath(null)
        setExpandedPaths(exp)
        setTree(t)
        setPathGoInput(norm)
        toast.success('Navigated')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Navigation failed')
      }
    },
    [connected, sftp, loadDir],
  )

  useEffect(() => {
    setPathGoInput(uploadTargetDir)
  }, [uploadTargetDir])

  const applyS3Fields = useCallback((parsed: SavedS3Connection | S3Creds) => {
    if (parsed.bucket) setS3Bucket(parsed.bucket)
    if (parsed.region) setS3Region(parsed.region)
    setS3AccessKey(parsed.accessKeyId || '')
    setS3Secret(parsed.secretAccessKey || '')
    setS3SessionToken(parsed.sessionToken || '')
    setS3Prefix(parsed.prefix || '')
    setS3Endpoint(parsed.endpoint || '')
    setS3RoleArn(parsed.roleArn || '')
    setS3RoleSessionName(parsed.roleSessionName || '')
    setS3ExternalId(parsed.externalId || '')
    setS3SourceIdentity(parsed.sourceIdentity || '')
    setS3AssumeRole(parsed.assumeRole === true || Boolean(parsed.roleArn))
    if (
      parsed.sessionToken ||
      parsed.prefix ||
      (parsed.endpoint && !('protocol' in parsed && parsed.protocol === 's3compat'))
    ) {
      setShowS3Advanced(true)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const list = await loadSavedConnections(api)
      setSavedConnections(list)
      const sftpSaved = list.find((c) => c.protocol === 'sftp')
      const ftpSaved = list.find((c) => c.protocol === 'ftp')
      const s3Saved = list.find((c) => c.protocol === 's3' || c.protocol === 's3compat')
      if (sftpSaved) {
        setHost(sftpSaved.host)
        setSftpPort(sftpSaved.port || '22')
        setSftpUser(sftpSaved.user)
        setSftpPass(sftpSaved.pass)
        setSftpKeyPath(sftpSaved.privateKeyPath || '')
        setSftpKeyPass(sftpSaved.passphrase || '')
        setSftpUseKey(Boolean(sftpSaved.privateKeyPath))
      }
      if (ftpSaved && !sftpSaved) {
        setHost(ftpSaved.host)
        setSftpPort(ftpSaved.port || '21')
        setSftpUser(ftpSaved.user)
        setSftpPass(ftpSaved.pass)
        setFtpSecure(ftpSaved.secure)
      }
      if (s3Saved && isObjectStoreConnection(s3Saved)) applyS3Fields(s3Saved)
      let preferredProtocol: ExplorerProtocol = 'sftp'
      try {
        preferredProtocol = parseStoredProtocol(localStorage.getItem(PROTOCOL_KEY))
      } catch {
        /* ignore */
      }
      const preferred =
        (preferredProtocol === 's3' || preferredProtocol === 's3compat'
          ? list.find((c) => c.protocol === preferredProtocol) ?? s3Saved
          : preferredProtocol === 'ftp'
            ? ftpSaved
            : sftpSaved) ?? list[0] ?? null
      if (preferred) {
        setSaveConnectionName(preferred.name)
        setActiveSavedId(preferred.id)
      }
      setCredsLoaded(true)
    })()
  }, [api, applyS3Fields])

  const selectProtocol = useCallback((next: ExplorerProtocol) => {
    setProtocolChosen(true)
    setProtocol((prev) => {
      if (prev !== next) {
        setSaveConnectionName('')
        setActiveSavedId(null)
        if ((prev === 'sftp' || prev === 'ftp') && (next === 'sftp' || next === 'ftp')) {
          setSftpPort((port) => {
            const n = port.trim()
            if (prev === 'sftp' && (n === '' || n === '22')) return '21'
            if (prev === 'ftp' && (n === '' || n === '21' || n === '990')) return '22'
            return port
          })
        }
      }
      return next
    })
    try {
      localStorage.setItem(PROTOCOL_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const applySavedToForm = useCallback(
    (c: SavedExplorerConnection) => {
      setActiveSavedId(c.id)
      setSaveConnectionName(c.name)
      if (isObjectStoreConnection(c)) {
        selectProtocol(c.protocol)
        applyS3Fields(c)
        return
      }
      if (c.protocol === 'ftp') {
        selectProtocol('ftp')
        setHost(c.host)
        setSftpPort(c.port || '21')
        setSftpUser(c.user)
        setSftpPass(c.pass)
        setFtpSecure(c.secure)
        return
      }
      selectProtocol('sftp')
      setHost(c.host)
      setSftpPort(c.port || '22')
      setSftpUser(c.user)
      setSftpPass(c.pass)
      setSftpKeyPath(c.privateKeyPath || '')
      setSftpKeyPass(c.passphrase || '')
      setSftpUseKey(Boolean(c.privateKeyPath))
    },
    [applyS3Fields, selectProtocol],
  )

  const draftFromForm = useCallback((): SavedConnectionDraft => {
    if (isObjectStoreProtocol(protocol)) {
      return {
        protocol,
        name: saveConnectionName,
        bucket: s3Bucket.trim(),
        region: s3Region.trim(),
        accessKeyId: s3AccessKey.trim(),
        secretAccessKey: s3Secret,
        sessionToken: s3SessionToken.trim() || undefined,
        prefix: s3Prefix.trim() || undefined,
        endpoint: s3Endpoint.trim() || undefined,
        assumeRole: protocol === 's3' && s3AssumeRole,
        roleArn: protocol === 's3' ? s3RoleArn.trim() || undefined : undefined,
        roleSessionName: protocol === 's3' ? s3RoleSessionName.trim() || undefined : undefined,
        externalId: protocol === 's3' ? s3ExternalId.trim() || undefined : undefined,
        sourceIdentity: protocol === 's3' ? s3SourceIdentity.trim() || undefined : undefined,
      }
    }
    if (protocol === 'ftp') {
      return {
        protocol: 'ftp',
        name: saveConnectionName,
        host: host.trim(),
        port: sftpPort.trim() || '21',
        user: sftpUser.trim(),
        pass: sftpPass,
        secure: ftpSecure,
      }
    }
    return {
      protocol: 'sftp',
      name: saveConnectionName,
      host: host.trim(),
      port: sftpPort.trim() || '22',
      user: sftpUser.trim(),
      pass: sftpPass,
      privateKeyPath: sftpUseKey ? sftpKeyPath.trim() || undefined : undefined,
      passphrase: sftpUseKey ? sftpKeyPass || undefined : undefined,
    }
  }, [
    protocol,
    saveConnectionName,
    s3Bucket,
    s3Region,
    s3AccessKey,
    s3Secret,
    s3SessionToken,
    s3Prefix,
    s3Endpoint,
    s3AssumeRole,
    s3RoleArn,
    s3RoleSessionName,
    s3ExternalId,
    s3SourceIdentity,
    host,
    sftpPort,
    sftpUser,
    sftpPass,
    ftpSecure,
    sftpUseKey,
    sftpKeyPath,
    sftpKeyPass,
  ])

  const commitSavedList = useCallback(
    async (list: SavedExplorerConnection[]) => {
      setSavedConnections(list)
      await persistSavedConnections(list, api)
    },
    [api],
  )

  const saveCurrentConnection = useCallback(async () => {
    const draft = draftFromForm()
    if ((draft.protocol === 'sftp' || draft.protocol === 'ftp') && (!draft.host || !draft.user)) {
      toast.error('Host and username are required to save')
      return
    }
    if (draft.protocol === 'sftp' && !draft.pass && !draft.privateKeyPath) {
      toast.error('Password or private key is required to save')
      return
    }
    if (isObjectStoreConnection(draft) && (!draft.bucket || !draft.accessKeyId || !draft.secretAccessKey)) {
      toast.error('Bucket, access key, and secret are required to save')
      return
    }
    if (draft.protocol === 's3compat' && !draft.endpoint?.trim()) {
      toast.error('Endpoint is required for S3-compatible storage')
      return
    }
    const next = upsertSavedConnection(savedConnections, {
      ...draft,
      pinned: true,
      id: activeSavedId && savedConnections.find((c) => c.id === activeSavedId)?.protocol === protocol
        ? activeSavedId
        : undefined,
    })
    await commitSavedList(next)
    const saved = next[0]
    if (saved) {
      setActiveSavedId(saved.id)
      setSaveConnectionName(saved.name)
      toast.success(`Saved ${saved.name}`)
    }
  }, [activeSavedId, commitSavedList, draftFromForm, savedConnections])

  const pinSaved = useCallback(
    async (c: SavedExplorerConnection) => {
      const next = upsertSavedConnection(savedConnections, { ...c, pinned: true })
      await commitSavedList(next)
      setActiveSavedId(next[0]?.id ?? c.id)
      toast.success(`Saved ${c.name}`)
    },
    [commitSavedList, savedConnections],
  )

  const deleteSaved = useCallback(
    async (id: string) => {
      const next = removeSavedConnection(savedConnections, id)
      await commitSavedList(next)
      if (activeSavedId === id) setActiveSavedId(null)
      toast.success('Removed saved connection')
    },
    [activeSavedId, commitSavedList, savedConnections],
  )

  useEffect(() => {
    if (!migrateOpen) return
    ;(async () => {
      setMigrateCredsLoaded(false)
      try {
        if (api?.safeStoreGet) {
          const raw = await api.safeStoreGet(DB_CREDS_KEY)
          if (raw) {
            const parsed = JSON.parse(raw) as { user?: string; pass?: string }
            setMigrateDbUser(parsed.user || '')
            setMigrateDbPass(parsed.pass || '')
            setMigrateCredsLoaded(true)
            return
          }
        }
      } catch {
        /* fall through */
      }
      try {
        const raw = localStorage.getItem(DB_CREDS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as { user?: string; pass?: string }
          setMigrateDbUser(parsed.user || '')
          setMigrateDbPass(parsed.pass || '')
        }
      } catch {
        /* ignore */
      }
      setMigrateCredsLoaded(true)
    })()
  }, [api, migrateOpen])

  const handleConnect = useCallback(async (source?: SavedExplorerConnection) => {
    if (!api?.sftpConnect) return
    const fromSaved =
      source &&
      typeof source === 'object' &&
      (source.protocol === 'sftp' ||
        source.protocol === 'ftp' ||
        source.protocol === 's3' ||
        source.protocol === 's3compat')
        ? source
        : undefined
    const proto = fromSaved?.protocol ?? protocol
    const hostValue = fromSaved && (fromSaved.protocol === 'sftp' || fromSaved.protocol === 'ftp') ? fromSaved.host : host
    const portValue = fromSaved && (fromSaved.protocol === 'sftp' || fromSaved.protocol === 'ftp') ? fromSaved.port : sftpPort
    const userValue = fromSaved && (fromSaved.protocol === 'sftp' || fromSaved.protocol === 'ftp') ? fromSaved.user : sftpUser
    const passValue = fromSaved && (fromSaved.protocol === 'sftp' || fromSaved.protocol === 'ftp') ? fromSaved.pass : sftpPass
    const keyPathValue =
      fromSaved?.protocol === 'sftp' ? fromSaved.privateKeyPath ?? '' : sftpUseKey ? sftpKeyPath : ''
    const keyPassValue = fromSaved?.protocol === 'sftp' ? fromSaved.passphrase ?? '' : sftpKeyPass
    const ftpSecureValue = fromSaved?.protocol === 'ftp' ? fromSaved.secure : ftpSecure
    const s3 = fromSaved && isObjectStoreConnection(fromSaved) ? fromSaved : null
    if ((proto === 'sftp' || proto === 'ftp') && (!userValue.trim() || !hostValue.trim())) return
    if (proto === 'sftp' && !passValue && !keyPathValue.trim()) return
    if (proto === 'ftp' && !passValue) return
    if (
      isObjectStoreProtocol(proto) &&
      (!api.s3Connect ||
        !(s3?.bucket ?? s3Bucket).trim() ||
        !(s3?.region ?? s3Region).trim() ||
        !(s3?.accessKeyId ?? s3AccessKey).trim() ||
        !(s3?.secretAccessKey ?? s3Secret) ||
        (proto === 's3compat' && !(s3?.endpoint ?? s3Endpoint).trim()) ||
        (proto === 's3' &&
          (s3?.assumeRole ?? s3AssumeRole) &&
          (!(s3?.roleArn ?? s3RoleArn).trim() || !(s3?.roleSessionName ?? s3RoleSessionName).trim())))
    ) {
      return
    }
    if (fromSaved) applySavedToForm(fromSaved)
    setConnecting(true)
    setConnError('')
    const result =
      isObjectStoreProtocol(proto)
        ? await api.s3Connect!({
            bucket: (s3?.bucket ?? s3Bucket).trim(),
            region: (s3?.region ?? s3Region).trim(),
            accessKeyId: (s3?.accessKeyId ?? s3AccessKey).trim(),
            secretAccessKey: s3?.secretAccessKey ?? s3Secret,
            sessionToken: (s3 ? s3.sessionToken : s3SessionToken)?.trim() || undefined,
            prefix: (s3 ? s3.prefix : s3Prefix)?.trim() || undefined,
            endpoint: (s3 ? s3.endpoint : s3Endpoint)?.trim() || undefined,
            roleArn:
              proto === 's3' && (s3 ? s3.assumeRole : s3AssumeRole)
                ? (s3 ? s3.roleArn : s3RoleArn)?.trim() || undefined
                : undefined,
            roleSessionName:
              proto === 's3' && (s3 ? s3.assumeRole : s3AssumeRole)
                ? (s3 ? s3.roleSessionName : s3RoleSessionName)?.trim() || undefined
                : undefined,
            externalId:
              proto === 's3' && (s3 ? s3.assumeRole : s3AssumeRole)
                ? (s3 ? s3.externalId : s3ExternalId)?.trim() || undefined
                : undefined,
            sourceIdentity:
              proto === 's3' && (s3 ? s3.assumeRole : s3AssumeRole)
                ? (s3 ? s3.sourceIdentity : s3SourceIdentity)?.trim() || undefined
                : undefined,
          })
        : proto === 'ftp'
          ? await api.ftpConnect!({
              host: hostValue.trim(),
              port: parseInt(portValue, 10) || (ftpSecureValue === 'implicit' ? 990 : 21),
              user: userValue.trim(),
              password: passValue,
              secure: ftpSecureValue,
            })
          : await api.sftpConnect(
              hostValue.trim(),
              parseInt(portValue, 10) || 22,
              userValue.trim(),
              passValue,
              keyPathValue.trim()
                ? { privateKeyPath: keyPathValue.trim(), passphrase: keyPassValue || undefined }
                : undefined,
            )
    if (result.ok) {
      setSessionId(result.sessionId)
      setConnected(true)
      const draft = fromSaved ?? draftFromForm()
      const next = upsertSavedConnection(savedConnections, {
        ...draft,
        pinned: false,
        id:
          fromSaved?.id ??
          (savedConnections.find((c) => c.id === activeSavedId)?.protocol === proto
            ? activeSavedId ?? undefined
            : undefined),
        name: resolvedConnectionName(draft, fromSaved?.name || saveConnectionName),
      })
      await commitSavedList(next)
      const current = next.find((c) => connectionIdentity(c) === connectionIdentity(draft))
      if (current) {
        setActiveSavedId(current.id)
        setSaveConnectionName(current.name)
      }
      try {
        const bound = bindSftpSession(api, result.sessionId)
        const nodes = await bound.readdir('/').then((r) => {
          if (!r.ok) throw new Error(r.error)
          return r.entries.map((e) => ({
            path: posixJoin('/', e.name),
            name: e.name,
            type: e.type,
            extension: e.type === 'file' ? fileExtension(e.name) : undefined,
            loaded: e.type === 'file' ? true : false,
            children: e.type === 'folder' ? undefined : undefined,
            sizeBytes: e.type === 'file' ? e.size : undefined,
            mtimeSec: e.mtime,
            mode: e.mode,
            uid: e.uid,
            gid: e.gid,
          }))
        })
        setTree(nodes)
        setUploadTargetDir('/')
        setSelectedPath(null)
        setSelectedPaths(new Set())
        setSelectMode(false)
        setExpandedPaths(new Set())
        toast.success(connectedToast(proto))
      } catch (e) {
        setConnError(e instanceof Error ? e.message : 'Failed to list root')
        await api.sftpDisconnect(result.sessionId)
        setSessionId(null)
        setConnected(false)
      }
    } else {
      setConnError(result.error)
    }
    setConnecting(false)
  }, [
    api,
    protocol,
    sftpUser,
    host,
    sftpPort,
    sftpPass,
    sftpUseKey,
    sftpKeyPath,
    sftpKeyPass,
    ftpSecure,
    s3Bucket,
    s3Region,
    s3AccessKey,
    s3Secret,
    s3SessionToken,
    s3Prefix,
    s3Endpoint,
    s3AssumeRole,
    s3RoleArn,
    s3RoleSessionName,
    s3ExternalId,
    s3SourceIdentity,
    saveConnectionName,
    savedConnections,
    activeSavedId,
    applySavedToForm,
    draftFromForm,
    commitSavedList,
  ])

  const handleDisconnect = useCallback(async () => {
    if (sessionId && api) await api.sftpDisconnect(sessionId)
    setSessionId(null)
    setConnected(false)
    setTree([])
    setSelectedPath(null)
    setSelectedPaths(new Set())
    setSelectMode(false)
    setExpandedPaths(new Set())
    setTransferQueue([])
  }, [api, sessionId])

  useEffect(() => {
    onRegisterDisconnect?.(handleDisconnect)
    return () => onUnregisterDisconnect?.()
  }, [handleDisconnect, onRegisterDisconnect, onUnregisterDisconnect])

  const handleToggleFolder = useCallback(
    async (node: SftpFileNode) => {
      const client = sftpRef.current
      if (node.type !== 'folder' || !client) return
      if (node.loading) return
      if (!node.loaded) {
        setTree((prev) => setNodeLoading(prev, node.path, true))
        try {
          const children = await loadDir(node.path)
          setTree((prev) => setChildrenAtPath(prev, node.path, children))
        } catch (e) {
          setTree((prev) => setNodeLoading(prev, node.path, false))
          toast.error(e instanceof Error ? e.message : 'Failed to open folder')
          return
        }
      }
      setExpandedPaths((prev) => new Set(prev).add(node.path))
    },
    [loadDir],
  )

  const onRequestCollapse = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const n = new Set(prev)
      n.delete(path)
      return n
    })
  }, [])

  const collapseAllFolders = useCallback(() => {
    setExpandedPaths(new Set())
  }, [])

  const togglePathSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleSelectNode = useCallback((node: SftpFileNode) => {
    setSelectedPath(node.path)
    if (node.type === 'folder') {
      setUploadTargetDir(node.path)
    } else {
      setUploadTargetDir(parentDir(node.path))
    }
  }, [])

  const selectAllInTargetDir = useCallback(() => {
    const paths = getDirectChildPaths(tree, uploadTargetDir)
    if (paths.length === 0) {
      toast.message('Nothing to select', {
        description: `Open "${uploadTargetDir}" in the tree first (expand folders) or pick another target folder.`,
      })
      return
    }
    setSelectedPaths(new Set(paths))
    toast.success(`Selected ${paths.length} item(s)`)
  }, [tree, uploadTargetDir])

  const downloadRemoteFile = useCallback(
    async (remotePath: string, label: string) => {
      const client = sftpRef.current
      if (!client?.downloadSaveDialog) {
        toast.error('Download requires the latest desktop build')
        return
      }
      const id = nextOpId()
      pushTransfer({ id, label, kind: 'download' })
      const r = await client.downloadSaveDialog(remotePath, id)
      if ('cancelled' in r && r.cancelled) {
        updateTransfer(id, { status: 'done', progress: 100 })
        return
      }
      if (r.ok) {
        updateTransfer(id, { status: 'done', progress: 100 })
        toast.success('Downloaded')
      } else {
        updateTransfer(id, { status: 'error', error: 'error' in r ? r.error : 'Failed' })
        toast.error('error' in r ? r.error : 'Download failed')
      }
    },
    [pushTransfer, updateTransfer],
  )

  const downloadToLocalPath = useCallback(
    async (remotePath: string, localPath: string, label: string) => {
      if (!sftp?.downloadToPath) return
      const id = nextOpId()
      pushTransfer({ id, label, kind: 'download' })
      const r = await sftp.downloadToPath(remotePath, localPath, id, localRoot ?? undefined)
      if (r.ok) {
        updateTransfer(id, { status: 'done', progress: 100 })
      } else {
        updateTransfer(id, { status: 'error', error: r.error })
        toast.error(r.error)
      }
    },
    [sftp, localRoot, pushTransfer, updateTransfer],
  )

  const downloadRemoteFolder = useCallback(
    async (remoteFolderPath: string, folderName: string) => {
      const client = sftpRef.current
      if (!api?.localPickFolder || !client?.downloadToPath || !client?.readdir) {
        toast.error('Folder download requires the desktop app')
        return
      }
      try {
        const files = await collectRemoteFiles(client, remoteFolderPath)
        if (files.length === 0) {
          toast.message('Folder is empty')
          return
        }
        const pick = await api.localPickFolder()
        if (!pick.ok || !('path' in pick) || !pick.path) return
        const localBase = joinLocalDir(pick.path, folderName)
        for (const { remotePath, relPath } of files) {
          const dest = joinLocalSegments(localBase, relPath)
          await downloadToLocalPath(remotePath, dest, relPath)
        }
        toast.success(`Downloaded ${files.length} file(s) from ${folderName}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Folder download failed')
      }
    },
    [api, downloadToLocalPath],
  )

  const downloadRemoteItem = useCallback(
    async (node: SftpFileNode) => {
      if (node.type === 'folder') {
        await downloadRemoteFolder(node.path, node.name)
      } else {
        await downloadRemoteFile(node.path, node.name)
      }
    },
    [downloadRemoteFile, downloadRemoteFolder],
  )

  const openRemoteCtxMenu = useCallback((node: SftpFileNode, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleSelectNode(node)
    setCtxMenu({ x: e.clientX, y: e.clientY, node })
  }, [handleSelectNode])

  const openRenameForNode = useCallback((node: SftpFileNode) => {
    handleSelectNode(node)
    setRenameValue(node.name)
    setRenameOpen(true)
  }, [handleSelectNode])

  const openEditForNode = useCallback(
    async (node: SftpFileNode) => {
      if (node.type !== 'file') return
      const client = sftpRef.current
      if (!client?.readFile) {
        toast.error('Not connected')
        return
      }
      const r = await client.readFile(node.path)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      if ('isBinary' in r && r.isBinary) {
        toast.error('Binary file — use Download instead')
        return
      }
      if ('text' in r) {
        handleSelectNode(node)
        setEditPath(node.path)
        setEditText(r.text)
        setEditOpen(true)
        return
      }
      toast.error('Could not read file')
    },
    [handleSelectNode],
  )

  const duplicateForNode = useCallback(
    async (node: SftpFileNode) => {
      const client = sftpRef.current
      if (node.type !== 'file' || !client?.copyRemoteFile) return
      const base = node.name
      const dot = base.lastIndexOf('.')
      const copyName =
        dot > 0 ? `${base.slice(0, dot)}-copy${base.slice(dot)}` : `${base}-copy`
      const dest = posixJoin(parentDir(node.path), copyName)
      const id = nextOpId()
      pushTransfer({ id, label: `Copy ${base}`, kind: 'copy' })
      const r = await client.copyRemoteFile(node.path, dest, id)
      if (r.ok) {
        updateTransfer(id, { status: 'done', progress: 100 })
        toast.success('Duplicated on server')
        await refreshDirectory(parentDir(node.path), true)
      } else {
        updateTransfer(id, { status: 'error', error: r.error })
        toast.error(r.error)
      }
    },
    [pushTransfer, updateTransfer, refreshDirectory],
  )

  const deleteNode = useCallback((node: SftpFileNode) => {
    handleSelectNode(node)
    setDeleteTargets([
      { path: node.path, name: node.name, isFolder: node.type === 'folder' },
    ])
  }, [handleSelectNode])

  const copyTextToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }, [])

  const openPropertiesForNode = useCallback((node: SftpFileNode) => {
    handleSelectNode(node)
    setPropertiesNode(node)
    setPropertiesOpen(true)
  }, [handleSelectNode])

  const openMoveForNode = useCallback((node: SftpFileNode) => {
    handleSelectNode(node)
    setMoveNode(node)
    setMoveOpen(true)
  }, [handleSelectNode])

  const openNode = useCallback(
    (node: SftpFileNode) => {
      const live = findNode(treeRef.current, node.path) ?? node
      handleSelectNode(live)
      if (live.type === 'folder') {
        void handleToggleFolder(live)
      } else {
        void openEditForNode(live)
      }
    },
    [handleSelectNode, handleToggleFolder, openEditForNode],
  )

  const pickLocalRoot = useCallback(async () => {
    if (!api?.localPickFolder) return
    const r = await api.localPickFolder()
    if (!r.ok || !('path' in r) || !r.path) return
    setLocalRoot(r.path)
    setLocalCwd(r.path)
    setLocalSelectedPath(null)
    toast.success('Local folder set')
  }, [api])

  const handleDropOnDir = useCallback(
    async (targetDir: string, e: React.DragEvent) => {
      if (!sftp) return
      const localRaw = e.dataTransfer.getData(LOCAL_DND_MIME)
      if (localRaw && sftp?.uploadFromLocal) {
        try {
          const { path: localPath, name } = JSON.parse(localRaw) as { path: string; name: string }
          const id = nextOpId()
          pushTransfer({ id, label: `${name} → remote`, kind: 'upload' })
          const dest = posixJoin(targetDir, name)
          const r = await sftp.uploadFromLocal(localPath, dest, id, localRoot ?? undefined)
          if (r.ok) {
            updateTransfer(id, { status: 'done', progress: 100 })
            toast.success('Uploaded')
            await refreshDirectory(targetDir, true)
          } else {
            updateTransfer(id, { status: 'error', error: r.error })
            toast.error(r.error)
          }
        } catch {
          toast.error('Upload failed')
        }
        return
      }
      const raw = e.dataTransfer.getData(SFTP_DND_MIME)
      if (raw) {
        try {
          const { path: fromPath, name } = JSON.parse(raw) as {
            path: string
            name: string
          }
          const toPath = posixJoin(targetDir, name)
          if (fromPath === toPath) return
          const r = await sftp.rename(fromPath, toPath)
          if (r.ok) {
            toast.success('Moved')
            await refreshRoot(true)
            if (selectedPath === fromPath) setSelectedPath(toPath)
            setSelectedPaths((prev) => {
              if (!prev.has(fromPath)) return prev
              const next = new Set(prev)
              next.delete(fromPath)
              next.add(toPath)
              return next
            })
          } else {
            toast.error(r.error)
          }
        } catch {
          toast.error('Move failed')
        }
        return
      }
      const files = e.dataTransfer.files
      if (files?.length) {
        let okCount = 0
        for (const f of Array.from(files)) {
          try {
            const buf = await f.arrayBuffer()
            const b64 = arrayBufferToBase64(buf)
            const dest = posixJoin(targetDir, f.name)
            const w = await sftp.writeFile(dest, b64)
            if (!w.ok) {
              toast.error(`${f.name}: ${w.error}`)
              break
            }
            okCount++
          } catch {
            toast.error(`Upload failed: ${f.name}`)
            break
          }
        }
        if (okCount > 0) toast.success(`Uploaded ${okCount} file(s)`)
        await refreshDirectory(targetDir, true)
      }
    },
    [sftp, refreshRoot, refreshDirectory, selectedPath, pushTransfer, updateTransfer],
  )

  const handleDropOnLocal = useCallback(
    async (localDirPath: string, e: React.DragEvent) => {
      if (!api || !localRoot) return
      e.preventDefault()
      const raw = e.dataTransfer.getData(SFTP_DND_MIME)
      if (raw) {
        try {
          const { path: remotePath, name, type } = JSON.parse(raw) as {
            path: string
            name: string
            type: string
          }
          if (type === 'folder') {
            await downloadRemoteFolder(remotePath, name)
            await refreshLocalListing()
            return
          }
          if (type !== 'file') {
            toast.error('Unsupported item type')
            return
          }
          const localPath = joinLocalDir(localDirPath, name)
          await downloadToLocalPath(remotePath, localPath, name)
          await refreshLocalListing()
        } catch {
          toast.error('Download failed')
        }
        return
      }
      const files = e.dataTransfer.files
      if (files?.length && api.localWriteFileBase64) {
        for (const f of Array.from(files)) {
          try {
            const buf = await f.arrayBuffer()
            const b64 = arrayBufferToBase64(buf)
            const dest = joinLocalDir(localDirPath, f.name)
            const w = await api.localWriteFileBase64(localRoot, dest, b64)
            if (!w.ok) {
              toast.error(w.error)
              break
            }
          } catch {
            toast.error(`Save failed: ${f.name}`)
            break
          }
        }
        toast.success('Saved to local folder')
        await refreshLocalListing()
      }
    },
    [api, localRoot, downloadToLocalPath, downloadRemoteFolder, refreshLocalListing],
  )

  const submitCreate = useCallback(async () => {
    if (!createKind || !sftp) return
    const safe = createName.trim().replace(/[/\\]/g, '')
    if (!safe) {
      toast.error('Enter a valid name')
      return
    }
    const p = posixJoin(uploadTargetDir, safe)
    setCreateBusy(true)
    try {
      if (createKind === 'folder') {
        if (!sftp?.mkdir) return
        const r = await sftp.mkdir(p)
        if (r.ok) {
          toast.success('Folder created')
          setCreateKind(null)
          setCreateName('')
          await refreshDirectory(uploadTargetDir, true)
        } else {
          toast.error(r.error)
        }
      } else {
        if (!sftp?.writeTextFile) return
        const r = await sftp.writeTextFile(p, '')
        if (r.ok) {
          toast.success('File created')
          setCreateKind(null)
          setCreateName('')
          await refreshDirectory(uploadTargetDir, true)
        } else {
          toast.error(r.error)
        }
      }
    } finally {
      setCreateBusy(false)
    }
  }, [createKind, createName, sftp, uploadTargetDir, refreshDirectory])

  const onPickFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length || !sftp) return
      for (const f of Array.from(list)) {
        const dest = posixJoin(uploadTargetDir, f.name)
        const filePath = (f as File & { path?: string }).path
        if (filePath && sftp?.uploadFromLocal) {
          const id = nextOpId()
          pushTransfer({ id, label: f.name, kind: 'upload' })
          const r = await sftp.uploadFromLocal(filePath, dest, id, localRoot ?? undefined)
          if (r.ok) updateTransfer(id, { status: 'done', progress: 100 })
          else {
            updateTransfer(id, { status: 'error', error: r.error })
            toast.error(`${f.name}: ${r.error}`)
          }
        } else {
          try {
            const buf = await f.arrayBuffer()
            const b64 = arrayBufferToBase64(buf)
            const w = await sftp.writeFile(dest, b64)
            if (!w.ok) {
              toast.error(`${f.name}: ${w.error}`)
              break
            }
          } catch {
            toast.error(`Upload failed: ${f.name}`)
            break
          }
        }
      }
      toast.success('Upload finished')
      await refreshDirectory(uploadTargetDir, true)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [sftp, uploadTargetDir, refreshDirectory, pushTransfer, updateTransfer],
  )

  const confirmDelete = useCallback(async () => {
    if (!deleteTargets?.length || !sftp) return
    setDeleting(true)
    const sorted = [...deleteTargets].sort((a, b) => b.path.length - a.path.length)
    let failed: string | undefined
    for (const item of sorted) {
      const r = item.isFolder ? await sftp.rmrf(item.path) : await sftp.unlink(item.path)
      if (!r.ok) {
        failed = r.error
        break
      }
    }
    setDeleting(false)
    setDeleteTargets(null)
    if (!failed) {
      toast.success(sorted.length === 1 ? 'Deleted' : `Deleted ${sorted.length} items`)
      setSelectedPaths(new Set())
      setSelectedPath(null)
      await refreshRoot(true)
    } else {
      toast.error(failed)
      await refreshRoot(true)
    }
  }, [deleteTargets, sftp, refreshRoot])

  const submitRename = useCallback(async () => {
    const node = selectedPath ? findNode(tree, selectedPath) : null
    if (!selectedPath || !node || !sftp?.rename) return
    const safe = renameValue.trim().replace(/[/\\]/g, '')
    if (!safe) {
      toast.error('Invalid name')
      return
    }
    const newPath = posixJoin(parentDir(selectedPath), safe)
    if (newPath === selectedPath) {
      setRenameOpen(false)
      return
    }
    setRenameBusy(true)
    try {
      const r = await sftp.rename(selectedPath, newPath)
      if (r.ok) {
        toast.success('Renamed')
        setRenameOpen(false)
        setSelectedPath(newPath)
        await refreshRoot(true)
      } else {
        toast.error(r.error)
      }
    } finally {
      setRenameBusy(false)
    }
  }, [selectedPath, tree, renameValue, sftp, refreshRoot])

  const submitEdit = useCallback(async () => {
    if (!editPath || !sftp?.writeTextFile) return
    setEditBusy(true)
    try {
      const r = await sftp.writeTextFile(editPath, editText)
      if (r.ok) {
        toast.success('Saved')
        setEditOpen(false)
        await refreshDirectory(parentDir(editPath), true)
      } else {
        toast.error(r.error)
      }
    } finally {
      setEditBusy(false)
    }
  }, [editPath, editText, sftp, refreshDirectory])

  const batchDownload = useCallback(async () => {
    if (!api?.localPickFolder || !sftp?.downloadToPath) return
    const nodes = Array.from(selectedPaths)
      .map((p) => findNode(tree, p))
      .filter((n): n is SftpFileNode => Boolean(n))
    if (nodes.length === 0) {
      toast.message('Select one or more items')
      return
    }
    const pick = await api.localPickFolder()
    if (!pick.ok || !('path' in pick) || !pick.path) return
    let count = 0
    for (const n of nodes) {
      if (n.type === 'file') {
        const localPath = joinLocalDir(pick.path, n.name)
        await downloadToLocalPath(n.path, localPath, n.name)
        count++
      } else {
        try {
          const files = await collectRemoteFiles(sftp, n.path)
          const localBase = joinLocalDir(pick.path, n.name)
          for (const { remotePath, relPath } of files) {
            const dest = joinLocalSegments(localBase, relPath)
            await downloadToLocalPath(remotePath, dest, relPath)
            count++
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : `Failed to list ${n.name}`)
        }
      }
    }
    toast.success(`Queued ${count} download(s)`)
  }, [api, sftp, selectedPaths, tree, downloadToLocalPath])

  useEffect(() => {
    if (!connected) return
    const isTyping = () => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
    }
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setFindOpen(true)
        return
      }
      const node = selectedPath ? findNode(treeRef.current, selectedPath) : null
      if (!node) return
      if (e.key === 'F2') {
        e.preventDefault()
        openRenameForNode(node)
      } else if (e.key === 'F8') {
        e.preventDefault()
        deleteNode(node)
      } else if (e.key === 'F9') {
        e.preventDefault()
        openPropertiesForNode(node)
      } else if (e.key === 'F5' && !e.shiftKey) {
        e.preventDefault()
        void downloadRemoteItem(node)
      } else if (e.key === 'F5' && e.shiftKey) {
        e.preventDefault()
        void duplicateForNode(node)
      } else if (e.key === 'F6' && e.shiftKey) {
        e.preventDefault()
        openMoveForNode(node)
      } else if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void copyTextToClipboard(node.path, 'Path copied')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    connected,
    selectedPath,
    openRenameForNode,
    deleteNode,
    openPropertiesForNode,
    downloadRemoteItem,
    duplicateForNode,
    openMoveForNode,
    copyTextToClipboard,
  ])

  const selectedNode = selectedPath ? findNode(tree, selectedPath) : null

  if (!hasSftp) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-6" data-tour="tour-sftp">
        <Monitor className="w-12 h-12 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">File explorer</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            SFTP, FTP, and object storage are only available in the desktop Electron app. Run the packaged or dev desktop
            build to connect and browse remote files.
          </p>
        </div>
      </div>
    )
  }

  if (!connected) {
    const canConnect =
      credsLoaded &&
      !connecting &&
      (isObjectStoreProtocol(protocol)
        ? Boolean(
            s3Bucket.trim() &&
              s3Region.trim() &&
              s3AccessKey.trim() &&
              s3Secret &&
              (protocol !== 's3compat' || s3Endpoint.trim()) &&
              (protocol !== 's3' || !s3AssumeRole || (s3RoleArn.trim() && s3RoleSessionName.trim())),
          )
        : protocol === 'ftp'
          ? Boolean(sftpUser.trim() && host.trim() && sftpPass)
          : Boolean(sftpUser.trim() && host.trim() && (sftpPass || (sftpUseKey && sftpKeyPath.trim()))))
    return (
      <div
        className={cn('absolute inset-0 min-h-0 overflow-hidden', !isActive && 'hidden')}
        data-tour="tour-sftp-connect"
      >
        <div className="flex h-full min-h-0">
          <SftpSavedConnections
            connections={savedConnections}
            connecting={connecting}
            activeId={activeSavedId}
            onConnect={(c) => void handleConnect(c)}
            onDelete={(id) => void deleteSaved(id)}
            onPin={(c) => void pinSaved(c)}
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
            {!protocolChosen ? (
              <div className="flex min-h-full flex-col items-center justify-center px-6 py-8">
                <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-5">
                  <div className="text-center">
                    <h2 className="text-xl font-semibold text-foreground">Connect to files</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Choose a protocol to continue. Saved connections on the left skip this step.
                    </p>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-3">
                    {PROTOCOL_CHOICES.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => selectProtocol(opt.id)}
                        className="group flex flex-col items-start gap-2 rounded-xl border border-border/50 bg-card/80 px-4 py-4 text-left shadow-sm ring-1 ring-border/20 transition-colors hover:border-primary/40 hover:bg-accent/30 hover:ring-primary/15"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <opt.icon className="h-4 w-4" />
                        </div>
                        <div className="text-sm font-semibold text-foreground">{opt.label}</div>
                        <div className="text-xs leading-relaxed text-muted-foreground">{opt.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
            <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-6">
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={() => {
              setProtocolChosen(false)
              setConnError('')
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Change protocol
          </button>
          <div className="flex items-center gap-3 text-primary">
            <ProtocolGlyph protocol={protocol} className="h-8 w-8" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">{protocolTitle(protocol)}</h2>
              <p className="text-xs text-muted-foreground">{protocolHint(protocol)}</p>
            </div>
          </div>
        </div>
        <div className="w-full space-y-3">
          {isObjectStoreProtocol(protocol) ? (
            <>
              {protocol === 's3compat' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Endpoint</Label>
                  <Input
                    value={s3Endpoint}
                    onChange={(e) => setS3Endpoint(e.target.value)}
                    placeholder="https://minio.example.com"
                    className="font-mono"
                    disabled={!credsLoaded}
                    onKeyDown={(e) => e.key === 'Enter' && void handleConnect()}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Full URL, including https. R2 example: https://&lt;accountid&gt;.r2.cloudflarestorage.com
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bucket</Label>
                <Input
                  value={s3Bucket}
                  onChange={(e) => setS3Bucket(e.target.value)}
                  placeholder="my-bucket"
                  className="font-mono"
                  disabled={!credsLoaded}
                  onKeyDown={(e) => e.key === 'Enter' && void handleConnect()}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Region</Label>
                <Input
                  value={s3Region}
                  onChange={(e) => setS3Region(e.target.value)}
                  placeholder="eu-west-1"
                  className="font-mono"
                  list="s3-regions"
                />
                <datalist id="s3-regions">
                  {S3_REGIONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Access key ID</Label>
                <Input
                  value={s3AccessKey}
                  onChange={(e) => setS3AccessKey(e.target.value)}
                  className="font-mono"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Secret access key</Label>
                <Input
                  type="password"
                  value={s3Secret}
                  onChange={(e) => setS3Secret(e.target.value)}
                  className="font-mono"
                  autoComplete="off"
                  onKeyDown={(e) => e.key === 'Enter' && void handleConnect()}
                />
              </div>
              {protocol === 's3' && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={s3AssumeRole}
                  onChange={(e) => setS3AssumeRole(e.target.checked)}
                  className="rounded border-border/50 accent-primary w-3.5 h-3.5"
                />
                <span className="text-xs text-muted-foreground">Assume Role</span>
              </label>
              )}
              <ExpandSection open={protocol === 's3' && s3AssumeRole}>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Role ARN</Label>
                    <Input
                      value={s3RoleArn}
                      onChange={(e) => setS3RoleArn(e.target.value)}
                      placeholder="arn:aws:iam::123456789012:role/..."
                      className="font-mono"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Session name</Label>
                    <Input
                      value={s3RoleSessionName}
                      onChange={(e) => setS3RoleSessionName(e.target.value)}
                      placeholder="zeus-s3"
                      className="font-mono"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">External ID</Label>
                    <Input
                      type="password"
                      value={s3ExternalId}
                      onChange={(e) => setS3ExternalId(e.target.value)}
                      className="font-mono"
                      autoComplete="off"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Required for most cross-account roles. Paste the same value as the working tool — AccessDenied
                      usually means this field is missing or from a different connection.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Source identity (optional)</Label>
                    <Input
                      value={s3SourceIdentity}
                      onChange={(e) => setS3SourceIdentity(e.target.value)}
                      className="font-mono"
                      autoComplete="off"
                    />
                  </div>
              </ExpandSection>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowS3Advanced((v) => !v)}
              >
                {showS3Advanced ? 'Hide advanced' : protocol === 's3compat' ? 'Advanced: prefix, session token' : 'Advanced: prefix, endpoint, session token'}
              </button>
              <ExpandSection open={showS3Advanced}>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Prefix (optional)</Label>
                    <Input
                      value={s3Prefix}
                      onChange={(e) => setS3Prefix(e.target.value)}
                      placeholder="exports/edge"
                      className="font-mono"
                    />
                  </div>
                  {protocol === 's3' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Endpoint (optional)</Label>
                    <Input
                      value={s3Endpoint}
                      onChange={(e) => setS3Endpoint(e.target.value)}
                      placeholder="https://s3.example.com"
                      className="font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">Use a custom endpoint for MinIO or LocalStack.</p>
                  </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Session token for keys (optional)</Label>
                    <Input
                      type="password"
                      value={s3SessionToken}
                      onChange={(e) => setS3SessionToken(e.target.value)}
                      className="font-mono"
                      autoComplete="off"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Only if the access keys themselves are temporary. Assume Role does not use this field.
                    </p>
                  </div>
              </ExpandSection>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Host</Label>
                <Input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.x.x"
                  className="font-mono"
                  disabled={!credsLoaded}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{protocol === 'ftp' ? 'Port' : 'SSH port'}</Label>
                <Input
                  value={sftpPort}
                  onChange={(e) => setSftpPort(e.target.value)}
                  placeholder={protocol === 'ftp' ? (ftpSecure === 'implicit' ? '990' : '21') : '22'}
                  className="font-mono w-32"
                />
              </div>
              {protocol === 'ftp' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Encryption</Label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/35 p-1 ring-1 ring-border/25">
                    {([
                      { id: 'off' as const, label: 'None' },
                      { id: 'explicit' as const, label: 'FTPS' },
                      { id: 'implicit' as const, label: 'Implicit' },
                    ]).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setFtpSecure(opt.id)
                          setSftpPort((prev) => {
                            const n = prev.trim()
                            if (opt.id === 'implicit' && (n === '' || n === '21')) return '990'
                            if (opt.id !== 'implicit' && (n === '' || n === '990')) return '21'
                            return prev
                          })
                        }}
                        className={cn(
                          'rounded-md px-2 py-1.5 text-xs font-medium',
                          ftpSecure === opt.id
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Username</Label>
                <Input
                  value={sftpUser}
                  onChange={(e) => setSftpUser(e.target.value)}
                  className="font-mono"
                  onKeyDown={(e) => e.key === 'Enter' && void handleConnect()}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {protocol === 'sftp' && sftpUseKey ? 'Password (optional)' : 'Password'}
                </Label>
                <Input
                  type="password"
                  value={sftpPass}
                  onChange={(e) => setSftpPass(e.target.value)}
                  className="font-mono"
                  onKeyDown={(e) => e.key === 'Enter' && void handleConnect()}
                />
              </div>
              {protocol === 'sftp' && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sftpUseKey}
                      onChange={(e) => setSftpUseKey(e.target.checked)}
                      className="rounded border-border/50 accent-primary w-3.5 h-3.5"
                    />
                    <span className="text-xs text-muted-foreground">Private key</span>
                  </label>
                  <ExpandSection open={sftpUseKey}>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Key file</Label>
                        <div className="flex gap-2">
                          <Input
                            value={sftpKeyPath}
                            onChange={(e) => setSftpKeyPath(e.target.value)}
                            placeholder="C:\Users\me\.ssh\id_ed25519"
                            className="font-mono"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-9 shrink-0 gap-1"
                            onClick={() => keyFileInputRef.current?.click()}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            Browse
                          </Button>
                        </div>
                        <input
                          ref={keyFileInputRef}
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (!file) return
                            const picked = api?.getPathForFile?.(file)
                            if (picked) setSftpKeyPath(picked)
                            else toast.error('Could not read the key path. Type it in, or use the desktop app.')
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Key passphrase (optional)</Label>
                        <Input
                          type="password"
                          value={sftpKeyPass}
                          onChange={(e) => setSftpKeyPass(e.target.value)}
                          className="font-mono"
                          autoComplete="off"
                          onKeyDown={(e) => e.key === 'Enter' && void handleConnect()}
                        />
                      </div>
                  </ExpandSection>
                </>
              )}
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Connection name</Label>
            <Input
              value={saveConnectionName}
              onChange={(e) => setSaveConnectionName(e.target.value)}
              placeholder={
                isObjectStoreProtocol(protocol)
                  ? s3ConnectionLabel(s3Bucket, s3Prefix)
                  : `${sftpUser.trim() ? `${sftpUser.trim()}@` : ''}${host.trim() || 'host'}`
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={!canConnect}
              onClick={() => void saveCurrentConnection()}
            >
              Save connection
            </Button>
          </div>
        </div>
        {connError && (
          <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive text-sm w-full">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{connError}</span>
          </div>
        )}
        <Button
          onClick={() => void handleConnect()}
          disabled={!canConnect}
          size="lg"
          className="w-full gap-2"
        >
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          {connecting ? 'Connecting…' : 'Connect'}
        </Button>
            </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const breadcrumbSegments =
    uploadTargetDir === '/' ? [] : uploadTargetDir.replace(/\/+$/, '').split('/').filter(Boolean)

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-2', !isActive && 'hidden')} data-tour="tour-sftp">
      <SftpToolbar
        connectionLabel={
          isObjectStoreProtocol(protocol)
            ? s3ConnectionLabel(s3Bucket, s3Prefix)
            : protocol === 'ftp'
              ? `ftp://${host}:${sftpPort}`
              : `${host}:${sftpPort}`
        }
        foldersFirst={foldersFirst}
        onFoldersFirstChange={setFoldersFirst}
        selectMode={selectMode}
        onSelectModeToggle={() => {
          setSelectMode((v) => {
            if (v) setSelectedPaths(new Set())
            return !v
          })
        }}
        selectedPathsCount={selectedPaths.size}
        selectedPath={selectedPath}
        selectedNode={selectedNode}
        onDisconnect={() => void handleDisconnect()}
        onRefresh={() => void refreshRoot()}
        onCollapseAll={collapseAllFolders}
        collapseAllDisabled={expandedPaths.size === 0}
        onFind={() => setFindOpen(true)}
        onSaveConnection={() => void saveCurrentConnection()}
        onPickLocal={() => void pickLocalRoot()}
        onMigrateOpen={() => {
          setMigrateConfirmText('')
          setMigrateOpen(true)
        }}
        onSelectAllInTarget={() => selectAllInTargetDir()}
        onBatchDownload={() => void batchDownload()}
        onNewFolder={() => {
          setCreateName('New folder')
          setCreateKind('folder')
        }}
        onNewFile={() => {
          setCreateName('notes.txt')
          setCreateKind('file')
        }}
        onUpload={() => fileInputRef.current?.click()}
        onDownload={() => void downloadRemoteItem(selectedNode!)}
        onRename={() => openRenameForNode(selectedNode!)}
        onEdit={() => void openEditForNode(selectedNode!)}
        onDuplicate={() => void duplicateForNode(selectedNode!)}
        onMove={() => openMoveForNode(selectedNode!)}
        onProperties={() => openPropertiesForNode(selectedNode!)}
        showMigrate={protocol !== 's3'}
        onDelete={() => {
          if (selectMode && selectedPaths.size > 0) {
            const items = Array.from(selectedPaths)
              .map((path) => {
                const n = findNode(tree, path)
                return n ? { path, name: n.name, isFolder: n.type === 'folder' } : null
              })
              .filter((x): x is { path: string; name: string; isFolder: boolean } => x !== null)
            if (items.length) setDeleteTargets(items)
            return
          }
          if (selectedPath && selectedNode) {
            setDeleteTargets([
              {
                path: selectedPath,
                name: selectedNode.name,
                isFolder: selectedNode.type === 'folder',
              },
            ])
          }
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void onPickFiles(e.target.files)}
      />

      <div className="flex flex-nowrap items-center gap-2 shrink-0 overflow-hidden text-xs">
        <span className="text-muted-foreground shrink-0">Remote path</span>
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-hidden font-mono">
          <button
            type="button"
            className="text-primary hover:underline px-0.5"
            onClick={() => void navigateRemotePath('/')}
          >
            /
          </button>
          {breadcrumbSegments.map((seg, i) => {
            const full = '/' + breadcrumbSegments.slice(0, i + 1).join('/')
            return (
              <span key={full} className="flex items-center text-muted-foreground">
                <ChevronRight className="w-3 h-3 shrink-0" />
                <button
                  type="button"
                  className="text-primary hover:underline px-0.5 max-w-[120px] truncate"
                  title={full}
                  onClick={() => void navigateRemotePath(full)}
                >
                  {seg}
                </button>
              </span>
            )
          })}
        </div>
        <Input
          value={pathGoInput}
          onChange={(e) => setPathGoInput(e.target.value)}
          className="h-7 max-w-xs font-mono text-xs"
          placeholder="/path/on/server"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void navigateRemotePath(pathGoInput.trim() || '/')
          }}
        />
        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => void navigateRemotePath(pathGoInput.trim() || '/')}>
          Go
        </Button>
      </div>

      <p className="text-xs text-muted-foreground shrink-0 flex min-w-0 items-center gap-x-3 overflow-hidden">
        <span className="min-w-0 truncate">
          Upload / new items go to: <span className="font-mono text-foreground">{uploadTargetDir}</span>
        </span>
        {selectMode && (
          <span className="text-primary font-medium">{selectedPaths.size} selected</span>
        )}
        {!selectMode && selectedNode?.type === 'file' && (
          <span>(select a folder to change target)</span>
        )}
      </p>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-2">
        {localRoot && localCwd && (
          <div className="flex-1 min-w-0 min-h-[240px] lg:max-w-[50%] flex flex-col">
            <LocalDirList
              rows={localRows}
              cwd={localCwd}
              canGoUp={localCwd !== localRoot}
              selectedPath={localSelectedPath}
              onSelect={(row) => {
                setLocalSelectedPath(row.path)
                if (row.type === 'file') {
                  /* noop */
                }
              }}
              onOpenFolder={(row) => setLocalCwd(row.path)}
              onGoUp={async () => {
                if (!api?.localPathParent || !localRoot) return
                const r = await api.localPathParent(localRoot, localCwd)
                if (r.ok && r.parent) setLocalCwd(r.parent)
              }}
              sortKey={localSortKey}
              sortDir={localSortDir}
              foldersFirst={foldersFirst}
              onSortChange={handleLocalSortChange}
              dropHighlight={localDropHighlight}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                setLocalDropHighlight(true)
              }}
              onDragLeave={() => setLocalDropHighlight(false)}
              onDropToPath={(dir, ev) => {
                setLocalDropHighlight(false)
                void handleDropOnLocal(dir, ev)
              }}
              onLocalDragStart={(row, ev) => {
                ev.dataTransfer.setData(
                  LOCAL_DND_MIME,
                  JSON.stringify({ path: row.path, name: row.name, type: row.type }),
                )
                ev.dataTransfer.effectAllowed = 'copy'
              }}
            />
          </div>
        )}

        <div
          className={cn(
            'flex flex-1 min-h-0 min-w-0 flex-col rounded-xl border border-border/50 p-2',
            dropHighlightPath === '/' && 'ring-2 ring-primary/50',
          )}
          data-tour="tour-sftp-remote"
          onDragOver={(e) => {
            if (selectMode) return
            e.preventDefault()
            e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
            setDropHighlightPath('/')
          }}
          onDragLeave={() => setDropHighlightPath(null)}
          onDrop={(e) => {
            if (selectMode) return
            e.preventDefault()
            setDropHighlightPath(null)
            void handleDropOnDir('/', e)
          }}
        >
          <SftpFileTree
            className="flex-1 min-h-0"
            data={tree}
              title="Remote"
              selectedPath={selectedPath}
              selectMode={selectMode}
              selectedPaths={selectedPaths}
              onTogglePath={togglePathSelection}
              onSelect={handleSelectNode}
              onToggleFolder={(n) => void handleToggleFolder(n)}
              dropHighlightPath={dropHighlightPath}
              onFolderDragOver={setDropHighlightPath}
              onFolderDrop={(dir, ev) => void handleDropOnDir(dir, ev)}
              onNodeDragStart={(node, ev) => {
                ev.dataTransfer.setData(
                  SFTP_DND_MIME,
                  JSON.stringify({ path: node.path, name: node.name, type: node.type }),
                )
                ev.dataTransfer.effectAllowed = 'move'
              }}
              onNodeContextMenu={openRemoteCtxMenu}
              sortKey={sortKey}
              sortDir={sortDir}
              foldersFirst={foldersFirst}
              onSortChange={handleSortChange}
              expandedPaths={expandedPaths}
              onRequestCollapse={onRequestCollapse}
              onCollapseAll={collapseAllFolders}
              hideUnixMeta={protocol !== 'sftp'}
          />
        </div>
      </div>

      {transferQueue.length > 0 && (
        <div className="shrink-0 rounded-lg border border-border/50 bg-background/80">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/30"
            onClick={() => setQueueOpen((o) => !o)}
          >
            <PanelBottom className="w-3.5 h-3.5" />
            Transfers ({transferQueue.length})
            {queueOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          {queueOpen && (
            <ul className="max-h-32 overflow-y-auto border-t border-border/40 px-3 py-2 space-y-2 text-xs">
              {transferQueue.map((t) => (
                <li key={t.id} className="space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-mono">{t.label}</span>
                    <span
                      className={cn(
                        'shrink-0',
                        t.status === 'error' && 'text-destructive',
                        t.status === 'done' && 'text-emerald-600',
                      )}
                    >
                      {t.status === 'running' && `${t.progress}%`}
                      {t.status === 'done' && 'Done'}
                      {t.status === 'error' && (t.error || 'Error')}
                    </span>
                  </div>
                  {t.status === 'running' && (
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={migrateOpen} onOpenChange={setMigrateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Migrate cleanup
            </DialogTitle>
            <DialogDescription>
              Choose environment and run one-click cleanup for database + SFTP path.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMigrateEnv('staging')}
                className={cn(
                  'rounded-xl border p-3 text-left transition-all',
                  migrateEnv === 'staging'
                    ? 'border-primary/70 bg-primary/10 shadow-sm'
                    : 'border-border/50 hover:border-primary/40 bg-background/40',
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  Staging
                </div>
                <p className="mt-1 text-xs text-muted-foreground font-mono">ats_db_staging + /usr/local/edge/data/vsbl-staging</p>
              </button>
              <button
                type="button"
                onClick={() => setMigrateEnv('prod')}
                className={cn(
                  'rounded-xl border p-3 text-left transition-all',
                  migrateEnv === 'prod'
                    ? 'border-rose-500/60 bg-rose-500/10 shadow-sm'
                    : 'border-border/50 hover:border-rose-500/40 bg-background/40',
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Rocket className="w-4 h-4 text-rose-500" />
                  Production
                </div>
                <p className="mt-1 text-xs text-muted-foreground font-mono">ats_db + /usr/local/edge/data/vsbl</p>
              </button>
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5">
              <p className="text-xs text-muted-foreground">Target preview</p>
              <p className="text-sm">
                Environment:{' '}
                <span className={cn('font-semibold', migrateEnv === 'prod' ? 'text-rose-500' : 'text-primary')}>
                  {migrateTarget.label}
                </span>
              </p>
              <p className="font-mono text-xs text-muted-foreground">DROP DATABASE IF EXISTS `{migrateTarget.dbName}`</p>
              <p className="font-mono text-xs text-muted-foreground">SFTP rm -rf {migrateTarget.sftpPath}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Database username</Label>
                <Input
                  value={migrateDbUser}
                  onChange={(e) => setMigrateDbUser(e.target.value)}
                  placeholder={migrateCredsLoaded ? 'mysql user' : 'Loading credentials...'}
                  className="font-mono"
                  disabled={migrateBusy || !migrateCredsLoaded}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Database password</Label>
                <Input
                  type="password"
                  value={migrateDbPass}
                  onChange={(e) => setMigrateDbPass(e.target.value)}
                  placeholder="mysql password"
                  className="font-mono"
                  disabled={migrateBusy || !migrateCredsLoaded}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Type <span className="font-mono text-foreground">{migrateTarget.confirmKeyword}</span> to confirm
              </Label>
              <Input
                value={migrateConfirmText}
                onChange={(e) => setMigrateConfirmText(e.target.value)}
                className="font-mono"
                placeholder={`Type "${migrateTarget.confirmKeyword}"`}
                disabled={migrateBusy}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setMigrateOpen(false)}
              disabled={migrateBusy}
            >
              Cancel
            </Button>
            <Button
              className="gap-1.5 bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:from-amber-500/90 hover:to-rose-500/90"
              disabled={
                migrateBusy ||
                !migrateDbUser.trim() ||
                migrateConfirmText.trim().toLowerCase() !== migrateTarget.confirmKeyword
              }
              onClick={() => void runMigrateCleanup()}
            >
              {migrateBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Run cleanup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTargets?.length} onOpenChange={(o) => !o && setDeleteTargets(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTargets && deleteTargets.length > 1 ? `${deleteTargets.length} items` : deleteTargets?.[0]?.isFolder ? 'folder' : 'file'}?
            </DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
            <ul className="font-mono text-xs text-foreground max-h-40 overflow-y-auto rounded-md border border-border/50 p-2 space-y-1 list-none">
              {(deleteTargets ?? []).slice(0, 25).map((t) => (
                <li key={t.path}>
                  {t.name}
                  {t.isFolder ? ' /' : ''}
                </li>
              ))}
              {(deleteTargets?.length ?? 0) > 25 && (
                <li className="text-muted-foreground list-none">… and {deleteTargets!.length - 25} more</li>
              )}
            </ul>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTargets(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createKind !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCreateKind(null)
            setCreateName('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{createKind === 'folder' ? 'New folder' : 'New file'}</DialogTitle>
            <DialogDescription>
              Create inside{' '}
              <span className="font-mono text-foreground">{uploadTargetDir}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="sftp-create-name">Name</Label>
            <Input
              id="sftp-create-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="font-mono"
              placeholder={createKind === 'folder' ? 'folder-name' : 'file.txt'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !createBusy) {
                  e.preventDefault()
                  void submitCreate()
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setCreateKind(null)
                setCreateName('')
              }}
            >
              Cancel
            </Button>
            <Button disabled={createBusy || !createName.trim()} onClick={() => void submitCreate()}>
              {createBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              In <span className="font-mono text-foreground">{parentDir(selectedPath || '')}</span>
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="font-mono"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !renameBusy) void submitRename()
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button disabled={renameBusy} onClick={() => void submitRename()}>
              {renameBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit file</DialogTitle>
            <DialogDescription className="font-mono truncate">{editPath}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[240px] font-mono text-sm flex-1"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button disabled={editBusy} onClick={() => void submitEdit()}>
              {editBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ctxMenu &&
        createPortal(
          <SftpRemoteContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            node={ctxMenu.node}
            onClose={() => setCtxMenu(null)}
            onOpen={() => openNode(ctxMenu.node)}
            onEdit={() => void openEditForNode(ctxMenu.node)}
            onDownload={() => void downloadRemoteItem(ctxMenu.node)}
            onDuplicate={() => void duplicateForNode(ctxMenu.node)}
            onMove={() => openMoveForNode(ctxMenu.node)}
            onDelete={() => deleteNode(ctxMenu.node)}
            onRename={() => openRenameForNode(ctxMenu.node)}
            onCopyPath={() => void copyTextToClipboard(ctxMenu.node.path, 'Path copied')}
            onCopyName={() => void copyTextToClipboard(ctxMenu.node.name, 'Name copied')}
            onCopyParent={() =>
              void copyTextToClipboard(parentDir(ctxMenu.node.path), 'Parent directory copied')
            }
            onProperties={() => openPropertiesForNode(ctxMenu.node)}
          />,
          document.body,
        )}

      <SftpPropertiesDialog
        open={propertiesOpen}
        onOpenChange={(open) => {
          setPropertiesOpen(open)
          if (!open) setPropertiesNode(null)
        }}
        node={propertiesNode}
        onApplied={() => void refreshRoot(true)}
        sftp={sftp}
        unixEditable={protocol !== 's3'}
      />
      <SftpMoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        node={moveNode}
        onMoved={() => void refreshRoot(true)}
        sftp={sftp}
      />
      <SftpFindDialog
        open={findOpen}
        onOpenChange={setFindOpen}
        defaultRootPath={uploadTargetDir}
        onGoToPath={(path) => void navigateRemotePath(path)}
        sftp={sftp}
      />
    </div>
  )
}
