// zip.js - read a few small files out of a ZIP (such as Instagram's "Download your information") without loading the whole archive.
// It only reads the index at the end of the file, then the entries you ask for. Needs the browser's DecompressionStream for compressed files.
const u16 = (d, o) => d[o] | (d[o + 1] << 8);
const u32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const u64 = (d, o) => u32(d, o) + u32(d, o + 4) * 4294967296;

/** read(start, length) -> Uint8Array; size = total bytes. */
export async function listZip(read, size) {
  const tailLen = Math.min(size, 65557 + 22 + 64), tail = await read(size - tailLen, tailLen);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('This is not a ZIP file, or it is damaged.');
  let count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {      // ZIP64
    const loc = e - 20;
    if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
      const recOff = u64(tail, loc + 8), rec = await read(recOff, 56);
      if (u32(rec, 0) === 0x06064b50) { count = u64(rec, 32); cdSize = u64(rec, 40); cdOff = u64(rec, 48); }
    }
  }
  const cd = await read(cdOff, cdSize), out = []; let o = 0;
  const td = new TextDecoder();
  for (let i = 0; i < count && o + 46 <= cd.length; i++) {
    if (u32(cd, o) !== 0x02014b50) break;
    const flags = u16(cd, o + 8), method = u16(cd, o + 10), nlen = u16(cd, o + 28), elen = u16(cd, o + 30), clen = u16(cd, o + 32);
    let csize = u32(cd, o + 20), usize = u32(cd, o + 24), off = u32(cd, o + 42);
    const name = td.decode(cd.subarray(o + 46, o + 46 + nlen));
    if (csize === 0xffffffff || usize === 0xffffffff || off === 0xffffffff) {   // sizes live in the ZIP64 extra field
      let p = o + 46 + nlen; const end = p + elen;
      while (p + 4 <= end) {
        const id = u16(cd, p), len = u16(cd, p + 2);
        if (id === 1) { let q = p + 4; if (usize === 0xffffffff) { usize = u64(cd, q); q += 8; } if (csize === 0xffffffff) { csize = u64(cd, q); q += 8; } if (off === 0xffffffff) { off = u64(cd, q); } }
        p += 4 + len;
      }
    }
    out.push({ name, method, csize, usize, off, encrypted: !!(flags & 1) });
    o += 46 + nlen + elen + clen;
  }
  return out;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') { const e = new Error('This browser cannot open ZIP files. Unzip it first, then choose the files inside.'); e.code = 'NO_INFLATE'; throw e; }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Text of one entry. Refuses anything over `max` bytes (default 40 MB) so a huge file cannot freeze the phone. */
export async function readZipText(read, entry, max = 40 * 1024 * 1024) {
  if (entry.encrypted) throw new Error('This ZIP file is password protected.');
  if (entry.usize > max) throw new Error('A file inside is too big (' + Math.round(entry.usize / 1048576) + ' MB).');
  const head = await read(entry.off, 30);
  if (u32(head, 0) !== 0x04034b50) throw new Error('The ZIP index looks damaged.');
  const start = entry.off + 30 + u16(head, 26) + u16(head, 28), raw = await read(start, entry.csize);
  const data = entry.method === 0 ? raw : (entry.method === 8 ? await inflateRaw(raw) : null);
  if (!data) throw new Error('Unsupported ZIP compression.');
  return new TextDecoder('utf-8').decode(data);
}

/** Which ZIP entries are worth reading: lists of links in a data export. */
export const WANTED = /\.(json|html?|csv|opml|txt|url)$/i;
export const IG_FOLLOWING = /(^|\/)following\.(json|html?)$/i;
export const isUsable = name => WANTED.test(name) && !/(^|\/)__MACOSX\//.test(name) && !/\/$/.test(name);

/** Blob/File helper: build the read() function for a File. */
export const fileReader = file => async (start, length) => new Uint8Array(await file.slice(start, start + length).arrayBuffer());
