import { useEffect, useMemo, useState } from 'react'
import { Input, Select } from './Form'
import { INDIAN_STATES_AND_UTS } from '@/data/indiaStates'
import { districtsForState } from '@/data/indiaDistricts'
import { areasOfDistrict, pincodeDetails } from '@/services/postalApi'

function findMatchingState(rawState) {
  if (!rawState) return ''
  const clean = rawState.trim().toLowerCase()
  return (
    INDIAN_STATES_AND_UTS.find((s) => s.toLowerCase() === clean) ||
    INDIAN_STATES_AND_UTS.find((s) => s.toLowerCase().includes(clean) || clean.includes(s.toLowerCase())) ||
    rawState
  )
}

function findMatchingDistrict(state, rawDistrict) {
  if (!rawDistrict) return ''
  const list = districtsForState(state)
  const normRaw = rawDistrict.trim().toLowerCase().replace(/[^a-z]/g, '')

  // 1. Exact match
  const exact = list.find((d) => d.toLowerCase().replace(/[^a-z]/g, '') === normRaw)
  if (exact) return exact

  // 2. Common root matches (e.g. kendra -> kendrapara/kendrapada, khord -> khordha/khurda)
  const root = list.find((d) => {
    const norm = d.toLowerCase().replace(/[^a-z]/g, '')
    return (
      norm.includes(normRaw) ||
      normRaw.includes(norm) ||
      (normRaw.startsWith('kendra') && norm.startsWith('kendra')) ||
      (normRaw.startsWith('khord') && norm.startsWith('khord'))
    )
  })
  if (root) return root

  return rawDistrict
}

export function districtsMatch(d1, d2) {
  if (!d1 || !d2) return true
  const n1 = d1.trim().toLowerCase().replace(/[^a-z]/g, '')
  const n2 = d2.trim().toLowerCase().replace(/[^a-z]/g, '')
  return (
    n1 === n2 ||
    n1.includes(n2) ||
    n2.includes(n1) ||
    (n1.startsWith('kendra') && n2.startsWith('kendra')) ||
    (n1.startsWith('khord') && n2.startsWith('khord'))
  )
}

/**
 * State → District → Area → PIN, for every address form in the store.
 */
export function AddressFields({ value, onChange, errors = {} }) {
  const [districts, setDistricts] = useState(() => districtsForState(value.state))
  const [areaOptions, setAreaOptions] = useState([])
  const [loadingAreas, setLoadingAreas] = useState(false)
  const [pinStatus, setPinStatus] = useState({
    loading: false,
    verifiedDistrict: '',
    verifiedState: '',
    error: '',
  })

  const hasDistrictList = districts.length > 0

  const areaSuggestions = useMemo(() => {
    const typed = String(value.area ?? '').trim().toLowerCase()
    if (!typed || areaOptions.length <= 1) return areaOptions
    const matched = areaOptions.filter((area) => area.name.toLowerCase().includes(typed))
    return matched.length ? matched : areaOptions
  }, [areaOptions, value.area])

  /* Districts follow state change */
  useEffect(() => {
    const list = districtsForState(value.state)
    setDistricts(list)
    if (list.length && value.district && !list.includes(value.district)) {
      // If the current district doesn't match list, check if it's an alias
      const matched = findMatchingDistrict(value.state, value.district)
      if (matched && matched !== value.district && list.includes(matched)) {
        onChange({ district: matched })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.state])

  /* Areas follow district change */
  useEffect(() => {
    const district = String(value.district ?? '').trim()
    if (!district) {
      setAreaOptions([])
      return
    }
    let cancelled = false
    setLoadingAreas(true)
    areasOfDistrict(district).then((areas) => {
      if (!cancelled) {
        if (areas.length) {
          setAreaOptions(areas)
        }
        setLoadingAreas(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [value.district])

  const changeState = (state) => {
    const patch = { state }
    const list = districtsForState(state)
    if (list.length && !list.includes(value.district)) patch.district = ''
    onChange(patch)
  }

  const changeDistrict = (district) => {
    onChange({ district, area: '', pincode: '' })
    setPinStatus({ loading: false, verifiedDistrict: '', verifiedState: '', error: '' })
  }

  /** Typing/choosing an area pulls its PIN (and city) along with it. */
  const changeArea = (area) => {
    const patch = { area }
    const match = areaOptions.find((entry) => entry.name.toLowerCase() === area.trim().toLowerCase())
    if (match) {
      patch.pincode = match.pinCode
      if (!value.city) patch.city = match.name
    }
    onChange(patch)
  }

  /** Auto-lookup PIN details when 6 digits are reached */
  const lookupPin = async (pin) => {
    if (!/^\d{6}$/.test(pin)) {
      setPinStatus({ loading: false, verifiedDistrict: '', verifiedState: '', error: '' })
      return
    }

    setPinStatus((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const details = await pincodeDetails(pin)
      if (!details) {
        setPinStatus({
          loading: false,
          verifiedDistrict: '',
          verifiedState: '',
          error: `PIN code ${pin} not found in India Post records.`,
        })
        return
      }

      const targetState = findMatchingState(details.state) || value.state
      const targetDistrict = findMatchingDistrict(targetState, details.district) || details.district

      setPinStatus({
        loading: false,
        verifiedDistrict: targetDistrict,
        verifiedState: targetState,
        error: '',
      })

      // Construct patch: automatically update state, district, city & area
      const patch = {
        pincode: pin,
        state: targetState,
        district: targetDistrict,
      }

      // If user hasn't typed a city or city was from previous mismatched district, suggest block/post office
      if (!value.city || value.district !== targetDistrict) {
        patch.city = details.block && details.block !== 'NA' ? details.block : (details.areas[0] ?? '')
      }

      // Populate area options from this PIN's post offices
      if (details.areas?.length) {
        setAreaOptions(details.areas.map((a) => ({ name: a, pinCode: pin })))
        if (!value.area || !details.areas.includes(value.area)) {
          patch.area = details.areas[0]
        }
      }

      onChange(patch)
    } catch {
      setPinStatus({ loading: false, verifiedDistrict: '', verifiedState: '', error: '' })
    }
  }

  const handlePinChange = (event) => {
    const raw = event.target.value.replace(/\D/g, '').slice(0, 6)
    onChange({ pincode: raw })
    if (raw.length === 6) {
      lookupPin(raw)
    } else {
      setPinStatus({ loading: false, verifiedDistrict: '', verifiedState: '', error: '' })
    }
  }

  const handlePinBlur = () => {
    const pin = String(value.pincode ?? '').trim()
    if (pin.length === 6 && !pinStatus.verifiedDistrict && !pinStatus.loading) {
      lookupPin(pin)
    }
  }

  /* Automatically verify existing PIN code on mount/prop change */
  useEffect(() => {
    const pin = String(value.pincode ?? '').trim()
    if (/^\d{6}$/.test(pin) && !pinStatus.verifiedDistrict && !pinStatus.loading) {
      lookupPin(pin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.pincode])

  // A saved district that is not in the bundled list still has to render.
  const districtOptions = useMemo(() => {
    if (!value.district || districts.includes(value.district)) return districts
    return [value.district, ...districts]
  }, [districts, value.district])

  // Check if there is an unresolved mismatch between PIN and selected district
  const isMismatch = Boolean(
    value.pincode?.length === 6 &&
    pinStatus.verifiedDistrict &&
    value.district &&
    !districtsMatch(value.district, pinStatus.verifiedDistrict)
  )

  const pinHint = useMemo(() => {
    if (pinStatus.loading) return 'Detecting district and state from India Post…'
    if (isMismatch) return undefined
    if (pinStatus.verifiedDistrict && pinStatus.verifiedState) {
      return `✓ Verified: ${pinStatus.verifiedDistrict}, ${pinStatus.verifiedState}`
    }
    return 'Enter 6 digits — automatically detects district, state and post offices.'
  }, [pinStatus, isMismatch])

  return (
    <>
      <Select
        label="State"
        required
        placeholder="Select state"
        options={INDIAN_STATES_AND_UTS}
        value={value.state ?? ''}
        error={errors.state}
        onChange={(event) => changeState(event.target.value)}
      />

      {hasDistrictList ? (
        <Select
          label="District"
          required
          placeholder="Select district"
          options={districtOptions}
          value={value.district ?? ''}
          error={errors.district}
          onChange={(event) => changeDistrict(event.target.value)}
        />
      ) : (
        <Input
          label="District"
          required
          placeholder={value.state ? 'Type the district' : 'Pick a state first'}
          value={value.district ?? ''}
          error={errors.district}
          onChange={(event) => changeDistrict(event.target.value)}
        />
      )}

      {/* Mismatch Warning Alert */}
      {isMismatch && (
        <div className="rounded-lg border border-red-300 bg-red-50/90 p-3.5 text-body-xs text-red-900 sm:col-span-2 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <span className="text-base leading-none mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold text-red-900">
                Location Mismatch: PIN code {value.pincode} belongs to {pinStatus.verifiedDistrict} ({pinStatus.verifiedState}), but {value.district} is selected.
              </p>
              <p className="text-red-700 text-[12px] mt-0.5">
                Couriers require the PIN code and district to match for successful delivery.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange({ district: pinStatus.verifiedDistrict, state: pinStatus.verifiedState })}
            className="rounded border border-red-400 bg-white px-3 py-1.5 font-semibold text-red-900 shadow-xs hover:bg-red-100 transition-colors cursor-pointer text-xs shrink-0"
          >
            Switch to {pinStatus.verifiedDistrict}
          </button>
        </div>
      )}

      <Input
        label="Area / Locality"
        list="rehman-area-suggestions"
        placeholder={value.district ? (loadingAreas ? 'Loading areas…' : 'Start typing an area') : 'Pick a district first'}
        value={value.area ?? ''}
        error={errors.area}
        onChange={(event) => changeArea(event.target.value)}
      />
      <datalist id="rehman-area-suggestions">
        {areaSuggestions.map((area) => (
          <option key={`${area.name}-${area.pinCode}`} value={area.name}>
            {area.pinCode}
          </option>
        ))}
      </datalist>

      <Input
        label="City / Taluka"
        required
        value={value.city ?? ''}
        error={errors.city}
        onChange={(event) => onChange({ city: event.target.value })}
      />

      <Input
        label="PIN code"
        required
        inputMode="numeric"
        maxLength={6}
        value={value.pincode ?? ''}
        error={errors.pincode || pinStatus.error}
        hint={pinHint}
        onChange={handlePinChange}
        onBlur={handlePinBlur}
      />
    </>
  )
}

export default AddressFields
