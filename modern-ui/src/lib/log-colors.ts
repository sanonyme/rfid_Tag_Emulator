import type { LogTheme } from './settings'

export function getLogColorClass(line: string, enabled: boolean, theme: LogTheme): string {
  let colorClass = 'text-muted-foreground hover:text-foreground'
  if (!enabled) return colorClass

  const lowerLine = line.toLowerCase()
  const isSend = line.includes('[SEND]') || line.includes('Sending') || line.includes('Sent')
  const isRecv = line.includes('[RECV]') || line.includes('Received') || line.includes('Accepted') || line.includes('Connected')
  const isError = lowerLine.includes('error') || lowerLine.includes('disconnected') || lowerLine.includes('failed')

  if (theme === 'default') {
    if (isSend) return 'text-blue-600 dark:text-blue-400'
    if (isRecv) return 'text-emerald-600 dark:text-emerald-400'
    if (isError) return 'text-destructive'
  } else if (theme === 'neon') {
    if (isSend) return 'text-cyan-500 dark:text-cyan-400 font-medium'
    if (isRecv) return 'text-fuchsia-500 dark:text-fuchsia-400 font-medium'
    if (isError) return 'text-rose-500 dark:text-rose-400 font-bold'
  } else if (theme === 'hacker') {
    if (isSend) return 'text-green-600 dark:text-green-500 font-semibold'
    if (isRecv) return 'text-green-500 dark:text-green-400'
    if (isError) return 'text-red-500 font-bold bg-red-500/10'
    return 'text-green-700 dark:text-green-600'
  } else if (theme === 'ocean') {
    if (isSend) return 'text-sky-500 dark:text-sky-400'
    if (isRecv) return 'text-teal-500 dark:text-teal-400'
    if (isError) return 'text-orange-500 dark:text-orange-400'
  }

  return colorClass
}
