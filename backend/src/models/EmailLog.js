import { Schema, model } from 'mongoose'
import { baseOptions, ref } from './options.js'

/**
 * Audit trail of outbound benefit & order emails.
 *
 * When SMTP credentials are configured, rows record live SMTP message IDs
 * (`status: 'sent'`) or errors (`status: 'failed'`). When SMTP is not yet set,
 * rows record `status: 'preview'` with full rendered HTML/text so staff can
 * inspect or copy the offer instead of losing it silently.
 */
const emailLogSchema = new Schema(
  {
    to: { type: String, required: true, lowercase: true, trim: true, index: true },
    recipientName: { type: String, default: '' },
    phone: { type: String, default: '' },
    customer: ref('Customer', { required: false, default: null }),
    kind: {
      type: String,
      enum: ['repeat-benefit', 'order-confirmation', 'manual-offer', 'test', 'password-reset', 'email-verification', 'contact-message'],
      default: 'repeat-benefit',
      index: true,
    },
    provider: {
      type: String,
      enum: ['brevo', 'smtp', 'preview', ''],
      default: '',
    },
    subject: { type: String, required: true },
    couponCode: { type: String, default: '' },
    discountPercent: { type: Number, default: 0 },
    visitsAtSend: { type: Number, default: 0 },
    status: { type: String, enum: ['sent', 'preview', 'failed'], default: 'preview', index: true },
    messageId: { type: String, default: '' },
    error: { type: String, default: '' },
    html: { type: String, default: '' },
    text: { type: String, default: '' },
    sentBy: { type: String, default: 'System Auto' },
    sentAt: { type: Date, default: () => new Date(), index: true },
  },
  baseOptions,
)

export const EmailLog = model('EmailLog', emailLogSchema)
export default EmailLog

