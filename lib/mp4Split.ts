/**
 * Splits an MP4/MOV video into parts of about N seconds, in the browser,
 * without re-encoding: parts are cut at the nearest video keyframe and their
 * sample data is taken straight from the original file. Each part is a
 * normal, "fast start" MP4 (moov before mdat), built as a Blob made of slices
 * of the original File, so even large videos use almost no extra memory and a
 * 7-minute video splits in well under a second.
 *
 * Supported: progressive (non-fragmented) MP4 / MOV / M4V with one video
 * track and optionally one audio track (H.264/H.265/AAC… any codec, since
 * samples are copied as-is). Other tracks (timecode, subtitles) are dropped.
 * Anything else throws Mp4SplitUnsupported, and the caller uploads the file whole.
 */

export class Mp4SplitUnsupported extends Error {}

export type SplitPlan = {
  /** Start/end of each part in seconds (end exclusive). */
  parts: { start: number; end: number }[];
  durationSeconds: number;
};

export type SplitPart = { blob: Blob; start: number; durationSeconds: number; index: number; count: number };

// ------------------------------------------------------------------
// Part planning (pure)

/**
 * Cut points every `partSeconds`, moved to the nearest keyframe; a last part
 * shorter than `minLastSeconds` is merged into the previous one. A video that
 * isn't longer than partSeconds (+ the merge allowance) stays in one part.
 */
export function planParts(
  durationSeconds: number,
  keyframeTimes: number[],
  partSeconds = 180,
  minLastSeconds = 30
): SplitPlan {
  const cuts: number[] = [];
  const keys = [...keyframeTimes].sort((a, b) => a - b);
  let target = partSeconds;
  let last = 0;
  while (target < durationSeconds) {
    // nearest keyframe to the target that is after the previous cut
    let best: number | null = null;
    for (const k of keys) {
      if (k <= last + 1) continue;
      if (best === null || Math.abs(k - target) < Math.abs(best - target)) best = k;
      if (k > target && best !== null && k - target > Math.abs(best - target)) break;
    }
    if (best === null) break;
    cuts.push(best);
    last = best;
    target = best + partSeconds;
  }
  while (cuts.length && durationSeconds - cuts[cuts.length - 1] < minLastSeconds) cuts.pop();
  const bounds = [0, ...cuts, durationSeconds];
  return {
    durationSeconds,
    parts: bounds.slice(0, -1).map((start, i) => ({ start, end: bounds[i + 1] })),
  };
}

// ------------------------------------------------------------------
// Box reading

type Box = { type: string; start: number; size: number; headerSize: number };

async function readBytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/** Top-level boxes, reading only their headers. */
async function scanTopLevel(file: Blob): Promise<Box[]> {
  const boxes: Box[] = [];
  let pos = 0;
  while (pos + 8 <= file.size) {
    const h = await readBytes(file, pos, Math.min(pos + 16, file.size));
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let size = dv.getUint32(0);
    const type = String.fromCharCode(h[4], h[5], h[6], h[7]);
    let headerSize = 8;
    if (size === 1) {
      if (h.byteLength < 16) break;
      size = Number(dv.getBigUint64(8));
      headerSize = 16;
    } else if (size === 0) {
      size = file.size - pos;
    }
    if (size < headerSize) throw new Mp4SplitUnsupported("Damaged MP4 box");
    boxes.push({ type, start: pos, size, headerSize });
    pos += size;
  }
  return boxes;
}

/** Child boxes inside a buffer region. */
function children(buf: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = start;
  while (pos + 8 <= end) {
    let size = dv.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    let headerSize = 8;
    if (size === 1) {
      size = Number(dv.getBigUint64(pos + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize || pos + size > end) break;
    out.push({ type, start: pos, size, headerSize });
    pos += size;
  }
  return out;
}

const find = (boxes: Box[], type: string) => boxes.find((b) => b.type === type);

// ------------------------------------------------------------------
// Track parsing

type Track = {
  kind: "vide" | "soun";
  timescale: number;
  tkhd: Uint8Array; // raw box
  hdlr: Uint8Array;
  mediaHeaderBoxes: Uint8Array[]; // vmhd/smhd + dinf (raw)
  stsd: Uint8Array;
  mdhdVersion: number;
  mdhdRaw: Uint8Array;
  editMediaTime: number; // from a single normal edit, else 0
  // per-sample
  dts: Float64Array; // decode time in media timescale
  dur: Uint32Array;
  size: Uint32Array;
  offset: Float64Array;
  cts: Int32Array | null;
  ctsVersion: number;
  sync: Uint8Array | null; // null = all samples are sync
};

function u32(dv: DataView, p: number) {
  return dv.getUint32(p);
}

function parseTrack(buf: Uint8Array, trak: Box): Track | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const kids = children(buf, trak.start + trak.headerSize, trak.start + trak.size);
  const tkhd = find(kids, "tkhd");
  const mdia = find(kids, "mdia");
  if (!tkhd || !mdia) return null;
  const mdiaKids = children(buf, mdia.start + mdia.headerSize, mdia.start + mdia.size);
  const mdhd = find(mdiaKids, "mdhd");
  const hdlr = find(mdiaKids, "hdlr");
  const minf = find(mdiaKids, "minf");
  if (!mdhd || !hdlr || !minf) return null;
  const handler = String.fromCharCode(...buf.slice(hdlr.start + 16, hdlr.start + 20));
  if (handler !== "vide" && handler !== "soun") return null;

  const mdhdVersion = buf[mdhd.start + 8];
  const timescale = u32(dv, mdhd.start + 8 + (mdhdVersion === 1 ? 20 : 12));

  // Edit list: honour a single normal edit's media_time (B-frame offset).
  let editMediaTime = 0;
  const edts = find(kids, "edts");
  if (edts) {
    const elst = find(children(buf, edts.start + edts.headerSize, edts.start + edts.size), "elst");
    if (elst) {
      const v = buf[elst.start + 8];
      const n = u32(dv, elst.start + 12);
      const entrySize = v === 1 ? 20 : 12;
      const entries: number[] = [];
      for (let i = 0; i < n; i++) {
        const p = elst.start + 16 + i * entrySize;
        const mt = v === 1 ? Number(dv.getBigInt64(p + 8)) : dv.getInt32(p + 4);
        entries.push(mt);
      }
      const normal = entries.filter((mt) => mt >= 0);
      if (normal.length === 1) editMediaTime = normal[0];
    }
  }

  const minfKids = children(buf, minf.start + minf.headerSize, minf.start + minf.size);
  const stbl = find(minfKids, "stbl");
  if (!stbl) return null;
  const mediaHeaderBoxes = minfKids
    .filter((b) => b.type === "vmhd" || b.type === "smhd" || b.type === "dinf")
    .map((b) => buf.slice(b.start, b.start + b.size));
  const s = children(buf, stbl.start + stbl.headerSize, stbl.start + stbl.size);
  const stsd = find(s, "stsd");
  const stts = find(s, "stts");
  const stsc = find(s, "stsc");
  const stsz = find(s, "stsz");
  const stco = find(s, "stco");
  const co64 = find(s, "co64");
  if (!stsd || !stts || !stsc || !stsz || !(stco || co64)) throw new Mp4SplitUnsupported("Unsupported sample tables");

  // sizes
  const fixed = u32(dv, stsz.start + 12);
  const count = u32(dv, stsz.start + 16);
  const size = new Uint32Array(count);
  for (let i = 0; i < count; i++) size[i] = fixed || u32(dv, stsz.start + 20 + i * 4);

  // durations / decode times
  const dur = new Uint32Array(count);
  const dts = new Float64Array(count);
  {
    const n = u32(dv, stts.start + 12);
    let k = 0;
    let t = 0;
    for (let i = 0; i < n && k < count; i++) {
      const c = u32(dv, stts.start + 16 + i * 8);
      const d = u32(dv, stts.start + 20 + i * 8);
      for (let j = 0; j < c && k < count; j++, k++) {
        dts[k] = t;
        dur[k] = d;
        t += d;
      }
    }
  }

  // composition offsets
  let cts: Int32Array | null = null;
  let ctsVersion = 0;
  const ctts = find(s, "ctts");
  if (ctts) {
    ctsVersion = buf[ctts.start + 8];
    cts = new Int32Array(count);
    const n = u32(dv, ctts.start + 12);
    let k = 0;
    for (let i = 0; i < n && k < count; i++) {
      const c = u32(dv, ctts.start + 16 + i * 8);
      const o = ctsVersion === 1 ? dv.getInt32(ctts.start + 20 + i * 8) : u32(dv, ctts.start + 20 + i * 8);
      for (let j = 0; j < c && k < count; j++, k++) cts[k] = o;
    }
  }

  // sync samples
  let sync: Uint8Array | null = null;
  const stss = find(s, "stss");
  if (stss) {
    sync = new Uint8Array(count);
    const n = u32(dv, stss.start + 12);
    for (let i = 0; i < n; i++) {
      const idx = u32(dv, stss.start + 16 + i * 4) - 1;
      if (idx >= 0 && idx < count) sync[idx] = 1;
    }
  }

  // file offsets (stsc + stco/co64)
  const offset = new Float64Array(count);
  {
    const chunkCount = co64 ? u32(dv, co64.start + 12) : u32(dv, stco!.start + 12);
    const chunkOffset = (c: number) =>
      co64 ? Number(dv.getBigUint64(co64.start + 16 + c * 8)) : u32(dv, stco!.start + 16 + c * 4);
    const n = u32(dv, stsc.start + 12);
    const entries: { first: number; per: number }[] = [];
    for (let i = 0; i < n; i++) entries.push({ first: u32(dv, stsc.start + 16 + i * 12) - 1, per: u32(dv, stsc.start + 20 + i * 12) });
    let k = 0;
    for (let e = 0; e < entries.length && k < count; e++) {
      const lastChunk = e + 1 < entries.length ? entries[e + 1].first : chunkCount;
      for (let c = entries[e].first; c < lastChunk && k < count; c++) {
        let pos = chunkOffset(c);
        for (let j = 0; j < entries[e].per && k < count; j++, k++) {
          offset[k] = pos;
          pos += size[k];
        }
      }
    }
    if (k < count) throw new Mp4SplitUnsupported("Sample table doesn't cover all samples");
  }

  return {
    kind: handler,
    timescale,
    tkhd: buf.slice(tkhd.start, tkhd.start + tkhd.size),
    hdlr: buf.slice(hdlr.start, hdlr.start + hdlr.size),
    mediaHeaderBoxes,
    stsd: buf.slice(stsd.start, stsd.start + stsd.size),
    mdhdVersion,
    mdhdRaw: buf.slice(mdhd.start, mdhd.start + mdhd.size),
    editMediaTime,
    dts,
    dur,
    size,
    offset,
    cts,
    ctsVersion,
    sync,
  };
}

// ------------------------------------------------------------------
// Box writing

class Writer {
  parts: Uint8Array[] = [];
  length = 0;
  push(b: Uint8Array) {
    this.parts.push(b);
    this.length += b.byteLength;
  }
  u8(v: number) {
    this.push(Uint8Array.of(v & 255));
  }
  u32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0);
    this.push(b);
  }
  i32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v | 0);
    this.push(b);
  }
  u64(v: number) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt(Math.max(0, Math.round(v))));
    this.push(b);
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let p = 0;
    for (const b of this.parts) {
      out.set(b, p);
      p += b.byteLength;
    }
    return out;
  }
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const size = 8 + payload.reduce((a, b) => a + b.byteLength, 0);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, size);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  let p = 8;
  for (const b of payload) {
    out.set(b, p);
    p += b.byteLength;
  }
  return out;
}

function fullBox(type: string, version: number, flags: number, write: (w: Writer) => void): Uint8Array {
  const w = new Writer();
  w.u32(((version & 255) << 24) | (flags & 0xffffff));
  write(w);
  return box(type, w.bytes());
}

/** Copies a raw box and overwrites its duration field. */
function patchDuration(raw: Uint8Array, type: "mvhd" | "tkhd" | "mdhd", duration: number): Uint8Array {
  const out = raw.slice();
  const dv = new DataView(out.buffer);
  const v = out[8];
  // offsets from box start: header 8 + version/flags 4
  const pos =
    type === "tkhd" ? (v === 1 ? 8 + 4 + 8 + 8 + 4 + 4 : 8 + 4 + 4 + 4 + 4 + 4) : v === 1 ? 8 + 4 + 8 + 8 + 4 : 8 + 4 + 4 + 4 + 4;
  if (v === 1) dv.setBigUint64(pos, BigInt(Math.round(duration)));
  else dv.setUint32(pos, Math.min(0xffffffff, Math.round(duration)));
  return out;
}

// ------------------------------------------------------------------
// Splitting

type Chunk = { track: number; first: number; last: number; time: number };

type Parsed = {
  file: Blob;
  ftyp: Uint8Array | null;
  mvhd: Uint8Array;
  movieTimescale: number;
  tracks: Track[]; // video first
  durationSeconds: number;
  keyframeTimes: number[];
};

async function parse(file: Blob): Promise<Parsed> {
  const top = await scanTopLevel(file);
  if (top.some((b) => b.type === "moof")) throw new Mp4SplitUnsupported("Fragmented MP4 isn't supported");
  const moovBox = find(top, "moov");
  if (!moovBox) throw new Mp4SplitUnsupported("Not an MP4/MOV file");
  if (moovBox.size > 200 * 1024 * 1024) throw new Mp4SplitUnsupported("Movie header too large");
  const ftypBox = find(top, "ftyp");
  const ftyp = ftypBox ? await readBytes(file, ftypBox.start, ftypBox.start + ftypBox.size) : null;
  const moov = await readBytes(file, moovBox.start, moovBox.start + moovBox.size);

  const kids = children(moov, moovBox.headerSize, moov.byteLength);
  const mvhdBox = find(kids, "mvhd");
  if (!mvhdBox) throw new Mp4SplitUnsupported("Missing movie header");
  const mvhd = moov.slice(mvhdBox.start, mvhdBox.start + mvhdBox.size);
  const mdv = new DataView(mvhd.buffer);
  const movieTimescale = mdv.getUint32(mvhd[8] === 1 ? 8 + 4 + 16 : 8 + 4 + 8);

  const parsedTracks = kids.filter((b) => b.type === "trak").map((t) => parseTrack(moov, t)).filter((t): t is Track => t !== null);
  const video = parsedTracks.find((t) => t.kind === "vide" && t.dts.length > 0);
  if (!video) throw new Mp4SplitUnsupported("No video track");
  const audio = parsedTracks.find((t) => t.kind === "soun" && t.dts.length > 0);
  const tracks = audio ? [video, audio] : [video];

  const n = video.dts.length;
  const durationSeconds = (video.dts[n - 1] + video.dur[n - 1]) / video.timescale;
  const keyframeTimes: number[] = [];
  for (let i = 0; i < n; i++) if (!video.sync || video.sync[i]) keyframeTimes.push(video.dts[i] / video.timescale);
  return { file, ftyp, mvhd, movieTimescale, tracks, durationSeconds, keyframeTimes };
}

/** First sample index with time (seconds) >= t. */
function firstAtOrAfter(track: Track, t: number): number {
  const target = t * track.timescale - 1e-6;
  let lo = 0;
  let hi = track.dts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (track.dts[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function buildPart(p: Parsed, start: number, end: number, isLast: boolean): { blob: Blob; durationSeconds: number } {
  // Sample ranges per track: [first, last] inclusive
  const ranges = p.tracks.map((t) => {
    const first = firstAtOrAfter(t, start);
    const last = isLast ? t.dts.length - 1 : firstAtOrAfter(t, end) - 1;
    return { first, last };
  });
  if (ranges[0].last < ranges[0].first) throw new Mp4SplitUnsupported("Empty part");

  // ~1 second chunks per track, interleaved by time (good for streaming).
  const chunks: Chunk[] = [];
  p.tracks.forEach((t, ti) => {
    const { first, last } = ranges[ti];
    let i = first;
    while (i <= last) {
      const startTime = t.dts[i];
      let j = i;
      while (j + 1 <= last && t.dts[j + 1] - startTime < t.timescale) j++;
      chunks.push({ track: ti, first: i, last: j, time: startTime / t.timescale });
      i = j + 1;
    }
  });
  chunks.sort((a, b) => a.time - b.time || a.track - b.track);

  const trackDurations = p.tracks.map((t, ti) => {
    const { first, last } = ranges[ti];
    let d = 0;
    for (let i = first; i <= last; i++) d += t.dur[i];
    return d;
  });
  const movieDuration = Math.max(...p.tracks.map((t, ti) => (trackDurations[ti] / t.timescale) * p.movieTimescale));

  const totalData = chunks.reduce((a, c) => {
    const t = p.tracks[c.track];
    for (let i = c.first; i <= c.last; i++) a += t.size[i];
    return a;
  }, 0);
  const useCo64 = totalData > 0xffffffff - 50_000_000;

  const buildMoov = (chunkOffsets: number[]): Uint8Array => {
    const traks = p.tracks.map((t, ti) => {
      const { first, last } = ranges[ti];
      const myChunks = chunks.map((c, ci) => ({ c, ci })).filter((x) => x.c.track === ti);

      const stts = new Writer();
      {
        const runs: [number, number][] = [];
        for (let i = first; i <= last; i++) {
          const d = t.dur[i];
          if (runs.length && runs[runs.length - 1][1] === d) runs[runs.length - 1][0]++;
          else runs.push([1, d]);
        }
        stts.u32(runs.length);
        for (const [c, d] of runs) {
          stts.u32(c);
          stts.u32(d);
        }
      }
      const boxes: Uint8Array[] = [fullBox("stts", 0, 0, (w) => w.push(stts.bytes()))];

      if (t.cts) {
        const runs: [number, number][] = [];
        for (let i = first; i <= last; i++) {
          const o = t.cts[i];
          if (runs.length && runs[runs.length - 1][1] === o) runs[runs.length - 1][0]++;
          else runs.push([1, o]);
        }
        boxes.push(
          fullBox("ctts", t.ctsVersion, 0, (w) => {
            w.u32(runs.length);
            for (const [c, o] of runs) {
              w.u32(c);
              if (t.ctsVersion === 1) w.i32(o);
              else w.u32(o);
            }
          })
        );
      }
      if (t.sync) {
        const idx: number[] = [];
        for (let i = first; i <= last; i++) if (t.sync[i]) idx.push(i - first + 1);
        if (idx[0] !== 1) idx.unshift(1); // parts always start on a keyframe
        boxes.push(
          fullBox("stss", 0, 0, (w) => {
            w.u32(idx.length);
            idx.forEach((v) => w.u32(v));
          })
        );
      }
      // stsc: one entry per change in samples-per-chunk
      const stscEntries: [number, number][] = [];
      myChunks.forEach(({ c }, k) => {
        const per = c.last - c.first + 1;
        if (!stscEntries.length || stscEntries[stscEntries.length - 1][1] !== per) stscEntries.push([k + 1, per]);
      });
      boxes.push(
        fullBox("stsc", 0, 0, (w) => {
          w.u32(stscEntries.length);
          for (const [fc, per] of stscEntries) {
            w.u32(fc);
            w.u32(per);
            w.u32(1);
          }
        })
      );
      boxes.push(
        fullBox("stsz", 0, 0, (w) => {
          w.u32(0);
          w.u32(last - first + 1);
          for (let i = first; i <= last; i++) w.u32(t.size[i]);
        })
      );
      boxes.push(
        fullBox(useCo64 ? "co64" : "stco", 0, 0, (w) => {
          w.u32(myChunks.length);
          myChunks.forEach(({ ci }) => (useCo64 ? w.u64(chunkOffsets[ci]) : w.u32(chunkOffsets[ci])));
        })
      );

      const stbl = box("stbl", t.stsd, ...boxes);
      const minf = box("minf", ...t.mediaHeaderBoxes, stbl);
      const mdhd = patchDuration(t.mdhdRaw, "mdhd", trackDurations[ti]);
      const mdia = box("mdia", mdhd, t.hdlr, minf);
      const movieDur = (trackDurations[ti] / t.timescale) * p.movieTimescale;
      const tkhd = patchDuration(t.tkhd, "tkhd", movieDur);
      const elst = fullBox("elst", 0, 0, (w) => {
        w.u32(1);
        w.u32(Math.round(movieDur));
        w.i32(t.editMediaTime);
        w.u32(0x00010000); // media rate 1.0
      });
      return box("trak", tkhd, box("edts", elst), mdia);
    });
    return box("moov", patchDuration(p.mvhd, "mvhd", movieDuration), ...traks);
  };

  // Lay out: ftyp, moov, mdat header, chunk data. moov size doesn't depend on
  // the offset values, so build once with zeros to measure it.
  const ftyp = p.ftyp ?? box("ftyp", new TextEncoder().encode("isom"), new Uint8Array([0, 0, 2, 0]), new TextEncoder().encode("isomiso2avc1mp41"));
  const moovSize = buildMoov(chunks.map(() => 0)).byteLength;
  const mdatLarge = totalData + 8 > 0xffffffff;
  const mdatHeaderSize = mdatLarge ? 16 : 8;
  let pos = ftyp.byteLength + moovSize + mdatHeaderSize;
  const chunkOffsets: number[] = [];
  for (const c of chunks) {
    chunkOffsets.push(pos);
    const t = p.tracks[c.track];
    for (let i = c.first; i <= c.last; i++) pos += t.size[i];
  }
  const moov = buildMoov(chunkOffsets);

  const mdatHeader = new Uint8Array(mdatHeaderSize);
  const hdv = new DataView(mdatHeader.buffer);
  if (mdatLarge) {
    hdv.setUint32(0, 1);
    hdv.setBigUint64(8, BigInt(totalData + 16));
  } else {
    hdv.setUint32(0, totalData + 8);
  }
  mdatHeader.set([0x6d, 0x64, 0x61, 0x74], 4); // "mdat"

  // Data: slices of the original file, merging neighbouring samples.
  const pieces: BlobPart[] = [ftyp as BlobPart, moov as BlobPart, mdatHeader as BlobPart];
  let runStart = -1;
  let runEnd = -1;
  const flush = () => {
    if (runStart >= 0) pieces.push(p.file.slice(runStart, runEnd));
  };
  for (const c of chunks) {
    const t = p.tracks[c.track];
    for (let i = c.first; i <= c.last; i++) {
      const o = t.offset[i];
      const e = o + t.size[i];
      if (o === runEnd) runEnd = e;
      else {
        flush();
        runStart = o;
        runEnd = e;
      }
    }
  }
  flush();

  const video = p.tracks[0];
  return {
    blob: new Blob(pieces, { type: "video/mp4" }),
    durationSeconds: trackDurations[0] / video.timescale,
  };
}

/** Reads the file's structure and works out the parts (nothing is copied yet). */
export async function planVideoSplit(
  file: Blob,
  partSeconds = 180,
  minLastSeconds = 30
): Promise<SplitPlan & { parsed: unknown }> {
  const parsed = await parse(file);
  return { ...planParts(parsed.durationSeconds, parsed.keyframeTimes, partSeconds, minLastSeconds), parsed };
}

/**
 * Splits a video into ~partSeconds parts at keyframes (a last part shorter
 * than minLastSeconds is merged). Returns one part (the original file) when
 * the video is short enough. Throws Mp4SplitUnsupported for formats it can't handle.
 */
export async function splitVideo(file: Blob, partSeconds = 180, minLastSeconds = 30): Promise<SplitPart[]> {
  const parsed = await parse(file);
  const plan = planParts(parsed.durationSeconds, parsed.keyframeTimes, partSeconds, minLastSeconds);
  if (plan.parts.length <= 1) {
    return [{ blob: file, start: 0, durationSeconds: parsed.durationSeconds, index: 0, count: 1 }];
  }
  return plan.parts.map((part, i) => {
    const built = buildPart(parsed, part.start, part.end, i === plan.parts.length - 1);
    return { blob: built.blob, start: part.start, durationSeconds: built.durationSeconds, index: i, count: plan.parts.length };
  });
}
