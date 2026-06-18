import { useCallback, useEffect, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Loader2, Folder, File } from 'lucide-react'
import { toast } from 'sonner'
import { formatSftpSize } from './sftp-column-format'
import type { SftpFileNode } from './SftpFileTree'
import {
  modeToPermissions,
  permissionsToMode,
  formatOctalMode,
  parseOctalMode,
  S_IFDIR,
  S_IFREG,
  type PermissionSet,
  type PermissionTriplet,
  formatOwnerLabel,
  formatGroupLabel,
} from './sftp-permissions'

const COMMON_IDS = [0, 1000, 65534]

function parentDir(filePath: string): string {
  if (filePath === '/' || !filePath) return '/'
  const trimmed = filePath.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i <= 0) return '/'
  return trimmed.slice(0, i) || '/'
}

function PermRow({
  label,
  triplet,
  onChange,
}: {
  label: string
  triplet: PermissionTriplet
  onChange: (t: PermissionTriplet) => void
}) {
  const toggle = (key: keyof PermissionTriplet) => {
    onChange({ ...triplet, [key]: !triplet[key] })
  }
  return (
    <div className="grid grid-cols-[4.5rem_1fr_1fr_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {(['r', 'w', 'x'] as const).map((bit) => (
        <label key={bit} className="flex items-center justify-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-input"
            checked={triplet[bit]}
            onChange={() => toggle(bit)}
          />
          <span className="uppercase text-xs">{bit}</span>
        </label>
      ))}
    </div>
  )
}

import type { SftpSessionApi } from '@/lib/sftp-session-api'

interface SftpPropertiesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: SftpFileNode | null
  onApplied?: () => void
  sftp: SftpSessionApi | null
}

export function SftpPropertiesDialog({
  open,
  onOpenChange,
  node,
  onApplied,
  sftp,
}: SftpPropertiesDialogProps) {

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)

  const [isDirectory, setIsDirectory] = useState(false)
  const [location, setLocation] = useState('/')
  const [sizeLabel, setSizeLabel] = useState('Unknown')
  const [fileCount, setFileCount] = useState<number | null>(null)

  const [uid, setUid] = useState(0)
  const [gid, setGid] = useState(0)
  const [origUid, setOrigUid] = useState(0)
  const [origGid, setOrigGid] = useState(0)
  const [origMode, setOrigMode] = useState(0)
  const [typeBits, setTypeBits] = useState(S_IFREG)
  const [perms, setPerms] = useState<PermissionSet>(() => modeToPermissions(0o644))
  const [octalInput, setOctalInput] = useState('0644')
  const [addXToDirectories, setAddXToDirectories] = useState(false)
  const [recursive, setRecursive] = useState(false)

  const syncOctalFromPerms = useCallback(
    (p: PermissionSet, bits: number) => {
      const mode = permissionsToMode(bits, p)
      setOctalInput(formatOctalMode(mode))
    },
    [],
  )

  const applyPerms = useCallback(
    (next: PermissionSet) => {
      setPerms(next)
      syncOctalFromPerms(next, typeBits)
    },
    [syncOctalFromPerms, typeBits],
  )

  const loadStat = useCallback(async () => {
    if (!node || !sftp?.stat) return
    setLoading(true)
    try {
      const r = await sftp.stat(node.path)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      const st = r.stat
      setIsDirectory(st.isDirectory)
      setLocation(parentDir(st.path))
      setTypeBits(st.isDirectory ? S_IFDIR : S_IFREG)
      if (st.isDirectory) {
        setSizeLabel('Unknown')
        setFileCount(null)
      } else {
        setSizeLabel(formatSftpSize(st.size, false))
        setFileCount(1)
      }
      setUid(st.uid)
      setGid(st.gid)
      setOrigUid(st.uid)
      setOrigGid(st.gid)
      setOrigMode(st.mode)
      const p = modeToPermissions(st.mode)
      setPerms(p)
      setOctalInput(formatOctalMode(st.mode))
    } finally {
      setLoading(false)
    }
  }, [sftp, node])

  useEffect(() => {
    if (!open || !node) return
    setRecursive(false)
    setAddXToDirectories(false)
    void loadStat()
  }, [open, node, loadStat])

  const onCalculateSize = async () => {
    if (!node || !sftp?.calculateSize) return
    setCalculating(true)
    try {
      const r = await sftp.calculateSize(node.path)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setSizeLabel(formatSftpSize(r.size, false))
      setFileCount(r.fileCount)
    } finally {
      setCalculating(false)
    }
  }

  const onOctalChange = (value: string) => {
    setOctalInput(value)
    const parsed = parseOctalMode(value, typeBits)
    if (parsed !== null) {
      const p = modeToPermissions(parsed)
      setPerms(p)
    }
  }

  const onSubmit = async () => {
    if (!node || !sftp?.setAttributes) return
    const attrs: { mode?: number; uid?: number; gid?: number } = {}
    if (uid !== origUid) attrs.uid = uid
    if (gid !== origGid) attrs.gid = gid
    const newMode = permissionsToMode(typeBits, perms)
    if (newMode !== origMode) attrs.mode = newMode
    if (Object.keys(attrs).length === 0) {
      onOpenChange(false)
      return
    }
    setSaving(true)
    try {
      const r = await sftp.setAttributes(node.path, attrs, {
        recursive,
        addXToDirectories,
      })
      if (r.ok) {
        toast.success('Properties updated')
        onOpenChange(false)
        onApplied?.()
      } else {
        toast.error(r.error)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDirectory ? (
              <Folder className="w-5 h-5 text-amber-400 shrink-0" />
            ) : (
              <File className="w-5 h-5 text-sky-400 shrink-0" />
            )}
            Properties — {node?.name ?? ''}
          </DialogTitle>
          <DialogDescription>Owner, group, and permissions (Common)</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 items-center">
              <Label className="text-muted-foreground">Location</Label>
              <span className="font-mono truncate">{location}</span>
              <Label className="text-muted-foreground">Size</Label>
              <div className="flex items-center gap-2">
                <span>{sizeLabel}</span>
                {isDirectory && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={calculating}
                    onClick={() => void onCalculateSize()}
                  >
                    {calculating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Calculate'}
                  </Button>
                )}
                {fileCount !== null && fileCount > 1 && (
                  <span className="text-muted-foreground text-xs">({fileCount} files)</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ownership</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Owner</Label>
                  <Select value={String(uid)} onValueChange={(v) => setUid(Number(v))}>
                    <SelectTrigger className="h-9 font-mono text-xs">
                      <SelectValue>{formatOwnerLabel(uid)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_IDS.map((id) => (
                        <SelectItem key={`u-${id}`} value={String(id)}>
                          {formatOwnerLabel(id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Group</Label>
                  <Select value={String(gid)} onValueChange={(v) => setGid(Number(v))}>
                    <SelectTrigger className="h-9 font-mono text-xs">
                      <SelectValue>{formatGroupLabel(gid)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_IDS.map((id) => (
                        <SelectItem key={`g-${id}`} value={String(id)}>
                          {formatGroupLabel(id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="rounded-md border border-border/60 p-3 space-y-2 bg-muted/20">
                <div className="grid grid-cols-[4.5rem_1fr_1fr_1fr] gap-2 text-xs text-muted-foreground text-center">
                  <span />
                  <span>Read (R)</span>
                  <span>Write (W)</span>
                  <span>Execute (X)</span>
                </div>
                <PermRow
                  label="Owner"
                  triplet={perms.owner}
                  onChange={(t) => applyPerms({ ...perms, owner: t })}
                />
                <PermRow
                  label="Group"
                  triplet={perms.group}
                  onChange={(t) => applyPerms({ ...perms, group: t })}
                />
                <PermRow
                  label="Others"
                  triplet={perms.others}
                  onChange={(t) => applyPerms({ ...perms, others: t })}
                />
                <div className="flex flex-wrap gap-4 pt-2 border-t border-border/40">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={perms.setUid}
                      onChange={() =>
                        applyPerms({ ...perms, setUid: !perms.setUid })
                      }
                    />
                    <span>Set UID</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={perms.setGid}
                      onChange={() =>
                        applyPerms({ ...perms, setGid: !perms.setGid })
                      }
                    />
                    <span>Set GID</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={perms.sticky}
                      onChange={() =>
                        applyPerms({ ...perms, sticky: !perms.sticky })
                      }
                    />
                    <span>Sticky bit</span>
                  </label>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <Label className="text-muted-foreground shrink-0">Octal</Label>
                  <Input
                    value={octalInput}
                    onChange={(e) => onOctalChange(e.target.value)}
                    className="h-8 w-24 font-mono text-sm"
                  />
                  <label className="flex items-center gap-2 cursor-pointer ml-auto">
                    <input
                      type="checkbox"
                      className="rounded border-input"
                      checked={addXToDirectories}
                      onChange={(e) => setAddXToDirectories(e.target.checked)}
                    />
                    <span>Add X to directories</span>
                  </label>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
              />
              <span>Set owner, group and permissions recursively</span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={loading || saving} onClick={() => void onSubmit()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'OK'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
