import { db } from '../db/db.js'
import { decodeProfile, friendFromProfile } from './passport.js'
import { evaluateBadges } from './badges.js'

export async function addFriendFromCode(encoded) {
  const payload = decodeProfile(encoded)
  const existing = await db.friends.toArray()
  const dup = existing.find(
    (f) =>
      (f.petName && payload.n && f.petName.toLowerCase() === payload.n.toLowerCase()) ||
      (payload.n && payload.c && f.ownerContact && f.ownerContact === payload.c)
  )
  if (dup) {
    await db.friends.update(dup.id, { lastWoof: Date.now() })
    return { friend: dup, added: false }
  }
  const friend = friendFromProfile(payload)
  await db.friends.put(friend)
  await evaluateBadges()
  return { friend, added: true }
}