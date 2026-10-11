import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { patchSounds, type MixSnapshot } from './src/audio/patch.ts';

const SOUNDS_FILE = 'src/audio/sounds.ts';

/** Dev only: lets the audio panel save its slider values into sounds.ts. */
function audioMixSave(): Plugin {
  let savedAt = 0;
  return {
    name: 'audio-mix-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__audio/save', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        try {
          let body = '';
          for await (const chunk of req) body += chunk;
          const file = resolve(server.config.root, SOUNDS_FILE);
          const next = patchSounds(await readFile(file, 'utf8'), JSON.parse(body) as MixSnapshot);
          savedAt = Date.now();
          await writeFile(file, next);
          res.end('ok');
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
    handleHotUpdate({ file }) {
      // The page already plays these values; skip the reload the write would trigger.
      if (file.endsWith(SOUNDS_FILE) && Date.now() - savedAt < 2000) return [];
    },
  };
}

export default defineConfig({ plugins: [audioMixSave()] });
