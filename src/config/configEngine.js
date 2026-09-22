import { load, dump } from 'js-yaml'
import { v4 as uuidv4 } from './uuid.js'
import { db } from '../db/db.js'
import defaultYaml from './default_config.yaml?raw'

export const FALLBACK_CONFIG = {
  version: '1.0.0',
  app: {
    name: 'woof.LY',
    tagline: 'paw-sitively local & offline',
    avatar_default: '🐾',
    max_photo_bytes: 204800,
    accent: '#f472b6',
    share_prefix: 'https://woof.ly/#/sniff?data=',
    map_default: [40.7128, -74.006],
  },
  personas: [
    {
      id: 'sassy_pug',
      name: 'Sassy Pug',
      emoji: '🐶',
      style: 'sassy',
      greeting: 'We interrupt this walk for a dramatic announcement: I am adorable.',
      system_prompt:
        'You are Sassy Pug, a grumpy-but-loving pug who narrates the day as a witty dog monologue. Reply in 1-3 short sentences. Family friendly. Never reveal you are an AI.',
    },
  ],
  badges: [
    { id: 'first_tail_wag', title: 'First Tail Wag', icon: '🐶', description: 'Complete your very first walk.', condition: { type: 'walks_count', threshold: 1 } },
  ],
  openrouter_defaults: {
    base_url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4o-mini',
    temperature: 0.9,
    max_tokens: 240,
  },
  walk_defaults: { min_gps_accuracy: 40, pause_distance_threshold_m: 3 },
}

export function parseConfigYaml(text) {
  let raw
  try {
    raw = load(text)
  } catch (err) {
    throw new Error(`Could not parse YAML: ${err.message}`)
  }
  return validateConfig(raw)
}

export function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('Config root must be a YAML mapping')
  if (typeof cfg.version !== 'string') throw new Error('Missing string field: version')
  if (!Array.isArray(cfg.personas) || cfg.personas.length === 0) {
    throw new Error('Missing array field: personas (need at least one)')
  }
  cfg.personas.forEach((p, i) => {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.system_prompt !== 'string') {
      throw new Error(`personas[${i}] must include string fields id, name, system_prompt`)
    }
  })
  if (!Array.isArray(cfg.badges)) throw new Error('Missing array field: badges')
  cfg.badges.forEach((b, i) => {
    if (!b || typeof b.id !== 'string' || !b.condition || typeof b.condition.type !== 'string') {
      throw new Error(`badges[${i}] must include id and condition.type`)
    }
  })
  if (!cfg.openrouter_defaults || typeof cfg.openrouter_defaults.model !== 'string') {
    throw new Error('Missing object field: openrouter_defaults (with string model)')
  }
  cfg.app = Object.assign({}, FALLBACK_CONFIG.app, cfg.app || {})
  cfg.walk_defaults = Object.assign({}, FALLBACK_CONFIG.walk_defaults, cfg.walk_defaults || {})
  cfg.openrouter_defaults = Object.assign({}, FALLBACK_CONFIG.openrouter_defaults, cfg.openrouter_defaults)
  return cfg
}

export async function getActiveConfig() {
  const rows = await db.appConfig.toArray()
  const dbCfg = rows.find((r) => r.active) || rows.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))[0]
  if (dbCfg && dbCfg.payload) return dbCfg.payload
  if (dbCfg && dbCfg.personas) return dbCfg
  return null
}

export async function saveConfig(cfg) {
  const record = {
    version: cfg.version,
    payload: cfg,
    active: 1,
    updated_at: Date.now(),
  }
  await db.appConfig.where('active').equals(1).modify((r) => (r.active = 0)).catch(() => {})
  await db.appConfig.put(record)
  return record
}

export async function seedDefaultConfig() {
  const existing = await getActiveConfig()
  if (existing) return existing
  let cfg
  try {
    cfg = parseConfigYaml(defaultYaml)
  } catch (err) {
    console.warn('Bundled YAML failed, using fallback object', err)
    cfg = validateConfig(JSON.parse(JSON.stringify(FALLBACK_CONFIG)))
  }
  await saveConfig(cfg)
  return cfg
}

export function configToYaml(cfg) {
  const normalized = { ...cfg }
  delete normalized._yaml
  return dump(normalized, { noRefs: true, lineWidth: 120 })
}

export function genSharedId(prefix = 'wl') {
  return `${prefix}_${uuidv4()}`
}