import { db } from '../../db/db.js'
import { blobToBase64, base64ToBlob, dataUrlToBlob } from '../files.js'
import { getIdentity } from './identity.js'
import { wrapForRecipient, unwrapForSelf, uid } from './crypto.js'

export const PACKET_LINE = 'WOOF.LY PACKET v1'
export const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000

/* ------------------------------------------------------------------ *
 *  Woof objects + envelopes
 * ------------------------------------------------------------------ */

export async function makeWoof({ type, message, payload }) {
  const resolved = await getIdentity()
  if (!resolved) throw new Error('No Woof identity yet.')
  return {
    schemaVersion: 1,
    id: uid('woof'),
    type,
    createdAt: Date.now(),
    sender: {
      handle: resolved.identity.handle,
      name: resolved.identity.name,
      avatar: resolved.identity.avatar,
      mailbox: resolved.identity.mailbox,
      publicKey: resolved.publicKeyJwk,
    },
    message: String(message || '').trim(),
    payload: payload || {},
  }
}

/* Plaintext little header shown before decryption (id/timing/from/type). */
export function woofMeta(woof) {
  return {
    id: woof.id,
    ts: woof.createdAt,
    t: woof.type,
    fn: woof.sender.name,
    fh: woof.sender.handle,
  }
}

/* Encrypt a woof for one friend → { env, meta } ready for a packet. */
export async function wrapWoofForFriend(woof, friend) {
  if (!friend?.woofPublicKey) throw new Error(`${friend?.petName || 'Friend'} has no Woof key yet.`)
  const env = await wrapForRecipient(JSON.stringify(woof), friend.woofPublicKey)
  return { env, meta: woofMeta(woof) }
}

/* Packet file / paste text for one encrypted woof. */
export function packetText(env, meta) {
  return [PACKET_LINE, JSON.stringify({ meta, env })].join('\n')
}

export function parsePacket(text) {
  const src = String(text || '').trim()
  let body = src
  if (src.startsWith(PACKET_LINE)) body = src.slice(PACKET_LINE.length).trim()
  const parsed = JSON.parse(body)
  if (!parsed?.env || !parsed?.meta) throw new Error('That is not a Woof packet.')
  return parsed
}

/* Decrypt a parsed packet with our own private key. */
export async function decryptPacket(packet, privateKeyJwk) {
  const json = await unwrapForSelf(packet.env, privateKeyJwk)
  const woof = JSON.parse(json)
  if (woof?.schemaVersion !== 1) throw new Error('Unsupported woof version')
  woof.id = packet?.meta?.id || woof.id
  return woof
}

/* Serialize an envelope (from wrapWoofForFriend) for a friend row. */
export function friendWoofFields(friend, env, meta) {
  return {
    ...friend,
    woofPeer: true,
    lastWoof: meta.ts || Date.now(),
    lastWoofId: meta.id,
  }
}

/* ------------------------------------------------------------------ *
 *  Compose helpers
 * ------------------------------------------------------------------ */

export async function recentWalks(limit = 12) {
  const rows = await db.walks.orderBy('startTime').reverse().limit(limit).toArray()
  return rows.map((w) => ({
    kind: 'walk',
    refId: w.id,
    startTime: w.startTime,
    distanceKm: w.distanceKm || 0,
    durationSec: w.durationSec || 0,
  }))
}

export async function recentSnaps(limit = 18) {
  const rows = await db.snaps.orderBy('createdAt').reverse().limit(limit).toArray()
  const out = []
  for (const s of rows) {
    let dataUrl = null
    if (s.blob) dataUrl = await blobToBase64(s.blob).then((b64) => `data:image/webp;base64,${b64}`)
    else if (s.dataUrl) dataUrl = s.dataUrl
    if (!dataUrl) continue
    out.push({ kind: 'photo', refId: s.id, createdAt: s.createdAt, dataUrl })
  }
  return out
}

export async function unlockedBadges() {
  const rows = await db.badges.orderBy('unlockedAt').reverse().limit(18).toArray()
  return rows.map((b) => ({ kind: 'achievement', refId: b.id, title: b.title, icon: b.icon || '🏅' }))
}

export function defaultMessage(kind, ref) {
  const km = (ref?.distanceKm || 0).toFixed(2)
  if (kind === 'achievement') return ref.title ? `${ref.title}!` : 'Badge earned!'
  if (kind === 'walk') return `Just walked ${km} km!`
  if (kind === 'photo') return 'Fresh from today’s walk'
  return ''
}

export function payloadFor(kind, ref) {
  if (ref?.kind) kind = ref.kind
  switch (kind) {
    case 'achievement':
      return { badgeId: ref.refId, title: ref.title, icon: ref.icon || '🏅' }
    case 'walk':
      return {
        walkId: ref.refId,
        startedAt: ref.startTime,
        distanceKm: ref.distanceKm,
        durationSec: ref.durationSec,
      }
    case 'photo':
      return { snapId: ref.refId, dataUrl: ref.dataUrl, caption: ref.caption || '' }
    default:
      return {}
  }
}

/* ------------------------------------------------------------------ *
 *  Applying a received (decrypted) woof to local data
 * ------------------------------------------------------------------ */

export async function applyReceivedWoof(woof) {
  if (!woof?.id) throw new Error('Empty woof')
  const exists = await db.woofInbox.get(woof.id)
  if (exists) return { woof, dup: true }

  const record = {
    id: woof.id,
    createdAt: woof.createdAt || Date.now(),
    read: false,
    receivedAt: Date.now(),
    type: woof.type,
    from: woof.sender || {},
    message: woof.message || '',
    payload: woof.payload || {},
  }

  await upsertSenderFriend(woof)

  if (woof.type === 'walk') {
    const walk = {
      id: `woof_${woof.id}`,
      startTime: woof.payload.startedAt || woof.createdAt,
      endTime: (woof.payload.startedAt || woof.createdAt) + (woof.payload.durationSec || 0) * 1000,
      distanceKm: woof.payload.distanceKm || 0,
      durationSec: woof.payload.durationSec || 0,
      routeCoordinates: [],
      photos: [],
      badgesEarned: [],
      p2pFrom: woof.sender.name,
    }
    await db.walks.put(walk)
    record.appliedWalkId = walk.id
  } else if (woof.type === 'photo') {
    let blob
    if (woof.payload.dataUrl) blob = dataUrlToBlob(woof.payload.dataUrl)
    else if (woof.payload.base64) blob = base64ToBlob(woof.payload.base64, 'image/webp')
    if (blob) {
      const snap = { id: `woof_${woof.id}`, createdAt: woof.createdAt, blob, caption: woof.payload.caption || woof.message || '' }
      await db.snaps.put(snap)
      record.appliedSnapId = snap.id
    }
  }

  await db.woofInbox.put(record)
  return { woof, dup: false, record }
}

/* Remember the sender as a known Woof Friend (bilateral evidence). */
export async function upsertSenderFriend(woof) {
  const sender = woof.sender || {}
  if (!sender.handle) return null
  const all = await db.friends.toArray()
  const friend = all.find((f) => f.woofHandle && f.woofHandle === sender.handle)
  const base = {
    petName: sender.name || sender.handle,
    avatar: sender.avatar || '🐾',
    breed: '',
    addedAt: Date.now(),
    woofHandle: sender.handle,
    woofPublicKey: sender.publicKey || null,
    woofPeer: true,
    mutual: true,
    lastWoof: Date.now(),
  }
  if (friend) {
    await db.friends.update(friend.id, { ...base, addedAt: friend.addedAt })
    return friend
  }
  const created = { id: `frd_${Date.now()}_${Math.floor(Math.random() * 9999)}`, ...base }
  await db.friends.put(created)
  return created
}