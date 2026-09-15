/**
 * Helper utility to generate email variations for robust user/tutor lookups
 * Handles common spelling variations (e.g. harshavardhaan vs harshavardhan),
 * department tag variations (.25ads, .25aids, .25), and domain variations.
 */

export function getEmailVariants(email: string): string[] {
  const normalized = email?.trim()?.toLowerCase() || ''
  if (!normalized) return []

  const variants = new Set<string>()
  variants.add(normalized)

  // Generate spelling variations
  const spellingVariants = new Set<string>()
  spellingVariants.add(normalized)

  if (normalized.includes('harshavardhaan')) {
    spellingVariants.add(normalized.replace('harshavardhaan', 'harshavardhan'))
  }
  if (normalized.includes('harshavardhan')) {
    spellingVariants.add(normalized.replace('harshavardhan', 'harshavardhaan'))
  }

  // For each spelling variant, generate department suffix and domain variants
  for (const sVar of Array.from(spellingVariants)) {
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
