import { useEffect, useState } from 'react'
import { Award, Lock } from 'lucide-react'
import { db } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import { badgeProgress } from '../lib/badges.js'

export default function BadgesPage() {
  const { config } = useApp()
  const [unlocked, setUnlocked] = useState({})
  const [progress, setProgress] = useState([])

  useEffect(() => {
    if (!config) return
    db.badges.toArray().then((rows) => setUnlocked(Object.fromEntries(rows.map((r) => [r.id, r]))))
    badgeProgress(config).then(setProgress)
  }, [config])

  if (!config) return null

  const ordered = [...progress].sort((a, b) => {
    const ua = !!unlocked[a.id]
    const ub = !!unlocked[b.id]
    if (ua !== ub) return ua ? -1 : 1
    return 0
  })

  return (
    <div className="animate-fadeIn">
      <header className="mb-3">
        <h1 className="text-2xl font-black tracking-tight">Badges</h1>
        <p className="text-xs font-bold text-slate-400">proof of extreme pooch achievement</p>
      </header>

      <div className="card mb-3 flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-woof-sunny/40 text-2xl">
          {Object.keys(unlocked).length ? '🏅' : '🦴'}
        </div>
        <div>
          <p className="text-lg font-black">
            {Object.keys(unlocked).length} / {config.badges.length} badges
          </p>
          <p className="text-xs font-bold text-slate-400">Earn them the honest way — by sniffing a lot.</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {ordered.map((b) => {
          const got = unlocked[b.id]
          const pct = Math.round((b.progress || 0) * 100)
          return (
            <div
              key={b.id}
              className={`card transition ${got ? 'ring-2 ring-woof-sunny' : 'opacity-95'}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl ${
                    got ? 'bg-woof-sunny/40 animate-wiggle' : 'bg-slate-100 dark:bg-slate-800 grayscale'
                  }`}
                >
                  {got ? b.icon : <Lock size={18} className="text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-extrabold">{b.title}</p>
                    {got && <span className="chip !bg-woof-sunny/60">earned</span>}
                  </div>
                  <p className="mb-1.5 truncate text-xs text-slate-400">{b.description}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        got ? 'bg-gradient-to-r from-woof-sunny to-woof-peach' : 'bg-woof-pink/60'
                      }`}
                      style={{ width: `${got ? 100 : pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] font-extrabold text-slate-300 dark:text-slate-600">
                    {got ? `unlocked ${new Date(unlocked[b.id].unlockedAt).toLocaleDateString()}` : `${Math.min(100, pct)}% there`}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] font-bold text-slate-300 dark:text-slate-600">
        <Award size={12} /> Badge rules come from your woofly_config.yaml
      </p>
    </div>
  )
}