import { existsSync, renameSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const APP_PROCESS_NAMES = ['Zeus RFID Emulator.exe']

function stopRunningApp() {
  if (process.platform !== 'win32') return

  for (const imageName of APP_PROCESS_NAMES) {
    const result = spawnSync('taskkill', ['/F', '/IM', imageName, '/T'], { stdio: 'ignore' })
    if (result.status === 0) {
      console.log(`Stopped ${imageName}`)
    }
  }
}

function removeDirWindows(targetPath) {
  spawnSync('cmd', ['/c', 'attrib', '-R', '-S', '-H', '/S', '/D', `${targetPath}\\*.*`], {
    stdio: 'ignore',
  })
  const result = spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', targetPath], { stdio: 'ignore' })
  return result.status === 0 && !existsSync(targetPath)
}

function moveAsideLockedDir(targetPath, distApp) {
  const stalePath = path.join(distApp, `win-unpacked.stale-${Date.now()}`)
  renameSync(targetPath, stalePath)
  console.warn(`Moved locked build output to ${path.basename(stalePath)}`)
  try {
    rmSync(stalePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  } catch {
    console.warn(`You can delete ${stalePath} manually later.`)
  }
}

export function cleanElectronOutput(cwd = process.cwd()) {
  const distApp = path.join(cwd, 'dist-app')
  const winUnpacked = path.join(distApp, 'win-unpacked')
  if (!existsSync(winUnpacked)) return

  stopRunningApp()

  try {
    rmSync(winUnpacked, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    return
  } catch {
    // fall through
  }

  if (process.platform === 'win32' && removeDirWindows(winUnpacked)) {
    return
  }

  try {
    moveAsideLockedDir(winUnpacked, distApp)
  } catch (error) {
    console.warn(
      `Could not clear ${winUnpacked}: ${error.message}. Will use an alternate build output directory.`,
    )
  }
}

export function resolveBuildOutput(cwd = process.cwd()) {
  const defaultOutput = path.join(cwd, 'dist-app')
  cleanElectronOutput(cwd)

  if (!existsSync(path.join(defaultOutput, 'win-unpacked'))) {
    return defaultOutput
  }

  const alternateOutput = path.join(cwd, 'dist-app-release')
  console.warn(`dist-app\\win-unpacked is locked; building into ${path.basename(alternateOutput)} instead.`)

  try {
    rmSync(alternateOutput, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  } catch {
    // If alternate is also locked, electron-builder will surface the error.
  }

  return alternateOutput
}

export function findPackagedOutputDir(cwd = process.cwd()) {
  for (const dirName of ['dist-app-release', 'dist-app']) {
    const outputDir = path.join(cwd, dirName)
    if (existsSync(path.join(outputDir, 'latest.yml'))) {
      return outputDir
    }
  }

  throw new Error('No packaged release found. Run npm run release:both first (look for latest.yml in dist-app or dist-app-release).')
}

export function electronBuilderOutputArgs(outputDir) {
  return ['-c.directories.output', outputDir]
}
