// XSD validation with libxml2 compiled to WebAssembly (xmllint-wasm). The user supplies the
// schema files; nothing is downloaded and nothing leaves the browser.

import { memoryPages, validateXML } from 'xmllint-wasm'

export interface XsdOutcome {
  valid: boolean
  schemaFiles: string[]
  mainSchema: string
  errors: Array<{ message: string; line?: number }>
  /** Errors beyond this many are counted only. */
  errorCount: number
  durationMs: number
}

export const XSD_MAX_BYTES = 400 * 1024 * 1024

export async function validateWithXsd(xml: Uint8Array, schemas: File[], mainSchema: string): Promise<XsdOutcome> {
  const t0 = performance.now()
  const files = await Promise.all(schemas.map(async (f) => ({ fileName: safeName(f.name), contents: new Uint8Array(await f.arrayBuffer()) })))
  const main = files.find((f) => f.fileName === safeName(mainSchema)) ?? guessMain(files)
  const preload = files.filter((f) => f !== main)
  // Memory: libxml2 holds the document tree; allow roughly 12× the document size, up to 4 GiB.
  const needPages = Math.ceil((xml.length * 12) / (64 * 1024)) + 512
  const result = await validateXML({
    xml: [{ fileName: 'feed.xml', contents: xml }],
    schema: [main],
    preload,
    initialMemoryPages: memoryPages.defaultInitialMemoryPages,
    maxMemoryPages: Math.min(memoryPages.max, Math.max(needPages, 2 * memoryPages.GiB / 16)),
  })
  const errors = result.errors.map((e) => ({ message: e.message, line: e.loc?.lineNumber }))
  return {
    valid: result.valid,
    schemaFiles: files.map((f) => f.fileName),
    mainSchema: main.fileName,
    errors: errors.slice(0, 500),
    errorCount: errors.length,
    durationMs: Math.round(performance.now() - t0),
  }
}

/** xmllint rejects names that look like command-line options. */
function safeName(name: string): string {
  return name.replace(/^[-\s]+/, '').replace(/\s+/g, '_') || 'schema.xsd'
}

/** The main schema is the file that no other file imports or includes. */
function guessMain(files: Array<{ fileName: string; contents: Uint8Array }>): { fileName: string; contents: Uint8Array } {
  const referenced = new Set<string>()
  const dec = new TextDecoder()
  for (const f of files)
    for (const m of dec.decode(f.contents).matchAll(/schemaLocation\s*=\s*["']([^"']+)["']/g)) referenced.add(m[1]!.split('/').pop()!)
  return files.find((f) => !referenced.has(f.fileName)) ?? files[0]!
}
