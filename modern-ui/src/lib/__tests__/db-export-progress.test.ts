import { describe, expect, it } from 'vitest'
import { formatDbExportProgressMessage } from '../db-export-progress'

describe('formatDbExportProgressMessage', () => {
  it('includes row counts and percent when available', () => {
    const msg = formatDbExportProgressMessage({
      message: 'Exporting items…',
      exportedRows: 2500,
      totalRows: 10000,
    })
    expect(msg).toContain('2,500')
    expect(msg).toContain('10,000')
    expect(msg).toContain('25%')
  })

  it('includes table index when present', () => {
    expect(
      formatDbExportProgressMessage({
        message: 'Dumping orders…',
        tableIndex: 2,
        tableCount: 5,
      }),
    ).toBe('Dumping orders… (table 2/5)')
  })
})
