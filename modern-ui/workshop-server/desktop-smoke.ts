/** Run after `npx vite build`: real isolated Electron windows against ephemeral Postgres. */
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { PGlite } from '@electric-sql/pglite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { migrate, type Database } from './database'
import { createWorkshopServer } from './server'
import { APP_VERSION } from '../src/lib/whats-new'

const local = new PGlite()
const wrap = (q: typeof local): Database => ({ query: (sql, params) => q.query(sql, params), transaction: fn => q.transaction(tx => fn(wrap(tx as unknown as typeof local))), close: () => local.close() })
const db = wrap(local)
await migrate(db)
const emailCodes = new Map<string,string>()
const backend = createWorkshopServer(db, undefined, async ({email,code}) => {emailCodes.set(email,code)})
await new Promise<void>(resolve => backend.server.listen(0,'127.0.0.1',resolve))
const base = `http://127.0.0.1:${(backend.server.address() as { port: number }).port}`
const directory = await mkdtemp(path.join(tmpdir(),'zeus-workshop-smoke-'))
const applications: ElectronApplication[] = []
const errors: string[] = []
async function launch(name: string) {
  const env: Record<string,string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string] => entry[1] !== undefined)), WORKSHOP_URL: base, OPEN_DEVTOOLS: 'false' }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory,name)}`], cwd: process.cwd(), env, timeout: 60000 })
  applications.push(app)
  const page = await app.firstWindow({ timeout: 60000 })
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', message => { if (message.type() === 'error') console.log('CONSOLE',message.text()) })
  await page.waitForURL(/index\.html$/, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(version => { localStorage.setItem('workshop-pinned','1'); localStorage.setItem('zeus-whats-new-seen-version',version) }, APP_VERSION)
  await page.reload()
  await page.getByRole('combobox',{ name: 'Workshop room' }).waitFor()
  return page
}
async function signup(page: Page, crew: string, name: string) {
  await page.getByRole('button',{ name: /^Guest ·/ }).click()
  await page.locator('button[type="button"]').filter({ hasText: /^Create account$/ }).click()
  await page.getByRole('textbox',{ name: 'Email', exact: true }).fill(`${name}@example.com`)
  await page.getByLabel('Password',{ exact: true }).fill('desktop-smoke-password')
  await page.getByLabel('Username',{ exact: true }).fill(name.replace(/[^a-zA-Z0-9_]/g,'').toLowerCase() || 'smokelf')
  await page.getByLabel('Signup crew').selectOption(crew)
  await page.locator('form button[type="submit"]').click()
  await page.getByLabel('Verification code', {exact:true}).waitFor({timeout:15000})
  assert(emailCodes.has(`${name}@example.com`))
  await page.getByLabel('Verification code', {exact:true}).fill(emailCodes.get(`${name}@example.com`)!)
  await page.getByRole('button',{name:'Verify email & create account',exact:true}).click()
  await page.getByRole('button',{ name: `✓ ${crew}`, exact: true }).waitFor({ timeout: 15000 })
}
async function inspectLayout(app: ElectronApplication, page: Page) {
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus() })
  const chip = page.locator('[data-workshop-chip]')
  assert(!/Anexya|General|solo/.test(await chip.innerText()), 'Chip contains room text')
  assert((await chip.boundingBox())!.width <= 170, 'Chip is too wide')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900,680))
  await page.getByRole('button',{ name: /^Guest ·/ }).click()
  await page.getByRole('button',{ name: 'Create account', exact: true }).click()
  const dialog = page.getByRole('dialog')
  assert(await dialog.isVisible())
  await page.getByLabel('Signup crew').scrollIntoViewIfNeeded()
  assert(await page.getByLabel('Signup crew').isVisible())
  const rect = await dialog.boundingBox(); assert(rect)
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert(rect.y >= 0 && rect.y+rect.height <= viewport.height && rect.x >= 0 && rect.x+rect.width <= viewport.width, 'Account dialog leaves viewport')
  assert(await dialog.evaluate(el => !document.querySelector('[data-workshop-panel]')?.contains(el)), 'Account dialog is inside the floor')
  const screenshot = process.env.WORKSHOP_SMOKE_SCREENSHOT
  if (screenshot) await page.screenshot({ path: path.join(path.dirname(screenshot),'workshop-account.png') })
  await page.getByRole('button',{ name: 'Close', exact: true }).click()
  await page.getByRole('button',{ name: 'Chat', exact: true }).click()
  await page.getByLabel('Chat message').scrollIntoViewIfNeeded()
  assert(await page.getByLabel('Chat message').isVisible())
  const stage = await page.locator('[data-workshop-stage]').boundingBox(), composer = await page.getByLabel('Chat message').boundingBox()
  assert(stage && composer && composer.y >= stage.y+stage.height, 'Chat covers the play area')
  assert.equal(stage.height,164,'Classic Workshop should keep its original compact height')
  for (const button of [page.getByRole('button',{name:'General',exact:true}),page.getByRole('button',{name:/^Guest ·/}),page.getByRole('button',{name:'Friends & messages',exact:true})]) {
    const bounds=await button.boundingBox(); assert(bounds)
    assert(bounds.y>=stage.y && bounds.y+bounds.height<=stage.y+stage.height,'Workshop controls leave the compact floor')
    assert(bounds.height<=28,'Classic toolbar controls should stay compact at the default app font size')
  }
  await page.getByRole('button',{ name: 'Close chat', exact: true }).click()
  // Count actual canvas paints; closed/dimmed floors should not consume full frame rendering.
  await page.evaluate(() => {
    const counts = { mini: 0, floor: 0 }
    const original = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function(...args) {
      if (this.canvas.closest('[data-workshop-chip]')) counts.mini++
      if (this.canvas.getAttribute('aria-label')?.startsWith('Workshop floor.')) counts.floor++
      return original.apply(this,args)
    }
    ;(window as unknown as { workshopPaints: typeof counts }).workshopPaints = counts
  })
  await page.getByRole('button',{ name: 'Close Workshop', exact: true }).click()
  await page.mouse.move(0,0)
  await page.waitForTimeout(200)
  await page.evaluate(() => { const counts = (window as unknown as { workshopPaints: { mini: number; floor: number } }).workshopPaints; counts.mini=0; counts.floor=0 })
  await page.waitForTimeout(2000)
  const counts = await page.evaluate(() => (window as unknown as { workshopPaints: { mini: number; floor: number } }).workshopPaints)
  assert(counts.floor === 0, `Closed floor painted ${counts.floor} times`)
  assert(counts.mini >= 80, `Miniature painted only ${counts.mini} times in two seconds; expected fluid visible animation`)
  console.log(`PASS: compact chip, account and chat fit small windows; closed floor ${counts.floor} paints, mini ${counts.mini} paints / 2s`)
  await page.getByRole('button',{ name: /^Workshop floor:/ }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360,980))
  await page.waitForTimeout(200)
  await page.evaluate(() => { const counts = (window as unknown as {workshopPaints:{mini:number;floor:number}}).workshopPaints;counts.mini=0;counts.floor=0 })
  await page.waitForTimeout(2000)
  const expandedCounts=await page.evaluate(()=>(window as unknown as {workshopPaints:{mini:number;floor:number}}).workshopPaints)
  assert(expandedCounts.floor>=80,`Expanded floor painted only ${expandedCounts.floor} times in two seconds`)
  console.log(`PASS: expanded floor ${expandedCounts.floor} paints / 2s`)
}
try {
  const king = await launch('vsbl'), edge = await launch('edge')
  await king.getByText('2 here',{ exact: true }).waitFor({ timeout: 20000 })
  await edge.getByText('2 here',{ exact: true }).waitFor({ timeout: 20000 })
  console.log('PASS: two Electron guests share General without reader IPs')
  await inspectLayout(applications[0],king)
  await signup(king,'VSBL','desktop-king')
  await db.query("INSERT INTO kings(user_id,crew) SELECT id,crew FROM users WHERE email='desktop-king@example.com'")
  await edge.getByText('2 here',{ exact: true }).waitFor({ timeout: 20000 })
  console.log('PASS: account and guest share General')
  await signup(edge,'EDGE','desktop-visitor')
  const {rows:handles}=await db.query("SELECT email,handle FROM users WHERE email IN ('desktop-king@example.com','desktop-visitor@example.com')")
  const kingHandle=handles.find(r=>r.email==='desktop-king@example.com')!.handle
  const edgeHandle=handles.find(r=>r.email==='desktop-visitor@example.com')!.handle
  await king.getByRole('button',{name:'Friends & messages',exact:true}).click()
  await king.getByLabel('Friend handle').fill('@'+edgeHandle)
  await king.getByRole('button',{name:'Send friend request',exact:true}).click()
  await king.getByText(/Friend request sent/).waitFor()
  await edge.getByRole('button',{name:'Friends & messages',exact:true}).click()
  await edge.getByRole('button',{name:new RegExp('@'+kingHandle+' incoming')}).click()
  await edge.getByRole('button',{name:'Accept',exact:true}).click()
  await edge.getByLabel('Private message',{exact:true}).waitFor()
  await king.getByRole('button',{name:new RegExp('@'+edgeHandle+' friend')}).click()
  await king.getByLabel('Private message',{exact:true}).fill('Hot cocoa by the campfire?')
  await king.getByRole('button',{name:'Send private message',exact:true}).click()
  await edge.getByRole('log',{name:'Private conversation'}).getByText('Hot cocoa by the campfire?',{exact:true}).waitFor()
  if(process.env.WORKSHOP_SMOKE_SCREENSHOT)await king.getByRole('dialog').screenshot({path:path.join(path.dirname(process.env.WORKSHOP_SMOKE_SCREENSHOT),'workshop-friends.png')})
  await king.getByRole('button',{name:'Close',exact:true}).click()
  await edge.getByRole('button',{name:'Close',exact:true}).click()
  console.log('PASS: unique handles, Add friend, Accept, and private conversations through both Electron UIs')
  await king.getByRole('combobox',{ name: 'Workshop room' }).selectOption('vsbl')
  await king.getByText('Just you',{ exact: true }).waitFor()
  await edge.getByRole('combobox',{ name: 'Workshop room' }).selectOption('vsbl')
  await edge.getByRole('button',{ name: 'Knock', exact: true }).click()
  await edge.getByText(/Waiting outside/).waitFor()
  await king.getByRole('button',{ name: 'Allow', exact: true }).click()
  await king.getByText('2 here',{ exact: true }).waitFor({ timeout: 20000 })
  await edge.getByText('2 here',{ exact: true }).waitFor({ timeout: 20000 })
  console.log('PASS: VSBL enters freely; EDGE waits outside until the King allows')
  const screenshot = process.env.WORKSHOP_SMOKE_SCREENSHOT ?? path.join(directory,'allowed.png')
  await king.screenshot({ path: screenshot })
  console.log(`SCREENSHOT ${screenshot}`)
  assert(!(await king.evaluate(()=>document.documentElement.classList.contains('dark'))),'Smoke profile should start in light mode')
  const lightColor=await king.locator('[data-workshop-panel]').evaluate(el=>getComputedStyle(el).backgroundColor)
  await king.locator('[data-workshop-panel]').screenshot({path:path.join(path.dirname(screenshot),'workshop-classic-light.png')})
  await king.keyboard.press('Control+k')
  await king.getByText('Switch to Dark Mode',{exact:true}).click()
  const darkColor=await king.locator('[data-workshop-panel]').evaluate(el=>getComputedStyle(el).backgroundColor)
  assert.notEqual(lightColor,darkColor,'Workshop should keep the app theme instead of the custom cozy palette')
  await king.locator('[data-workshop-panel]').screenshot({path:path.join(path.dirname(screenshot),'workshop-classic-dark.png')})
  await king.keyboard.press('Control+k')
  await king.getByText('Switch to Light Mode',{exact:true}).click()
  console.log('PASS: classic compact Workshop captured in light and dark themes')
  // Locate the peer through canvas hit-testing by scanning elf-height coordinates.
  const canvas = king.getByLabel(/^Workshop floor\. Click to walk/)
  const bounds = await canvas.boundingBox(); assert(bounds)
  let found = false
  for (const y of [bounds.height-65,bounds.height-85,bounds.height-45]) {
    for (let x = 30; x < bounds.width-20; x += 18) {
      await canvas.click({ position: { x, y } })
      if (await king.getByRole('button',{ name: 'Kick to General', exact: true }).isVisible()) { found = true; break }
    }
    if (found) break
  }
  assert(found,'Could not click the visitor elf nameplate')
  await king.getByRole('button',{ name: 'Kick to General', exact: true }).click()
  await edge.getByRole('combobox',{ name: 'Workshop room' }).waitFor()
  await edge.waitForFunction(() => (document.querySelector('[aria-label="Workshop room"]') as HTMLSelectElement)?.value === 'anexya-general')
  console.log('PASS: King nameplate Kick returns EDGE to General')
  await db.query("INSERT INTO live_events(id,title,start_at,end_at,enabled,kind,metric,target) VALUES('desktop-banner','Desktop live event',now()-interval '1 minute',now()+interval '1 hour',true,'announcement','sends',1)")
  // Reopen the floor to exercise the on-open poll.
  await edge.getByRole('button',{ name: /^Workshop floor:/ }).click()
  await edge.mouse.move(0,0)
  await edge.getByRole('button',{ name: /^Workshop floor:/ }).click()
  await edge.getByText('Desktop live event',{ exact: true }).waitFor({ timeout: 15000 })
  await db.query("UPDATE live_events SET enabled=false WHERE id='desktop-banner'")
  await edge.getByText('Desktop live event',{ exact: true }).waitFor({ state: 'detached', timeout: 65000 })
  console.log('PASS: database event disable removes the banner within one poll')
  await edge.getByRole('button',{name:'✓ EDGE',exact:true}).click()
  await edge.getByRole('button',{name:'Log out',exact:true}).click()
  await edge.getByRole('button',{name:/^Guest ·/}).waitFor()
  const {rows:[sessions]}=await db.query("SELECT count(*)::int AS count FROM sessions WHERE user_id=(SELECT id FROM users WHERE email='desktop-visitor@example.com')")
  assert(sessions.count===0,'Logout left the account session active')
  await edge.getByRole('button',{name:/^Guest ·/}).click()
  await edge.getByLabel('Email',{exact:true}).fill('desktop-visitor@example.com')
  await edge.getByLabel('Password',{exact:true}).fill('desktop-smoke-password')
  await edge.locator('form button[type="submit"]').click()
  await edge.getByRole('button',{name:'✓ EDGE',exact:true}).waitFor()
  await edge.getByRole('button',{name:'Friends & messages',exact:true}).click()
  await edge.getByRole('button',{name:new RegExp('@'+kingHandle+' friend')}).click()
  await edge.getByRole('log',{name:'Private conversation'}).getByText('Hot cocoa by the campfire?',{exact:true}).waitFor()
  await edge.getByRole('button',{name:'Close',exact:true}).click()
  console.log('PASS: explicit logout revokes session; signing in restores friends and conversation')
  await backend.close()
  await edge.locator('[data-workshop-panel]').getByText(/^Offline/).waitFor({ timeout: 10000 })
  await edge.getByRole('button',{ name: 'Home', exact: true }).click()
  await edge.getByText('Your world',{ exact: true }).waitFor()
  console.log('PASS: backend stopped; General is Offline and Home remains playable')
  assert.deepEqual(errors,[],'Renderer errors')
} catch (error) {
  for (const app of applications) for (const page of app.windows()) {
    console.log('WINDOW', (await page.locator('body').innerText().catch(() => 'Unavailable')).slice(0,1600))
  }
  console.log('RENDERER ERRORS',errors)
  throw error
} finally {
  for (const app of applications) await app.close().catch(() => {})
  if (backend.server.listening) await backend.close()
  await db.close()
  // Delete only the verified test-created directory under the OS temp directory.
  if (path.dirname(directory) === tmpdir() && path.basename(directory).startsWith('zeus-workshop-smoke-')) await rm(directory,{ recursive: true, force: true })
}
