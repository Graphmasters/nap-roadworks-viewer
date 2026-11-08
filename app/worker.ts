// Web Worker: parses the file off the main thread and extracts record XML on demand. The file
// never leaves the browser.

import { analyseDatex, extractText, isGzip, type AnalysisResult, type AxisOrder, type ByteSource } from '../src/index'

export type WorkerRequest =
  | { type: 'analyse'; file: Blob; fileName: string; axisOrder?: AxisOrder; profileId?: string }
  | { type: 'extract'; requestId: number; start: number; end: number }
  | { type: 'decompress'; requestId: number }

export type WorkerResponse =
  | { type: 'progress'; bytesRead: number; totalBytes?: number; situations: number; records: number }
  | { type: 'result'; result: AnalysisResult }
  | { type: 'error'; message: string }
  | { type: 'extracted'; requestId: number; text: string }
  | { type: 'decompressed'; requestId: number; bytes: Uint8Array }

let source: ByteSource | undefined

const post = (m: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer)

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  try {
    if (msg.type === 'analyse') {
      const file = msg.file
      source = { size: file.size, stream: () => file.stream() }
      const result = await analyseDatex(source, {
        fileName: msg.fileName,
        axisOrder: msg.axisOrder,
        profileId: msg.profileId,
        onProgress: (p) => post({ type: 'progress', bytesRead: p.bytesRead, totalBytes: p.totalBytes, situations: p.situations, records: p.records }),
      })
      post({ type: 'result', result })
    } else if (msg.type === 'extract') {
      if (!source) throw new Error('No file loaded')
      post({ type: 'extracted', requestId: msg.requestId, text: await extractText(source, msg.start, msg.end) })
    } else if (msg.type === 'decompress') {
      if (!source) throw new Error('No file loaded')
      // The raw document bytes (gunzipped if needed) for XSD validation.
      const raw = new Uint8Array(await new Response(source.stream()).arrayBuffer())
      const bytes = isGzip(raw)
        ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
        : raw
      post({ type: 'decompressed', requestId: msg.requestId, bytes }, [bytes.buffer])
    }
  } catch (e) {
    post({ type: 'error', message: (e as Error).message ?? String(e) })
  }
}
