# Zeus RFID Tag Emulator — agent notes

Electron + React app under `modern-ui/`. Main process code lives in `electron/`; renderer in `src/`.

## Commands

```bash
cd modern-ui
npm run dev          # Vite + Electron
npm run typecheck    # tsc
npm run test:run     # Vitest (src + electron)
npm run electron:build
```

## Architecture

- **TCP / Handheld**: `electron/tcp-handler.ts` — real sockets; renderer uses `src/lib/tcp-client.ts` via preload IPC.
- **Edge / ALE**: Prefer `ZEUS_ALE_USERNAME` / `ZEUS_ALE_PASSWORD` in main process (`electron/ale-credentials.ts`). Renderer must not receive raw passwords; use `aleGetCredentialMeta` / `aleGetBasicAuthHeader` IPC.
- **SFTP**: Session IPC in `electron/main.ts`; local download/upload paths are validated against browse `localRoot` via `assertPathUnderRoot`.
- **Database**: `electron/db-handler.ts` — `useDatabase()` + `assertSafeSqlIdentifier`; ad-hoc SELECTs capped at 1000 rows.
- **Admin**: Destructive IPC (`sftp-rmrf`, `log-aggregator-run`, admin terminal shell) requires admin sender gate in main.

## Tab loading

Persistent tabs stay mounted after first visit (`visitedTabs` in `App.tsx`). Only **Terminal** unmounts on leave (`UNMOUNT_ON_LEAVE`). `preloadTabModules()` warms core tabs (Fixed, Handheld, OCR, Edge, API, Automation, Database).

## Do not

- Re-add the removed ADAM tab.
- Re-wire Fixed tab `ale-api.ts` to `EdgeApiClient` (known auth regression).
- Add GitHub CI workflows unless explicitly requested.
- Commit `.env` or embed secrets in renderer `VITE_*` vars for new features.

## Tests

- Wire format: `src/lib/__tests__/tcp-wire-format.test.ts`, `handheld-wire-format.test.ts`
- Main-process helpers: `electron/*.test.ts` (node environment)

## Code intelligence (Cursor MCP)

Project uses [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (`.cursor/mcp.json`). After reload, ask the agent to **index this project** before deep structural queries (`trace_path`, `search_graph`, etc.).
