/**
 * Classify Edge server log filenames from a flat daily zip dump.
 * Output layout matches the hanes_merged folder structure.
 */

export type LogFileKind = 'category' | 'vsbl'

export interface ClassifiedLogFile {
  kind: LogFileKind
  /** Destination folder name under the output root */
  folder: string
  /** Original filename (basename) */
  filename: string
  /** Chronological sort key — hourly rotations sort ascending; current log is last */
  sortKey: string
  /** Category name for kind=category (e.g. core, access) */
  category?: string
}

/** Current (active) log file sorts after all hourly rotations. */
export const CURRENT_LOG_SORT_KEY = '9999-99-99-99'

const VSBL_HOURLY = /^vsbl\.(\d{4}-\d{2}-\d{2}-\d{2})\.log$/
const CATEGORY_ROTATED = /^([a-z0-9_-]+)\.log\.(\d{4}-\d{2}-\d{2}-\d{2})$/
const CATEGORY_CURRENT = /^([a-z0-9_-]+)\.log$/

export function classifyLogFilename(name: string): ClassifiedLogFile | null {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? name

  const vsblHourly = base.match(VSBL_HOURLY)
  if (vsblHourly) {
    const stamp = vsblHourly[1]
    return {
      kind: 'vsbl',
      folder: `vsbl.${stamp}`,
      filename: base,
      sortKey: stamp,
    }
  }

  if (base === 'vsbl.log') {
    return {
      kind: 'vsbl',
      folder: 'vsbl',
      filename: base,
      sortKey: CURRENT_LOG_SORT_KEY,
    }
  }

  const rotated = base.match(CATEGORY_ROTATED)
  if (rotated) {
    return {
      kind: 'category',
      folder: rotated[1],
      filename: base,
      sortKey: rotated[2],
      category: rotated[1],
    }
  }

  const current = base.match(CATEGORY_CURRENT)
  if (current) {
    return {
      kind: 'category',
      folder: current[1],
      filename: base,
      sortKey: CURRENT_LOG_SORT_KEY,
      category: current[1],
    }
  }

  return null
}

export function sortLogFiles<T extends { sortKey: string; filename: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const byKey = a.sortKey.localeCompare(b.sortKey)
    if (byKey !== 0) return byKey
    return a.filename.localeCompare(b.filename)
  })
}

export function groupClassifiedFiles(
  files: ClassifiedLogFile[],
): {
  categories: Map<string, ClassifiedLogFile[]>
  vsbl: ClassifiedLogFile[]
} {
  const categories = new Map<string, ClassifiedLogFile[]>()
  const vsbl: ClassifiedLogFile[] = []

  for (const file of files) {
    if (file.kind === 'vsbl') {
      vsbl.push(file)
      continue
    }
    const cat = file.category ?? file.folder
    const list = categories.get(cat) ?? []
    list.push(file)
    categories.set(cat, list)
  }

  for (const [cat, list] of categories) {
    categories.set(cat, sortLogFiles(list))
  }

  return { categories, vsbl }
}

export function shouldAggregateCategory(files: ClassifiedLogFile[]): boolean {
  return files.length >= 2
}

export function aggregatedFilename(category: string): string {
  return `aggregated_${category}.log`
}
