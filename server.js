const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const TFTP_PORT = process.env.TFTP_PORT || 6969;
const ROOT_DIR = path.join(__dirname, 'tftp_root');
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, 'public');

const OPCODE = { RRQ: 1, WRQ: 2, DATA: 3, ACK: 4, ERROR: 5 };
const MODE_OCTET = 'octet';

fs.mkdirSync(ROOT_DIR, { recursive: true });

// ---------- TFTP server ----------

const tftpSocket = dgram.createSocket('udp4');
const transfers = new Map(); // key = "rinfo.address:rinfo.port" -> { filename, mode, direction, fd, block, sentBytes }

function sendError(socket, rinfo, code, msg) {
  const buf = Buffer.alloc(4 + msg.length + 1);
  buf.writeUInt16BE(OPCODE.ERROR, 0);
  buf.writeUInt16BE(code, 2);
  buf.write(msg, 4);
  buf[4 + msg.length] = 0;
  socket.send(buf, 0, buf.length, rinfo.port, rinfo.address);
}

function cleanTransfer(key) {
  const t = transfers.get(key);
  if (t && t.fd) {
    try { fs.closeSync(t.fd); } catch (e) {}
  }
  transfers.delete(key);
}

function sendNextData(socket, key, rinfo) {
  const t = transfers.get(key);
  if (!t) return;
  const chunk = Buffer.alloc(512);
  const bytesRead = fs.readSync(t.fd, chunk, 0, 512, t.sentBytes);
  const blockBuf = Buffer.alloc(4 + bytesRead);
  blockBuf.writeUInt16BE(OPCODE.DATA, 0);
  blockBuf.writeUInt16BE(t.block, 2);
  chunk.copy(blockBuf, 4, 0, bytesRead);
  socket.send(blockBuf, 0, blockBuf.length, rinfo.port, rinfo.address, (err) => {
    if (err) { cleanTransfer(key); return; }
    t.sentBytes += bytesRead;
  });
}

tftpSocket.on('listening', () => {
  const addr = tftpSocket.address();
  console.log(`TFTP server listening on ${addr.address}:${addr.port}`);
});

tftpSocket.on('message', (msg, rinfo) => {
  const key = `${rinfo.address}:${rinfo.port}`;
  const opcode = msg.readUInt16BE(0);

  if (opcode === OPCODE.RRQ || opcode === OPCODE.WRQ) {
    const sep = msg.indexOf(0, 2);
    if (sep === -1) { sendError(tftpSocket, rinfo, 2, 'Access violation'); return; }
    const filename = msg.slice(2, sep).toString('ascii');
    const sep2 = msg.indexOf(0, sep + 1);
    const mode = (sep2 === -1 ? '' : msg.slice(sep + 1, sep2).toString('ascii')).toLowerCase();
    if (mode !== MODE_OCTET) { sendError(tftpSocket, rinfo, 0, 'Unknown transfer mode'); return; }

    const filePath = path.join(ROOT_DIR, path.basename(filename));
    if (opcode === OPCODE.RRQ) {
      if (!fs.existsSync(filePath)) { sendError(tftpSocket, rinfo, 1, 'File not found'); return; }
      const fd = fs.openSync(filePath, 'r');
      transfers.set(key, { filename, mode, direction: 'read', fd, block: 1, sentBytes: 0 });
      sendNextData(tftpSocket, key, rinfo);
    } else {
      if (fs.existsSync(filePath)) { sendError(tftpSocket, rinfo, 6, 'File already exists'); return; }
      const fd = fs.openSync(filePath, 'w+');
      transfers.set(key, { filename, mode, direction: 'write', fd, block: 0, sentBytes: 0 });
      const ack = Buffer.alloc(4);
      ack.writeUInt16BE(OPCODE.ACK, 0);
      ack.writeUInt16BE(0, 2);
      tftpSocket.send(ack, 0, 4, rinfo.port, rinfo.address);
    }
    return;
  }

  if (opcode === OPCODE.ACK) {
    const block = msg.readUInt16BE(2);
    const t = transfers.get(key);
    if (!t) return;
    if (t.direction === 'read') {
      if (block !== t.block) { cleanTransfer(key); return; }
      t.block++;
      const last = t.sentBytes < 512 * t.block; // not quite; track differently below
      sendNextData(tftpSocket, key, rinfo);
    } else {
      t.block++;
    }
    return;
  }

  if (opcode === OPCODE.DATA) {
    const block = msg.readUInt16BE(2);
    const t = transfers.get(key);
    if (!t) return;
    if (t.direction !== 'write') { cleanTransfer(key); return; }
    if (block !== t.block + 1) { cleanTransfer(key); return; }
    const data = msg.slice(4);
    fs.writeSync(t.fd, data, 0, data.length, t.sentBytes);
    t.sentBytes += data.length;
    t.block = block;
    const ack = Buffer.alloc(4);
    ack.writeUInt16BE(OPCODE.ACK, 0);
    ack.writeUInt16BE(block, 2);
    tftpSocket.send(ack, 0, 4, rinfo.port, rinfo.address, (err) => {
      if (err) { cleanTransfer(key); return; }
      if (data.length < 512) {
        try { fs.closeSync(t.fd); } catch (e) {}
        transfers.delete(key);
      }
    });
    return;
  }
});

tftpSocket.on('error', (err) => {
  console.error('TFTP socket error:', err);
});

tftpSocket.bind(TFTP_PORT);

// ---------- Express website ----------

const app = express();
app.use(express.static(STATIC_DIR));
app.use(express.json());

const upload = multer({ dest: path.join(ROOT_DIR, 'uploads') });

app.get('/api/files', (req, res) => {
  const files = fs.readdirSync(ROOT_DIR).map((f) => {
    const full = path.join(ROOT_DIR, f);
    const stat = fs.statSync(full);
    return { name: f, size: stat.size, isDirectory: stat.isDirectory(), mtime: stat.mtime.toISOString() };
  });
  res.json(files);
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const dest = path.join(ROOT_DIR, req.file.originalname);
  fs.renameSync(req.file.path, dest);
  res.json({ ok: true, name: req.file.originalname });
});

app.delete('/api/files/:name', (req, res) => {
  const filePath = path.join(ROOT_DIR, path.basename(req.params.name));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

app.get('/api/download/:name', (req, res) => {
  const filePath = path.join(ROOT_DIR, path.basename(req.params.name));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.download(filePath);
});

app.listen(PORT, () => {
  console.log(`Web server listening on http://localhost:${PORT}`);
  console.log(`TFTP server on udp://localhost:${TFTP_PORT} serving ${ROOT_DIR}`);
});
