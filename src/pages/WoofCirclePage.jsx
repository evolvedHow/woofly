import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Html5Qrcode } from 'html5-qrcode'
import {
  QrCode,
  ScanLine,
  PawPrint,
  Send,
  Inbox as InboxIcon,
  Users,
  UserPlus,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  Camera,
  Footprints,
  Award,
  MessageSquare,
  Loader2,
  X,
} from 'lucide-react'
import { db } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'
import { ensureIdentity, buildMyPairingText, decodePairing, newFriendId } from '../lib/woof/identity.js'
import { makeWoof, recentSnaps, recentWalks, unlockedBadges, defaultMessage, payloadFor } from '../lib/woof/packets.js'
import {
  getActiveTransport,
  queueWoofs,
  getOutbox,
  deleteOutboxEntry,
  getInbox,
  markInboxRead,
  deleteInboxEntry,
  flushOutbox,
  syncInbox,
  LocalTransport,
} from '../lib/woof/transports.js'
import { shareFile } from '../lib/files.js'
import { formatKm, formatDuration } from '../lib/geo.js'

const TABS = [
  { id: 'identity', label: 'Identity', icon: QrCode },
  { id: 'circle', label: 'Circle', icon: Users },
  { id: 'send', label: 'Send', icon: Send },
  { id: 'inbox', label: 'Inbox', icon: InboxIcon },
]

const KINDS = [
  { id: 'achievement', label: 'Achievement', icon: Award },
  { id: 'walk', label: 'Walk', icon: Footprints },
  { id: 'photo', label: 'Photo', icon: Camera },
  { id: 'note', label: 'Note', icon: MessageSquare },
]

export default function WoofCirclePage() {
  const { pet, notify, framed } = useApp()
  const location = useLocation()
  const [tab, setTab] = useState('identity')

  const [me, setMe] = useState(null)
  const [pairText, setPairText] = useState('')
  const [identityBusy, setIdentityBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const [friends, setFriends] = useState([])
  const [scanning, setScanning] = useState(false)
  const [camState, setCamState] = useState('idle')
  const [pasteText, setPasteText] = useState('')
  const [candidate, setCandidate] = useState(null)
  const [busyPair, setBusyPair] = useState(false)
  const scannerRef = useRef(null)

  const [composeKind, setComposeKind] = useState(null)
  const [composeItems, setComposeItems] = useState([])
  const [selectedRef, setSelectedRef] = useState(null)
  const [message, setMessage] = useState('')
  const [recipients, setRecipients] = useState(new Set())
  const [woofing, setWoofing] = useState(false)
  const [outbox, setOutbox] = useState([])
  const [sending, setSending] = useState(false)

  const [inbox, setInbox] = useState([])
  const [importText, setImportText] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [transport, setTransport] = useState(null)
  const [active, setActive] = useState(false)

  const presetRef = useRef(location.state?.compose || null)
  const importedFilesRef = useRef(null)

  const refreshMe = useCallback(async () => {
    setIdentityBusy(true)
    try {
      const resolved = await ensureIdentity({ name: pet?.name, avatar: pet?.avatar, breed: pet?.breed })
      const { text, payload } = await buildMyPairingText()
      setMe({ ...resolved, payload })
      setPairText(text)
    } catch (err) {
      notify(err.message, 'err')
    } finally {
      setIdentityBusy(false)
    }
  }, [pet, notify])

  const refreshFriends = useCallback(async () => {
    const all = await db.friends.toArray()
    setFriends(all.filter((f) => f.woofPublicKey || f.woofPeer))
  }, [])

  const refreshOutbox = useCallback(async () => {
    setOutbox(await getOutbox())
  }, [])

  const refreshInbox = useCallback(async () => {
    setInbox(await getInbox())
  }, [])

  const refreshTransport = useCallback(async () => {
    const a = await getActiveTransport()
    setTransport(a)
  }, [])

  useEffect(() => {
    refreshMe()
    refreshFriends()
    refreshOutbox()
    refreshInbox()
    refreshTransport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const preset = presetRef.current
    if (preset && preset.kind) {
      presetRef.current = null
      setComposeKind(preset.kind)
      setSelectedRef({ kind: preset.kind, refId: preset.refId })
      setMessage(defaultMessage(preset.kind, { title: '…' }))
    }
  }, [])

  useEffect(() => {
    if (composeKind === 'note') {
      setComposeItems([])
      setMessage('')
      setSelectedRef(null)
    } else if (composeKind) {
      const load = async () => {
        let items = []
        if (composeKind === 'walk') items = await recentWalks()
        else if (composeKind === 'photo') items = await recentSnaps()
        else if (composeKind === 'achievement') items = await unlockedBadges()
        setComposeItems(items)
        const preset = location.state?.compose
        if (preset && preset.kind === composeKind) {
          const found = items.find((i) => i.refId === preset.refId)
          if (found) setSelectedRef(found)
        } else if (!selectedRef || selectedRef.kind !== composeKind) {
          setSelectedRef(null)
        }
      }
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeKind])

  useEffect(() => {
    if (composeKind && selectedRef) {
      setMessage(defaultMessage(composeKind, selectedRef))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeKind, selectedRef])

  useEffect(
    () => () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    },
    []
  )

  const showCode = async () => {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(pairText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        notify('Woof code copied!')
      } catch {
        notify('QR shown — friend scans it with Scan Woof.')
      }
    }
  }

  const toggleScan = async () => {
    if (scanning) {
      setScanning(false)
      try {
        await scannerRef.current?.stop()
      } catch { /* noop */ }
      setCamState('idle')
      return
    }
    setScanning(true)
    setCamState('starting')
    try {
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode('woof-qr-reader', { verbose: false })
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
        async (decoded) => {
          setCamState('idle')
          try {
            await scannerRef.current?.pause()
          } catch { /* noop */ }
          await openCandidate(decoded)
          setScanning(false)
          try {
            await scannerRef.current?.stop()
          } catch { /* noop */ }
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

  const openCandidate = async (text) => {
    try {
      const payload = decodePairing(text)
      setCandidate(payload)
    } catch (err) {
      notify(err.message, 'err')
    }
  }

  const confirmCandidate = async () => {
    if (!candidate) return
    setBusyPair(true)
    try {
      const payload = candidate
      const all = await db.friends.toArray()
      const dup = all.find((f) => f.woofHandle === payload.handle)
      if (dup) {
        await db.friends.update(dup.id, {
          petName: payload.name,
          avatar: payload.avatar,
          breed: payload.breed,
          woofHandle: payload.handle,
          woofPublicKey: payload.pub,
          woofMailbox: payload.mailbox,
          woofPeer: true,
          lastWoof: Date.now(),
        })
        notify(`${payload.name} is already in your circle — Woof keys refreshed.`)
      } else {
        await db.friends.put({
          id: newFriendId(),
          petName: payload.name,
          avatar: payload.avatar || '🐾',
          breed: payload.breed || '',
          woofHandle: payload.handle,
          woofPublicKey: payload.pub,
          woofMailbox: payload.mailbox,
          woofPeer: true,
          mutual: false,
          addedAt: Date.now(),
          lastWoof: Date.now(),
        })
        notify(`${payload.name} joined your Woof Circle! 🎉`)
      }
      setCandidate(null)
      setPasteText('')
      await refreshFriends()
    } catch (err) {
      notify(err.message, 'err')
    } finally {
      setBusyPair(false)
    }
  }

  const removeFriend = async (id) => {
    await db.friends.delete(id)
    await refreshFriends()
  }

  const toggleRecipient = (f) => {
    setRecipients((prev) => {
      const next = new Set(prev)
      if (next.has(f.id)) next.delete(f.id)
      else next.add(f.id)
      return next
    })
  }

  const doWoof = async () => {
    if (!recipients.size) {
      notify('Pick at least one Woof friend.', 'err')
      return
    }
    if (!message.trim() && !selectedRef) {
      notify('Add a word or pick something to woof.', 'err')
      return
    }
    setWoofing(true)
    try {
      const woof = await makeWoof({
        type: 'note',
        message,
        payload: {},
      })
      woof.type = composeKind === 'note' ? 'text' : composeKind
      woof.message = message.trim()
      woof.payload = payloadFor(composeKind, selectedRef)
      const chosen = friends.filter((f) => recipients.has(f.id))
      const entries = await queueWoofs(woof, chosen)
      await refreshOutbox()
      if (transport?.relay) {
        const result = await flushOutbox()
        notify(`🐾 Woof sent to ${entries.length} friend${entries.length > 1 ? 's' : ''}!${result.sent === entries.length ? '' : ' (some still queued)'}`)
      } else {
        notify(`🐾 Woof queued for ${entries.length} friend${entries.length > 1 ? 's' : ''} — export the packet below!`)
      }
      setRecipients(new Set())
      setMessage('')
      setSelectedRef(null)
      setComposeKind(null)
    } catch (err) {
      notify(err.message, 'err')
    } finally {
      setWoofing(false)
    }
  }

  const exportEntry = async (entry) => {
    try {
      const text = LocalTransport.exportEntryText(entry)
      const file = new File([text], `${entry.woofId}.woof`, { type: 'text/plain' })
      const shared = await shareFile(file, `${entry.toName} woof`, `A paw-printed Woof for ${entry.toName}`)
      if (!shared) notify('Woof packet downloaded — share it however you like.')
      await markDispatched(entry.id)
      await refreshOutbox()
    } catch (err) {
      notify(err.message, 'err')
    }
  }

  const exportAllQueued = async () => {
    const queued = outbox.filter((o) => o.status === 'queued')
    if (!queued.length) return
    for (const e of queued) await exportEntry(e)
  }

  const flushRelay = async () => {
    setSending(true)
    try {
      const result = await flushOutbox()
      await refreshOutbox()
      if (result.pendingExport) notify('Local mode — export packets from the Send tab.')
      else if (result.sent) notify(`Off fly! ${result.sent} woof(s) pushed to the relay.`)
      else notify('Nothing queued to send.')
    } catch (err) {
      notify(err.message, 'err')
    } finally {
      setSending(false)
    }
  }

  const doSync = async () => {
    setSyncing(true)
    try {
      const result = await syncInbox()
      await refreshInbox()
      if (!result.relay) notify('No relay configured — import a packet or set a relay in Settings.')
      else notify(`Synced! ${result.applied} new, ${result.dupes} duplicates skipped.`)
    } catch (err) {
      notify(err.message, 'err')
    } finally {
      setSyncing(false)
    }
  }

  const importPacket = async (text) => {
    try {
      const { woof, dup } = await LocalTransport.importPacketText(text)
      await refreshInbox()
      notify(dup ? `Already have that woof from ${woof.sender.name}.` : `${woof.sender?.name || 'A friend'} woofed — landed!`)
      setImportText('')
    } catch (err) {
      notify(err.message, 'err')
    }
  }

  const importFile = async (file) => {
    if (!file) return
    const text = await file.text()
    await importPacket(text)
  }

  const openInbox = async (r) => {
    setActive(r.id)
    if (!r.read) {
      await markInboxRead(r.id)
      await refreshInbox()
    }
  }

  const woofFriends = friends.filter((f) => f.woofPublicKey)

  return (
    <div className="animate-fadeIn space-y-3">
      <header className="mb-1">
        <h1 className="text-2xl font-black tracking-tight">Woof Circle</h1>
        <p className="text-xs font-bold text-slate-400">a small circle of dogs she knows — encrypted, asynchronous, no feed</p>
      </header>

      <div className="grid grid-cols-4 gap-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-extrabold transition ${
              tab === id
                ? 'bg-gradient-to-r from-woof-pink to-woof-peach text-white shadow-bubble'
                : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 shadow-card'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      <input ref={importedFilesRef} type="file" accept=".woof,text/plain,.txt" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />

      {/* ============================= IDENTITY ============================= */}
      {tab === 'identity' && (
        <div className="space-y-3">
          {identityBusy && !me ? (
            <div className="card text-center text-slate-400">
              <Loader2 size={18} className="mx-auto mb-2 animate-spin" /> minting your Woof identity…
            </div>
          ) : !me ? (
            <div className="card text-center">
              <p className="mb-3 text-sm font-bold text-slate-400">Something went wrong minting your identity.</p>
              <button onClick={refreshMe} className="btn-primary w-full">
                Retry
              </button>
            </div>
          ) : (
            <div className="card relative overflow-hidden">
              <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-woof-pink/10" />
              <div className="relative flex items-center gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-woof-blush dark:bg-slate-800 text-3xl">
                  {me.identity.avatar || '🐾'}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-black">{me.identity.name}</p>
                  <p className="text-sm font-black tracking-wide text-woof-pink">{me.identity.handle}</p>
                </div>
                <button onClick={showCode} className="btn-ghost ml-auto shrink-0 !px-3">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="relative mt-3 grid place-items-center rounded-3xl bg-white p-4 ring-4 ring-woof-blush dark:ring-slate-800">
                {pairText ? (
                  <QRCodeSVG value={pairText} size={196} level="M" fgColor="#0f172a" bgColor="#ffffff" includeMargin={false} />
                ) : (
                  <div className="grid h-[196px] w-[196px] place-items-center text-slate-300">
                    <PawPrint size={48} />
                  </div>
                )}
              </div>
              <p className="relative mt-3 text-center text-[11px] font-bold text-slate-400">
                Show this QR to a friend. It carries your handle + public key — that's all.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ============================== CIRCLE ============================== */}
      {tab === 'circle' && (
        <div className="space-y-3">
          <div className="card">
            <div className="mb-2 flex items-center gap-2">
              <UserPlus size={16} className="text-woof-pink" />
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Add a Woof friend</h2>
            </div>
            <div id="woof-qr-reader" className={scanning ? 'mb-2' : 'hidden'} />
            {camState === 'denied' && <p className="mb-2 text-xs font-bold text-rose-500">Camera denied — paste their Woof code instead.</p>}
            <button onClick={toggleScan} disabled={camState === 'starting'} className="btn-primary w-full">
              {scanning ? 'Stop scanning' : camState === 'starting' ? 'Starting camera…' : 'Scan a Woof code'}
              {scanning ? <X size={16} className="ml-2" /> : <ScanLine size={16} className="ml-2" />}
            </button>
            <p className="my-2 text-center text-[11px] font-black text-slate-300 dark:text-slate-600">or paste</p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={2}
              placeholder="Paste a Woof code (W1.…) here…"
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
            />
            <button onClick={() => openCandidate(pasteText)} disabled={!pasteText.trim()} className="btn-ghost mt-2 w-full">
              <UserPlus size={16} /> Decode code
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Woof friends</p>
              {woofFriends.length > 0 && <span className="chip">{woofFriends.length}</span>}
            </div>
            {woofFriends.length === 0 && (
              <div className="card flex items-center gap-3 text-slate-400">
                <PawPrint size={20} />
                <p className="text-sm font-bold">No Woof friends yet. Scan someone’s code or send them yours.</p>
              </div>
            )}
            {woofFriends.map((f) => (
              <div key={f.id} className="card flex items-center justify-between !p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-woof-mint/20 text-xl">{f.avatar || '🐾'}</div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">{f.petName}</p>
                    <p className="truncate text-[11px] font-bold text-woof-pink">{f.woofHandle}</p>
                  </div>
                </div>
                <button onClick={() => removeFriend(f.id)} className="grid h-9 w-9 place-items-center rounded-2xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {me && (
            <div className="card !bg-woof-sunny/30 text-center">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Woof friendships are two-sided. Show <span className="font-black">{me.identity.name}</span> your code so they can add you back.
              </p>
              <button onClick={() => setTab('identity')} className="btn-primary mt-2 w-full">
                <QrCode size={16} className="mr-1" /> Show my Woof code
              </button>
            </div>
          )}
        </div>
      )}

      {/* =============================== SEND =============================== */}
      {tab === 'send' && (
        <div className="space-y-3">
          <div className="card">
            <div className="mb-2 flex items-center gap-2">
              <Send size={16} className="text-woof-pink" />
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Woof something</h2>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {KINDS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setComposeKind(id)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[10px] font-extrabold transition ${
                    composeKind === id ? 'bg-woof-ink text-white dark:bg-white dark:text-woof-ink' : 'bg-woof-blush dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>

            {!composeKind && (
              <div className="mt-3 grid place-items-center py-6 text-center">
                <p className="max-w-[230px] text-xs font-bold text-slate-400">Pick what to woof — a badge, a walk, a snap, or a plain word.</p>
              </div>
            )}

            {composeKind && composeKind !== 'note' && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Pick one</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {composeItems.map((item) => (
                    <button
                      key={item.refId}
                      onClick={() => setSelectedRef(item)}
                      className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-extrabold transition ${
                        selectedRef?.refId === item.refId
                          ? 'bg-gradient-to-r from-woof-pink to-woof-peach text-white'
                          : 'bg-woof-blush dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {item.kind === 'walk' && <span className="mr-1">🐾 {formatKm(item.distanceKm)} · {formatDuration(item.durationSec)}</span>}
                      {item.kind === 'photo' && <span className="mr-1">📸 {new Date(item.createdAt).toLocaleDateString()}</span>}
                      {item.kind === 'achievement' && <span className="mr-1">{item.icon} {item.title}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {composeKind === 'note' && (
              <p className="mt-3 text-xs font-bold text-slate-400">Just words. Words are woofs too.</p>
            )}

            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={defaultMessage(composeKind || 'note', { title: '' }) ? 'Woof message…' : 'Say something…'}
              className="mt-3 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-bold"
            />

            {woofFriends.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-black uppercase tracking-widest text-slate-400">Send to</p>
                <div className="space-y-1.5">
                  {woofFriends.map((f) => (
                    <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-2xl bg-woof-blush dark:bg-slate-800 px-3 py-2.5">
                      <input type="checkbox" checked={recipients.has(f.id)} onChange={() => toggleRecipient(f)} className="h-4 w-4 accent-woof-pink" />
                      <span className="text-base">{f.avatar || '🐾'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold">{f.petName}</span>
                        <span className="block truncate text-[11px] font-bold text-woof-pink">{f.woofHandle}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {woofFriends.length === 0 && (
              <div className="mt-3 rounded-2xl bg-woof-blush dark:bg-slate-800 px-3 py-3 text-center text-xs font-bold text-slate-400">
                First add a Woof friend in the Circle tab.
              </div>
            )}

            <button onClick={doWoof} disabled={woofing || !woofFriends.length || !recipients.size} className="btn-primary mt-3 w-full py-3.5 text-base">
              {woofing ? <Loader2 size={18} className="animate-spin" /> : <PawPrint size={18} />}
              {woofing ? 'Encrypting…' : `WOOF!${recipients.size ? ` × ${recipients.size}` : ''}`}
            </button>
          </div>

          <div className="card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Outbox</h2>
              {outbox.some((o) => o.status === 'queued') && (
                <button onClick={transport?.relay ? flushRelay : exportAllQueued} disabled={sending} className="btn-ghost !px-3 text-xs">
                  {sending ? <Loader2 size={14} className="animate-spin" /> : transport?.relay ? <RefreshCw size={14} /> : <Download size={14} />}
                  {transport?.relay ? ' Send all' : ' Export all'}
                </button>
              )}
            </div>
            {outbox.length === 0 && <p className="text-xs font-bold text-slate-400">Nothing sent or queued yet.</p>}
            <div className="space-y-1.5">
              {outbox.map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-2xl bg-woof-blush dark:bg-slate-800 px-3 py-2">
                  <span className="text-lg">{e.toName}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold">{e.meta?.t} · {e.toHandle}</p>
                    <p className="text-[11px] font-bold text-slate-400">
                      {e.status === 'dispatched' ? 'dispatched' : e.status === 'failed' ? `failed: ${e.error || ''}` : e.status === 'queued' ? 'queued' : e.status}
                    </p>
                  </div>
                  {e.status === 'queued' && (
                    <button onClick={() => exportEntry(e)} className="btn-ghost !px-2">
                      <Download size={14} /> packet
                    </button>
                  )}
                  <button onClick={() => deleteOutboxEntry(e.id).then(refreshOutbox)} className="grid h-7 w-7 place-items-center rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =============================== INBOX =============================== */}
      {tab === 'inbox' && (
        <div className="space-y-3">
          <div className="card">
            <div className="mb-2 flex items-center gap-2">
              <InboxIcon size={16} className="text-woof-pink" />
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Receive</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={doSync} disabled={syncing} className="btn-primary">
                {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sync
              </button>
              <button onClick={() => importedFilesRef.current?.click()} className="btn-ghost">
                <Upload size={16} /> Import packet
              </button>
            </div>
            <p className="mt-2 text-[11px] font-bold text-slate-400">
              {transport?.relay
                ? 'Relay mailbox sync — pulls encrypted woofs then wipes them server-side.'
                : 'Local mode — import a .woof packet someone sent, or set a relay in Settings.'}
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={3}
              placeholder="…or paste a Woof packet text here"
              className="mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
            />
            <button onClick={() => importPacket(importText)} disabled={!importText.trim()} className="btn-ghost mt-2 w-full">
              <PawPrint size={16} /> Open pasted packet
            </button>
          </div>

          {inbox.length === 0 && (
            <div className="card grid place-items-center py-10 text-center">
              <div className="mb-2 grid h-14 w-14 place-items-center rounded-3xl bg-woof-blush dark:bg-slate-800 animate-wiggle">
                <PawPrint size={24} className="text-woof-pink" />
              </div>
              <p className="max-w-[240px] text-sm font-bold text-slate-400">No woofs yet. One day, a friend will woof in here and it’ll make your whole day.</p>
            </div>
          )}

          <div className="space-y-2">
            {inbox.map((r) => (
              <div key={r.id} className={`card !p-3 transition ${active === r.id ? 'ring-2 ring-woof-pink' : ''} ${!r.read ? 'ring-1 ring-woof-peach' : ''}`}>
                <button onClick={() => openInbox(r)} className="w-full text-left">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-woof-mint/20 text-xl">{r.from?.avatar || '🐾'}</div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-extrabold">
                        <span className="truncate">{r.from?.name || 'A friend'}</span>
                        {!r.read && <span className="h-2 w-2 shrink-0 rounded-full bg-woof-pink" />}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {r.type}/{r.from?.handle} · {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="chip shrink-0">{r.type}</span>
                  </div>
                  {r.message && <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">{r.message}</p>}
                  {active === r.id && <InboxDetail r={r} />}
                </button>
                <div className="mt-2 flex justify-end">
                  <button onClick={() => deleteInboxEntry(r.id).then(refreshInbox)} className="btn-ghost !px-2 text-xs">
                    <Trash2 size={13} /> delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="pb-3 text-center text-[11px] font-bold text-slate-300 dark:text-slate-600">
        End-to-end encrypted on your device · no backend keeps your woofs · <Link to="/settings" className="text-woof-pink">relay optional in Settings</Link>
      </p>

      {candidate && (
        <div
          className={`${framed ? 'absolute' : 'fixed'} inset-0 z-50 grid place-items-center bg-woof-ink/50 p-4 dark:bg-black/60`}
          onClick={() => setCandidate(null)}
        >
          <div className="card w-full max-w-sm animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-2xl">{candidate.avatar || '🐾'}</span>
              <div>
                <h3 className="text-lg font-black">Add {candidate.name}?</h3>
                <p className="text-xs font-bold text-woof-pink">{candidate.handle}</p>
              </div>
            </div>
            <p className="mb-4 text-xs font-bold text-slate-500 dark:text-slate-400">
              {candidate.name} wants into your Woof Circle. You’ll swap {candidate.name}’s public key and can woof them whenever — no social feed, just dogs.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setCandidate(null)} className="btn-ghost flex-1">
                Cancel
              </button>
              <button onClick={confirmCandidate} disabled={busyPair} className="btn-primary flex-1">
                {busyPair ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Add {candidate.name.split(' ')[0]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InboxDetail({ r }) {
  if (r.type === 'photo') {
    return r.payload?.dataUrl ? <img src={r.payload.dataUrl} alt="woofed snap" className="mt-2 w-full rounded-2xl" /> : null
  }
  if (r.type === 'walk') {
    return (
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-woof-blush dark:bg-slate-800 p-2">
          <p className="text-base font-black">{formatKm(r.payload?.distanceKm || 0)}</p>
          <p className="text-[10px] font-bold text-slate-400">distance</p>
        </div>
        <div className="rounded-2xl bg-woof-blush dark:bg-slate-800 p-2">
          <p className="text-base font-black">{formatDuration(r.payload?.durationSec || 0)}</p>
          <p className="text-[10px] font-bold text-slate-400">time</p>
        </div>
      </div>
    )
  }
  if (r.type === 'achievement') {
    return (
      <p className="mt-2 rounded-2xl bg-woof-sunny/40 px-3 py-2 text-sm font-extrabold">
        <span className="mr-1 text-lg">{r.payload?.icon || '🏅'}</span>
        {r.payload?.title || 'Badge'}
      </p>
    )
  }
  return null
}