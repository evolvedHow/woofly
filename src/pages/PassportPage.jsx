import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { ScanLine, QrCode, Share2, Trash2, Check, PawPrint } from 'lucide-react'
import { db } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import { encodeProfile } from '../lib/passport.js'
import { addFriendFromCode } from '../lib/friends.js'
import { shareText, safeSharePrefix } from '../lib/files.js'

export default function PassportPage() {
  const { config, pet, notify } = useApp()
  const [friends, setFriends] = useState([])
  const [scanning, setScanning] = useState(false)
  const [camState, setCamState] = useState('idle')
  const [copied, setCopied] = useState(false)
  const [meCode, setMeCode] = useState('')
  const scannerRef = useRef(null)

  const refreshFriends = useCallback(() => {
    db.friends.orderBy('addedAt').reverse().toArray().then(setFriends)
  }, [])

  useEffect(() => {
    refreshFriends()
  }, [refreshFriends])

  useEffect(() => {
    if (!pet) return
    try {
      setMeCode(encodeProfile(pet))
    } catch (err) {
      notify('Could not encode passport: ' + err.message, 'err')
    }
  }, [pet, notify])

  useEffect(
    () => () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    },
    []
  )

  const handleDecoded = useCallback(
    async (decoded) => {
      try {
        const { friend, added } = await addFriendFromCode(decoded)
        notify(added ? `${friend.petName} joined your passport! 🎉` : `${friend.petName} is already in there!`)
        refreshFriends()
        return true
      } catch (err) {
        notify(err.message, 'err')
        return false
      }
    },
    [notify, refreshFriends]
  )

  const toggleScannable = async () => {
    if (scanning) {
      setScanning(false)
      try {
        await scannerRef.current?.stop()
      } catch {
        /* noop */
      }
      setCamState('idle')
      return
    }
    setScanning(true)
    setCamState('starting')
    try {
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode('qr-reader', { verbose: false })
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
        async (decoded) => {
          setCamState('idle')
          try {
            await scannerRef.current?.pause()
          } catch {
            /* noop */
          }
          const ok = await handleDecoded(decoded)
          setScanning(false)
          try {
            await scannerRef.current?.stop()
          } catch {
            /* noop */
          }
          if (!ok) {
            setScanning(true)
            try {
              await scannerRef.current?.resume()
            } catch {
              /* noop */
            }
          }
        },
        () => {}
      )
      setCamState('running')
    } catch (err) {
      console.error(err)
      setScanning(false)
      setCamState('denied')
      notify('Camera unavailable: ' + (err?.message || '(permission denied)'), 'err')
    }
  }

  const shareMe = async () => {
    const prefix = config?.app?.share_prefix || safeSharePrefix()
    const url = `${prefix}${meCode}`
    const ok = await shareText(`${pet?.name || 'Pup'}'s woof.LY passport`, 'Sniff this passport and we are friends!', url)
    if (!ok) {
      try {
        await navigator.clipboard?.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        notify('Passport link copied!')
      } catch {
        notify('Sharing not available here.')
      }
    }
  }

  const removeFriend = async (id) => {
    await db.friends.delete(id)
    refreshFriends()
  }

  const persona = config?.personas?.find((p) => p.id === pet?.selectedPersonaId)
  const greeting = persona?.greeting || 'Hello, fellow good dog.'

  return (
    <div className="animate-fadeIn">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Woof Passport</h1>
          <p className="text-xs font-bold text-slate-400">swipe QR codes like a seasoned park diplomat</p>
        </div>
        <Link to="/woof" className="shrink-0 rounded-2xl bg-white dark:bg-slate-900 px-3 py-2 text-xs font-black text-woof-pink shadow-card">
          🐾 Woof Circle →
        </Link>
      </header>

      {!pet ? (
        <div className="card text-center">
          <p className="mb-3 text-sm font-bold text-slate-400">No pup on file yet — your passport needs a face.</p>
          <Link to="/settings" className="btn-primary w-full">
            Set up your pup
          </Link>
        </div>
      ) : (
        <>
          <div className="card relative mb-3 overflow-hidden">
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-woof-pink/10" />
            <div className="absolute -bottom-10 -left-8 h-36 w-36 rounded-full bg-woof-sunny/20" />
            <div className="relative flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-woof-blush dark:bg-slate-800 text-3xl">
                {pet.avatar || '🐾'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-black">{pet.name}</p>
                <p className="text-xs font-bold text-slate-400">{pet.breed || 'Distinguished canine'}</p>
                <p className="mt-0.5 text-xs font-semibold italic text-slate-500 dark:text-slate-400">{greeting}</p>
              </div>
            </div>
            <div className="relative mt-4 grid place-items-center rounded-3xl bg-white p-4 ring-4 ring-woof-blush dark:ring-slate-800">
              {meCode ? (
                <QRCodeSVG value={meCode} size={196} level="M" fgColor="#0f172a" bgColor="#ffffff" includeMargin={false} />
              ) : (
                <div className="grid h-[196px] w-[196px] place-items-center text-slate-300">
                  <PawPrint size={48} />
                </div>
              )}
            </div>
            <div className="relative mt-3 flex gap-2">
              <button onClick={shareMe} className="btn-primary flex-1">
                {copied ? <Check size={18} /> : <Share2 size={18} />} {copied ? 'Copied' : 'Share passport'}
              </button>
            </div>
          </div>

          <div className="card mb-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Sniff a friend</h2>
              {friends.length > 0 && <span className="chip">{friends.length}</span>}
            </div>
            <div id="qr-reader" className={scanning ? 'mb-3' : 'hidden'} />
            {camState === 'denied' && (
              <p className="mb-2 text-xs font-bold text-rose-500">Camera denied. Enable it to scan QR passports.</p>
            )}
            <button onClick={toggleScannable} disabled={camState === 'starting'} className="btn-ghost w-full">
              {scanning ? <QrCode size={18} /> : <ScanLine size={18} />}
              {scanning ? 'Stop scanning' : camState === 'starting' ? 'Starting camera…' : 'Scan a passport'}
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">My pack</p>
            {friends.length === 0 && (
              <div className="card flex items-center gap-3 text-slate-400">
                <PawPrint size={20} />
                <p className="text-sm font-bold">No friends yet. Go sniff something friendly.</p>
              </div>
            )}
            {friends.map((f) => (
              <div key={f.id} className="card flex items-center justify-between !p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-woof-mint/20 text-xl">{f.avatar || '🐾'}</div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">{f.petName}</p>
                    <p className="truncate text-xs text-slate-400">
                      {f.breed || 'mystery breed'} {f.ownerContact ? `· ${f.ownerContact}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFriend(f.id)}
                  className="grid h-9 w-9 place-items-center rounded-2xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}