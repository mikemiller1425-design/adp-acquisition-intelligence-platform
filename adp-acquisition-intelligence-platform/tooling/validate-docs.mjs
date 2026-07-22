import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(root, 'docs');

const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.yaml'))) {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(docsRoot);
let ok = 0;
const missing = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(linkRe)) {
    const link = match[2];
    if (link.startsWith('http') || link.startsWith('mailto:')) continue;
    const pathPart = link.split('#')[0];
    if (!pathPart) {
      ok += 1;
      continue;
    }
    const target = path.resolve(path.dirname(file), pathPart);
    try {
      await stat(target);
      ok += 1;
    } catch {
      missing.push(`${path.relative(root, file)} -> ${link}`);
    }
  }
}

const yamlPath = path.join(docsRoot, '13-exit-contract/phase_1_exit_contract.yaml');
parseYaml(await readFile(yamlPath, 'utf8'));

if (missing.length > 0) {
  console.error(`Documentation link validation failed (${missing.length} missing):`);
  for (const item of missing) console.error(`  ${item}`);
  process.exit(1);
}

console.log(`Documentation links OK (${ok} resolved). YAML parse OK.`);
