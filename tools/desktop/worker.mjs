import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cliArgs } from './protocol.mjs'

const requestFile = process.argv[2]
const request = JSON.parse(await readFile(requestFile, 'utf8'))
process.argv = [process.execPath, fileURLToPath(new URL('../chatgpt-images/cli.mjs', import.meta.url)), ...cliArgs(request, requestFile)]
await import('../chatgpt-images/cli.mjs')
