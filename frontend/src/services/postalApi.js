/**
 * India Post area / PIN-code lookups, powered by India Post's public directory.
 *
 * This provides live PIN-code verification, district, state and locality autofill.
 * Every function resolves cleanly to null/empty array on failure so users can
 * always type manually if offline.
 */

const BASE = 'https://api.postalpincode.in'
const TIMEOUT_MS = 6000

/** @type {Map<string, Promise<any> | any>} */
const cache = new Map()

async function getJson(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE}${path}`, { signal: controller.signal })
    if (!response.ok) return null
    const payload = await response.json()
    return Array.isArray(payload) ? payload[0] : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function cached(key, loader) {
  if (!cache.has(key)) {
    const pending = loader().then((res) => {
      cache.set(key, res)
      return res
    })
    cache.set(key, pending)
  }
  return Promise.resolve(cache.get(key))
}

/**
 * Areas (post offices) of a district with their PIN codes.
 * @returns {Promise<Array<{ name: string, pinCode: string }>>}
 */
export function areasOfDistrict(district) {
  const clean = String(district ?? '').trim()
  if (!clean) return Promise.resolve([])
  const key = `place:${clean.toLowerCase()}`
  return cached(key, async () => {
    const data = await getJson(`/postoffice/${encodeURIComponent(clean)}`)
    if (data?.Status !== 'Success' || !Array.isArray(data?.PostOffice)) {
      return []
    }
    return data.PostOffice
      .filter((row) => row?.Name && row?.Pincode)
      .map((row) => ({ name: String(row.Name), pinCode: String(row.Pincode) }))
  })
}

/**
 * What a PIN code covers: its area names, district, state, block/taluka.
 * @returns {Promise<{ pinCode: string, areas: string[], district: string, state: string, block: string } | null>}
 */
export function pincodeDetails(pincode) {
  const clean = String(pincode ?? '').trim()
  if (!/^\d{6}$/.test(clean)) return Promise.resolve(null)
  const key = `pin:${clean}`
  return cached(key, async () => {
    const data = await getJson(`/pincode/${clean}`)
    if (data?.Status !== 'Success' || !Array.isArray(data?.PostOffice) || data.PostOffice.length === 0) {
      return null
    }
    const offices = data.PostOffice
    const first = offices[0]
    const areas = Array.from(new Set(offices.map((row) => String(row.Name ?? '')).filter(Boolean)))
    return {
      pinCode: clean,
      areas,
      district: String(first?.District ?? '').trim(),
      state: String(first?.State ?? '').trim(),
      block: String(first?.Block ?? '').trim(),
    }
  })
}

export default { areasOfDistrict, pincodeDetails }
