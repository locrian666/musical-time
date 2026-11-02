import type { BridgeSection } from '../services/reaperBridge'
import { REAPER_SECTION_TRACKS } from './reaperTracks'

export type PlaybackMode = 'reaper' | 'ch28' | 'binaural'

export const PLAYBACK_MODES: { id: PlaybackMode; label: string; hint: string }[] = [
  { id: 'reaper', label: 'REAPER', hint: 'Bridge to REAPER via OSC' },
  { id: 'ch28', label: '28CH', hint: '28-channel web playback + meters' },
  { id: 'binaural', label: 'BINAURAL', hint: 'Stereo binaural on this device' },
]

export const CHANNEL_METER_COUNT = 28

/** Electric 28ch cannot be exported as one WAV, so it uses two sequential parts. */
export const SPLIT_CH28_SECTION: BridgeSection = 'modern-electronic'

export function ch28PartCount(section: BridgeSection): number {
  return section === SPLIT_CH28_SECTION ? 2 : 1
}

export interface WebStationFiles {
  ch28: string
  ch28b?: string
  binaural: string
}

/** Expected public files. Drop 28ch WAVs into /public/audio/28ch/ using these names. */
export const WEB_STATION_FILES: Record<BridgeSection, WebStationFiles> = {
  introduction: {
    ch28: '/audio/28ch/STN_Intro.wav',
    binaural: '/audio/introduction.mp3',
  },
  baroque: {
    ch28: '/audio/28ch/STN_Baroque.wav',
    binaural: '/audio/baroque.mp3',
  },
  classical: {
    ch28: '/audio/28ch/STN_Classical.wav',
    binaural: '/audio/classical.mp3',
  },
  romantic: {
    ch28: '/audio/28ch/STN_Romantic.wav',
    binaural: '/audio/romantic.mp3',
  },
  'modern-electronic': {
    ch28: '/audio/28ch/STN_Electronic.wav',
    ch28b: '/audio/28ch/STN_Electronic_2.wav',
    binaural: '/audio/modern-electronic.mp3',
  },
  'contemporary-ai': {
    ch28: '/audio/28ch/STN_AI.wav',
    binaural: '/audio/contemporary-ai.mp3',
  },
}

export function stationFiles(section: BridgeSection): WebStationFiles {
  return WEB_STATION_FILES[section]
}

export function stationCh28Urls(section: BridgeSection): string[] {
  const files = WEB_STATION_FILES[section]
  return files.ch28b ? [files.ch28, files.ch28b] : [files.ch28]
}

export function stationTrackName(section: BridgeSection): string {
  return REAPER_SECTION_TRACKS[section].tracks[0] ?? section
}
