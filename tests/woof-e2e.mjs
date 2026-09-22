/* woof.ly e2ee core — pure node test of src/lib/woof/crypto.js + identity pure helpers
 * (no DOM, no Dexie: crypto.js has zero deps; run with Node ≥ 19 which ships WebCrypto globally)
 * Run: node tests/woof-e2e.mjs
 */
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
if (!globalThis.crypto) globalThis.crypto = webcrypto

import {
  generateWoofKeypair,
  wrapForRecipient,
  unwrapForSelf,
  uid,
  bytesToB64,
  b64ToBytes,
  utf8ToB64,
  b64ToUtf8,
  base64UrlEncode,
  base64UrlDecode,
  mailboxIdFor,
} from '../src/lib/woof/crypto.js'

let pass = 0
const ok = (name) => { pass++; console.log(`  ✓ ${name}`) }

/* --- keypairs (P-256 ECDH) ------------------------------------------- */
const luna = await generateWoofKeypair()
assert.ok(luna.publicKeyJwk?.crv === 'P-256')
assert.ok(luna.privateKeyJwk && luna.privateKeyJwk.d)
ok('Luna keypair (P-256, private key present)')
const max = await generateWoofKeypair()
assert.notEqual(luna.publicKeyJwk.x, max.publicKeyJwk.x)
ok('Max keypair — distinct public keys')

/* --- mailbox id: opaque + stable (independent of keypair) ------------ */
const h = 'LUNA-7K4P-M9Q'
const m1 = await mailboxIdFor(h)
const m2 = await mailboxIdFor(h)
assert.equal(m1, m2)
assert.ok(!m1.includes('LUNA'), 'mailbox id must not leak the handle')
assert.ok(m1.length >= 8)
ok(`mailboxIdFor(${h}) → ${m1.slice(0, 14)}… (opaque, stable, key-independent)`)

/* --- E2E: Luna wraps a woof for Max; Max unwraps it ------------------ */
const payload = JSON.stringify({
  v: 1, t: 'woof', id: uid('w'), createdAt: Date.now(),
  type: 'note', message: 'Luna says hi to Max 🐾', from: 'LUNA-7K4P-M9Q',
})
const envelope = await wrapForRecipient(payload, max.publicKeyJwk)
assert.ok(envelope.ep && envelope.iv && envelope.ct && envelope.salt)
assert.ok(!JSON.stringify(envelope).includes('hi to Max'), 'envelope must not leak plaintext')
ok('Luna wraps for Max → opaque envelope {ep,iv,ct,salt}')

const out = await unwrapForSelf(envelope, max.privateKeyJwk)
assert.equal(out, payload)
ok('Max unwraps — exact payload recovered (ECDH+HKDF+AES-GCM)')

/* --- only the intended recipient can unwrap -------------------------- */
await assert.rejects(() => unwrapForSelf(envelope, luna.privateKeyJwk))
ok('wrong private key rejected (E2EE to recipient only)')

/* --- b64 helpers round-trip ------------------------------------------ */
assert.equal(b64ToUtf8(utf8ToB64('🐾 woof')), '🐾 woof')
assert.equal(b64ToBytes(bytesToB64(new Uint8Array([1, 2, 3, 255]))).length, 4)
assert.equal(base64UrlDecode(base64UrlEncode('a+b/c==')), 'a+b/c==')
ok('b64 helpers (bytes/utf8/base64url) round-trip')

/* --- uid uniqueness --------------------------------------------------- */
const uids = new Set(Array.from({ length: 3000 }, () => uid('w')))
assert.equal(uids.size, 3000)
ok('uid() unique across 3000 draws')

console.log(`\n ✅ woof e2e: ${pass} checks passed`)
