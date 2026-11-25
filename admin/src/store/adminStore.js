import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { PRODUCT_STATUSES } from '@/data/products'
import { ORDER_FLOW } from '@/data/orders'
import { slugify } from '@/lib/format'
import { adminApi, isRef } from '@/services/adminApi'
import { useUiStore } from './uiStore'

/**
 * The admin's working copy of the shop.
 *
 * Every mutation the panel offers lives here and nowhere else, so a screen can
 * never invent its own way of changing a record. It persists to localStorage,
 * which is what makes the panel feel like a real back office across reloads.
 *
 * ## Where the rows come from
 *
 * The store is the panel's **render source** — no table reads the service. Every
 * slice starts **empty**; nothing is bundled. `hydrate()` fills them with the
 * server's rows, and `source` records whether that pull has answered, so the
 * shell can say "backend unreachable — the panel is empty" rather than implying
 * a fabricated row is live data.
 *
 * ## How a write lands
 *
 * Each action sends its change through `commit()`, which has three outcomes:
 *
 *  - **live** — the server took it. Its version of the record is applied, so the
 *    row picks up the server's id (an ObjectId) and stays addressable next time.
 *  - **not saved** — the server refused (4xx) or could not be reached. **Nothing
 *    is applied locally.** A panel and a database that each believe they own a
 *    record is worse than a write that visibly failed, and the panel is the one
 *    that would be wrong. The toast is the only outcome.
 *
 * Three rules, carried over from the storefront's stores:
 *
 *  1. **Never persist a function.** Actions are recreated on hydration; only
 *     plain data is written. Nothing in the persisted state holds a closure.
 *  2. **Money is computed, never stored.** An order's `amount` comes from the
 *     server; the totals the dashboard shows are derived from those rows in
 *     `lib/derive.js`. No total is typed twice.
 *  3. **Derived state is not state.** Low stock, revenue and best sellers are
 *     functions of the slices below — see `lib/derive.js`. Keeping them out of
 *     the store is what stops a saved payload going stale against the data.
 */

const PERSIST_KEY = 'rehman-admin-v1'

/** Monotonic suffix for records created at runtime. */
let createdSeq = 0
function runtimeId(prefix) {
  createdSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${createdSeq}`
}

/** Every slice starts empty — the server is the only thing that fills them. */
function seed() {
  return {
    products: [],
    orders: [],
    customers: [],
    categories: [],
    brands: [],
    ledger: [],
    activity: [],
  }
}

/** Feedback is raised from the store so every call site reports the same way. */
function notify(title, description = '', tone = 'success') {
  useUiStore.getState().pushToast({ title, description, tone })
}

/** Tracks in-flight mutations so rapid double-clicks cannot double-fire. */
const inFlight = new Set()

export const useAdminStore = create(
  persist(
    (set, get) => {
      /**
       * Send a write, and land it only if the server took it.
       *
       * `send` returns `api.mutate`'s `{live, data}` — with a strict gateway
       * that is `{live: true, data}` or a throw. It is `null` only when a
       * change has no route at all (there is none left for real rows: every
       * row on screen came from the server, so every row is addressable).
       *
       * `apply` receives the server's record and does the local work. It is
       * never reached when the server refused or was unreachable — the toast
       * is the whole outcome there.
       */
      const commit = async ({ send, apply, lockKey }) => {
        if (!send) return apply(null)
        if (lockKey) {
          if (inFlight.has(lockKey)) return null
          inFlight.add(lockKey)
        }

        let result
        try {
          result = await send()
        } catch (error) {
          // 4xx: the server is up and has refused. Unreachable: the server did
          // not take it. Neither is a save — see the header. The toast is the
          // only thing that moves.
          const unreachable = !error.status || error.status >= 500 || error.status === 408
          notify(
            unreachable ? 'Not saved — server unreachable' : 'Not saved',
            error.message || (unreachable ? 'The backend did not answer.' : 'The server refused that change.'),
            'error',
          )
          return null
        } finally {
          if (lockKey) inFlight.delete(lockKey)
        }

        set({ source: 'api' })
        return apply(result.data)
      }

      /**
       * Remove one server row, and report which of the two outcomes happened.
       *
       * A **hard delete is asked for first**, because that is what the operator
       * clicked. The server refuses one with **409** when an order line names the
       * product — a receipt has to keep resolving to the name it was sold under —
       * and only that refusal is answered by archiving instead, which takes the
       * fragrance off sale and out of the storefront while the history survives.
       *
       * Returning the outcome rather than narrating it keeps the single-row and
       * bulk paths telling one story from one place.
       */
      const removeRow = async (id) => {
        let refusal
        try {
          await adminApi.deleteProduct(id, { hard: true })
          return { outcome: 'deleted' }
        } catch (error) {
          // Anything that is not "an order names this" is a real failure: a
          // refusal to delete must never be reported as a success.
          if (error.status !== 409) return { outcome: 'failed', error }
          refusal = error
        }
        try {
          await adminApi.deleteProduct(id)
          return { outcome: 'archived', reason: refusal.message }
        } catch (error) {
          return { outcome: 'failed', error }
        }
      }

      return {
        ...seed(),

        /**
         * Where the rows on screen came from.
         *
         * `empty` until a pull succeeds, `api` once one has, `unavailable` when
         * the latest attempt could not reach the server. Not persisted, because
         * it describes *this* session's connection rather than anything about
         * the data, and a stored `api` would go on claiming the server was
         * answering long after it stopped.
         */
        source: 'empty',
        syncing: false,
        syncError: '',

        /* --- The server ---------------------------------------------------- */

        /**
         * Replace every slice with the server's.
         *
         * All-or-nothing on purpose. Products from the server beside categories
         * from a stale local store is a panel that is wrong in a way nobody can
         * see, so a partial pull would be worse than a failed one — a failure
         * leaves the whole panel empty and labelled unreachable, which is the
         * truth.
         *
         * This is also what rescues a session that began offline: the persisted
         * store may hold rows from before an outage, and the first successful
         * pull replaces them wholesale with the rows the server can address.
         */
        hydrate: async () => {
          set({ syncing: true, syncError: '' })
          try {
            const slices = await adminApi.pull()
            set({ ...slices, source: 'api', syncing: false, syncError: '' })
            return true
          } catch (error) {
            set({ source: 'unavailable', syncing: false, syncError: error.message || 'Unreachable' })
            return false
          }
        },

        /* --- Activity ------------------------------------------------------ */

        /**
         * Prepend an event to the dashboard feed.
         *
         * Local only, and deliberately so: the feed is an **audit log the server
         * writes itself** as a side effect of every one of these mutations. A
         * client that also posted its own sentence would double every entry. The
         * feed refreshes with `hydrate()`, which is the one place the panel learns
         * what the server recorded.
         */
        logActivity: ({ actor = 'Superadmin', tone = 'order', text, target = '' }) => {
          set((state) => ({
            activity: [
              { id: runtimeId('act'), at: new Date().toISOString(), actor, tone, text, target },
              ...state.activity,
            ].slice(0, 40),
          }))
        },

        /* --- Products ------------------------------------------------------ */

        /**
         * Create or update a fragrance. A record without an `id` is new: it gets
         * an id and the next free SKU for its tier, so two products can never
         * share one.
         */
        upsertProduct: (draft) => {
          const { products } = get()
          const existing = draft.id ? products.find((p) => p.id === draft.id) : null

          /**
           * The panel joins products to their brand and category by *name*, but
           * the server stores refs. Both lists go along so the write layer can
           * resolve a draft that has never been saved and so carries no id.
           */
          const taxonomy = { brands: get().brands, categories: get().categories }

          /*
           * The form's "On hand" is a count, and counts move through the ledger.
           *
           * `productBody` deliberately never sends `stock`, so a save that only
           * patched the record would drop the typed number on the floor: 20
           * entered, 0 stored, 0 back on the next pull — the field would be a
           * lie. So when the count differs from the shelf the server just
           * returned, the difference is posted behind the save as a stock-take
           * correction, which is exactly what the ledger calls "there are
           * actually 20". Equal counts send nothing: the server refuses a
           * movement of zero, and there would be nothing to record anyway.
           */
          const wanted = Number(draft.stock)
          const counted = Number.isInteger(wanted) && wanted >= 0 ? wanted : null

          const saveThenCount = async () => {
            const result = existing
              ? await adminApi.saveProduct(existing, draft, taxonomy)
              : await adminApi.createProduct(draft, taxonomy)
            /*
             * Every `adminApi` write resolves `mutate`'s `{live, data}` envelope,
             * and the record is *inside* `data`. Reading `result.product` straight
             * off the wrapper is `undefined`, which made the count below look like
             * a save that needed no correction: the typed number was dropped and
             * the shelf stayed where it was. `commit` unwraps the envelope for
             * `apply`, so the wrapper is what this returns.
             */
            const payload = result?.data ?? result
            const saved = payload?.product ?? null
            if (counted === null || !saved?.id || !isRef(saved.id) || Number(saved.stock) === counted) {
              return result
            }
            return adminApi.adjustStock({
              productId: saved.id,
              next: counted,
              reason: 'Stock count correction',
              idempotencyKey: `count:${saved.id}:${Number(saved.stock) || 0}:${counted}`,
            })
          }

          return commit({
            lockKey: existing ? `product:${existing.id}` : `product:new:${slugify(draft.name ?? '')}`,
            send: existing
              ? // A fixture row's id is not an ObjectId, so there is nothing on
                // the server to patch. Create-if-new is always worth asking.
                isRef(existing.id)
                ? saveThenCount
                : null
              : saveThenCount,
            apply: (payload) => {
              const saved = payload?.product ?? null
              const movement = payload?.movement ?? null

              // The server's row wins outright when it answered, because its id
              // is the one that will resolve next time. Merging into the local
              // row instead would keep the old id and break the *next* write.
              if (saved) {
                set((state) => ({
                  products: state.products.some((p) => p.id === existing?.id)
                    ? state.products.map((p) => (p.id === existing.id ? { ...p, ...saved } : p))
                    : [saved, ...state.products],
                  // A count correction rode along with the save; the ledger
                  // screen has to show the movement that moved the shelf.
                  ...(movement
                    ? {
                        ledger: [
                          {
                            id: movement.id,
                            at: movement.at,
                            name: movement.product,
                            sku: movement.sku,
                            previous: movement.previous,
                            change: movement.change,
                            next: movement.next,
                            reason: movement.reason,
                            by: 'Superadmin',
                          },
                          ...state.ledger,
                        ],
                      }
                    : {}),
                }))
                get().logActivity({
                  tone: 'price',
                  text: `${existing ? 'updated' : 'added'} ${saved.name}`,
                  target: saved.sku,
                })
                notify(existing ? 'Fragrance updated' : 'Fragrance added', `${saved.name} saved.`)
                return saved.id
              }

              if (existing) {
                set({
                  products: products.map((p) => (p.id === existing.id ? { ...p, ...draft } : p)),
                })
                get().logActivity({ tone: 'price', text: `updated ${draft.name ?? existing.name}`, target: existing.sku })
                notify('Fragrance updated', `${draft.name ?? existing.name} saved.`)
                return existing.id
              }

              // No server row came back and there was nothing already saved to
              // edit. A create the server did not return is a create that did not
              // happen — the panel says so rather than inventing a draft to show.
              // (Reached only in the degenerate case where the response carried no
              // product; an unreachable server never calls `apply` at all.)
              notify('Not saved', 'The server did not return the new fragrance.', 'error')
              return null
            },
          })
        },

        /** Copy a fragrance as a fresh draft — the fastest way to a variant. */
        duplicateProduct: (id) => {
          const source = get().products.find((p) => p.id === id)
          if (!source) return null

          // A copy is a **new** record, so it is a create and never a patch —
          // and the server assigns its own slug and SKU when it answers.
          const draft = {
            ...source,
            name: `${source.name} (Copy)`,
            status: 'Draft',
            salesYtd: 0,
            reviews: 0,
          }
          delete draft.id

          return commit({
            lockKey: `dup:${id}`,
            send: () => adminApi.createProduct(draft, { brands: get().brands, categories: get().categories }),
            apply: (payload) => {
              const saved = payload?.product ?? null
              // The server assigns the copy its **own** slug, SKU and barcode, so
              // the duplicate is exactly what it returned and never a local
              // re-derivation — two bottles wearing one label is the failure this
              // path exists to prevent, and no response means no copy.
              if (!saved) {
                notify('Not saved', 'The server did not duplicate the fragrance.', 'error')
                return null
              }

              set((state) => ({ products: [saved, ...state.products] }))
              get().logActivity({
                tone: 'price',
                text: `duplicated ${source.name} as a draft`,
                target: saved.sku,
              })
              notify('Duplicated', `${source.name} copied — it is a draft until you publish it.`)
              return saved.id
            },
          })
        },

        setProductStatus: (id, status) => {
          const product = get().products.find((p) => p.id === id)
          if (!product) return

          return commit({
            lockKey: `productStatus:${id}`,
            send: isRef(id) ? () => adminApi.setProductStatus(id, status) : null,
            apply: (payload) => {
              const saved = payload?.product ?? null
              set((state) => ({
                products: state.products.map((p) => (p.id === id ? { ...p, ...(saved ?? { status }) } : p)),
              }))
              get().logActivity({ tone: 'price', text: `moved ${product.name} to ${status}`, target: product.sku })
              notify('Status changed', `${product.name} is now ${status}.`)
            },
          })
        },

        /**
         * Apply one status to many rows — the bulk bar's only write.
         *
         * Sequential rather than `Promise.all`: there is no bulk route, and forty
         * parallel PATCHes against one process is a burst the server does not need
         * to absorb. One refusal does not abandon the rest — the panel should not
         * half-apply a bulk action and stop silently — so each row is tracked and
         * the loop continues.
         */
        setProductsStatus: async (ids, status) => {
          const target = new Set(ids)
          const rows = get().products.filter((p) => target.has(p.id))

          // Every row the server never heard of, and every row it accepted. Only
          // the refusals are left out, and they are named in the toast.
          const settled = new Set(rows.filter((p) => !isRef(p.id)).map((p) => p.id))
          const addressable = rows.filter((p) => isRef(p.id))
          let refused = 0

          for (const row of addressable) {
            try {
              await adminApi.setProductStatus(row.id, status)
              settled.add(row.id)
            } catch {
              refused += 1
            }
          }

          set((state) => ({
            products: state.products.map((p) => (settled.has(p.id) ? { ...p, status } : p)),
          }))

          if (refused) {
            notify(
              'Bulk update incomplete',
              `${settled.size} of ${rows.length} saved — the server refused ${refused}.`,
              'error',
            )
            return
          }
          get().logActivity({ tone: 'price', text: `moved ${rows.length} fragrances to ${status}`, target: `${rows.length} SKUs` })
          notify('Bulk update applied', `${rows.length} fragrances set to ${status}.`)
        },

        /**
         * Delete one fragrance.
         *
         * The row leaves the table only when the server has actually destroyed
         * it. Where an order line keeps it alive, it stays listed and visibly
         * re-labelled Archived, with the server's own sentence explaining why —
         * a row that vanished and then reappeared on the next pull is precisely
         * what makes a panel untrustworthy.
         */
        deleteProduct: async (id) => {
          const product = get().products.find((p) => p.id === id)
          if (!product) return

          // A row the server never heard of has nowhere to be deleted from; it
          // only has to leave the screen.
          if (!isRef(id)) {
            set((state) => ({ products: state.products.filter((p) => p.id !== id) }))
            notify('Fragrance removed', `${product.name} deleted.`, 'error')
            return
          }

          const lockKey = `deleteProduct:${id}`
          if (inFlight.has(lockKey)) return
          inFlight.add(lockKey)
          let result
          try {
            result = await removeRow(id)
          } finally {
            inFlight.delete(lockKey)
          }

          if (result.outcome === 'failed') {
            const unreachable = !result.error.status || result.error.status >= 500 || result.error.status === 408
            notify(
              unreachable ? 'Not deleted — server unreachable' : 'Not deleted',
              result.error.message || 'The server refused that change.',
              'error',
            )
            return
          }

          if (result.outcome === 'archived') {
            set((state) => ({
              products: state.products.map((p) => (p.id === id ? { ...p, status: 'Archived' } : p)),
            }))
            get().logActivity({ tone: 'alert', text: `archived ${product.name}`, target: product.sku })
            notify('Archived instead of deleted', result.reason, 'error')
            return
          }

          set((state) => ({ products: state.products.filter((p) => p.id !== id) }))
          get().logActivity({ tone: 'alert', text: `removed ${product.name} from the catalogue`, target: product.sku })
          notify('Perfume deleted', `${product.name} is removed; stock history still keeps its old entries.`, 'error')
        },

        /** The bulk bar's destructive half — same loop, same reasoning. */
        deleteProducts: async (ids) => {
          const target = new Set(ids)
          const rows = get().products.filter((p) => target.has(p.id))

          // Local-only rows are gone as soon as they leave the screen; the rest
          // are sorted by what the server agreed to.
          const deleted = new Set(rows.filter((p) => !isRef(p.id)).map((p) => p.id))
          const archived = new Set()
          let refused = 0

          for (const row of rows.filter((p) => isRef(p.id))) {
            const result = await removeRow(row.id)
            if (result.outcome === 'deleted') deleted.add(row.id)
            else if (result.outcome === 'archived') archived.add(row.id)
            else refused += 1
          }

          set((state) => ({
            products: state.products
              .filter((p) => !deleted.has(p.id))
              .map((p) => (archived.has(p.id) ? { ...p, status: 'Archived' } : p)),
          }))

          const parts = [
            deleted.size ? `${deleted.size} deleted` : '',
            archived.size ? `${archived.size} archived (named on an order)` : '',
            refused ? `${refused} refused` : '',
          ].filter(Boolean)

          if (refused || archived.size) {
            get().logActivity({ tone: 'alert', text: `removed ${deleted.size} of ${rows.length} fragrances`, target: `${rows.length} SKUs` })
            notify('Removal finished', `${parts.join(', ')} — the table shows what is left.`, 'error')
            return
          }
          get().logActivity({ tone: 'alert', text: `removed ${rows.length} fragrances`, target: `${rows.length} SKUs` })
          notify('Fragrances deleted', `${deleted.size} records removed.`, 'error')
        },

        /* --- Stock --------------------------------------------------------- */

        /**
         * Move stock and write the ledger row in one action. The two can never
         * disagree because nothing else is allowed to touch `product.stock`.
         *
         * The server does the same thing in one transaction, so when it answers
         * it is the authority on both figures — `movement` is the ledger row it
         * wrote, and the shelf comes back with the product.
         */
        adjustStock: ({ productId, change, next: countedNext, reason, by = 'Superadmin' }) => {
          const product = get().products.find((p) => p.id === productId)
          if (!product) return

          const previous = product.stock
          // A counted number ("there are actually 20") is the difference from
          // what is on the shelf; a delta is already the difference.
          const delta =
            countedNext !== undefined ? Math.max(0, Number(countedNext) || 0) - previous : Number(change) || 0
          const next = Math.max(0, previous + delta)

          return commit({
            send: isRef(productId)
              ? () =>
                  adminApi.adjustStock({
                    productId,
                    ...(countedNext !== undefined ? { next: countedNext } : { change: delta }),
                    reason,
                    // Two identical clicks are one adjustment. Derived from what
                    // is being changed rather than generated, so a retry of the
                    // same form carries the same key and the server discards it.
                    idempotencyKey: `admin:${productId}:${previous}:${delta}:${reason}`,
                  })
              : null,
            apply: (payload) => {
              const saved = payload?.product ?? null
              const movement = payload?.movement ?? null

              set((state) => ({
                products: state.products.map((p) =>
                  p.id === productId ? { ...p, ...(saved ?? { stock: next }) } : p,
                ),
                ledger: [
                  movement
                    ? {
                        id: movement.id,
                        at: movement.at,
                        name: movement.product,
                        sku: movement.sku,
                        previous: movement.previous,
                        change: movement.change,
                        next: movement.next,
                        reason: movement.reason,
                        by,
                      }
                    : {
                        id: runtimeId('led'),
                        at: new Date().toISOString(),
                        name: product.name,
                        sku: product.sku,
                        previous,
                        change: next - previous,
                        next,
                        reason,
                        by,
                      },
                  ...state.ledger,
                ],
              }))

              const landed = saved?.stock ?? next
              get().logActivity({
                tone: 'stock',
                actor: by,
                text: `${delta >= 0 ? 'added' : 'drew down'} ${Math.abs(landed - previous)} units of ${product.name}`,
                target: product.sku,
              })
              notify(
                'Stock adjusted',
                `${product.name}: ${previous} → ${landed} units${reason ? ` (${reason})` : ''}.`,
              )
              return landed
            },
          })
        },

        /**
         * Set how many units the shop counter keeps back from the website.
         *
         * The shelf does not move, so there is no ledger row — only the line
         * between what the counter may sell (`stock`) and what a shopper is
         * offered (`onlineStock`) shifts. Offline it is applied locally like any
         * other write here, with `onlineStock` worked out the way the server
         * works it out.
         */
        setShopReserve: (productId, shopReserve) => {
          const product = get().products.find((p) => p.id === productId)
          if (!product) return
          const reserve = Math.max(0, Math.floor(Number(shopReserve) || 0))

          return commit({
            send: isRef(productId) ? () => adminApi.setShopReserve(productId, reserve) : null,
            apply: (payload) => {
              const saved = payload?.product ?? null
              const local = { shopReserve: reserve, onlineStock: Math.max(0, product.stock - reserve) }
              set((state) => ({
                products: state.products.map((p) => (p.id === productId ? { ...p, ...(saved ?? local) } : p)),
              }))
              const online = saved?.onlineStock ?? local.onlineStock
              get().logActivity({
                tone: 'stock',
                text: `kept ${reserve} units of ${product.name} for the shop`,
                target: product.sku,
              })
              notify('Shop stock saved', `${product.name}: shop sees ${product.stock}, website sees ${online}.`)
              return reserve
            },
          })
        },

        /**
         * Land what the server says about some fragrances — fresh counts from the
         * counter's poll, or the products a bill just moved.
         *
         * Only rows the store already holds are touched, and each is merged
         * rather than replaced, so a partial record never wipes fields the panel
         * filled from the full catalogue.
         */
        landProducts: (rows = []) => {
          if (!rows.length) return
          const byId = new Map(rows.map((row) => [row.id, row]))
          set((state) => ({
            source: 'api',
            products: state.products.map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id) } : p)),
          }))
        },

        /**
         * Land a counter bill (or a voided one) in the order book, so the Orders
         * screen, the dashboard and the sidebar count it without a full pull.
         * The server wrote the activity entry itself; `hydrate()` brings it in.
         */
        landOrder: (order) => {
          if (!order?.id) return
          set((state) => ({
            orders: state.orders.some((o) => o.id === order.id)
              ? state.orders.map((o) => (o.id === order.id ? { ...o, ...order } : o))
              : [order, ...state.orders],
          }))
        },

        /* --- Orders -------------------------------------------------------- */

        /**
         * `id` is the order **number** (`RP2041`) in both worlds — the fixtures
         * use it and `adminOrder()` emits it — so unlike products there is no
         * addressing gap and nothing to guard.
         *
         * The server refuses illegal jumps with a 409 (`Delivered → Pending`), and
         * that refusal is the point of moving this call server-side: it also
         * returns the stock when an order is cancelled, in the same transaction.
         */
        updateOrderStatus: (id, status, extra = {}) => {
          const order = get().orders.find((o) => o.id === id)
          if (!order) return

          const payload = typeof extra === 'string' ? { note: extra } : (extra ?? {})

          return commit({
            lockKey: `order:${id}`,
            send: () => adminApi.setOrderStatus(id, status, payload),
            apply: (res) => {
              const saved = res?.order ?? null
              const courier = payload.courier || saved?.courier || order.courier || ''
              const awb = payload.awb || saved?.awb || order.awb || ''
              set((state) => ({
                orders: state.orders.map((o) =>
                  o.id === id
                    ? {
                        ...o,
                        ...(saved ?? {
                          status,
                          courier,
                          awb,
                          trackingId: awb || o.trackingId,
                          tracking: { ...(o.tracking ?? {}), courier, awb },
                        }),
                      }
                    : o,
                ),
              }))
              get().logActivity({
                tone: status === 'Cancelled' ? 'alert' : 'order',
                text: `marked order ${id} as ${status.toLowerCase()}${courier ? ` via ${courier} (${awb})` : ''}`,
                target: id,
              })
              notify('Order updated', `${id} is now ${status}.${courier ? ` (${courier} - ${awb})` : ''}`)
            },
          })
        },

        /** Mark an order as Shipped with courier service and reference / AWB number. */
        shipOrder: (id, { courier, awb, transitNote, expectedDelivery } = {}) => {
          return get().updateOrderStatus(id, 'Shipped', { courier, awb, transitNote, expectedDelivery })
        },

        /** Update tracking details for an existing order. */
        updateOrderTracking: (id, tracking = {}) => {
          const order = get().orders.find((o) => o.id === id)
          if (!order) return

          return commit({
            lockKey: `order:tracking:${id}`,
            send: () => adminApi.setOrderTracking(id, tracking),
            apply: (res) => {
              const saved = res?.order ?? null
              const courier = tracking.courier ?? saved?.courier ?? order.courier ?? ''
              const awb = tracking.awb ?? saved?.awb ?? order.awb ?? ''
              set((state) => ({
                orders: state.orders.map((o) =>
                  o.id === id
                    ? {
                        ...o,
                        ...(saved ?? {
                          courier,
                          awb,
                          trackingId: awb || o.trackingId,
                          tracking: { ...(o.tracking ?? {}), ...tracking, courier, awb },
                        }),
                      }
                    : o,
                ),
              }))
              notify('Tracking saved', `Order ${id} tracking updated (${courier} - ${awb}).`)
            },
          })
        },

        /** Advance one step along the fulfilment path. Terminal states hold. */
        advanceOrder: (id) => {
          const order = get().orders.find((o) => o.id === id)
          if (!order) return
          const index = ORDER_FLOW.indexOf(order.status)
          if (index === -1 || index === ORDER_FLOW.length - 1) return
          return get().updateOrderStatus(id, ORDER_FLOW[index + 1])
        },

        /* --- Categories & brands ------------------------------------------- */

        upsertCategory: (draft) => {
          const { categories, products } = get()
          const existing = draft.id ? categories.find((c) => c.id === draft.id) : null

          return commit({
            lockKey: existing ? `category:${existing.id}` : `category:new:${slugify(draft.name ?? '')}`,
            send: existing
              ? isRef(existing.id)
                ? () => adminApi.saveCategory(existing, draft)
                : null
              : () => adminApi.createCategory(draft),
            apply: (payload) => {
              const saved = payload?.category ?? null

              if (saved) {
                set((state) => ({
                  categories: state.categories.some((c) => c.id === existing?.id)
                    ? state.categories.map((c) => (c.id === existing.id ? { ...c, ...saved } : c))
                    : [...state.categories, { ...saved, shelf: state.categories.length + 1 }],
                  // Renaming still re-points the shelf's fragrances. With refs on
                  // the server this is a display concern only, but the panel's
                  // tables join on the name, so they have to follow it.
                  products:
                    existing && saved.name && saved.name !== existing.name
                      ? state.products.map((p) =>
                          p.category === existing.name ? { ...p, category: saved.name } : p,
                        )
                      : state.products,
                }))
                notify('Category updated', `${saved.name} saved.`)
                return saved.id
              }

              if (existing) {
                const renamed = draft.name && draft.name !== existing.name
                set({
                  categories: categories.map((c) =>
                    c.id === existing.id ? { ...c, ...draft, slug: renamed ? slugify(draft.name) : c.slug } : c,
                  ),
                  products: renamed
                    ? products.map((p) => (p.category === existing.name ? { ...p, category: draft.name } : p))
                    : products,
                })
                notify('Category updated', `${draft.name ?? existing.name} saved.`)
                return existing.id
              }

              // No server row and nothing already saved to edit: the create did
              // not land, so no category is invented locally.
              notify('Not saved', 'The server did not return the new category.', 'error')
              return null
            },
          })
        },

        /**
         * Delete a shelf.
         *
         * The server refuses with a 409 while anything still sits on it, so the
         * local `inUse` test is now a courtesy — it answers instantly and saves a
         * round trip, but the server is what makes the rule true. Kept because
         * offline it is the *only* thing enforcing it.
         */
        deleteCategory: (id) => {
          const category = get().categories.find((c) => c.id === id)
          const inUse = get().products.filter((p) => p.category === category?.name).length
          if (inUse > 0) {
            notify('Cannot delete', `${category.name} still holds ${inUse} fragrances.`, 'error')
            return false
          }

          return commit({
            lockKey: `deleteCategory:${id}`,
            send: isRef(id) ? () => adminApi.deleteCategory(id) : null,
            apply: () => {
              set((state) => ({ categories: state.categories.filter((c) => c.id !== id) }))
              notify('Category removed', `${category?.name ?? 'Category'} deleted.`, 'error')
              return true
            },
          })
        },

        upsertBrand: (draft) => {
          const { brands, products } = get()
          const existing = draft.id ? brands.find((b) => b.id === draft.id) : null

          return commit({
            lockKey: existing ? `brand:${existing.id}` : `brand:new:${slugify(draft.name ?? '')}`,
            send: existing
              ? isRef(existing.id)
                ? () => adminApi.saveBrand(existing, draft)
                : null
              : () => adminApi.createBrand(draft),
            apply: (payload) => {
              const saved = payload?.brand ?? null

              if (saved) {
                set((state) => ({
                  brands: state.brands.some((b) => b.id === existing?.id)
                    ? state.brands.map((b) => (b.id === existing.id ? { ...b, ...saved } : b))
                    : [...state.brands, saved],
                  products:
                    existing && saved.name && saved.name !== existing.name
                      ? state.products.map((p) => (p.brand === existing.name ? { ...p, brand: saved.name } : p))
                      : state.products,
                }))
                notify('Brand saved', `${saved.name} saved.`)
                return saved.id
              }

              if (existing) {
                const renamed = draft.name && draft.name !== existing.name
                set({
                  brands: brands.map((b) =>
                    b.id === existing.id ? { ...b, ...draft, slug: renamed ? slugify(draft.name) : b.slug } : b,
                  ),
                  products: renamed
                    ? products.map((p) => (p.brand === existing.name ? { ...p, brand: draft.name } : p))
                    : products,
                })
                notify('Brand saved', `${draft.name ?? existing.name} saved.`)
                return existing.id
              }

              // No server row and nothing already saved to edit: the create did
              // not land, so no brand is invented locally.
              notify('Not saved', 'The server did not return the new brand.', 'error')
              return null
            },
          })
        },

        deleteBrand: (id) => {
          const brand = get().brands.find((b) => b.id === id)
          const inUse = get().products.filter((p) => p.brand === brand?.name).length
          if (inUse > 0) {
            notify('Cannot delete', `${brand.name} still holds ${inUse} fragrances.`, 'error')
            return false
          }

          return commit({
            lockKey: `deleteBrand:${id}`,
            send: isRef(id) ? () => adminApi.deleteBrand(id) : null,
            apply: () => {
              set((state) => ({ brands: state.brands.filter((b) => b.id !== id) }))
              notify('Brand removed', `${brand?.name ?? 'Brand'} deleted.`, 'error')
              return true
            },
          })
        },

        /* --- Customers ----------------------------------------------------- */

        setCustomerStatus: (id, status) => {
          const customer = get().customers.find((c) => c.id === id)
          if (!customer) return

          // `setCustomerStatus` answers `null` for `VIP`, which the server models
          // but exposes no route for. `commit` treats that as local-only, so the
          // badge moves in the panel and the next `hydrate()` puts it back —
          // which is the truthful outcome, and better than a silent 4xx.
          return commit({
            send: isRef(id) ? () => adminApi.setCustomerStatus(id, status) : null,
            apply: (payload) => {
              const saved = payload?.customer ?? null
              set((state) => ({
                customers: state.customers.map((c) =>
                  c.id === id ? { ...c, ...(saved ?? { status }) } : c,
                ),
              }))
              get().logActivity({
                tone: 'customer',
                text: `${status === 'Blocked' ? 'blocked' : 'reinstated'} ${customer.name}`,
                target: customer.id,
              })
              notify(status === 'Blocked' ? 'Customer blocked' : 'Customer reinstated', customer.name)
            },
          })
        },

        /** Staff-only, and the server's route is the same one field. */
        setCustomerNote: (id, notes) =>
          commit({
            send: isRef(id) ? () => adminApi.setCustomerNote(id, notes) : null,
            apply: (payload) => {
              const saved = payload?.customer ?? null
              set((state) => ({
                customers: state.customers.map((c) => (c.id === id ? { ...c, ...(saved ?? { notes }) } : c)),
              }))
              notify('Note saved', 'The note is visible to staff only.')
            },
          }),
      }
    },
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => sessionStorage),
      // v2: the panel no longer ships fixtures. Any v1 store still holding
      // seeded rows is discarded outright on rehydrate rather than rendered.
      version: 2,
      migrate: () => seed(),
      // Only the data is written. Actions are recreated on load, so a persisted
      // closure can never be restored as a stale reference. `source`, `syncing`
      // and `syncError` describe this session's connection, not the data, so
      // they are deliberately left out.
      partialize: (state) => ({
        products: state.products,
        orders: state.orders,
        customers: state.customers,
        categories: state.categories,
        brands: state.brands,
        ledger: state.ledger,
        activity: state.activity,
      }),
    },
  ),
)

/** Statuses a filter can offer, in the order the UI shows them. */
export const PRODUCT_STATUS_FILTERS = ['All', ...PRODUCT_STATUSES]

export default useAdminStore
