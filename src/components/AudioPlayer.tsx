import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { usePlaybackMode } from '../context/PlaybackModeProvider'
import { useBridgeSectionFinished, useReaperBridgeOptional } from '../context/ReaperBridgeProvider'
import { CHANNEL_METER_COUNT, isModeUnavailableOnline, stationCh28Urls, stationFiles } from '../data/webAudio'
import { REAPER_SECTION_TRACKS } from '../data/reaperTracks'
import type { BridgeSection } from '../services/reaperBridge'
import { formatTimecode, getBookmark, saveBookmark } from '../services/sectionBookmarks'
import { webStationPlayer } from '../services/webStationPlayer'
import PlayPauseIcon from './PlayPauseIcon'

interface AudioPlayerProps {
  src: string
  label?: string
  bridgeSection?: BridgeSection
  /** False when this full-page section is not the one on screen. */
  pageActive?: boolean
  onEnded?: () => void
  onPlayingChange?: (playing: boolean) => void
  onMissing?: () => void
  autoResetOnEnd?: boolean
}

export interface AudioPlayerHandle {
  toggle: () => void
}

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(function AudioPlayer(
  {
    src,
    label = 'Audio',
    bridgeSection,
    pageActive = true,
    onEnded,
    onPlayingChange,
    onMissing,
    autoResetOnEnd = false,
  },
  ref,
) {
  const bridge = useReaperBridgeOptional()
  const playback = usePlaybackMode()
  const audioRef = useRef<HTMLAudioElement>(null)
  const bookmarkId = bridgeSection ?? src
  const configuredDuration = bridgeSection
    ? REAPER_SECTION_TRACKS[bridgeSection].durationSeconds
    : 0
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => getBookmark(bookmarkId)?.position ?? 0)
  const [duration, setDuration] = useState(
    () => getBookmark(bookmarkId)?.duration ?? configuredDuration,
  )
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubTime, setScrubTime] = useState(0)
  const [ch28Tick, setCh28Tick] = useState(0)
  const [assignedBinauralUrl, setAssignedBinauralUrl] = useState<string | null>(null)
  const onPlayingChangeRef = useRef(onPlayingChange)
  onPlayingChangeRef.current = onPlayingChange
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  const onMissingRef = useRef(onMissing)
  onMissingRef.current = onMissing
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime
  const durationRef = useRef(duration)
  durationRef.current = duration
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  const mode = playback.mode
  const useBridge = mode === 'reaper' && Boolean(bridge?.connected && bridgeSection)
  const useCh28 = mode === 'ch28' && Boolean(bridgeSection)
  const useBinaural = mode === 'binaural'
  const assignedBinaural = useBinaural && bridgeSection ? playback.assignedFiles[bridgeSection] : undefined
  const binauralSrc =
    assignedBinauralUrl ?? (bridgeSection ? stationFiles(bridgeSection).binaural : src)
  const ch28Src = bridgeSection ? stationFiles(bridgeSection).ch28 : src

  const remember = (position: number, total = durationRef.current) => {
    saveBookmark(bookmarkId, position, total)
    setCurrentTime(position)
    if (total > 0) {
      setDuration(total)
    }
  }

  const setPlaying = (next: boolean) => {
    setIsPlaying(next)
    onPlayingChangeRef.current?.(next)
  }

  useEffect(() => {
    if (!assignedBinaural) {
      setAssignedBinauralUrl(null)
      return
    }
    const url = URL.createObjectURL(assignedBinaural)
    setAssignedBinauralUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [assignedBinaural])

  useEffect(() => {
    if (!useCh28) {
      return
    }
    return webStationPlayer.onChange(() => setCh28Tick(n => n + 1))
  }, [useCh28])

  useBridgeSectionFinished(bridgeSection, () => {
    if (!useBridge) return
    setPlaying(false)
    if (autoResetOnEnd) {
      remember(0, durationRef.current)
    }
    onEndedRef.current?.()
  })

  useEffect(() => {
    if (!useBridge || !bridgeSection || !bridge) {
      return
    }

    const saved = bridge.getSectionProgress(bridgeSection) ?? getBookmark(bookmarkId)
    const snap = bridge.playback
    const reportedDuration = snap.duration || saved?.duration || configuredDuration

    if (snap.section === bridgeSection) {
      const locallyPlaying = pageActive && isPlayingRef.current
      const drift = Math.abs(currentTimeRef.current - snap.position)
      if (!locallyPlaying || snap.state !== 'playing' || drift > 1.5) {
        remember(snap.position, reportedDuration)
      } else if (reportedDuration > 0) {
        setDuration(reportedDuration)
      }
    } else if (pageActive && saved) {
      remember(saved.position, saved.duration)
    }

    setLoading(false)
    setMissing(false)
  }, [bridge?.playback, useBridge, bridgeSection, bookmarkId, configuredDuration])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !useBinaural) {
      return
    }

    const saved = getBookmark(bookmarkId)
    setPlaying(false)
    setCurrentTime(saved?.position ?? 0)
    setDuration(saved?.duration ?? configuredDuration)
    setMissing(false)
    setLoading(true)
    audio.load()
  }, [binauralSrc, useBinaural, bookmarkId, configuredDuration])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !useBinaural) {
      return
    }

    const onTimeUpdate = () => remember(audio.currentTime, audio.duration || durationRef.current)
    const onLoadedMetadata = () => {
      const total = audio.duration || 0
      setDuration(total)
      const saved = getBookmark(bookmarkId)
      if (saved && saved.position > 0) {
        const restored = Math.min(saved.position, total || saved.position)
        audio.currentTime = restored
        remember(restored, total)
      }
      setLoading(false)
      setMissing(false)
    }
    const onCanPlay = () => setLoading(false)
    const onError = () => {
      setMissing(true)
      setLoading(false)
      setPlaying(false)
      onMissingRef.current?.()
    }
    const onEndedHandler = () => {
      setPlaying(false)
      if (autoResetOnEnd) {
        audio.currentTime = 0
        remember(0, audio.duration || durationRef.current)
      } else {
        remember(audio.currentTime, audio.duration || durationRef.current)
      }
      onEndedRef.current?.()
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('error', onError)
    audio.addEventListener('ended', onEndedHandler)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('ended', onEndedHandler)
    }
  }, [binauralSrc, autoResetOnEnd, useBinaural, bookmarkId])

  useEffect(() => {
    if (useCh28 || useBridge) {
      setLoading(false)
    }
  }, [useCh28, useBridge])

  useEffect(() => {
    if (!useCh28 || !bridgeSection || !pageActive) {
      return
    }

    const apply = () => {
      const snap = webStationPlayer.getSnapshot()
      if (snap.stationId !== bridgeSection) {
        return
      }
      remember(webStationPlayer.getPosition(), snap.duration)
      setPlaying(snap.playing)
      setLoading(false)
      if (snap.hasBuffer) {
        setMissing(false)
      }
    }

    apply()
    const offChange = webStationPlayer.onChange(apply)
    const offEnded = webStationPlayer.onEnded(stationId => {
      if (stationId !== bridgeSection) return
      setPlaying(false)
      if (autoResetOnEnd) {
        remember(0, webStationPlayer.getSnapshot().duration)
      }
      onEndedRef.current?.()
    })

    let raf = 0
    const tick = () => {
      const snap = webStationPlayer.getSnapshot()
      if (snap.stationId === bridgeSection && snap.playing) {
        remember(webStationPlayer.getPosition(), snap.duration)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      offChange()
      offEnded()
      cancelAnimationFrame(raf)
    }
  }, [useCh28, bridgeSection, autoResetOnEnd, pageActive])

  useEffect(() => {
    if (!pageActive) {
      setPlaying(false)
      return
    }

    if (useBridge && bridge?.playback.section === bridgeSection && bridge?.playback.state === 'playing') {
      setPlaying(true)
      return
    }

    if (useCh28) {
      const snap = webStationPlayer.getSnapshot()
      if (snap.stationId === bridgeSection && snap.playing) {
        setPlaying(true)
        return
      }
    }

    const saved =
      (useBridge && bridgeSection ? bridge?.getSectionProgress(bridgeSection) : undefined) ??
      getBookmark(bookmarkId)
    remember(saved?.position ?? 0, saved?.duration ?? configuredDuration)
    setPlaying(false)
  }, [pageActive])

  useEffect(() => {
    if (pageActive) {
      return
    }

    if (useBridge) {
      return
    }

    if (useCh28) {
      playback.pauseWebPlayback()
      return
    }

    const audio = audioRef.current
    if (audio && !audio.paused) {
      audio.pause()
      remember(audio.currentTime, audio.duration || durationRef.current)
      console.log(`Saved timecode ${bookmarkId}: ${formatTimecode(audio.currentTime)}`)
    }
  }, [pageActive, useBridge, useCh28, bookmarkId, playback])

  useEffect(() => {
    if (useBinaural) return
    const audio = audioRef.current
    if (audio && !audio.paused) {
      audio.pause()
      remember(audio.currentTime, audio.duration || durationRef.current)
      setPlaying(false)
    }
  }, [useBinaural])

  useEffect(() => {
    if (!pageActive || !useCh28 || !bridgeSection || !playback.webAutoplay) {
      return
    }
    if (playback.webAutoplay.section !== bridgeSection) {
      return
    }
    const startAt = playback.webAutoplay.startAt
    playback.consumeWebAutoplay()
    setPlaying(true)
    void startCh28(startAt)
  }, [playback.webAutoplay, useCh28, bridgeSection, pageActive])

  useEffect(() => {
    if (!pageActive || !useBinaural || !bridgeSection || !playback.webAutoplay) {
      return
    }
    if (playback.webAutoplay.section !== bridgeSection) {
      return
    }
    const startAt = playback.webAutoplay.startAt
    playback.consumeWebAutoplay()
    setPlaying(true)
    void startBinaural(startAt)
  }, [playback.webAutoplay, useBinaural, bridgeSection, pageActive])

  useEffect(() => {
    if (!pageActive || !isPlaying || !useBridge) {
      return
    }
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const cap = durationRef.current
      const next = Math.min(cap > 0 ? cap : currentTimeRef.current + dt, currentTimeRef.current + dt)
      remember(next, cap)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pageActive, isPlaying, useBridge, bookmarkId])

  const startCh28 = async (startAt?: number) => {
    if (!bridgeSection) return
    const assigned = playback.filesForSection(bridgeSection)
    const needsLoad = assigned.length
      ? !webStationPlayer.isPlaylistLoaded(bridgeSection, assigned)
      : !webStationPlayer.isStationLoaded(bridgeSection)
    if (needsLoad) {
      setLoading(true)
    }
    setPlaying(true)
    try {
      if (needsLoad) {
        if (assigned.length > 0) {
          await webStationPlayer.loadFromFiles(assigned, bridgeSection, CHANNEL_METER_COUNT)
        } else {
          await webStationPlayer.loadFromUrls(stationCh28Urls(bridgeSection), bridgeSection, CHANNEL_METER_COUNT)
        }
      }
      const saved = getBookmark(bookmarkId)
      const resumeAt =
        typeof startAt === 'number'
          ? startAt
          : saved?.position ?? 0
      await webStationPlayer.play(
        resumeAt >= (saved?.duration ?? 0) - 0.05 && typeof startAt !== 'number' ? 0 : resumeAt,
      )
      setMissing(false)
      setLoading(false)
    } catch {
      setMissing(true)
      setLoading(false)
      setPlaying(false)
      playback.setMonitorOpen(true)
      onMissingRef.current?.()
    }
  }

  const startBinaural = async (startAt?: number) => {
    const audio = audioRef.current
    if (!audio || missing) return
    const saved = getBookmark(bookmarkId)
    const resumeAt = typeof startAt === 'number' ? startAt : saved?.position ?? 0
    if (resumeAt > 0) {
      audio.currentTime = Math.min(resumeAt, audio.duration || resumeAt)
    } else {
      audio.currentTime = 0
    }
    setPlaying(true)
    try {
      await audio.play()
    } catch {
      setMissing(true)
      setPlaying(false)
      onMissingRef.current?.()
    }
  }

  const ch28Snap = useCh28 ? webStationPlayer.getSnapshot() : null
  void ch28Tick
  const ch28IsThis = Boolean(ch28Snap && ch28Snap.stationId === bridgeSection)
  const enginePlaying = useBridge
    ? Boolean(bridge?.playback.section === bridgeSection && bridge?.playback.state === 'playing')
    : useCh28
      ? Boolean(ch28IsThis && ch28Snap?.playing)
      : false
  const displayPlaying = Boolean(pageActive && (isPlaying || enginePlaying))

  const togglePlay = async () => {
    if (displayPlaying) {
      remember(currentTimeRef.current, durationRef.current)
      setPlaying(false)

      if (mode === 'reaper' && bridgeSection && bridge) {
        bridge.pauseSection(bridgeSection)
        return
      }
      if (useCh28) {
        playback.pauseWebPlayback()
        return
      }
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        remember(audio.currentTime, audio.duration || durationRef.current)
      }
      return
    }

    setPlaying(true)

    if (mode === 'reaper' && bridgeSection && bridge) {
      if (!bridge.connected) {
        setPlaying(false)
        return
      }
      bridge.playSection(bridgeSection, currentTimeRef.current)
      return
    }

    if (useCh28) {
      await startCh28()
      return
    }

    const audio = audioRef.current
    if (!audio || missing) {
      setPlaying(false)
      return
    }
    await startBinaural()
  }

  const togglePlayRef = useRef(togglePlay)
  togglePlayRef.current = togglePlay
  useImperativeHandle(ref, () => ({
    toggle: () => {
      void togglePlayRef.current()
    },
  }))

  const commitSeek = (time: number) => {
    const total = displayDuration || time
    const next = Math.max(0, Math.min(time, total))
    remember(next, total)
    setScrubbing(false)

    if (useBridge && bridgeSection && bridge) {
      bridge.seekSection(bridgeSection, next)
      return
    }

    if (useCh28) {
      webStationPlayer.seek(next)
      return
    }

    const audio = audioRef.current
    if (audio) {
      audio.currentTime = next
    }
  }

  const displayCurrent = currentTime
  const displayDuration =
    useCh28 && ch28IsThis
      ? duration
      : duration || configuredDuration
  const shownTime = scrubbing ? scrubTime : displayCurrent
  const progress = displayDuration > 0 ? (shownTime / displayDuration) * 100 : 0
  const showMissing =
    (missing && useBinaural) ||
    (useCh28 && missing && !(bridgeSection && playback.filesForSection(bridgeSection).length > 0))
  const canSeek = displayDuration > 0 && !showMissing && (useBridge || useBinaural || useCh28)
  const playDisabled =
    (loading && useBinaural) ||
    (mode === 'reaper' && !bridge?.connected) ||
    (useCh28 && loading && !displayPlaying)

  const hint =
    mode === 'reaper'
      ? isModeUnavailableOnline('reaper')
        ? 'REAPER bridge is unavailable online — choose BINAURAL to listen'
        : bridge?.connected
          ? 'Playback via REAPER bridge'
          : 'REAPER bridge offline — start the local bridge'
      : mode === 'ch28'
        ? '28-channel web playback'
        : 'Binaural stereo on this device'

  return (
    <div className="audio-player">
      {useBinaural && <audio ref={audioRef} src={binauralSrc} preload="metadata" />}

      <p className="audio-player__bridge-hint" role="status">
        {hint}
        {(mode === 'ch28' || mode === 'binaural') && (
          <>
            {' · '}
            <button
              type="button"
              className="audio-player__monitor-link"
              onClick={() => playback.setMonitorOpen(true)}
            >
              Open meters
            </button>
          </>
        )}
      </p>

      {showMissing ? (
        <p className="audio-player__notice" role="status">
          {useCh28
            ? `28-channel file not found (${ch28Src}). Drop WAV files in the monitor (Electric needs two parts), or add them to /public/audio/28ch/.`
            : `Audio file not found (${binauralSrc}). Add the file to continue listening.`}
        </p>
      ) : (
        <div className="audio-player__controls">
          <button
            type="button"
            className="audio-player__play"
            onClick={togglePlay}
            disabled={playDisabled}
            aria-label={displayPlaying ? `Pause ${label}` : `Play ${label}`}
          >
            <PlayPauseIcon playing={displayPlaying} loading={loading && useBinaural} />
          </button>
          <div className="audio-player__track">
            <div className="audio-player__bar">
              <div className="audio-player__fill" style={{ width: `${progress}%` }} />
              <input
                type="range"
                className="audio-player__seek"
                min={0}
                max={Math.max(displayDuration, 1)}
                step={0.01}
                value={shownTime}
                disabled={!canSeek}
                aria-label={`Seek ${label}`}
                onPointerDown={() => {
                  if (!canSeek) return
                  setScrubbing(true)
                  setScrubTime(shownTime)
                }}
                onChange={event => {
                  const next = Number(event.target.value)
                  setScrubbing(true)
                  setScrubTime(next)
                }}
                onPointerUp={event => {
                  commitSeek(Number(event.currentTarget.value))
                }}
                onPointerCancel={event => {
                  commitSeek(Number(event.currentTarget.value))
                }}
                onKeyUp={event => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                    commitSeek(Number(event.currentTarget.value))
                  }
                }}
              />
            </div>
            <div className="audio-player__time">
              <span>{formatTimecode(shownTime)}</span>
              <span>{formatTimecode(displayDuration)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default AudioPlayer
