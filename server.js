// Minimal static file server for hosting (Railway, or `npm start` locally). No dependencies.
// Every file is served with an ETag (size + modification time) and Cache-Control: no-cache, so browsers
// revalidate on each load and get a 304 when nothing changed: the map layers (data, coastlines, relief)
// can never get out of step with one another through a stale cache. The HTML additionally has its
// script, stylesheet and image URLs stamped with the current ETags.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = process.env.PORT || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

const etagOf = (file) => { try { const st = fs.statSync(file); return `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`; } catch (e) { return null; } };
const stamp = (rel) => { const t = etagOf(path.join(root, rel)); return t ? rel + '?v=' + t.replace(/"/g, '') : rel; };

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root) || urlPath.startsWith('/tools') || urlPath.startsWith('/.')) { res.writeHead(404); return res.end('Not found'); }
  const etag = etagOf(file);
  if (!etag) { res.writeHead(404); return res.end('Not found'); }
  const headers = { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    if (path.extname(file) === '.html') {
      // stamp local asset URLs so a new deploy always pulls matching files
      const html = data.toString('utf8').replace(/(src|href)="((?:js|css|img)\/[^"?]+)"/g, (m, attr, rel) => `${attr}="${stamp(rel)}"`);
      data = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}).listen(port, () => console.log(`Three Kingdoms serving on port ${port}`));
