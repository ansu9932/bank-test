#!/usr/bin/env node
/**
 * Post-build verification for frontend/dist.
 *
 * Walks dist/ recursively and, for every file, records its relative path, byte
 * size, and a short SHA-256 hash (first 12 hex chars). The list is printed to
 * the console and written to dist/build-manifest.txt (one line per file:
 * `path  size  hash`).
 *
 * Fails (non-zero exit) if any .js file under dist/assets/ is 0 bytes — a
 * common symptom of a failed/interrupted write. After deploying, the same
 * hashes can be re-computed on the server (e.g. `sha256sum`) and diffed against
 * build-manifest.txt to catch files truncated or corrupted in transit.
 *
 * Uses only Node built-ins (crypto, fs, path) — no extra dependencies.
 */
import { createHash } from 'node:crypto';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const MANIFEST_PATH = join(DIST_DIR, 'build-manifest.txt');

/** Recursively collect every file path under `dir`. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function shortHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 12);
}

function main() {
  let distExists = true;
  try {
    distExists = statSync(DIST_DIR).isDirectory();
  } catch {
    distExists = false;
  }
  if (!distExists) {
    console.error(`[verify-build] dist directory not found at ${DIST_DIR}. Run the build first.`);
    process.exit(1);
  }

  const files = walk(DIST_DIR).sort();
  const lines = [];
  const emptyJsFiles = [];

  for (const file of files) {
    // Skip the manifest itself if it lingers from a previous run.
    if (file === MANIFEST_PATH) continue;

    const buffer = readFileSync(file);
    const size = buffer.length;
    const hash = shortHash(buffer);
    const relPath = relative(DIST_DIR, file).split(sep).join('/');

    lines.push(`${relPath}  ${size}  ${hash}`);

    // Detect zero-byte JS assets — the hallmark of an interrupted write.
    const isAssetJs = relPath.startsWith('assets/') && relPath.endsWith('.js');
    if (isAssetJs && size === 0) {
      emptyJsFiles.push(relPath);
    }
  }

  const manifest = lines.join('\n') + '\n';
  writeFileSync(MANIFEST_PATH, manifest);

  console.log('[verify-build] dist/ contents (path  size  sha256[:12]):');
  console.log(manifest);
  console.log(`[verify-build] Wrote manifest with ${lines.length} file(s) to ${relative(process.cwd(), MANIFEST_PATH)}`);

  if (emptyJsFiles.length > 0) {
    console.error('[verify-build] ERROR: found 0-byte JS asset(s) — build is likely corrupted/incomplete:');
    for (const f of emptyJsFiles) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('[verify-build] OK — no 0-byte JS assets detected.');
}

main();
