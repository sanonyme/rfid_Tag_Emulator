/**
 * Runs as `capacitor:sync:after` (and tail of `npm run cap:sync`).
 * Capacitor may rewrite `ios/App/App/capacitor.config.json`; keep `packageClassList` empty
 * so local plugins are not auto-registered twice (OCR TCP is registered in AppBridgeViewController).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const capJson = path.join(__dirname, '../ios/App/App/capacitor.config.json')

if (fs.existsSync(capJson)) {
  const raw = fs.readFileSync(capJson, 'utf8')
  const j = JSON.parse(raw)
  const toRemove = new Set(['OCRTcpPlugin', 'FixedReaderTcpPlugin'])
  if (Array.isArray(j.packageClassList)) {
    j.packageClassList = j.packageClassList.filter((x) => !toRemove.has(x))
  } else {
    // If Capacitor didn't generate it for some reason, keep it empty rather than breaking local plugin wiring.
    j.packageClassList = []
  }
  fs.writeFileSync(capJson, JSON.stringify(j, null, '\t') + '\n')
  console.log('[after-cap-sync] capacitor.config.json packageClassList filtered (local TCP plugins only)')
}
