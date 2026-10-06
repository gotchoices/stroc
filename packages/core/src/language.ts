// BCP 47 language tags in canonical case (Specification: Field Definitions)
//
// Checks well-formedness of the common subset: language, extended language, script, region,
// variants, extensions and private use. The primary language must be 2-3 letters; longer ones
// are grammatical but unregistered, and usually a mistake such as "english". Canonical case:
// language lowercase, script title case, region uppercase, everything else lowercase.

const SUBTAG_RULES = /^([a-z]{2,3}(-[a-z]{3}){0,3})(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?(-([a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*(-[a-wy-z0-9](-[a-z0-9]{2,8})+)*(-x(-[a-z0-9]{1,8})+)?$/

export function isCanonicalLanguageTag(tag: string): boolean {
  return SUBTAG_RULES.test(tag)
}

// The canonical-case spelling of a tag, or undefined if it is not well formed in any case.
export function canonicalLanguageTag(tag: string): string | undefined {
  const parts = tag.split(/[-_]/)
  let seenSingleton = false
  const fixed = parts.map((p, i) => {
    if (i === 0) return p.toLowerCase()
    if (seenSingleton) return p.toLowerCase()
    if (p.length === 1) { seenSingleton = true; return p.toLowerCase() }
    if (p.length === 4 && /^[a-zA-Z]{4}$/.test(p)) return p[0].toUpperCase() + p.slice(1).toLowerCase()
    if (p.length === 2 && /^[a-zA-Z]{2}$/.test(p)) return p.toUpperCase()
    return p.toLowerCase()
  }).join('-')
  return isCanonicalLanguageTag(fixed) ? fixed : undefined
}
