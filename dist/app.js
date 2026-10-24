const TFTP_PORT = 6969;

async function loadFiles() {
  try {
    const res = await fetch('/api/files');
    const files = await res.json();
    const list = document.getElementById('fileList');
    const count = document.getElementById('fileCount');
    count.textContent = files.length;
    list.innerHTML = '';
    if (files.length === 0) {
      list.innerHTML = '<p class="empty">No files yet. Upload a file to serve it over TFTP.</p>';
      return;
    }
    for (const f of files) {
      if (f.isDirectory) continue;
      const el = document.createElement('div');
      el.className = 'file-item';
      el.innerHTML = `
        <div class="file-info">
          <span class="file-name">${escapeHtml(f.name)}</span>
          <span class="file-meta">${formatSize(f.size)} &bull; ${new Date(f.mtime).toLocaleString()}</span>
        </div>
        <div class="file-actions">
          <a href="/api/download/${encodeURIComponent(f.name)}" class="btn-text">Download</a>
          <button class="btn-text btn-del" onclick="deleteFile('${escapeAttr(f.name)}')">Delete</button>
        </div>
      `;
      list.appendChild(el);
    }
  } catch (e) {
    document.getElementById('fileList').innerHTML = '<p class="empty">Failed to load files.</p>';
  }
}

async function deleteFile(name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    loadFiles();
  } catch (e) {
    alert('Failed to delete file.');
  }
}

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('fileInput');
  const msg = document.getElementById('uploadMsg');
  const btn = e.target.querySelector('button');
  if (!input.files.length) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);
  btn.disabled = true;
  msg.textContent = '';
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Upload failed');
    msg.className = 'msg ok';
    msg.textContent = `Uploaded "${json.name}". Available via TFTP on port ${TFTP_PORT}.`;
    input.value = '';
    loadFiles();
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return s.replace(/'/g, "&#39;"); }
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

document.getElementById('webPort').textContent = location.port || (location.protocol === 'https:' ? 443 : 80);
document.getElementById('tftpPort').textContent = TFTP_PORT;
document.getElementById('rootDir').textContent = './tftp_root';

loadFiles();
