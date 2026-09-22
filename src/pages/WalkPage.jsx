import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { Play, Pause, Flag, Sparkles, RotateCcw, MapPin, Timer, Footprints, Navigation } from 'lucide-react'
import { db } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import { haversineMeters, formatKm, formatDuration } from '../lib/geo.js'
import { meIcon, hydrantIcon, hydrantConfirmIcon } from '../lib/mapIcons.js'
import { evaluateBadges } from '../lib/badges.js'

const SESSION_KEY = 'woofly_session'

function MapGlue({ pos, path, hydrants, claimed }) {
  const map = useMap()
  const [glued, setGlued] = useState(false)
  useEffect(() => {
    if (pos) {
      map.setView(pos, Math.max(map.getZoom(), glued ? map.getZoom() : 15), { animate: false })
      setGlued(true)
    }
  }, [pos, map, glued])
  useEffect(() => {
    if (path.length > 1) {
      const b = L.polyline(path, {}).getBounds()
      if (map.getBounds() && !map.getBounds().contains(b)) map.fitBounds(b, { padding: [40, 40], animate: false })
    }
  }, [path, map])
  const me = meIcon(true)
  return (
    <>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      {path.length > 1 && (
        <Polyline positions={path} pathOptions={{ color: '#f472b6', weight: 5, opacity: 0.85 }} />
      )}
      {claimed && <Marker position={[claimed.lat, claimed.lng]} icon={hydrantConfirmIcon()} />}
      {hydrants
        .filter((h) => !claimed || h.id !== claimed.id)
        .map((h) => (
          <Marker key={h.id} position={[h.lat, h.lng]} icon={hydrantIcon()} />
        ))}
      {pos && <Marker position={pos} icon={me} />}
    </>
  )
}

function HydrantModal({ open, onClose, onSubmit }) {
  const { config, notify } = useApp()
  const [nickname, setNickname] = useState('')
  const [note, setNote] = useState('')
  if (!open) return null
  const defaultPrompt = config?.walk_defaults?.hydrant_claim_prompt || 'Name your territory:'
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-woof-ink/50 p-4 dark:bg-black/60">
      <div className="card w-full max-w-sm animate-fadeIn">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-2xl">🚿</span>
          <h3 className="text-lg font-black">Claim Hydrant</h3>
        </div>
        <p className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">{defaultPrompt}</p>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. The Grotto Corner"
          className="mb-2 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 font-bold"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Smells worth noting…"
          className="mb-4 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 font-bold"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!nickname.trim()) {
                notify('A hydrant needs a name!', 'err')
                return
              }
              onSubmit(nickname.trim(), note.trim())
              setNickname('')
              setNote('')
            }}
            className="btn-primary flex-1"
          >
            Claim it
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WalkPage() {
  const { config, pet, notify } = useApp()
  const navigate = useNavigate()
  const [status, setStatus] = useState('pre')
  const [startTime, setStartTime] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [path, setPath] = useState([])
  const [pos, setPos] = useState(null)
  const [gps, setGps] = useState('idle')
  const [hydrants, setHydrants] = useState([])
  const [hydrantModal, setHydrantModal] = useState(false)
  const [pendingClaim, setPendingClaim] = useState(null)
  const [summary, setSummary] = useState(null)

  const statusRef = useRef('pre')
  const lastRef = useRef(null)
  const distRef = useRef(0)
  const pathRef = useRef([])
  const sessionIdRef = useRef(null)

  const persist = useCallback((patch) => {
    try {
      const cur = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...cur, ...patch }))
    } catch (e) {
      console.warn(e)
    }
  }, [])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY))
      if (saved && saved.startTime) {
        sessionIdRef.current = saved.sessionId
        setStartTime(saved.startTime)
        setElapsed(saved.elapsed || 0)
        setDistance(saved.distance || 0)
        setPath(saved.path || [])
        pathRef.current = saved.path || []
        distRef.current = (saved.distance || 0) * 1000
        const last = (saved.path || []).slice(-1)[0]
        lastRef.current = last || null
        setPos(last || null)
        setStatus('paused')
      }
    } catch (e) {
      console.warn(e)
    }
  }, [])

  useEffect(() => {
    statusRef.current = status
    if (status === 'active') persist({ startTime, elapsed, distance, path: pathRef.current, sessionId: sessionIdRef.current })
  }, [status, startTime, elapsed, distance, persist])

  useEffect(() => {
    if (!navigator.geolocation) {
      setGps('denied')
      return
    }
    let disposed = false
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (disposed) return
        const c = [p.coords.latitude, p.coords.longitude]
        setPos(c)
        setGps('ok')
        if (statusRef.current === 'active') {
          if (lastRef.current) {
            const d = haversineMeters(lastRef.current, c)
            const thresh = config?.walk_defaults?.pause_distance_threshold_m || 3
            if (d > thresh) {
              distRef.current += d
              setDistance(distRef.current / 1000)
              pathRef.current = [...pathRef.current, c]
              setPath(pathRef.current)
            }
          }
          lastRef.current = c
        } else if (statusRef.current === 'pre' || statusRef.current === 'done') {
          lastRef.current = c
        }
      },
      (err) => {
        if (!disposed) setGps(err.code === 1 ? 'denied' : 'err')
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    )
    return () => {
      disposed = true
      navigator.geolocation.clearWatch(id)
    }
  }, [config])

  useEffect(() => {
    db.hydrants.toArray().then(setHydrants)
  }, [])

  useEffect(() => {
    if (status !== 'active') return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  const start = () => {
    if (!pos) {
      notify('Finding your paw position first…', 'err')
      return
    }
    const sId = `walk_${Date.now()}`
    sessionIdRef.current = sId
    setStartTime(Date.now())
    setElapsed(0)
    setDistance(0)
    setPath([])
    setSummary(null)
    pathRef.current = []
    distRef.current = 0
    lastRef.current = pos
    setStatus('active')
  }

  const pause = () => setStatus('paused')
  const resume = () => setStatus('active')

  const cancelSession = () => {
    localStorage.removeItem(SESSION_KEY)
    sessionIdRef.current = null
    setSummary(null)
    setStatus('pre')
    setStartTime(null)
    setElapsed(0)
    setDistance(0)
    setPath([])
  }

  const finish = async () => {
    const walk = {
      id: sessionIdRef.current || `walk_${Date.now()}`,
      startTime,
      endTime: Date.now(),
      distanceKm: distance,
      durationSec: elapsed,
      routeCoordinates: pathRef.current,
      photos: [],
      badgesEarned: [],
    }
    await db.walks.put(walk)
    const earned = config ? await evaluateBadges(config) : []
    if (earned.length) await db.walks.update(walk.id, { badgesEarned: earned.map((b) => b.id) })
    localStorage.removeItem(SESSION_KEY)
    sessionIdRef.current = null
    setSummary({ walk, earned })
    setStatus('done')
    if (earned.length) notify(`Badge earned: ${earned[0].title}! 🎉`)
    else notify('Walk saved. Good sniffing!')
  }

  const requestClaim = () => {
    if (!pos) {
      notify('No GPS fix yet — move a little.', 'err')
      return
    }
    setPendingClaim([pos[0], pos[1]])
    setHydrantModal(true)
  }

  const doClaim = async (nickname, note) => {
    const hydrant = {
      id: `hydrant_${Date.now()}`,
      lat: pendingClaim[0],
      lng: pendingClaim[1],
      nickname,
      claimedAt: Date.now(),
      note,
      photoBlob: null,
    }
    await db.hydrants.put(hydrant)
    setHydrants((h) => [...h, hydrant])
    setHydrantModal(false)
    config && evaluateBadges(config)
    notify('Hydrant claimed. Loudly. 🚿')
  }

  const building =
    status === 'pre' ||
    status === 'done' ||
    (status === 'paused' && !startTime && localStorage.getItem(SESSION_KEY) === null)

  const center = (pos && pos.slice()) || config?.app?.map_default || [40.7128, -74.006]

  return (
    <div className="animate-fadeIn">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            {pet?.name ? (
              <>
                {pet.avatar} {pet.name}
              </>
            ) : (
              'Walk'
            )}
          </h1>
          <p className="text-xs font-bold text-slate-400">mark your territory, dog purposes only</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-white dark:bg-slate-900 px-3 py-1.5 shadow-card">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              gps === 'ok' ? 'bg-emerald-500' : gps === 'denied' ? 'bg-rose-500' : gps === 'err' ? 'bg-amber-500' : 'bg-slate-300 animate-pulse'
            }`}
          />
          <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400">
            {gps === 'ok' ? 'GPS live' : gps === 'denied' ? 'No GPS' : gps === 'err' ? 'Weak signal' : 'Searching…'}
          </span>
        </div>
      </header>

      <div className="relative h-[46vh] w-full overflow-hidden rounded-3xl shadow-card">
        <MapContainer center={center} zoom={15} scrollWheelZoom={false} className="h-full w-full" attributionControl={true}>
          <MapGlue pos={building ? center : pos} path={path} hydrants={hydrants} claimed={status === 'done' ? null : null} />
        </MapContainer>
        {status !== 'pre' && status !== 'done' && (
          <div className="absolute left-3 top-3 z-[1000] flex gap-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 px-3 py-2 text-sm font-black shadow-card backdrop-blur">
            <span className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
              <Timer size={15} className="text-woof-pink" /> {formatDuration(elapsed)}
            </span>
            <span className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
              <Footprints size={15} className="text-woof-peach" /> {formatKm(distance)}
            </span>
            {status === 'paused' && <span className="text-amber-500">paused</span>}
          </div>
        )}
      </div>

      {status === 'pre' || status === 'done' ? (
        <div className="card mt-3 flex flex-col gap-2.5">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
            {status === 'done'
              ? 'Walk complete! Great sniffing, champion.'
              : gps === 'ok'
              ? 'GPS locked. Ready to trot?'
              : gps === 'denied'
              ? 'Location access is needed for walk tracking — enable it in your browser.'
              : 'Hunting GPS satellites…'}
          </p>
          <button onClick={start} disabled={gps !== 'ok'} className="btn-primary w-full py-4 text-base">
            <Play size={20} fill="currentColor" /> {status === 'done' ? 'Another walk!' : 'Start walk'}
          </button>
          {status === 'done' && (
            <button onClick={cancelSession} className="btn-ghost w-full">
              Back to start
            </button>
          )}
          {!pet && (
            <button onClick={() => navigate('/settings')} className="text-center text-xs font-extrabold text-woof-pink">
              Set up your pup for a personalized walk →
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button onClick={requestClaim} className="btn-ghost flex-1" disabled={!pos}>
            <MapPin size={18} /> Claim hydrant
          </button>
          <button onClick={status === 'active' ? pause : resume} className="btn-ghost flex-1">
            {status === 'active' ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
            {status === 'active' ? 'Pause' : 'Resume'}
          </button>
          <button onClick={finish} className="btn-primary flex-1">
            <Flag size={18} /> Finish
          </button>
        </div>
      )}

      {status === 'pre' && hydrants.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">My territory</p>
          {hydrants
            .slice()
            .reverse()
            .map((h) => (
              <div key={h.id} className="card flex items-center justify-between !p-3">
                <div>
                  <p className="text-sm font-extrabold">🚿 {h.nickname}</p>
                  <p className="text-xs text-slate-400">
                    {h.lat.toFixed(4)}, {h.lng.toFixed(4)}
                    {h.note ? ` · ${h.note}` : ''}
                  </p>
                </div>
              </div>
            ))}
        </div>
      )}

      {summary && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-woof-ink/50 p-4 dark:bg-black/60" onClick={() => setSummary(null)}>
          <div className="card w-full max-w-sm animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-2xl">🏁</span>
              <h3 className="text-lg font-black">Woof! Walk saved</h3>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-woof-blush dark:bg-slate-800 p-3">
                <Footprints size={16} className="mx-auto mb-1 text-woof-peach" />
                <p className="text-base font-black">{formatKm(summary.walk.distanceKm)}</p>
                <p className="text-[10px] font-bold text-slate-400">distance</p>
              </div>
              <div className="rounded-2xl bg-woof-blush dark:bg-slate-800 p-3">
                <Timer size={16} className="mx-auto mb-1 text-woof-pink" />
                <p className="text-base font-black">{formatDuration(summary.walk.durationSec)}</p>
                <p className="text-[10px] font-bold text-slate-400">time</p>
              </div>
              <div className="rounded-2xl bg-woof-blush dark:bg-slate-800 p-3">
                <MapPin size={16} className="mx-auto mb-1 text-woof-sky" />
                <p className="text-base font-black">{summary.walk.routeCoordinates.length}</p>
                <p className="text-[10px] font-bold text-slate-400">paw prints</p>
              </div>
            </div>
            {summary.earned.length > 0 && (
              <div className="mb-4 space-y-1.5">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">New badges</p>
                {summary.earned.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 rounded-2xl bg-woof-sunny/40 px-3 py-2 text-sm font-extrabold">
                    <span className="text-lg">{b.icon}</span> {b.title}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/photos', { state: { fromWalk: summary.walk } })}
                className="btn-ghost flex-1"
              >
                <Sparkles size={16} /> Postcard
              </button>
              <button
                onClick={() => {
                  setSummary(null)
                  notify('Ready for the next adventure!')
                }}
                className="btn-primary flex-1"
              >
                <Flag size={16} /> Done
              </button>
            </div>
          </div>
        </div>
      )}
<HydrantModal
        open={hydrantModal}
        onClose={() => {
          setHydrantModal(false)
          setPendingClaim(null)
        }}
        onSubmit={doClaim}
      />

      <p className="mt-4 text-center text-[11px] font-bold text-slate-300 dark:text-slate-600">
        <Navigation size={11} className="mr-1 inline" />
        Tap a hydrant pin to remember forever. Map tiles cache offline.
      </p>
    </div>
  )
}