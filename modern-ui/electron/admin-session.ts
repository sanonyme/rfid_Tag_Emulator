import type { WebContents } from 'electron'

const SESSION_MS = 8 * 60 * 60 * 1000 // 8 hours

type AdminEntry = { expiresAt: number }

const sessions = new Map<number, AdminEntry>()

function adminCredentials(): { user: string; pass: string } {
  return {
    user: (process.env.ZEUS_ADMIN_USER ?? 'admin').trim(),
    pass: process.env.ZEUS_ADMIN_PASS ?? 'admin',
  }
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const expected = adminCredentials()
  return username.trim() === expected.user && password === expected.pass
}

export function grantAdminSession(sender: WebContents): void {
  sessions.set(sender.id, { expiresAt: Date.now() + SESSION_MS })
}

export function revokeAdminSession(sender: WebContents): void {
  sessions.delete(sender.id)
}

export function isAdminSender(sender: WebContents): boolean {
  const entry = sessions.get(sender.id)
  if (!entry) return false
  if (Date.now() > entry.expiresAt) {
    sessions.delete(sender.id)
    return false
  }
  return true
}

export function requireAdminSender(sender: WebContents): boolean {
  return isAdminSender(sender)
}
