import type { GameAudio } from './audio';
import type { MixSnapshot } from './patch';
import { ENGINE, MIX, SOUNDS, SOUND_IDS, type SoundId } from './sounds';

/**
 * Development-only audio panel, toggled with ` (backquote): live sliders for
 * every sound and bus, a soundboard, file reload, and Save back to sounds.ts.
 */

interface Range {
  min: number;
  max: number;
  step: number;
}

const LEVEL: Range = { min: 0, max: 1.5, step: 0.01 };
const BLOCK_RANGES: Record<string, Range> = {
  master: LEVEL,
  sfx: LEVEL,
  music: LEVEL,
  ui: LEVEL,
  duck: { min: 0, max: 1, step: 0.01 },
  panWidth: { min: 5, max: 120, step: 1 },
  halfDistance: { min: 20, max: 400, step: 5 },
  rateSlow: { min: 0.25, max: 2, step: 0.01 },
  rateFast: { min: 0.25, max: 3, step: 0.01 },
  idle: { min: 0, max: 1, step: 0.01 },
};
const GAIN: Range = { min: 0, max: 2, step: 0.01 };
const RATE: Range = { min: 0.25, max: 4, step: 0.01 };
const JITTER: Range = { min: 0, max: 12, step: 0.1 };

const GROUPS: [string, (id: SoundId) => boolean][] = [
  ['One-shots', (id) => !SOUNDS[id].loop],
  ['Loops', (id) => !!SOUNDS[id].loop && SOUNDS[id].bus !== 'music'],
  ['Music stems', (id) => SOUNDS[id].bus === 'music'],
];

const CSS = `
.audio-panel {
  position: fixed; top: 0; right: 0; bottom: 0; width: 400px; overflow-y: auto; z-index: 10;
  padding: 14px 16px 40px; background: rgba(0, 6, 14, 0.94); border-left: 1px solid #6fe3ff55;
  font: 11px/1.4 ui-monospace, monospace; color: #bfefff; accent-color: #6fe3ff;
}
.audio-panel h2 { font-size: 13px; letter-spacing: 0.2em; margin: 0 0 4px; }
.audio-panel h3 { font-size: 11px; letter-spacing: 0.2em; margin: 18px 0 6px; color: #6fe3ff; }
.audio-panel button {
  font: inherit; color: inherit; background: #0b2030; border: 1px solid #6fe3ff66; padding: 3px 8px; cursor: pointer;
}
.audio-panel button:hover { background: #12364d; }
.audio-panel .ap-dirty { border-color: #ffb347; color: #ffb347; }
.ap-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
.ap-hint { opacity: 0.6; }
.ap-sound { padding: 6px 0; border-top: 1px solid #6fe3ff1a; }
.ap-head { display: flex; gap: 8px; align-items: center; }
.ap-head b { flex: 1; font-weight: 600; }
.ap-head button { width: 26px; padding: 2px 0; }
.ap-tag { opacity: 0.6; }
.ap-tag.file { color: #64ff8a; opacity: 1; }
.ap-tag.missing { color: #ff7a59; opacity: 1; }
.ap-slider { display: grid; grid-template-columns: 82px 1fr 44px; gap: 8px; align-items: center; }
.ap-slider input { width: 100%; }
.ap-value { text-align: right; }
.ap-warn { color: #ffb347; }
`;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
}

/** Slider bound to `obj[key]`. With `omitAt`, that value deletes the key (keeps sounds.ts tidy). */
function slider(label: string, obj: object, key: string, range: Range, fallback: number, onInput: () => void, omitAt?: number): HTMLElement {
  const target = obj as Record<string, unknown>;
  const value = h('span', { className: 'ap-value' });
  const input = h('input', { type: 'range', min: String(range.min), max: String(range.max), step: String(range.step) });
  input.value = String(target[key] ?? fallback);
  const show = () => (value.textContent = String(Number(input.value)));
  show();
  input.oninput = () => {
    const v = Number(input.value);
    if (v === omitAt) delete target[key];
    else target[key] = v;
    show();
    onInput();
  };
  return h('label', { className: 'ap-slider' }, h('span', { textContent: label }), input, value);
}

const snapshot = (): MixSnapshot => ({ sounds: SOUNDS, blocks: { ENGINE, MIX } });

export function mountAudioDebug(audio: GameAudio): void {
  const engine = audio.engine;
  document.head.append(h('style', { textContent: CSS }));
  const root = h('div', { className: 'audio-panel', hidden: true });
  document.body.append(root);

  let saved = JSON.stringify(snapshot());
  const saveButton = h('button', { textContent: 'Save' });
  const status = h('span', { className: 'ap-hint' });
  const playButtons = new Map<SoundId, HTMLButtonElement>();

  const changed = () => {
    const dirty = JSON.stringify(snapshot()) !== saved;
    saveButton.classList.toggle('ap-dirty', dirty);
    saveButton.textContent = dirty ? 'Save*' : 'Save';
  };

  saveButton.onclick = async () => {
    const body = JSON.stringify(snapshot());
    const res = await fetch('/__audio/save', { method: 'POST', body }).catch(() => null);
    if (res?.ok) saved = body;
    status.textContent = res?.ok ? 'saved to src/audio/sounds.ts' : 'save failed (is the dev server running?)';
    changed();
  };

  const reload = h('button', {
    textContent: 'Reload files',
    onclick: async () => {
      status.textContent = 'loading…';
      await audio.reload();
      status.textContent = 'files reloaded';
      render();
    },
  });

  const placeholders = h('input', { type: 'checkbox', checked: MIX.placeholders });
  placeholders.onchange = () => {
    MIX.placeholders = placeholders.checked;
    changed();
  };

  const blockSection = (title: string, obj: object, onInput: () => void) => [
    h('h3', { textContent: title }),
    ...Object.entries(obj)
      .filter(([key, v]) => typeof v === 'number' && BLOCK_RANGES[key])
      .map(([key, v]) => slider(key, obj, key, BLOCK_RANGES[key], v as number, onInput)),
  ];

  const soundRow = (id: SoundId) => {
    const def = SOUNDS[id];
    const source = engine.sourceOf(id);
    const play = h('button', {
      textContent: '▶',
      title: 'Play / stop',
      onclick: () => (engine.isPlaying(id) ? engine.stop(id) : engine.play(id)),
    });
    playButtons.set(id, play);
    const kind = source.includes('file') ? 'file' : source;
    return h(
      'div',
      { className: 'ap-sound' },
      h('div', { className: 'ap-head' }, play, h('b', { textContent: id }), h('span', { className: `ap-tag ${kind}`, textContent: source })),
      slider('gain', def, 'gain', GAIN, def.gain, changed),
      slider('pitch', def, 'rate', RATE, 1, changed, 1),
      ...(def.loop ? [] : [slider('jitter ±st', def, 'jitter', JITTER, 0, changed, 0)]),
    );
  };

  function render(): void {
    playButtons.clear();
    const unmatched = engine.unmatched.length
      ? [h('h3', { textContent: 'Unmatched files' }), h('div', { className: 'ap-warn', textContent: engine.unmatched.join(', ') })]
      : [];
    root.replaceChildren(
      h('h2', { textContent: 'AUDIO' }),
      h('div', { className: 'ap-hint', textContent: '` closes · M mutes · files live in audio-src/' }),
      h(
        'div',
        { className: 'ap-bar' },
        saveButton,
        reload,
        h('label', {}, placeholders, ' placeholders'),
      ),
      status,
      ...unmatched,
      ...blockSection('Mix', MIX, () => {
        engine.applyMix();
        changed();
      }),
      ...blockSection('Engine', ENGINE, changed),
      ...GROUPS.flatMap(([title, test]) => [h('h3', { textContent: title }), ...SOUND_IDS.filter(test).map(soundRow)]),
    );
    changed();
  }

  // Keep play/stop buttons in step with voices finishing on their own.
  setInterval(() => {
    if (root.hidden) return;
    for (const [id, button] of playButtons) button.textContent = engine.isPlaying(id) ? '■' : '▶';
  }, 150);

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote') return;
    root.hidden = !root.hidden;
    if (!root.hidden) render();
  });
}
