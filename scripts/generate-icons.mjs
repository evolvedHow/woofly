import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const PAD = { cx: 50, cy: 60, rx: 20, ry: 16 }
const TOES = [
  { cx: 50 + 22 * Math.sin((-44 * Math.PI) / 180), cy: 60 - 22 * Math.cos((-44 * Math.PI) / 180), rx: 7, ry: 9.5 },
  { cx: 50 + 22 * Math.sin((-15 * Math.PI) / 180), cy: 60 - 22 * Math.cos((-15 * Math.PI) / 180), rx: 7, ry: 9.5 },
  { cx: 50 + 22 * Math.sin((15 * Math.PI) / 180), cy: 60 - 22 * Math.cos((15 * Math.PI) / 180), rx: 7, ry: 9.5 },
  { cx: 50 + 22 * Math.sin((44 * Math.PI) / 180), cy: 60 - 22 * Math.cos((44 * Math.PI) / 180), rx: 7, ry: 9.5 },
]
const TOE_BEANS = [
  { cx: 41, cy: 62, rx: 4, ry: 3 },
  { cx: 50, cy: 66, rx: 4, ry: 3 },
  { cx: 59, cy: 62, rx: 4, ry: 3 },
]
const PAW_WIDTH = 44.6
const PAW_CENTER = [50, 55.5]

const TOP = [253, 230, 138]
const BOTTOM = [244, 114, 182]

function inEllipse(u, v, e) {
  const dx = (u - e.cx) / e.rx
  const dy = (v - e.cy) / e.ry
  return dx * dx + dy * dy <= 1
}

function inPaw(u, v) {
  if (inEllipse(u, v, PAD)) return true
  for (const t of TOES) if (inEllipse(u, v, t)) return true
  if (!TOE_BEANS.every((b) => !inEllipse(u, v, b))) return false
  return false
}

function render(size, pawPx, name) {
  const scale = pawPx / PAW_WIDTH
  const shiftX = size / 2 - PAW_CENTER[0] * scale
  const shiftY = size / 2 - PAW_CENTER[1] * scale
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1)
    const r = TOP[0] + (BOTTOM[0] - TOP[0]) * t
    const g = TOP[1] + (BOTTOM[1] - TOP[1]) * t
    const b = TOP[2] + (BOTTOM[2] - TOP[2]) * t
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2
      const u = (x - shiftX) / scale
      const v = (y - shiftY) / scale
      if (inPaw(u, v)) {
        const pad = 1 - 0.08 * (v - 30) / 50
        png.data[idx] = 255
        png.data[idx + 1] = 255
        png.data[idx + 2] = 255
        png.data[idx + 3] = Math.round(255 * Math.max(0.6, pad))
      } else {
        png.data[idx] = r
        png.data[idx + 1] = g
        png.data[idx + 2] = b
        png.data[idx + 3] = 255
      }
    }
  }
  writeFileSync(join(outDir, name), PNG.sync.write(png))
  console.log(`✓ ${name} (${size}x${size})`)
}

render(512, 410, 'pwa-512x512.png')
render(192, 154, 'pwa-192x192.png')
render(512, 297, 'maskable-512x512.png')
render(192, 111, 'maskable-192x192.png')
render(180, 137, 'apple-touch-icon.png')
render(512, 410, 'favicon.png')
console.log('All icons generated in public/icons/')