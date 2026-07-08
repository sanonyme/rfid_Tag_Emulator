import { createPortal } from 'react-dom'
import {
  Copy,
  Download,
  FileSearch,
  Play,
  PlusCircle,
  RotateCcw,
  Table2,
  Trash2,
  Wand2,
} from 'lucide-react'
import { FlippedContextMenu, MenuItem, MenuSeparator } from './DbSurfaces'
import { SYSTEM_DATABASES, type SidebarCtx } from './db-tab-shared'

/** Right-click menu for the sidebar tree (pane / database / table variants). */
export function DbSidebarContextMenu({
  ctx,
  exporting,
  onExportDatabase,
  onExportTable,
  onCreateTable,
  onCreateDatabase,
  onDropDatabase,
  onTruncateTable,
  onDropTable,
}: {
  ctx: SidebarCtx
  exporting: boolean
  onExportDatabase: (dbName: string, format: 'sql' | 'csv') => void
  onExportTable: (dbName: string, tableName: string, format: 'csv' | 'sql') => void
  onCreateTable: (dbName: string) => void
  onCreateDatabase: () => void
  onDropDatabase: (dbName: string) => void
  onTruncateTable: (dbName: string, tableName: string) => void
  onDropTable: (dbName: string, tableName: string) => void
}) {
  return createPortal(
    <FlippedContextMenu
      x={ctx.x}
      y={ctx.y}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {ctx.kind === 'database' && (
        <>
          <MenuItem
            icon={Download}
            iconClassName="text-sky-500"
            disabled={exporting}
            onClick={() => onExportDatabase(ctx.dbName, 'sql')}
          >
            Export database as SQL…
          </MenuItem>
          <MenuItem
            icon={Download}
            iconClassName="text-sky-500"
            disabled={exporting}
            onClick={() => onExportDatabase(ctx.dbName, 'csv')}
          >
            Export all tables as CSV…
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={Table2}
            iconClassName="text-primary"
            disabled={SYSTEM_DATABASES.has(ctx.dbName)}
            title={SYSTEM_DATABASES.has(ctx.dbName) ? 'System databases cannot be modified from here' : undefined}
            onClick={() => onCreateTable(ctx.dbName)}
          >
            New table…
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={PlusCircle} iconClassName="text-emerald-500" onClick={onCreateDatabase}>
            New database…
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={Trash2}
            destructive
            disabled={SYSTEM_DATABASES.has(ctx.dbName)}
            title={SYSTEM_DATABASES.has(ctx.dbName) ? 'System databases cannot be dropped from here' : undefined}
            onClick={() => onDropDatabase(ctx.dbName)}
          >
            Delete database…
          </MenuItem>
        </>
      )}
      {ctx.kind === 'pane' && (
        <MenuItem icon={PlusCircle} iconClassName="text-emerald-500" onClick={onCreateDatabase}>
          New database…
        </MenuItem>
      )}
      {ctx.kind === 'table' && (
        <>
          <MenuItem
            icon={Download}
            iconClassName="text-sky-500"
            disabled={exporting}
            onClick={() => onExportTable(ctx.dbName, ctx.tableName, 'csv')}
          >
            Export table as CSV…
          </MenuItem>
          <MenuItem
            icon={Download}
            iconClassName="text-sky-500"
            disabled={exporting}
            onClick={() => onExportTable(ctx.dbName, ctx.tableName, 'sql')}
          >
            Export table as SQL…
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={RotateCcw}
            iconClassName="text-amber-500"
            onClick={() => onTruncateTable(ctx.dbName, ctx.tableName)}
          >
            Empty table…
          </MenuItem>
          <MenuItem icon={Trash2} destructive onClick={() => onDropTable(ctx.dbName, ctx.tableName)}>
            Drop table…
          </MenuItem>
        </>
      )}
    </FlippedContextMenu>,
    document.body,
  )
}

/** Right-click menu for the SQL editor. */
export function DbEditorContextMenu({
  x,
  y,
  hasSelection,
  canCloseTab,
  onRunAll,
  onRunSelected,
  onPrettify,
  onExplain,
  onCopyAll,
  onCloseTab,
}: {
  x: number
  y: number
  hasSelection: boolean
  canCloseTab: boolean
  onRunAll: () => void
  onRunSelected: () => void
  onPrettify: () => void
  onExplain: () => void
  onCopyAll: () => void
  onCloseTab: () => void
}) {
  return createPortal(
    <FlippedContextMenu x={x} y={y} className="min-w-[190px]">
      <MenuItem icon={Play} iconClassName="text-emerald-500" shortcut="Ctrl+↵" onClick={onRunAll}>
        Run All
      </MenuItem>
      {hasSelection && (
        <MenuItem icon={Play} iconClassName="text-sky-500" onClick={onRunSelected}>
          Run Selected
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={Wand2} onClick={onPrettify}>Prettify SQL</MenuItem>
      <MenuItem icon={FileSearch} onClick={onExplain}>Explain</MenuItem>
      <MenuSeparator />
      <MenuItem icon={Copy} onClick={onCopyAll}>Copy All</MenuItem>
      {canCloseTab && (
        <MenuItem icon={Trash2} destructive onClick={onCloseTab}>
          Close Tab
        </MenuItem>
      )}
    </FlippedContextMenu>,
    document.body,
  )
}
