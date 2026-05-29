import fs from 'fs'
import { runLogAggregator } from '../electron/log-aggregator-handler.ts'

const out = 'c:/Users/SamyChemaly/Downloads/_test_logagg_out'
fs.rmSync(out, { recursive: true, force: true })

const result = await runLogAggregator(
  'c:/Users/SamyChemaly/Downloads/ALL-day-RuralHall-260529072159.zip',
  out,
  (p) => console.log(p.phase, p.message, p.current ?? '', p.total ?? ''),
)

console.log(JSON.stringify(result, null, 2))

if (result.ok) {
  const coreAgg = fs.readFileSync(`${out}/core/aggregated_core.log`, 'utf8')
  const refAgg = fs.readFileSync(
    'c:/Users/SamyChemaly/Downloads/hanes_merged/core/aggregated_core.log',
    'utf8',
  )
  console.log('core line count ours:', coreAgg.split('\n').filter(Boolean).length)
  console.log('core line count ref:', refAgg.split('\n').filter(Boolean).length)
  console.log('core first line match:', coreAgg.split('\n')[0] === refAgg.split('\n')[0])
}
