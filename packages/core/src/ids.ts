// Section ids and parameter keys (Specification: Section Ids)

const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
export const MAX_ID_LENGTH = 64

export function isValidId(value: string): boolean {
  return value.length <= MAX_ID_LENGTH && ID_PATTERN.test(value)
}

// Propose an id from a title: "Cure of Default" -> "cure-of-default".
export function suggestId(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[0-9-]+/, '')
    .slice(0, MAX_ID_LENGTH)
    .replace(/-+$/, '')
  return base || 'section'
}

// A domain `author` (Specification: Author): lowercase ASCII labels separated by dots, at least
// one dot, the last label alphabetic or an IDNA (xn--) label.
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

export function isDomain(value: string): boolean {
  return DOMAIN_PATTERN.test(value)
}

// True when the value would be a domain if written in lowercase (for lint advice).
export function looksLikeDomain(value: string): boolean {
  return !isDomain(value) && isDomain(value.toLowerCase())
}
