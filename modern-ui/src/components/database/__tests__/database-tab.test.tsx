// @vitest-environment jsdom
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { fireEvent, render as rtlRender, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import type { ComponentProps } from 'react'
import { TooltipProvider } from '../../ui/tooltip'
import { DatabaseTab } from '../DatabaseTab'

/** The app always renders DatabaseTab under a TooltipProvider (App.tsx root). */
function render(props: ComponentProps<typeof DatabaseTab>) {
  return rtlRender(
    <TooltipProvider delayDuration={300}>
      <DatabaseTab {...props} />
    </TooltipProvider>,
  )
}

/* jsdom is missing a few browser APIs used by CodeMirror / Radix ScrollArea. */
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  }
  const rectListStub = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  })
  Range.prototype.getClientRects = rectListStub as unknown as typeof Range.prototype.getClientRects
  Range.prototype.getBoundingClientRect = () =>
    ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
})

afterEach(() => {
  cleanup()
  delete (window as any).electronAPI
})

const TABLE_DATA = {
  ok: true as const,
  columns: ['id', 'sku'],
  rows: [
    { id: 1, sku: 'UPC-0001' },
    { id: 2, sku: 'UPC-0002' },
  ],
  total: 2,
  columnTypes: { id: 'int', sku: 'varchar(64)' },
  primaryKeys: ['id'],
}

function installElectronApiMock() {
  const api = {
    dbConnect: vi.fn(async () => ({ ok: true as const, databases: ['zeus', 'mysql'] })),
    dbDisconnect: vi.fn(async () => {}),
    dbListDatabases: vi.fn(async () => ({ ok: true as const, databases: ['zeus', 'mysql'] })),
    dbGetTables: vi.fn(async () => ({ ok: true as const, tables: [{ name: 'items', rows: 2 }] })),
    dbGetTableData: vi.fn(async () => TABLE_DATA),
    dbExecuteQuery: vi.fn(async () => ({ ok: true as const, columns: [], rows: [], message: 'OK' })),
    dbGetTableStructure: vi.fn(async () => ({
      ok: true as const,
      columns: [
        { name: 'id', type: 'int', nullable: false, defaultValue: null, key: 'PRI', extra: 'auto_increment', comment: '' },
        { name: 'sku', type: 'varchar(64)', nullable: true, defaultValue: null, key: '', extra: '', comment: 'barcode' },
      ],
    })),
    dbGetDatabaseSchema: vi.fn(async () => ({ ok: true as const, tables: [], foreignKeys: [] })),
    onDbExportProgress: vi.fn(() => () => {}),
    safeStoreGet: vi.fn(async () => null),
    safeStoreSet: vi.fn(async () => true),
    safeStoreDelete: vi.fn(async () => undefined),
  }
  ;(window as any).electronAPI = api
  return api
}

describe('DatabaseTab (revamped)', () => {
  it('shows the no-reader screen when the emulator is not connected', () => {
    render({ host: '', connected: false })
    expect(screen.getByText(/No reader connected/i)).toBeInTheDocument()
  })

  it('shows the MySQL login card and connects through electronAPI', async () => {
    const api = installElectronApiMock()
    render({ host: '10.0.0.5', connected: true })

    expect(await screen.findByText('Database Explorer')).toBeInTheDocument()
    expect(screen.getByText(/10\.0\.0\.5/)).toBeInTheDocument()

    const connectBtn = await screen.findByRole('button', { name: /Connect to Database/i })
    await waitFor(() => expect(connectBtn).toBeDisabled()) // no username yet

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'root' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    await waitFor(() => expect(connectBtn).toBeEnabled())

    fireEvent.click(connectBtn)
    await waitFor(() => expect(api.dbConnect).toHaveBeenCalledWith('10.0.0.5', 'root', 'secret'))

    // Sidebar renders databases; system schemas are grouped separately
    expect(await screen.findByText('zeus')).toBeInTheDocument()
    expect(screen.getByText('mysql')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('expands a database, loads a table into the grid and shows structure view', async () => {
    const api = installElectronApiMock()
    render({ host: '10.0.0.5', connected: true })

    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'root' } })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Database/i }))

    fireEvent.click(await screen.findByText('zeus'))
    await waitFor(() => expect(api.dbGetTables).toHaveBeenCalledWith('zeus'))

    fireEvent.click(await screen.findByText('items'))
    await waitFor(() => expect(api.dbGetTableData).toHaveBeenCalled())

    // Grid data + read-only chip (default) + PK column marker
    expect(await screen.findByText('UPC-0001')).toBeInTheDocument()
    expect(screen.getByText('UPC-0002')).toBeInTheDocument()
    expect(screen.getByText('read-only')).toBeInTheDocument()

    // Structure view
    fireEvent.click(screen.getByRole('button', { name: /Structure/i }))
    await waitFor(() => expect(api.dbGetTableStructure).toHaveBeenCalledWith('zeus', 'items'))
    expect(await screen.findByText('auto_increment')).toBeInTheDocument()
    expect(screen.getByText('barcode')).toBeInTheDocument()
  })

  it('filters the sidebar tree and reports empty matches', async () => {
    installElectronApiMock()
    render({ host: '10.0.0.5', connected: true })

    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'root' } })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Database/i }))
    await screen.findByText('zeus')

    const filter = screen.getByPlaceholderText(/Filter databases & tables/i)
    fireEvent.change(filter, { target: { value: 'zeu' } })
    expect(screen.getByText('zeus')).toBeInTheDocument()
    expect(screen.queryByText('mysql')).not.toBeInTheDocument()

    fireEvent.change(filter, { target: { value: 'no-such-thing' } })
    expect(screen.getByText(/No databases or loaded tables match/i)).toBeInTheDocument()
  })
})
