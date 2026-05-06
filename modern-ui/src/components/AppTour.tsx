import { useMemo, useCallback } from 'react'
import { flushSync } from 'react-dom'
import {
  Joyride,
  EVENTS,
  STATUS,
  type BeforeHook,
  type FloatingOptions,
  type Step,
  type StepTarget,
  type TooltipRenderProps,
  type EventHandler,
} from 'react-joyride'
import { Button } from './ui/button'
import { X } from 'lucide-react'
import { useTourInteractionOptional } from '@/contexts/TourInteractionContext'
import { cn } from '@/lib/utils'

export type TourInteractiveKind =
  | 'emulator_connect'
  | 'db_mysql_connect'
  | 'db_open_table'
  | 'db_run_query'
  | 'sftp_connect'
  | 'sftp_browse'

export type TourStepData = {
  tab?: string
  requiresAdmin?: boolean
  interactive?: TourInteractiveKind
}

/** Resolves a tour anchor that may be absent until the user reaches the right UI state. */
function tourTarget(primary: string, fallback?: string): StepTarget {
  return () => {
    const a = document.querySelector(`[data-tour="${primary}"]`) as HTMLElement | null
    if (a) return a
    if (fallback) {
      const b = document.querySelector(`[data-tour="${fallback}"]`) as HTMLElement | null
      if (b) return b
    }
    return document.body
  }
}

const INTERACTIVE_HINTS: Record<TourInteractiveKind, string> = {
  emulator_connect:
    'Next unlocks when the emulator shows connected. Use Skip this step to keep touring without connecting.',
  db_mysql_connect:
    'Sign in to MySQL on the reader host. Skip this step if you only want the overview (later DB steps work best after you connect).',
  db_open_table: 'Expand a database in the sidebar and click a table to load its data — or skip.',
  db_run_query: 'Use Run or Ctrl+Enter in the SQL editor to execute a query — or skip.',
  sftp_connect: 'Fill host, port, and credentials, then Connect (desktop app). Skip if you are not using SFTP.',
  sftp_browse:
    'After SSH connects, the remote tree appears here; expand a folder to explore. Skip if SFTP is unavailable.',
}

function interactiveSatisfied(
  kind: TourInteractiveKind | undefined,
  emulatorConnected: boolean,
  tourIx: ReturnType<typeof useTourInteractionOptional>,
): boolean {
  if (!kind) return true
  switch (kind) {
    case 'emulator_connect':
      return emulatorConnected
    case 'db_mysql_connect':
      return tourIx?.dbMysqlConnected ?? false
    case 'db_open_table':
      return tourIx?.dbTableSelected ?? false
    case 'db_run_query':
      return tourIx?.dbQueryRanThisTour ?? false
    case 'sftp_connect':
      return tourIx?.sftpShellConnected ?? false
    case 'sftp_browse':
      return tourIx?.sftpRemoteListed ?? false
  }
}

type TourTooltipProps = TooltipRenderProps & { emulatorConnected: boolean }

function TourTooltip(props: TourTooltipProps) {
  const {
    index,
    isLastStep,
    size,
    step,
    backProps,
    closeProps,
    primaryProps,
    skipProps,
    tooltipProps,
    controls,
    emulatorConnected,
  } = props

  const tourIx = useTourInteractionOptional()
  const stepData = step.data as TourStepData | undefined
  const kind = stepData?.interactive
  const satisfied = interactiveSatisfied(kind, emulatorConnected, tourIx)
  const primaryDisabled = Boolean(kind && !satisfied)

  const nudgeTooltipUp =
    kind === 'emulator_connect' && tourIx?.connectionPopoverOpen

  return (
    <div
      {...tooltipProps}
      className={cn(
        'rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl p-5 max-w-[min(28rem,calc(100vw-2rem))] text-left text-foreground transition-transform duration-200',
        nudgeTooltipUp && '-translate-y-5',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          {step.title ? (
            <h3 className="text-base font-semibold tracking-tight text-foreground">{step.title}</h3>
          ) : null}
          <p className="text-[11px] font-medium uppercase tracking-wider text-primary/90 mt-1">
            Step {index + 1} of {size}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          {...closeProps}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed">{step.content}</div>
      {kind && !satisfied ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 leading-relaxed">
          {INTERACTIVE_HINTS[kind]}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" {...skipProps}>
          Skip tour
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          {index > 0 && (
            <Button type="button" variant="outline" size="sm" {...backProps}>
              Back
            </Button>
          )}
          {kind ? (
            <Button type="button" variant="outline" size="sm" onClick={() => controls.next()}>
              Skip this step
            </Button>
          ) : null}
          <Button type="button" size="sm" {...primaryProps} disabled={primaryDisabled}>
            {isLastStep ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function buildSteps(isAdmin: boolean): Step[] {
  const steps: Step[] = [
    {
      target: 'body',
      placement: 'center',
      title: 'Welcome to Zeus',
      content:
        'This tour walks the UI and includes optional hands-on steps (connect, database, SFTP). Next may stay disabled until you complete a step — use Skip this step to move on, or Skip tour to exit anytime.',
      data: { tab: 'fixed' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-connection"]',
      // Tooltip above the orb; spotlight stays on the icon until the panel opens (then we widen cutout in useMemo).
      placement: 'top',
      title: 'Try it: connect to the Edge server',
      content:
        'Hover the status orb to open the panel, enter your Edge IP, and connect on TCP port 12352. Recent hosts are saved for quick reuse.',
      data: { tab: 'fixed', interactive: 'emulator_connect' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-tab-nav"]',
      placement: 'bottom',
      title: 'Main tabs',
      content:
        'Switch modes here: fixed reader, handheld, OCR, automation, database, SFTP, LAN scan, and more. Keyboard: Ctrl/Cmd+1–9 jump to tabs (0 is the 10th tab).',
      data: { tab: 'fixed' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-fixed-tag-defaults"]',
      placement: 'right',
      title: 'Fixed — tag defaults',
      content: 'Choose antennas, RSSI, and optional per-tag RSSI randomization before sending reads.',
      data: { tab: 'fixed' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-fixed-driver"]',
      placement: 'right',
      title: 'Fixed — driver & device',
      content:
        'Pick logical devices, set the reader driver family, and adjust inter-read delay (ms). If the logical device is not found, check the ALE port / modify it t o 80 or 8080.',
      data: { tab: 'fixed' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-fixed-tags"]',
      placement: 'left',
      title: 'Fixed — UPC and EPC',
      content:
        'UPC lines generate SGTIN-96 EPCs; Direct EPC accepts raw hex. Drag files onto the text areas to import lists.',
      data: { tab: 'fixed' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-fixed-send"]',
      placement: 'top',
      title: 'Fixed — send',
      content: 'Send once or loop tag reads while connected. Stop cancels in-flight sends.',
      data: { tab: 'fixed' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-fixed-log"]',
      placement: 'top',
      title: 'Fixed — log',
      content: 'Timestamped emulator log: copy, export, or clear while you test.',
      data: { tab: 'fixed' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-handheld-toolbar"]',
      placement: 'bottom',
      title: 'Handheld — toolbar',
      content:
        'Inter-tag delay between tags in one send. Add ports, start/stop all servers, or use Send all for a one-shot send on every running slot.',
      data: { tab: 'handheld' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-handheld-slots"]',
      placement: 'top',
      title: 'Handheld — slots',
      content:
        'Each card is one port VSBL Debug can connect to. Start the server, then use Send for one pass or Loop Send (like the Fixed tab) to repeat until you stop.',
      data: { tab: 'handheld' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-handheld-input-modes"]',
      placement: 'bottom',
      title: 'Handheld — UPC vs EPC',
      content: 'Switch tabs per slot for UPC→EPC generation or direct EPC lines; import/export text files from the row actions.',
      data: { tab: 'handheld' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-handheld-log"]',
      placement: 'top',
      title: 'Handheld — activity log',
      content:
        'Timestamped messages. Turn off Full activity log for connection counts and errors only; turn on for sends, per-tag lines, and everything else.',
      data: { tab: 'handheld' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-ocr-main"]',
      placement: 'bottom',
      title: 'OCR',
      content: 'Send strings to the OCR service port (10482). Inditex Code inserts a sample JSON payload.',
      data: { tab: 'ocr' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-ocr-log"]',
      placement: 'top',
      title: 'OCR — log',
      content: 'Outgoing OCR traffic and results are listed here.',
      data: { tab: 'ocr' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-custom-main"]',
      placement: 'bottom',
      title: 'Custom TCP',
      content: 'Send arbitrary payloads to any host port—useful for one-off protocol tests.',
      data: { tab: 'custom' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-custom-log"]',
      placement: 'top',
      title: 'Custom — log',
      content: 'Echoes send history and errors for the custom channel.',
      data: { tab: 'custom' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-adam-top"]',
      placement: 'bottom',
      title: 'ADAM — connection & inputs',
      content: 'Modbus/TCP to Advantech ADAM-6000: connect, watch digital inputs, and invert mapping when needed.',
      data: { tab: 'adam' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-adam-do"]',
      placement: 'top',
      title: 'ADAM — digital outputs',
      content: 'Toggle DO channels once the module is connected.',
      data: { tab: 'adam' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-adam-log"]',
      placement: 'top',
      title: 'ADAM — log',
      content: 'Module activity and errors appear in this log.',
      data: { tab: 'adam' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-api-request"]',
      placement: 'bottom',
      title: 'API — request',
      content:
        'POST Inditex RFID Box Readings JSON: URL, saved API header/key, substitution table → {{tokens}}, and raw body editor.',
      data: { tab: 'api' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-api-response"]',
      placement: 'top',
      title: 'API — response',
      content: 'Status, timing, and highlighted JSON response. The floating Base64 button opens encode/decode.',
      data: { tab: 'api' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-decoder-decode"]',
      placement: 'right',
      title: 'Decoder',
      content: 'Paste hex SGTIN-96 EPCs to recover GTIN, serial, and header fields.',
      data: { tab: 'decoder' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-decoder-encode"]',
      placement: 'left',
      title: 'Encoder',
      content: 'Build a valid EPC from GTIN / serial inputs.',
      data: { tab: 'decoder' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-automation-sequences"]',
      placement: 'right',
      title: 'Automation — sequences',
      content: 'Create and reorder sequences, import/export JSON workflows, clone or delete entries.',
      data: { tab: 'automation' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-automation-canvas"]',
      placement: 'center',
      title: 'Automation — canvas',
      content:
        'Visual workflow: add nodes (delay, OCR, fixed/handheld tags, custom TCP), drag to arrange, connect order, zoom/pan.',
      data: { tab: 'automation' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-automation-execution"]',
      placement: 'left',
      title: 'Automation — execution',
      content: 'Run by loop count or duration, pause/resume, and watch the active node during playback.',
      data: { tab: 'automation' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-gen-modes"]',
      placement: 'bottom',
      title: 'Generator — modes',
      content: 'Barcodes, QR codes, or batch ZIP export from a value list.',
      data: { tab: 'generator' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-gen-config"]',
      placement: 'right',
      title: 'Generator — configuration',
      content: 'Global symbology settings and per-barcode content, sizing, and ordering.',
      data: { tab: 'generator' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-gen-preview"]',
      placement: 'left',
      title: 'Generator — preview',
      content: 'Live canvas with PNG download or copy-to-clipboard.',
      data: { tab: 'generator' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-gen-batch-tab"]',
      placement: 'bottom',
      title: 'Generator — batch export',
      content: 'Open this tab to upload many values and download a ZIP of rendered codes.',
      data: { tab: 'generator' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-database"]',
      placement: 'center',
      title: 'Database',
      content:
        'Browse MySQL on the reader host: schemas in the sidebar, SQL IDE below, table data and edits when allowed. You need the emulator connected to the Edge IP first.',
      data: { tab: 'database' } satisfies TourStepData,
    },
    {
      target: tourTarget('tour-db-mysql-connect', 'tour-database'),
      // auto + global floatingOptions keeps the tooltip on-screen (left/right often clipped in tab layout).
      placement: 'auto',
      title: 'Database — sign in to MySQL',
      content:
        'Use the credentials for the database on your reader host. This step is hands-on: Next enables after a successful MySQL session.',
      data: { tab: 'database', interactive: 'db_mysql_connect' } satisfies TourStepData,
    },
    {
      target: tourTarget('tour-db-sidebar', 'tour-database'),
      placement: 'right',
      title: 'Database — pick a table',
      content:
        'Expand a database, then click a table name. The grid loads rows, structure, and schema tools for that table.',
      data: { tab: 'database', interactive: 'db_open_table' } satisfies TourStepData,
    },
    {
      target: tourTarget('tour-db-sql-panel', 'tour-database'),
      placement: 'top',
      title: 'Database — run SQL',
      content:
        'Write SQL in the editor, then Run or press Ctrl+Enter. Results and errors show under the editor; history and export are in the toolbar.',
      data: { tab: 'database', interactive: 'db_run_query' } satisfies TourStepData,
    },
    {
      target: tourTarget('tour-sftp', 'tour-sftp-connect'),
      placement: 'center',
      title: 'SFTP',
      content:
        'Desktop Electron: SSH into the reader host, browse the remote tree, pick a local folder, then drag-and-drop or use upload/download and batch actions.',
      data: { tab: 'sftp' } satisfies TourStepData,
    },
    {
      target: tourTarget('tour-sftp-connect', 'tour-sftp'),
      placement: 'auto',
      title: 'SFTP — connect',
      content:
        'Use the same host as the reader (or edit it), SSH port, username, and password. Next enables after a successful SSH session.',
      data: { tab: 'sftp', interactive: 'sftp_connect' } satisfies TourStepData,
    },
    {
      target: tourTarget('tour-sftp-remote', 'tour-sftp'),
      placement: 'left',
      title: 'SFTP — remote tree',
      content:
        'Browse folders and files on the server, set upload target, refresh, and use the toolbar for new files, downloads, and more.',
      data: { tab: 'sftp', interactive: 'sftp_browse' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-netscan-root"]',
      placement: 'center',
      title: 'LAN scan',
      content:
        'Desktop Electron: pick CIDR, IP range, or all local subnets; set parallelism; start/stop ICMP ping sweep; filter alive hosts; copy IPs or set the reader host from a row. In the browser build this tab explains that scanning requires the desktop app.',
      data: { tab: 'netscan' } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-link2uid"]',
      placement: 'bottom',
      title: 'Admin — Link → UID',
      content: 'Paste r-trac URLs; extract Base64URL EPC params and show ISO15693 UIDs. Enable admin from the ⋮ menu.',
      data: { tab: 'link2uid', requiresAdmin: true } satisfies TourStepData,
    },
    {
      target: '[data-tour="tour-admin-terminal"]',
      placement: 'center',
      title: 'Admin — terminal',
      content: 'Multiple local shell tabs inside Electron; new shell, kill process, and session management.',
      data: { tab: 'terminal', requiresAdmin: true } satisfies TourStepData,
    },
  ]

  return steps.filter((s) => {
    const d = s.data as TourStepData | undefined
    if (d?.requiresAdmin && !isAdmin) return false
    return true
  })
}

export interface AppTourProps {
  run: boolean
  onRunChange: (run: boolean) => void
  activeTab: string
  setActiveTab: (tab: string) => void
  isAdmin: boolean
  emulatorConnected: boolean
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 120)
      })
    })
  })
}

const CONNECTION_PANEL_SPOTLIGHT: Step['spotlightPadding'] = {
  top: 10,
  bottom: 320,
  left: 6,
  right: 246,
}

/** Keeps tooltips inside the viewport; avoids tab overflow clipping Joyride's default scroll-parent boundary. */
function useTourFloatingOptions(): Partial<FloatingOptions> {
  return useMemo(
    () => ({
      strategy: 'fixed',
      shiftOptions: {
        padding: 20,
        crossAxis: true,
        rootBoundary: 'viewport',
        boundary: typeof document !== 'undefined' ? document.documentElement : undefined,
      },
      flipOptions: {
        padding: 24,
      },
      autoUpdate: {
        ancestorScroll: true,
        ancestorResize: true,
        animationFrame: true,
      },
    }),
    [],
  )
}

export function AppTour({ run, onRunChange, setActiveTab, isAdmin, emulatorConnected }: AppTourProps) {
  const tourFloatingOptions = useTourFloatingOptions()
  const tourIx = useTourInteractionOptional()
  const connectionPanelOpen = tourIx?.connectionPopoverOpen ?? false

  const tabBefore = useCallback<BeforeHook>(
    async (data) => {
      const tab = (data.step.data as TourStepData | undefined)?.tab
      if (!tab) return
      flushSync(() => {
        setActiveTab(tab)
      })
      await waitForPaint()
    },
    [setActiveTab],
  )

  const steps = useMemo(() => {
    const base = buildSteps(isAdmin)
    return base.map((s) => {
      const d = s.data as TourStepData | undefined
      const interactive = Boolean(d?.interactive)
      const out: Step = {
        ...s,
        before: tabBefore,
        ...(interactive ? { disableFocusTrap: true as const } : {}),
      }

      if (d?.interactive === 'emulator_connect' && connectionPanelOpen) {
        out.spotlightPadding = CONNECTION_PANEL_SPOTLIGHT
        out.offset = 28
      }

      return out
    })
  }, [isAdmin, tabBefore, connectionPanelOpen])

  const handleEvent = useCallback<EventHandler>(
    (data) => {
      const { index, status, step, type } = data

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED || type === EVENTS.TOUR_END) {
        onRunChange(false)
        return
      }

      if (type === EVENTS.TARGET_NOT_FOUND) {
        console.warn('[AppTour] Target not found for step', index, step.target)
      }
    },
    [onRunChange],
  )

  const Tooltip = useCallback(
    (props: TooltipRenderProps) => <TourTooltip {...props} emulatorConnected={emulatorConnected} />,
    [emulatorConnected],
  )

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      tooltipComponent={Tooltip}
      floatingOptions={tourFloatingOptions}
      options={{
        overlayClickAction: false,
        zIndex: 10050,
        arrowColor: 'hsl(var(--card))',
        backgroundColor: 'hsl(var(--card))',
        overlayColor: 'rgba(0,0,0,0.72)',
        primaryColor: 'hsl(var(--primary))',
        textColor: 'hsl(var(--foreground))',
        scrollOffset: 24,
        spotlightPadding: 12,
        skipBeacon: true,
      }}
      styles={{
        overlay: {
          mixBlendMode: 'normal',
        },
      }}
    />
  )
}
