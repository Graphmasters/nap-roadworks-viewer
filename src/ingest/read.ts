// Turns a file (or any byte stream) into a stream of decoded text. Gzip is detected by its magic
// bytes rather than by file name: NAP downloads are often gzip files saved as `*.xml`.

export interface ByteSource {
  /** Total size in bytes, if known (used for progress). */
  size?: number
  stream(): ReadableStream<Uint8Array>
}

export interface OpenedText {
  text: ReadableStream<string>
  compressed: boolean
  /** Character encoding used for decoding. */
  encoding: string
}

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

/** Reads the encoding from an XML declaration in the first bytes, defaulting to UTF-8. */
export function sniffEncoding(head: Uint8Array): string {
  if (head[0] === 0xff && head[1] === 0xfe) return 'utf-16le'
  if (head[0] === 0xfe && head[1] === 0xff) return 'utf-16be'
  const ascii = new TextDecoder('latin1').decode(head.subarray(0, 200))
  const m = /^﻿?\s*<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(ascii.replace(/^ï»¿/, ''))
  const label = m?.[1]?.toLowerCase()
  if (!label) return 'utf-8'
  try {
    return new TextDecoder(label).encoding
  } catch {
    return 'utf-8'
  }
}

/** Reads the first chunk(s) of a stream and returns them with a stream that replays everything. */
async function peek(
  stream: ReadableStream<Uint8Array>,
  min: number,
): Promise<{ head: Uint8Array; stream: ReadableStream<Uint8Array> }> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let have = 0
  let done = false
  while (have < min) {
    const r = await reader.read()
    if (r.done) {
      done = true
      break
    }
    chunks.push(r.value)
    have += r.value.length
  }
  const head = concat(chunks)
  const replay = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head.length) controller.enqueue(head)
      if (done) controller.close()
    },
    async pull(controller) {
      if (done) return
      const r = await reader.read()
      if (r.done) {
        done = true
        controller.close()
      } else controller.enqueue(r.value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
  return { head, stream: replay }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0]!
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

/** Counts the raw bytes flowing through, for progress reporting. */
function counting(onBytes: (n: number) => void): TransformStream<Uint8Array, Uint8Array> {
  let total = 0
  return new TransformStream({
    transform(chunk, controller) {
      total += chunk.length
      onBytes(total)
      controller.enqueue(chunk)
    },
  })
}

export async function openText(
  source: ByteSource,
  onBytes?: (bytesRead: number) => void,
): Promise<OpenedText> {
  let bytes = source.stream()
  if (onBytes) bytes = bytes.pipeThrough(counting(onBytes))
  const first = await peek(bytes, 2)
  const compressed = isGzip(first.head)
  let plain = first.stream
  if (compressed) {
    plain = plain.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>)
  }
  const second = await peek(plain, 256)
  const encoding = sniffEncoding(second.head)
  const text = second.stream.pipeThrough(
    new TextDecoderStream(encoding) as unknown as TransformStream<Uint8Array, string>,
  )
  return { text, compressed, encoding }
}

/** Builds a ByteSource from a string or bytes (tests, pasted content). */
export function sourceFromBytes(data: Uint8Array | string): ByteSource {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return {
    size: bytes.length,
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          // Emit in pieces so tests exercise chunk boundaries.
          const step = 4096
          for (let i = 0; i < bytes.length; i += step) c.enqueue(bytes.slice(i, i + step))
          c.close()
        },
      }),
  }
}

/**
 * Re-reads the source and returns the decoded text between two character offsets. Used to show
 * the original XML of a record without keeping the whole document in memory.
 */
export async function extractText(source: ByteSource, start: number, end: number): Promise<string> {
  const { text } = await openText(source)
  const reader = text.getReader()
  let pos = 0
  let out = ''
  try {
    while (pos < end) {
      const r = await reader.read()
      if (r.done) break
      const chunk = r.value
      const cs = pos
      const ce = pos + chunk.length
      if (ce > start) out += chunk.slice(Math.max(0, start - cs), Math.min(chunk.length, end - cs))
      pos = ce
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return out
}
