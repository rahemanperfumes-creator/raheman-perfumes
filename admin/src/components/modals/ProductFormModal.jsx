import { useEffect, useMemo, useRef, useState } from 'react'
import cn from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea, Checkbox, FieldGroup } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { Barcode, encodeBars } from '@/components/ui/Barcode'
import { TierBadge } from '@/components/ui/Badge'
import { ImageUploader } from '@/components/media/ImageUploader'
import {
  PRODUCT_STATUSES,
  PRODUCT_BADGES,
  PRODUCT_COLLECTIONS,
  COLLECTION_SLUGS,
  COLLECTION_LABELS,
  OCCASIONS,
  OCCASION_IDS,
  LONGEVITY_BANDS,
  PROJECTION_BANDS,
  TIER_CODE,
  suggestedCost,
} from '@/data/products'
import { downloadBarcodePng } from '@/lib/barcodePng'
import { marginPercent, formatPrice } from '@/lib/format'
import { useAdminStore } from '@/store/adminStore'
import { useUiStore } from '@/store/uiStore'

const TIERS = Object.keys(TIER_CODE)
const GENDERS = ['Unisex', 'Men', 'Women']
const CONCENTRATIONS = ['Eau de Parfum', 'Eau de Parfum Intense', 'Eau de Toilette', 'Extrait de Parfum', 'Pure Attar', 'Bakhoor Incense']

const VOLUME_PRESETS = [
  { size: '100ml', label: 'Full Bottle' },
  { size: '50ml', label: 'Standard' },
  { size: '30ml', label: 'Travel Size' },
  { size: '10ml', label: 'Testing Pack' },
]

/**
 * A blank record, so "new" and "edit" run through exactly the same form.
 *
 * The copy fields at the end of the list are the ones the storefront's product
 * page renders and the panel used to have no field for at all: `tagline`,
 * `description`, the note pyramid, the wear bands and the merchandising flags.
 * Without them a fragrance could be created and priced but never *described*,
 * so the product page fell back to its own placeholder text — which is what
 * "the admin cannot provide what the frontend needs" looked like from outside.
 */
function blankProduct() {
  return {
    name: '',
    // Maison and shelf start empty on purpose. They were once pre-filled with
    // demo names from the old fixtures, which a young catalogue does not have —
    // and an unresolvable default fails the server's brand/category requirement.
    brand: '',
    tier: 'Inspired',
    category: '',
    family: '',
    gender: 'Unisex',
    concentration: 'Eau de Parfum',
    price: '',
    mrp: '',
    cost: '',
    volumes: [
      { size: '100ml', price: '', mrp: '', label: 'Full Bottle' },
    ],
    stock: 0,
    safeLimit: 15,
    status: 'Draft',
    // ── what the website renders ──────────────────────────────────────────
    tagline: '',
    description: '',
    notes: { top: [], heart: [], base: [] },
    longevity: '',
    projection: '',
    badges: [],
    bestseller: false,
    featured: false,
    collections: [],
    occasions: [],
    images: [],
  }
}

/**
 * A comma-separated list, held as text while it is being typed.
 *
 * The draft stores notes as arrays (that is what the server and the storefront
 * both read), but binding an input straight to `.join(', ')` and re-splitting on
 * every keystroke makes the field impossible to type in: the moment a space or a
 * trailing comma is entered it is trimmed straight back off. So the *text* lives
 * in local state and the parsed array is what flows up — the operator sees the
 * characters they typed, and the draft stays the right shape.
 *
 * Reset by `key` when the modal is pointed at a different fragrance.
 */
function ListInput({ label, value = [], onChange, hint, placeholder, required, error }) {
  const [text, setText] = useState(() => value.join(', '))

  return (
    <Input
      label={label}
      value={text}
      hint={hint}
      placeholder={placeholder}
      required={required}
      error={error}
      onChange={(event) => {
        setText(event.target.value)
        onChange(
          event.target.value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
        )
      }}
    />
  )
}

/** Toggle a value in an array held on the draft. */
const toggle = (list, value) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value])

/**
 * A set of on/off chips drawn from a fixed vocabulary.
 *
 * Used for `collections` and `badges`, both of which are *drawn* by the
 * storefront from a known list — a collection slug is a route, and a badge the
 * card does not recognise is silently dropped. Offering the real values as
 * toggles is the difference between a field that works and a text box that
 * accepts a word nothing will ever render. See `data/products.js`.
 *
 * `options` is what this chip set draws; `vocabulary` is the whole set the field
 * is drawn from. They are the same thing for badges. They differ for collections,
 * which is split across three groups for legibility: a slug filed under "Audience"
 * is not in the "Shop pages" group's options, and without `vocabulary` to say so it
 * would read as a stray there — the same three slugs flagged in every group, each
 * with its own "no longer offered" notice.
 */
function ChipSet({
  label,
  hint,
  options,
  value = [],
  onChange,
  columns = false,
  vocabulary = null,
  required = false,
  error = null,
  singleSelect = false,
}) {
  /*
   * Slugs this product carries that the vocabulary no longer lists.
   *
   * They are still rendered, and still toggleable off, rather than being left
   * out for not matching an option. A value the panel can hold but cannot show is
   * a value the operator can never remove — an older fragrance filed under a
   * collection since renamed would keep it forever, silently, and collections are
   * routes here: a stale one is a link the storefront will build and 404 on.
   */
  const known = vocabulary ?? options
  const unrecognised = value.filter((entry) => !known.includes(entry))
  const shown = [...options, ...unrecognised.filter((entry) => !options.includes(entry))]

  const handleToggle = (option) => {
    if (singleSelect) {
      const otherValues = value.filter((v) => !options.includes(v))
      if (value.includes(option)) {
        onChange(otherValues)
      } else {
        onChange([...otherValues, option])
      }
    } else {
      onChange(toggle(value, option))
    }
  }

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center gap-1.5">
          <span className="field-label">{label}</span>
          {required && <span className="text-error font-bold">*</span>}
          {required && (
            <span className="text-body-xs font-normal text-ink-muted">
              {singleSelect ? '(Compulsory — select one)' : '(Compulsory — select at least one)'}
            </span>
          )}
        </div>
      )}
      <div className={cn('mt-1 flex flex-wrap gap-1.5', columns && 'max-h-40 overflow-y-auto')}>
        {shown.map((option) => {
          const on = value.includes(option)
          const listed = options.includes(option)
          const displayLabel = COLLECTION_LABELS?.[option] ?? option
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              title={listed ? undefined : 'No longer a listed collection — click to remove it from this fragrance.'}
              onClick={() => handleToggle(option)}
              className={cn(
                'rounded-full border px-3 py-1 text-body-sm font-medium transition-colors',
                on
                  ? 'border-shell-obsidian bg-shell-obsidian text-brand-ivory'
                  : 'border-outline-variant bg-brand-paper text-ink-variant hover:border-ink-muted hover:text-ink',
                !listed && on && 'border-dashed',
              )}
            >
              {displayLabel}
              {!listed && on && <span className="ml-1.5 font-normal opacity-70">withdrawn</span>}
            </button>
          )
        })}
      </div>
      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-body-sm font-semibold text-error">
          <Icon name="alert-circle" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {hint && <p className="mt-1.5 text-body-sm text-ink-muted">{hint}</p>}
      {unrecognised.length > 0 && (
        <p className="mt-1.5 text-body-sm text-ink-muted">
          {unrecognised.length === 1 ? 'One value here is' : `${unrecognised.length} values here are`} no longer offered
          by the shop. Click to remove {unrecognised.length === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  )
}

/**
 * Create or edit a fragrance.
 *
 * One form for both, because the fields are identical and the only real
 * difference is whether a SKU gets minted. Cost is pre-filled from the tier's
 * house ratio as soon as a price is typed, but stays editable — the ratio is a
 * starting point, not a rule the panel should enforce on a real invoice.
 */
export function ProductFormModal({ open, onClose, product = null }) {
  const brands = useAdminStore((state) => state.brands)
  const categories = useAdminStore((state) => state.categories)
  const upsertProduct = useAdminStore((state) => state.upsertProduct)
  const pushToast = useUiStore((state) => state.pushToast)

  /** The rendered symbol, so the PNG export can rasterise what is on screen. */
  const barcodeRef = useRef(null)
  const savingRef = useRef(false)

  const editing = Boolean(product)
  const [draft, setDraft] = useState(blankProduct)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  /** True until the operator types their own cost — see the note above. */
  const [costTouched, setCostTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    if (product) {
      const initialVolumes = product.volumes?.length
        ? product.volumes.map((v) => ({
            size: v.size ?? '',
            price: v.price !== undefined && v.price !== null ? String(v.price) : '',
            mrp: v.mrp !== undefined && v.mrp !== null ? String(v.mrp) : '',
            label: v.label ?? '',
          }))
        : [
            {
              size: '100ml',
              price: product.price !== undefined && product.price !== null ? String(product.price) : '',
              mrp: product.mrp !== undefined && product.mrp !== null ? String(product.mrp) : '',
              label: 'Full Bottle',
            },
          ]

      // Merge occasions from product.occasions and legacy product.collections
      const existingOccasions = Array.from(
        new Set([
          ...(Array.isArray(product.occasions) ? product.occasions : []),
          ...(product.collections ?? []).filter((slug) => OCCASION_IDS.includes(slug)),
        ]),
      )

      // Ensure audience in collections if product.gender exists
      const genderSlugMap = { Men: 'men', Women: 'women', Unisex: 'unisex' }
      const tierToShopPageMap = {
        Original: 'originals',
        Inspired: 'inspired',
        Mixed: 'mixing',
        Attar: 'attars',
        Combo: 'combos',
        Bakhoor: 'bakhoor',
        'Car Perfume': 'car-perfumes',
      }

      const shopPageSlugs = PRODUCT_COLLECTIONS.find((g) => g.group === 'Shop pages')?.slugs ?? []
      const audienceSlugs = PRODUCT_COLLECTIONS.find((g) => g.group === 'Audience')?.slugs ?? ['men', 'women', 'unisex']

      // Enforce single-select for shop pages: keep the first valid one or tier default
      const existingShopPages = (product.collections ?? []).filter((s) => shopPageSlugs.includes(s))
      const chosenShopPage = existingShopPages[0] ?? tierToShopPageMap[product.tier]

      // Filter out legacy tags and other shop pages
      const otherCollections = (product.collections ?? []).filter(
        (s) => !shopPageSlugs.includes(s) && s !== 'best-sellers' && s !== 'vault',
      )

      const initialCollections = chosenShopPage ? [...otherCollections, chosenShopPage] : otherCollections

      const genderSlug = genderSlugMap[product.gender]
      if (genderSlug && !initialCollections.some((s) => audienceSlugs.includes(s))) {
        initialCollections.push(genderSlug)
      }

      setDraft({
        ...blankProduct(),
        ...product,
        volumes: initialVolumes,
        price: product.price ?? initialVolumes[0]?.price ?? '',
        mrp: product.mrp ?? initialVolumes[0]?.mrp ?? '',
        occasions: existingOccasions,
        collections: initialCollections,
      })
    } else {
      setDraft({
        ...blankProduct(),
        gender: 'Unisex',
        tier: 'Inspired',
        collections: ['inspired', 'unisex'],
        occasions: [],
      })
    }
    setErrors({})
    setSaving(false)
    savingRef.current = false
    setCostTouched(editing)
  }, [open, product, editing])

  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }))

  const onTierChange = (value) => {
    const tierToShopPageMap = {
      Original: 'originals',
      Inspired: 'inspired',
      Mixed: 'mixing',
      Attar: 'attars',
      Combo: 'combos',
      Bakhoor: 'bakhoor',
      'Car Perfume': 'car-perfumes',
    }
    const shopPageSlugs = PRODUCT_COLLECTIONS.find((g) => g.group === 'Shop pages')?.slugs ?? []
    const mappedSlug = tierToShopPageMap[value]
    const currentCollections = draft.collections ?? []
    const nonShopPages = currentCollections.filter((s) => !shopPageSlugs.includes(s))
    const nextCollections = mappedSlug ? [...nonShopPages, mappedSlug] : nonShopPages

    setDraft((cur) => ({
      ...cur,
      tier: value,
      collections: nextCollections,
    }))

    setErrors((cur) => {
      const next = { ...cur }
      if (next.tier) delete next.tier
      if (next.shopPages) delete next.shopPages
      return next
    })
  }

  const toggleOccasion = (occId) => {
    const currentOccasions = draft.occasions ?? []
    const nextOccasions = currentOccasions.includes(occId)
      ? currentOccasions.filter((id) => id !== occId)
      : [...currentOccasions, occId]

    // Synchronize occasion tags with collections
    const currentCollections = draft.collections ?? []
    const nonOccasionCollections = currentCollections.filter((c) => !OCCASION_IDS.includes(c))
    const nextCollections = [...nonOccasionCollections, ...nextOccasions]

    setDraft((cur) => ({
      ...cur,
      occasions: nextOccasions,
      collections: nextCollections,
    }))

    if (errors.occasions && nextOccasions.length > 0) {
      setErrors((cur) => {
        const next = { ...cur }
        delete next.occasions
        return next
      })
    }
  }

  const onCollectionsChange = (nextCollections) => {
    // Preserve occasions in collections
    const currentOccasions = draft.occasions ?? []
    const nonOccasionCollections = nextCollections.filter((c) => !OCCASION_IDS.includes(c))
    const combined = Array.from(new Set([...nonOccasionCollections, ...currentOccasions]))

    setDraft((cur) => ({ ...cur, collections: combined }))

    const shopPageSlugs = PRODUCT_COLLECTIONS.find((g) => g.group === 'Shop pages')?.slugs ?? []
    const audienceSlugs = PRODUCT_COLLECTIONS.find((g) => g.group === 'Audience')?.slugs ?? []

    setErrors((cur) => {
      const next = { ...cur }
      if (next.shopPages && combined.some((s) => shopPageSlugs.includes(s))) {
        delete next.shopPages
      }
      if (next.audience && combined.some((s) => audienceSlugs.includes(s))) {
        delete next.audience
      }
      return next
    })
  }

  const onGenderChange = (value) => {
    const genderSlugMap = { Men: 'men', Women: 'women', Unisex: 'unisex' }
    const targetSlug = genderSlugMap[value]
    const audienceSlugs = ['men', 'women', 'unisex']
    const currentCollections = draft.collections ?? []
    const nonAudience = currentCollections.filter((s) => !audienceSlugs.includes(s))
    const nextCollections = targetSlug ? [...nonAudience, targetSlug] : nonAudience

    setDraft((cur) => ({
      ...cur,
      gender: value,
      collections: nextCollections,
    }))

    setErrors((cur) => {
      const next = { ...cur }
      if (next.gender) delete next.gender
      if (next.audience) delete next.audience
      return next
    })
  }

  const updateVolume = (index, field, value) => {
    setDraft((cur) => {
      const nextVolumes = [...(cur.volumes || [])]
      nextVolumes[index] = { ...nextVolumes[index], [field]: value }
      const updates = { volumes: nextVolumes }
      if (index === 0) {
        if (field === 'price') updates.price = value
        if (field === 'mrp') updates.mrp = value
      }
      return { ...cur, ...updates }
    })
  }

  const addVolumePreset = (preset) => {
    setDraft((cur) => {
      const existing = cur.volumes || []
      const matchIndex = existing.findIndex((v) => v.size?.toLowerCase() === preset.size?.toLowerCase())
      if (matchIndex >= 0) return cur

      return {
        ...cur,
        volumes: [
          ...existing,
          {
            size: preset.size,
            price: '',
            mrp: '',
            label: preset.label || '',
          },
        ],
      }
    })
  }

  const removeVolume = (index) => {
    setDraft((cur) => {
      const existing = cur.volumes || []
      if (existing.length <= 1) return cur
      const next = existing.filter((_, i) => i !== index)
      const updates = { volumes: next }
      if (index === 0 && next[0]) {
        updates.price = next[0].price
        updates.mrp = next[0].mrp
      }
      return { ...cur, ...updates }
    })
  }

  const onPriceChange = (value) => {
    setDraft((cur) => {
      const nextVolumes = [...(cur.volumes || [])]
      if (nextVolumes[0]) {
        nextVolumes[0] = { ...nextVolumes[0], price: value }
      }
      return { ...cur, price: value, volumes: nextVolumes }
    })
  }

  const onMrpChange = (value) => {
    setDraft((cur) => {
      const nextVolumes = [...(cur.volumes || [])]
      if (nextVolumes[0]) {
        nextVolumes[0] = { ...nextVolumes[0], mrp: value }
      }
      return { ...cur, mrp: value, volumes: nextVolumes }
    })
  }

  /**
   * Replace one layer of the note pyramid.
   *
   * Spreads the draft's current `notes` and overrides the one layer, defaulting
   * to `{}` for a record that carries no `notes` key at all. Without that
   * default the spread of `undefined` is legal but yields an object holding only
   * the layer just typed — so editing a fragrance's top notes would quietly
   * delete its heart and base.
   */
  const setNote = (layer) => (next) => set('notes')({ ...(draft.notes ?? {}), [layer]: next })

  const brandOptions = useMemo(() => {
    const names = brands.map((brand) => brand.name)
    // A product whose maison was renamed or removed should still show its own
    // value rather than silently snapping to another house.
    return draft.brand && !names.includes(draft.brand) ? [draft.brand, ...names] : names
  }, [brands, draft.brand])

  /**
   * The live shelves, straight from the taxonomy the panel holds.
   *
   * Deliberately not the old static vocabulary: that list named shelves the
   * database may not have (and hid ones it does), so the form offered choices
   * the server would reject. The shelf a fragrance can carry is the shelf that
   * exists.
   */
  const categoryOptions = useMemo(() => {
    const names = categories.map((category) => category.name)
    // Same rule as the maison: an edited product keeps showing its own shelf
    // even if that category has since been renamed or removed.
    return draft.category && !names.includes(draft.category) ? [draft.category, ...names] : names
  }, [categories, draft.category])

  /**
   * Collection slugs this fragrance carries that the shop no longer lists.
   *
   * Computed here as well as inside `ChipSet` because the stray chips are drawn
   * once, after the groups, rather than under every group that does not happen to
   * contain them. Folding them into the vocabulary the groups are checked against
   * is what keeps them from being reported three times over.
   */
  const strayCollections = (draft.collections ?? []).filter((slug) => !COLLECTION_SLUGS.includes(slug))
  const collectionVocabulary = [...COLLECTION_SLUGS, ...strayCollections]

  const margin = marginPercent(draft.cost, draft.price)

  /**
   * On a **create** there is no SKU and no barcode yet, and neither can be
   * previewed honestly.
   *
   * The number on the end comes from the server's atomic counter, which this
   * panel cannot see — it can only see the products it has loaded. The fixtures
   * happen to step by seven, so guessing "highest loaded + 7" produces a
   * plausible-looking code that the server will not issue, and a barcode drawn
   * from it is a label for a fragrance that will never carry that code. Only the
   * *prefix* is knowable, because that follows from the tier, so that is what the
   * form shows. The real SKU and the barcode built from it arrive on the response
   * and are rendered from there.
   */
  const tierPrefix = `RP-${TIER_CODE[draft.tier] ?? 'GEN'}-`
  const skuPreview = editing ? product.sku : null
  const barcodeValue = editing ? product.barcode?.value ?? product.sku : ''

  /* The same test `Barcode` uses to decide whether it has a symbol to draw, kept
     in step with it on purpose: the export has to be disabled in exactly the
     cases where the box beside it reads "No barcode…", or it would offer to
     download an empty rectangle. On a create that is always — the button comes
     alive only once the fragrance has been saved and has a real code. */
  const barcodeIsDrawable = Boolean(encodeBars(barcodeValue))

  /**
   * Save the shelf barcode as a PNG.
   *
   * Silent on success, matching the catalogue's CSV exports — the browser's own
   * download is the feedback. Only the two ways this can really fail are worth
   * a toast: nothing encodable to draw, or a browser that would not rasterise.
   */
  const onDownloadBarcode = async () => {
    try {
      const saved = await downloadBarcodePng(barcodeRef.current, `${barcodeValue}.png`)
      if (!saved) {
        pushToast({
          tone: 'error',
          title: 'Nothing to download',
          description: `${barcodeValue} has no encodable barcode to draw.`,
        })
      }
    } catch (error) {
      pushToast({ tone: 'error', title: 'The barcode could not be saved', description: error.message })
    }
  }

  // Keep the suggested cost in step with tier and price while untouched.
  useEffect(() => {
    if (costTouched || !open) return
    setDraft((current) => ({ ...current, cost: suggestedCost(current.tier, current.price) || '' }))
  }, [draft.tier, draft.price, costTouched, open])

  const validate = () => {
    const next = {}
    if (!draft.name?.trim()) next.name = 'Fragrance name is required.'

    if (!draft.brand) {
      next.brand = 'Brand is required.'
    } else if (!brands.some((brand) => brand.name === draft.brand)) {
      next.brand = `There is no brand called “${draft.brand}” yet — add it on Categories & Brands first.`
    }
    if (!draft.tier) next.tier = 'Type is required.'
    if (!draft.category) {
      next.category = 'Category is required.'
    } else if (!categories.some((category) => category.name === draft.category)) {
      next.category = `There is no category called “${draft.category}” yet — add one on Categories & Brands first.`
    }
    if (!draft.family?.trim()) next.family = 'Fragrance family is required.'
    if (!draft.gender) next.gender = 'Target audience is required.'
    if (!draft.concentration) next.concentration = 'Concentration is required.'

    if (!draft.volumes || draft.volumes.length === 0) {
      next.volumes = 'At least one bottle size is required.'
    } else {
      for (let i = 0; i < draft.volumes.length; i++) {
        const v = draft.volumes[i]
        if (!v.size?.trim()) {
          next.volumes = `Size name is required for bottle size #${i + 1}.`
          break
        }
        if (!(Number(v.price) > 0)) {
          next.volumes = `A valid selling price (> ₹0) is required for size "${v.size}".`
          break
        }
        if (v.mrp && Number(v.mrp) < Number(v.price)) {
          next.volumes = `MRP cannot be less than selling price for size "${v.size}".`
          break
        }
      }
    }

    if (!(Number(draft.price) > 0)) next.price = 'Selling price is required and must be above zero.'
    if (draft.cost !== '' && draft.cost !== null && draft.cost !== undefined) {
      if (Number(draft.cost) < 0) next.cost = 'Cost cannot be negative.'
      if (Number(draft.cost) >= Number(draft.price)) next.cost = 'Cost is at or above the selling price — this sells at a loss.'
    }
    if (draft.mrp && Number(draft.mrp) < Number(draft.price)) next.mrp = 'MRP is below the selling price.'

    if (draft.stock === '' || draft.stock === null || draft.stock === undefined || Number(draft.stock) < 0) {
      next.stock = 'Stock on hand is required.'
    }
    if (!(Number(draft.safeLimit) >= 1)) next.safeLimit = 'Low stock limit of at least 1 unit is required.'
    if (!draft.status) next.status = 'Status is required.'

    // Photographs are optional: if the admin does not add an image to any
    // listed perfume, the official Rehman Perfume bottle placeholder is used automatically.

    const hasNotes = ['top', 'heart', 'base'].some((layer) => (draft.notes?.[layer] ?? []).length)
    if (!hasNotes) {
      next.notesTop = 'At least one fragrance note is required.'
    }

    // Compulsory Occasions
    const selectedOccasions = draft.occasions ?? []
    if (selectedOccasions.length === 0) {
      next.occasions = 'Selecting at least one occasion is compulsory for this fragrance.'
    }

    // Compulsory Collections - Shop Pages (Must select one)
    const shopPageSlugs = PRODUCT_COLLECTIONS.find((g) => g.group === 'Shop pages')?.slugs ?? []
    const hasShopPage = (draft.collections ?? []).some((s) => shopPageSlugs.includes(s))
    if (!hasShopPage) {
      next.shopPages = 'Selecting one Shop Page category (e.g. Original Perfumes, Inspired Perfumes, etc.) is compulsory.'
    }

    // Compulsory Collections - Audience
    const audienceSlugs = PRODUCT_COLLECTIONS.find((g) => g.group === 'Audience')?.slugs ?? []
    const hasAudience = (draft.collections ?? []).some((s) => audienceSlugs.includes(s))
    if (!hasAudience) {
      next.audience = 'Selecting target audience collection (Perfume for Men, Women, or Unisex) is compulsory.'
    }

    setErrors(next)
    return next
  }

  const onSave = async () => {
    if (savingRef.current) return
    const nextErrors = validate()
    const firstMessage = Object.values(nextErrors)[0]
    if (firstMessage) {
      pushToast({ tone: 'error', title: 'Not saved yet', description: firstMessage })
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      const formattedVolumes = (draft.volumes || []).map((v) => ({
        size: v.size.trim(),
        price: Number(v.price),
        mrp: Number(v.mrp) || Math.round(Number(v.price) * 1.28),
        label: (v.label || '').trim(),
      }))

      const primaryPrice = formattedVolumes[0]?.price ?? Number(draft.price)
      const primaryMrp = formattedVolumes[0]?.mrp ?? (Number(draft.mrp) || Math.round((primaryPrice * 1.28) / 100) * 100)

      const savedId = await upsertProduct({
        ...(product ?? {}),
        ...draft,
        name: draft.name.trim(),
        family: draft.family.trim() || 'Signature Scent',
        tagline: draft.tagline.trim(),
        description: draft.description.trim(),
        volumes: formattedVolumes,
        price: primaryPrice,
        mrp: primaryMrp,
        cost: Number(draft.cost),
        stock: Number(draft.stock),
        safeLimit: Number(draft.safeLimit),
      })
      if (savedId) onClose()
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${product.name}` : 'Add a fragrance'}
      description={
        editing
          ? `SKU ${product.sku} · created through the panel, saved to the live catalogue.`
          : 'New fragrances are created from this form and appear in the catalogue immediately.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" icon="check" loading={saving} disabled={saving} onClick={onSave}>
            {editing ? 'Save changes' : 'Create fragrance'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3 rounded border border-outline-variant/60 bg-surface-low/60 px-3.5 py-2.5">
          <TierBadge tier={draft.tier} />
          <span className="tabular text-body-sm font-semibold text-ink">{skuPreview ?? `${tierPrefix}···`}</span>
          <span className="text-body-sm text-ink-muted">
            {editing ? 'SKU is fixed once assigned' : 'The code is made when you save, from the type prefix'}
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-body-sm text-ink-variant">
            <Icon name="percent" className="h-3.5 w-3.5" />
            Margin{' '}
            <span className={margin < 20 ? 'font-bold text-error' : 'font-bold text-state-done'}>{margin}%</span>
          </span>
        </div>

        {/* The barcode is a function of the SKU, so it is shown rather than
            entered — there is nothing here to type. On an edit it is the code the
            label already carries. On a create there is nothing to show: the code
            is a function of a SKU the server has not minted yet, so the box draws
            its own placeholder and the export stays disabled until a save returns
            one. See the note on `barcodeValue` above. */}
        <div className="flex flex-col gap-3 rounded border border-outline-variant/60 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-5">
          <div className="w-full max-w-[16rem] shrink-0 rounded border border-outline-variant/60 bg-white p-2">
            <Barcode
              ref={barcodeRef}
              value={barcodeValue}
              height={40}
              emptyLabel={editing ? undefined : 'Barcode issued when you save'}
            />
          </div>
          <div className="min-w-0 sm:flex-1">
            <p className="flex items-center gap-1.5 text-body-sm font-semibold text-ink">
              <Icon name="lock" className="h-3.5 w-3.5 text-ink-muted" />
              Staff-only shelf barcode
            </p>
            <p className="mt-1 text-body-sm text-ink-muted">
              {editing ? (
                <>
                  Fixed at <span className="tabular font-medium text-ink">{product.barcode?.value ?? product.sku}</span>{' '}
                  and never published to the website. Correcting the SKU replaces it.
                </>
              ) : (
                <>
                  Issued by the backend the moment this fragrance is saved — it encodes the SKU the server assigns,
                  then stays fixed for the life of the fragrance. Nothing to enter here.
                </>
              )}
            </p>
          </div>
          {/* Exports the symbol at 8 pixels per module, not the size it happens
              to be drawn at here — see `lib/barcodePng.js`.

              `self-start` only matters once the row stacks: a column flex
              stretches its children, which would make this span the whole modal
              and read as a primary action rather than the secondary one it is
              next to Save Changes. */}
          <Button
            variant="outline"
            size="sm"
            icon="download"
            className="shrink-0 self-start sm:self-center"
            onClick={onDownloadBarcode}
            disabled={!barcodeIsDrawable}
          >
            Download PNG
          </Button>
        </div>

        <FieldGroup title="Identity" columns={2}>
          <Input
            label="Fragrance name"
            required
            value={draft.name}
            onChange={(event) => set('name')(event.target.value)}
            error={errors.name}
            placeholder="Enter fragrance name"
            containerClassName="sm:col-span-2"
          />
          <Select
            label="Brand"
            required
            value={draft.brand}
            onChange={(event) => set('brand')(event.target.value)}
            options={brandOptions}
            placeholder={brandOptions.length ? 'Choose a brand…' : 'No brands yet — add one on Categories & Brands'}
            error={errors.brand}
          />
          <Select
            label="Type"
            required
            value={draft.tier}
            onChange={(event) => onTierChange(event.target.value)}
            options={TIERS}
            error={errors.tier}
            hint="Decides the code prefix, matching Shop Page, and suggested cost."
          />
          <Select
            label="Category"
            required
            value={draft.category}
            onChange={(event) => set('category')(event.target.value)}
            options={categoryOptions}
            placeholder={categoryOptions.length ? 'Choose a category…' : 'No categories yet — add one on Categories & Brands'}
            error={errors.category}
          />
          <Input
            label="Fragrance family"
            required
            value={draft.family}
            onChange={(event) => set('family')(event.target.value)}
            placeholder="Enter fragrance family"
            error={errors.family}
          />
          <Select
            label="Sold to"
            required
            value={draft.gender}
            onChange={(event) => onGenderChange(event.target.value)}
            options={GENDERS}
            error={errors.gender}
          />
          <Select
            label="Concentration"
            required
            value={draft.concentration}
            onChange={(event) => set('concentration')(event.target.value)}
            options={CONCENTRATIONS}
            error={errors.concentration}
          />
        </FieldGroup>

        {/* Bottle Sizes & Volume Pricing */}
        <div className="rounded-xl border border-outline-variant/70 bg-surface-low/30 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-outline-variant/50 pb-3.5">
            <div>
              <h3 className="text-body-md font-semibold text-ink flex items-center gap-2">
                <Icon name="sparkle" className="h-4 w-4 text-brand-gold" />
                Bottle Sizes & Volume Pricing
              </h3>
              <p className="mt-0.5 text-body-sm text-ink-muted">
                Add size variants (100ml, 50ml, 30ml, 10ml testing pack) with their selling prices and MRPs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mr-1">Quick Add:</span>
              {VOLUME_PRESETS.map((preset) => {
                const added = draft.volumes?.some((v) => v.size?.toLowerCase() === preset.size.toLowerCase())
                return (
                  <button
                    key={preset.size}
                    type="button"
                    onClick={() => addVolumePreset(preset)}
                    disabled={added}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-label-sm font-semibold transition border',
                      added
                        ? 'border-outline-variant/50 bg-surface-low text-ink-muted/50 cursor-not-allowed'
                        : 'border-brand-gold/60 bg-brand-gold/10 text-brand-goldInk hover:bg-brand-gold hover:text-white',
                    )}
                  >
                    {added ? `✓ ${preset.size}` : `+ ${preset.size}`}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Volume table headers on sm+ screens */}
          <div className="mt-3.5 hidden sm:grid grid-cols-12 gap-3 px-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            <span className="col-span-3">Bottle Size</span>
            <span className="col-span-3">Selling Price (₹)</span>
            <span className="col-span-3">MRP (₹)</span>
            <span className="col-span-2">Tag / Label</span>
            <span className="col-span-1 text-right">Action</span>
          </div>

          {/* Volume rows */}
          <div className="mt-2 flex flex-col gap-2.5">
            {draft.volumes?.map((vol, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3 items-center rounded-lg border border-outline-variant/60 bg-white p-3 shadow-xs"
              >
                <div className="sm:col-span-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-shell-obsidian text-[11px] font-bold text-brand-gold">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block sm:hidden mb-0.5">Size</label>
                    <input
                      type="text"
                      value={vol.size}
                      onChange={(e) => updateVolume(idx, 'size', e.target.value)}
                      placeholder="e.g. 100ml"
                      className="w-full rounded border border-outline-variant/80 bg-white px-2.5 py-1.5 text-body-sm font-semibold text-ink focus:border-brand-gold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block sm:hidden mb-0.5">Selling Price (₹)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1.5 text-body-sm text-ink-muted">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={vol.price}
                      onChange={(e) => updateVolume(idx, 'price', e.target.value)}
                      placeholder="Price"
                      className="w-full rounded border border-outline-variant/80 bg-white pl-6 pr-2.5 py-1.5 text-body-sm font-semibold tabular text-ink focus:border-brand-gold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block sm:hidden mb-0.5">MRP (₹)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1.5 text-body-sm text-ink-muted">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={vol.mrp}
                      onChange={(e) => updateVolume(idx, 'mrp', e.target.value)}
                      placeholder="MRP"
                      className="w-full rounded border border-outline-variant/80 bg-white pl-6 pr-2.5 py-1.5 text-body-sm tabular text-ink-variant focus:border-brand-gold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block sm:hidden mb-0.5">Label</label>
                  <input
                    type="text"
                    value={vol.label}
                    onChange={(e) => updateVolume(idx, 'label', e.target.value)}
                    placeholder="e.g. Testing Pack"
                    className="w-full rounded border border-outline-variant/80 bg-white px-2.5 py-1.5 text-body-sm text-ink focus:border-brand-gold focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-1 flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0">
                  {idx === 0 && (
                    <span className="rounded bg-brand-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-goldInk sm:hidden">
                      Primary
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeVolume(idx)}
                    disabled={draft.volumes.length <= 1}
                    title={draft.volumes.length <= 1 ? 'At least one volume required' : 'Remove size'}
                    className={cn(
                      'rounded p-1.5 transition text-ink-muted hover:bg-error/10 hover:text-error',
                      draft.volumes.length <= 1 && 'opacity-25 cursor-not-allowed hover:bg-transparent hover:text-ink-muted',
                    )}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => addVolumePreset({ size: '', label: '' })}
              className="inline-flex items-center gap-1.5 text-label-sm font-semibold text-brand-goldInk hover:text-brand-gold transition"
            >
              <Icon name="plus" className="h-4 w-4" />
              Add Custom Size
            </button>
            {errors.volumes && (
              <p className="text-body-sm text-error font-semibold">{errors.volumes}</p>
            )}
          </div>
        </div>

        <FieldGroup title="Catalogue Pricing & Margins" columns={3}>
          <Input
            label="Selling price"
            required
            type="number"
            min="0"
            value={draft.price}
            onChange={(event) => onPriceChange(event.target.value)}
            error={errors.price}
            suffix="₹"
            hint="Primary size price."
          />
          <Input
            label="MRP"
            type="number"
            min="0"
            value={draft.mrp}
            onChange={(event) => onMrpChange(event.target.value)}
            error={errors.mrp}
            hint="Leave blank and it is set at 1.28× the selling price."
          />
          <Input
            label="Unit cost"
            type="number"
            min="0"
            value={draft.cost}
            onChange={(event) => {
              setCostTouched(true)
              set('cost')(event.target.value)
            }}
            error={errors.cost}
            hint={costTouched ? 'Typed in by you.' : 'Suggested from the type.'}
          />
        </FieldGroup>
        <p className="-mt-4 text-body-sm text-ink-muted">
          Margin is computed from these two figures and never stored, so it cannot go stale:{' '}
          <span className="font-semibold text-ink">
            {formatPrice(Number(draft.price) - Number(draft.cost) || 0)} gross per unit
          </span>
          .
        </p>

        <FieldGroup title="Stock" columns={3}>
          <Input
            label="On hand"
            required
            type="number"
            min="0"
            value={draft.stock}
            onChange={(event) => set('stock')(event.target.value)}
            error={errors.stock}
            hint="Saving a new count logs the difference as a stock-take."
          />
          <Input
            label="Low stock limit"
            required
            type="number"
            min="1"
            value={draft.safeLimit}
            onChange={(event) => set('safeLimit')(event.target.value)}
            error={errors.safeLimit}
          />
          <Select
            label="Status"
            required
            value={draft.status}
            onChange={(event) => set('status')(event.target.value)}
            options={PRODUCT_STATUSES}
            error={errors.status}
            hint="Only Active perfumes can be bought on the website."
          />
        </FieldGroup>

        {/* ── What the website renders ──────────────────────────────────────
            Everything below this point is read by the storefront's product
            page and cards. None of it existed in this form before, which is
            why a fragrance created here appeared on the website as a name, a
            price and a stand-in illustration. */}

        <FieldGroup title="Photography" columns={1}>
          <div className="w-full">
            <span className="field-label mb-2 block">
              Photographs <span className="text-body-xs font-normal text-ink-muted">(Optional — uses official Rehman bottle placeholder if empty)</span>
            </span>
            <ImageUploader
              images={draft.images ?? []}
              onChange={set('images')}
              /*
               * The fragrance's id when it has one, so the media library can be
               * filtered by product.
               *
               * A photograph added while *creating* is uploaded before the
               * fragrance exists, so its media row is stored with no owner and
               * stays that way: saving attaches the id to the product's `images`
               * list, which is the reference the website follows, but nothing goes
               * back to stamp `ownerId` on the row. The gallery here is unaffected
               * — it reads the product's list — so the only consequence is that
               * the library's by-product filter will not surface photographs that
               * were added this way.
               */
              ownerId={product?.id ?? null}
            />
            {!(draft.images ?? []).length && (
              <div className="mt-3 flex items-center gap-3 rounded border border-outline-variant/60 bg-brand-cream/40 p-2.5">
                <img
                  src="/rehman-placeholder-bottle.png"
                  alt="Default Rehman placeholder bottle"
                  className="h-11 w-11 rounded border border-outline-variant/60 bg-white object-contain p-1 shrink-0"
                />
                <div className="text-body-xs text-ink-muted">
                  <p className="font-semibold text-ink">No photography uploaded yet</p>
                  <p>This perfume will automatically display the official Rehman Perfume bottle placeholder across the shop and admin until custom images are added.</p>
                </div>
              </div>
            )}
            {errors.images && (
              <p className="mt-1.5 flex items-center gap-1 text-body-sm text-error">
                <Icon name="alert-circle" className="h-3.5 w-3.5" />
                {errors.images}
              </p>
            )}
          </div>
        </FieldGroup>

        <FieldGroup title="Website Text" columns={1}>
          <Input
            label="Tagline"
            value={draft.tagline ?? ''}
            onChange={(event) => set('tagline')(event.target.value)}
            placeholder="Enter a short tagline"
            hint="Short 1-line intro shown under the perfume name."
          />
          <Textarea
            label="Description"
            rows={5}
            value={draft.description ?? ''}
            onChange={(event) => set('description')(event.target.value)}
            error={errors.description}
            placeholder="Enter perfume details"
            hint="Full details shown on the product page (2–3 simple lines)."
          />
        </FieldGroup>

        {/* Keyed on the fragrance so the local text state inside each field is
            rebuilt when the modal is pointed at a different one — otherwise
            editing a second fragrance would show the first one's notes. */}
        <FieldGroup
          key={`notes-${product?.id ?? 'new'}`}
          title="Note pyramid"
          description="Comma-separated. These are what the product page draws as the fragrance's pyramid, and search matches against them."
        >
          <ListInput
            label="Top notes"
            required
            value={draft.notes?.top}
            onChange={setNote('top')}
            placeholder="Enter comma-separated top notes"
            error={errors.notesTop}
          />
          <ListInput label="Heart notes" value={draft.notes?.heart} onChange={setNote('heart')} placeholder="Enter comma-separated heart notes" />
          <ListInput
            label="Base notes"
            value={draft.notes?.base}
            onChange={setNote('base')}
            placeholder="Enter comma-separated base notes"
            hint={errors.notesTop ? undefined : 'At least one note is required before a fragrance can be published to the website.'}
          />
          {errors.notesTop && <p className="text-body-sm text-error sm:col-span-2">{errors.notesTop}</p>}
        </FieldGroup>

        <FieldGroup title="Wear" columns={2}>
          <Select
            label="How long it lasts"
            value={draft.longevity ?? ''}
            onChange={(event) => set('longevity')(event.target.value)}
            options={LONGEVITY_BANDS}
            placeholder="Not stated"
            hint="Shown on the product page as a badge."
          />
          <Select
            label="How far it spreads"
            value={draft.projection ?? ''}
            onChange={(event) => set('projection')(event.target.value)}
            options={PROJECTION_BANDS}
            placeholder="Not stated"
          />
        </FieldGroup>

        <FieldGroup title="Shop Badges & Home Page" columns={1}>
          <ChipSet
            label="Badges"
            options={PRODUCT_BADGES}
            value={draft.badges ?? []}
            onChange={set('badges')}
            hint="Pick badges to show as small tags on the product card."
          />
          <div className="flex flex-wrap gap-6 pt-1">
            <Checkbox
              label="Bestseller"
              description="Marks this bottle with a Bestseller label. Use Website Display to choose products for the Home page."
              checked={Boolean(draft.bestseller)}
              onChange={(event) => set('bestseller')(event.target.checked)}
            />
            <Checkbox
              label="Featured"
              description="Can appear in the featured section on the website."
              checked={Boolean(draft.featured)}
              onChange={(event) => set('featured')(event.target.checked)}
            />
          </div>
        </FieldGroup>

        <FieldGroup
          title="Occasions & Signature Scents *"
          columns={1}
          description="Compulsory: Select which occasion(s) this fragrance belongs to. The perfume will appear on the Discover Your Signature Scent collection pages on the storefront."
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {OCCASIONS.map((occ) => {
              const selected = (draft.occasions ?? []).includes(occ.id)
              return (
                <button
                  key={occ.id}
                  type="button"
                  onClick={() => toggleOccasion(occ.id)}
                  className={cn(
                    'flex flex-col items-start rounded-lg border p-3 text-left transition',
                    selected
                      ? 'border-brand-gold bg-brand-cream/60 shadow-xs ring-1 ring-brand-gold'
                      : 'border-outline-variant/60 bg-white hover:border-outline hover:bg-surface-low',
                    errors.occasions && !selected && 'border-error/40',
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-body-sm font-semibold text-ink">{occ.label}</span>
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-full border',
                        selected
                          ? 'border-brand-gold bg-brand-gold text-white'
                          : 'border-outline-variant bg-white',
                      )}
                    >
                      {selected && <Icon name="check" className="h-3 w-3 stroke-[3]" />}
                    </span>
                  </div>
                  <span className="mt-1 text-body-xs text-ink-muted">{occ.blurb}</span>
                </button>
              )
            })}
          </div>
          {errors.occasions && (
            <p className="mt-2.5 flex items-center gap-1.5 text-body-sm font-semibold text-error">
              <Icon name="alert-circle" className="h-4 w-4 shrink-0" />
              {errors.occasions}
            </p>
          )}
        </FieldGroup>

        {/* Grouped rather than flat: the first seven are shop pages a shopper can
            navigate to, the last nine are facets. One long undifferentiated row
            of twenty slugs would hide that distinction.

            Each group draws only its own slugs but is told the whole vocabulary,
            so a slug from another group is not mistaken for a stray; the strays
            themselves get one set of chips of their own below, rather than a
            notice repeated under every group. */}
        <FieldGroup title="Collections *" columns={1} description="Compulsory: Select one primary shop page category and target audience for this perfume.">
          {PRODUCT_COLLECTIONS.map((group) => {
            const isShopPages = group.group === 'Shop pages'
            const isAudience = group.group === 'Audience'
            const isRequired = isShopPages || isAudience
            const groupError = isShopPages ? errors.shopPages : isAudience ? errors.audience : null

            return (
              <ChipSet
                key={group.group}
                label={group.group}
                options={group.slugs}
                vocabulary={collectionVocabulary}
                value={draft.collections ?? []}
                onChange={onCollectionsChange}
                required={isRequired}
                error={groupError}
                singleSelect={isShopPages}
              />
            )
          })}
          {strayCollections.length > 0 && (
            <ChipSet
              label="No longer offered by the shop"
              options={strayCollections}
              vocabulary={collectionVocabulary}
              value={draft.collections ?? []}
              onChange={onCollectionsChange}
              hint="Kept so the value survives a save, and drawn last so it is not lost among the slugs above. Click to remove."
            />
          )}
        </FieldGroup>
      </div>
    </Modal>
  )
}

export default ProductFormModal
