import { afterEach, describe, expect, it, vi } from "vitest";
import { crc32 as nodeCrc32 } from "node:zlib";
import {
  crc32,
  readZipEntry,
  readZipFile,
  zipEntries,
  ZipError,
  ZipUnsupported,
} from "./zip";
import { buildZip } from "./testZip";

/**
 * The offline package's reader. What matters: it opens what the backend's
 * zip writer produces - stored, deflated, and streamed with the sizes after
 * the data - and anything damaged, unknown or beyond this device is refused
 * as an error, never handed back as a lesson.
 */

/*
 * Written by Python's `zipfile`, the backend's language, holding a one-segment
 * `lesson.json` and a `manifest.json`. Generated once and pasted in so the
 * tests do not need Python: `ZIP_STORED`, `ZIP_DEFLATED`, and `ZIP_DEFLATED`
 * to an unseekable stream - which zeroes the local header's sizes and sets
 * flag bit 3, the case a reader trusting the local header gets wrong.
 */
const PY_STORED =
  "UEsDBBQAAAAAAFq0QV28iFTnOwEAADsBAAALAAAAbGVzc29uLmpzb257ImlkIjogIjdmOWMyYjFlLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSIsICJ0aXRsZSI6ICJGcmFjdGlvbnMiLCAic2VnbWVudHMiOiBbeyJpZCI6ICJzMSIsICJzZWdtZW50S2V5IjogInMxIiwgInNlcXVlbmNlT3JkZXIiOiAwLCAiY29udGVudFR5cGUiOiAiZXhwbGFuYXRvcnlfdGV4dCIsICJ0aXRsZSI6ICJIYWx2ZXMiLCAiYm9keSI6ICJBIGhhbGYgaXMgb25lIG9mIHR3byBlcXVhbCBwYXJ0cy4iLCAiYXZhaWxhYmxlTW9kYWxpdGllcyI6IFsidGV4dCJdLCAiY29tcHJlaGVuc2lvbkNoZWNrcG9pbnRzIjogW119XSwgIm1vZHVsZXMiOiBbXX1QSwMEFAAAAAAAWrRBXdLh5LWFAAAAhQAAAA0AAABtYW5pZmVzdC5qc29ueyJsZXNzb25JZCI6ICI3ZjljMmIxZS0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCAidmVyc2lvbiI6IDEsICJmaWxlcyI6IFsibGVzc29uLmpzb24iLCAibWFuaWZlc3QuanNvbiJdLCAiaW5jbHVkZXNNZWRpYSI6IGZhbHNlfVBLAQIUABQAAAAAAFq0QV28iFTnOwEAADsBAAALAAAAAAAAAAAAAACAAQAAAABsZXNzb24uanNvblBLAQIUABQAAAAAAFq0QV3S4eS1hQAAAIUAAAANAAAAAAAAAAAAAACAAWQBAABtYW5pZmVzdC5qc29uUEsFBgAAAAACAAIAdAAAABQCAAAAAA==";
const PY_DEFLATED =
  "UEsDBBQAAAAIAFq0QV28iFTnzAAAADsBAAALAAAAbGVzc29uLmpzb25Vj09LBDEMxb9K6NmVGRH8cxNBBBEv3mSRTJtxipmmttl1h8XvblsGXHPI4ZeX95Kj8c7cgrkab+zF0NOmK7W5rO26tu6venMGRr0y1YWHhFa9hFxppo+ZguYyeDuujrk/mTzRcsq+dhQsvSRHqeCuMCtBi+51ic2dDpExoEpa3pUO+i/6EXlPLXcQ13zvYEIewWeQQCAj6LdASUGGiEnzeRXjHj3jwPQsDtmrp3avaf7bdsMcE00UcvnrfiL7GcWvX21/qmIWt2NawS9QSwMEFAAAAAgAWrRBXdLh5LVlAAAAhQAAAA0AAABtYW5pZmVzdC5qc29uq1bKSS0uzs/zTFGyUlAyT7NMNkoyTNU1AAJdExBhASIMEMBQSUdBqSy1qDgzPw+oxRDIS8sEmgFkR0PN0ssCEiBluYl5mWmpxSUQgVigSGZeck5pSmqxb2pKZiJQS1piTnFqLQBQSwECFAAUAAAACABatEFdvIhU58wAAAA7AQAACwAAAAAAAAAAAAAAgAEAAAAAbGVzc29uLmpzb25QSwECFAAUAAAACABatEFd0uHktWUAAACFAAAADQAAAAAAAAAAAAAAgAH1AAAAbWFuaWZlc3QuanNvblBLBQYAAAAAAgACAHQAAACFAQAAAAA=";
const PY_STREAMED =
  "UEsDBBQACAAIAAAAIQAAAAAAAAAAAAAAAAALAAAAbGVzc29uLmpzb25Vj09LBDEMxb9K6NmVGRH8cxNBBBEv3mSRTJtxipmmttl1h8XvblsGXHPI4ZeX95Kj8c7cgrkab+zF0NOmK7W5rO26tu6venMGRr0y1YWHhFa9hFxppo+ZguYyeDuujrk/mTzRcsq+dhQsvSRHqeCuMCtBi+51ic2dDpExoEpa3pUO+i/6EXlPLXcQ13zvYEIewWeQQCAj6LdASUGGiEnzeRXjHj3jwPQsDtmrp3avaf7bdsMcE00UcvnrfiL7GcWvX21/qmIWt2NawS9QSwcIvIhU58wAAAA7AQAAUEsDBBQACAAIAAAAIQAAAAAAAAAAAAAAAAANAAAAbWFuaWZlc3QuanNvbqtWykktLs7P80xRslJQMk+zTDZKMkzVNQACXRMQYQEiDBDAUElHQakstag4Mz8PqMUQyEvLBJoBZEdDzdLLAhIgZbmJeZlpqcUlEIFYoEhmXnJOaUpqsW9qSmYiUEtaYk5xai0AUEsHCNLh5LVlAAAAhQAAAFBLAQIUABQACAAIAAAAIQC8iFTnzAAAADsBAAALAAAAAAAAAAAAAACAAQAAAABsZXNzb24uanNvblBLAQIUABQACAAIAAAAIQDS4eS1ZQAAAIUAAAANAAAAAAAAAAAAAACAAQUBAABtYW5pZmVzdC5qc29uUEsFBgAAAAACAAIAdAAAAKUBAAAAAA==";

const bytes = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));
const text = (data: Uint8Array | null) =>
  data === null ? null : new TextDecoder().decode(data);

afterEach(() => vi.unstubAllGlobals());

describe("what the backend's zip writer produces", () => {
  it.each([
    ["stored", PY_STORED],
    ["deflated", PY_DEFLATED],
    ["streamed, with the sizes after the data", PY_STREAMED],
  ])("opens a %s archive", async (_, archive) => {
    const zip = bytes(archive);

    expect(zipEntries(zip).map((e) => e.name)).toEqual([
      "lesson.json",
      "manifest.json",
    ]);
    const lesson = JSON.parse(text(await readZipFile(zip, "lesson.json"))!);
    expect(lesson.title).toBe("Fractions");
    expect(lesson.segments[0].body).toBe("A half is one of two equal parts.");
    const manifest = JSON.parse(text(await readZipFile(zip, "manifest.json"))!);
    expect(manifest.includesMedia).toBe(false);
  });
});

describe("reading an archive", () => {
  it("reads stored and deflated entries side by side", async () => {
    const zip = buildZip([
      { name: "a.json", data: '{"a":1}', method: 0 },
      { name: "b.json", data: "b".repeat(5000), method: 8 },
    ]);

    expect(text(await readZipFile(zip, "a.json"))).toBe('{"a":1}');
    expect(text(await readZipFile(zip, "b.json"))).toBe("b".repeat(5000));
  });

  it("finds the end past an archive comment", async () => {
    const zip = buildZip([{ name: "lesson.json", data: "{}" }], "made by a test");

    expect(text(await readZipFile(zip, "lesson.json"))).toBe("{}");
  });

  it("takes the sizes from the directory when the local header has none", async () => {
    const zip = buildZip([
      { name: "lesson.json", data: '{"x":true}', flags: 0x8, zeroLocalSizes: true },
    ]);

    expect(text(await readZipFile(zip, "lesson.json"))).toBe('{"x":true}');
  });

  it("reads an archive handed over as a view into a larger buffer", async () => {
    const zip = buildZip([{ name: "lesson.json", data: '{"v":2}' }]);
    const host = new Uint8Array(zip.byteLength + 64);
    host.set(zip, 32);

    const view = host.subarray(32, 32 + zip.byteLength);
    expect(text(await readZipFile(view, "lesson.json"))).toBe('{"v":2}');
  });

  it("finds a file one folder down, and says when there is none", async () => {
    const zip = buildZip([{ name: "pkg/lesson.json", data: "{}" }]);

    expect(text(await readZipFile(zip, "lesson.json"))).toBe("{}");
    expect(await readZipFile(zip, "manifest.json")).toBeNull();
  });

  it("checks its CRC against Node's own", () => {
    const data = new TextEncoder().encode("The quick brown fox");
    expect(crc32(data)).toBe(nodeCrc32(data));
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("what it refuses rather than guess at", () => {
  it("is not a zip", () => {
    expect(() => zipEntries(new TextEncoder().encode("<html>502</html>"))).toThrow(
      ZipError,
    );
    expect(() => zipEntries(new Uint8Array())).toThrow(ZipError);
  });

  it("an entry whose bytes do not match its checksum", async () => {
    const zip = buildZip([{ name: "lesson.json", data: "{}", method: 0, crc: 1234 }]);

    await expect(readZipFile(zip, "lesson.json")).rejects.toThrow(ZipError);
  });

  it("an archive cut short", async () => {
    const zip = buildZip([{ name: "lesson.json", data: "x".repeat(400), method: 0 }]);

    expect(() => zipEntries(zip.subarray(0, 200))).toThrow(ZipError);
  });

  it("a compression method it does not read", async () => {
    const zip = buildZip([
      { name: "lesson.json", data: "{}", method: 0, declaredMethod: 12 },
    ]);

    await expect(readZipFile(zip, "lesson.json")).rejects.toThrow(/method 12/);
  });

  it("an encrypted entry", async () => {
    const zip = buildZip([{ name: "lesson.json", data: "{}", method: 0, flags: 0x1 }]);

    await expect(readZipFile(zip, "lesson.json")).rejects.toThrow(/Encrypted/);
  });

  it("ZIP64", () => {
    const zip = buildZip([
      {
        name: "lesson.json",
        data: "{}",
        declaredSizes: { compressed: 0xffffffff, size: 0xffffffff },
      },
    ]);

    expect(() => zipEntries(zip)).toThrow(/ZIP64/);
  });

  it("an entry that inflates past the size it declared", async () => {
    // A hundred thousand bytes that compress to almost nothing, declared as
    // ten: the inflate is sound, only the declared size is a lie.
    const zip = buildZip([{ name: "lesson.json", data: "z".repeat(100_000) }]);
    const [entry] = zipEntries(zip);

    await expect(readZipEntry(zip, { ...entry, size: 10 })).rejects.toThrow(
      /past its declared size/,
    );
  });

  it("a deflated entry that is not deflate", async () => {
    const zip = buildZip([
      { name: "lesson.json", data: "not deflate at all", method: 0, declaredMethod: 8 },
    ]);

    await expect(readZipFile(zip, "lesson.json")).rejects.toThrow(ZipError);
  });
});

describe("a device that cannot inflate", () => {
  it("says so as its own failure when there is no DecompressionStream", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    const zip = buildZip([
      { name: "lesson.json", data: "{}", method: 8 },
      { name: "plain.json", data: "{}", method: 0 },
    ]);

    await expect(readZipFile(zip, "lesson.json")).rejects.toBeInstanceOf(
      ZipUnsupported,
    );
    // A stored entry needs no inflating, so it still opens.
    expect(text(await readZipFile(zip, "plain.json"))).toBe("{}");
  });

  it("and when the browser predates deflate-raw", async () => {
    vi.stubGlobal(
      "DecompressionStream",
      class {
        constructor(format: string) {
          if (format === "deflate-raw") {
            throw new TypeError(`Unsupported compression format: '${format}'`);
          }
        }
      },
    );
    const zip = bytes(PY_DEFLATED);

    await expect(readZipFile(zip, "lesson.json")).rejects.toBeInstanceOf(
      ZipUnsupported,
    );
  });
});
