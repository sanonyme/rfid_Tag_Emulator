import packageJson from '../../package.json'

export const APP_VERSION = packageJson.version

const STORAGE_KEY = 'zeus-whats-new-seen-version'

export type WhatsNewItem = {
  title: string
  detail?: string
}

export type WhatsNewEntry = {
  version: string
  date?: string
  highlights: WhatsNewItem[]
}

/**
 * Newest-first release notes shown in the What's New dialog.
 * Add a new entry at the top whenever you ship a user-facing release.
 * `getWhatsNewForDialog` always surfaces the running version first.
 */
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '10.2.3',
    date: '2026-09',
    highlights: [
      {
        title: 'Files: resizable columns',
        detail: 'Name fills the panel; drag Size/Changed (and other) boundaries to resize. Headers stay aligned with the rows.',
      },
      {
        title: 'Files: delete folders without admin',
        detail: 'Recursive folder delete works for any connected session — no admin login required.',
      },
      {
        title: 'Files: view, diff, checksum, favorites',
        detail: 'Open remote files in a viewer, compare with local, checksum, and star favorite paths.',
      },
      {
        title: 'Automation: triggers and variables',
        detail: 'Workflow triggers dialog and variable autocomplete when configuring nodes.',
      },
    ],
  },
  {
    version: '10.2.2',
    date: '2026-09',
    highlights: [
      {
        title: 'Files: saved connections stay gone',
        detail: 'Removing a saved host no longer comes back after another tab connects or the app reloads.',
      },
      {
        title: 'Files: clicking a saved connection works',
        detail: 'A stuck “Connecting…” state no longer swallows clicks; missing fields show an error instead of doing nothing.',
      },
    ],
  },
  {
    version: '10.2.1',
    date: '2026-09',
    highlights: [
      {
        title: 'Files: no more duplicate S3 uploads',
        detail: 'Drag-and-drop onto a folder no longer also writes a second copy at the bucket root (same bug on SFTP/FTP).',
      },
      {
        title: 'Files: reliable uploads',
        detail: 'Picked and dropped files stream from disk with progress, including files outside the local panel folder.',
      },
      {
        title: 'Automation: run another sequence',
        detail: 'Starting a sequence individually no longer blocks the next one — Stop on the active row, Play elsewhere takes over.',
      },
      {
        title: 'Automation: n8n-style extras',
        detail: 'Retry / On error / Notes on nodes, Run from here, and an Executions history of recent runs.',
      },
    ],
  },
  {
    version: '10.2.0',
    date: '2026-09',
    highlights: [
      {
        title: 'Files tab',
        detail: 'SFTP, FTP/FTPS, Amazon S3, and S3-compatible storage (MinIO, R2) in one explorer.',
      },
      {
        title: 'SSH private-key login',
        detail: 'Connect over SFTP with a key file and optional passphrase — password is optional.',
      },
      {
        title: 'Saved & recent connections',
        detail: 'Pin hosts you use often; recents fill in without auto-saving credentials.',
      },
      {
        title: 'Protocol picker',
        detail: 'Choose SFTP, FTP, Amazon S3, or S3-compatible first, then fill in only what that protocol needs.',
      },
    ],
  },
  {
    version: '10.1.1',
    date: '2026-09',
    highlights: [
      {
        title: 'TDS 2.3 decoder & encoder',
        detail: 'Full support for + / ++ schemes (CPI++, SGTIN++, SSCC++, and more) via the TDT bridge.',
      },
      {
        title: 'CPI++ encode & decode',
        detail: 'Quick fields for CPI / serial / hostname, and reliable hex ↔ Digital Link / bare ID translation.',
      },
      {
        title: 'Decoder reliability',
        detail: 'Fixed TDTLevelNotFound on modern schemes and stuck “loading field definitions” on encode.',
      },
    ],
  },
  {
    version: '10.0.0',
    date: '2026-09',
    highlights: [
      {
        title: 'JSON Lint tab',
        detail: 'Format, validate, and inspect JSON from a dedicated Tools tab.',
      },
      {
        title: 'Database enhancements',
        detail: 'Richer inspect dialogs, schema graph polish, built-in lookups, and faster workflows.',
      },
      {
        title: 'Fixed reader polish',
        detail: 'Clearer tag-list format hints and smoother send/list handling.',
      },
      {
        title: 'Optional @userdata',
        detail: 'Pass per-tag userdata on Fixed and Handheld lists (UPC and EPC formats).',
      },
      {
        title: "What's New",
        detail: 'Patch notes popup after updates, plus a title-bar button to reopen anytime.',
      },
    ],
  },
  {
    version: '9.4.2',
    date: '2026-08',
    highlights: [
      {
        title: 'Built-in database lookups',
        detail: 'One-value queries for container SSCC, order number, item barcode, and container items.',
      },
      {
        title: 'Handheld UX',
        detail: 'Compact format Info tips so list toolbars stay aligned.',
      },
      {
        title: 'SFTP & DB performance',
        detail: 'Snappier SFTP browsing and database work for large sessions.',
      },
    ],
  },
  {
    version: '9.1.1',
    date: '2026-07',
    highlights: [
      {
        title: 'Database & Handheld fixes',
        detail: 'CSV/SQL export for tables, create-table dialog, and handheld stack overflow fixes for huge lists.',
      },
      {
        title: 'Automation menu fix',
        detail: 'Add Node menu no longer clipped by overflow.',
      },
    ],
  },
  {
    version: '9.1.0',
    date: '2026-06',
    highlights: [
      {
        title: 'DB & Edge optimizations',
        detail: 'Faster database queries and Edge tab improvements.',
      },
      {
        title: 'Multi SFTP sessions',
        detail: 'Multiple SFTP connections and tabs in one workspace.',
      },
      {
        title: 'DB import & tools',
        detail: 'Import, SQL prettify, EXPLAIN, and create-database from the pane menu.',
      },
    ],
  },
  {
    version: '9.0.0',
    date: '2026-06',
    highlights: [
      {
        title: 'SFTP overhaul',
        detail: 'Properties, move files/folders, Ctrl+F find, and broader connection options including ALE port.',
      },
      {
        title: 'UI & bug fixes',
        detail: 'Connection tab polish and assorted stability improvements.',
      },
    ],
  },
  {
    version: '8.7.0',
    date: '2026-06',
    highlights: [
      {
        title: 'Smoother UI',
        detail: 'General UI polish across the app.',
      },
      {
        title: 'Zeus branding',
        detail: 'Project renamed to Zeus.',
      },
    ],
  },
  {
    version: '8.6.0',
    date: '2026-06',
    highlights: [
      {
        title: 'Edge welcome',
        detail: 'First-class Edge emulator experience.',
      },
    ],
  },
  {
    version: '8.5.0',
    date: '2026-06',
    highlights: [
      {
        title: 'Stability',
        detail: 'Minor bug fixes and live UPC check-digit refinements.',
      },
    ],
  },
  {
    version: '8.4.x',
    date: '2026-05',
    highlights: [
      {
        title: 'UPC live checker & preview',
        detail: 'Live check digit feedback, UPC preview, and optional check-digit stripping in Settings.',
      },
      {
        title: 'Log Aggregator',
        detail: 'Admin log aggregator plus clearer DB result clearing.',
      },
    ],
  },
  {
    version: '8.3.0',
    date: '2026-05',
    highlights: [
      {
        title: 'GS1 TDT',
        detail: 'Tag Data Translation schemes wired into Decoder / Encoder workflows.',
      },
    ],
  },
  {
    version: '8.0.0',
    date: '2026-04',
    highlights: [
      {
        title: 'Audit / telemetry',
        detail: 'Optional usage insights to improve Zeus over time.',
      },
      {
        title: 'Feature pack',
        detail: 'Broader automation, LAN, and admin tooling updates.',
      },
    ],
  },
  {
    version: '7.1.0',
    date: '2026-04',
    highlights: [
      {
        title: 'LAN & onboarding',
        detail: 'More LAN scan capabilities and first-run onboarding helpers.',
      },
    ],
  },
  {
    version: '7.0.0',
    date: '2026-04',
    highlights: [
      {
        title: 'LAN Scan',
        detail: 'Discover devices on your network from Zeus.',
      },
      {
        title: 'SFTP upgrades',
        detail: 'More options and reliability fixes for remote file browsing.',
      },
    ],
  },
  {
    version: '6.2.0',
    date: '2026-04',
    highlights: [
      {
        title: 'Database schema mapping',
        detail: 'Table relationships and structure mapped in the DB tab.',
      },
    ],
  },
  {
    version: '6.0.0 – 6.1.0',
    date: '2026-03',
    highlights: [
      {
        title: 'Database tab',
        detail: 'SQL editor, field editing, and HeidiSQL-inspired workflows.',
      },
      {
        title: 'Admin tools',
        detail: 'Terminal, UUID helpers, and randomized RSSI when emulating.',
      },
      {
        title: 'API substitutions',
        detail: 'Template substitution support in the API tab.',
      },
      {
        title: 'Mobile groundwork',
        detail: 'Early mobile shell and related fixes.',
      },
    ],
  },
  {
    version: '5.0.0',
    date: '2026-03',
    highlights: [
      {
        title: 'Modern UI refresh',
        detail: 'Major visual redesign across Zeus.',
      },
      {
        title: 'Port 80 fix',
        detail: 'Urgent fix for host/port edge cases.',
      },
    ],
  },
  {
    version: '4.x',
    date: '2025-12 – 2026-03',
    highlights: [
      {
        title: 'Command palette',
        detail: 'Ctrl+K quick navigation across the app.',
      },
      {
        title: 'Antennas & RSSI UI',
        detail: 'New antenna controls and RSSI slider for Fixed emulation.',
      },
      {
        title: 'Base64 & POST API',
        detail: 'Encode/decode helpers and POST support in the API tab.',
      },
      {
        title: 'Multi-port Handheld',
        detail: 'Run several handheld servers on different ports in one Zeus instance.',
      },
      {
        title: 'Custom TCP sender',
        detail: 'Send customer messages on a custom port.',
      },
      {
        title: 'Barcode generator',
        detail: 'Code-128 barcode generation built in.',
      },
      {
        title: 'Logical device fetch',
        detail: 'Improved ALE logical-device discovery for Fixed.',
      },
    ],
  },
  {
    version: '3.x',
    date: '2025',
    highlights: [
      {
        title: 'Auto-update UX',
        detail: 'Optional download, startup/hourly silent checks, and update indicator.',
      },
      {
        title: 'Version in title bar',
        detail: 'Running app version shown in the window chrome.',
      },
      {
        title: 'Themes',
        detail: 'Cyberpunk theme and tab spacing polish.',
      },
    ],
  },
]

export function getSeenWhatsNewVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setSeenWhatsNewVersion(version: string = APP_VERSION): void {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    /* ignore quota / private mode */
  }
}

/** True when this install has never acknowledged the current app version's notes. */
export function shouldAutoShowWhatsNew(currentVersion: string = APP_VERSION): boolean {
  const seen = getSeenWhatsNewVersion()
  return seen !== currentVersion
}

export function getWhatsNewForDialog(currentVersion: string = APP_VERSION): WhatsNewEntry[] {
  const current = WHATS_NEW.find((e) => e.version === currentVersion)
  const rest = WHATS_NEW.filter((e) => e.version !== currentVersion)
  return current ? [current, ...rest] : [...WHATS_NEW]
}
