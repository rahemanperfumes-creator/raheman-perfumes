import api from '@/lib/api'

/**
 * The admin's **write** layer, and the pull that fills the store from the server.
 *
 * Every table in the panel renders from `useAdminStore`, which starts empty and
 * persists to localStorage. The store has to be *told* what the server holds —
 * that is what `pull()` does — and every other function here sends one
 * mutation and hands the server's version of the record back.
 *
 * Both go through `api.mutate`, which resolves `{live: true, data}` only when
 * the server took the change and **throws otherwise** — refused or unreachable.
 * There is no offline write any more: a change the server has not taken did not
 * happen.
 */

/** Is this an ObjectId, i.e. a row the server would recognise? */
export const isRef = (value) => /^[a-f0-9]{24}$/i.test(String(value ?? ''))

/**
 * The server's ref for a row the operator chose by name.
 *
 * A brand-new draft carries `brand: 'Rehman Atelier'` — the panel's join key —
 * and no `brandId`, because there is nothing saved yet to have an id. The
 * server wants the ref, so the name is resolved against the list the panel
 * already holds. Without this a create drops the maison entirely and is
 * refused: `brand` is required on the server.
 */
const refForName = (rows, name) => {
  if (!name) return null
  const match = rows.find((row) => row.name === name)
  return isRef(match?.id) ? match.id : null
}

/**
 * The size a fragrance gets when the operator has not built a ladder yet.
 *
 * The server requires at least one volume before a fragrance is sellable, and
 * the form has no ladder editor, so the headline price becomes a single
 * default volume rather than the create failing outright.
 */
const DEFAULT_VOLUME_SIZE = '100ml'

/**
 * Map the panel's stock vocabulary onto the ledger's.
 *
 * The two lists were written independently and only two of the five overlap
 * (`Stock count correction`, `Atelier compounding`). The server's `STOCK_REASONS`
 * is the canonical one — it is the enum the ledger column stores, and the one
 * the order path also writes (`Order placed`, `Order cancelled`) — so the panel
 * translates into it rather than the enum growing a second word for every idea.
 *
 * The visible consequence, which is intended: after a refresh, a ledger row
 * reads `Stock received` where the panel's own menu said *Restock — supplier
 * delivery*. One word per movement is the point of the server owning the enum.
 */
const LEDGER_REASON = {
  'Restock — supplier delivery': 'Stock received',
  'Fresh Stock Blended': 'Stock received',
  'Damaged in transit': 'Damaged or expired',
  'Stock count correction': 'Stock count correction',
  'Cancelled order restocked': 'Return to stock',
  // A sample leaving the building is stock leaving the building; the ledger has
  // no finer word for it than the catch-all.
  'Sample dispatched': 'Manual adjustment',
  'Sample given': 'Manual adjustment',
}
const ledgerReason = (reason) => LEDGER_REASON[reason] ?? 'Manual adjustment'

/**
 * Shape a product record into the server's write body.
 *
 * Three translations, each of which is a real difference between the two
 * records rather than a rename:
 *
 *  - `brand`/`category` are **names** in the panel (the join key the screens
 *    use) and **refs** on the server. `adminProduct()` emits both, so the ref is
 *    read from `brandId`/`categoryId` and the write carries whichever is known —
 *    sending a name where a ref belongs is a 422, not a silent no-op.
 *  - `price`/`mrp` are the admin's *headline* figures; the server calls them
 *    `listPrice`/`listMrp` to keep them distinct from the storefront's per-volume
 *    prices.
 *  - **`stock` is deliberately absent.** The shelf moves only through
 *    `/inventory/adjust`, which writes the ledger row in the same transaction, so
 *    a product save that also carried `stock` would be a second way to move units
 *    without a movement record. `adjustStock` is the only door.
 *  - **`barcode` is deliberately absent too**, and for a different reason: it is
 *    not a field of the record that anyone edits, it is a function of `sku` that
 *    the server computes on save (see `barcodeOf` in `backend/src/models/
 *    Product.js`). Sending it would be asking the server to trust a client's
 *    label — the one value on the record that must never be able to disagree with
 *    the catalogue. It rides along on the *response* and is rendered from there.
 */
function productBody(record, { brands = [], categories = [] } = {}) {
  const body = {
    name: record.name,
    sku: record.sku,
    tier: record.tier,
    gender: record.gender,
    family: record.family,
    concentration: record.concentration,
    tagline: record.tagline,
    description: record.description,
    notes: record.notes,
    listPrice: record.price,
    listMrp: record.mrp,
    cost: record.cost,
    safeLimit: record.safeLimit,
    status: record.status,
    badges: record.badges,
    longevity: record.longevity,
    projection: record.projection,
    bestseller: record.bestseller,
    featured: record.featured,
    collections: record.collections,
    occasions: record.occasions,
    origin: record.origin,
  }

  // Only when there is a ladder to send: `volumes` is `.min(1)`, so an empty
  // array is rejected where omitting the key is not. A new fragrance has no
  // ladder yet, but the server will not store one without a volume, so the
  // headline price is sent as a single default volume instead of dropping the
  // key and having the whole create refused.
  if (Array.isArray(record.volumes) && record.volumes.length > 0) {
    const cleaned = record.volumes
      .map((entry) => ({
        size: String(entry.size ?? '').trim(),
        price: Number(entry.price),
        ...(Number(entry.mrp) > 0 ? { mrp: Number(entry.mrp) } : {}),
        label: String(entry.label ?? '').trim(),
      }))
      .filter((entry) => entry.size.length > 0 && !isNaN(entry.price) && entry.price >= 0)

    if (cleaned.length > 0) {
      body.volumes = cleaned
    }
  } else if (Number(record.price) > 0) {
    body.volumes = [
      {
        size: DEFAULT_VOLUME_SIZE,
        price: Number(record.price),
        ...(Number(record.mrp) > 0 ? { mrp: Number(record.mrp) } : {}),
        label: '',
      },
    ]
  }

  /*
   * Sent even when empty — the opposite of `volumes` above, and deliberately so.
   *
   * `images: []` is how the operator says "this fragrance has no photographs".
   * The schema takes it (`.max(12)`, no minimum), and it is the only way to clear
   * a gallery: a PATCH that omits the key leaves the stored array untouched, so
   * removing the last photograph in the editor would save, look correct, and find
   * the photograph back on the next load. `volumes` cannot be sent empty — it is
   * refused at `.min(1)` — which is why it is omitted instead.
   *
   * A record with no `images` key at all is left alone rather than emptied: a
   * bundled fixture, or a row loaded before photography existed, has nothing to
   * say about its gallery, and silence is not the same instruction as `[]`.
   */
  if (Array.isArray(record.images)) {
    body.images = record.images.map((image) => String(image?.id ?? image)).filter(Boolean)
  }

  // The ref when it is already known, else the one behind the name the operator
  // picked. A draft saved by the form carries only the name, and a missing ref
  // is a refused create rather than a fragrance with no maison.
  const brandRef = isRef(record.brandId) ? record.brandId : refForName(brands, record.brand)
  const categoryRef = isRef(record.categoryId) ? record.categoryId : refForName(categories, record.category)
  if (brandRef) body.brand = brandRef
  if (categoryRef) body.category = categoryRef
  return body
}

/** The panel's category record → the server's body. */
const categoryBody = (record) => ({
  name: record.name,
  description: record.description,
  status: record.status,
  shelf: record.shelf,
})

/** The panel's brand record → the server's body. */
const brandBody = (record) => ({
  name: record.name,
  house: record.house,
  country: record.country,
  status: record.status,
  since: record.since,
  logo: record.logo ?? '',
})

/** Unwrap an envelope, tolerating a bare array. */
const asList = (payload, key) => (Array.isArray(payload) ? payload : payload?.[key] ?? [])

export const adminApi = {
  /* ───────────────────────────────────────────────────────────── reads ──── */

  /**
   * Everything the panel's tables render, in one pass.
   *
   * Deliberately several requests rather than one: they are the endpoints the
   * panel already names, so nothing here needs a new server route, and a failure
   * in any one of them is a failure of the whole pull — a half-hydrated panel
   * (products from the server, categories not) would be worse than not
   * hydrating at all.
   */
  async pull() {
    const [catalogue, orders, customers, taxonomy, ledger, activity] = await Promise.all([
      api.get('/admin/products'),
      api.get('/admin/orders'),
      api.get('/admin/customers'),
      api.get('/admin/taxonomy'),
      api.get('/admin/inventory/ledger'),
      api.get('/admin/activity', { timeout: 6000 }).catch(() => null),
    ])

    return {
      products: asList(catalogue, 'products'),
      orders: asList(orders, 'orders'),
      customers: asList(customers, 'customers'),
      categories: asList(taxonomy?.categories, 'categories'),
      brands: asList(taxonomy?.brands, 'brands'),
      ledger: asList(ledger, 'ledger'),
      // The feed is an audit log the server writes itself. If the read failed,
      // there is nothing to show — the panel has no feed of its own any more.
      activity: activity ? asList(activity, 'activity') : [],
    }
  },

  /* ──────────────────────────────────────────────────────────── writes ──── */

  /**
   * `context` carries the panel's `brands`/`categories` so a draft that knows
   * its maison only by name can still be sent with the ref the server wants.
   */
  createProduct: (draft, context) =>
    api.mutate('/admin/products', { method: 'POST', body: productBody(draft, context) }),
  saveProduct: (record, draft, context) =>
    api.mutate(`/admin/products/${record.id}`, {
      method: 'PATCH',
      body: productBody({ ...record, ...draft }, context),
      retries: 1,
    }),
  setProductStatus: (id, status) =>
    api.mutate(`/admin/products/${id}/status`, { method: 'PATCH', body: { status }, retries: 1 }),
  /**
   * Take a fragrance out of the catalogue.
   *
   * `hard` asks for the record to be destroyed rather than archived, and the
   * server is the authority on whether that is permitted: an order line naming
   * the product answers **409**, because a receipt sold last year has to keep
   * resolving to the name and SKU it was sold against. Without `hard` the route
   * only ever sets the status to Archived.
   */
  deleteProduct: (id, { hard = false } = {}) =>
    api.mutate(`/admin/products/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' }),

  /**
   * Move the shelf through the ledger.
   *
   * Two ways of saying it, exactly one of which goes out: `change` is a
   * movement (`+24` received), `next` is a counted number ("there are
   * actually 20") and the server works out the difference itself. A counted
   * number is what the product form's "On hand" field and the adjust modal's
   * stock-take direction send.
   */
  adjustStock: ({ productId, change, next, reason, idempotencyKey }) =>
    api.mutate('/admin/inventory/adjust', {
      method: 'POST',
      body: {
        productId,
        ...(next !== undefined ? { next: Number(next) } : { delta: Number(change) || 0 }),
        reason: ledgerReason(reason),
        // A retried adjustment is the same adjustment. The server keeps a unique
        // index on this, so a double-submit moves stock once.
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    }),

  setOrderStatus: (id, status, payload = {}) => {
    const body = typeof payload === 'string' ? { status, note: payload } : { status, ...payload }
    return api.mutate(`/admin/orders/${id}/status`, { method: 'PATCH', body })
  },
  setOrderTracking: (id, tracking = {}) =>
    api.mutate(`/admin/orders/${id}/tracking`, { method: 'PATCH', body: tracking }),

  listRefundRequests: () => api.get('/admin/refund-requests'),
  completeRefundRequest: (orderNumber, referenceNote) =>
    api.mutate(`/admin/refund-requests/${orderNumber}/complete`, { method: 'POST', body: { referenceNote } }),
  rejectRefundRequest: (orderNumber, referenceNote) =>
    api.mutate(`/admin/refund-requests/${orderNumber}/reject`, { method: 'POST', body: { referenceNote } }),

  /**
   * How many units the counter keeps back from the website. Not a movement —
   * the shelf does not change — so it has its own route rather than riding on
   * `/inventory/adjust`.
   */
  setShopReserve: (productId, shopReserve) =>
    api.mutate('/admin/inventory/reserve', { method: 'PATCH', body: { productId, shopReserve: Number(shopReserve) || 0 } }),

  /* ──────────────────────────────────────────────────────────── media ──── */

  /**
   * What the server will accept, and where it puts it.
   *
   * `driver` is the part worth showing an operator: photographs live either on a
   * CDN or on this machine's disk, and those are very different facts about a
   * backup routine. Answers `null` when the server cannot be reached, because
   * these numbers only pre-check a file whose bytes have not travelled yet.
   */
  getUploadLimits: () => api.get('/admin/uploads/limits').catch(() => null),

  /**
   * Send photographs to storage and get their `media` rows back.
   *
   * This is the **one write in this file with no offline path**, and the reason
   * is not laziness. Everywhere else, `{live: false}` means the panel applied the
   * change itself and the server will catch up; that is honest because the panel
   * can hold a product, an order note, a price. It cannot hold a *file* — there
   * is no local place a photograph could go that the storefront could later load
   * it from, so a fallback could only fabricate a URL. A product pointing at a
   * fabricated URL is a broken image on the website, which is worse than an
   * error message in the panel. So uploads throw, and the drop zone shows it.
   *
   * `ownerType` is the server's own vocabulary (`product`, `review`,
   * `content`, `store`); the panel has no reason to invent a sixth word for it.
   *
   * @param {File[]|FileList} files
   * @param {{ownerType?: string, ownerId?: string, alt?: string}} [options]
   * @returns {Promise<Array<{id: string, url: string, alt: string, width: number|null, height: number|null}>>}
   */
  uploadMedia: async (files, { ownerType = 'product', ownerId = null, alt = '' } = {}) => {
    const list = Array.from(files ?? [])
    if (!list.length) return []

    const form = new FormData()
    // The field name the server's multer instance is configured for. Both sides
    // have to agree on it, and `files` is the plural route's own word.
    list.forEach((file) => form.append('files', file))
    form.append('ownerType', ownerType)
    // Only when there is something to attach to. A photograph taken before the
    // fragrance is saved has no owner yet, and the server reads an absent or
    // malformed ref as "not attached to anything", which is exactly right.
    if (isRef(ownerId)) form.append('ownerId', ownerId)
    if (alt) form.append('alt', alt)

    const payload = await api.upload('/admin/uploads/batch', form)
    return asList(payload, 'media')
  },

  /**
   * Remove an asset — for the little × on a thumbnail.
   *
   * Destroyed rather than merely detached: the media row and the bytes behind it
   * are one fact, and a row left behind with nothing pointing at it is how a
   * storage account fills with photographs no screen can show.
   */
  deleteMedia: (id) => api.mutate(`/admin/media/${id}`, { method: 'DELETE' }),

  /* ─────────────────────────────────────────────────────── shop counter ──── */

  /*
   * The counter has **no offline path**, unlike the rest of this file. A bill
   * sells real bottles against a shelf the website is selling from at the same
   * moment, so only the server can say whether they are there. `BillingPage`
   * runs these through `useServerAction`, which treats `{live: false}` as the
   * failure it is rather than ringing up a bill nobody recorded.
   */

  /** The sellable catalogue with live counts — the counter's product list. */
  listCounterProducts: async () => asList(await api.get('/admin/products?status=Active'), 'products'),
  /** All shop counter bills, newest first. Optional `from` ISO filter. */
  listShopBills: async (from) => {
    const params = new URLSearchParams({ channel: 'Shop', limit: '1000' })
    if (from) params.set('from', from)
    return asList(await api.get(`/admin/orders?${params.toString()}`), 'orders')
  },
  /** `{order, products, duplicate, loyalty}` — the bill, moved stock, and repeat benefit info. */
  createBill: (body) => api.mutate('/admin/pos/bills', { method: 'POST', body }),
  lookupCounterCustomer: ({ name = '', phone = '', email = '', customerId = '' } = {}) => {
    const params = new URLSearchParams()
    if (name.trim()) params.set('name', name.trim())
    if (phone.trim()) params.set('phone', phone.trim())
    if (email.trim()) params.set('email', email.trim())
    if (customerId) params.set('customerId', String(customerId))
    return api.get(`/admin/pos/customer-lookup?${params.toString()}`)
  },
  voidBill: (id, reason) => api.mutate(`/admin/pos/bills/${id}/void`, { method: 'POST', body: reason ? { reason } : {} }),

  /* ──────────────────────────────────────────── repeat customer analysis ──── */
  getRepeatCustomers: () => api.get('/admin/repeat-customers'),
  saveRepeatRules: (body) => api.mutate('/admin/repeat-customers/rules', { method: 'PATCH', body }),
  sendRepeatBenefit: (body) => api.mutate('/admin/repeat-customers/send-benefit', { method: 'POST', body }),
  sendBulkRepeatBenefit: (body) => api.mutate('/admin/repeat-customers/send-bulk-benefit', { method: 'POST', body }),
  getEmailLog: (id) => api.get(`/admin/repeat-customers/emails/${id}`),

  createCategory: (draft) => api.mutate('/admin/categories', { method: 'POST', body: categoryBody(draft) }),
  saveCategory: (record, draft) =>
    api.mutate(`/admin/categories/${record.id}`, { method: 'PATCH', body: categoryBody({ ...record, ...draft }) }),
  deleteCategory: (id) => api.mutate(`/admin/categories/${id}`, { method: 'DELETE' }),

  createBrand: (draft) => api.mutate('/admin/brands', { method: 'POST', body: brandBody(draft) }),
  saveBrand: (record, draft) =>
    api.mutate(`/admin/brands/${record.id}`, { method: 'PATCH', body: brandBody({ ...record, ...draft }) }),
  deleteBrand: (id) => api.mutate(`/admin/brands/${id}`, { method: 'DELETE' }),

  /**
   * Block or unblock a patron.
   *
   * `VIP` is a loyalty tier the server models (`CUSTOMER_STATUSES` in
   * `models/Customer.js` is the same three words the panel shows) but exposes no
   * route for — `block`/`unblock` are the only two writes, and
   * `PATCH /admin/customers/:id` does not accept `status` at all. `null` here
   * means "local only", which is the honest answer: the change is real in the
   * panel and the server will not have heard of it.
   */
  setCustomerStatus: (id, status) => {
    if (status === 'Blocked') return api.mutate(`/admin/customers/${id}/block`, { method: 'POST' })
    if (status === 'Active') return api.mutate(`/admin/customers/${id}/unblock`, { method: 'POST' })
    return null
  },

  setCustomerNote: (id, notes) =>
    api.mutate(`/admin/customers/${id}/notes`, { method: 'PATCH', body: { notes } }),

  /* ───────────────────────── sections that skip the store ──── */

  /*
   * Everything below belongs to a screen that renders straight from the server
   * rather than from `useAdminStore` — Offers, Reviews, Custom Orders, Analytics
   * and Settings.
   *
   * Two consequences, both deliberate.
   *
   * The reads are plain, strict `api.get`: there are no fixtures anywhere in the
   * panel to draw a plausible table from, so the chosen behaviour with the
   * backend down is to say so. The pages call them through `useServerResource`,
   * which is where the loading/error/retry shape lives.
   *
   * The writes are `api.mutate` like every other write here, so the server's own
   * refusal message survives to the toast — “that code already exists”, “a flat
   * discount cannot also have a cap”. Those sentences are the useful part.
   */

  /** The code is the coupon's identity and is immutable — see `coupons.update`. */
  listCoupons: async () => asList(await api.get('/admin/coupons'), 'coupons'),
  createCoupon: (draft) => api.mutate('/admin/coupons', { method: 'POST', body: couponBody(draft) }),
  saveCoupon: (id, draft) => api.mutate(`/admin/coupons/${id}`, { method: 'PATCH', body: couponBody(draft, { includeCode: false }) }),
  setCouponActive: (id, active) => api.mutate(`/admin/coupons/${id}/active`, { method: 'PATCH', body: { active } }),
  deleteCoupon: (id) => api.mutate(`/admin/coupons/${id}`, { method: 'DELETE' }),

  listReviews: async () => asList(await api.get('/admin/reviews'), 'reviews'),
  setReviewStatus: (id, status) => api.mutate(`/admin/reviews/${id}/status`, { method: 'PATCH', body: { status } }),
  deleteReview: (id) => api.mutate(`/admin/reviews/${id}`, { method: 'DELETE' }),

  /** `{pricing, store, content, showcase, loyalty, email}` — the blocks `GET /admin/settings` returns. */
  getSettings: () => api.get('/admin/settings'),
  savePricing: (draft) => api.mutate('/admin/settings/pricing', { method: 'PATCH', body: pricingBody(draft) }),
  saveStore: (draft) => api.mutate('/admin/settings/store', { method: 'PATCH', body: storeBody(draft) }),
  saveShowcase: (draft) => api.mutate('/admin/settings/showcase', { method: 'PATCH', body: showcaseBody(draft) }),
  saveEmailSettings: (draft) => api.mutate('/admin/settings/email', { method: 'PATCH', body: draft }),
  testEmailSettings: (to) => api.mutate('/admin/settings/email/test', { method: 'POST', body: { to } }),
  verifyBrevoSettings: () => api.get('/admin/settings/email/verify-brevo'),

  /**
   * The analytics screen's two reads.
   *
   * `summary` is the four headline tiles. `revenue` is deliberately **one**
   * request carrying the window's series and all three breakdowns
   * (`{series, topProducts, byCategory, byTier}`) — four round trips for one
   * screen would be four chances to render half a report.
   *
   * Neither is a list, so neither goes through `asList`; both hand the server's
   * object back verbatim, because `AnalyticsPage` reads its fields directly.
   * `days` is clamped to 1–365 on the server, which is the widest window the
   * page offers.
   */
  getAnalyticsSummary: () => api.get('/admin/analytics/summary'),
  getAnalyticsRevenue: (days = 30) => api.get(`/admin/analytics/revenue?days=${days}`),

  listStaff: async () => asList(await api.get('/admin/staff'), 'staff'),
  createStaff: (draft) =>
    api.mutate('/admin/staff', {
      method: 'POST',
      body: { name: draft.name, email: draft.email, password: draft.password, role: draft.role },
    }),
  /** No password here — the route does not accept one. A reset is a separate door. */
  saveStaff: (id, draft) => api.mutate(`/admin/staff/${id}`, { method: 'PATCH', body: { name: draft.name, role: draft.role } }),
  deleteStaff: (id) => api.mutate(`/admin/staff/${id}`, { method: 'DELETE' }),
}

/**
 * The `category` field arrives on `/admin/taxonomy` as **refs**, and the panel
 * has no category-name lookup for coupons, so the form sends back the ids it was
 * given and the storefront resolves them. An empty list means "any category",
 * which the server reads as no restriction at all.
 */
function couponBody(draft, { includeCode = true } = {}) {
  const body = {
    label: draft.label ?? '',
    headline: draft.headline ?? '',
    description: draft.description ?? '',
    terms: draft.terms ?? '',
    type: 'percent',
    value: Number(draft.value) || 0,
    minOrder: Number(draft.minOrder) || 0,
    // `null` is "no cap"; `0` would be a cap of zero, which no coupon means.
    cap: draft.cap === '' || draft.cap == null ? null : Number(draft.cap),
    active: draft.active !== false,
    // `''` coerces to an Invalid Date under `z.coerce.date()`, so an empty field
    // is sent as `null` — the server's own word for "no window".
    startsAt: draft.startsAt ? new Date(draft.startsAt) : null,
    endsAt: draft.endsAt ? new Date(draft.endsAt) : null,
    usageLimit: draft.usageLimit === '' || draft.usageLimit == null ? null : Number(draft.usageLimit),
    scope: {
      tiers: draft.tiers ?? [],
      excludeTiers: draft.excludeTiers ?? [],
      categories: draft.categories ?? [],
    },
  }
  if (includeCode) body.code = String(draft.code ?? '').trim().toUpperCase()
  return body
}

/**
 * Only the five numbers the server stores. `currency` is deliberately absent:
 * the shop prices in rupees and a free-text currency field is a way to make the
 * storefront and the order history disagree about what a number means.
 */
const pricingBody = (draft) => ({
  shippingFee: Number(draft.shippingFee) || 0,
  freeShippingOver: Number(draft.freeShippingOver) || 0,
  giftWrapFee: Number(draft.giftWrapFee) || 0,
  gstRate: Number(draft.gstRate) || 0,
  comboDiscountPercent: Number(draft.comboDiscountPercent) || 0,
})

/** The store identity block. Empty strings are kept — a blank phone is a choice. */
const storeBody = (draft) => ({
  name: draft.name ?? '',
  legalName: draft.legalName ?? '',
  tagline: draft.tagline ?? '',
  email: draft.email ?? '',
  phone: draft.phone ?? '',
  address: draft.address ?? '',
  city: draft.city ?? '',
  instagram: draft.instagram ?? '',
  hours: draft.hours ?? '',
})

/** Access toggles & manually curated homepage / offers product lists. */
const showcaseBody = (draft) => ({
  codEnabled: Boolean(draft.codEnabled),
  showBestsellers: Boolean(draft.showBestsellers),
  showHomeDeals: Boolean(draft.showHomeDeals),
  showOffersProducts: Boolean(draft.showOffersProducts),
  showCouponsSection: Boolean(draft.showCouponsSection),
  showMultiBottleOffers: Boolean(draft.showMultiBottleOffers),
  offerProductIds: Array.isArray(draft.offerProductIds) ? draft.offerProductIds.map(String) : [],
  bestsellerProductIds: Array.isArray(draft.bestsellerProductIds) ? draft.bestsellerProductIds.map(String) : [],
  homeDealProductIds: Array.isArray(draft.homeDealProductIds) ? draft.homeDealProductIds.map(String) : [],
})

export default adminApi
