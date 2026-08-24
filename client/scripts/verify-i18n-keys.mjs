// Scans client/src for t('namespace.key') / t("namespace.key") calls and
// verifies every literal key exists in en.json. Dynamic keys (template
// literals, computed via variables) are reported separately for manual
// review since they can't be statically verified.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');
const en = JSON.parse(fs.readFileSync(path.join(SRC, 'i18n', 'locales', 'en.json'), 'utf8'));

function getDeep(obj, dotPath) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'i18n' || entry.name === 'node_modules') continue;
      walk(full, files);
    } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(SRC);
const missing = [];
const dynamic = [];
let literalCount = 0;

// Matches t('key') or t("key") as the first argument, literal strings only.
const CALL_RE = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
// Matches template-literal first args like t(`enums.foo.${bar}`) for reporting.
const TEMPLATE_RE = /\bt\(\s*`((?:\\.|[^`])*)`/g;

for (const file of files) {
  const rel = path.relative(SRC, file);
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = CALL_RE.exec(content))) {
    const key = m[1] === m[1] ? m[2] : m[2];
    literalCount++;
    if (getDeep(en, key) === undefined) {
      missing.push({ file: rel, key });
    }
  }
  while ((m = TEMPLATE_RE.exec(content))) {
    dynamic.push({ file: rel, template: m[1] });
  }
}

console.log(`Scanned ${files.length} files, ${literalCount} literal t() calls.`);
if (missing.length) {
  console.log(`\nMISSING KEYS (${missing.length}):`);
  for (const { file, key } of missing) console.log(`  ${file}: t('${key}')`);
} else {
  console.log('\nAll literal t() keys resolve in en.json.');
}

if (dynamic.length) {
  console.log(`\nDynamic/template t() calls to spot-check manually (${dynamic.length}):`);
  for (const { file, template } of dynamic) console.log(`  ${file}: t(\`${template}\`)`);
}
