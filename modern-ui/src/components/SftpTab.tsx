import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ScrollArea } from './ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { SftpFileTree, SFTP_DND_MIME, type SftpFileNode } from './sftp/SftpFileTree'
import {
  FolderInput,
  Loader2,
  PlugZap,
  Unplug,
  RefreshCw,
  FolderPlus,
  FilePlus,
  Upload,
  Trash2,
  AlertCircle,
  Monitor,
  CheckSquare,
  ListChecks,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const SFTP_CREDS_KEY = 'sftp-creds'

function posixJoin(dir: string, name: string): string {
  const d = dir.replace(/\/+$/, '') || '/'
  const seg = name.replace(/^\/+/, '')
  if (d === '/') return `/${seg}`.replace(/\/+/g, '/')
  return `${d}/${seg}`.replace(/\/+/g, '/')
}

function parentDir(filePath: string): string {
  if (filePath === '/' || !filePath) return '/'
  const trimmed = filePath.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i <= 0) return '/'
  return trimmed.slice(0, i) || '/'
}

function fileExtension(name: string): string | undefined {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return undefined
  return name.slice(i + 1).toLowerCase()
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function setNodeLoading(nodes: SftpFileNode[], target: string, loading: boolean): SftpFileNode[] {
  return nodes.map((n) => {
    if (n.path === target) return { ...n, loading }
    if (Array.isArray(n.children))
      return { ...n, children: setNodeLoading(n.children, target, loading) }
    return n
  })
}

function setChildrenAtPath(
  nodes: SftpFileNode[],
  target: string,
  children: SftpFileNode[],
): SftpFileNode[] {
  return nodes.map((n) => {
    if (n.path === target) return { ...n, children, loaded: true, loading: false }
    if (Array.isArray(n.children))
      return { ...n, children: setChildrenAtPath(n.children, target, children) }
    return n
  })
}

function findNode(nodes: SftpFileNode[], path: string): SftpFileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    if (Array.isArray(n.children)) {
      const f = findNode(n.children, path)
      if (f) return f
    }
  }
  return null
}

function getDirectChildPaths(nodes: SftpFileNode[], dir: string): string[] {
  if (dir === '/') return nodes.map((n) => n.path)
  const parent = findNode(nodes, dir)
  if (!parent?.children?.length) return []
  return parent.children.map((c) => c.path)
}

interface SftpTabProps {
  host: string
  setHost: (h: string) => void
}

export function SftpTab({ host, setHost }: SftpTabProps) {
  const api = window.electronAPI
  const hasSftp = Boolean(api?.sftpConnect)

  const [sftpPort, setSftpPort] = useState('22')
  const [sftpUser, setSftpUser] = useState('')
  const [sftpPass, setSftpPass] = useState('')
  const [rememberCreds, setRememberCreds] = useState(false)
  const [credsLoaded, setCredsLoaded] = useState(false)

  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connError, setConnError] = useState('')

  const [tree, setTree] = useState<SftpFileNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [uploadTargetDir, setUploadTargetDir] = useState('/')
  const [dropHighlightPath, setDropHighlightPath] = useState<string | null>(null)

  const [selectMode, setSelectMode] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState(() => new Set<string>())

  const [deleteTargets, setDeleteTargets] = useState<
    { path: string; name: string; isFolder: boolean }[] | null
  >(null)
  const [deleting, setDeleting] = useState(false)

  const [createKind, setCreateKind] = useState<'folder' | 'file' | null>(null)
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const treeRef = useRef<SftpFileNode[]>([])
  useEffect(() => {
    treeRef.current = tree
  }, [tree])

  const loadDir = useCallback(async (remotePath: string): Promise<SftpFileNode[]> => {
    if (!api?.sftpReaddir) return []
    const r = await api.sftpReaddir(remotePath)
    if (!r.ok) throw new Error(r.error)
    return r.entries.map((e) => ({
      path: posixJoin(remotePath, e.name),
      name: e.name,
      type: e.type,
      extension: e.type === 'file' ? fileExtension(e.name) : undefined,
      loaded: e.type === 'file' ? true : false,
      children: e.type === 'folder' ? undefined : undefined,
      sizeBytes: e.size,
      mtimeSec: e.mtime,
      mode: e.mode,
      uid: e.uid,
      gid: e.gid,
    }))
  }, [api])

  const refreshRoot = useCallback(
    async (silent?: boolean) => {
      if (!connected || !api?.sftpReaddir) return
      try {
        const nodes = await loadDir('/')
        setTree(nodes)
        if (!silent) toast.success('Refreshed')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Refresh failed')
      }
    },
    [connected, api, loadDir],
  )

  /** Reload one directory and merge into the tree (falls back to full root refresh if path is not in tree). */
  const refreshDirectory = useCallback(
    async (dirPath: string, silent?: boolean) => {
      if (!connected || !api?.sftpReaddir) return
      try {
        const nodes = await loadDir(dirPath)
        const prev = treeRef.current
        if (dirPath === '/') {
          setTree(nodes)
          if (!silent) toast.success('Updated')
          return
        }
        if (findNode(prev, dirPath)) {
          setTree(setChildrenAtPath(prev, dirPath, nodes))
          if (!silent) toast.success('Updated')
          return
        }
        const rootNodes = await loadDir('/')
        setTree(rootNodes)
        if (!silent) {
          toast.message('Refreshed root listing', {
            description: `Could not merge ${dirPath} into the open tree.`,
          })
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Refresh failed')
      }
    },
    [connected, api, loadDir],
  )

  useEffect(() => {
    ;(async () => {
      try {
        if (api?.safeStoreGet) {
          const raw = await api.safeStoreGet(SFTP_CREDS_KEY)
          if (raw) {
            const parsed = JSON.parse(raw) as { host?: string; port?: string; user?: string; pass?: string }
            if (parsed.host) setHost(parsed.host)
            if (parsed.port) setSftpPort(parsed.port)
            setSftpUser(parsed.user || '')
            setSftpPass(parsed.pass || '')
            setRememberCreds(true)
            setCredsLoaded(true)
            return
          }
        }
      } catch {
        /* fall through */
      }
      try {
        const raw = localStorage.getItem(SFTP_CREDS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as { host?: string; port?: string; user?: string; pass?: string }
          if (parsed.host) setHost(parsed.host)
          if (parsed.port) setSftpPort(parsed.port)
          setSftpUser(parsed.user || '')
          setSftpPass(parsed.pass || '')
          setRememberCreds(true)
        }
      } catch {
        /* ignore */
      }
      setCredsLoaded(true)
    })()
  }, [api, setHost])

  const persistCreds = useCallback(async () => {
    const payload = JSON.stringify({
      host,
      port: sftpPort,
      user: sftpUser,
      pass: sftpPass,
    })
    try {
      if (api?.safeStoreSet) {
        await api.safeStoreSet(SFTP_CREDS_KEY, payload)
        localStorage.removeItem(SFTP_CREDS_KEY)
        return
      }
    } catch {
      /* fall through */
    }
    localStorage.setItem(SFTP_CREDS_KEY, payload)
  }, [api, host, sftpPort, sftpUser, sftpPass])

  const clearCreds = useCallback(async () => {
    try {
      if (api?.safeStoreDelete) await api.safeStoreDelete(SFTP_CREDS_KEY)
    } catch {
      /* ignore */
    }
    localStorage.removeItem(SFTP_CREDS_KEY)
  }, [api])

  const handleConnect = useCallback(async () => {
    if (!api?.sftpConnect || !sftpUser.trim() || !host.trim()) return
    setConnecting(true)
    setConnError('')
    const portNum = parseInt(sftpPort, 10) || 22
    const result = await api.sftpConnect(host.trim(), portNum, sftpUser.trim(), sftpPass)
    if (result.ok) {
      setConnected(true)
      if (rememberCreds) await persistCreds()
      else await clearCreds()
      try {
        const nodes = await loadDir('/')
        setTree(nodes)
        setUploadTargetDir('/')
        setSelectedPath(null)
        setSelectedPaths(new Set())
        setSelectMode(false)
        toast.success('SFTP connected')
      } catch (e) {
        setConnError(e instanceof Error ? e.message : 'Failed to list root')
        await api.sftpDisconnect?.()
        setConnected(false)
      }
    } else {
      setConnError(result.error)
    }
    setConnecting(false)
  }, [api, sftpUser, host, sftpPort, sftpPass, rememberCreds, persistCreds, clearCreds, loadDir])

  const handleDisconnect = useCallback(async () => {
    await api?.sftpDisconnect?.()
    setConnected(false)
    setTree([])
    setSelectedPath(null)
    setSelectedPaths(new Set())
    setSelectMode(false)
  }, [api])

  const handleToggleFolder = useCallback(
    async (node: SftpFileNode) => {
      if (node.type !== 'folder' || !api || node.loaded || node.loading) return
      setTree((prev) => setNodeLoading(prev, node.path, true))
      try {
        const children = await loadDir(node.path)
        setTree((prev) => setChildrenAtPath(prev, node.path, children))
      } catch (e) {
        setTree((prev) => setNodeLoading(prev, node.path, false))
        toast.error(e instanceof Error ? e.message : 'Failed to open folder')
      }
    },
    [api, loadDir],
  )

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

  const handleDropOnDir = useCallback(
    async (targetDir: string, e: React.DragEvent) => {
      if (!api) return
      const raw = e.dataTransfer.getData(SFTP_DND_MIME)
      if (raw) {
        try {
          const { path: fromPath, name } = JSON.parse(raw) as {
            path: string
            name: string
          }
          const toPath = posixJoin(targetDir, name)
          if (fromPath === toPath) return
          const r = await api.sftpRename(fromPath, toPath)
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
            const w = await api.sftpWriteFile(dest, b64)
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
    [api, refreshRoot, refreshDirectory, selectedPath],
  )

  const submitCreate = useCallback(async () => {
    if (!createKind || !api) return
    const safe = createName.trim().replace(/[/\\]/g, '')
    if (!safe) {
      toast.error('Enter a valid name')
      return
    }
    const p = posixJoin(uploadTargetDir, safe)
    setCreateBusy(true)
    try {
      if (createKind === 'folder') {
        if (!api.sftpMkdir) return
        const r = await api.sftpMkdir(p)
        if (r.ok) {
          toast.success('Folder created')
          setCreateKind(null)
          setCreateName('')
          await refreshDirectory(uploadTargetDir, true)
        } else {
          toast.error(r.error)
        }
      } else {
        if (!api.sftpWriteTextFile) return
        const r = await api.sftpWriteTextFile(p, '')
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
  }, [createKind, createName, api, uploadTargetDir, refreshDirectory])

  const onPickFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length || !api?.sftpWriteFile) return
      let okCount = 0
      for (const f of Array.from(list)) {
        try {
          const buf = await f.arrayBuffer()
          const b64 = arrayBufferToBase64(buf)
          const dest = posixJoin(uploadTargetDir, f.name)
          const w = await api.sftpWriteFile(dest, b64)
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
      await refreshDirectory(uploadTargetDir, true)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [api, uploadTargetDir, refreshDirectory],
  )

  const confirmDelete = useCallback(async () => {
    if (!deleteTargets?.length || !api) return
    setDeleting(true)
    const sorted = [...deleteTargets].sort((a, b) => b.path.length - a.path.length)
    let failed: string | undefined
    for (const item of sorted) {
      const r = item.isFolder ? await api.sftpRmrf(item.path) : await api.sftpUnlink(item.path)
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
  }, [deleteTargets, api, refreshRoot])

  const selectedNode = selectedPath ? findNode(tree, selectedPath) : null

  if (!hasSftp) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-6">
        <Monitor className="w-12 h-12 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">SFTP explorer</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            SFTP is only available in the desktop Electron app. Run the packaged or dev desktop build to
            connect over SSH and browse remote files.
          </p>
        </div>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-10 px-6 max-w-lg mx-auto">
        <div className="flex items-center gap-3 text-primary">
          <FolderInput className="w-10 h-10" />
          <h2 className="text-xl font-semibold text-foreground">SFTP</h2>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Connect with the same reader host (or edit below), SSH port, and your credentials.
        </p>
        <div className="w-full space-y-3">
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
            <Label className="text-xs text-muted-foreground">SSH port</Label>
            <Input
              value={sftpPort}
              onChange={(e) => setSftpPort(e.target.value)}
              placeholder="22"
              className="font-mono w-32"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Username</Label>
            <Input
              value={sftpUser}
              onChange={(e) => setSftpUser(e.target.value)}
              className="font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Password</Label>
            <Input
              type="password"
              value={sftpPass}
              onChange={(e) => setSftpPass(e.target.value)}
              className="font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberCreds}
              onChange={(e) => {
                setRememberCreds(e.target.checked)
                if (!e.target.checked) void clearCreds()
              }}
              className="rounded border-border/50 accent-primary w-3.5 h-3.5"
            />
            <span className="text-xs text-muted-foreground">Remember credentials</span>
          </label>
        </div>
        {connError && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 text-destructive text-sm w-full">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{connError}</span>
          </div>
        )}
        <Button
          onClick={() => void handleConnect()}
          disabled={connecting || !sftpUser.trim() || !host.trim() || !credsLoaded}
          size="lg"
          className="gap-2"
        >
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          {connecting ? 'Connecting…' : 'Connect'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleDisconnect()}>
          <Unplug className="w-3.5 h-3.5" />
          Disconnect
        </Button>
        <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
          {host}:{sftpPort}
        </span>
        <div className="flex-1 min-w-[8px]" />
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void refreshRoot()}>
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
        <Button
          variant={selectMode ? 'default' : 'secondary'}
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setSelectMode((v) => {
              if (v) setSelectedPaths(new Set())
              return !v
            })
          }}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          {selectMode ? 'Selecting…' : 'Select'}
        </Button>
        {selectMode && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => selectAllInTargetDir()}>
            <ListChecks className="w-3.5 h-3.5" />
            All in target
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setCreateName('New folder')
            setCreateKind('folder')
          }}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          New folder
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setCreateName('notes.txt')
            setCreateKind('file')
          }}
        >
          <FilePlus className="w-3.5 h-3.5" />
          New file
        </Button>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" />
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void onPickFiles(e.target.files)}
        />
        <Button
          variant="destructive"
          size="sm"
          className="gap-1.5"
          disabled={selectMode ? selectedPaths.size === 0 : !selectedPath}
          onClick={() => {
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
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      </div>
      <p className="text-xs text-muted-foreground shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Upload / new items go to: <span className="font-mono text-foreground">{uploadTargetDir}</span>
        </span>
        {selectMode && (
          <span className="text-primary font-medium">{selectedPaths.size} selected</span>
        )}
        {!selectMode && selectedNode?.type === 'file' && (
          <span>(select a folder to change target)</span>
        )}
      </p>

      <div
        className={cn(
          'flex flex-1 min-h-0 flex-col rounded-xl border border-border/50 p-2',
          dropHighlightPath === '/' && 'ring-2 ring-primary/50',
        )}
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
        <ScrollArea className="flex-1 min-h-[280px] basis-0 h-full max-h-[calc(100vh-220px)]">
          <SftpFileTree
            data={tree}
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
          />
        </ScrollArea>
      </div>

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
    </div>
  )
}
