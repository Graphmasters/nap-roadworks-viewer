#!/usr/bin/env node
// Starts the development server with one DATEX II file and opens the viewer with it:
//   npm run dev:feed -- path/to/feed.xml     (plain XML or gzip, e.g. feed.xml.gz)
// The file is read only by the local development server and by your browser. It is not uploaded or copied.

import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)

if (args.length !== 1 || !args[0]) {
  console.error('Usage: npm run dev:feed -- <file.xml | file.xml.gz>')
  process.exit(1)
}

const file = resolve(process.cwd(), args[0])
if (!existsSync(file) || !statSync(file).isFile()) {
  console.error(`Not a file: ${args[0]}`)
  process.exit(1)
}

console.log(`Opening ${file} in the viewer. Stop the server with Ctrl+C.`)
const vite = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js')
const child = spawn(process.execPath, [vite, '--open', '/nap-roadworks-viewer/?command-line-feed'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NAP_FEED_FILE: file },
})

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
