import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { db } from '../db/db.js'
import { getActiveConfig, seedDefaultConfig } from '../config/configEngine.js'
import { evaluateBadges } from '../lib/badges.js'

const AppContext = createContext(null)

const CANNED_REPLIES = [
  'WOOF. That is a 10/10 sentence and I accept nothing less from my humans.',
  'I sniffed your message twice. Suspicious. Delicious. Approving.',
  'Confirmed with the fire hydrant council: vibe is very good.',
  'Careful. That sounds like a plan, and plans require TREATS.',
  'I wrote this down in my head. Somewhere. Near the squirrels.',
  '10/10. My tail is doing a full oscillation. Please note the achievement.',
]

export function AppProvider({ children }) {
  const [config, setConfig] = useState(null)
  const [pet, setPet] = useState(null)
  const [ready, setReady] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [toast, setToast] = useState(null)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const notify = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind, id: Date.now() })
  }, [])

  const refreshConfig = useCallback(async () => {
    const cfg = await getActiveConfig()
    if (cfg) {
      setConfig(cfg)
      return cfg
    }
    const seeded = await seedDefaultConfig()
    setConfig(seeded)
    return seeded
  }, [])

  const loadPet = useCallback(async () => {
    const me = await db.petProfiles.where('id').equals('me').first()
    setPet(me || null)
    return me || null
  }, [])

  const bootstrap = useCallback(async () => {
    await Promise.all([refreshConfig(), loadPet()])
    setReady(true)
  }, [refreshConfig, loadPet])

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const onOff = () => setOnline(navigator.onLine)
    window.addEventListener('online', onOff)
    window.addEventListener('offline', onOff)
    return () => {
      window.removeEventListener('online', onOff)
      window.removeEventListener('offline', onOff)
    }
  }, [])

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const savePet = useCallback(async (fields) => {
    const existing = pet || {}
    const next = {
      id: 'me',
      name: fields.name || existing.name || 'Pupper',
      breed: fields.breed || existing.breed || '',
      selectedPersonaId: fields.selectedPersonaId || existing.selectedPersonaId || config?.personas?.[0]?.id,
      avatarSvg: fields.avatarSvg || existing.avatarSvg || '',
      avatar: fields.avatar !== undefined ? fields.avatar : existing.avatar,
      ownerContact: fields.ownerContact !== undefined ? fields.ownerContact : existing.ownerContact,
      created_at: existing.created_at || Date.now(),
    }
    if (!next.avatar && !next.avatarSvg) next.avatar = config?.app?.avatar_default || '🐾'
    await db.petProfiles.put(next)
    setPet(next)
    return next
  }, [pet, config])

  const getKey = useCallback(async () => {
    const row = await db.settings.get('openrouter_key')
    return row ? row.value : ''
  }, [])

  const setKey = useCallback(async (value) => {
    await db.settings.put({ key: 'openrouter_key', value })
  }, [])

  const bumpAiWoofs = useCallback(async () => {
    const row = (await db.settings.get('ai_woofs')) || { key: 'ai_woofs', value: 0 }
    await db.settings.put({ ...row, value: Number(row.value || 0) + 1 })
  }, [])

  const callWoofAI = useCallback(async ({ personaId, message, history = [] }) => {
    const persona = config?.personas?.find((p) => p.id === personaId) || config?.personas?.[0]
    if (!persona) throw new Error('No persona configured. Upload a config in Settings.')
    const defaults = config?.openrouter_defaults || {}
    const key = await getKey()

    if (!key || !navigator.onLine) {
      const msg = CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)]
      return { offline: true, persona, reply: msg }
    }

    const messages = [
      { role: 'system', content: persona.system_prompt },
      ...(history || []),
      { role: 'user', content: message },
    ]

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)

    let res
    try {
      res = await fetch(defaults.base_url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': defaults.site_url || 'https://woof.ly',
          'X-Title': defaults.app_name || 'woof.LY',
        },
        body: JSON.stringify({
          model: defaults.model,
          messages,
          temperature: defaults.temperature ?? 0.9,
          max_tokens: defaults.max_tokens ?? 240,
        }),
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 160)}`)
    }

    const data = await res.json()
    const reply = data?.choices?.[0]?.message?.content?.trim() || '...and then the walk continued. The end.'
    return { offline: false, persona, reply }
  }, [config, getKey])

  const value = {
    config,
    pet,
    ready,
    online,
    installPrompt,
    setInstallPrompt,
    toast,
    notify,
    refreshConfig,
    savePet,
    loadPet,
    getKey,
    setKey,
    bumpAiWoofs,
    callWoofAI,
    evaluateBadges,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}