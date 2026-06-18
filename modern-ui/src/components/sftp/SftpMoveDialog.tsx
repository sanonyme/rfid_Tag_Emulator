import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { SftpFileNode } from './SftpFileTree'

function parentDir(filePath: string): string {
  if (filePath === '/' || !filePath) return '/'
  const trimmed = filePath.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i <= 0) return '/'
  return trimmed.slice(0, i) || '/'
}

function posixJoin(dir: string, name: string): string {
  const d = dir.replace(/\/+$/, '') || '/'
  const seg = name.replace(/^\/+/, '')
  if (d === '/') return `/${seg}`.replace(/\/+/g, '/')
  return `${d}/${seg}`.replace(/\/+/g, '/')
}

function normalizeRemotePath(p: string): string {
  const s = p.replace(/\\/g, '/').replace(/\/+/g, '/')
  if (!s.startsWith('/')) return `/${s}`
  return s === '' ? '/' : s
}

function isInvalidMove(src: string, destDir: string, name: string, isFolder: boolean): string | null {
  const dest = normalizeRemotePath(posixJoin(destDir, name))
  const srcNorm = normalizeRemotePath(src)
  if (dest === srcNorm) return 'Destination is the same as source'
  if (isFolder) {
    if (dest.startsWith(srcNorm + '/')) return 'Cannot move a folder into itself or a subfolder'
    const parent = parentDir(srcNorm)
    if (normalizeRemotePath(destDir) === parent && dest === srcNorm) {
      return 'Already in this folder'
    }
  }
  return null
}

import type { SftpSessionApi } from '@/lib/sftp-session-api'

interface SftpMoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: SftpFileNode | null
  onMoved?: () => void
  sftp: SftpSessionApi | null
}

export function SftpMoveDialog({ open, onOpenChange, node, onMoved, sftp }: SftpMoveDialogProps) {
  const [destDir, setDestDir] = useState('/')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !node) return
    setDestDir(parentDir(node.path))
  }, [open, node])

  const submit = async () => {
    if (!node || !sftp?.rename) return
    const trimmed = destDir.trim()
    if (!trimmed) {
      toast.error('Enter a destination folder')
      return
    }
    const err = isInvalidMove(node.path, trimmed, node.name, node.type === 'folder')
    if (err) {
      toast.error(err)
      return
    }
    const newPath = normalizeRemotePath(posixJoin(trimmed, node.name))
    setBusy(true)
    try {
      const r = await sftp.rename(node.path, newPath)
      if (r.ok) {
        toast.success('Moved')
        onOpenChange(false)
        onMoved?.()
      } else {
        toast.error(r.error)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move To…</DialogTitle>
          <DialogDescription>
            Move <span className="font-mono text-foreground">{node?.name}</span> to another folder on
            the server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Destination folder</Label>
          <Input
            value={destDir}
            onChange={(e) => setDestDir(e.target.value)}
            className="font-mono"
            placeholder="/path/to/folder"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) void submit()
            }}
            autoFocus
          />
          <p className="text-xs text-muted-foreground font-mono truncate">
            → {node ? posixJoin(destDir, node.name) : ''}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
