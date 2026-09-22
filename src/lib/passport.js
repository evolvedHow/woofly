export function encodeProfile(pet) {
  const payload = {
    v: 1,
    n: pet.name,
    b: pet.breed,
    a: pet.avatar || '',
    p: pet.selectedPersonaId || '',
    c: pet.ownerContact || '',
  }
  const json = JSON.stringify(payload)
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
}

export function decodeProfile(encoded) {
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    const json = new TextDecoder().decode(bytes)
    const payload = JSON.parse(json)
    if (!payload || payload.v !== 1) throw new Error('unsupported version')
    return payload
  } catch (err) {
    throw new Error(`Bad sniff code: ${err.message}`)
  }
}

export function friendFromProfile(p) {
  return {
    id: `friend_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    petName: p.n,
    ownerContact: p.c || '',
    avatar: p.a || '🐾',
    breed: p.b || '',
    personaId: p.p || '',
    addedAt: Date.now(),
    lastWoof: Date.now(),
  }
}