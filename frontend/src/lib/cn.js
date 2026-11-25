/**
 * Tiny classname joiner. Falsy values are dropped.
 *   cn('btn', isActive && 'btn-gold', { 'opacity-50': disabled })
 */
export function cn(...parts) {
  const out = []
  for (const part of parts) {
    if (!part) continue
    if (typeof part === 'string' || typeof part === 'number') {
      out.push(part)
    } else if (Array.isArray(part)) {
      const nested = cn(...part)
      if (nested) out.push(nested)
    } else if (typeof part === 'object') {
      for (const [key, value] of Object.entries(part)) {
        if (value) out.push(key)
      }
    }
  }
  return out.join(' ')
}

export default cn
