// Converts the source sounds in audio-src/ into the compressed files the game
// ships: Opus in WebM, plus AAC for browsers without Opus. Only changed files
// are re-encoded. Runs as part of `npm run build`, or alone via `npm run audio`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, parse } from 'node:path';

const SRC = 'audio-src';
const OUT = 'src/audio/files';
const INPUT = /\.(wav|flac|ogg|mp3)$/i;
const FORMATS = [
  { ext: 'webm', args: ['-c:a', 'libopus', '-b:a', '128k', '-ar', '48000'] },
  { ext: 'm4a', args: ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'] },
];

const sources = existsSync(SRC) ? readdirSync(SRC).filter((f) => INPUT.test(f)) : [];
mkdirSync(OUT, { recursive: true });

const wanted = new Set();
let encoded = 0;
for (const file of sources) {
  const src = join(SRC, file);
  const name = parse(file).name.toLowerCase();
  for (const { ext, args } of FORMATS) {
    const out = join(OUT, `${name}.${ext}`);
    wanted.add(out);
    if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) continue;
    const run = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vn', '-map_metadata', '-1', ...args, out], {
      stdio: 'inherit',
    });
    if (run.error) {
      console.error('audio: ffmpeg is needed to encode sounds (https://ffmpeg.org/download.html)');
      process.exit(1);
    }
    if (run.status !== 0) process.exit(run.status ?? 1);
    encoded++;
  }
}

// Drop encodes whose source was deleted or renamed.
for (const f of readdirSync(OUT)) {
  const path = join(OUT, f);
  if (!wanted.has(path)) rmSync(path);
}

console.log(`audio: ${sources.length} source files, ${encoded} encoded`);
