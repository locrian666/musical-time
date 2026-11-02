import { useCallback, useRef } from 'react'
import { bridgeSectionFromIndex } from '../data/sections'
import { REAPER_SECTION_TRACKS } from '../data/reaperTracks'
import { usePlaybackModeOptional } from '../context/PlaybackModeProvider'
import { useReaperBridgeOptional } from '../context/ReaperBridgeProvider'
import type { BridgeSection } from '../services/reaperBridge'

/**
 * Wheel / dial navigation: always pause the page we leave, keep its timecode,
 * and cue the destination track without starting playback.
 * Natural play-through (clip finished) is the only path that auto-plays the next part.
 */
export function useReaperSectionPlayback() {
  const bridge = useReaperBridgeOptional()
  const playback = usePlaybackModeOptional()
  const visitedRef = useRef(new Set<BridgeSection>())

  const markVisited = useCallback((index: number) => {
    const section = bridgeSectionFromIndex(index)
    if (section) {
      visitedRef.current.add(section)
    }
  }, [])

  const hardSwitch = useCallback(
    (fromIndex: number, toIndex: number) => {
      const fromSection = bridgeSectionFromIndex(fromIndex)
      const toSection = bridgeSectionFromIndex(toIndex)
      const returning = Boolean(toSection && visitedRef.current.has(toSection))

      if (fromSection) {
        visitedRef.current.add(fromSection)
      }
      if (toSection) {
        visitedRef.current.add(toSection)
      }

      const tracks = toSection ? REAPER_SECTION_TRACKS[toSection].tracks : undefined
      const mode = playback?.mode ?? 'reaper'
      const position = returning ? undefined : 0

      if (mode === 'reaper') {
        if (!bridge?.connected) {
          return
        }
        bridge.switchSection(fromSection, toSection, {
          autoPlay: false,
          tracks,
          position,
        })
        return
      }

      playback?.pauseWebPlayback()
      if (toSection && mode === 'ch28') {
        playback?.cueWebPlayback(toSection)
      }
    },
    [bridge, playback],
  )

  return { hardSwitch, markVisited }
}
