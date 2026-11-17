import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const audioDir = path.join(rootDir, 'public', 'audio');
const budget = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'budget.config.json'), 'utf-8')
);

function gzipSize(filePath) {
  return zlib.gzipSync(fs.readFileSync(filePath)).length;
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)} ko`;
}

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function main() {
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error('dist/index.html introuvable. Lancez vite build avant check:budget.');
  }

  const html = fs.readFileSync(indexHtmlPath, 'utf-8');
  const initialJsPaths = new Set();
  const initialCssPaths = new Set();

  for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) {
    initialJsPaths.add(m[1].replace(/^\//, ''));
  }
  for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)) {
    initialJsPaths.add(m[1].replace(/^\//, ''));
  }
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)) {
    initialCssPaths.add(m[1].replace(/^\//, ''));
  }

  let initialJsGzip = 0;
  for (const rel of initialJsPaths) {
    initialJsGzip += gzipSize(path.join(distDir, rel));
  }

  let initialCssGzip = 0;
  for (const rel of initialCssPaths) {
    initialCssGzip += gzipSize(path.join(distDir, rel));
  }

  const assetsDir = path.join(distDir, 'assets');
  const lazyViolations = [];
  let maxLazyChunkGzip = 0;
  let totalLazyJsCount = 0;

  if (fs.existsSync(assetsDir)) {
    for (const file of fs.readdirSync(assetsDir)) {
      if (!file.endsWith('.js')) continue;
      const rel = `assets/${file}`;
      if (initialJsPaths.has(rel)) continue;
      totalLazyJsCount += 1;
      const gz = gzipSize(path.join(assetsDir, file));
      if (gz > maxLazyChunkGzip) maxLazyChunkGzip = gz;
      if (gz > budget.maxLazyChunkGzipBytes) {
        lazyViolations.push(`${file} (${kb(gz)})`);
      }
    }
  }

  let maxAudioPackBytes = 0;
  let audioPackCount = 0;
  let totalAudioBytes = 0;
  const packViolations = [];

  if (fs.existsSync(audioDir)) {
    for (const entry of fs.readdirSync(audioDir, { withFileTypes: true })) {
      const p = path.join(audioDir, entry.name);
      if (entry.isDirectory()) {
        for (const f of fs.readdirSync(p)) {
          const fp = path.join(p, f);
          const sz = fs.statSync(fp).size;
          totalAudioBytes += sz;
          if (f.endsWith('.bin')) {
            audioPackCount += 1;
            if (sz > maxAudioPackBytes) maxAudioPackBytes = sz;
            if (sz > budget.maxAudioPackBytes) {
              packViolations.push(`${entry.name}/${f} (${mb(sz)})`);
            }
          }
        }
      } else if (entry.isFile()) {
        totalAudioBytes += fs.statSync(p).size;
      }
    }
  }

  console.log(
    `[check:budget] JS initial: ${kb(initialJsGzip)} / ${kb(budget.maxInitialJsGzipBytes)} | CSS initial: ${kb(initialCssGzip)} / ${kb(budget.maxInitialCssGzipBytes)} | Max chunk différé (${totalLazyJsCount}): ${kb(maxLazyChunkGzip)} / ${kb(budget.maxLazyChunkGzipBytes)} | Max paquet audio (${audioPackCount}): ${mb(maxAudioPackBytes)} / ${mb(budget.maxAudioPackBytes)} (total audio: ${mb(totalAudioBytes)})`
  );

  const errors = [];
  if (initialJsGzip > budget.maxInitialJsGzipBytes) {
    errors.push(`JS initial (${kb(initialJsGzip)}) > ${kb(budget.maxInitialJsGzipBytes)}`);
  }
  if (initialCssGzip > budget.maxInitialCssGzipBytes) {
    errors.push(`CSS initial (${kb(initialCssGzip)}) > ${kb(budget.maxInitialCssGzipBytes)}`);
  }
  if (lazyViolations.length > 0) {
    errors.push(`Chunks différés > ${kb(budget.maxLazyChunkGzipBytes)} : ${lazyViolations.join(', ')}`);
  }
  if (packViolations.length > 0) {
    errors.push(`Paquets audio > ${mb(budget.maxAudioPackBytes)} : ${packViolations.join(', ')}`);
  }

  if (errors.length > 0) {
    console.error('[check:budget] ÉCHEC :\n - ' + errors.join('\n - '));
    process.exit(1);
  }
  console.log('[check:budget] OK — tous les budgets sont respectés.');
}

main();
