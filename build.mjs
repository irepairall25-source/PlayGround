import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const source = join(root, 'src')
const output = join(root, 'dist')
const stamp = join(output, '.build-hash')

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    })
    .sort()
}

if (!existsSync(join(source, 'index.html'))) {
  console.error('Source index.html is missing.')
  process.exit(1)
}

const files = walk(source)
const hash = createHash('sha256')
for (const file of files) {
  hash.update(relative(source, file))
  hash.update('\0')
  hash.update(readFileSync(file))
  hash.update('\0')
}
const digest = hash.digest('hex')

if (existsSync(join(output, 'index.html')) && existsSync(stamp) && readFileSync(stamp, 'utf8') === digest) {
  console.log(`Build is up to date (${digest.slice(0, 12)}).`)
  process.exit(0)
}

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
cpSync(source, output, { recursive: true })
writeFileSync(stamp, digest)
const bytes = files.reduce((total, file) => total + statSync(file).size, 0)
console.log(`Built ${files.length} files (${(bytes / 1024).toFixed(1)} KiB) into dist/ (${digest.slice(0, 12)}).`)
