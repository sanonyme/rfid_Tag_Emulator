import { Loader2, KeyRound, Fingerprint, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ColumnInfo } from './db-tab-shared'

function KeyBadge({ keyType }: { keyType: string }) {
  if (keyType === 'PRI') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/25 px-1.5 py-px text-[10px] font-medium">
        <KeyRound className="w-2.5 h-2.5" /> PRI
      </span>
    )
  }
  if (keyType === 'UNI') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 text-purple-500 ring-1 ring-purple-500/25 px-1.5 py-px text-[10px] font-medium">
        <Fingerprint className="w-2.5 h-2.5" /> UNI
      </span>
    )
  }
  if (keyType === 'MUL') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/25 px-1.5 py-px text-[10px] font-medium">
        <Link2 className="w-2.5 h-2.5" /> MUL
      </span>
    )
  }
  return <span className="text-muted-foreground/40">–</span>
}

export function DbStructureTable({
  structure,
  loading,
}: {
  structure: ColumnInfo[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted/90 backdrop-blur-sm shadow-[0_1px_0_hsl(var(--border))]">
            {['Column', 'Type', 'Null', 'Key', 'Default', 'Extra', 'Comment'].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {structure.map((col) => (
            <tr key={col.name} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
              <td className="px-3 py-1.5 text-xs font-mono font-medium">
                <span className="flex items-center gap-1.5">
                  {col.key === 'PRI' && <KeyRound className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                  {col.name}
                </span>
              </td>
              <td className="px-3 py-1.5 text-xs font-mono text-sky-500">{col.type}</td>
              <td className="px-3 py-1.5 text-xs">
                <span className={cn(col.nullable ? 'text-amber-500' : 'text-muted-foreground')}>
                  {col.nullable ? 'YES' : 'NO'}
                </span>
              </td>
              <td className="px-3 py-1.5 text-xs">
                <KeyBadge keyType={col.key} />
              </td>
              <td className="px-3 py-1.5 text-xs font-mono">
                {col.defaultValue ?? <span className="text-muted-foreground/50 italic">NULL</span>}
              </td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">{col.extra || '–'}</td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">{col.comment || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
