import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  AlertCircle,
  Database,
  Loader2,
  Plus,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react'
import { SubtleModal } from './DbSurfaces'
import { DEFAULT_CREATE_TABLE_COLUMNS, type SchemaConfirmState } from './db-tab-shared'
import type { ParsedImport } from '@/lib/db-import-parse'

export function DbDeleteRowDialog({
  row,
  primaryKeys,
  onCancel,
  onConfirm,
}: {
  row: any
  primaryKeys: string[]
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <SubtleModal className="max-w-sm">
      <div className="flex items-center gap-2 text-destructive mb-3">
        <Trash2 className="w-5 h-5" />
        <span className="font-semibold">Delete row</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Are you sure you want to delete this row? This action cannot be undone.
      </p>
      <div className="text-xs font-mono bg-muted/30 rounded-lg px-3 py-2 mb-4 max-h-24 overflow-auto">
        {primaryKeys.map((pk) => (
          <div key={pk}>
            <span className="text-muted-foreground">{pk}:</span> {String(row[pk])}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" size="sm" className="gap-1" onClick={onConfirm}>
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      </div>
    </SubtleModal>
  )
}

export function DbBulkDeleteDialog({
  count,
  deleting,
  onCancel,
  onConfirm,
}: {
  count: number
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <SubtleModal className="max-w-sm">
      <div className="flex items-center gap-2 text-destructive mb-3">
        <Trash2 className="w-5 h-5" />
        <span className="font-semibold">
          Delete {count} row{count > 1 ? 's' : ''}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Are you sure you want to delete {count} selected row{count > 1 ? 's' : ''}? This action cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>Cancel</Button>
        <Button variant="destructive" size="sm" className="gap-1" onClick={onConfirm} disabled={deleting}>
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Delete {count}
        </Button>
      </div>
    </SubtleModal>
  )
}

export function DbSchemaConfirmDialog({
  confirm,
  busy,
  onCancel,
  onConfirm,
}: {
  confirm: SchemaConfirmState
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <SubtleModal className="max-w-md">
      <div className="flex items-center gap-2 text-destructive mb-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span className="font-semibold">
          {confirm.kind === 'truncate' && 'Empty table'}
          {confirm.kind === 'dropTable' && 'Drop table'}
          {confirm.kind === 'dropDatabase' && 'Delete database'}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        {confirm.kind === 'truncate' && (
          <>
            Run <code className="text-xs font-mono bg-muted/50 px-1 rounded">TRUNCATE TABLE</code> on{' '}
            <span className="font-mono text-foreground">{confirm.db}.{confirm.table}</span>? All rows are removed;
            structure stays. Fails if foreign keys reference this table.
          </>
        )}
        {confirm.kind === 'dropTable' && (
          <>
            Permanently drop <span className="font-mono text-foreground">{confirm.db}.{confirm.table}</span>? This
            cannot be undone.
          </>
        )}
        {confirm.kind === 'dropDatabase' && (
          <>
            Permanently drop database <span className="font-mono text-foreground">{confirm.db}</span> and all of its
            tables? This cannot be undone.
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Runs on the server even if query editor read-only mode is on.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="destructive" size="sm" className="gap-1" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Confirm
        </Button>
      </div>
    </SubtleModal>
  )
}

export function DbImportPreviewDialog({
  preview,
  filename,
  selectedDb,
  selectedTable,
  tableColumns,
  busy,
  onCancel,
  onConfirm,
}: {
  preview: ParsedImport
  filename: string
  selectedDb: string
  selectedTable: string
  tableColumns: string[]
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <SubtleModal className="max-w-lg">
      <div className="flex items-center gap-2 mb-3">
        <Upload className="w-5 h-5 text-primary" />
        <span className="font-semibold">Import rows</span>
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        Import into <span className="font-mono text-foreground">{selectedDb}.{selectedTable}</span> from{' '}
        <span className="font-mono">{filename}</span>
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        {preview.rows.length.toLocaleString()} row(s), {preview.columns.length} column(s). Only columns that exist on
        the table are inserted. Empty cells and <code className="font-mono bg-muted/50 px-1 rounded">NULL</code> become
        SQL NULL.
      </p>
      <div className="rounded-lg border border-border/50 overflow-auto max-h-40 mb-4">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {preview.columns.slice(0, 6).map((col) => (
                <th key={col} className="px-2 py-1 text-left font-medium text-muted-foreground">
                  {col}
                  {!tableColumns.includes(col) && (
                    <span className="ml-1 text-amber-500" title="Not on target table">!</span>
                  )}
                </th>
              ))}
              {preview.columns.length > 6 && <th className="px-2 py-1 text-left text-muted-foreground">…</th>}
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 5).map((row, i) => (
              <tr key={i} className="border-t border-border/30">
                {preview.columns.slice(0, 6).map((col) => (
                  <td key={col} className="px-2 py-1 font-mono truncate max-w-[120px]">
                    {row[col] || <span className="text-muted-foreground/50 italic">NULL</span>}
                  </td>
                ))}
                {preview.columns.length > 6 && <td className="px-2 py-1 text-muted-foreground">…</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" className="gap-1" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Import {preview.rows.length.toLocaleString()} row(s)
        </Button>
      </div>
    </SubtleModal>
  )
}

export function DbCreateTableDialog({
  db,
  name,
  columnsSql,
  busy,
  onNameChange,
  onColumnsChange,
  onCancel,
  onSubmit,
}: {
  db: string
  name: string
  columnsSql: string
  busy: boolean
  onNameChange: (v: string) => void
  onColumnsChange: (v: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <SubtleModal className="max-w-md">
      <div className="flex items-center gap-2 mb-3">
        <Table2 className="w-5 h-5 text-primary" />
        <span className="font-semibold">New table</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Create in <span className="font-mono text-foreground">{db}</span>
      </p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Table name</label>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="my_table"
            className="font-mono text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit()
            }}
          />
          <p className="text-[10px] text-muted-foreground">Letters, digits, _, $, - only; max 64.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Column definitions</label>
          <textarea
            value={columnsSql}
            onChange={(e) => onColumnsChange(e.target.value)}
            rows={4}
            spellCheck={false}
            className="w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y min-h-[88px]"
          />
          <p className="text-[10px] text-muted-foreground">
            SQL inside the parentheses, e.g.{' '}
            <code className="font-mono bg-muted/50 px-1 rounded">name VARCHAR(255) NOT NULL</code>. Default:{' '}
            <code className="font-mono bg-muted/50 px-1 rounded">{DEFAULT_CREATE_TABLE_COLUMNS}</code>
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" className="gap-1" onClick={onSubmit} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Create table
        </Button>
      </div>
    </SubtleModal>
  )
}

export function DbCreateDatabaseDialog({
  name,
  busy,
  onNameChange,
  onCancel,
  onSubmit,
}: {
  name: string
  busy: boolean
  onNameChange: (v: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <SubtleModal className="max-w-sm">
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-5 h-5 text-amber-500" />
        <span className="font-semibold">New database</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">Name: letters, digits, _, $, - (max 64).</p>
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="my_database"
        className="font-mono text-sm mb-4"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" className="gap-1" onClick={onSubmit} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Create
        </Button>
      </div>
    </SubtleModal>
  )
}
