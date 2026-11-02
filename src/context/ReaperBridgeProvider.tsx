import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { REAPER_SECTION_TRACKS } from '../data/reaperTracks'
import {
  EMPTY_PLAYBACK,
  reaperBridge,
  resolveBridgeUrl,
  type BridgeSection,
  type BridgeMessage,
  type PlaybackSnapshot,
  type SectionProgress,
} from '../services/reaperBridge'

export interface ReaperBridgeContextValue {
  connected: boolean
  reconnecting: boolean
  playback: PlaybackSnapshot
  sectionProgress: Partial<Record<BridgeSection, SectionProgress>>
  lastError: string | null
  bridgeUrl: string
  playSection: (section: BridgeSection, position?: number) => void
  pauseSection: (section: BridgeSection) => void
  seekSection: (section: BridgeSection, position: number) => void
  switchSection: (
    fromSection: BridgeSection | null,
    toSection: BridgeSection | null,
    options?: { autoPlay?: boolean; tracks?: string[]; position?: number },
  ) => void
  stop: () => void
  refreshStatus: () => void
  getSectionProgress: (section: BridgeSection) => SectionProgress | undefined
  subscribeSectionFinished: (section: BridgeSection, handler: () => void) => () => void
  subscribeSectionCrossfade: (
    handler: (fromSection: BridgeSection, toSection: BridgeSection) => void,
  ) => () => void
}

const ReaperBridgeContext = createContext<ReaperBridgeContextValue | null>(null)

function applyPlayback(message: Extract<BridgeMessage, { type: 'PLAYBACK_STATUS' }>): PlaybackSnapshot {
  return {
    section: message.section,
    state: message.state,
    position: message.position,
    duration: message.duration,
  }
}

export function ReaperBridgeProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [playback, setPlayback] = useState<PlaybackSnapshot>(EMPTY_PLAYBACK)
  const [sectionProgress, setSectionProgress] = useState<
    Partial<Record<BridgeSection, SectionProgress>>
  >({})
  const [lastError, setLastError] = useState<string | null>(null)
  const finishHandlersRef = useRef(new Map<BridgeSection, Set<() => void>>())
  const crossfadeHandlersRef = useRef(
    new Set<(fromSection: BridgeSection, toSection: BridgeSection) => void>(),
  )
  const sectionProgressRef = useRef(sectionProgress)
  sectionProgressRef.current = sectionProgress

  const mergeProgress = useCallback((section: BridgeSection, position: number, duration: number) => {
    setSectionProgress(prev => ({
      ...prev,
      [section]: { position, duration: duration || prev[section]?.duration || 0 },
    }))
  }, [])

  const subscribeSectionFinished = useCallback((section: BridgeSection, handler: () => void) => {
    const handlers = finishHandlersRef.current.get(section) ?? new Set()
    handlers.add(handler)
    finishHandlersRef.current.set(section, handlers)

    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) {
        finishHandlersRef.current.delete(section)
      }
    }
  }, [])

  const subscribeSectionCrossfade = useCallback(
    (handler: (fromSection: BridgeSection, toSection: BridgeSection) => void) => {
      crossfadeHandlersRef.current.add(handler)
      return () => {
        crossfadeHandlersRef.current.delete(handler)
      }
    },
    [],
  )

  useEffect(() => {
    reaperBridge.connect()

    const offOpen = reaperBridge.onOpen(() => {
      setConnected(true)
      setReconnecting(false)
      setLastError(null)
      reaperBridge.getAllProgress()
    })

    const offClose = reaperBridge.onClose(() => {
      setConnected(false)
      setReconnecting(true)
      setPlayback(EMPTY_PLAYBACK)
    })

    const offMessage = reaperBridge.onMessage(message => {
      switch (message.type) {
        case 'CONNECTION_STATUS':
          setConnected(message.connected)
          if (message.connected) {
            setReconnecting(false)
            reaperBridge.getAllProgress()
          }
          break
        case 'PLAYBACK_STATUS':
          setPlayback(applyPlayback(message))
          if (message.section && message.state === 'playing') {
            mergeProgress(message.section, message.position, message.duration)
          }
          break
        case 'SECTION_PROGRESS':
          mergeProgress(message.section, message.position, message.duration)
          break
        case 'ALL_PROGRESS':
          setSectionProgress(message.progress)
          break
        case 'SECTION_FINISHED':
          finishHandlersRef.current.get(message.section)?.forEach(handler => handler())
          setPlayback(prev => {
            if (prev.section !== message.section) {
              return prev
            }
            const duration =
              prev.section === message.section
                ? prev.duration
                : sectionProgressRef.current[message.section]?.duration ?? 0
            return {
              section: message.section,
              state: 'stopped',
              position: duration,
              duration,
            }
          })
          setSectionProgress(prev => {
            const duration = prev[message.section]?.duration ?? 0
            return {
              ...prev,
              [message.section]: { position: duration, duration },
            }
          })
          break
        case 'SECTION_CROSSFADE':
          crossfadeHandlersRef.current.forEach(handler => {
            handler(message.fromSection, message.toSection)
          })
          break
        case 'ERROR':
          setLastError(message.message)
          break
        default:
          break
      }
    })

    return () => {
      offOpen()
      offClose()
      offMessage()
      reaperBridge.disconnect()
    }
  }, [mergeProgress])

  const getSectionProgress = useCallback(
    (section: BridgeSection) => sectionProgressRef.current[section],
    [],
  )

  const playSection = useCallback((section: BridgeSection, position?: number) => {
    const saved = sectionProgressRef.current[section]?.position
    const startAt = position ?? saved ?? 0
    const tracks = REAPER_SECTION_TRACKS[section].tracks
    reaperBridge.playSection(section, startAt, tracks)
  }, [])

  const pauseSection = useCallback((section: BridgeSection) => {
    reaperBridge.pauseSection(section)
  }, [])

  const seekSection = useCallback((section: BridgeSection, position: number) => {
    const duration =
      sectionProgressRef.current[section]?.duration ||
      REAPER_SECTION_TRACKS[section].durationSeconds
    sectionProgressRef.current = {
      ...sectionProgressRef.current,
      [section]: { position, duration },
    }
    mergeProgress(section, position, duration)
    setPlayback(prev =>
      prev.section === section ? { ...prev, position, duration: prev.duration || duration } : prev,
    )
    reaperBridge.seekSection(section, position)
  }, [mergeProgress])

  const switchSection = useCallback(
    (
      fromSection: BridgeSection | null,
      toSection: BridgeSection | null,
      options?: { autoPlay?: boolean; tracks?: string[]; position?: number },
    ) => {
      reaperBridge.switchSection(fromSection, toSection, options)
    },
    [],
  )

  const value = useMemo<ReaperBridgeContextValue>(
    () => ({
      connected,
      reconnecting,
      playback,
      sectionProgress,
      lastError,
      bridgeUrl: resolveBridgeUrl(),
      playSection,
      pauseSection,
      seekSection,
      switchSection,
      stop: () => reaperBridge.stop(),
      refreshStatus: () => reaperBridge.getStatus(),
      getSectionProgress,
      subscribeSectionFinished,
      subscribeSectionCrossfade,
    }),
    [
      connected,
      reconnecting,
      playback,
      sectionProgress,
      lastError,
      playSection,
      pauseSection,
      seekSection,
      switchSection,
      getSectionProgress,
      subscribeSectionFinished,
      subscribeSectionCrossfade,
    ],
  )

  return <ReaperBridgeContext.Provider value={value}>{children}</ReaperBridgeContext.Provider>
}

export function useReaperBridge(): ReaperBridgeContextValue {
  const context = useContext(ReaperBridgeContext)
  if (!context) {
    throw new Error('useReaperBridge must be used within ReaperBridgeProvider')
  }
  return context
}

export function useReaperBridgeOptional(): ReaperBridgeContextValue | null {
  return useContext(ReaperBridgeContext)
}

export function useBridgeSectionFinished(section: BridgeSection | undefined, onFinished: () => void) {
  const bridge = useReaperBridgeOptional()

  useEffect(() => {
    if (!section || !bridge) {
      return
    }
    return bridge.subscribeSectionFinished(section, onFinished)
  }, [section, bridge, onFinished])
}
