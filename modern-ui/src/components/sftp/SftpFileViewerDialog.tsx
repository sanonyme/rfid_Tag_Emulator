import { useState, useMemo, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import {
  FileText,
  Table as TableIcon,
  Code2,
  Binary,
  Image as ImageIcon,
  Save,
  Search,
  Copy,
  Check,
  Radio,
  Smartphone,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

export type ViewerMode = 'table' | 'formatted' | 'hex' | 'image' | 'editor'

interface SftpFileViewerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filePath: string | null
  fileName: string
  content: string
  isBinary?: boolean
  readOnly?: boolean
  onSave?: (updatedContent: string) => Promise<void>
  onSendToFixed?: (epcs: string[]) => void
  onSendToHandheld?: (epcs: string[]) => void
}

function detectDefaultMode(fileName: string, isBinary?: boolean): ViewerMode {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return 'image'
  if (isBinary) return 'hex'
  if (['csv', 'tsv'].includes(ext)) return 'table'
  if (['json', 'xml', 'yaml', 'yml'].includes(ext)) return 'formatted'
  if (['bin', 'dat', 'hex', 'dump'].includes(ext)) return 'hex'
  return 'editor'
}

function imageMimeFromName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'bmp':
      return 'image/bmp'
    case 'ico':
      return 'image/x-icon'
    case 'png':
    default:
      return 'image/png'
  }
}

function formatHexDumpFromBytes(bytes: Uint8Array): string {
  const lines: string[] = []
  const maxBytes = Math.min(bytes.length, 8192) // cap display

  for (let i = 0; i < maxBytes; i += 16) {
    const chunk = bytes.subarray(i, i + 16)
    const offset = i.toString(16).padStart(8, '0')
    const hexPart: string[] = []
    let asciiPart = ''

    for (let j = 0; j < 16; j++) {
      if (j < chunk.length) {
        const b = chunk[j]!
        hexPart.push(b.toString(16).padStart(2, '0'))
        asciiPart += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'
      } else {
        hexPart.push('  ')
      }
    }

    const firstHalf = hexPart.slice(0, 8).join(' ')
    const secondHalf = hexPart.slice(8, 16).join(' ')
    lines.push(`${offset}  ${firstHalf}  ${secondHalf}  |${asciiPart}|`)
  }

  if (bytes.length > maxBytes) {
    lines.push(`… truncated (${bytes.length} bytes total)`)
  }

  return lines.join('\n')
}

function formatHexDump(str: string, asBase64 = false): string {
  if (asBase64) {
    try {
      const bin = atob(str)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return formatHexDumpFromBytes(bytes)
    } catch {
      /* fall through to text dump */
    }
  }
  return formatHexDumpFromBytes(new TextEncoder().encode(str))
}

function parseCsvTsv(raw: string, isTsv: boolean): { headers: string[]; rows: string[][] } {
  const delim = isTsv ? '\t' : ','
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseLine = (line: string): string[] => {
    if (isTsv) return line.split('\t').map((c) => c.trim())
    // Simple CSV parser supporting quotes
    const cols: string[] = []
    let curr = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === delim && !inQuotes) {
        cols.push(curr.trim().replace(/^"(.*)"$/, '$1'))
        curr = ''
      } else {
        curr += ch
      }
    }
    cols.push(curr.trim().replace(/^"(.*)"$/, '$1'))
    return cols
  }

  const headers = parseLine(lines[0]!)
  const rows = lines.slice(1, 500).map(parseLine) // cap at 500 for fast rendering
  return { headers, rows }
}

export function SftpFileViewerDialog({
  open,
  onOpenChange,
  filePath,
  fileName,
  content,
  isBinary = false,
  readOnly = false,
  onSave,
  onSendToFixed,
  onSendToHandheld,
}: SftpFileViewerDialogProps) {
  const [mode, setMode] = useState<ViewerMode>(() => detectDefaultMode(fileName, isBinary))
  const [editDraft, setEditDraft] = useState(content)
  const [tableSearch, setTableSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setMode(detectDefaultMode(fileName, isBinary))
      setEditDraft(content)
      setTableSearch('')
      setCopied(false)
    }
  }, [open, fileName, isBinary, content])

  const isCsv = fileName.toLowerCase().endsWith('.csv')
  const isTsv = fileName.toLowerCase().endsWith('.tsv')

  // CSV/TSV parsed data
  const tableData = useMemo(() => {
    if (mode !== 'table') return { headers: [], rows: [] }
    return parseCsvTsv(editDraft, isTsv)
  }, [mode, editDraft, isTsv])

  const filteredRows = useMemo(() => {
    if (!tableSearch.trim()) return tableData.rows
    const q = tableSearch.toLowerCase()
    return tableData.rows.filter((row) => row.some((col) => col.toLowerCase().includes(q)))
  }, [tableData.rows, tableSearch])

  // Extract EPCs from file content (scanning for hex tokens of length 16, 24, or 32, or SGTIN hex)
  const extractedEpcs = useMemo(() => {
    const hexPattern = /\b[0-9A-Fa-f]{16,32}\b/g
    const matches = editDraft.match(hexPattern) || []
    return Array.from(new Set(matches.map((s) => s.toUpperCase())))
  }, [editDraft])

  // Pretty JSON
  const prettyFormatted = useMemo(() => {
    if (mode !== 'formatted') return ''
    try {
      const parsed = JSON.parse(editDraft)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return editDraft
    }
  }, [mode, editDraft])

  // Hex dump
  const hexDumpText = useMemo(() => {
    if (mode !== 'hex') return ''
    return formatHexDump(isBinary ? content : editDraft, isBinary)
  }, [mode, editDraft, content, isBinary])

  const imageSrc = useMemo(() => {
    if (!content) return null
    const mime = imageMimeFromName(fileName)
    if (isBinary) return `data:${mime};base64,${content}`
    // SVG (and similar) may arrive as UTF-8 text
    if (mime === 'image/svg+xml') {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
    }
    return null
  }, [isBinary, content, fileName])

  const handleCopyEpcs = () => {
    if (extractedEpcs.length === 0) {
      toast.info('No EPC-like hexadecimal strings detected')
      return
    }
    void navigator.clipboard.writeText(extractedEpcs.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success(`Copied ${extractedEpcs.length} unique EPCs to clipboard`)
  }

  const handleSendToFixed = () => {
    if (extractedEpcs.length === 0) {
      toast.info('No EPC-like strings found to emulate')
      return
    }
    if (onSendToFixed) {
      onSendToFixed(extractedEpcs)
      toast.success(`Sent ${extractedEpcs.length} EPCs to Fixed Reader scan`)
      onOpenChange(false)
    } else {
      handleCopyEpcs()
    }
  }

  const handleSendToHandheld = () => {
    if (extractedEpcs.length === 0) {
      toast.info('No EPC-like strings found to emulate')
      return
    }
    if (onSendToHandheld) {
      onSendToHandheld(extractedEpcs)
      toast.success(`Sent ${extractedEpcs.length} EPCs to Handheld Server`)
      onOpenChange(false)
    } else {
      handleCopyEpcs()
    }
  }

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(editDraft)
      toast.success(`Saved changes to ${fileName}`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save file')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
        <DialogHeader className="p-4 pr-12 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-mono">
                  {fileName}
                </DialogTitle>
                <p className="text-xs text-muted-foreground truncate font-mono">
                  {filePath || fileName}
                </p>
              </div>
            </div>

            {/* View Mode Selector Tabs — keep clear of DialogContent close (absolute right-4 top-4) */}
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/50 shrink-0 mr-1">
              {(isCsv || isTsv) && (
                <Button
                  variant={mode === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1.5"
                  onClick={() => setMode('table')}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  Table
                </Button>
              )}
              <Button
                variant={mode === 'formatted' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => setMode('formatted')}
              >
                <Code2 className="w-3.5 h-3.5" />
                Formatted
              </Button>
              <Button
                variant={mode === 'hex' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => setMode('hex')}
              >
                <Binary className="w-3.5 h-3.5" />
                Hex Dump
              </Button>
              {!readOnly && (
                <Button
                  variant={mode === 'editor' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1.5"
                  onClick={() => setMode('editor')}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Toolbar & EPC extraction banner */}
        {extractedEpcs.length > 0 && (
          <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <Sparkles className="w-4 h-4 text-primary animate-pulse shrink-0" />
              <span>
                Detected <strong>{extractedEpcs.length}</strong> unique RFID tag EPC(s)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleCopyEpcs}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy EPCs
              </Button>
              {onSendToFixed && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleSendToFixed}
                >
                  <Radio className="w-3.5 h-3.5 text-blue-500" />
                  Send to Fixed Reader
                </Button>
              )}
              {onSendToHandheld && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleSendToHandheld}
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                  Send to Handheld
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Body View Area */}
        <div className="flex-1 min-h-[380px] max-h-[55vh] overflow-auto p-4 flex flex-col">
          {mode === 'table' && (
            <div className="flex flex-col flex-1 min-h-0 gap-3">
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div className="relative max-w-xs flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search rows…"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="h-8 pl-8 text-xs font-mono"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Showing {filteredRows.length} of {tableData.rows.length} rows ({tableData.headers.length} columns)
                </div>
              </div>

              <div className="flex-1 overflow-auto rounded-lg border border-border/60 bg-card">
                <table className="w-full caption-bottom text-xs">
                  <thead className="border-b bg-muted/40 sticky top-0">
                    <tr className="border-b transition-colors hover:bg-muted/30">
                      <th className="h-8 px-2 text-center text-xs font-mono font-medium text-muted-foreground w-12">#</th>
                      {tableData.headers.map((h, i) => (
                        <th key={i} className="h-8 px-3 text-left text-xs font-mono font-semibold text-foreground">
                          {h || `Col ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={tableData.headers.length + 1} className="text-center py-8 text-muted-foreground text-xs">
                          No matching rows found
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                          <td className="text-center text-xs font-mono text-muted-foreground py-1.5 px-2">
                            {rIdx + 1}
                          </td>
                          {row.map((val, cIdx) => (
                            <td key={cIdx} className="text-xs font-mono py-1.5 px-3 max-w-[200px] truncate text-foreground" title={val}>
                              {val}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mode === 'formatted' && (
            <pre className="font-mono text-xs leading-relaxed p-4 rounded-lg border border-border/60 bg-muted/20 overflow-auto flex-1 select-text">
              {prettyFormatted}
            </pre>
          )}

          {mode === 'hex' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="text-[11px] font-mono text-muted-foreground pb-2">
                Offset (h)  00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F  Decoded text
              </div>
              <pre className="font-mono text-[11px] leading-relaxed p-3 rounded-lg border border-border/60 bg-muted/30 overflow-auto flex-1 select-text">
                {hexDumpText}
              </pre>
            </div>
          )}

          {mode === 'image' && (
            <div className="flex flex-1 items-center justify-center p-8 bg-muted/10 rounded-lg border border-border/60 overflow-auto">
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={fileName}
                  className="max-h-[min(70vh,560px)] max-w-full object-contain rounded shadow"
                />
              ) : (
                <div className="text-center text-muted-foreground text-sm">
                  <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  Image preview not available
                </div>
              )}
            </div>
          )}

          {mode === 'editor' && (
            <div className="flex flex-col flex-1 min-h-0 gap-2">
              <Textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                readOnly={readOnly}
                className="font-mono text-xs flex-1 min-h-[340px] resize-none leading-relaxed p-3 bg-muted/10"
                placeholder="File contents…"
                spellCheck={false}
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                <span>
                  {editDraft.split('\n').length} lines · {editDraft.length} characters
                </span>
                <span>UTF-8</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-3 border-t border-border/50 bg-muted/10 flex items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground">
            {readOnly ? 'Read only mode' : 'Press Save to write changes'}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {!readOnly && mode === 'editor' && onSave && (
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={saving || editDraft === content}
                onClick={() => void handleSave()}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save changes
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
