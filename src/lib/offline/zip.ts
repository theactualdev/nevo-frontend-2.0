/**
 * Just enough of a ZIP reader to open the backend's offline package.
 *
 * WHY NOT A LIBRARY. The package is two small JSON files, and a dependency in a
 * lockfile three sessions share costs more than the hundred lines below. The
 * browser already ships the hard part: `DecompressionStream("deflate-raw")` is
 * the same inflate a zip library would carry.
 *
 * WHAT IT READS. The central directory, which is the only place a zip states
 * its sizes reliably - a writer streaming its output (Python's `zipfile` on an
 * unseekable stream, among others) leaves them zero in the local header and
 * puts them after the data. The local header is read only for where the data
 * starts. Method 0 (stored) and method 8 (deflate), which is everything
 * `zipfile` writes unless asked for bzip2 or lzma.
 *
 * WHAT IT REFUSES, as a `ZipError` rather than a guess: encryption, ZIP64,
 * archives split across disks, any other method, and an entry whose bytes do
 * not match the size and CRC the directory promised. A lesson rebuilt from a
 * damaged archive would be a broken lesson that looks like a whole one, which
 * is worse than a save that says it failed.
 *
 * `ZipUnsupported` is the one failure that is about the DEVICE rather than the
 * file: a browser with no `DecompressionStream`, or one too old to know
 * "deflate-raw" (before Chrome 103 / Safari 16.4 / Firefox 113).
 */

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

/** This browser cannot inflate the archive. Not the archive's fault. */
export class ZipUnsupported extends ZipError {
  constructor() {
    super("This browser cannot inflate a deflated zip entry.");
    this.name = "ZipUnsupported";
  }
}

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  crc32: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const EOCD_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
/** The longest comment a zip can carry, which bounds the search for the end. */
const MAX_COMMENT = 0xffff;
const ZIP64_MARK = 0xffffffff;

const STORED = 0;
const DEFLATED = 8;
const FLAG_ENCRYPTED = 0x1;

/** The entries the archive's central directory lists, in its order. */
export function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(view);

  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) {
    throw new ZipError("Archives split across disks are not supported.");
  }
  const count = view.getUint16(end + 10, true);
  const dirSize = view.getUint32(end + 12, true);
  const dirOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || dirOffset === ZIP64_MARK || dirSize === ZIP64_MARK) {
    throw new ZipError("ZIP64 archives are not supported.");
  }
  if (dirOffset + dirSize > end) {
    throw new ZipError("The central directory runs past the end of the archive.");
  }

  const names = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = dirOffset;
  for (let i = 0; i < count; i++) {
    if (at + CENTRAL_SIZE > end || view.getUint32(at, true) !== CENTRAL) {
      throw new ZipError("The central directory is damaged.");
    }
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const entry: ZipEntry = {
      flags: view.getUint16(at + 8, true),
      method: view.getUint16(at + 10, true),
      crc32: view.getUint32(at + 16, true),
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      localHeaderOffset: view.getUint32(at + 42, true),
      // UTF-8 whatever flag bit 11 says: the only names that matter here are
      // ASCII, which reads the same either way.
      name: names.decode(
        bytes.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength),
      ),
    };
    if (
      entry.compressedSize === ZIP64_MARK ||
      entry.size === ZIP64_MARK ||
      entry.localHeaderOffset === ZIP64_MARK
    ) {
      throw new ZipError("ZIP64 entries are not supported.");
    }
    entries.push(entry);
    at += CENTRAL_SIZE + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** One entry's contents, inflated and checked against its CRC. */
export async function readZipEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
): Promise<Uint8Array> {
  if (entry.flags & FLAG_ENCRYPTED) {
    throw new ZipError("Encrypted entries are not supported.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.localHeaderOffset;
  if (local + LOCAL_SIZE > bytes.byteLength || view.getUint32(local, true) !== LOCAL) {
    throw new ZipError(`No local header for ${entry.name}.`);
  }
  const start =
    local +
    LOCAL_SIZE +
    view.getUint16(local + 26, true) +
    view.getUint16(local + 28, true);
  if (start + entry.compressedSize > bytes.byteLength) {
    throw new ZipError(`${entry.name} runs past the end of the archive.`);
  }
  const raw = bytes.subarray(start, start + entry.compressedSize);

  let data: Uint8Array;
  if (entry.method === STORED) data = raw;
  else if (entry.method === DEFLATED) data = await inflateRaw(raw, entry.size);
  else throw new ZipError(`Compression method ${entry.method} is not supported.`);

  if (data.byteLength !== entry.size || crc32(data) !== entry.crc32) {
    throw new ZipError(`${entry.name} does not match its checksum.`);
  }
  return data;
}

/**
 * The file at `name`, or null when the archive does not hold one. A name with
 * a folder in front of it counts, so a package that nests its files one level
 * down still opens.
 */
export async function readZipFile(
  bytes: Uint8Array,
  name: string,
): Promise<Uint8Array | null> {
  const entries = zipEntries(bytes);
  const entry =
    entries.find((e) => e.name === name) ??
    entries.find((e) => e.name.endsWith(`/${name}`));
  return entry ? readZipEntry(bytes, entry) : null;
}

function findEnd(view: DataView): number {
  const last = view.byteLength - EOCD_SIZE;
  const first = Math.max(0, last - MAX_COMMENT);
  for (let at = last; at >= first; at--) {
    if (view.getUint32(at, true) === EOCD) return at;
  }
  throw new ZipError("Not a zip archive.");
}

/**
 * Inflate through the browser's own decompressor. Stops reading once the
 * output passes the size the directory declared, so a hostile archive cannot
 * expand without limit before the size check refuses it.
 */
async function inflateRaw(raw: Uint8Array, size: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new ZipUnsupported();
  let stream: DecompressionStream;
  try {
    stream = new DecompressionStream("deflate-raw");
  } catch {
    // Browsers that predate "deflate-raw" throw a TypeError on the name.
    throw new ZipUnsupported();
  }

  const writer = stream.writable.getWriter();
  // A write that fails surfaces on the reader below; caught here only so it is
  // not also reported as an unhandled rejection.
  writer
    .write(raw as Uint8Array<ArrayBuffer>)
    .then(() => writer.close())
    .catch(() => {});

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > size) {
        void reader.cancel().catch(() => {});
        throw new ZipError("An entry inflated past its declared size.");
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof ZipError) throw err;
    throw new ZipError("An entry could not be inflated.");
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

let table: Uint32Array | null = null;

/** CRC-32 (IEEE), the checksum every zip entry carries. */
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.byteLength; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
