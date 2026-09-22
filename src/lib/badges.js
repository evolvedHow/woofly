import { db } from '../db/db.js'
import { routeDistanceKm } from './geo.js'

async function collectStats() {
  const [walks, hydrants, friends, snaps, settings] = await Promise.all([
    db.walks.toArray(),
    db.hydrants.toArray(),
    db.friends.toArray(),
    db.snaps.toArray(),
    db.settings.toArray(),
  ])

  const walkPhotos = walks.reduce((n, w) => n + (Array.isArray(w.photos) ? w.photos.length : 0), 0)
  const aiWoofs = Number((settings.find((s) => s.key === 'ai_woofs') || {}).value || 0)

  return {
    walks_count: walks.length,
    total_distance_km: walks.reduce((n, w) => n + Number(w.distanceKm || 0), 0),
    hydrants_claimed: hydrants.length,
    photos_taken: walkPhotos + snaps.length,
    friends_count: friends.length,
    ai_woofs: aiWoofs,
  }
}

export async function evaluateBadges(config) {
  const [stats, unlocked] = await Promise.all([collectStats(), db.badges.toArray()])
  const have = new Set(unlocked.map((b) => b.conditionType || b.id))
  const earned = []
  for (const badge of config.badges) {
    if (!badge.enabled && badge.enabled !== undefined) continue
    if (have.has(badge.id)) continue
    const cond = badge.condition || {}
    let value = stats[cond.type]
    if (value === undefined) continue
    if (cond.op === 'le' ? value <= cond.threshold : value >= cond.threshold) {
      const record = {
        id: badge.id,
        title: badge.title,
        icon: badge.icon,
        description: badge.description,
        conditionType: cond.type,
        unlockedAt: Date.now(),
      }
      await db.badges.put(record)
      earned.push(record)
    }
  }
  return earned
}

export async function badgeProgress(config) {
  const stats = await collectStats()
  return config.badges.map((b) => {
    const cond = b.condition || {}
    const value = stats[cond.type] || 0
    const threshold = cond.threshold || 1
    return { ...b, value, threshold, progress: Math.min(1, value / threshold) }
  })
}