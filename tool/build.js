#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORED = new Set(['.DS_Store', 'Thumbs.db', '.git', '.github', 'node_modules', 'tool', 'package.json', 'package-lock.json', '.gitignore', 'tree.json', 'index.html', 'LICENSE', 'README.md', '_site']);

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

function countFiles(nodes) {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'file') count++;
    else if (node.children) count += countFiles(node.children);
  }
  return count;
}

function countDirs(nodes) {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'directory') {
      count++;
      if (node.children) count += countDirs(node.children);
    }
  }
  return count;
}

// Discover projects: each top-level directory is a project
const rootEntries = fs.readdirSync(ROOT, { withFileTypes: true });
const projects = [];

for (const entry of rootEntries) {
  if (!entry.isDirectory()) continue;
  if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;

  const projectDir = path.join(ROOT, entry.name);
  const tree = buildTree(projectDir, projectDir);
  const fileCount = countFiles(tree);
  const dirCount = countDirs(tree);

  if (fileCount === 0) continue;

  projects.push({
    name: entry.name,
    path: entry.name,
    fileCount,
    dirCount,
    tree,
  });
}

projects.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

const manifest = { projects };

// Write tree.json
const outPath = path.join(ROOT, 'tree.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

// Copy index.html to root
const src = path.join(__dirname, 'public', 'index.html');
const dest = path.join(ROOT, 'index.html');
fs.copyFileSync(src, dest);

const totalFiles = projects.reduce((sum, p) => sum + p.fileCount, 0);
console.log(`\n  \x1b[32m grove build \x1b[0m`);
console.log(`  \x1b[90m${projects.length} project(s), ${totalFiles} total files\x1b[0m`);
for (const p of projects) {
  console.log(`  \x1b[90m  ${p.name} (${p.fileCount} files, ${p.dirCount} folders)\x1b[0m`);
}
console.log(`  \x1b[90m  -> tree.json\x1b[0m`);
console.log(`  \x1b[90m  -> index.html\x1b[0m\n`);
