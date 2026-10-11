# Sound guide

This folder holds the game's source sounds. Drop a file in with the right name and the game plays it in place of the synthesised placeholder. Nothing else needs to be wired up.

## Workflow

1. `npm install` (once), then `npm run dev` and open http://localhost:5173.
2. Export a sound into this folder, for example `audio-src/shot.wav`. The page reloads and uses it.
3. Press **`** (backquote, left of 1) to open the audio panel:
   - **▶** plays or stops any sound on its own (a soundboard).
   - Sliders set gain, pitch and random pitch jitter per sound, plus bus levels and the engine's pitch range. Changes are live while you play.
   - **Save** writes the slider values into `src/audio/sounds.ts`, so they become the game's defaults. You never need to edit code to mix.
   - **Reload files** re-reads every file after you re-export from your DAW, without losing the run you're in.
   - The tag next to each sound says what's playing: `file`, `3 files`, `placeholder`, or `missing` (music has no placeholder).
   - **Unmatched files** lists files whose names don't match any sound, which is usually a typo.
4. **M** mutes and unmutes the game.

## File format

- **WAV, 48 kHz, 24-bit.** FLAC, OGG and MP3 also load, but WAV is the master format.
- **Mono is fine for most SFX.** The game pans sounds itself by where things are on screen. Use stereo where width is part of the sound: music, big explosions, ambiences.
- **Headroom:** peak around −6 dBFS. A limiter sits on the master, but don't lean on it. Balance levels in the panel instead of re-exporting.
- **Names:** lowercase, exactly as in the list below.
- **Variations:** add `_01`, `_02`, … (`shot_01.wav`, `shot_02.wav`, `shot_03.wav`). Each play picks one at random, never the same one twice in a row. The panel's jitter slider adds random pitch on top.

## Loops

Loops repeat for as long as the game needs them. They must be seamless:

- Cut on whole cycles and zero crossings. No fades at either end; the game fades loops in and out itself.
- Any length works. 1–4 s is typical for SFX loops.
- The game changes loop pitch with playback rate, so the sound speeds up and slows down together with its pitch, like a tape. Design the engine at **cruise speed**. The game plays it at about 0.8× when slow and 1.35× when fast; both ends are tunable in the panel.

## Sound list

### One-shots

| Name | When it plays | Notes |
|---|---|---|
| `launch` | Player presses Space to take off | Spool-up; the engine loop fades in under it |
| `shot` | Every bullet, up to ~6 per second | The most-heard sound in the game. Keep it short (<150 ms) and not tiring; use 3–4 variations |
| `impact` | A bullet hits a riverbank | Small and quiet; can fire very often |
| `explode_small` | Boat or helicopter destroyed | Panned to where it happened |
| `explode_jet` | Jet destroyed | Airborne: brighter, more whoosh |
| `explode_fuel` | Fuel depot destroyed | Liquid fire, fizz |
| `explode_bridge` | Bridge destroyed (also the new checkpoint) | The big one; music ducks under it |
| `checkpoint` | 0.35 s after a bridge explodes | Short positive chime |
| `crash` | Player dies | Engine cuts and music muffles at the same moment |
| `fuel_full` | Tank reaches full while refuelling | Small confirmation blip |
| `extra_life` | Every 10,000 points | Jingle |
| `respawn` | Plane reappears at the checkpoint | Short "ready" cue |
| `game_over` | Last life lost | Sting; music fades out under it |

### Loops

| Name | When it plays | Notes |
|---|---|---|
| `engine_low` | While flying | Low body of the engine, loudest at slow speed |
| `engine_mid` | While flying | Main tone, loudest at cruise |
| `engine_high` | While flying | Whine, loudest at full speed |
| `refuel` | While over a fuel depot | Pitch rises as the tank fills |
| `low_fuel` | Fuel under 25% and not refuelling | Alarm; it must stay readable over everything |
| `jet_pass` | Each jet crossing the river | Panned as the jet crosses, with a slight pitch drop once it passes (doppler) |
| `heli_rotor` | Nearest helicopter ahead | Gets louder as you approach |

The three engine layers crossfade by speed: low → mid → high. One layer is enough to start with; leave the others as placeholders or set their gain to 0.

### Music

| Name | Plays |
|---|---|
| `music_1` | From sector 1 |
| `music_2` | Joins at sector 3 |
| `music_3` | Joins at sector 6 |
| `music_4` | Joins at sector 10 |
| `music_tension` | While fuel is low |

- All stems must be **exactly the same length and tempo**. They start together and loop together, and a layer fades in or out over about 2 s.
- Music starts at the first launch and keeps going between lives. It's muffled by a low-pass filter while crashed or waiting to relaunch. On game over it fades out under `game_over`.
- Which sector each layer joins at, the fade time and the muffle cutoff are in `MUSIC` in `src/audio/sounds.ts`.

## Shipping

`npm run build` encodes everything here to Opus (WebM) and AAC (M4A) with ffmpeg and bundles them. The originals are never shipped. Run `npm run preview` to hear the compressed build before deploying.
