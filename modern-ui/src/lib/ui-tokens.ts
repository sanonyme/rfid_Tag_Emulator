/**
 * Shared UI style tokens.
 *
 * Reusable Tailwind class strings for recurring surfaces and control groups so
 * every tab/panel stays visually consistent. Import these instead of
 * re-deriving similar class strings locally.
 */

/** Elevated section/panel surface used for the major blocks inside a tab. */
export const sectionCard =
  "rounded-xl border-border/40 bg-card/95 shadow-elev-sm ring-1 ring-border/20 backdrop-blur-sm"

/** Quieter inset surface, e.g. log areas or nested panels. */
export const subtleCard =
  "rounded-xl border border-border/40 bg-muted/10 ring-1 ring-border/15"

/** Segmented-control shell shared by toolbars and primary action rows. */
export const actionGroup =
  "flex items-stretch gap-1 rounded-xl bg-muted/35 p-1 ring-1 ring-border/25"

/** Muted button used inside an actionGroup / toolbar. */
export const actionBtnMuted =
  "h-10 rounded-lg border-transparent bg-background/90 shadow-none transition-colors hover:bg-background"

/** Consistent section heading label (small, tracked, muted). */
export const sectionLabel =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground"

/**
 * Segmented sub-navigation (in-tab Tabs). Pair `segmentedTabsList` on the
 * `TabsList` with `segmentedTabTrigger` on each `TabsTrigger` for a consistent
 * pill-style switcher across tabs (LAN, Generator, ...).
 */
export const segmentedTabsList =
  "grid h-auto w-full gap-1 rounded-xl bg-muted/40 p-1 ring-1 ring-border/30"

export const segmentedTabTrigger =
  "gap-1.5 rounded-lg text-xs data-[state=active]:shadow-sm"
