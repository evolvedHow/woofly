export async function shareText(title, text, url) {
  const nav = navigator
  if (nav.share) {
    try {
      await nav.share({ title, text, url })
      return true
    } catch (err) {
      if (err && err.name === 'AbortError') return false
      console.warn('share failed', err)
    }
  }
  if (nav.clipboard && url) {
    try {
      await nav.clipboard.writeText(url)
      return true
    } catch (e) {
      console.warn(e)
    }
  }
  return false
}

export async function shareFile(file, title, text) {
  const nav = navigator
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text })
      return true
    } catch (err) {
      if (err && err.name === 'AbortError') return false
      console.warn('file share failed', err)
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return false
}

export async function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const dataUrl = r.result
      resolve(dataUrl.split(',')[1])
    }
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

export function base64ToBlob(b64, mime = 'application/octet-stream') {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}

export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',')
  const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream'
  return base64ToBlob(b64, mime)
}

export function safeSharePrefix() {
  const u = typeof location !== 'undefined' ? location.origin : ''
  return `${u}/#/sniff?data=`
}