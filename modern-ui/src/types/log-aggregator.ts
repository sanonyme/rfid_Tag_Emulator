export interface LogAggregatorProgress {
  phase: 'extract' | 'organize' | 'aggregate' | 'done'
  message: string
  current?: number
  total?: number
}

export interface LogAggregatorCategoryStat {
  name: string
  files: number
  aggregated: boolean
  aggregatedBytes?: number
}

export interface LogAggregatorResult {
  ok: true
  outputDir: string
  stats: {
    filesProcessed: number
    categories: LogAggregatorCategoryStat[]
    vsblFolders: number
    durationMs: number
    usedGitBash: boolean
    extractMethod: string
  }
}

export type LogAggregatorRunResponse =
  | LogAggregatorResult
  | { ok: false; error: string }

export type LogAggregatorPickResponse =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }
