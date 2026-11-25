import { Customer } from '../models/index.js'
import { notFound } from '../middleware/error.js'
import {
  cleanDisplayName,
  isSyntheticEmail,
  normalizeEmail,
  normalizePhone,
  realEmailOf,
  syntheticPhoneEmail,
  WALK_IN_EMAIL,
} from '../lib/identity.js'
import { place, voidShopBill } from './orders.js'
import { adminMany } from './products.js'
import { getStore } from './settings.js'
import { processPostOrderLoyalty } from './repeatAnalysis.js'

export { WALK_IN_EMAIL }

/**
 * The patron counter sales are filed under when no name/phone/email identifies a profile.
 */
export async function walkInCustomer() {
  const upsert = () =>
    Customer.findOneAndUpdate(
      { email: WALK_IN_EMAIL },
      {
        $setOnInsert: {
          name: 'Walk-in Customer',
          email: WALK_IN_EMAIL,
          notes: 'System record. Counter sales with no named customer are saved here — do not delete.',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )

  try {
    return await upsert()
  } catch (error) {
    if (error?.code === 11000) return upsert()
    throw error
  }
}

/**
 * Match an existing customer by id, email, or phone — or create a tracked
 * customer profile when phone or email is given at the shop counter.
 */
async function resolveCounterCustomer({ customerId, rawCustomer = {}, city = '' }) {
  const email = normalizeEmail(rawCustomer.email)
  const rawPhone = String(rawCustomer.phone ?? '').trim()
  const phoneKey = normalizePhone(rawPhone)
  const name = cleanDisplayName(rawCustomer.name)

  if (customerId) {
    const customer = await Customer.findById(customerId)
    if (!customer) throw notFound('That customer does not exist.')

    let changed = false
    if (email && isSyntheticEmail(customer.email)) {
      const taken = await Customer.findOne({ email, _id: { $ne: customer._id } }).lean()
      if (!taken) {
        customer.email = email
        changed = true
      }
    }
    if (rawPhone && !customer.phone) {
      customer.phone = rawPhone
      changed = true
    }
    if (changed) await customer.save()

    return {
      customer,
      emailOnBill: email || realEmailOf(customer),
      phoneOnBill: rawPhone || customer.phone || '',
      nameOnBill: name || customer.name,
    }
  }

  // No saved customer id selected — resolve by email or phone first so repeat visits stay connected.
  if (email || phoneKey) {
    let customer = email ? await Customer.findOne({ email }) : null

    if (!customer && phoneKey) {
      const candidates = await Customer.find({ email: { $ne: WALK_IN_EMAIL }, phone: { $ne: '' } })
      customer = candidates.find((c) => normalizePhone(c.phone) === phoneKey) ?? null
    }

    if (customer) {
      let changed = false
      if (email && isSyntheticEmail(customer.email)) {
        const taken = await Customer.findOne({ email, _id: { $ne: customer._id } }).lean()
        if (!taken) {
          customer.email = email
          changed = true
        }
      }
      if (rawPhone && !customer.phone) {
        customer.phone = rawPhone
        changed = true
      }
      if (name && (customer.name.startsWith('Walk-in') || customer.name.startsWith('Customer '))) {
        customer.name = name
        changed = true
      }
      if (changed) await customer.save()

      return {
        customer,
        emailOnBill: email || realEmailOf(customer),
        phoneOnBill: rawPhone || customer.phone || '',
        nameOnBill: name || customer.name,
      }
    }

    // Create a persistent Customer record so future shop OR online purchases match immediately.
    const fallbackEmail = email || syntheticPhoneEmail(phoneKey)
    const fallbackName = name || (email ? email.split('@')[0] : `Customer ${phoneKey.slice(-4)}`)
    try {
      customer = await Customer.create({
        name: fallbackName,
        email: fallbackEmail,
        phone: rawPhone,
        city,
      })
    } catch (error) {
      if (error?.code === 11000) {
        customer = await Customer.findOne({ email: fallbackEmail })
      }
      if (!customer) throw error
    }

    return {
      customer,
      emailOnBill: email || realEmailOf(customer),
      phoneOnBill: rawPhone || customer.phone || '',
      nameOnBill: name || customer.name,
    }
  }

  // Name-only or anonymous walk-in: store under shared walk-in record; name stays on bill snapshot for Name repeat analysis.
  const customer = await walkInCustomer()
  return {
    customer,
    emailOnBill: '',
    phoneOnBill: rawPhone,
    nameOnBill: name,
  }
}

/**
 * Ring up a counter bill and run post-purchase repeat-customer benefit evaluation.
 */
export async function ringUp(input, { actor }) {
  const store = await getStore()
  const { customer, emailOnBill, phoneOnBill, nameOnBill } = await resolveCounterCustomer({
    customerId: input.customerId,
    rawCustomer: input.customer,
    city: store.city,
  })

  const order = await place(
    {
      items: input.items,
      channel: 'Shop',
      address: {
        name: nameOnBill,
        phone: phoneOnBill,
        email: emailOnBill,
        line1: '',
        line2: '',
        city: store.city,
        state: '',
        pincode: '',
      },
      payment: input.payment,
      discount: input.discount,
      notes: input.notes,
      clientRef: input.clientRef,
    },
    { customer, actor },
  )

  const duplicate = Boolean(order.$locals?.duplicate)
  const loyalty = duplicate
    ? null
    : await processPostOrderLoyalty({
        order,
        customer,
        forceSendEmail: Boolean(input.sendBenefitEmail),
        actorName: actor?.name ?? 'Shop Counter',
      })

  const productIds = [...new Set(order.items.map((item) => String(item.product)).filter(Boolean))]
  return {
    order,
    products: await adminMany(productIds),
    duplicate,
    loyalty,
  }
}

/** Void a bill and hand back the fragrances whose stock it returned. */
export async function voidBill(idOrNumber, { actor, reason }) {
  const order = await voidShopBill(idOrNumber, { actor, reason })
  const productIds = [...new Set(order.items.map((item) => String(item.product)).filter(Boolean))]
  return { order, products: await adminMany(productIds) }
}

export default { walkInCustomer, ringUp, voidBill, WALK_IN_EMAIL }
