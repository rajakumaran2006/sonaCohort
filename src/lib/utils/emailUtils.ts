/**
 * Helper utility to generate email variations for robust user/tutor lookups
 * Handles common spelling variations (e.g. harshavardhaan vs harshavardhan, dhivitha vs divitha),
 * middle initials (e.g. harshavardhan.s.25ads vs harshavardhan.25ads, dhivitha.m.25ads vs dhivitha.25ads),
 * department tag variations (.25ads, .25aids, .25), and domain variations.
 */

export function getEmailVariants(email: string): string[] {
  const normalized = email?.trim()?.toLowerCase() || ''
  if (!normalized) return []

  const variants = new Set<string>()
  variants.add(normalized)

  // 1. Generate spelling variations
  const spellingVariants = new Set<string>()
  spellingVariants.add(normalized)

  for (const s of Array.from(spellingVariants)) {
    // Harshavardhan variations
    if (s.includes('harshavardhaan')) {
      spellingVariants.add(s.replace('harshavardhaan', 'harshavardhan'))
    }
    if (s.includes('harshavardhan')) {
      spellingVariants.add(s.replace('harshavardhan', 'harshavardhaan'))
    }
    // Dhivitha variations
    if (s.includes('dhivitha')) {
      spellingVariants.add(s.replace('dhivitha', 'divitha'))
    }
    if (s.includes('divitha')) {
      spellingVariants.add(s.replace('divitha', 'dhivitha'))
    }
  }

  // 2. Initial variations (handle .s., .m. or trailing initials before the year/dept suffix)
  const initialVariants = new Set<string>()
  for (const s of Array.from(spellingVariants)) {
    initialVariants.add(s)

    // Handle middle initials with dots (e.g., name.s.25ads or name.m.25ads -> name.25ads and vice versa)
    const dotInitialMatch = s.match(/^([a-z0-9]+)\.([a-z])(\.[0-9a-z]+)?@(.*)$/)
    if (dotInitialMatch) {
      const [, baseName, initial, suffix = '', domain] = dotInitialMatch
      initialVariants.add(`${baseName}${suffix}@${domain}`)
      initialVariants.add(`${baseName}${initial}${suffix}@${domain}`)
    }

    // If no initial present in name, generate potential initial variants for known tutors
    const noInitialMatch = s.match(/^([a-z0-9]+)(\.[0-9a-z]+)?@(.*)$/)
    if (noInitialMatch) {
      const [, baseName, suffix = '', domain] = noInitialMatch
      if (baseName.includes('harshavardhan') || baseName.includes('harshavardhaan')) {
        initialVariants.add(`${baseName}.s${suffix}@${domain}`)
        initialVariants.add(`${baseName}s${suffix}@${domain}`)
      }
      if (baseName.includes('dhivitha') || baseName.includes('divitha')) {
        initialVariants.add(`${baseName}.m${suffix}@${domain}`)
        initialVariants.add(`${baseName}m${suffix}@${domain}`)
      }
    }
  }

  // 3. For each spelling/initial variant, generate department suffix and domain variants
  for (const sVar of Array.from(initialVariants)) {
    variants.add(sVar)

    const parts = sVar.split('@')
    if (parts.length === 2) {
      const [local, domain] = parts

      // Department suffix variations: .25ads, .25aids, .25
      const localVariants = new Set<string>()
      localVariants.add(local)

      if (local.endsWith('.25ads')) {
        const base = local.slice(0, -6)
        localVariants.add(`${base}.25aids`)
        localVariants.add(`${base}.25`)
      } else if (local.endsWith('.25aids')) {
        const base = local.slice(0, -7)
        localVariants.add(`${base}.25ads`)
        localVariants.add(`${base}.25`)
      } else if (local.endsWith('.25')) {
        const base = local.slice(0, -3)
        localVariants.add(`${base}.25ads`)
        localVariants.add(`${base}.25aids`)
      }

      // Add domain variants for all local variants
      for (const loc of Array.from(localVariants)) {
        variants.add(`${loc}@${domain}`)
        if (domain === 'sonatech.ac.in') {
          variants.add(`${loc}@sonacas.edu.in`)
        } else if (domain === 'sonacas.edu.in') {
          variants.add(`${loc}@sonatech.ac.in`)
        }
      }
    }
  }

  return Array.from(variants)
}
