import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import {
  aggregatedFilename,
  classifyLogFilename,
  groupClassifiedFiles,
  shouldAggregateCategory,
  type ClassifiedLogFile,
} from '../src/lib/log-aggregator.js'

const execFile = promisify(execFileCb)

import type {
  LogAggregatorProgress,
  LogAggregatorCategoryStat,
  LogAggregatorResult,
  LogAggregatorRunResponse,
} from '../src/types/log-aggregator.js'

export type LogAggregatorResponse = LogAggregatorRunResponse

type ProgressFn = (progress: LogAggregatorProgress) => void

function findGitBash(): string | null {
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ].filter(Boolean) as string[]

  for (const root of roots) {
    const candidate = path.join(root, 'Git', 'bin', 'bash.exe')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function toBashPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/"/g, '\\"')
}

async function extractZip(zipPath: string, destDir: string): Promise<string> {
  await fs.promises.mkdir(destDir, { recursive: true })

  try {
    await execFile('tar', ['-xf', zipPath, '-C', destDir], { windowsHide: true })
    return 'tar'
  } catch {
    /* try next */
  }

  const bash = findGitBash()
  if (bash) {
    await execFile(
      bash,
      ['-lc', `unzip -o "${toBashPath(zipPath)}" -d "${toBashPath(destDir)}"`],
      { windowsHide: true },
    )
    return 'git-bash-unzip'
  }

  const psDest = destDir.replace(/'/g, "''")
  const psZip = zipPath.replace(/'/g, "''")
  await execFile(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${psZip}' -DestinationPath '${psDest}' -Force`,
    ],
    { windowsHide: true },
  )
  return 'powershell'
}

async function concatWithBash(bash: string, outputPath: string, inputPaths: string[]): Promise<void> {
  const parts = inputPaths.map((p) => `"${toBashPath(p)}"`).join(' ')
  const out = `"${toBashPath(outputPath)}"`
  await execFile(bash, ['-lc', `cat ${parts} > ${out}`], { windowsHide: true, maxBuffer: 1024 * 1024 })
}

async function concatWithNode(outputPath: string, inputPaths: string[]): Promise<void> {
  const out = createWriteStream(outputPath)
  try {
    for (const inputPath of inputPaths) {
      await pipeline(createReadStream(inputPath), out, { end: false })
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      out.end(() => resolve())
      out.on('error', reject)
    })
  }
}

async function listExtractedLogFiles(rootDir: string): Promise<string[]> {
  const out: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && classifyLogFilename(entry.name)) {
        out.push(full)
      }
    }
  }

  await walk(rootDir)
  return out
}

async function safeRmDir(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true })
  } catch {
    /* ignore cleanup errors */
  }
}

export async function runLogAggregator(
  zipPath: string,
  outputDir: string,
  onProgress?: ProgressFn,
): Promise<LogAggregatorResponse> {
  const started = Date.now()
  const gitBash = findGitBash()
  let tempDir: string | null = null

  try {
    const zipStat = await fs.promises.stat(zipPath)
    if (!zipStat.isFile()) return { ok: false, error: 'Zip path is not a file' }

    await fs.promises.mkdir(outputDir, { recursive: true })

    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zeus-logagg-'))
    onProgress?.({ phase: 'extract', message: 'Extracting zip…' })
    const extractMethod = await extractZip(zipPath, tempDir)

    const extractedPaths = await listExtractedLogFiles(tempDir)
    if (extractedPaths.length === 0) {
      return { ok: false, error: 'No recognizable log files found in the zip' }
    }

    const classified: Array<ClassifiedLogFile & { sourcePath: string }> = []
    for (const sourcePath of extractedPaths) {
      const info = classifyLogFilename(path.basename(sourcePath))
      if (info) classified.push({ ...info, sourcePath })
    }

    const { categories, vsbl } = groupClassifiedFiles(classified)
    const totalMoves = classified.length
    let moveIndex = 0

    onProgress?.({ phase: 'organize', message: 'Organizing log files…', current: 0, total: totalMoves })

    for (const file of vsbl) {
      const withPath = file as ClassifiedLogFile & { sourcePath: string }
      const folderPath = path.join(outputDir, file.folder)
      await fs.promises.mkdir(folderPath, { recursive: true })
      const destPath = path.join(folderPath, file.filename)
      await fs.promises.rename(withPath.sourcePath, destPath)
      moveIndex += 1
      onProgress?.({
        phase: 'organize',
        message: `Placed ${file.filename}`,
        current: moveIndex,
        total: totalMoves,
      })
    }

    const categoryStats: LogAggregatorCategoryStat[] = []
    const aggregateJobs: Array<{ category: string; paths: string[] }> = []

    for (const [category, files] of categories) {
      const folderPath = path.join(outputDir, category)
      await fs.promises.mkdir(folderPath, { recursive: true })

      const movedPaths: string[] = []
      for (const file of files) {
        const withPath = file as ClassifiedLogFile & { sourcePath: string }
        const destPath = path.join(folderPath, file.filename)
        await fs.promises.rename(withPath.sourcePath, destPath)
        movedPaths.push(destPath)
        moveIndex += 1
        onProgress?.({
          phase: 'organize',
          message: `Placed ${file.filename}`,
          current: moveIndex,
          total: totalMoves,
        })
      }

      const stat: LogAggregatorCategoryStat = {
        name: category,
        files: movedPaths.length,
        aggregated: false,
      }

      if (shouldAggregateCategory(files)) {
        aggregateJobs.push({ category, paths: movedPaths })
        stat.aggregated = true
      }

      categoryStats.push(stat)
    }

    const totalAgg = aggregateJobs.length
    for (let i = 0; i < aggregateJobs.length; i += 1) {
      const job = aggregateJobs[i]
      const aggPath = path.join(outputDir, job.category, aggregatedFilename(job.category))
      onProgress?.({
        phase: 'aggregate',
        message: `Merging ${job.category} logs…`,
        current: i + 1,
        total: totalAgg,
      })

      if (gitBash) {
        await concatWithBash(gitBash, aggPath, job.paths)
      } else {
        await concatWithNode(aggPath, job.paths)
      }

      const aggStat = await fs.promises.stat(aggPath)
      const catStat = categoryStats.find((c) => c.name === job.category)
      if (catStat) catStat.aggregatedBytes = aggStat.size
    }

    categoryStats.sort((a, b) => a.name.localeCompare(b.name))

    onProgress?.({ phase: 'done', message: 'Done' })

    return {
      ok: true,
      outputDir,
      stats: {
        filesProcessed: classified.length,
        categories: categoryStats,
        vsblFolders: vsbl.length,
        durationMs: Date.now() - started,
        usedGitBash: Boolean(gitBash),
        extractMethod,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    if (tempDir) await safeRmDir(tempDir)
  }
}
