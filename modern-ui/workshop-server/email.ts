export type VerificationEmail = { email: string; code: string }
export type VerificationSender = (message: VerificationEmail) => Promise<void>

/** Transactional email only; credentials stay in the server's environment. */
export const sendVerificationEmail: VerificationSender = async ({ email, code }) => {
  const apiKey = process.env.BREVO_API_KEY
  const from = process.env.WORKSHOP_EMAIL_FROM
  if (!apiKey || !from) throw new Error('Email sender is not configured')
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: 'Zeus Workshop' }, to: [{ email }],
      subject: 'Verify your Zeus Workshop email',
      textContent: `Your Zeus Workshop verification code is ${code}.\n\nIt expires in 10 minutes. Your account is created only after you enter this code in Zeus.\n\nIf you did not request an account, ignore this email.`,
      htmlContent: `<div style="background:#101d35;color:#eef7ff;padding:32px;font-family:Arial,sans-serif"><p style="color:#86efac;font-weight:bold;letter-spacing:3px">ZEUS WORKSHOP</p><h1>One more step. Then you're in.</h1><p>Enter this code in Zeus to verify your email and create your account.</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#a5f3fc">${code}</p><p>Expires in 10 minutes. If you didn't request this, you can ignore this email.</p></div>`,
    }),
  })
  // Provider responses may include addresses or credentials; never forward or log them.
  if (!response.ok) {
    let detail = ''
    try {
      const body: unknown = await response.json()
      const message = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : ''
      if (/unrecognised IP address|authorized_ips|authorised_ips/i.test(message)) {
        detail = ' Brevo blocked this server IP — add the host public IP under Brevo → Security → Authorised IPs.'
      }
    } catch { /* ignore parse failures */ }
    throw new Error(`Email provider rejected delivery (${response.status}).${detail}`)
  }
}
