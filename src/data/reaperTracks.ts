import type { BridgeSection } from '../services/reaperBridge'

/** Baked fade-in / fade-out at both ends of each station clip. */
export const CROSSFADE_SECONDS = 2

/** REAPER project: yanshi.rp — track names must match the six station tracks. */
export interface SectionTrackConfig {
  /** Exact REAPER track name in yanshi.rp */
  tracks: string[]
  /** Station clip length in seconds */
  durationSeconds: number
}

export const REAPER_SECTION_TRACKS: Record<BridgeSection, SectionTrackConfig> = {
  introduction: {
    tracks: ['Intro'],
    durationSeconds: 121.5,
  },
  baroque: {
    tracks: ['Baroque'],
    durationSeconds: 120,
  },
  classical: {
    tracks: ['Classic'],
    durationSeconds: 216.8,
  },
  romantic: {
    tracks: ['Romantic'],
    durationSeconds: 256.7,
  },
  'modern-electronic': {
    tracks: ['Electric'],
    durationSeconds: 338.4,
  },
  'contemporary-ai': {
    tracks: ['AI'],
    durationSeconds: 116.6,
  },
}
