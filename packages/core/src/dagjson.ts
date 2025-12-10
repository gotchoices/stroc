import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagJson from '@ipld/dag-json'
import { StrocDocument } from './types.js'
import { normalizeDocument } from './normalize.js'
import { validateDocument } from './validate.js'

export async function encodeDagJson(doc: unknown): Promise<Uint8Array> {
  return dagJson.encode(doc)
}

export async function computeCid(bytes: Uint8Array): Promise<string> {
  const hash = await sha256.digest(bytes)
  const cid = CID.create(1, dagJson.code, hash)
  return cid.toString()
}

export async function cidFromDocument(doc: StrocDocument): Promise<{ cid?: string; errors?: string[] }> {
  const norm = normalizeDocument(doc)
  const { valid, errors } = validateDocument(norm)
  if (!valid) return { errors }
  const bytes = await encodeDagJson(norm)
  const cid = await computeCid(bytes)
  return { cid }
}

