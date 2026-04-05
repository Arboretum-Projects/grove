#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let targetDir = process.cwd();
let port = 3000;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--dir' || args[i] === '-d') && args[i + 1]) {
    targetDir = path.resolve(args[++i]);
  } else if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
    port = parseInt(args[++i], 10);
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
  grove - A beautiful local file explorer

  Usage:
    grove [options]
    node server.js [options]

  Options:
    -d, --dir <path>    Directory to explore (default: current directory)
    -p, --port <port>   Port to serve on (default: 3000)
    -h, --help          Show this help message
`);
    process.exit(0);
  } else if (!args[i].startsWith('-')) {
    targetDir = path.resolve(args[i]);
  }
}

if (!fs.existsSync(targetDir)) {
  console.error(`Error: Directory not found: ${targetDir}`);
  process.exit(1);
}

const IGNORED = new Set(['.DS_Store', 'Thumbs.db', '.git', 'node_modules', '.omc']);
const publicDir = path.join(__dirname, 'public');

function buildTree(dirPath, relativeTo) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath);

    if (entry.isDirectory()) {
      const children = buildTree(fullPath, relativeTo);
      if (children.length > 0) {
        items.push({ name: entry.name, path: relPath, type: 'directory', children });
      }
    } else {
      items.push({ name: entry.name, path: relPath, type: 'file' });
    }
  }

  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  return items;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  };
  return types[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsed.pathname);

  res.setHeader('Access-Control-Allow-Origin', '*');

  // API: directory tree
  if (pathname === '/api/tree') {
    const tree = buildTree(targetDir, targetDir);
    const rootName = path.basename(targetDir);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ root: rootName, tree }));
    return;
  }

  // API: file contents
  if (pathname === '/api/file') {
    const filePath = parsed.searchParams.get('path');
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing path parameter' }));
      return;
    }

    const resolved = path.resolve(targetDir, filePath);
    if (!resolved.startsWith(targetDir)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ path: filePath, ext, content }));
    return;
  }

  // Static files from public/
  let staticPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(publicDir, staticPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Fallback to index.html for SPA
  const indexPath = path.join(publicDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  fs.createReadStream(indexPath).pipe(res);
});

server.listen(port, () => {
  const dirLabel = path.basename(targetDir);
  console.log(`\n  \x1b[32m grove \x1b[0m serving \x1b[36m${dirLabel}\x1b[0m`);
  console.log(`        \x1b[90m${targetDir}\x1b[0m`);
  console.log(`\n  \x1b[33m  --> \x1b[0m http://localhost:${port}\n`);
});
