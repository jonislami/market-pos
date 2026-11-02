// Generates the PWA icons (public/icons/*.png) from the store logo: the lucide "store" glyph
// in brand-900 on a brand-400 tile. No dependencies: rasterises the strokes and writes PNGs with zlib.
// Run: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [0x3f, 0xbf, 0x86] // brand-400
const FG = [0x10, 0x24, 0x1b] // brand-900

// Glyph strokes on a 24×24 grid (same paths as the logo SVG), stroke width 2.2, round caps.
const SEGMENTS = [
  [3, 9, 4.5, 4], [4.5, 4, 19.5, 4], [19.5, 4, 21, 9], // awning
  [4, 9, 4, 20], [4, 20, 20, 20], [20, 20, 20, 9], // walls
  [9, 20, 9, 14], [9, 14, 15, 14], [15, 14, 15, 20], // door
]
const STROKE = 2.2

function distToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** Signed distance outside a rounded square of side `size` and corner radius `r` (negative = inside). */
function roundedRectDist(x, y, size, r) {
  const qx = Math.abs(x - size / 2) - (size / 2 - r)
  const qy = Math.abs(y - size / 2) - (size / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/**
 * @param size   output size in px
 * @param glyph  glyph size as a fraction of the icon (maskable icons keep it inside the 80% safe zone)
 * @param radius corner radius as a fraction (0 = full square, for maskable/apple icons)
 */
function render(size, glyph, radius) {
  const px = new Uint8Array(size * size * 4)
  const scale = (size * glyph) / 24
  const offset = (size - 24 * scale) / 2
  const SS = 4 // supersampling per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0
      let fg = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS
          const fy = y + (sy + 0.5) / SS
          const inTile = radius === 0 || roundedRectDist(fx, fy, size, size * radius) <= 0
          if (!inTile) continue
          bg++
          const gx = (fx - offset) / scale
          const gy = (fy - offset) / scale
          if (SEGMENTS.some((s) => distToSegment(gx, gy, s) <= STROKE / 2)) fg++
        }
      }
      const i = (y * size + x) * 4
      const n = SS * SS
      const a = bg / n
      const f = bg ? fg / bg : 0
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] * (1 - f) + FG[c] * f)
      px[i + 3] = Math.round(a * 255)
    }
  }
  return px
}

// ---------- PNG encoding ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const out = new URL('../public/icons/', import.meta.url)
mkdirSync(out, { recursive: true })
const icons = [
  ['icon-192.png', 192, 0.58, 0.22],
  ['icon-512.png', 512, 0.58, 0.22],
  ['maskable-512.png', 512, 0.5, 0],
  ['apple-touch-icon.png', 180, 0.6, 0],
]
for (const [name, size, glyph, radius] of icons) {
  writeFileSync(new URL(name, out), png(size, render(size, glyph, radius)))
  console.log('wrote public/icons/' + name)
}
