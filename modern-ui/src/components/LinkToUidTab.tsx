import { useState } from 'react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { convertLinksToUids } from '@/lib/link-to-uid'
import { Link2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export function LinkToUidTab() {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<{ link: string; uid: string | null; error?: string }[]>([])

  const handleConvert = () => {
    const lines = input.split('\n').filter((l) => l.trim())
    const out = convertLinksToUids(lines)
    setResults(out)
  }

  const copyUids = () => {
    const uids = results.filter((r) => r.uid).map((r) => r.uid).join('\n')
    if (!uids) {
      toast.error('No UIDs to copy')
      return
    }
    navigator.clipboard.writeText(uids)
    toast.success('UIDs copied to clipboard')
  }

  const copyAll = () => {
    const text = results.map((r) => `${r.link}\t${r.uid ?? r.error ?? ''}`).join('\n')
    if (!text) {
      toast.error('No results to copy')
      return
    }
    navigator.clipboard.writeText(text)
    toast.success('Results copied (URL → UID)')
  }

  const handleClear = () => {
    setInput('')
    setResults([])
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Link → UID
          </CardTitle>
          <CardDescription>
            Paste r-trac links (one per line). Extracts the <code className="text-xs">epc</code> param and converts
            Base64URL-encoded EPC to ISO15693 UID (E016 + 12 hex chars).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="https://example.com/tag?epc=...&#10;https://..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-h-[140px] font-mono text-sm"
            rows={6}
          />
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleConvert}>Convert</Button>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="w-4 h-4 mr-1" />
              Clear
            </Button>
            {results.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={copyUids}>
                  Copy UIDs only
                </Button>
                <Button variant="outline" size="sm" onClick={copyAll}>
                  Copy URL → UID
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>URL → UID</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">URL</th>
                      <th className="text-left px-4 py-2 font-medium w-40">UID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-t border-border/30 hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono text-xs truncate max-w-[300px]" title={r.link}>
                          {r.link}
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {r.uid ? (
                            <span className="text-primary">{r.uid}</span>
                          ) : (
                            <span className="text-destructive text-xs">{r.error ?? '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
