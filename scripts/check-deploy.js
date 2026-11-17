import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 Mo (limite Cloudflare Pages par fichier)
const WARN_FILE_COUNT = 15000;
const HARD_FILE_COUNT = 20000;

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  if (!fs.existsSync(distDir)) {
    throw new Error('Dossier dist/ introuvable. Lancez npm run build avant check:deploy.');
  }

  const files = walkFiles(distDir);
  const oversized = [];
  let totalBytes = 0;

  for (const file of files) {
    const size = fs.statSync(file).size;
    totalBytes += size;
    if (size > MAX_FILE_BYTES) {
      oversized.push(`${path.relative(distDir, file)} (${(size / (1024 * 1024)).toFixed(2)} Mo)`);
    }
  }

  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(`[check:deploy] dist/ : ${files.length} fichiers (${totalMb} Mo)`);

  if (files.length > HARD_FILE_COUNT) {
    throw new Error(
      `Nombre de fichiers (${files.length}) supérieur à la limite Cloudflare Pages (${HARD_FILE_COUNT}).`
    );
  }
  if (files.length > WARN_FILE_COUNT) {
    console.warn(
      `[check:deploy] AVERTISSEMENT : ${files.length} fichiers approche la limite de ${HARD_FILE_COUNT} fichiers sur Cloudflare Pages.`
    );
  }
  if (oversized.length > 0) {
    throw new Error(
      `Fichier(s) > 25 Mo détecté(s) (rejetés par Cloudflare Pages) : ${oversized.join(', ')}`
    );
  }

  console.log('[check:deploy] OK — prêt pour Cloudflare Pages.');
}

main();
