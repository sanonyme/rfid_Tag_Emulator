# Zeus cloud Workshop

The Workshop uses this standalone Node service for cross-office WebSocket rooms. Fixed and Handheld tag sending are independent. With no service configured or reachable, shared rooms open solo with an Offline label. Home never opens a network connection. General is the initial room on every Workshop mount.

No player authentication stack existed in Zeus (the existing Supabase function only registers installations). This service adds optional email/password authentication using Node's salted scrypt and opaque, hashed, seven-day session tokens. Guests need no account. Passwords require at least ten characters; tokens stay in renderer session storage and never appear in WebSocket URLs. Closing the account session restores the separate guest profile; signing in again loads the account from the server.

New accounts now require email verification before a user, profile, or session is created. Signup sends an eight-digit code through Brevo's transactional API. Codes expire after ten minutes, allow five incorrect attempts, and are consumed exactly once. Resending rotates the challenge and code; requests are limited to one per minute and five per hour per address. Pending passwords use the same salted scrypt hashing as accounts. Failed email delivery never creates an account. Existing accounts keep their sign-in and collection.

Configure `BREVO_API_KEY` and `WORKSHOP_EMAIL_FROM` only in the server environment (`/etc/zeus-workshop.env` on the deployed guest). The sender must be verified in Brevo. The free plan includes 300 daily sends; see [Brevo pricing](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) and [transactional email setup](https://developers.brevo.com/docs/send-a-transactional-email). A missing sender disables new signup with an explicit delivery error; there is no production verification bypass or code logging. Guest play and existing-account sign-in remain available.

The Workshop uses its original compact winter scenery and cached sprites. Visible expanded and miniature views follow `requestAnimationFrame` at the display's refresh rate; only hidden windows are throttled. Starter Sprout Wings are granted once per collection, with Cloud, Ember, and Prism Wings available in loot. Wings have their own equipment slot, animate in both views, sync through the optional `wg` gameplay field, and allow one extra airborne jump. Older profiles load with an empty wings slot.

The visual redesign has been reverted: the original 164px floor, translucent compact toolbar, elf faces, snowy hills, snow bank, and bag/trade styling are restored. Cloud rooms, account verification, handles, friends, private messages, events, and moderation remain available. Account/friends dialogs and the chat composer keep their accessible, scrollable layout; player actions expand below the floor to avoid clipping. The miniature remains compact without a room label, and the frame-rate improvements remain in place.

## Accounts, handles, and friends

Every verified signup receives a permanent unique lowercase handle such as `snowelf_12`, displayed as `@snowelf_12`. The suffix comes from a database sequence and a unique index enforces uniqueness. Existing accounts are backfilled once with `elf_N` handles. Changing a display name never changes the handle. Find/copy your handle in the account window; it exposes no email address. To log out, open the Workshop account button and select **Log out**. The server revokes the session, the app restores its separate guest collection, and account data stays in Postgres.

Open **Friends** to search by exact @handle, send a request, accept/decline incoming requests, cancel outgoing requests, remove friends, or block/unblock players. Friends have stable account ids, independent of room or desktop session. New account conversations require an accepted friendship. Send up to 1,000 characters; the last 50 messages per account pair are retained. Friend messages are end-to-end encrypted on the client (ECDH P-256 + AES-GCM): the server stores only public keys and ciphertext. Private keys stay in that PC’s local storage; signing in on a new device creates new keys and cannot read older sealed messages. Offline friends receive the conversation when they next connect. Opening a conversation marks incoming messages as read; the Friends badge counts unread messages and incoming requests. WebSocket `social` notices only notify the two affected accounts to refresh; message content is fetched through authenticated HTTP, with a 10-second polling fallback. Third accounts cannot fetch a conversation. Blocking denies messaging/history in both directions, including legacy account DM sockets, and removes the friendship. Unblocking does not restore friendship automatically.

Home remains offline. Switch to General or a crew room to connect to Friends. The existing quick player DMs remain available while players share online presence; guest conversations remain ephemeral. Durable friends/messages require accounts. Database backups should include `friend_links`, `user_blocks`, and the handle sequence in addition to the existing tables.

## Staging on Proxmox

Production is CT 250. For a separate throwaway game environment (events, bags, kings), see [DEV-STAGING.md](./DEV-STAGING.md). It documents CT **251** at `192.168.10.251`, host scripts under `staging/`, and pointing Zeus at `http://192.168.10.251:8787`.

## Run locally

From `modern-ui`:

```powershell
npm install
Copy-Item workshop-server/.env.example workshop-server/.env
npm run workshop:server
```

Without `DATABASE_URL`, development uses persistent embedded Postgres in `.workshop-data/` (ignored by Git). The service listens on `127.0.0.1:8787`. Set `WORKSHOP_URL=http://127.0.0.1:8787` in `modern-ui/.env`, then start Zeus with `npm run dev`. Alternatively use the public server URL input in the guest account panel. `WORKSHOP_URL` is also embedded into the Electron main bundle at build time, with a runtime environment override. It contains no credentials.

The server reads `workshop-server/.env`; existing environment variables take priority. The desktop reads `modern-ui/.env`. Keep those files separate: only the server receives `DATABASE_URL`. Check [the local health endpoint](http://127.0.0.1:8787/health); a working service returns `{"ok":true}`. Keep the terminal open while testing; Ctrl+C stops the server. If the `.env` file already exists, edit it instead of copying over it.

Use two independent Zeus user-data directories for two devices; two windows using the same profile represent the same identity and replace the earlier connection. The automated socket test creates independent guest and account clients against a real Postgres engine and exercises the same API as desktop windows.

## Host the service

Build the isolated production package with `npm run workshop:prepare-deploy` from `modern-ui`. The generated `workshop-server/.workshop-deploy/` contains only the bundled server and its three runtime dependencies, a locked dependency manifest, a Docker Compose stack, and a Debian/systemd installer. It excludes desktop credentials and `.env` files. See `hosting/README.md` for the home-server setup. Rebuilding preserves any existing deployment `.env`.

Run Node 22 or newer, `npm ci --include=dev`, then `npm run workshop:server`, with:

```text
NODE_ENV=production
DATABASE_URL=postgresql://SERVER_ROLE:PASSWORD@DATABASE_HOST:5432/DATABASE
HOST=0.0.0.0
PORT=8787
WORKSHOP_ORIGINS=null,file://,http://localhost:5173
```

Put the service behind HTTPS with WebSocket upgrades and an idle timeout longer than 30 seconds. Point every desktop build at the same HTTPS `WORKSHOP_URL`. Only localhost permits plain HTTP. Keep database credentials on the service. Use the connection string's verified SSL configuration for remote Postgres. The existing Supabase project's Postgres can host these tables too; its install registry function remains independent.

### Make it available to players

1. Choose one always-on server reachable by your players. Copy this checkout there, install Node 22 or newer, and run `npm ci --include=dev` inside `modern-ui`.
2. Create `workshop-server/.env` from the example. Set `NODE_ENV=production`, a real `DATABASE_URL`, `HOST=127.0.0.1`, and `PORT=8787` when the HTTPS proxy is on the same host. Run `npm run workshop:server` and verify `/health` locally.
3. Point a company domain, for example `workshop.yourcompany.com`, at that server. Put an HTTPS reverse proxy in front of port 8787. `Caddyfile.example` forwards HTTP and WebSockets; replace the example hostname and use it with Caddy. For public automatic HTTPS, DNS must resolve correctly and ports 80/443 must reach Caddy. See [Caddy's HTTPS setup](https://caddyserver.com/docs/quick-starts/https) and [WebSocket proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
4. Keep the Node service and proxy running through your operating system's service manager or hosting platform. Run one backend instance. A terminal on a sleeping laptop is only suitable for a short local test.
5. In each player's Zeus app, open **Workshop → Guest/account → Workshop server**, enter `https://workshop.yourcompany.com`, and choose **Save server address**. This reconnects the Workshop immediately. Everyone uses the same HTTPS address; `localhost` always refers to that player's own computer.

You can also put `WORKSHOP_URL=https://workshop.yourcompany.com` in the desktop's `modern-ui/.env` before building, or the `.env` next to an installed executable, and restart Zeus. A saved address in the account dialog overrides that default. Share only the public HTTPS URL with players. Guest play never requires an account.

The service applies the idempotent `schema.sql` at startup. It creates server-only tables with RLS enabled and no public policies. Run with the database owner, or apply the schema separately and grant a dedicated server role access to these tables. Never put that role, an owner credential, or a Supabase service key into the renderer. Run **one service instance**: presence, floor objects, guest permissions, and room trees are in memory. Horizontal scaling would require a shared presence/pubsub service. Postgres stores accounts, titles, account permissions, events, and account DM history.

Guest bag, achievements, stats and event progress stay on the device. Guest messages, knocks, and admission grants stay in process memory; a grant survives socket reconnects until midnight UTC, but a server restart clears guest grants. This resolves the guest requirement of no persistent cloud records. Account admission grants survive server restarts until midnight UTC. A disconnected guest disappears immediately or within the 15-second heartbeat detection window. DMs with a guest are session-only; account pairs retain exactly the last 50 messages. Room chat is session-only.

## Owner operations (database only)

There is no client crown or crew-edit endpoint. `kings.user_id` references an account and its crew; both user and crew have unique constraints. Set a King:

```sql
INSERT INTO kings(user_id, crew)
SELECT id, crew FROM users WHERE email = 'king@example.com';
-- Clear a King:
DELETE FROM kings WHERE crew = 'VSBL';
-- Change an account's crew (King foreign key follows the change):
UPDATE users SET crew = 'EDGE' WHERE email = 'player@example.com';
-- Owner-granted additional title:
UPDATE profiles SET titles = '["Workshop Champion"]'::jsonb
WHERE user_id = (SELECT id FROM users WHERE email = 'player@example.com');
```

Identity/title changes reach connected clients within five seconds. Changing a King's crew to one that already has a King fails the database unique constraint. General has no moderator, including for ANEXYA_LOVER Kings. Same-crew accounts enter their room freely; outsiders remain outside until allowed. A kicked member must knock again that UTC day. Knocks remain pending with no online King; there is no promotion or bypass.

## Live operations

Administrators can open **Workshop account → Admin tools** in Zeus. The **Players & bags** tab shows the selected account's real item stacks and can add or remove one, several, or an entire stack. The **Events** tab is the preferred event-management path: its wizard covers type, copy, schedule, audience, goal, opt-in, rewards, review, activation, editing, progress reset, and deletion. The SQL below remains useful for recovery and unattended provisioning, but is not required for ordinary event operations.

### RFID mission board

Signed-in players can open **Missions** from the Workshop toolbar. The board has three daily and three weekly objectives based only on real emulator work: individual RFID tags transmitted, successful Fixed send runs, and successful Handheld send runs. Daily periods reset at 00:00 UTC; weekly periods reset Monday at 00:00 UTC. Progress starts from the account's server-recorded baseline for each period, follows normal profile sync, and can be resumed on another device.

Rewards use existing RFID-themed Workshop items and are claimed explicitly from the board. The server checks progress, records the period claim, and adds the item in one database transaction, so retries cannot grant duplicates. Guests can preview the board but must sign in before progress or rewards are stored. Backups should include `mission_progress` alongside profiles and event progress.

`live_events` contains data, never JavaScript. Valid metrics map directly to existing profile stats: `sends`, `handheld`, `opened`, `trades`, `given`. Kinds are `challenge`, `opt-in`, `announcement`. `crews=NULL` means all; otherwise use a JSON array of crew ids. Rewards reference a current item id or an existing achievement title string; invalid definitions are ignored. New sprites still require a client release.

```sql
INSERT INTO live_events(id,title,body,start_at,end_at,enabled,kind,metric,target,opt_in)
VALUES ('winter-gifts','Winter gifts','Give away three items.',
        now(),now()+interval '7 days',true,'challenge','given',3,false);
-- Optional reward using an existing item id:
UPDATE live_events SET reward='{"item":"plain-tag"}'::jsonb WHERE id='winter-gifts';
-- End immediately; the banner disappears on the next poll:
UPDATE live_events SET enabled=false,end_at=now() WHERE id='winter-gifts';
-- Secret Santa pairing is parked. Turn any leftover row off:
UPDATE live_events SET enabled=false,end_at=now(),pairing=NULL WHERE pairing='same-crew' OR id LIKE 'secret-santa%';
```

Events poll on open and every 60 seconds. Windows are also checked locally, so an expired cached banner disappears during an outage. Challenges count increases from their first server observation; opt-in events count increases after joining. Progress uses the monotonically increasing existing gameplay stats synced by the client, rather than independent server simulation. Rewards are granted once within a database transaction and use server-owned titles. Guest progress has a per-device baseline and cannot earn cloud rewards. Same-crew Secret Santa pairing is off: joins do not assign a partner, and saving an event clears `pairing`.

First login imports the device bag exactly once per account, unioned by UID with newer `at` winning. Later sync uses optimistic profile revisions; clients reconcile UID conflicts, while crew, King and granted titles always come from the database. Per-profile daily gifts are included in the account cache. No reader IP is sent or used for room membership.

## Verify

```powershell
npm run typecheck
npm run workshop:typecheck
npm run test:run -- electron/workshop-cloud.test.ts src/lib/__tests__/workshop-cloud-model.test.ts src/lib/__tests__/workshop-cloud-client.test.tsx src/lib/__tests__/workshop-protocol.test.ts
npx vite build
npm run workshop:desktop-smoke
```

The desktop smoke script launches two real Electron instances with isolated temporary user-data directories and an ephemeral Postgres backend, signs up accounts through the UI, assigns King in the database, tests Knock/Allow/Kick through the UI, disables an event and waits one real poll, then stops the backend and checks offline General and Home. It closes both applications and deletes only its own temporary profiles. It does not use or modify the user's Zeus profile.
