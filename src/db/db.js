import Dexie from 'dexie'

export const db = new Dexie('woofly')

db.version(1).stores({
  appConfig: 'version',
  petProfiles: 'id, name, createdAt',
  walks: 'id, startTime',
  friends: 'id, addedAt',
  hydrants: 'id, claimedAt',
  badges: 'id, unlockedAt',
  snaps: 'id, createdAt',
  settings: 'key',
  chats: 'id, createdAt',
})

export async function dbSnapshot() {
  const [pet, walks, friends, hydrants, badges, snaps, auth, allConfig] = await Promise.all([
    db.petProfiles.toArray(),
    db.walks.toArray(),
    db.friends.toArray(),
    db.hydrants.toArray(),
    db.badges.toArray(),
    db.snaps.toArray(),
    db.settings.get('openrouter_key'),
    db.appConfig.toArray(),
  ])
  return {
    exportedAt: new Date().toISOString(),
    app: 'woof.ly',
    version: 1,
    pet,
    walks,
    friends,
    hydrants,
    badges,
    snaps,
    auth,
    config: allConfig,
  }
}

export async function importSnapshot(snap) {
  if (!snap || snap.app !== 'woof.ly') throw new Error('Not a valid woof.LY backup file')
  await db.transaction(
    'rw',
    [db.petProfiles, db.walks, db.friends, db.hydrants, db.badges, db.snaps, db.settings, db.appConfig],
    async () => {
      await Promise.all([
        db.petProfiles.clear(),
        db.walks.clear(),
        db.friends.clear(),
        db.hydrants.clear(),
        db.badges.clear(),
        db.snaps.clear(),
        db.settings.clear(),
        db.appConfig.clear(),
      ])
      if (Array.isArray(snap.pet)) for (const r of snap.pet) await db.petProfiles.put(r)
      if (Array.isArray(snap.walks)) for (const r of snap.walks) await db.walks.put(r)
      if (Array.isArray(snap.friends)) for (const r of snap.friends) await db.friends.put(r)
      if (Array.isArray(snap.hydrants)) for (const r of snap.hydrants) await db.hydrants.put(r)
      if (Array.isArray(snap.badges)) for (const r of snap.badges) await db.badges.put(r)
      if (Array.isArray(snap.snaps)) for (const r of snap.snaps) await db.snaps.put(r)
      if (snap.auth) await db.settings.put({ key: 'openrouter_key', value: snap.auth.value })
      if (Array.isArray(snap.config)) for (const r of snap.config) await db.appConfig.put(r)
    }
  )
}