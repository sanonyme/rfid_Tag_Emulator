/**
 * Shared UI style tokens.
 *
 * Reusable Tailwind class strings for recurring surfaces and control groups so
 * every tab/panel stays visually consistent. Import these instead of
 * re-deriving similar class strings locally.
 */

/** Elevated section/panel surface used for the major blocks inside a tab. */
export const sectionCard =
  'rounded-xl border border-border/40 bg-card/95 shadow-elev-sm ring-1 ring-border/20 backdrop-blur-sm'

/** Quieter inset surface, e.g. log areas or nested panels. */
export const subtleCard =
  'rounded-xl border border-border/40 bg-muted/10 ring-1 ring-border/15'

/** Segmented-control shell shared by toolbars and primary action rows. */
export const actionGroup =
  'flex items-stretch gap-1 rounded-xl bg-muted/35 p-1 ring-1 ring-border/25'

/** Muted button used inside an actionGroup / toolbar. */
export const actionBtnMuted =
  'h-10 rounded-lg border-transparent bg-background/90 shadow-none transition-colors hover:bg-background'

/** Consistent section heading label (small, tracked, muted). */
export const sectionLabel =
  'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export const segmentedTabsList =
  'grid h-auto w-full gap-1 rounded-xl bg-muted/40 p-1 ring-1 ring-border/30'

/** Full-height tab body: column flex with consistent gap. */
export const pageShell = 'stagger-children flex h-full min-h-0 flex-col gap-3'

/** Page header row: title + optional actions. */
export const pageHeader =
  'flex shrink-0 items-start justify-between gap-3 flex-wrap'

/** Page title (h2-level). */
export const pageTitle = 'text-lg font-semibold text-foreground leading-tight'

/** Supporting line under page title. */
export const pageDescription = 'text-xs text-muted-foreground mt-1 max-w-3xl'

/** Compact toolbar strip under the header. */
export const pageToolbar =
  'flex shrink-0 flex-wrap items-center gap-1.5 rounded-xl border border-border/40 bg-muted/15 px-2 py-1.5 ring-1 ring-border/20'

/** Primary scrollable content surface. */
export const pageContent =
  'flex-1 min-h-0 rounded-xl border border-border/40 bg-background/40 overflow-hidden'

/**
 * Monospace stack for EPCs, IPs, SQL, hex, and other technical values.
 * Prefer these over bare `font-mono` so the typeface stays consistent.
 */
export const mono =
  'font-mono [font-family:var(--font-mono)] tracking-tight'

export const monoSm = `${mono} text-xs`
export const monoXs = `${mono} text-[11px]`
export const monoInput = `${mono} text-sm`
