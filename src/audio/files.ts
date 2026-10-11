/** File path → loader resolving to a fetchable URL. */
export type Loaders = Record<string, () => Promise<string>>;

/**
 * Sound files by path. In development they come straight from the designer's
 * audio-src/ folder; builds use the compressed copies made by
 * scripts/convert-audio.mjs (Opus, or AAC where Opus is unsupported).
 */
export function soundFiles(): Loaders {
  if (import.meta.env.DEV) {
    return import.meta.glob<string>('/audio-src/*.{wav,flac,ogg,mp3}', { query: '?url', import: 'default' });
  }
  const opus = document.createElement('audio').canPlayType('audio/webm; codecs="opus"') !== '';
  const urls = opus
    ? import.meta.glob<string>('./files/*.webm', { query: '?url', import: 'default', eager: true })
    : import.meta.glob<string>('./files/*.m4a', { query: '?url', import: 'default', eager: true });
  return Object.fromEntries(Object.entries(urls).map(([path, url]) => [path, async () => url]));
}
