// Ustvari PNG ikone (brez zunanjih knjižnic): škatla z očmi na temnem ozadju.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../client/public/icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function design({ rounded, scale }) {
  return (u, v) => {
    // Zaobljeni vogali
    if (rounded) {
      const r = 0.2;
      const cx = Math.min(Math.max(u, r), 1 - r);
      const cy = Math.min(Math.max(v, r), 1 - r);
      if (Math.hypot(u - cx, v - cy) > r) return [0, 0, 0, 0];
    }
    // Pomanjšanje vsebine (za maskable varno območje)
    const x = (u - 0.5) / scale + 0.5;
    const y = (v - 0.5) / scale + 0.5;
    let col = mix([43, 50, 72], [24, 27, 38], v);
    // Svetlobni krog
    const glow = Math.max(0, 1 - Math.hypot(x - 0.5, y - 0.45) / 0.5);
    col = mix(col, [255, 180, 58], glow * 0.25);
    // Škatla
    if (x > 0.25 && x < 0.75 && y > 0.36 && y < 0.8) {
      col = [196, 154, 108];
      if (y < 0.45) col = [176, 134, 90];
      if (Math.abs(x - 0.5) < 0.04 && y < 0.6) col = [226, 204, 150];
      // Oči
      for (const ex of [0.41, 0.59]) {
        const d = Math.hypot(x - ex, y - 0.6);
        if (d < 0.065) col = [255, 255, 255];
        if (Math.hypot(x - ex - 0.018, y - 0.61) < 0.032) col = [20, 20, 24];
      }
    }
    // Senca pod škatlo
    if (y >= 0.8 && y < 0.84 && x > 0.23 && x < 0.77) col = mix(col, [0, 0, 0], 0.35);
    return [...col, 255];
  };
}

const icons = [
  ['icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icon-512.png', 512, { rounded: true, scale: 1 }],
  ['icon-maskable-512.png', 512, { rounded: false, scale: 0.8 }],
  ['apple-touch-icon.png', 180, { rounded: false, scale: 0.9 }],
];
for (const [file, size, opts] of icons) {
  writeFileSync(resolve(outDir, file), png(size, design(opts)));
  console.log(`Ustvarjeno: ${file}`);
}
