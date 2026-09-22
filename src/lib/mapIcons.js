import L from 'leaflet'

export function meIcon(active = false) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div class="woof-pin ${active ? 'woof-pulse' : ''}" style="width:22px;height:22px;border-radius:9999px;background:linear-gradient(135deg,#f472b6,#fb923c);border:3px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.45)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

export function hydrantIcon({ glyph = '🚿' } = {}) {
  const svg = `<svg width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0 C19 0 24 5.5 24 12 A10 10 0 0 1 24 22 L24 27 C24 28.5 23 30 21.5 30 L6.5 30 C5 30 4 28.5 4 27 L4 22 A10 10 0 0 1 4 12 C4 5.5 9 0 14 0 Z" fill="#3b82f6"/>
    <circle cx="14" cy="14" r="9" fill="#fff"/>
  </svg>`
  return L.divIcon({
    className: 'custom-marker woof-pin',
    html: `<div style="display:grid;place-items:center;width:30px;height:34px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.3))">${svg}<span style="position:absolute;top:9px;font-size:10px;color:#0f172a;font-weight:900">${glyph}</span></div>`,
    iconSize: [30, 34],
    iconAnchor: [15, 32],
  })
}

export function hydrantConfirmIcon() {
  return L.divIcon({
    className: 'custom-marker woof-pin',
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:#10b981;border:3px solid #fff;display:grid;place-items:center;color:#fff;font-weight:900;font-size:14px">✓</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}