import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

const root = resolve(process.cwd(), 'dist')
const port = Number(process.env.PORT || 3000)
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
}

if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/index.html is missing. Run node build.mjs first.')
  process.exit(1)
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')
  if (url.pathname === '/healthz') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ ok: true, service: 'xfinity-cam-remote' }))
    return
  }

  let target
  try {
    target = resolve(root, `.${decodeURIComponent(url.pathname)}`)
  } catch {
    response.writeHead(400)
    response.end('Bad request')
    return
  }
  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  let file = target
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (!extname(url.pathname)) file = join(root, 'index.html')
    else {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }
  }

  const extension = extname(file).toLowerCase()
  const headers = {
    'Content-Type': mime[extension] || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  }
  response.writeHead(200, headers)
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(file).on('error', () => response.destroy()).pipe(response)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Xfinity Cam console listening on http://0.0.0.0:${port} (serving dist/)`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
