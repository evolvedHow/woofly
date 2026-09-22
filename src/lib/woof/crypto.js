/* ------------------------------------------------------------------ *
 *  woof.LY end-to-end encryption (pure Web Crypto, no DOM/db deps)
 *
 *  Scheme: ECIES-ish one-shot envelopes
 *    - ephemeral ECDH P-256 keypair per message
 *    - shared secret = ECDH(ephemeral.priv, recipient.pub)  (256 bits)
 *    - AES-256-GCM key derived from that secret via HKDF-SHA-256
 *    - the ephemeral public key travels inside the envelope, so the
 *      recipient can re-derive the secret with their own private key
 *
 *  Vetted primitives only: ECDH, HKDF, AES-GCM — no bespoke crypto.
 * ------------------------------------------------------------------ */

export const ECDH = { name: 'ECDH', namedCurve: 'P-256' }
export const ENVELOPE_VERSION = 1
export const HKDF_INFO = 'woof.ly/e2ee-v1'

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n))
}

/* UTF-8 safe base64 — chunked to dodge call-stack limits on big arrays */
export function bytesToB64(bytes) {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step))
  }
  return btoa(bin)
}

export function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export function utf8ToB64(str) {
  return bytesToB64(new TextEncoder().encode(str))
}

export function b64ToUtf8(b64) {
  return new TextDecoder().decode(b64ToBytes(b64))
}

/* base64url (no padding) — used for compact pairing payloads */
export function base64UrlEncode(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function base64UrlDecode(b64u) {
  let s = String(b64u).replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function uid(prefix = 'w') {
  const rand = Math.floor(Math.random() * 0xffffff).toString(36).padStart(5, '0')
  return `${prefix}_${Date.now().toString(36)}${rand}`
}

/* --- identity keypair ---------------------------------------------- */
export async function generateWoofKeypair() {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.publicKey),
    crypto.subtle.exportKey('jwk', pair.privateKey),
  ])
  return { publicKeyJwk, privateKeyJwk }
}

/* --- HKDF → AES-256-GCM key --------------------------------------- */
async function deriveAesGcmKey(secretBits, salt) {
  const hkdf = await crypto.subtle.importKey('raw', secretBits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(HKDF_INFO) },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/* Encrypt a string for whoever owns `recipientPublicJwk`. */
export async function wrapForRecipient(payloadStr, recipientPublicJwk) {
  const recipientKey = await crypto.subtle.importKey('jwk', recipientPublicJwk, ECDH, false, [])
  const ephemeral = await crypto.subtle.generateKey(ECDH, true, ['deriveBits'])
  const secretBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: recipientKey }, ephemeral.privateKey, 256)
  const salt = randomBytes(16)
  const aesKey = await deriveAesGcmKey(new Uint8Array(secretBits), salt)
  const iv = randomBytes(12)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(payloadStr)
  )
  const ephemeralJwk = await crypto.subtle.exportKey('jwk', ephemeral.publicKey)
  return {
    v: ENVELOPE_VERSION,
    ep: ephemeralJwk,
    iv: bytesToB64(iv),
    salt: bytesToB64(salt),
    ct: bytesToB64(new Uint8Array(ciphertext)),
  }
}

/* Decrypt an envelope with the recipient's private key. Returns the string. */
export async function unwrapForSelf(envelope, privateKeyJwk) {
  if (!envelope || envelope.v !== ENVELOPE_VERSION) throw new Error('Unsupported envelope version')
  const myKey = await crypto.subtle.importKey('jwk', privateKeyJwk, ECDH, false, ['deriveBits'])
  const ephemeralPub = await crypto.subtle.importKey('jwk', envelope.ep, ECDH, false, [])
  const secretBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: ephemeralPub }, myKey, 256)
  const aesKey = await deriveAesGcmKey(new Uint8Array(secretBits), b64ToBytes(envelope.salt))
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(envelope.iv) },
    aesKey,
    b64ToBytes(envelope.ct)
  )
  return new TextDecoder().decode(new Uint8Array(plaintext))
}

/* --- opaque mailbox id (SHA-256 of handle) ------------------------- */
export async function mailboxIdFor(handle) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`woof-mailbox:${handle}`))
  return `m${bytesToB64(new Uint8Array(digest)).slice(0, 22).replace(/\W/g, '')}`
}