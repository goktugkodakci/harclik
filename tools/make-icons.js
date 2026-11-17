// Draws the PNG icons iOS and Android need (iOS ignores SVG home screen icons).
// No dependencies: a tiny rasterizer plus Node's zlib for the PNG encoding.
// Run: node tools/make-icons.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUTPUT_DIR = fileURLToPath(new URL('../icons/', import.meta.url));
const SIZES = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };

const BACKGROUND = [0x1E, 0x5A, 0x43];
const INK = [0xF4, 0xF1, 0xEA];
const SUPERSAMPLE = 4;

// Same geometry as icons/icon.svg, as fractions of the icon size. The artwork stays
// inside the central 80% circle, so the same file also works as a maskable icon.
const RING_OUTER = 0.29;
const RING_INNER = 0.235;
const HALF_MOON_RADIUS = 0.2;
const HALF_MOON_EDGE = 0.488;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const COLOR_TYPE_RGBA = 6;
const BIT_DEPTH = 8;

function isInk(u, v) {
  const radius = Math.hypot(u - 0.5, v - 0.5);
  if (radius <= RING_OUTER && radius >= RING_INNER) {
    return true;
  }
  return radius <= HALF_MOON_RADIUS && u <= HALF_MOON_EDGE;
}

function rasterize(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          if (isInk((x + (sx + 0.5) / SUPERSAMPLE) / size, (y + (sy + 0.5) / SUPERSAMPLE) / size)) {
            covered += 1;
          }
        }
      }
      const coverage = covered / samples;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(BACKGROUND[channel] + (INK[channel] - BACKGROUND[channel]) * coverage);
      }
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = BIT_DEPTH;
  header[9] = COLOR_TYPE_RGBA;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
for (const [name, size] of Object.entries(SIZES)) {
  writeFileSync(new URL(name, new URL('../icons/', import.meta.url)), encodePng(size, rasterize(size)));
  console.log(`icons/${name} (${size}x${size})`);
}
