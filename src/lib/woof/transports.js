import { db } from '../../db/db.js'
import { getIdentity } from './identity.js'
import {
  wrapWoofForFriend,
  packetText,
  parsePacket,
  decryptPacket,
  applyReceivedWoof,
  DEFAULT_TTL_MS,
} from './packets.js'

/* ------------------------------------------------------------------ *
 *  WoofTransport — the seam between app logic and delivery.
 *  Two implementations: LocalTransport (export/import .woof packets,
 *  works fully offline, zero backend) and RelayTransport (dumb mailbox
 *  API). Nothing else in the app talks to the network directly.
 * ------------------------------------------------------------------ */

export const WOOF_RELAY_KEY = 'woof_relay'

export async function getWoofSettings() {
  const row = (await db.settings.get(WOOF_RELAY_KEY)) || { key: WOOF_RELAY_KEY, value: {} }
  return { relayUrl: row.value?.relayUrl || '', relayToken: row.value?.relayToken || '', ttlMs: row.value?.ttlMs || DEFAULT_TTL_MS }
}

export async function setWoofSettings(patch) {
  const cur = await getWoofSettings()
  await db.settings.put({ key: WOOF_RELAY_KEY, value: { ...cur, ...patch } })
}

/* --- outbox -------------------------------------------------------- */

export async function queueWoofs(woof, recipients) {
  const entries = []
  for (const f of recipients) {
    const { env, meta } = await wrapWoofForFriend(woof, f)
    const createdAt = Date.now()
    const entry = {
      id: `owoof_${createdAt.toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`,
      woofId: woof.id,
      toHandle: f.woofHandle,
      toName: f.petName,
      toMailbox: f.woofMailbox,
      env,
      meta,
      status: 'queued',
      attempts: 0,
      createdAt,
      expiresAt: createdAt + (await getWoofSettings()).ttlMs,
    }
    await db.woofOutbox.put(entry)
    entries.push(entry)
  }
  return entries
}

export async function getOutbox() {
  return db.woofOutbox.orderBy('createdAt').reverse().toArray()
}

export async function deleteOutboxEntry(id) {
  await db.woofOutbox.delete(id)
}

export async function markDispatched(id) {
  await db.woofOutbox.update(id, { status: 'dispatched', dispatchedAt: Date.now() })
}

/* --- local transport ----------------------------------------------- */

export const LocalTransport = {
  kind: 'local',
  name: 'Local packet',
  note: 'Encrypted .woof packet you export and send through any channel (Messages, AirDrop, mail…).',

  async send(entry) {
    return { needsExport: true }
  },
  /* Export an outbox entry as shareable text. */
  exportEntryText(entry) {
    return packetText(entry.env, entry.meta)
  },
  /* Import a packet someone hands you (paste/file). E2E-decrypts. */
  async importPacketText(text) {
    const me = await getIdentity()
    if (!me) throw new Error('Create your Woof identity first.')
    const packet = parsePacket(text)
    const woof = await decryptPacket(packet, me.privateKeyJwk)
    const result = await applyReceivedWoof(woof)
    return result
  },
}

/* --- relay transport (dormant until a relay URL is configured) ----- */

export class RelayTransport {
  constructor({ baseUrl, token }) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '')
    this.token = token
  }

  static available() {
    return typeof fetch === 'function'
  }

  async send(entry) {
    const res = await fetch(`${this.baseUrl}/mailbox/${entry.toMailbox}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { 'X-Woof-Token': this.token } : {}) },
      body: JSON.stringify({ id: entry.woofId, ts: entry.meta.ts, expiresAt: entry.expiresAt, meta: entry.meta, envelope: entry.env }),
    })
    if (!res.ok) throw new Error(`Relay ${res.status}`)
    return { ok: true }
  }

  async receive() {
    const me = await getIdentity()
    if (!me) throw new Error('Create your Woof identity first.')
    const res = await fetch(`${this.baseUrl}/mailbox/${me.identity.mailbox}`, {
      headers: { ...(this.token ? { 'X-Woof-Token': this.token } : {}) },
    })
    if (!res.ok) throw new Error(`Relay ${res.status}`)
    const data = await res.json()
    return Array.isArray(data) ? data : data?.messages || []
  }

  async acknowledge(id) {
    const me = await getIdentity()
    await fetch(`${this.baseUrl}/mailbox/${me.identity.mailbox}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { 'X-Woof-Token': this.token } : {}) },
      body: JSON.stringify({ id }),
    })
  }

  async ensureRegistered() {
    const me = await getIdentity()
    await fetch(`${this.baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { 'X-Woof-Token': this.token } : {}) },
      body: JSON.stringify({ mailbox: me.identity.mailbox, handle: me.identity.handle }),
    })
  }
}

/* --- active transport factory -------------------------------------- */

export async function getActiveTransport() {
  const settings = await getWoofSettings()
  if (settings.relayUrl && RelayTransport.available()) {
    return { kind: 'relay', settings, transport: new RelayTransport(settings), relay: true }
  }
  return { kind: 'local', settings, transport: LocalTransport, relay: false }
}

/* Push every queued outbox entry through the active transport. */
export async function flushOutbox() {
  const active = await getActiveTransport()
  const queued = await db.woofOutbox.where('status').equals('queued').toArray()
  for (const entry of queued) {
    try {
      const result = await active.transport.send(entry)
      if (result && result.needsExport) return { pendingExport: true, sent: 0 }
      await markDispatched(entry.id)
    } catch (err) {
      await db.woofOutbox.update(entry.id, { status: 'failed', error: String(err?.message || err) })
    }
  }
  return { sent: queued.filter((e) => e.status === 'dispatched').length, pendingExport: false }
}

/* Pull the current mailbox and apply/ack each message. */
export async function syncInbox() {
  const active = await getActiveTransport()
  const me = await getIdentity()
  if (!active.relay) return { relay: false, applied: 0, dupes: 0 }
  if (!me) throw new Error('Create your Woof identity first.')
  await active.transport.ensureRegistered()
  const items = await active.transport.receive()
  let applied = 0
  let dupes = 0
  const seen = new Set()
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    try {
      const result = await LocalTransport.importPacketText(JSON.stringify({ meta: item.meta, env: item.envelope }))
      if (result.dup) dupes++
      else applied++
      await active.transport.acknowledge(item.id).catch(() => {})
    } catch (err) {
      console.warn('sync inbox item failed', err)
    }
  }
  return { relay: true, applied, dupes }
}

/* --- inbox ---------------------------------------------------------- */

export async function getInbox() {
  return db.woofInbox.orderBy('createdAt').reverse().toArray()
}

export async function markInboxRead(id) {
  await db.woofInbox.update(id, { read: true })
}

export async function deleteInboxEntry(id) {
  await db.woofInbox.delete(id)
}

export async function unreadCount() {
  return db.woofInbox.where('read').equals(false).count()
}