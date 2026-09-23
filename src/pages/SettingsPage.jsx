import { useRef, useState, useEffect } from 'react'
import {
  Upload,
  Download,
  Moon,
  Sun,
  Key,
  Dog,
  Trash2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  WifiOff,
  Cloud,
} from 'lucide-react'
import { db } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import { parseConfigYaml, saveConfig, configToYaml } from '../config/configEngine.js'
import { downloadBlob } from '../lib/files.js'
import { getWoofSettings, setWoofSettings } from '../lib/woof/transports.js'
import GoogleDrive from '../components/GoogleDrive.jsx'

const AVATARS = ['🐾', '🐶', '🐕', '🐕‍🦺', '🐩', '🧸', '🐈', '🦊', '🐰', '🦮', '🐺', '🐼']

export default function SettingsPage() {
  const { config, pet, savePet, refreshConfig, setInstallPrompt, installPrompt, notify, setKey, getKey } = useApp()
  const [name, setName] = useState(pet?.name || '')
  const [breed, setBreed] = useState(pet?.breed || '')
  const [contact, setContact] = useState(pet?.ownerContact || '')
  const [avatar, setAvatar] = useState(pet?.avatar || config?.app?.avatar_default || '🐾')
  const [personaId, setPersonaId] = useState(pet?.selectedPersonaId || config?.personas?.[0]?.id)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyLoaded, setKeyLoaded] = useState(false)
  const fileRef = useRef(null)
  const [applying, setApplying] = useState(false)
  const [relayUrl, setRelayUrl] = useState('')
  const [relayToken, setRelayToken] = useState('')
  const [relayLoaded, setRelayLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    getWoofSettings().then((s) => {
      if (!alive) return
      setRelayUrl(s.relayUrl)
      setRelayToken(s.relayToken)
      setRelayLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!keyLoaded) {
    getKey().then((k) => {
      setKeyDraft(k)
      setKeyLoaded(true)
    })
  }

  const doSavePet = async () => {
    if (!name.trim()) {
      notify('Your pup needs a name!', 'err')
      return
    }
    await savePet({ name: name.trim(), breed: breed.trim(), selectedPersonaId: personaId, avatar, ownerContact: contact.trim() })
    notify(`${name.trim()} has been updated. A+ dog.`)
  }

  const personas = config?.personas || []

  const onUploadYaml = async (file) => {
    if (!file) return
    setApplying(true)
    try {
      const text = await file.text()
      const cfg = parseConfigYaml(text)
      await saveConfig(cfg)
      await refreshConfig()
      notify(`Config applied! ${cfg.personas.length} personas, ${cfg.badges.length} badges.`)
    } catch (err) {
      notify(err.message, 'err')
    } finally {
      setApplying(false)
    }
  }

  const exportYaml = async () => {
    if (!config) return
    const y = configToYaml(JSON.parse(JSON.stringify(config)))
    const blob = new Blob([y], { type: 'text/yaml' })
    await downloadBlob(blob, 'woofly_config.yaml')
    notify('woofly_config.yaml exported.')
  }

  const saveKeyDraft = async () => {
    await setKey(keyDraft.trim())
    notify('OpenRouter key saved. true AIs unlocked.')
  }

  const doWoofSettings = async () => {
    await setWoofSettings({ relayUrl: relayUrl.trim(), relayToken: relayToken.trim() })
    notify(`Relay ${relayUrl.trim() ? 'saved' : 'cleared'} — you can move woofs through it later if you fancy.`)
  }

  const resetAll = async () => {
    if (!confirm('Remove all walks, photos, friends, hydrants, badges & pets? This cannot be undone.')) return
    await Promise.all([
      db.walks.clear(),
      db.snaps.clear(),
      db.friends.clear(),
      db.hydrants.clear(),
      db.badges.clear(),
      db.petProfiles.clear(),
      db.chats.clear(),
    ])
    localStorage.removeItem('woofly_session')
    notify('All local data wiped. Fresh sniffs await.')
  }

  return (
    <div className="animate-fadeIn space-y-3">
      <header>
        <h1 className="text-2xl font-black tracking-tight">Settings</h1>
        <p className="text-xs font-bold text-slate-400">tune the pack you are</p>
      </header>

      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
          <Dog size={14} /> My pup
        </h3>
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-woof-blush dark:bg-slate-800 text-4xl">{avatar}</div>
          <div className="grid flex-1 grid-cols-4 gap-1.5">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                className={`grid h-11 place-items-center rounded-2xl text-xl transition ${
                  avatar === a ? 'bg-woof-pink/20 ring-2 ring-woof-pink' : 'bg-woof-blush dark:bg-slate-800'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pet name" className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 font-bold" />
          <div className="grid grid-cols-2 gap-2.5">
            <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="Breed" className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 font-bold" />
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact (optional)" className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 font-bold" />
          </div>
          <p className="text-[11px] font-bold text-slate-400">Pick a voice for your pup’s AI barks:</p>
          <div className="grid grid-cols-3 gap-2">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => setPersonaId(p.id)}
                className={`rounded-2xl px-2 py-2.5 text-center text-xs font-extrabold transition ${
                  personaId === p.id ? 'bg-gradient-to-r from-woof-pink to-woof-peach text-white shadow-bubble' : 'bg-woof-blush dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                <span className="block text-lg">{p.emoji}</span>
                {p.name}
              </button>
            ))}
          </div>
          <button onClick={doSavePet} className="btn-primary w-full">
            Save pup
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
          <ShieldCheck size={14} /> Dynamic config
        </h3>
        <p className="mb-3 text-xs font-bold text-slate-500 dark:text-slate-400">
          Personas, AI prompts and badge rules live in a local <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">woofly_config.yaml</code>. Upload a new one to remix the app without code changes.
        </p>
        <input ref={fileRef} type="file" accept=".yaml,.yml,text/yaml" className="hidden" onChange={(e) => onUploadYaml(e.target.files?.[0])} />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={applying} className="btn-primary">
            <Upload size={16} /> {applying ? 'Applying…' : 'Upload config'}
          </button>
          <button onClick={exportYaml} className="btn-ghost">
            <Download size={16} /> Export config
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-400">
          <span className="chip">version {config?.version}</span>
          <span className="chip">{personas.length} personas</span>
          <span className="chip">{config?.badges?.length} badges</span>
          <span className="chip">{config?.openrouter_defaults?.model}</span>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
          <Key size={14} /> OpenRouter AI key
        </h3>
        <p className="mb-3 text-xs font-bold text-slate-500 dark:text-slate-400">
          Stored locally. Used only to call <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">openrouter.ai</code> from your device. Without it, barks are canned & offline.
        </p>
        <div className="flex gap-2">
          <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-or-…" className="min-w-0 flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 font-bold" />
          <button onClick={saveKeyDraft} className="btn-ghost">
            Save
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
          <Sparkles size={14} /> Appearance & app
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <DarkModeButton />
          {installPrompt && (
            <button
              onClick={async () => {
                installPrompt.prompt()
                const r = await installPrompt.userChoice
                if (r.outcome === 'accepted') setInstallPrompt(null)
              }}
              className="btn-ghost"
            >
              <Download size={16} /> Install PWA
            </button>
          )}
          <button onClick={() => navigator.serviceWorker?.getRegistration().then((r) => r?.update()).then(() => notify('Service worker refreshed.'))} className="btn-ghost">
            <RefreshCw size={16} /> Refresh SW
          </button>
        </div>
        <p className="mt-3 flex items-center gap-1 text-[11px] font-bold text-slate-400">
          <WifiOff size={12} /> Fully offline once loaded. Map tiles & fonts are cached.
        </p>
      </div>

      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
          <Cloud size={14} /> Woof relay (optional)
        </h3>
        <p className="mb-3 text-xs font-bold text-slate-500 dark:text-slate-400">
          A time-blind mailbox for moving woofs to from-the-couch friends. Leave it blank and every woof travels <em className="not-italic">pup-to-pup</em> as a local packet — no server, fully private. Only fill this in if you actually run a relay.
        </p>
        <div className="mb-2 flex flex-col gap-2">
          <input value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} placeholder="https://relay.example.dev/postbox" className="input w-full" />
          <input type="password" value={relayToken} onChange={(e) => setRelayToken(e.target.value)} placeholder="relay token (kept on-device)" className="input w-full" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={doWoofSettings} className="btn-primary">
            <Cloud size={16} /> Save relay
          </button>
          <span className="text-[11px] font-bold text-slate-400">Documents it via settings; nothing leaves your device until you Woof it.</span>
        </div>
      </div>

      <GoogleDrive />

      <div className="card !border-rose-200 dark:!border-rose-900">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-rose-400">Danger zone</h3>
        <button onClick={resetAll} className="btn-ghost w-full text-rose-500">
          <Trash2 size={16} /> Wipe all local data
        </button>
      </div>

      <p className="pb-4 text-center text-[11px] font-bold text-slate-300 dark:text-slate-600">
        woof.LY v{config?.version} · nothing, ever, leaves your device unless you press a button.
      </p>
    </div>
  )
}

function DarkModeButton() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    setDark(next)
    if (next) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    localStorage.setItem('woofly_theme', next ? 'dark' : 'light')
  }
  return (
    <button onClick={toggle} className="btn-ghost">
      {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? 'Light mode' : 'Dark mode'}
    </button>
  )
}