import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

export function readAppVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  return String(pkg.version ?? '').trim()
}

/** Keep package.json, Cargo.toml, and tauri.conf.json on the same semver. */
export function syncAppVersion() {
  const version = readAppVersion()
  if (!version) throw new Error('package.json version is missing')

  const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml')
  let cargo = fs.readFileSync(cargoPath, 'utf8')
  if (!/^version = "/m.test(cargo)) {
    throw new Error('Could not find version field in src-tauri/Cargo.toml')
  }
  cargo = cargo.replace(/^version = ".*"/m, `version = "${version}"`)
  fs.writeFileSync(cargoPath, cargo)

  const confPath = path.join(root, 'src-tauri', 'tauri.conf.json')
  const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'))
  conf.version = version
  fs.writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`)

  return version
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = syncAppVersion()
  console.log(`[version:sync] Synced app version ${version}`)
}
