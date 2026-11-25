import crypto from 'node:crypto'
import { unprocessable, serviceUnavailable } from '../middleware/error.js'

/**
 * Razorpay Payment Gateway Service.
 * Handles server-to-server Razorpay order creation and HMAC-SHA256 signature verification.
 */

export function isRazorpayConfigured() {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim()
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim()
  return Boolean(keyId && keySecret && !keyId.includes('replace') && !keySecret.includes('replace'))
}

export function getRazorpayKeyId() {
  return (process.env.RAZORPAY_KEY_ID || '').trim()
}

/**
 * Create an order on Razorpay servers.
 *
 * @param {object} params
 * @param {number} params.amountInPaise - e.g. 59900 for ₹599.00
 * @param {string} [params.currency='INR']
 * @param {string} [params.receipt]
 * @param {object} [params.notes]
 */
export async function createRazorpayOrder({ amountInPaise, currency = 'INR', receipt, notes = {} }) {
  if (!isRazorpayConfigured()) {
    throw serviceUnavailable(
      'Razorpay payment gateway is not yet configured on the server. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server environment.',
    )
  }

  const keyId = process.env.RAZORPAY_KEY_ID.trim()
  const keySecret = process.env.RAZORPAY_KEY_SECRET.trim()
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64')

  const payload = {
    amount: Math.round(Number(amountInPaise)),
    currency,
    receipt: receipt || `rcpt_${Date.now().toString(36)}`,
    notes,
  }

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()

  if (!res.ok) {
    const errorMsg = data?.error?.description || data?.error?.reason || 'Failed to create order on Razorpay.'
    throw unprocessable(`Razorpay order creation failed: ${errorMsg}`)
  }

  return {
    orderId: data.id,
    amount: data.amount,
    currency: data.currency,
    keyId,
  }
}

/**
 * Verify Razorpay payment signature using HMAC-SHA256.
 *
 * @param {object} params
 * @param {string} params.razorpay_order_id
 * @param {string} params.razorpay_payment_id
 * @param {string} params.razorpay_signature
 */
export function verifyRazorpaySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!isRazorpayConfigured()) {
    throw serviceUnavailable('Razorpay is not configured on the server.')
  }

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return false
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET.trim()
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  const a = Buffer.from(expectedSignature, 'utf8')
  const b = Buffer.from(razorpay_signature, 'utf8')

  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
