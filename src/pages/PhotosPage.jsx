import { useEffect, useRef, useState, useCallback } from 'react'
import imageCompression from 'browser-image-compression'
import { toBlob } from 'html-to-image'
import { Camera, ImagePlus, Share2, Download, Trash2, Sparkles, Loader2, PawPrint } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { db } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import { shareFile, downloadBlob } from '../lib/files.js'
import { formatKm, formatDuration, formatDate } from '../lib/geo.js'
import { evaluateBadges } from '../lib/badges.js'

const MAX_PHOTOS = 40

function Postcard({ photoUrl, caption, walk, pet, personaEmoji, tagline }) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '3 / 4',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '1.5rem',
        fontFamily: 'Nunito, system-ui, sans-serif',
      }}
    >
      <img src={photoUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(15,23,42,.88) 0%, rgba(15,23,42,.25) 45%, transparent 70%)',
        }}
      />
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            background: 'rgba(255,255,255,.92)',
            borderRadius: 999,
            width: 34,
            height: 34,
            display: 'grid',
            placeItems: 'center',
            fontSize: 18,
            boxShadow: '0 2px 8px rgba(0,0,0,.2)',
          }}
        >
          {pet?.avatar || '🐾'}
        </span>
        <span style={{ color: '#fff', fontWeight: 900, fontSize: 13, textShadow: '0 1px 4px rgba(0,0,0,.4)' }}>
          {pet?.name || 'woof.LY'}
        </span>
      </div>
      <div style={{ position: 'absolute', right: 12, top: 12 }}>
        <span
          style={{
            background: 'linear-gradient(135deg,#22c55e,#a3e635)',
            borderRadius: 12,
            padding: '4px 10px',
            color: '#fff',
            fontSize: 11,
            fontWeight: 900,
            boxShadow: '0 2px 8px rgba(0,0,0,.25)',
          }}
        >
          {(tagline || '').slice(0, 22)}
        </span>
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14 }}>
        <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: 17, lineHeight: 1.35, textShadow: '0 1px 6px rgba(0,0,0,.5)' }}>
          {caption || 'Best day ever. Verified by sniffing.'}
        </p>
        {walk && walk.distanceKm !== undefined && (
          <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,.85)', fontWeight: 700, fontSize: 12 }}>
            {personaEmoji} {formatKm(walk.distanceKm)} · {formatDuration(walk.durationSec)} · {formatDate(walk.startTime)}
          </p>
        )}
        <p style={{ margin: '4px 0 0', color: '#fff', fontWeight: 900, fontSize: 15, letterSpacing: 1 }}>
          woof<span style={{ color: '#86efac' }}>.LY</span>
        </p>
      </div>
    </div>
  )
}

export default function PhotosPage() {
  const { config, pet, notify, callWoofAI, bumpAiWoofs } = useApp()
  const location = useLocation()
  const [snaps, setSnaps] = useState([])
  const [selected, setSelected] = useState(null)
  const [selectedUrl, setSelectedUrl] = useState(null)
  const [caption, setCaption] = useState('')
  const [walks, setWalks] = useState([])
  const [selectedWalk, setSelectedWalk] = useState(null)
  const [busy, setBusy] = useState(false)
  const [snapBusy, setSnapBusy] = useState(false)
  const [generating, setGenerating] = useState(null)
  const fileRef = useRef(null)

  const fromWalk = location.state?.fromWalk

  const refresh = useCallback(async () => {
    const all = await db.snaps.orderBy('createdAt').reverse().limit(MAX_PHOTOS).toArray()
    setSnaps(all)
    const recent = (await db.walks.orderBy('startTime').reverse().limit(5).toArray()).map((w) => ({
      id: w.id,
      startTime: w.startTime,
      distanceKm: w.distanceKm,
      durationSec: w.durationSec,
    }))
    setWalks(recent)
    if (recent.length && !selectedWalk) setSelectedWalk(recent[0])
  }, [selectedWalk])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (fromWalk && !selected) {
      const walk = fromWalk
      setSelected({ id: 'walk_photo', fromWalk: true, createdAt: Date.now() })
      setSelectedWalk({ id: walk.id, startTime: walk.startTime, distanceKm: walk.distanceKm, durationSec: walk.durationSec })
      notify('Pick a photo to put on the postcard!')
    }
  }, [fromWalk, selected, notify])

  useEffect(() => {
    if (!selected || selected.fromWalk) return
    let url
    if (selected.blob) url = URL.createObjectURL(selected.blob)
    else if (selected.dataUrl) url = selected.dataUrl
    setSelectedUrl(url)
    setCaption('')
    return () => {
      if (url && selected.blob) URL.revokeObjectURL(url)
    }
  }, [selected])

  const onPick = async (file) => {
    if (!file) return
    setSnapBusy(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 1400,
        useWebWorker: false,
        fileType: 'image/webp',
        initialQuality: 0.82,
      })
      const snap = {
        id: `snap_${Date.now()}`,
        createdAt: Date.now(),
        blob: compressed,
      }
      await db.snaps.put(snap)
      await evaluateBadges(config)
      setSnapBusy(false)
      refresh()
      setSelected(snap)
      notify('Snap stored, compressed & offline-safe! 📸')
    } catch (err) {
      setSnapBusy(false)
      notify(`Could not compress photo: ${err.message}`, 'err')
    }
  }

  const removeSnap = async (snap) => {
    await db.snaps.delete(snap.id)
    if (selected?.id === snap.id) {
      setSelected(null)
      setSelectedUrl(null)
    }
    refresh()
  }

  const generateCaption = async () => {
    if (!selectedUrl) return
    setBusy(true)
    try {
      const res = await callWoofAI({
        personaId: pet?.selectedPersonaId || config?.personas?.[0]?.id,
        message: `Write ONE punchy, witty caption (max ~12 words) for a photo taken during an exciting dog walk. No quotes, no hashtags.`,
      })
      await bumpAiWoofs()
      setCaption(res.reply)
      if (res.offline) notify('Offline persona barked a caption.')
    } catch (err) {
      notify(`Caption failed: ${err.message}`, 'err')
    } finally {
      setBusy(false)
    }
  }

  const buildPostcard = async () => {
    const node = postcardRef.current
    if (!node || !selectedUrl) return
    setGenerating('png')
    try {
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: '#0f172a',
        cacheBust: false,
      })
      const file = new File([blob], `woofcard_${Date.now()}.webp`, { type: blob.type || 'image/png' })
      const shared = await shareFile(file, 'woof.LY postcard', caption)
      if (!shared) notify('Postcard downloaded.')
    } catch (err) {
      notify(`render failed: ${err.message}`, 'err')
    } finally {
      setGenerating(null)
    }
  }

  const persona = config?.personas?.find((p) => p.id === pet?.selectedPersonaId)
  const personaEmoji = persona?.emoji || '🐾'
  const tagline = config?.app?.tagline || 'paw-sitively local & offline'
  const postcardRef = useRef(null)

  return (
    <div className="animate-fadeIn">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <header className="mb-3">
        <h1 className="text-2xl font-black tracking-tight">Woof Snap</h1>
        <p className="text-xs font-bold text-slate-400">photos marry art & legend. compressed to paw-pockets.</p>
      </header>

      <div className="card mb-3 flex flex-col gap-2.5 text-center">
        <button onClick={() => fileRef.current?.click()} disabled={snapBusy} className="btn-primary w-full py-4 text-base">
          {snapBusy ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
          {snapBusy ? 'Compressing…' : 'Snap a photo'}
        </button>
        <button onClick={() => fileRef.current?.click()} className="btn-ghost w-full text-sm">
          <ImagePlus size={16} /> Upload from gallery
        </button>
      </div>

      {snaps.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">My snaps</p>
          <div className="grid grid-cols-4 gap-2">
            {snaps.map((s) => {
              const url = s.blob ? URL.createObjectURL(s.blob) : s.dataUrl
              if (!url) return null
              return (
                <div key={s.id} className="relative group">
                  <img
                    src={url}
                    alt="snap"
                    onClick={() => setSelected(s)}
                    className={`h-20 w-full rounded-2xl object-cover shadow-card transition ${
                      selected?.id === s.id ? 'ring-2 ring-woof-pink' : ''
                    }`}
                  />
                  <button
                    onClick={() => removeSnap(s)}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-woof-ink/60 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Postcard studio</h2>
          <span className="chip">{personaEmoji} {persona?.name || 'persona'}</span>
        </div>

        {!selectedUrl ? (
          <div className="grid place-items-center py-10 text-center">
            <div className="mb-2 grid h-16 w-16 place-items-center rounded-3xl bg-woof-blush dark:bg-slate-800 animate-wiggle">
              <PawPrint size={28} className="text-woof-pink" />
            </div>
            <p className="max-w-[220px] text-sm font-bold text-slate-400">Snap or pick a photo, then stamp, caption & share a woof.LY postcard.</p>
          </div>
        ) : (
          <>
            <div ref={postcardRef} className="mb-3">
              <Postcard photoUrl={selectedUrl} caption={caption} walk={selectedWalk?.distanceKm !== undefined ? selectedWalk : null} pet={pet} personaEmoji={personaEmoji} tagline={tagline} />
            </div>

            <div className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Caption this masterpiece…"
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-bold"
                />
                <button onClick={generateCaption} disabled={busy} className="btn-ghost">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {busy ? '…' : 'AI'}
                </button>
              </div>

              {walks.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {walks.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setSelectedWalk(w)}
                      className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-extrabold transition ${
                        selectedWalk?.id === w.id
                          ? 'bg-woof-ink text-white dark:bg-white dark:text-woof-ink'
                          : 'bg-woof-blush dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {formatKm(w.distanceKm)} · {formatDuration(w.durationSec)}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={buildPostcard} disabled={generating} className="btn-primary flex-1">
                  {generating ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
                  {generating ? 'Rendering…' : 'Share postcard'}
                </button>
                <button onClick={() => downloadPostcard()} disabled={generating} className="btn-ghost">
                  <Download size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )

  async function downloadPostcard() {
    const node = postcardRef.current
    if (!node) return
    setGenerating('dl')
    try {
      const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#0f172a' })
      await downloadBlob(blob, `woofcard_${Date.now()}.png`)
      notify('Postcard saved to downloads.')
    } catch (err) {
      notify(`render failed: ${err.message}`, 'err')
    } finally {
      setGenerating(null)
    }
  }
}