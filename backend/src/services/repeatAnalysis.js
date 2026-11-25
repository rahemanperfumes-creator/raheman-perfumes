import { Coupon, Customer, EmailLog, Order, STAFF_ROLES, User } from '../models/index.js'
import { badRequest, unprocessable } from '../middleware/error.js'
import {
  cleanDisplayName,
  isSyntheticEmail,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  realEmailOf,
  WALK_IN_EMAIL,
} from '../lib/identity.js'
import { getLoyaltyRules, publicEmailSettings } from './settings.js'
import { issuePersonalReward } from './coupons.js'
import { buildRepeatBenefitEmail, sendLoggedEmail } from './mailer.js'
import { logCustomer } from './activity.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Pick highest loyalty tier reached for a visit count. */
export function resolveLoyaltyTier(visits, tiers = []) {
  const sorted = [...tiers].sort((a, b) => a.minVisits - b.minVisits)
  let current = null
  let next = null
  for (const tier of sorted) {
    if (visits >= tier.minVisits) current = tier
    else if (!next) next = tier
  }
  return { current, next }
}

/** Disjoint-set union helper for linking email / phone / customerId tokens cleanly. */
function makeUnionFind() {
  const parent = new Map()
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x)
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)
    let cur = x
    while (cur !== root) {
      const nxt = parent.get(cur)
      parent.set(cur, root)
      cur = nxt
    }
    return root
  }
  const union = (a, b) => {
    if (!a || !b) return
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  return { find, union }
}

function segmentOf(visits, currentTier) {
  if (currentTier) {
    if (currentTier.minVisits >= 5) return 'VIP'
    if (currentTier.minVisits >= 3) return 'Regular'
    return 'Repeat'
  }
  if (visits >= 5) return 'VIP'
  if (visits >= 3) return 'Regular'
  if (visits >= 2) return 'Repeat'
  return 'One-Time'
}

/**
 * Group every non-cancelled order + saved customer record by Email, Phone, and Name
 * to produce full repeat-customer analysis across Shop Counter and Online Storefront.
 */
export async function analyzeCustomers() {
  const [rawOrders, rawCustomers, staffUsers, rules, smtp, personalCoupons, emailLogs] = await Promise.all([
    Order.find({ status: { $ne: 'Cancelled' } })
      .populate('customer', 'name email phone city status loyaltyTier notes')
      .sort({ placedAt: -1 })
      .lean(),
    Customer.find({ email: { $ne: WALK_IN_EMAIL } }).lean(),
    User.find({ role: { $in: STAFF_ROLES } }).select('customer').lean(),
    getLoyaltyRules(),
    publicEmailSettings(),
    Coupon.find({ personalOnly: true }).sort({ createdAt: -1 }).lean(),
    EmailLog.find().sort({ sentAt: -1 }).limit(100).lean(),
  ])

  const staffCustomerIds = new Set(staffUsers.map((u) => (u.customer ? String(u.customer) : '')).filter(Boolean))
  const uf = makeUnionFind()

  const customerById = new Map()
  for (const c of rawCustomers) {
    const cid = String(c._id)
    customerById.set(cid, c)
    const cToken = `c:${cid}`
    uf.find(cToken)
    const e = realEmailOf(c)
    const p = normalizePhone(c.phone)
    if (e) uf.union(cToken, `e:${e}`)
    if (p) uf.union(cToken, `p:${p}`)
  }

  // Extract normalized tokens per order without blindly tying distinct walk-ins together.
  const orderDescriptors = rawOrders.map((doc) => {
    const custDoc = doc.customer && typeof doc.customer === 'object' ? doc.customer : null
    const custId = custDoc?._id ? String(custDoc._id) : doc.customer ? String(doc.customer) : ''
    const isWalkInDoc = custDoc?.email === WALK_IN_EMAIL || (!custDoc && !custId)

    const email = normalizeEmail(doc.address?.email) || (!isWalkInDoc ? realEmailOf(custDoc) : '')
    const phone = normalizePhone(doc.address?.phone) || (!isWalkInDoc ? normalizePhone(custDoc?.phone) : '')
    const displayName = cleanDisplayName(doc.address?.name || (!isWalkInDoc ? custDoc?.name : ''))
    const nameKey = normalizeName(displayName)

    return {
      doc,
      custDoc: !isWalkInDoc ? custDoc : null,
      custId: !isWalkInDoc ? custId : '',
      email,
      phone,
      rawPhone: doc.address?.phone || (!isWalkInDoc ? custDoc?.phone : '') || '',
      displayName,
      nameKey,
    }
  })

  // Link strong keys (email, phone, real customerId) seen together on an order.
  for (const item of orderDescriptors) {
    const tokens = []
    if (item.custId) tokens.push(`c:${item.custId}`)
    if (item.email) tokens.push(`e:${item.email}`)
    if (item.phone) tokens.push(`p:${item.phone}`)
    if (tokens.length > 0) {
      for (let i = 1; i < tokens.length; i += 1) uf.union(tokens[0], tokens[i])
    }
  }

  // Map normalized names to strong group roots so unambiguous name-only counter bills attach cleanly.
  const nameToRoots = new Map()
  for (const c of rawCustomers) {
    const n = normalizeName(c.name)
    if (!n) continue
    const root = uf.find(`c:${c._id}`)
    if (!nameToRoots.has(n)) nameToRoots.set(n, new Set())
    nameToRoots.get(n).add(root)
  }
  for (const item of orderDescriptors) {
    if (!item.nameKey) continue
    const anchor = item.email ? `e:${item.email}` : item.phone ? `p:${item.phone}` : item.custId ? `c:${item.custId}` : null
    if (!anchor) continue
    const root = uf.find(anchor)
    if (!nameToRoots.has(item.nameKey)) nameToRoots.set(item.nameKey, new Set())
    nameToRoots.get(item.nameKey).add(root)
  }

  const groups = new Map()
  const ensureGroup = (key) => {
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        customerIds: new Set(),
        emails: new Set(),
        phones: new Set(),
        rawPhones: [],
        names: new Set(),
        matchedVia: new Set(),
        channels: new Set(),
        productCounts: new Map(),
        orders: [],
        totalSpent: 0,
        shopVisits: 0,
        onlineVisits: 0,
        staff: false,
      })
    }
    return groups.get(key)
  }

  // Seed groups from customer docs so profile details (names, notes, status) remain intact.
  for (const c of rawCustomers) {
    const cid = String(c._id)
    const key = uf.find(`c:${cid}`)
    const g = ensureGroup(key)
    g.customerIds.add(cid)
    if (staffCustomerIds.has(cid)) g.staff = true
    const e = realEmailOf(c)
    const p = normalizePhone(c.phone)
    if (e) g.emails.add(e)
    if (p) {
      g.phones.add(p)
      if (c.phone) g.rawPhones.push(c.phone)
    }
    if (cleanDisplayName(c.name) && normalizeName(c.name)) {
      g.names.add(cleanDisplayName(c.name))
    }
  }

  let anonymousCounterBills = 0

  for (const item of orderDescriptors) {
    let key = null
    const via = []
    if (item.email) {
      key = uf.find(`e:${item.email}`)
      via.push('Email')
    }
    if (item.phone) {
      const pKey = uf.find(`p:${item.phone}`)
      key = key || pKey
      via.push('Phone')
    }
    if (!key && item.custId) {
      key = uf.find(`c:${item.custId}`)
      via.push('Account')
    }
    if (!key && item.nameKey) {
      const candidates = nameToRoots.get(item.nameKey)
      key = candidates && candidates.size === 1 ? [...candidates][0] : `name:${item.nameKey}`
      via.push('Name')
    }

    if (!key) {
      if (item.doc.channel === 'Shop') anonymousCounterBills += 1
      continue
    }

    const g = ensureGroup(key)
    if (item.custId) {
      g.customerIds.add(item.custId)
      if (staffCustomerIds.has(item.custId)) g.staff = true
    }
    if (item.email) g.emails.add(item.email)
    if (item.phone) {
      g.phones.add(item.phone)
      if (item.rawPhone) g.rawPhones.push(item.rawPhone)
    }
    if (item.displayName && normalizeName(item.displayName)) {
      g.names.add(item.displayName)
    }
    if (item.nameKey && !item.email && !item.phone) via.push('Name')
    for (const v of via) g.matchedVia.add(v)

    const ch = item.doc.channel === 'Shop' ? 'Shop' : 'Website'
    g.channels.add(ch)
    if (ch === 'Shop') g.shopVisits += 1
    else g.onlineVisits += 1

    const amount = Number(item.doc.pricing?.total) || 0
    g.totalSpent += amount

    const itemParts = []
    for (const line of item.doc.items ?? []) {
      const pname = cleanDisplayName(line.name)
      const qty = Number(line.qty) || 1
      if (pname) {
        g.productCounts.set(pname, (g.productCounts.get(pname) ?? 0) + qty)
        itemParts.push(`${qty} × ${pname}`)
      }
    }

    g.orders.push({
      number: item.doc.number,
      placedAt: item.doc.placedAt,
      channel: item.doc.channel,
      amount,
      paymentMethod: item.doc.payment?.method ?? '',
      status: item.doc.status,
      itemsSummary: itemParts.join(', '),
      email: item.email,
      phone: item.rawPhone,
      name: item.displayName,
      matchedVia: [...new Set(via)],
    })
  }

  // Build final analyzed customer list (exclude staff-only rows with 0 visits so shop reports stay clean).
  const couponsByEmail = new Map()
  const now = new Date()
  for (const cp of personalCoupons) {
    const e = normalizeEmail(cp.issuedToEmail)
    if (!e) continue
    if (!couponsByEmail.has(e)) couponsByEmail.set(e, [])
    couponsByEmail.get(e).push({
      code: cp.code,
      value: cp.value,
      minOrder: cp.minOrder,
      active: Boolean(cp.active) && (!cp.endsAt || new Date(cp.endsAt) > now) && (cp.usageLimit == null || cp.usedCount < cp.usageLimit),
      usedCount: cp.usedCount ?? 0,
      endsAt: cp.endsAt,
      createdAt: cp.createdAt,
    })
  }

  const emailsByAddr = new Map()
  for (const log of emailLogs) {
    const e = normalizeEmail(log.to)
    if (!e) continue
    if (!emailsByAddr.has(e)) emailsByAddr.set(e, [])
    emailsByAddr.get(e).push({
      id: String(log._id),
      to: log.to,
      status: log.status,
      couponCode: log.couponCode,
      discountPercent: log.discountPercent,
      sentAt: log.sentAt,
      subject: log.subject,
    })
  }

  const analyzed = []
  for (const g of groups.values()) {
    const visits = g.orders.length
    if (visits === 0) continue

    const sortedOrders = [...g.orders].sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt))
    const lastVisitAt = sortedOrders[0]?.placedAt ?? null
    const firstVisitAt = sortedOrders[sortedOrders.length - 1]?.placedAt ?? null
    const spanDays =
      firstVisitAt && lastVisitAt ? Math.max(0, (new Date(lastVisitAt) - new Date(firstVisitAt)) / DAY_MS) : 0
    const avgDaysBetweenVisits = visits > 1 ? Math.round(spanDays / (visits - 1)) : null
    const daysSinceLastVisit = lastVisitAt ? Math.floor((Date.now() - new Date(lastVisitAt)) / DAY_MS) : null

    const primaryCid = [...g.customerIds][0] ?? null
    const primaryCustomer = primaryCid ? customerById.get(primaryCid) : null
    const email = [...g.emails][0] ?? ''
    const phone = g.rawPhones[0] ?? ([...g.phones][0] ?? '')
    const phoneKey = [...g.phones][0] ?? ''
    const name =
      (primaryCustomer?.name && !primaryCustomer.name.startsWith('Walk-in') ? primaryCustomer.name : '') ||
      [...g.names][0] ||
      (email ? email.split('@')[0] : '') ||
      (phone ? `Customer ${phone}` : 'Shop Customer')

    const { current: eligibleBenefit, next: nextBenefit } = resolveLoyaltyTier(visits, rules.tiers)
    const segment = segmentOf(visits, eligibleBenefit)
    const topProducts = [...g.productCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([productName, qty]) => ({ name: productName, qty }))

    const issuedCoupons = email ? (couponsByEmail.get(email) ?? []) : []
    const customerEmailHistory = email ? (emailsByAddr.get(email) ?? []) : []

    analyzed.push({
      key: g.key,
      customerId: primaryCid,
      name,
      email,
      hasRealEmail: Boolean(email),
      phone,
      phoneKey,
      staff: g.staff,
      matchedBy: [...g.matchedVia],
      channels: [...g.channels],
      visits,
      shopVisits: g.shopVisits,
      onlineVisits: g.onlineVisits,
      totalSpent: Math.round(g.totalSpent),
      averageBill: Math.round(g.totalSpent / visits),
      firstVisitAt,
      lastVisitAt,
      daysSinceLastVisit,
      avgDaysBetweenVisits,
      segment,
      eligibleBenefit,
      nextBenefit,
      topProducts,
      issuedCoupons,
      lastBenefitEmail: customerEmailHistory[0] ?? null,
      orders: sortedOrders,
    })
  }

  analyzed.sort((a, b) => b.visits - a.visits || b.totalSpent - a.totalSpent)

  const repeatList = analyzed.filter((c) => c.visits >= 2)
  const totalRevenue = analyzed.reduce((sum, c) => sum + c.totalSpent, 0)
  const repeatRevenue = repeatList.reduce((sum, c) => sum + c.totalSpent, 0)

  const summary = {
    totalCustomers: analyzed.length,
    repeatCustomers: repeatList.length,
    regularCustomers: analyzed.filter((c) => c.visits >= 3).length,
    vipCustomers: analyzed.filter((c) => c.visits >= 5).length,
    oneTimeCustomers: analyzed.filter((c) => c.visits === 1).length,
    repeatRatePercent: analyzed.length > 0 ? Math.round((repeatList.length / analyzed.length) * 100) : 0,
    totalRevenue,
    repeatRevenue,
    repeatRevenuePercent: totalRevenue > 0 ? Math.round((repeatRevenue / totalRevenue) * 100) : 0,
    anonymousCounterBills,
    benefitsSentCount: emailLogs.filter((l) => l.kind !== 'test').length,
    activeBenefitCoupons: personalCoupons.filter(
      (cp) => cp.active && (!cp.endsAt || new Date(cp.endsAt) > now) && (cp.usageLimit == null || cp.usedCount < cp.usageLimit),
    ).length,
  }

  return {
    summary,
    customers: analyzed,
    rules,
    smtp,
    emailLogs: emailLogs.slice(0, 50).map((log) => ({
      id: String(log._id),
      to: log.to,
      recipientName: log.recipientName,
      phone: log.phone,
      kind: log.kind,
      subject: log.subject,
      couponCode: log.couponCode,
      discountPercent: log.discountPercent,
      visitsAtSend: log.visitsAtSend,
      status: log.status,
      error: log.error,
      sentBy: log.sentBy,
      sentAt: log.sentAt,
    })),
  }
}

/**
 * Live lookup used at Counter Billing as cashier types Name / Phone / Email
 * or picks a saved customer. Returns repeat history + what discount tier this
 * visit unlocks.
 */
export async function lookupCustomerRepeat({ name = '', phone = '', email = '', customerId = '' } = {}) {
  const emailKey = normalizeEmail(email)
  const phoneKey = normalizePhone(phone)
  const nameKey = normalizeName(name)
  const rules = await getLoyaltyRules()

  if (!emailKey && !phoneKey && !nameKey && !customerId) {
    return { found: false, visits: 0, upcomingVisit: 1, benefit: null, nextBenefit: resolveLoyaltyTier(1, rules.tiers).next }
  }

  const report = await analyzeCustomers()
  const match = report.customers.find((entry) => {
    if (customerId && entry.customerId === String(customerId)) return true
    if (emailKey && entry.email === emailKey) return true
    if (phoneKey && entry.phoneKey === phoneKey) return true
    if (!emailKey && !phoneKey && nameKey && normalizeName(entry.name) === nameKey) return true
    return false
  })

  if (!match) {
    const nextBenefit = resolveLoyaltyTier(1, rules.tiers).next
    return {
      found: false,
      visits: 0,
      upcomingVisit: 1,
      shopVisits: 0,
      onlineVisits: 0,
      totalSpent: 0,
      benefit: null,
      nextBenefit,
      activeCoupon: null,
    }
  }

  const upcomingVisit = match.visits + 1
  const { current: upcomingTier, next: nextAfterThis } = resolveLoyaltyTier(upcomingVisit, rules.tiers)
  const activeCoupon = match.issuedCoupons?.find((cp) => cp.active) ?? null

  return {
    found: true,
    customerId: match.customerId,
    name: match.name,
    phone: match.phone,
    email: match.email,
    matchedBy: match.matchedBy,
    visits: match.visits,
    upcomingVisit,
    shopVisits: match.shopVisits,
    onlineVisits: match.onlineVisits,
    totalSpent: match.totalSpent,
    lastVisitAt: match.lastVisitAt,
    segment: match.segment,
    benefit: upcomingTier,
    nextBenefit: nextAfterThis,
    activeCoupon,
  }
}

/**
 * Issue a personal reward coupon and email it to the customer (saving / updating
 * their email on their Customer profile if provided for the first time).
 */
export async function issueAndSendBenefit({
  customerId = null,
  name = '',
  phone = '',
  email = '',
  discountPercent,
  minOrder,
  validityDays,
  customMessage = '',
  visits,
  kind = 'manual-offer',
  sentBy = 'Owner',
}) {
  const cleanEmail = normalizeEmail(email)
  if (!cleanEmail) {
    throw unprocessable('Please enter a valid customer email address (not empty or synthetic) to send the benefit.')
  }

  const rules = await getLoyaltyRules()
  const pct = Number(discountPercent)
  if (!Number.isFinite(pct) || pct <= 0 || pct > 80) {
    throw badRequest('Discount percentage must be between 1 and 80.')
  }

  const days = Math.max(1, Math.min(365, Math.round(Number(validityDays ?? rules.validityDays) || 30)))
  const minOrd = Math.max(0, Math.round(Number(minOrder ?? rules.minOrderAmount) || 0))
  const cleanPhone = String(phone ?? '').trim()
  const cleanName = cleanDisplayName(name) || cleanEmail.split('@')[0]

  // Save/enrich Customer record with the real email so future shop & online purchases stay unified.
  let linkedCustomer = customerId ? await Customer.findById(customerId) : null
  if (!linkedCustomer) {
    linkedCustomer = await Customer.findOne({ email: cleanEmail })
  }
  if (!linkedCustomer && cleanPhone) {
    const phoneKey = normalizePhone(cleanPhone)
    if (phoneKey) {
      const candidates = await Customer.find({ email: { $ne: WALK_IN_EMAIL }, phone: { $ne: '' } })
      linkedCustomer = candidates.find((c) => normalizePhone(c.phone) === phoneKey) ?? null
    }
  }

  if (linkedCustomer && isSyntheticEmail(linkedCustomer.email)) {
    const taken = await Customer.findOne({ email: cleanEmail, _id: { $ne: linkedCustomer._id } }).lean()
    if (!taken) {
      linkedCustomer.email = cleanEmail
      if (cleanName && linkedCustomer.name.startsWith('Customer ')) linkedCustomer.name = cleanName
      await linkedCustomer.save()
    }
  } else if (!linkedCustomer) {
    linkedCustomer = await Customer.create({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
    })
  }

  let effectiveVisits = Number(visits) || 0
  if (effectiveVisits <= 0) {
    const lookup = await lookupCustomerRepeat({ email: cleanEmail, phone: cleanPhone, customerId: linkedCustomer?._id })
    effectiveVisits = Math.max(1, lookup.visits || 1)
  }

  const { current: tier } = resolveLoyaltyTier(effectiveVisits, rules.tiers)
  const tierLabel = tier?.label || `${pct}% Loyalty Reward`

  const coupon = await issuePersonalReward({
    discountPercent: pct,
    minOrder: minOrd,
    validityDays: days,
    email: cleanEmail,
    label: tierLabel,
    headline: `${pct}% OFF — ${tierLabel}`,
    description: customMessage || `Personal repeat customer benefit issued after ${effectiveVisits} purchases.`,
  })

  const rendered = await buildRepeatBenefitEmail({
    customerName: cleanName,
    visits: effectiveVisits,
    tierLabel,
    discountPercent: pct,
    couponCode: coupon.code,
    minOrder: minOrd,
    expiresAt: coupon.endsAt,
    customMessage,
  })

  const sent = await sendLoggedEmail({
    to: cleanEmail,
    recipientName: cleanName,
    phone: cleanPhone,
    customerId: linkedCustomer?._id ?? null,
    kind,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    couponCode: coupon.code,
    discountPercent: pct,
    visitsAtSend: effectiveVisits,
    sentBy,
  })

  await logCustomer(
    `Issued ${pct}% repeat customer benefit (${coupon.code}) for ${cleanName} (${cleanEmail}).`,
    { actor: sentBy, target: cleanEmail },
  )

  return {
    coupon: {
      id: String(coupon._id),
      code: coupon.code,
      value: coupon.value,
      minOrder: coupon.minOrder,
      endsAt: coupon.endsAt,
    },
    emailLog: {
      id: String(sent.log._id),
      to: sent.log.to,
      status: sent.status,
      error: sent.error,
      sentAt: sent.log.sentAt,
    },
    smtpConfigured: sent.configured,
    whatsappText: rendered.whatsappText,
  }
}

/**
 * Automatically run after an order/bill commits: updates customer loyalty tier
 * and, when autoSendEmail is ON + buyer qualifies + no unused active reward of
 * equal or higher discount exists, sends/prepares their reward benefit email.
 */
export async function processPostOrderLoyalty({ order, customer, forceSendEmail = false, actorName = 'System Auto' }) {
  try {
    const email = normalizeEmail(order.address?.email) || realEmailOf(customer)
    const phone = order.address?.phone || customer?.phone || ''
    const name = cleanDisplayName(order.address?.name || customer?.name || '')
    const custId = customer && customer.email !== WALK_IN_EMAIL ? String(customer._id) : ''

    const lookup = await lookupCustomerRepeat({ name, phone, email, customerId: custId })
    const visits = Math.max(1, lookup.visits || 1)
    const rules = await getLoyaltyRules()
    const { current: tier } = resolveLoyaltyTier(visits, rules.tiers)

    // Keep stored customer tier in sync when linked to a real customer profile.
    if (custId && customer && !isSyntheticEmail(customer.email)) {
      const nextTierLabel = tier ? tier.label : 'Bronze Member'
      if (customer.loyaltyTier !== nextTierLabel) {
        await Customer.updateOne({ _id: customer._id }, { $set: { loyaltyTier: nextTierLabel } })
      }
    }

    if (!tier || (!rules.autoSendEmail && !forceSendEmail)) {
      return {
        visits,
        matchedBy: lookup.matchedBy ?? [],
        tierLabel: tier?.label ?? '',
        discountPercent: tier?.discountPercent ?? 0,
        emailTriggered: false,
      }
    }

    if (!email) {
      return {
        visits,
        matchedBy: lookup.matchedBy ?? [],
        tierLabel: tier.label,
        discountPercent: tier.discountPercent,
        emailTriggered: false,
        reason: 'no-email',
      }
    }

    // Avoid sending duplicate coupon if customer already holds an active unused personal coupon at >= this tier %.
    const alreadyHasActive = lookup.activeCoupon && Number(lookup.activeCoupon.value) >= tier.discountPercent
    if (alreadyHasActive && !forceSendEmail) {
      return {
        visits,
        matchedBy: lookup.matchedBy ?? [],
        tierLabel: tier.label,
        discountPercent: tier.discountPercent,
        couponCode: lookup.activeCoupon.code,
        emailTriggered: false,
        reason: 'active-coupon-exists',
      }
    }

    const result = await issueAndSendBenefit({
      customerId: custId || null,
      name,
      phone,
      email,
      discountPercent: tier.discountPercent,
      minOrder: rules.minOrderAmount,
      validityDays: rules.validityDays,
      visits,
      kind: 'repeat-benefit',
      sentBy: actorName,
    })

    return {
      visits,
      matchedBy: lookup.matchedBy ?? [],
      tierLabel: tier.label,
      discountPercent: tier.discountPercent,
      couponCode: result.coupon.code,
      emailTriggered: true,
      emailStatus: result.emailLog.status,
      smtpConfigured: result.smtpConfigured,
    }
  } catch (err) {
    console.warn('[repeatAnalysis] Post-order loyalty warning:', err?.message || err)
    return null
  }
}

export default {
  analyzeCustomers,
  lookupCustomerRepeat,
  issueAndSendBenefit,
  processPostOrderLoyalty,
  resolveLoyaltyTier,
}

