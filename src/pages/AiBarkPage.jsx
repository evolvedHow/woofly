import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Bot, Sparkles, Loader2, KeyRound } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { evaluateBadges } from '../lib/badges.js'
import { formatClock } from '../lib/geo.js'

export default function AiBarkPage() {
  const { config, pet, callWoofAI, bumpAiWoofs, notify, getKey } = useApp()
  const [personaId, setPersonaId] = useState('')
  const [draft, setDraft] = useState('')
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [hasKey, setHasKey] = useState(null)

  const personas = config?.personas || []
  const activePersona = personas.find((p) => p.id === personaId) || personas[0]
  const bottomRef = useRef(null)

  const checkKey = async () => {
    const k = await getKey()
    setHasKey(!!k)
    return !!k
  }
  if (hasKey === null) checkKey()

  const send = async () => {
    const msg = draft.trim()
    if (!msg) return
    if (!activePersona) {
      notify('No personas in config — upload one in Settings.', 'err')
      return
    }
    setBusy(true)
    setDraft('')
    setHistory((h) => [...h, { id: Date.now(), role: 'user', text: msg, t: Date.now() }])
    try {
      const res = await callWoofAI({
        personaId: activePersona.id,
        message: msg,
        history: history.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
      })
      setHistory((h) => [
        ...h,
        { id: Date.now() + 1, role: 'assistant', text: res.reply, persona: res.persona?.emoji, offline: res.offline, t: Date.now() },
      ])
      await bumpAiWoofs()
      if (config) await evaluateBadges(config)
      if (res.offline) notify('Offline mode: local persona barked.')
    } catch (err) {
      notify(err.message, 'err')
    } finally {
      setBusy(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  const promptIdeas = [
    'Describe today’s walk from my snout',
    'Why is the neighbor cat such a menace?',
    'Dramatize my hydrant claim',
    'My human did not share snacks. Analysis?',
  ]

  return (
    <div className="animate-fadeIn">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Woof AI</h1>
          <p className="text-xs font-bold text-slate-400">your pup’s inner monologue, translated</p>
        </div>
        {activePersona && (
          <span className="chip text-base">{activePersona.emoji} {activePersona.name}</span>
        )}
      </header>

      {!hasKey && (
        <div className="card mb-3 flex items-center gap-3 !p-3">
          <KeyRound size={18} className="shrink-0 text-woof-peach" />
          <p className="min-w-0 flex-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            No OpenRouter key set — barks will use local canned replies. Add a key in Settings for real AI.
          </p>
          <Link to="/settings" className="shrink-0 text-xs font-black text-woof-pink">
            Settings →
          </Link>
        </div>
      )}

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => setPersonaId(p.id)}
            className={`shrink-0 rounded-2xl px-3.5 py-2 text-sm font-extrabold transition ${
              activePersona?.id === p.id
                ? 'bg-gradient-to-r from-woof-pink to-woof-peach text-white shadow-bubble'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
            }`}
          >
            {p.emoji} {p.name}
          </button>
        ))}
      </div>

      <div className="card min-h-[35vh] space-y-3">
        {history.length === 0 ? (
          <div className="grid place-items-center py-10 text-center">
            <div className="mb-2 grid h-14 w-14 place-items-center rounded-3xl bg-woof-blush dark:bg-slate-800 animate-wiggle">
              <Bot size={24} className="text-woof-pink" />
            </div>
            <p className="text-sm font-bold text-slate-400">Draft a thought, a walk note, or pure nonsense.</p>
          </div>
        ) : (
          history.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-3xl rounded-br-md bg-gradient-to-r from-woof-pink to-woof-peach px-4 py-2.5 text-sm font-bold text-white shadow-bubble">
                  {m.text}
                  <p className="mt-1 text-right text-[9px] font-extrabold text-white/60">{formatClock(m.t)}</p>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-start">
                <div className="flex items-end gap-2">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-woof-blush dark:bg-slate-800 text-base">
                    {m.persona || '🐾'}
                  </div>
                  <div className="max-w-[80%] rounded-3xl rounded-bl-md border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {m.text}
                    {m.offline && (
                      <span className="mt-1 block text-[9px] font-black uppercase tracking-widest text-amber-500">offline bark</span>
                    )}
                  </div>
                </div>
              </div>
            )
          )
        )}
        {busy && (
          <div className="flex items-start gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-woof-blush dark:bg-slate-800">
              <Loader2 size={16} className="animate-spin text-woof-pink" />
            </div>
            <div className="rounded-3xl rounded-bl-md border px-4 py-2.5 text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-800">
              thinking in tail wags…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {history.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {promptIdeas.map((i) => (
            <button key={i} onClick={() => setDraft(i)} className="chip !bg-white dark:!bg-slate-900 !py-2">
              <Sparkles size={11} /> {i}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={activePersona ? activePersona.greeting : 'Think something…'}
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3.5 text-sm font-bold"
        />
        <button onClick={send} disabled={busy || !draft.trim()} className="btn-primary !px-5">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  )
}