import { crc32, deflateRawSync } from "node:zlib";

/**
 * TESTS ONLY - builds a zip by hand so the reader is checked against bytes it
 * did not write. Node-only (`node:zlib`), and imported by nothing that ships.
 *
 * Each knob is a way a real archive can differ, or be damaged: a forced
 * method, a wrong CRC, a flag, zeroed sizes in the local header (what a
 * streaming writer leaves there), a folder in front of the name, a comment.
 */
export interface TestEntry {
  name: string;
  data: string | Uint8Array;
  /** How the bytes are stored. Default deflate. */
  method?: 0 | 8;
  /** Written into the headers instead of `method`, to fake an unknown one. */
  declaredMethod?: number;
  flags?: number;
  /** Overrides the true CRC, to fake a damaged entry. */
  crc?: number;
  /** Leave the local header's CRC and sizes zero, as a streaming writer does. */
  zeroLocalSizes?: boolean;
  /** Overrides the central directory's sizes, to fake ZIP64 markers. */
  declaredSizes?: { compressed: number; size: number };
}

export function buildZip(
  entries: TestEntry[],
  comment = "",
): Uint8Array<ArrayBuffer> {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.from(
      typeof e.data === "string" ? new TextEncoder().encode(e.data) : e.data,
    );
    const method = e.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, "utf8");
    const crc = e.crc ?? crc32(raw);
    const declared = e.declaredMethod ?? method;
    const compressed = e.declaredSizes?.compressed ?? body.length;
    const size = e.declaredSizes?.size ?? raw.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(e.flags ?? 0, 6);
    local.writeUInt16LE(declared, 8);
    if (!e.zeroLocalSizes) {
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(raw.length, 22);
    }
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(e.flags ?? 0, 8);
    central.writeUInt16LE(declared, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const dir = Buffer.concat(directory);
  const note = Buffer.from(comment, "utf8");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(note.length, 20);
  return new Uint8Array(Buffer.concat([...parts, dir, end, note]));
}
