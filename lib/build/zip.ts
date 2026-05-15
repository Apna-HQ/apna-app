/**
 * lib/build/zip.ts
 *
 * Minimal ZIP archive builder (PKZIP / ZIP32, no external deps).
 * Stores files without compression (method 0, STORED) — fast and dependency-free.
 * Sufficient for source starter files; add Deflate via `zlib.deflateRawSync` if needed.
 *
 * Used by app/api/build/scaffold/route.ts.
 */

interface ZipEntry {
  name: string;
  data: Buffer;
}

function u16le(n: number): Buffer {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32le(n: number): Buffer {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n, 0);
  return b;
}

/** CRC-32 table (standard polynomial 0xEDB88320). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Build a ZIP archive from an array of `{ name, data }` entries.
 * Returns a `Buffer` ready to send as `application/zip`.
 */
export function buildZip(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  const dosDate = dosDatetime();

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header (signature 0x04034b50)
    const localHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
      u16le(20),        // version needed
      u16le(0),         // general purpose bit flag
      u16le(0),         // compression method (0 = STORED)
      u16le(dosDate.time),
      u16le(dosDate.date),
      u32le(crc),
      u32le(size),       // compressed size (= uncompressed for STORED)
      u32le(size),       // uncompressed size
      u16le(nameBytes.length),
      u16le(0),          // extra field length
      nameBytes,
      entry.data,
    ]);

    localHeaders.push(localHeader);

    // Central directory entry (signature 0x02014b50)
    const centralHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
      u16le(20),         // version made by
      u16le(20),         // version needed
      u16le(0),          // general purpose bit flag
      u16le(0),          // compression method
      u16le(dosDate.time),
      u16le(dosDate.date),
      u32le(crc),
      u32le(size),
      u32le(size),
      u16le(nameBytes.length),
      u16le(0),          // extra field length
      u16le(0),          // file comment length
      u16le(0),          // disk number start
      u16le(0),          // internal attributes
      u32le(0),          // external attributes
      u32le(offset),     // relative offset of local header
      nameBytes,
    ]);

    centralHeaders.push(centralHeader);
    // local header = 30 + nameLen + dataLen
    offset += 30 + nameBytes.length + size;
  }

  const centralDir = Buffer.concat(centralHeaders);
  const centralDirSize = centralDir.length;
  const centralDirOffset = offset;
  const numEntries = entries.length;

  // End of central directory record (signature 0x06054b50)
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16le(0),              // disk number
    u16le(0),              // disk with central dir
    u16le(numEntries),
    u16le(numEntries),
    u32le(centralDirSize),
    u32le(centralDirOffset),
    u16le(0),              // comment length
  ]);

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

function dosDatetime(): { date: number; time: number } {
  const d = new Date();
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}
