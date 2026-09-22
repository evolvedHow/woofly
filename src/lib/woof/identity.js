import { db } from '../../db/db.js'
import { generateWoofKeypair, base64UrlEncode, base64UrlDecode, mailboxIdFor, uid } from './crypto.js'

/* ------------------------------------------------------------------ *
 *  Pure helpers (no db) — node-testable
 * ------------------------------------------------------------------ */

const SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1

export function slugName(name) {
  const base = String(name || 'PUP')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
  return base || 'PUP'
}

function randGroup(len) {
  let s = ''
  for (let i = 0; i < len; i++) s += SAFE[Math.floor(Math.random() * SAFE.length)]
  return s
}

export function makeHandle(name) {
  return `${slugName(name)}-${randGroup(4)}-${randGroup(4)}`
}

/* The pairing payload is what a QR / shared link / pasted code carries. */
export function buildPairingPayload({ handle, name, avatar, breed, publicKeyJwk, mailbox }) {
  return {
    v: 1,
    t: 'woof-pair',
    handle,
    name: name || 'Pup',
    avatar: avatar || '🐾',
    breed: breed || '',
    pub: publicKeyJwk,
    mailbox,
  }
}

export function encodePairing(payload) {
  return `W1.${base64UrlEncode(JSON.stringify(payload))}`
}

export function decodePairing(text) {
  const src = String(text).trim()
  let json = ''
  if (src.startsWith('{')) json = src
  else if (src.startsWith('W1.')) json = base64UrlDecode(src.slice(3))
  else json = base64UrlDecode(src) // accept older raw base64url too
  const payload = JSON.parse(json)
  if (!payload || payload.v !== 1 || payload.t !== 'woof-pair' || !payload.pub) {
    throw new Error('That does not look like a Woof code.')
  }
  if (!payload.pub.kty || payload.pub.crv !== 'P-256') throw new Error('Unsupported Woof key.')
  return payload
}

export async function makeIdentityRecord({ name, avatar, breed }) {
  const { publicKeyJwk, privateKeyJwk } = await generateWoofKeypair()
  const handle = makeHandle(name)
  const mailbox = await mailboxIdFor(handle)
  const identity = {
    id: 'self',
    handle,
    name: name || 'Pup',
    avatar: avatar || '🐾',
    breed: breed || '',
    mailbox,
    createdAt: Date.now(),
  }
  await db.transaction('rw', [db.woofIdentity, db.woofKeys], async () => {
    await db.woofIdentity.put(identity)
    await db.woofKeys.put({ id: 'self', publicKeyJwk, privateKeyJwk })
  })
  return { identity, publicKeyJwk, privateKeyJwk }
}

export async function getIdentity() {
  const identity = await db.woofIdentity.get('self')
  if (!identity) return null
  const keys = await db.woofKeys.get('self')
  if (!keys) return null
  return { identity, publicKeyJwk: keys.publicKeyJwk, privateKeyJwk: keys.privateKeyJwk }
}

/* Create the Woof identity on first use; no-op if it already exists. */
export async function ensureIdentity({ name, avatar, breed } = {}) {
  const existing = await getIdentity()
  if (existing) return existing
  return makeIdentityRecord({ name, avatar, breed })
}

export async function buildMyPairingText() {
  const resolved = await ensureIdentity()
  const payload = buildPairingPayload({
    handle: resolved.identity.handle,
    name: resolved.identity.name,
    avatar: resolved.identity.avatar,
    breed: resolved.identity.breed,
    publicKeyJwk: resolved.publicKeyJwk,
    mailbox: resolved.identity.mailbox,
  })
  return { payload, text: encodePairing(payload), resolved }
}

export function newFriendId() {
  return uid('frd')
}