import { useEffect, useRef, useState } from 'react'
import cn from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea, FieldGroup } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { CATEGORY_STATUSES } from '@/data/categories'
import { BRAND_HOUSES, BRAND_STATUSES } from '@/data/brands'
import { useAdminStore } from '@/store/adminStore'
import { adminApi } from '@/services/adminApi'

const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const MAX_LOGO_BYTES = 5 * 1024 * 1024

function BrandLogoUpload({ logo, onChange, brandName, onUploadingChange }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const setBusy = (busy) => {
    setUploading(busy)
    onUploadingChange?.(busy)
  }

  const handleFiles = async (files) => {
    const file = files?.[0]
    if (!file) return
    setUploadError('')

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setUploadError(`${file.name} is not a supported image. Use PNG, JPEG, WebP or AVIF.`)
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setUploadError(`${file.name} exceeds the 5 MB upload limit.`)
      return
    }

    setBusy(true)
    try {
      const media = await adminApi.uploadMedia([file], { ownerType: 'brand', alt: brandName || '' })
      if (media?.[0]?.url) {
        onChange(media[0].url)
      } else {
        setUploadError('Upload succeeded, but no image URL was returned.')
      }
    } catch (error) {
      setUploadError(error?.message || 'Could not upload logo. Make sure the server is reachable.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) {
      handleFiles(e.dataTransfer.files)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="field-label">Brand Logo</label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {logo ? (
        <div className="relative flex items-center justify-between gap-4 rounded border border-outline-variant bg-surface-low p-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded border border-outline-variant bg-brand-paper p-1 shadow-sm">
              <img
                src={logo}
                alt={brandName || 'Brand logo'}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-ink">Logo attached</p>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="mt-0.5 text-label-sm font-semibold text-brand-goldInk hover:underline disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Change image'}
              </button>
            </div>
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              setUploadError('')
              onChange('')
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-error disabled:opacity-50"
            title="Remove logo"
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-5 text-center transition',
            dragOver
              ? 'border-brand-gold bg-brand-gold/10'
              : 'border-outline-variant bg-brand-paper hover:border-brand-gold hover:bg-surface-low',
          )}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
              <span className="text-body-sm text-ink-muted">Uploading logo…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/15 text-brand-goldInk">
                <Icon name="upload" className="h-5 w-5" />
              </div>
              <div>
                <p className="text-body-sm font-semibold text-ink">Click or drag brand logo here</p>
                <p className="text-label-sm text-ink-muted">PNG, JPEG, WebP or AVIF · up to 5 MB</p>
              </div>
            </div>
          )}
        </div>
      )}

      {uploadError && (
        <p className="flex items-center gap-1.5 text-body-sm text-error">
          <Icon name="alert-circle" className="h-3.5 w-3.5 shrink-0" />
          {uploadError}
        </p>
      )}

      <div className="flex items-center justify-between text-label-sm text-ink-muted">
        <span>Shown in "Brands We Carry" on website</span>
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="font-semibold text-brand-goldInk hover:underline"
        >
          {showUrlInput ? 'Hide URL input' : 'Or paste image link'}
        </button>
      </div>

      {showUrlInput && (
        <Input
          placeholder="Paste image URL"
          value={logo ?? ''}
          onChange={(e) => {
            setUploadError('')
            onChange(e.target.value)
          }}
          hint="Direct image URL"
        />
      )}
    </div>
  )
}

/**
 * Add or edit a category or a brand.
 *
 * Both are editorial records — a name and a handful of facts a human decides —
 * so they share one form. Everything numeric on the Categories & Brands screen
 * (products, units, revenue) is derived from the catalogue instead, which is why
 * none of it appears here: there is nothing to type that could drift.
 */
export function TaxonomyModal({ open, onClose, kind = 'category', record = null }) {
  const categories = useAdminStore((state) => state.categories)
  const brands = useAdminStore((state) => state.brands)
  const upsertCategory = useAdminStore((state) => state.upsertCategory)
  const upsertBrand = useAdminStore((state) => state.upsertBrand)

  const isCategory = kind === 'category'
  const [draft, setDraft] = useState({})
  const [errors, setErrors] = useState({})
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setDraft(
      record ??
        (isCategory
          ? { name: '', description: '', status: 'Active', shelf: categories.length + 1 }
          : { name: '', house: BRAND_HOUSES[1], country: 'India', status: 'Stocked', since: new Date().getFullYear(), logo: '' }),
    )
    setErrors({})
    setUploadingLogo(false)
    setSaving(false)
    savingRef.current = false
  }, [open, record, isCategory, categories.length])

  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }))

  const onSave = async () => {
    if (uploadingLogo || savingRef.current) return
    const next = {}
    if (!String(draft.name ?? '').trim()) next.name = isCategory ? 'A category needs a name.' : 'A brand needs a name.'
    // Names are the join key between these records and the catalogue, so a
    // duplicate would silently split one category into two.
    const pool = (isCategory ? categories : brands).filter((item) => item.id !== record?.id)
    if (pool.some((item) => item.name.toLowerCase() === String(draft.name).trim().toLowerCase())) {
      next.name = `“${String(draft.name).trim()}” already exists.`
    }
    setErrors(next)
    if (Object.keys(next).length) return

    savingRef.current = true
    setSaving(true)
    try {
      const payload = { ...draft, name: String(draft.name).trim() }
      const savedId = await (isCategory ? upsertCategory(payload) : upsertBrand(payload))
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
      title={`${record ? 'Edit' : 'Add'} ${isCategory ? 'category' : 'brand'}`}
      description={
        isCategory
          ? 'Categories group the catalogue. A fragrance belongs to exactly one.'
          : 'A brand is who made the fragrance, whether you bought it in or blended it yourself.'
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" icon="check" loading={uploadingLogo || saving} disabled={uploadingLogo || saving} onClick={onSave}>
            {record ? 'Save changes' : `Add ${isCategory ? 'category' : 'brand'}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Input
          label="Name"
          required
          value={draft.name ?? ''}
          onChange={(event) => set('name')(event.target.value)}
          error={errors.name}
          placeholder={isCategory ? 'Enter category name' : 'Enter brand name'}
          data-autofocus
        />

        {isCategory ? (
          <FieldGroup columns={1}>
            <Textarea
              label="Description"
              rows={3}
              value={draft.description ?? ''}
              onChange={(event) => set('description')(event.target.value)}
              placeholder="How this category reads to a shopper."
              hint="Shown on the website's category cards."
            />
            <Select
              label="Status"
              value={draft.status ?? 'Active'}
              onChange={(event) => set('status')(event.target.value)}
              options={CATEGORY_STATUSES}
              hint="Hidden keeps the category off the website without deleting it."
            />
            <Input
              label="Display order"
              type="number"
              min="1"
              value={draft.shelf ?? ''}
              onChange={(event) => set('shelf')(Number(event.target.value))}
              hint="Where it sits in the website's navigation."
            />
          </FieldGroup>
        ) : (
          <FieldGroup columns={1}>
            <BrandLogoUpload
              logo={draft.logo}
              onChange={set('logo')}
              brandName={draft.name}
              onUploadingChange={setUploadingLogo}
            />
            <Select
              label="Brand group"
              hint="Which part of your range it belongs to."
              value={draft.house ?? BRAND_HOUSES[0]}
              onChange={(event) => set('house')(event.target.value)}
              options={BRAND_HOUSES}
            />
            <Input
              label="Country"
              value={draft.country ?? ''}
              onChange={(event) => set('country')(event.target.value)}
              placeholder="Enter country of origin"
            />
            <Input
              label="Founded"
              type="number"
              min="1600"
              max="2100"
              value={draft.since ?? ''}
              onChange={(event) => set('since')(Number(event.target.value))}
            />
            <Select
              label="Status"
              value={draft.status ?? 'Stocked'}
              onChange={(event) => set('status')(event.target.value)}
              options={BRAND_STATUSES}
            />
          </FieldGroup>
        )}
      </div>
    </Modal>
  )
}

export default TaxonomyModal
