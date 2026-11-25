import nodemailer from 'nodemailer'
import config from '../config/env.js'
import { EmailLog } from '../models/index.js'
import { getEmailSettings, getStore } from './settings.js'

const BREVO_API_BASE = 'https://api.brevo.com/v3'
const PLACEHOLDER_SENDER = 'your-verified-sender@example.com'

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const formatINR = (amount) => `₹${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`

const formatExpiry = (date) => {
  if (!date) return 'No expiry'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '30 days'
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Resolve a valid sender identity for Brevo transactional emails. */
export function resolveBrevoSender(emailCfg = {}, store = {}) {
  const candidates = [
    config.brevo.senderEmail,
    emailCfg.fromEmail,
    emailCfg.user && String(emailCfg.user).includes('@') ? emailCfg.user : '',
    store.email,
  ]
  const email =
    candidates
      .map((item) => String(item ?? '').trim())
      .find((item) => item && item !== PLACEHOLDER_SENDER && item.includes('@')) || ''

  const name =
    String(config.brevo.senderName || emailCfg.fromName || store.name || 'Rehman Perfume').trim() ||
    'Rehman Perfume'

  return { email, name }
}

/**
 * Verify the configured Brevo API key against Brevo's /v3/account endpoint.
 * Never throws: returns a structured status object for admin diagnostics.
 */
export async function verifyBrevoAccount(fetchImpl = globalThis.fetch) {
  if (!config.brevoConfigured) {
    return {
      ok: false,
      configured: false,
      provider: 'brevo',
      message: 'BREVO_API_KEY is not configured in backend/.env yet.',
    }
  }

  try {
    const res = await fetchImpl(`${BREVO_API_BASE}/account`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'api-key': config.brevo.apiKey,
      },
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        provider: 'brevo',
        statusCode: res.status,
        message: payload?.message || `Brevo rejected API key (HTTP ${res.status}).`,
      }
    }
    return {
      ok: true,
      configured: true,
      provider: 'brevo',
      accountEmail: payload?.email || '',
      companyName: payload?.companyName || '',
      plan: Array.isArray(payload?.plan) ? payload.plan[0]?.type || '' : '',
      credits: Array.isArray(payload?.plan) ? payload.plan[0]?.credits ?? null : null,
      message: `Brevo connected (${payload?.email || 'verified'}).`,
    }
  } catch (err) {
    return {
      ok: false,
      configured: true,
      provider: 'brevo',
      message: err?.message || 'Unable to reach Brevo API.',
    }
  }
}

/**
 * Dispatch a transactional email via Brevo REST API v3 (/v3/smtp/email).
 */
export async function sendViaBrevo({
  to,
  recipientName = '',
  subject,
  html,
  text,
  senderEmail,
  senderName,
  replyTo = '',
  replyToName = '',
  fetchImpl = globalThis.fetch,
}) {
  if (!config.brevoConfigured) {
    throw new Error('BREVO_API_KEY is not configured.')
  }
  if (!senderEmail) {
    throw new Error('BREVO_SENDER_EMAIL is missing — add your verified Brevo sender email in backend/.env.')
  }

  const body = {
    sender: { name: senderName || 'Rehman Perfume', email: senderEmail },
    to: [{ email: to, name: recipientName || to }],
    subject,
    ...(replyTo ? { replyTo: { email: replyTo, name: replyToName || replyTo } } : {}),
    ...(html ? { htmlContent: html } : {}),
    ...(text ? { textContent: text } : {}),
  }

  const res = await fetchImpl(`${BREVO_API_BASE}/smtp/email`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': config.brevo.apiKey,
    },
    body: JSON.stringify(body),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = payload?.message || payload?.code || `HTTP ${res.status}`
    throw new Error(`Brevo API error: ${detail}`)
  }

  return { messageId: String(payload?.messageId ?? '') }
}

/**
 * Send an email through Brevo (preferred when configured in `.env`), falling back
 * to configured SMTP (nodemailer), or storing a complete rendered preview record
 * in `email_logs` when no email provider is set up yet.
 */
export async function sendLoggedEmail({
  to,
  recipientName = '',
  phone = '',
  customerId = null,
  kind = 'repeat-benefit',
  subject,
  html,
  text,
  couponCode = '',
  discountPercent = 0,
  visitsAtSend = 0,
  sentBy = 'System Auto',
  replyTo = '',
  replyToName = '',
}) {
  const emailCfg = await getEmailSettings()
  const store = await getStore()
  const cleanTo = String(to ?? '').trim().toLowerCase()
  const brevoSender = resolveBrevoSender(emailCfg, store)
  const brevoReady = Boolean(config.brevoConfigured && brevoSender.email)
  const smtpReady = Boolean(emailCfg.host && emailCfg.user && emailCfg.pass)
  const configured = brevoReady || smtpReady

  let status = 'preview'
  let provider = 'preview'
  let messageId = ''
  let error = ''

  if (brevoReady && cleanTo) {
    provider = 'brevo'
    try {
      const info = await sendViaBrevo({
        to: cleanTo,
        recipientName,
        subject,
        html,
        text,
        senderEmail: brevoSender.email,
        senderName: brevoSender.name,
        replyTo,
        replyToName,
      })
      status = 'sent'
      messageId = info.messageId
    } catch (err) {
      status = 'failed'
      error = err?.message || 'Failed to deliver via Brevo.'
    }
  } else if (smtpReady && cleanTo) {
    provider = 'smtp'
    try {
      const transporter = nodemailer.createTransport({
        host: emailCfg.host,
        port: emailCfg.port,
        secure: emailCfg.port === 465,
        auth: {
          user: emailCfg.user,
          pass: emailCfg.pass,
        },
      })

      const fromAddress = emailCfg.fromEmail || emailCfg.user
      const info = await transporter.sendMail({
        from: `"${emailCfg.fromName || store.name}" <${fromAddress}>`,
        to: cleanTo,
        subject,
        text,
        html,
      })

      status = 'sent'
      messageId = String(info.messageId ?? '')
    } catch (err) {
      status = 'failed'
      error = err?.message || 'Failed to deliver via SMTP.'
    }
  } else if (!configured) {
    error =
      'Email provider not configured — add BREVO_API_KEY and BREVO_SENDER_EMAIL in backend/.env (or configure SMTP in Settings).'
  }

  const log = await EmailLog.create({
    to: cleanTo,
    recipientName,
    phone,
    customer: customerId,
    kind,
    provider,
    subject,
    couponCode,
    discountPercent,
    visitsAtSend,
    status,
    messageId,
    error,
    html,
    text,
    sentBy,
    sentAt: new Date(),
  })

  return { log, status, provider, messageId, error, configured }
}

/**
 * Branded Repeat Customer Benefit Email template (HTML + plain text + WhatsApp copy).
 */
export async function buildRepeatBenefitEmail({
  customerName,
  visits = 2,
  tierLabel = 'Repeat Customer',
  discountPercent = 10,
  couponCode,
  minOrder = 0,
  expiresAt,
  customMessage = '',
}) {
  const store = await getStore()
  const safeName = customerName || 'Valued Customer'
  const expiryText = formatExpiry(expiresAt)
  const minText = Number(minOrder) > 0 ? ` on orders above ${formatINR(minOrder)}` : ''

  const subject = `${discountPercent}% OFF Gift for You (${visits} Visits!) — ${store.name}`

  const textLines = [
    `Namaste ${safeName},`,
    '',
    `Thank you for shopping with ${store.name}! Because you have visited us ${visits} ${visits === 1 ? 'time' : 'times'} (${tierLabel}), we have unlocked a special repeat-customer benefit for you.`,
    customMessage ? `\nNote from us: ${customMessage}` : '',
    '',
    `Your Reward: ${discountPercent}% OFF${minText}`,
    `Coupon Code: ${couponCode}`,
    `Valid Until: ${expiryText}`,
    '',
    `You can use this code both on our website or simply show this message at our shop counter during your next visit.`,
    store.phone ? `Shop Phone: ${store.phone}` : '',
    store.address ? `Visit us: ${store.address}` : '',
    '',
    `Warm regards,`,
    `${store.name}`,
  ].filter((line) => line !== null && line !== undefined)

  const text = textLines.join('\n')

  const html = `
  <div style="margin:0;padding:24px;background:#faf4ea;font-family:Arial,Helvetica,sans-serif;color:#1e1812;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4d4b7;border-radius:12px;overflow:hidden;">
      <div style="background:#17130f;color:#e7c67e;padding:22px 26px;text-align:center;">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d6ad58;">${escapeHtml(tierLabel)}</p>
        <h1 style="margin:8px 0 0;font-size:24px;font-family:Georgia,serif;color:#fff8ec;">${escapeHtml(store.name)}</h1>
      </div>
      <div style="padding:26px;">
        <p style="margin:0 0 12px;font-size:16px;">Namaste <strong>${escapeHtml(safeName)}</strong>,</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4a3f34;">
          Thank you for trusting <strong>${escapeHtml(store.name)}</strong> for <strong>${visits} ${visits === 1 ? 'purchase' : 'purchases'}</strong>!
          As a special thank-you gift for being a valued repeat customer, enjoy an exclusive discount on your next perfume or attar purchase.
        </p>
        ${
          customMessage
            ? `<div style="margin:0 0 18px;padding:12px 14px;background:#faf4ea;border-left:3px solid #c59b43;border-radius:4px;font-size:14px;color:#3d332a;">${escapeHtml(customMessage)}</div>`
            : ''
        }
        <div style="margin:18px 0;padding:20px;background:#fbf7ef;border:1.5px dashed #c59b43;border-radius:10px;text-align:center;">
          <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#8b6923;font-weight:bold;">Your Repeat Customer Benefit</p>
          <p style="margin:8px 0;font-size:32px;font-weight:bold;color:#17130f;">${discountPercent}% OFF</p>
          <p style="margin:0 0 12px;font-size:13px;color:#5c4f42;">Valid ${minText || 'on any order'} · Until ${escapeHtml(expiryText)}</p>
          <div style="display:inline-block;padding:10px 22px;background:#17130f;color:#f3d794;font-size:18px;font-weight:bold;letter-spacing:2px;border-radius:6px;">
            ${escapeHtml(couponCode)}
          </div>
        </div>
        <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#5c4f42;">
          <strong>How to use:</strong> Enter code <strong>${escapeHtml(couponCode)}</strong> at online checkout, or show this email at our shop counter.
        </p>
      </div>
      <div style="background:#f5ecdc;padding:14px 24px;text-align:center;font-size:12px;color:#6c5c4d;">
        ${escapeHtml(store.name)}${store.phone ? ` · ${escapeHtml(store.phone)}` : ''}${store.address ? ` · ${escapeHtml(store.address)}` : ''}
      </div>
    </div>
  </div>
  `.trim()

  const whatsappText = `Namaste ${safeName}! Thank you for your ${visits} purchases with ${store.name}. Here is your special Repeat Customer Benefit: *${discountPercent}% OFF*${minText}! Use code *${couponCode}* online or show this message at our shop counter (valid till ${expiryText}).`

  return { subject, html, text, whatsappText }
}

/**
 * Branded Password Reset Email (6-digit PIN code + clickable reset link).
 */
export async function buildPasswordResetEmail({ name = '', email, code, resetLink }) {
  const store = await getStore()
  const safeName = String(name || email || 'Valued Patron').trim()
  const subject = `Reset Your Password — ${store.name}`

  const text = [
    `Namaste ${safeName},`,
    '',
    `We received a request to reset the password for your ${store.name} account (${email}).`,
    '',
    `Your 6-digit password reset code: ${code}`,
    resetLink ? `Or reset directly via this link: ${resetLink}` : '',
    '',
    `This code and link will expire in 60 minutes.`,
    `If you did not request a password reset, you can safely ignore this email.`,
    '',
    `Warm regards,`,
    `${store.name}`,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n')

  const html = `
  <div style="margin:0;padding:24px;background:#faf4ea;font-family:Arial,Helvetica,sans-serif;color:#1e1812;">
    <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e4d4b7;border-radius:12px;overflow:hidden;">
      <div style="background:#17130f;color:#e7c67e;padding:22px 26px;text-align:center;">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d6ad58;">Account Security</p>
        <h1 style="margin:8px 0 0;font-size:24px;font-family:Georgia,serif;color:#fff8ec;">${escapeHtml(store.name)}</h1>
      </div>
      <div style="padding:26px;">
        <p style="margin:0 0 12px;font-size:16px;">Namaste <strong>${escapeHtml(safeName)}</strong>,</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4a3f34;">
          We received a request to reset the password for your account (<strong>${escapeHtml(email)}</strong>).
          Use the 6-digit verification code below, or click the button to choose a new password.
        </p>
        <div style="margin:20px 0;padding:20px;background:#fbf7ef;border:1.5px dashed #c59b43;border-radius:10px;text-align:center;">
          <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#8b6923;font-weight:bold;">Password Reset Code</p>
          <div style="display:inline-block;padding:12px 24px;background:#17130f;color:#f3d794;font-size:26px;font-weight:bold;letter-spacing:6px;border-radius:8px;font-family:monospace;">
            ${escapeHtml(code)}
          </div>
          <p style="margin:10px 0 0;font-size:12px;color:#6c5c4d;">Expires in 60 minutes</p>
        </div>
        ${
          resetLink
            ? `<div style="margin:22px 0;text-align:center;">
                 <a href="${escapeHtml(resetLink)}" style="display:inline-block;padding:12px 26px;background:#17130f;color:#fff8ec;text-decoration:none;border-radius:999px;font-size:14px;font-weight:bold;letter-spacing:0.5px;">
                   Reset Password Now
                 </a>
               </div>`
            : ''
        }
        <p style="margin:18px 0 0;font-size:12.5px;line-height:1.6;color:#6c5c4d;">
          If you did not request a password reset, no action is needed — your current password remains unchanged.
        </p>
      </div>
      <div style="background:#f5ecdc;padding:14px 24px;text-align:center;font-size:12px;color:#6c5c4d;">
        ${escapeHtml(store.name)}${store.email ? ` · ${escapeHtml(store.email)}` : ''}
      </div>
    </div>
  </div>
  `.trim()

  return { subject, html, text }
}

/**
 * Branded Email Address Verification Email (6-digit PIN code).
 */
export async function buildEmailVerificationEmail({ name = '', email, code }) {
  const store = await getStore()
  const safeName = String(name || email || 'Valued Patron').trim()
  const subject = `Verify Your Email (${code}) — ${store.name}`

  const text = [
    `Namaste ${safeName},`,
    '',
    `Welcome to ${store.name}! Use this 6-digit code to verify your email address (${email}):`,
    '',
    `Verification Code: ${code}`,
    '',
    `This code expires in 15 minutes.`,
    '',
    `Warm regards,`,
    `${store.name}`,
  ].join('\n')

  const html = `
  <div style="margin:0;padding:24px;background:#faf4ea;font-family:Arial,Helvetica,sans-serif;color:#1e1812;">
    <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e4d4b7;border-radius:12px;overflow:hidden;">
      <div style="background:#17130f;color:#e7c67e;padding:22px 26px;text-align:center;">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d6ad58;">Email Verification</p>
        <h1 style="margin:8px 0 0;font-size:24px;font-family:Georgia,serif;color:#fff8ec;">${escapeHtml(store.name)}</h1>
      </div>
      <div style="padding:26px;">
        <p style="margin:0 0 12px;font-size:16px;">Namaste <strong>${escapeHtml(safeName)}</strong>,</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4a3f34;">
          Please enter the 6-digit verification code below to confirm <strong>${escapeHtml(email)}</strong> for your ${escapeHtml(store.name)} account.
        </p>
        <div style="margin:20px 0;padding:20px;background:#fbf7ef;border:1.5px dashed #c59b43;border-radius:10px;text-align:center;">
          <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.6px;color:#8b6923;font-weight:bold;">Verification Code</p>
          <div style="display:inline-block;padding:12px 24px;background:#17130f;color:#f3d794;font-size:26px;font-weight:bold;letter-spacing:6px;border-radius:8px;font-family:monospace;">
            ${escapeHtml(code)}
          </div>
          <p style="margin:10px 0 0;font-size:12px;color:#6c5c4d;">Expires in 15 minutes</p>
        </div>
      </div>
      <div style="background:#f5ecdc;padding:14px 24px;text-align:center;font-size:12px;color:#6c5c4d;">
        ${escapeHtml(store.name)}${store.email ? ` · ${escapeHtml(store.email)}` : ''}
      </div>
    </div>
  </div>
  `.trim()

  return { subject, html, text }
}

/**
 * Branded User-to-Admin Contact Inquiry Email.
 * Relays messages from the website contact form directly to the store administrator.
 */
export async function buildContactMessageEmail({ name, email, phone = '', order = '', topic = 'General enquiry', message = '' }) {
  const store = await getStore()
  const safeName = escapeHtml(name || 'Customer')
  const safeEmail = escapeHtml(email)
  const safePhone = escapeHtml(phone)
  const safeOrder = escapeHtml(order)
  const safeTopic = escapeHtml(topic)
  const safeMsg = escapeHtml(message).replace(/\n/g, '<br />')

  const subject = `[${store.name} Contact] ${topic}: ${name}`

  const text = [
    `NEW CONTACT MESSAGE FROM CUSTOMER`,
    `----------------------------------------`,
    `Name:    ${name}`,
    `Email:   ${email}`,
    phone ? `Phone:   ${phone}` : '',
    order ? `Order #: ${order}` : '',
    `Topic:   ${topic}`,
    ``,
    `Message:`,
    message,
    `----------------------------------------`,
    `Sent from ${store.name} website contact form.`,
  ]
    .filter(Boolean)
    .join('\n')

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f5f0; margin: 0; padding: 24px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e7ded0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <!-- Header -->
      <tr>
        <td style="padding: 24px; background-color: #121212; text-align: center;">
          <h1 style="color: #c89b3c; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">${escapeHtml(store.name)}</h1>
          <p style="color: #e0d5c1; margin: 4px 0 0; font-size: 12px; letter-spacing: 1px;">CUSTOMER INQUIRY NOTIFICATION</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding: 28px 24px;">
          <span style="display: inline-block; background-color: #fdf3f5; color: #b73853; border: 1px solid #f6cfd7; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 16px;">
            ${safeTopic}
          </span>
          <h2 style="margin: 0 0 16px; color: #1c1c1c; font-size: 18px; font-weight: 600;">New message from ${safeName}</h2>

          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fbf9f5; border-radius: 8px; border: 1px solid #ece4d5; margin-bottom: 20px;">
            <tr>
              <td style="padding: 12px 16px; border-bottom: 1px solid #ece4d5; font-size: 13px; color: #6b645b; width: 35%;">Customer Name</td>
              <td style="padding: 12px 16px; border-bottom: 1px solid #ece4d5; font-size: 13px; color: #1c1c1c; font-weight: 600;">${safeName}</td>
            </tr>
            <tr>
              <td style="padding: 12px 16px; border-bottom: 1px solid #ece4d5; font-size: 13px; color: #6b645b;">Email Address</td>
              <td style="padding: 12px 16px; border-bottom: 1px solid #ece4d5; font-size: 13px; color: #1c1c1c; font-weight: 600;">
                <a href="mailto:${safeEmail}" style="color: #a47625; text-decoration: none;">${safeEmail}</a>
              </td>
            </tr>
            ${safePhone ? `
            <tr>
              <td style="padding: 12px 16px; border-bottom: 1px solid #ece4d5; font-size: 13px; color: #6b645b;">Phone</td>
              <td style="padding: 12px 16px; border-bottom: 1px solid #ece4d5; font-size: 13px; color: #1c1c1c; font-weight: 600;">${safePhone}</td>
            </tr>` : ''}
            ${safeOrder ? `
            <tr>
              <td style="padding: 12px 16px; border-bottom: 1px solid #ece4d5; font-size: 13px; color: #6b645b;">Order Number</td>
              <td style="padding: 12px 16px; border-bottom: 1px solid #ece4d5; font-size: 13px; color: #1c1c1c; font-weight: 600;">${safeOrder}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 12px 16px; font-size: 13px; color: #6b645b;">Subject / Topic</td>
              <td style="padding: 12px 16px; font-size: 13px; color: #1c1c1c; font-weight: 600;">${safeTopic}</td>
            </tr>
          </table>

          <div style="margin-top: 16px;">
            <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #1c1c1c; text-transform: uppercase; letter-spacing: 0.5px;">Customer Message:</p>
            <div style="background-color: #ffffff; border-left: 3px solid #c89b3c; border-top: 1px solid #ece4d5; border-right: 1px solid #ece4d5; border-bottom: 1px solid #ece4d5; border-radius: 4px; padding: 14px 16px; font-size: 14px; line-height: 1.6; color: #2c2925;">
              ${safeMsg}
            </div>
          </div>

          <div style="margin-top: 24px; text-align: center;">
            <a href="mailto:${safeEmail}?subject=Re:%20[${encodeURIComponent(store.name)}]%20${encodeURIComponent(topic)}" style="display: inline-block; background-color: #121212; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 0.5px;">
              Reply Directly to Customer (${safeEmail})
            </a>
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding: 16px 24px; background-color: #f7f5f0; border-top: 1px solid #e7ded0; text-align: center; font-size: 11px; color: #8a8276;">
          This inquiry was sent through the ${escapeHtml(store.name)} contact form and delivered directly to your admin inbox via Brevo.
        </td>
      </tr>
    </table>
  </body>
  </html>
  `.trim()

  return { subject, html, text }
}

