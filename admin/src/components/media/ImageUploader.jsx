import { useCallback, useEffect, useRef, useState } from 'react'
import cn from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'
import { Button, IconButton } from '@/components/ui/Button'
import { adminApi } from '@/services/adminApi'

/**
 * The photography drop zone.
 *
 * **Why this exists.** The backend has had a complete upload subsystem — multer,
 * a media collection, a storage driver, `/admin/uploads` — since it was written,
 * and the panel had no UI that reached any of it. So a fragrance could be created
 * with a name, a price and a tier, and nothing else the storefront's product page
 * renders: no photograph, no description, no note pyramid. The website was not
 * "disconnected" from the panel so much as the panel could not supply what the
 * website's own templates asked for, and every photo slot fell back to a stand-in.
 *
 * **Order is the one piece of metadata that matters here.** The storefront reads
 * `images[0]` as the card's cover and `images[1]` as the shot a card dissolves to
 * on hover, and the product page walks the rest as its view strip. So the array
 * this component hands back is not a set — it is a sequence, and the operator can
 * see and change which photograph comes first. That is what "Make cover" is for.
 *
 * **Uploads are the one write in the panel with no offline path.** Everything
 * else degrades to a local change the server catches up on. A file cannot: there
 * is nowhere on this machine a photograph could go that the website would later
 * be able to load, so a failure is reported rather than absorbed. Adding a
 * product is allowed with no photographs at all — the storefront has stand-in
 * flacon art — but a *failed upload must never look like a successful one*.
 */

/** Mirrors the server's `UPLOAD_LIMITS`/`ALLOWED_MIME`, used only to pre-check. */
const FALLBACK_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxFiles: 8,
  allowed: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
}

/**
 * How many photographs one fragrance may hold.
 *
 * **Not** the same number as `limits.maxFiles`, and the two must not be confused.
 * `maxFiles` is multer's `files: 8` — a cap on a single request. This is the
 * product schema's `images: z.array(...).max(12)` — a cap on the record. Using the
 * request limit as the gallery limit would make the panel refuse a ninth
 * photograph the API would have stored, with nothing on screen explaining why the
 * ceiling was eight. `max` overrides it for a caller that knows better.
 */
const MAX_PHOTOGRAPHS = 12

/** One decimal place, because "4.7 MB" is more use than "5,242,880 bytes". */
const inMb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/**
 * Why a chosen file cannot be sent, or `null` if it can.
 *
 * Checked here as well as on the server, and deliberately so: the server's answer
 * arrives after a 5 MB body has been uploaded, which on a shop's connection is a
 * long wait for a rejection the browser could see instantly. The server still
 * checks — this is a courtesy, not the rule.
 */
function rejectionFor(file, limits) {
  const allowed = limits.allowed ?? FALLBACK_LIMITS.allowed
  // A browser reports `''` for a file it cannot identify, and a file with no
  // type is not a file we should guess at.
  if (!allowed.includes(file.type)) {
    return `${file.name} is a ${file.type || 'unrecognised'} file. Photographs must be JPEG, PNG, WebP or AVIF.`
  }
  if (file.size > (limits.maxFileBytes ?? FALLBACK_LIMITS.maxFileBytes)) {
    return `${file.name} is ${inMb(file.size)}, over the ${inMb(limits.maxFileBytes ?? FALLBACK_LIMITS.maxFileBytes)} limit.`
  }
  return null
}

/**
 * @param {object} props
 * @param {Array<{id: string, url: string, alt?: string}>} props.images
 * @param {(next: Array<object>) => void} props.onChange
 * @param {string|null} [props.ownerId] attach uploads to this record when known
 * @param {number} [props.max] how many photographs this product may hold
 * @param {boolean} [props.disabled]
 */
export function ImageUploader({ images = [], onChange, ownerId = null, max, disabled = false }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState([])
  const [limits, setLimits] = useState(FALLBACK_LIMITS)

  const cap = max ?? MAX_PHOTOGRAPHS
  /** How many may travel in one request — multer's limit, not the record's. */
  const perRequest = limits.maxFiles ?? FALLBACK_LIMITS.maxFiles

  /*
   * Ask the server what it accepts, once.
   *
   * The three numbers are advisory — the drop zone pre-checks against them so a
   * rejected file is caught before its bytes travel — but `driver` is shown to
   * the operator, because "where do our photographs actually live" is a real
   * question with two very different answers (a CDN, or this machine's disk).
   *
   * A failure is silent on purpose: the fallback constants mirror the server's,
   * so the worst case is a pre-check that is briefly out of date.
   */
  useEffect(() => {
    let cancelled = false
    adminApi
      .getUploadLimits()
      .then((next) => {
        if (!cancelled && next) setLimits({ ...FALLBACK_LIMITS, ...next })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Take files from anywhere — the picker, a drop, or the clipboard.
   *
   * `onChange` receives the **whole** new gallery, appended to, because the
   * parent owns the array and the server's `images` field is a list that replaces
   * what was there. Merging here rather than in the parent keeps the ordering
   * rule in one place.
   */
  const accept = useCallback(
    async (fileList) => {
      if (disabled || busy) return
      const incoming = Array.from(fileList ?? [])
      if (!incoming.length) return

      /*
       * Only ever consider as many files as there is room for, and refuse the
       * rest with a reason that names the limit actually reached.
       *
       * The drop handler calls this even when the gallery is full — the drop zone
       * is the one entry point that no `disabled` attribute can close — so a full
       * gallery has to be a real branch here and not an assumption. Sending the
       * surplus would put bytes in storage that the parent's array then drops on
       * the floor: media rows pointing at a product that does not reference them,
       * invisible in this panel and impossible to delete.
       *
       * Two ceilings bind, and they are different: how much the *record* can hold
       * (`cap`) and how much one *request* can carry (`perRequest`). Whichever is
       * doing the refusing is the one the operator is told about, since "add them
       * in two goes" and "this fragrance is full" call for different actions.
       */
      const galleryRoom = Math.max(0, cap - images.length)
      if (galleryRoom === 0) {
        setFailed([`This fragrance holds its maximum of ${cap} photographs. Remove one to add another.`])
        return
      }

      const room = Math.min(galleryRoom, perRequest)
      const overflow =
        incoming.length > room
          ? [
              room === galleryRoom
                ? `${incoming.length - room} not added — this fragrance holds ${cap} photographs at most.`
                : `${incoming.length - room} not added — up to ${perRequest} can be uploaded at once, so add them in another go.`,
            ]
          : []

      const rejected = []
      const sendable = []
      for (const file of incoming.slice(0, room)) {
        const reason = rejectionFor(file, limits)
        if (reason) rejected.push(reason)
        else sendable.push(file)
      }

      setFailed([...overflow, ...rejected])
      if (!sendable.length) return

      setBusy(true)
      try {
        const rows = await adminApi.uploadMedia(sendable, { ownerType: 'product', ownerId })
        // The server's own rows, not local file objects: the storefront loads
        // `row.url`, and only the server knows what that URL is. A local preview
        // would have to be a `blob:` URL, which dies with the tab and means
        // nothing to a shopper.
        onChange([...images, ...rows].slice(0, cap))
      } catch (error) {
        // Surfaced, never swallowed — see the note at the top of the file.
        setFailed([...overflow, ...rejected, error.message || 'The upload failed.'])
      } finally {
        setBusy(false)
      }
    },
    [busy, cap, disabled, images, limits, onChange, ownerId],
  )

  const remove = async (image) => {
    onChange(images.filter((entry) => entry.id !== image.id))
    /*
     * The row and its bytes go immediately, not on save, so a photograph removed
     * here is gone even if the modal is then cancelled. That is the trade this
     * makes: deleting on save would need the removals held aside and re-applied
     * only once the fragrance was written, and the storefront tolerates the
     * consequence either way — a product still referencing a destroyed row simply
     * shows one fewer view, because `galleryOf()` drops an entry with no URL. The
     * alternative, leaving the file behind on every removal, orphans bytes that
     * nothing can ever reach to reclaim.
     *
     * Best-effort, because the gallery is already correct in the operator's eyes
     * and a file we failed to reclaim is housekeeping, not a blocked save.
     */
    try {
      await adminApi.deleteMedia(image.id)
    } catch {
      /* the photograph is gone from the product either way */
    }
  }

  const makeCover = (image) => {
    onChange([image, ...images.filter((entry) => entry.id !== image.id)])
  }

  const onDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    accept(event.dataTransfer?.files)
  }

  const atCapacity = images.length >= cap

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled && !atCapacity) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded border border-dashed px-4 py-5 text-center transition-colors',
          dragging ? 'border-brand-gold bg-brand-gold/5' : 'border-outline-variant bg-surface-low/40',
          (disabled || atCapacity) && 'opacity-60',
        )}
      >
        <Icon name="image" className="mx-auto h-5 w-5 text-ink-muted" />
        <p className="mt-2 text-body-sm text-ink-variant">
          {busy ? 'Uploading…' : atCapacity ? `All ${cap} photographs added` : 'Drop photographs here'}
        </p>
        <p className="mt-0.5 text-body-sm text-ink-muted">
          JPEG, PNG, WebP or AVIF · up to {inMb(limits.maxFileBytes ?? FALLBACK_LIMITS.maxFileBytes)} each
        </p>
        {/* Said here as well as under the thumbnails, because the labels that
            name the slots only appear once a gallery exists — so an operator
            looking at an empty form had no way to learn that the second
            photograph is a different slot from the first. It is the one that
            matters most: the second is what a card reveals on hover. */}
        {!atCapacity && (
          <p className="mt-0.5 text-body-sm text-ink-muted">
            Up to {cap} · the first becomes the cover, the second the shot a card reveals on hover.
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={(limits.allowed ?? FALLBACK_LIMITS.allowed).join(',')}
          multiple
          hidden
          onChange={(event) => {
            accept(event.target.files)
            // Clearing lets the same file be re-picked after a rejection, which
            // is the first thing an operator does when one is turned away.
            event.target.value = ''
          }}
        />
        <Button
          variant="outline"
          size="sm"
          icon="upload"
          className="mt-3"
          loading={busy}
          disabled={disabled || atCapacity}
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </Button>
      </div>

      {failed.length > 0 && (
        <ul className="flex flex-col gap-1 rounded border border-error/30 bg-state-haltedSurface px-3 py-2">
          {failed.map((message) => (
            <li key={message} className="flex items-start gap-1.5 text-body-sm text-error">
              <Icon name="alert-circle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {message}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="group relative overflow-hidden rounded border border-outline-variant bg-white"
            >
              <img src={image.url} alt={image.alt || ''} className="aspect-[4/5] w-full object-cover" />

              {/* Which slot this photograph holds, said out loud — the storefront
                  does different things with the first and the second, and that is
                  not something an operator should have to infer from position. */}
              <span className="absolute left-1.5 top-1.5 rounded bg-shell-obsidian/75 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-ivory">
                {index === 0 ? 'Cover' : index === 1 ? 'Hover' : `View ${index + 1}`}
              </span>

              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {index > 0 && (
                  <IconButton
                    icon="star"
                    label="Make cover"
                    tone="gold"
                    className="bg-brand-paper/90 backdrop-blur"
                    disabled={disabled}
                    onClick={() => makeCover(image)}
                  />
                )}
                <IconButton
                  icon="trash"
                  label="Remove photograph"
                  tone="danger"
                  className="bg-brand-paper/90 backdrop-blur"
                  disabled={disabled}
                  onClick={() => remove(image)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <p className="text-body-sm text-ink-muted">
          The <span className="font-medium text-ink">cover</span> is the tile shoppers see in the grid; the second is
          the shot a card reveals on hover. The rest fill the gallery on the product page.
        </p>
      )}
    </div>
  )
}

export default ImageUploader
