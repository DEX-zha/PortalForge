// Minimal PNG decode/encode (8-bit RGB/RGBA, non-interlaced) on node:zlib, for comparing Dolphin screenshots.
import fs from 'node:fs';
import zlib from 'node:zlib';

export function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, depth = 0, color = 0, interlace = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; color = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) throw new Error(`unsupported PNG: depth ${depth} color ${color} interlace ${interlace}`);
  const ch = color === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * ch); const stride = w * ch;
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, y * stride + stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev ? prev[x] : 0, c = prev && x >= ch ? prev[x - ch] : 0; const v = line[x];
      let r;
      if (ft === 0) r = v; else if (ft === 1) r = v + a; else if (ft === 2) r = v + b; else if (ft === 3) r = v + ((a + b) >> 1);
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = r & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

export function encode(img, file) {
  const { w, h, ch, data } = img; const stride = w * ch;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const chunk = (type, body) => { const b = Buffer.alloc(12 + body.length); b.writeUInt32BE(body.length, 0); b.write(type, 4, 'latin1'); body.copy(b, 8); b.writeInt32BE(crc(Buffer.concat([Buffer.from(type, 'latin1'), body])), 8 + body.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  return file;
}

let T = null;
function crc(b) { if (!T) { T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } } let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ -1; }

export function crop(img, x0, y0, cw, chh, zoom = 1) {
  const { w, h, ch, data } = img;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); cw = Math.min(cw, w - x0); chh = Math.min(chh, h - y0);
  const out = Buffer.alloc(cw * zoom * chh * zoom * ch);
  for (let y = 0; y < chh * zoom; y++) for (let x = 0; x < cw * zoom; x++) {
    const sx = x0 + Math.floor(x / zoom), sy = y0 + Math.floor(y / zoom);
    for (let k = 0; k < ch; k++) out[(y * cw * zoom + x) * ch + k] = data[(sy * w + sx) * ch + k];
  }
  return { w: cw * zoom, h: chh * zoom, ch, data: out };
}

// Bounding boxes of pixel clusters that differ by more than `thr` per channel.
export function diffBoxes(a, b, thr = 40, minPix = 12) {
  if (a.w !== b.w || a.h !== b.h) throw new Error('size mismatch');
  const mask = new Uint8Array(a.w * a.h);
  for (let i = 0, n = a.w * a.h; i < n; i++) {
    const pa = i * a.ch, pb = i * b.ch;
    if (Math.abs(a.data[pa] - b.data[pb]) > thr || Math.abs(a.data[pa + 1] - b.data[pb + 1]) > thr || Math.abs(a.data[pa + 2] - b.data[pb + 2]) > thr) mask[i] = 1;
  }
  const seen = new Uint8Array(a.w * a.h); const boxes = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const stack = [i]; seen[i] = 1; let n = 0, x0 = a.w, x1 = 0, y0 = a.h, y1 = 0;
    while (stack.length) {
      const j = stack.pop(); const x = j % a.w, y = (j - x) / a.w; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) continue;
        const k = ny * a.w + nx; if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (n >= minPix) boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, pixels: n });
  }
  return boxes.sort((p, q) => q.pixels - p.pixels);
}
