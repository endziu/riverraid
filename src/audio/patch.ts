/**
 * Rewrites values in sounds.ts in place, keeping comments and layout.
 * Used by the dev server when the audio panel saves.
 */

export type Value = number | string | boolean;

export interface MixSnapshot {
  /** Sound id → its full definition. */
  sounds: Record<string, object>;
  /** Exported object name (ENGINE, MIX) → its flat values. */
  blocks: Record<string, object>;
}

const entries = (o: object) => Object.entries(o) as [string, Value][];

const formatValue = (v: Value) =>
  typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : typeof v === 'string' ? `'${v}'` : String(v);

export function formatDef(def: object): string {
  const fields = entries(def).map(([k, v]) => `${k}: ${formatValue(v)}`);
  return `{ ${fields.join(', ')} }`;
}

export function patchSounds(source: string, snap: MixSnapshot): string {
  let out = source;
  for (const [id, def] of Object.entries(snap.sounds)) {
    out = out.replace(new RegExp(`^([ \\t]*)${id}: \\{.*\\},$`, 'm'), (_, indent: string) => `${indent}${id}: ${formatDef(def)},`);
  }
  for (const [name, values] of Object.entries(snap.blocks)) {
    const start = out.indexOf(`export const ${name} `);
    const end = out.indexOf('\n};', start);
    if (start < 0 || end < 0) continue;
    let block = out.slice(start, end);
    for (const [key, v] of entries(values)) {
      block = block.replace(new RegExp(`^([ \\t]*)${key}: [^,\\n]+,$`, 'm'), (_, indent: string) => `${indent}${key}: ${formatValue(v)},`);
    }
    out = out.slice(0, start) + block + out.slice(end);
  }
  return out;
}
