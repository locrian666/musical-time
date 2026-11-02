import { useCallback, useEffect, useRef, useState } from 'react'
import { eras } from './data/eras'
import EraSection from './components/EraSection'
import IntroSection from './components/IntroSection'
import QuarterDial from './components/QuarterDial'
import BridgeStatus from './components/BridgeStatus'
import {
  getActiveSectionIndex,
  scrollToSectionIndex,
  useSectionNavigation,
} from './hooks/useSectionNavigation'
import { useReaperSectionPlayback } from './hooks/useReaperSectionPlayback'
import { useReaperBridgeOptional } from './context/ReaperBridgeProvider'
import { usePlaybackModeOptional } from './context/PlaybackModeProvider'
import { indexFromSectionId, bridgeSectionFromIndex, SECTION_IDS } from './data/sections'
import { REAPER_SECTION_TRACKS } from './data/reaperTracks'
import PlaybackModeSwitch from './components/PlaybackModeSwitch'
import ChannelMonitor from './components/ChannelMonitor'

export default function App() {
  const [scrollUnlocked, setScrollUnlocked] = useState(false)
  const [activeEraIndex, setActiveEraIndex] = useState(0)
  const [activeSectionIndex, setActiveSectionIndex] = useState(0)
  const [dialVisible, setDialVisible] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const introCuedRef = useRef(false)
  const { hardSwitch, markVisited } = useReaperSectionPlayback()
  const bridge = useReaperBridgeOptional()
  const playback = usePlaybackModeOptional()

  const handleSectionChange = useCallback(
    (fromIndex: number, toIndex: number) => {
      setActiveSectionIndex(toIndex)
      if (toIndex > 0) {
        setScrollUnlocked(true)
      }
      hardSwitch(fromIndex, toIndex)
    },
    [hardSwitch],
  )

  useSectionNavigation(scrollRef, {
    enabled: true,
    onSectionChange: handleSectionChange,
  })

  const handleUnlock = useCallback(() => {
    setScrollUnlocked(true)
  }, [])

  const handleNaturalAdvance = useCallback(
    (fromIndex: number) => {
      if (playback?.mode === 'reaper') {
        return
      }
      const toIndex = fromIndex + 1
      if (toIndex >= SECTION_IDS.length) {
        return
      }
      setScrollUnlocked(true)
      setActiveSectionIndex(toIndex)
      if (toIndex > 0) {
        setActiveEraIndex(toIndex - 1)
        setDialVisible(true)
      }
      scrollToSectionIndex(toIndex)
      const toSection = bridgeSectionFromIndex(toIndex)
      if (toSection) {
        playback?.requestWebAutoplay(toSection, 0)
      }
    },
    [playback],
  )

  useEffect(() => {
    if (!bridge?.connected || playback?.mode !== 'reaper') {
      return
    }
    if (introCuedRef.current || activeSectionIndex !== 0) {
      return
    }
    introCuedRef.current = true
    bridge.switchSection(null, 'introduction', {
      autoPlay: false,
      position: 0,
      tracks: REAPER_SECTION_TRACKS.introduction.tracks,
    })
  }, [bridge, playback?.mode, activeSectionIndex])

  useEffect(() => {
    if (!bridge) {
      return
    }

    return bridge.subscribeSectionCrossfade((fromSection, toSection) => {
      const fromIndex = indexFromSectionId(fromSection)
      const toIndex = indexFromSectionId(toSection)
      if (fromIndex >= 0) {
        markVisited(fromIndex)
      }
      if (toIndex < 0) {
        return
      }
      markVisited(toIndex)
      setScrollUnlocked(true)
      setActiveSectionIndex(toIndex)
      if (toIndex > 0) {
        setActiveEraIndex(toIndex - 1)
        setDialVisible(true)
      }
      scrollToSectionIndex(toIndex)
    })
  }, [bridge, markVisited])

  const handleEraVisible = useCallback((index: number) => {
    setActiveEraIndex(index)
    setDialVisible(true)
  }, [])

  const handleNavigate = useCallback(
    (eraIndex: number) => {
      const container = scrollRef.current
      const sectionIndex = eraIndex + 1
      if (container) {
        const fromIndex = getActiveSectionIndex(container)
        if (fromIndex !== sectionIndex) {
          handleSectionChange(fromIndex, sectionIndex)
        }
      }
      scrollToSectionIndex(sectionIndex)
    },
    [handleSectionChange],
  )

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const onScroll = () => {
      const intro = document.getElementById('introduction')
      if (!intro) return
      const introBottom = intro.offsetTop + intro.offsetHeight
      setDialVisible(container.scrollTop > introBottom - window.innerHeight * 0.45)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  const activeEra = eras[activeEraIndex]
  const dialMountKey = activeEra?.dialIndependent ? 'dial-independent' : 'dial-corner'
  const activeBridgeSection = bridgeSectionFromIndex(activeSectionIndex) ?? 'introduction'

  return (
    <div
      ref={scrollRef}
      className="app app--unlocked"
    >
      <PlaybackModeSwitch />
      <ChannelMonitor activeSection={activeBridgeSection} />
      <BridgeStatus />
      <IntroSection
        scrollUnlocked={scrollUnlocked}
        onUnlock={handleUnlock}
        pageActive={activeSectionIndex === 0}
        onNaturalEnd={() => handleNaturalAdvance(0)}
      />

      {eras.map((era, index) => (
        <EraSection
          key={era.id}
          era={era}
          eraIndex={index}
          onVisible={handleEraVisible}
          pageActive={activeSectionIndex === index + 1}
          onNaturalEnd={() => handleNaturalAdvance(index + 1)}
        />
      ))}

      {dialVisible && activeEra && (
        <QuarterDial
          key={dialMountKey}
          focusEraIndex={activeEraIndex}
          activeEraIndex={activeEraIndex}
          placement={activeEra.dialPlacement}
          revealDegrees={activeEra.dialReveal}
          onSelect={handleNavigate}
          enterFromBottom={activeEra.dialIndependent === true}
          global
        />
      )}
    </div>
  )
}
