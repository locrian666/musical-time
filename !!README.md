# Musical Time — Visual MVP

## Run locally

Terminal 1 — frontend:

```powershell
cd "Desktop/Web Code"  *** Find this Folder
npm install
npm run dev
```

Open http://localhost:5173/

Terminal 2 — REAPER WebSocket bridge (mock for now):

```powershell
cd "C:\Users\K\Reaper-ai\ambisonic-studio"
npm run bridge
```

The bridge listens on `ws://127.0.0.1:8080`. When it is running, the site shows **REAPER · connected** (bottom-left) and audio players route through WebSocket instead of local MP3 files.

Optional env override (create `.env` in project root):

```env
VITE_REAPER_BRIDGE_URL=ws://127.0.0.1:8080
```

## WebSocket protocol

**Frontend → bridge**

| type | payload |
|------|---------|
| `PLAY_SECTION` | `{ section, position?, tracks? }` — start or resume on REAPER track(s) |
| `PAUSE_SECTION` | `{ section }` — pause and persist progress for that section |
| `SWITCH_SECTION` | `{ fromSection, toSection, autoPlay?, tracks? }` — used on page change: save/pause previous, optionally start next from saved position |
| `STOP` | — stop all (saves active section progress) |
| `GET_STATUS` | — current playback |
| `GET_ALL_PROGRESS` | — all saved section positions |

**Bridge → frontend**

| type | payload |
|------|---------|
| `CONNECTION_STATUS` | `{ connected: boolean }` |
| `PLAYBACK_STATUS` | `{ section, state, position, duration, tracks? }` |
| `SECTION_PROGRESS` | `{ section, position, duration }` — saved bookmark for a section |
| `ALL_PROGRESS` | `{ progress: Record<section, { position, duration }> }` |
| `SECTION_FINISHED` | `{ section }` |
| `ERROR` | `{ message }` |

Section ids: `introduction`, `baroque`, `classical`, `romantic`, `modern-electronic`, `contemporary-ai`.

Track names per section are configured in `src/data/reaperTracks.ts` (must match your REAPER project).

Page navigation (mouse wheel, arrow keys, dial) calls `SWITCH_SECTION` when the bridge is connected: the previous page’s audio is paused with progress saved; era pages with `autoPlayOnEnter: true` resume from that bookmark.

## Code layout

- `src/services/reaperBridge.ts` — WebSocket client
- `src/context/ReaperBridgeProvider.tsx` — React state + lifecycle
- `src/hooks/useSectionNavigation.ts` — wheel/keyboard snap + section change callback
- `src/hooks/useReaperSectionPlayback.ts` — maps navigation to `SWITCH_SECTION`
- `src/data/reaperTracks.ts` — section → REAPER track name(s)
- `bridge/server.js` — local mock bridge server

## Placeholder content

- Audio files in `public/audio` are optional when the bridge is connected.
- Text content is in `src/data/eras.ts`.

## Build check

```powershell
npm run build
```
