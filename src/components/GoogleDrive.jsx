import { useCallback, useEffect, useRef, useState } from 'react'
import { Link2, CloudUpload, CloudDownload, Cloud, Loader2, LogOut, Ghost } from 'lucide-react'
import { db, dbSnapshot, importSnapshot } from '../db/db.js'
import { useApp } from '../context/AppContext.jsx'

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file'

let scriptLoaded = null
let gisClient = null
let cachedToken = null
let cachedExpiry = 0

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptLoaded) return scriptLoaded
  scriptLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load Google Identity Services'))
    document.head.appendChild(s)
  })
  return scriptLoaded
}

function ensureScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return loadGis()
}

async function getToken(scope, prompt = false) {
  await ensureScript()
  if (cachedToken && Date.now() < cachedExpiry && !prompt) return cachedToken
  const clientId = (await db.settings.get('google_client_id'))?.value
  if (!clientId) throw new Error('Add a Google OAuth Client ID in Settings → Cloud Sync first.')
  return new Promise((resolve, reject) => {
    if (gisClient) {
      gisClient.callback = (res) => {
        if (res.error) reject(new Error(res.error || 'Auth failed'))
        else {
          cachedToken = res.access_token
          cachedExpiry = Date.now() + 3000 * 1000
          resolve(cachedToken)
        }
      }
      gisClient.requestAccessToken()
      return
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (res) => {
        if (res.error) reject(new Error(res.error || 'Auth failed'))
        else {
          cachedToken = res.access_token
          cachedExpiry = Date.now() + 3000 * 1000
          resolve(cachedToken)
        }
      },
    })
    gisClient = client
    client.requestAccessToken()
  })
}

async function driveRequest(path, { method = 'GET', token, body, media = false, upload = false } = {}) {
  const url = media && method === 'PATCH' && body
    ? `https://www.googleapis.com/upload/drive/v3/files/${path}?uploadType=media`
    : upload
    ? `https://www.googleapis.com/upload/drive/v3/files${path}`
    : `https://www.googleapis.com/drive/v3${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Drive ${res.status}: ${t.slice(0, 140)}`)
  }
  return res.status === 204 ? null : res.json()
}

async function findAppDataFile(token) {
  const data = await driveRequest(
    `/files?spaces=appDataFolder&q=${encodeURIComponent("name='woofly_backup.json'")}&fields=files(id,modifiedTime)`,
    { token }
  )
  return data?.files?.[0] || null
}

function fileIdFromLink(url) {
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m ? m[1] : String(url).trim()
}

export default function GoogleDrive() {
  const { notify } = useApp()
  const [clientId, setClientId] = useState('')
  const [savedId, setSavedId] = useState('')
  const [busy, setBusy] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [sharedId, setSharedId] = useState('')
  const [sharedLink, setSharedLink] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const loaded = useRef(false)

  const loadState = useCallback(async () => {
    const [cid, shareId, shareLink] = await Promise.all([
      db.settings.get('google_client_id'),
      db.settings.get('drive_shared_id'),
      db.settings.get('drive_shared_link'),
    ])
    setClientId(cid?.value || '')
    setSavedId(cid?.value || '')
    setSharedId(shareId?.value || '')
    setSharedLink(shareLink?.value || '')
    if (cid?.value) setSignedIn(Boolean(cachedToken))
  }, [])

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    loadState()
  }, [loadState])

  const saveClientId = async () => {
    await db.settings.put({ key: 'google_client_id', value: clientId.trim() })
    gisClient = null
    cachedToken = null
    cachedExpiry = 0
    setSavedId(clientId.trim())
    setSignedIn(false)
    notify('Client ID saved.')
  }

  const signIn = async () => {
    setLoginBusy(true)
    try {
      await getToken(SCOPES, true)
      setSignedIn(true)
      notify('Google Drive connected! ☁️')
    } catch (err) {
      notify(err.message, 'err')
    } finally {
      setLoginBusy(false)
    }
  }

  const signOut = () => {
    cachedToken = null
    cachedExpiry = 0
    setSignedIn(false)
    notify('Signed out.')
  }

  const uploadSnapshot = async () => {
    setBusy('backup')
    try {
      const token = await getToken(SCOPES)
      const snapshot = await dbSnapshot()
      const body = JSON.stringify(snapshot)
      let file
      if (sharedId) {
        file = { id: sharedId }
        await driveRequest(`${sharedId}`, { method: 'PATCH', token, body, media: true })
      } else {
        file = await findAppDataFile(token)
        if (file) {
          await driveRequest(`${file.id}`, { method: 'PATCH', token, body, media: true })
        } else {
          const created = await driveRequest('?uploadType=media&fields=id', { method: 'POST', token, body })
          file = created
          await driveRequest(`/${created.id}`, {
            method: 'PATCH',
            token,
            body: JSON.stringify({ name: 'woofly_backup.json', parents: ['appDataFolder'] }),
          })
        }
      }
      notify('Backup uploaded to Google Drive. Sniffs are safe. ☁️')
    } catch (err) {
      notify(`Backup failed: ${err.message}`, 'err')
    } finally {
      setBusy('')
    }
  }

  const downloadSnapshot = async () => {
    setBusy('restore')
    try {
      const token = await getToken(SCOPES)
      let file = null
      if (sharedId) {
        file = { id: sharedId }
      } else {
        file = await findAppDataFile(token)
      }
      if (!file) throw new Error('No backup found on Drive yet')
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Could not read backup file')
      const text = await res.text()
      await importSnapshot(JSON.parse(text))
      notify('Backup restored. Welcome back, hero. 🐕‍🦺')
    } catch (err) {
      notify(`Restore failed: ${err.message}`, 'err')
    } finally {
      setBusy('')
    }
  }

  const createSharedFile = async () => {
    setBusy('sharecreate')
    try {
      const token = await getToken(SCOPES)
      const created = await driveRequest('?uploadType=media&fields=id', {
        method: 'POST',
        token,
        body: JSON.stringify({ app: 'woof.ly', version: 1, files: 'family_share' }),
      })
      const linkRes = await driveRequest(`/${created.id}?fields=webViewLink`, { token })
      await driveRequest(`/${created.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ name: 'woofly_family_share.json' }),
      })
      await db.settings.put({ key: 'drive_shared_id', value: created.id })
      await db.settings.put({ key: 'drive_shared_link', value: linkRes.webViewLink })
      setSharedId(created.id)
      setSharedLink(linkRes.webViewLink)
      notify('Family share file created! Share the link with your pack.')
    } catch (err) {
      notify(`Could not create shared file: ${err.message}`, 'err')
    } finally {
      setBusy('')
    }
  }

  const attachSharedLink = async () => {
    const id = fileIdFromLink(sharedLink)
    if (!id) {
      notify('Could not read a file id from that link.', 'err')
      return
    }
    try {
      const token = await getToken(SCOPES)
      await driveRequest(`/${id}?fields=id`, { token })
      await db.settings.put({ key: 'drive_shared_id', value: id })
      setSharedId(id)
      notify('Shared file attached. wuffs sync with the pack!')
    } catch (err) {
      notify(`Cannot access that file: ${err.message}`, 'err')
    }
  }

  const clearShared = async () => {
    await db.settings.delete('drive_shared_id')
    await db.settings.delete('drive_shared_link')
    setSharedId('')
    setSharedLink('')
    notify('Family share file cleared.')
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
          <Cloud size={14} /> Google Drive sync
        </h3>
        <p className="mb-3 text-xs font-bold text-slate-500 dark:text-slate-400">
          Anything you ask Google for stays on Google — woof.LY never sees it. Create a free OAuth client id at{' '}
          console.cloud.google.com (scopes: drive.appdata, drive.file).
        </p>
        <div className="flex gap-2">
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxxxxx.apps.googleusercontent.com"
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-xs font-bold"
          />
          <button onClick={saveClientId} disabled={!clientId.trim() || clientId === savedId} className="btn-ghost">
            Save
          </button>
        </div>

        {!signedIn ? (
          <button onClick={signIn} disabled={loginBusy || !savedId} className="btn-primary mt-3 w-full">
            {loginBusy ? <Loader2 className="animate-spin" size={18} /> : <Cloud size={18} />} Sign in with Google
          </button>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={uploadSnapshot} disabled={busy === 'backup'} className="btn-primary !px-2 text-xs">
              {busy === 'backup' ? <Loader2 className="animate-spin" size={16} /> : <CloudUpload size={16} />} Backup
            </button>
            <button onClick={downloadSnapshot} disabled={busy === 'restore'} className="btn-ghost text-xs">
              {busy === 'restore' ? <Loader2 className="animate-spin" size={16} /> : <CloudDownload size={16} />} Restore
            </button>
            <button onClick={signOut} className="btn-ghost text-xs">
              <LogOut size={16} /> Out
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
          <Link2 size={14} /> Family share file
        </h3>
        <p className="mb-3 text-xs font-bold text-slate-500 dark:text-slate-400">
          Create one shared Drive file and give the link to family so every walk syncs to one spot.
        </p>
        {!sharedId ? (
          <button onClick={createSharedFile} disabled={busy === 'sharecreate' || !signedIn} className="btn-ghost w-full">
            {busy === 'sharecreate' ? <Loader2 className="animate-spin" size={16} /> : <Ghost size={16} />} Create family share file
          </button>
        ) : (
          <div className="space-y-2">
            <div className="rounded-2xl bg-woof-mint/20 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">
              Linked ✓ — backups now go to the shared file.
            </div>
            {sharedLink && (
              <a
                href={sharedLink}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-xs font-extrabold text-woof-pink underline"
              >
                {sharedLink}
              </a>
            )}
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-2xl bg-slate-50 px-3 dark:bg-slate-800">
                <input
                  value={sharedLink}
                  onChange={(e) => setSharedLink(e.target.value)}
                  placeholder="Paste a family Drive link…"
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-xs font-bold"
                />
              </div>
              <button onClick={attachSharedLink} className="btn-ghost">
                Attach
              </button>
              <button onClick={clearShared} className="btn-ghost text-rose-500">
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}