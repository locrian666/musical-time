import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { CHANNEL_METER_COUNT, ONLINE_ONLY_BINAURAL, SPLIT_CH28_SECTION, isModeLockedOnline, stationCh28Urls, type PlaybackMode } from '../data/webAudio'
import type { BridgeSection } from '../services/reaperBridge'
import { getBookmark, saveBookmark } from '../services/sectionBookmarks'
import { loadAllUploads, saveUpload, type UploadLibrary, type UploadMode } from '../services/uploadStore'
import { webStationPlayer } from '../services/webStationPlayer'
import { useReaperBridgeOptional } from './ReaperBridgeProvider'

const MODE_STORAGE_KEY = 'museum.playbackMode'

function readStoredMode(): PlaybackMode {
  try {
    const stored = sessionStorage.getItem(MODE_STORAGE_KEY)
    if (stored === 'reaper' || stored === 'ch28' || stored === 'binaural') {
      if (isModeLockedOnline(stored)) return 'binaural'
      // Online build starts on binaural: REAPER is not reachable from the web.
      if (ONLINE_ONLY_BINAURAL && stored === 'reaper') return 'binaural'
      return stored
    }
  } catch {
    /* private mode */
  }
  return ONLINE_ONLY_BINAURAL ? 'binaural' : 'reaper'
}

export interface PlaybackModeContextValue {
  mode: PlaybackMode
  setMode: (mode: PlaybackMode) => void
  monitorOpen: boolean
  setMonitorOpen: (open: boolean) => void
  assignedFiles: Partial<Record<BridgeSection, File>>
  assignFile: (section: BridgeSection, file: File, partIndex?: number) => Promise<void>
  filesForSection: (section: BridgeSection) => File[]
  webAutoplay: { section: BridgeSection; nonce: number; startAt?: number } | null
  requestWebAutoplay: (section: BridgeSection, startAt?: number) => void
  consumeWebAutoplay: () => void
  pauseWebPlayback: (section?: BridgeSection | null) => void
  cueWebPlayback: (section: BridgeSection) => void
}

const PlaybackModeContext = createContext<PlaybackModeContextValue | null>(null)

export function PlaybackModeProvider({ children }: { children: ReactNode }) {
  const bridge = useReaperBridgeOptional()
  const [mode, setModeState] = useState<PlaybackMode>(readStoredMode)
  const [monitorOpen, setMonitorOpenState] = useState(false)
  const [library, setLibrary] = useState<UploadLibrary>({ ch28: {}, ch28b: {}, binaural: {} })
  const [webAutoplay, setWebAutoplay] = useState<{
    section: BridgeSection
    nonce: number
    startAt?: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadAllUploads()
      .then(stored => {
        if (!cancelled) setLibrary(stored)
      })
      .catch(() => {
        /* private mode / blocked storage */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const uploadMode: UploadMode = mode === 'binaural' ? 'binaural' : 'ch28'
  const assignedFiles = library[uploadMode]

  const filesForSection = useCallback(
    (section: BridgeSection): File[] => {
      if (uploadMode === 'binaural') {
        const file = library.binaural[section]
        return file ? [file] : []
      }
      const parts: File[] = []
      if (library.ch28[section]) parts.push(library.ch28[section]!)
      if (section === SPLIT_CH28_SECTION && library.ch28b[section]) {
        parts.push(library.ch28b[section]!)
      }
      return parts
    },
    [library, uploadMode],
  )

  const assignFile = useCallback(
    async (section: BridgeSection, file: File, partIndex = 0) => {
      const slot: UploadMode = mode === 'binaural' ? 'binaural' : 'ch28'
      setLibrary(prev => {
        if (slot === 'ch28' && partIndex > 0) {
          return { ...prev, ch28b: { ...prev.ch28b, [section]: file } }
        }
        return { ...prev, [slot]: { ...prev[slot], [section]: file } }
      })
      const uploading = webStationPlayer.getSnapshot().uploadProgress != null
      try {
        if (uploading) {
          webStationPlayer.setUploadProgress(0.96, 'Saving to this computer…')
        }
        await saveUpload(slot, section, file, partIndex)
        if (uploading) {
          webStationPlayer.markUploadSaved()
        }
      } catch {
        if (uploading) {
          webStationPlayer.markUploadEphemeral(
            'Loaded for this session only. Could not save permanently (storage full or blocked).',
          )
        }
      }
    },
    [mode],
  )

  const pauseWebPlayback = useCallback((_section?: BridgeSection | null) => {
    const snap = webStationPlayer.getSnapshot()
    if (snap.stationId) {
      saveBookmark(snap.stationId, webStationPlayer.getPosition(), snap.duration)
    }
    webStationPlayer.pause()
  }, [])

  const cueWebPlayback = useCallback(
    (section: BridgeSection) => {
      void (async () => {
        try {
          const assigned = filesForSection(section)
          if (assigned.length > 0) {
            await webStationPlayer.loadFromFiles(assigned, section, CHANNEL_METER_COUNT)
          } else if (!webStationPlayer.isStationLoaded(section)) {
            await webStationPlayer.loadFromUrls(stationCh28Urls(section), section, CHANNEL_METER_COUNT)
          }
          const saved = getBookmark(section)
          const duration = webStationPlayer.getSnapshot().duration
          const resumeAt = saved?.position ?? 0
          webStationPlayer.seek(resumeAt >= (saved?.duration ?? duration) - 0.05 ? 0 : resumeAt)
        } catch {
          /* missing station file is fine when only cueing */
        }
      })()
    },
    [filesForSection],
  )

  const setMode = useCallback(
    (next: PlaybackMode) => {
      if (next === mode) {
        return
      }

      // Locked modes (28CH online) are not selectable.
      if (isModeLockedOnline(next)) {
        return
      }

      if (mode === 'reaper' && bridge?.connected && bridge.playback.section) {
        if (bridge.playback.state === 'playing') {
          bridge.pauseSection(bridge.playback.section)
        }
      }

      if (mode === 'ch28') {
        pauseWebPlayback()
      }

      setWebAutoplay(null)
      setModeState(next)
      try {
        sessionStorage.setItem(MODE_STORAGE_KEY, next)
      } catch {
        /* private mode */
      }

      if (next === 'reaper') {
        setMonitorOpenState(false)
      }
    },
    [bridge, mode, pauseWebPlayback],
  )

  const setMonitorOpen = useCallback((open: boolean) => {
    if (open && mode === 'reaper') {
      return
    }
    setMonitorOpenState(open)
  }, [mode])

  const requestWebAutoplay = useCallback((section: BridgeSection, startAt?: number) => {
    setWebAutoplay({ section, nonce: Date.now(), startAt })
  }, [])

  const consumeWebAutoplay = useCallback(() => {
    setWebAutoplay(null)
  }, [])

  const value = useMemo<PlaybackModeContextValue>(
    () => ({
      mode,
      setMode,
      monitorOpen,
      setMonitorOpen,
      assignedFiles,
      assignFile,
      filesForSection,
      webAutoplay,
      requestWebAutoplay,
      consumeWebAutoplay,
      pauseWebPlayback,
      cueWebPlayback,
    }),
    [
      mode,
      setMode,
      monitorOpen,
      setMonitorOpen,
      assignedFiles,
      assignFile,
      filesForSection,
      webAutoplay,
      requestWebAutoplay,
      consumeWebAutoplay,
      pauseWebPlayback,
      cueWebPlayback,
    ],
  )

  return <PlaybackModeContext.Provider value={value}>{children}</PlaybackModeContext.Provider>
}

export function usePlaybackMode(): PlaybackModeContextValue {
  const context = useContext(PlaybackModeContext)
  if (!context) {
    throw new Error('usePlaybackMode must be used within PlaybackModeProvider')
  }
  return context
}

export function usePlaybackModeOptional(): PlaybackModeContextValue | null {
  return useContext(PlaybackModeContext)
}
