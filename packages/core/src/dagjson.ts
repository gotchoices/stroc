// Canonical encoding, CIDs and verification (Specification: Content ID Generation, Verification)

import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagJson from '@ipld/dag-json'
import type { Problem, StrocDocument } from './types.js'
import { validateDocument, checkDocumentLink, type ValidationResult } from './validate.js'

export const DAG_JSON_CODE = dagJson.code

// Canonical DAG-JSON bytes of any value in the data model. Does not validate.
export function encodeDagJson(value: unknown): Uint8Array {
  return dagJson.encode(value)
}

// The CID of some bytes, as a DAG-JSON block.
export async function computeCid(bytes: Uint8Array): Promise<CID> {
  return CID.create(1, dagJson.code, await sha256.digest(bytes))
}

// The CID of any value (for example an app's data object), encoded as DAG-JSON. Does not validate.
export async function cidOfValue(value: unknown): Promise<CID> {
  return computeCid(encodeDagJson(value))
}

export interface DocumentCidResult {
  cid?: CID
  bytes?: Uint8Array
  validation: ValidationResult
}

// Validate a document and, if valid, encode it and compute its CID. Nothing is altered first:
// a document that is not already canonical is reported, not fixed.
export async function documentCid(doc: unknown): Promise<DocumentCidResult> {
  const validation = validateDocument(doc)
  if (!validation.valid) return { validation }
  const bytes = encodeDagJson(doc)
  return { cid: await computeCid(bytes), bytes, validation }
}

export interface VerifyResult {
  ok: boolean
  document?: StrocDocument
  problems: Problem[]
  validation?: ValidationResult
}

// Verify received bytes against a claimed CID: hash exactly what was received, require canonical
// DAG-JSON, then validate. Never normalizes.
export async function verifyDocument(bytes: Uint8Array, claimed: CID | string): Promise<VerifyResult> {
  const fail = (code: string, message: string): VerifyResult =>
    ({ ok: false, problems: [{ path: [], code, message }] })
  let cid: CID
  try {
    cid = typeof claimed === 'string' ? CID.parse(claimed) : claimed
  } catch {
    return fail('bad-cid', `"${String(claimed)}" is not a CID`)
  }
  const linkError = checkDocumentLink(cid)
  if (linkError) return fail('bad-cid', `the claimed CID ${linkError}`)
  const actual = await computeCid(bytes)
  if (!actual.equals(cid)) return fail('cid-mismatch', `content hashes to ${actual}, not ${cid}`)
  let value: unknown
  try {
    value = dagJson.decode(bytes)
  } catch (err) {
    return fail('bad-encoding', `not valid DAG-JSON: ${(err as Error).message}`)
  }
  const reencoded = dagJson.encode(value)
  if (!sameBytes(reencoded, bytes)) return fail('not-canonical', 'not canonical DAG-JSON (key order, spacing or number form differs)')
  const validation = validateDocument(value)
  return {
    ok: validation.valid,
    document: validation.valid ? value as StrocDocument : undefined,
    problems: validation.problems,
    validation,
  }
}

export function decodeDagJson(bytes: Uint8Array): unknown {
  return dagJson.decode(bytes)
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// Convert a plain value parsed from JSON or YAML into the data model: every {"/": "<cid>"} becomes
// a link. Malformed link objects are reported and left as they are (validation will reject them).
export function fromPlain(value: unknown): { value: unknown, problems: Problem[] } {
  const problems: Problem[] = []
  const walk = (v: unknown, at: (string | number)[]): unknown => {
    if (Array.isArray(v)) return v.map((x, i) => walk(x, [...at, i]))
    if (typeof v === 'object' && v !== null && !CID.asCID(v)) {
      const obj = v as Record<string, unknown>
      if ('/' in obj) {
        if (Object.keys(obj).length === 1 && typeof obj['/'] === 'string') {
          try { return CID.parse(obj['/']) } catch {
            const linkText = obj['/']
            problems.push({ path: at, code: 'bad-link', message: /\.(ya?ml|json)$/i.test(linkText)
              ? `"${linkText}" is a file, not a CID: run \`stroc link\` to replace it with that file's CID`
              : `"${linkText}" is not a CID` })
            return v
          }
        }
        problems.push({ path: at, code: 'bad-link', message: 'a link must be written {"/": "<cid>"} with no other keys' })
        return v
      }
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(obj)) out[k] = walk(x, [...at, k])
      return out
    }
    return v
  }
  return { value: walk(value, []), problems }
}

// Convert from the data model to plain JSON/YAML values: every link becomes {"/": "<cid>"}.
export function toPlain(value: unknown): unknown {
  const cid = CID.asCID(value)
  if (cid) return { '/': cid.toString() }
  if (Array.isArray(value)) return value.map(toPlain)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(value)) out[k] = toPlain(x)
    return out
  }
  return value
}
