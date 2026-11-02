import { useCallback, useRef, useState } from 'react'
import { INTRO_AUDIO_SRC, INTRO_TITLE } from '../data/eras'
import AudioPlayer, { type AudioPlayerHandle } from './AudioPlayer'
import MetronomeVisual from './MetronomeVisual'

interface IntroSectionProps {
  scrollUnlocked: boolean
  onUnlock: () => void
  pageActive: boolean
  onNaturalEnd?: () => void
}

export default function IntroSection({
  scrollUnlocked,
  onUnlock,
  pageActive,
  onNaturalEnd,
}: IntroSectionProps) {
  const [playing, setPlaying] = useState(false)
  const [opened, setOpened] = useState(false)
  const [finished, setFinished] = useState(false)
  const [audioMissing, setAudioMissing] = useState(false)
  const playerRef = useRef<AudioPlayerHandle>(null)

  const handlePlayingChange = useCallback((next: boolean) => {
    setPlaying(next)
    if (next) setOpened(true)
  }, [])

  const handleEnded = useCallback(() => {
    setPlaying(false)
    setFinished(true)
    onUnlock()
    onNaturalEnd?.()
  }, [onUnlock, onNaturalEnd])

  const handleSkip = useCallback(() => {
    setFinished(true)
    onUnlock()
  }, [onUnlock])

  const begin = () => {
    const alreadyOpen = opened
    if (!opened) setOpened(true)
    window.setTimeout(() => {
      playerRef.current?.toggle()
    }, alreadyOpen ? 0 : 700)
  }

  return (
    <section className="section section--intro" id="introduction">
      <div className="intro-spotlight" />
      <div className="intro-grain" />
      <div className="intro-vignette" />

      <header className="museum-header">
        <span>✧ &nbsp; THE MUSEUM OF MUSICAL TIME</span>
      </header>

      <div className="intro-content">
        <h1 className="intro-title">{INTRO_TITLE}</h1>

        <button
          className="intro-stage"
          type="button"
          onClick={begin}
          aria-label={
            opened
              ? playing
                ? 'Pause introduction'
                : 'Play introduction'
              : 'Open the metronome and play introduction'
          }
        >
          <MetronomeVisual active={playing} open={opened} />
          <span className="intro-stage__label">
            {opened ? (playing ? 'Listening…' : 'Click to play') : 'Click the cover to open'}
          </span>
        </button>

        <div className="intro-audio">
          <AudioPlayer
            ref={playerRef}
            src={INTRO_AUDIO_SRC}
            label="Introduction"
            bridgeSection="introduction"
            pageActive={pageActive}
            onEnded={handleEnded}
            onPlayingChange={handlePlayingChange}
            onMissing={() => setAudioMissing(true)}
          />
        </div>

        {audioMissing && !scrollUnlocked && (
          <button type="button" className="intro-skip" onClick={handleSkip}>
            Continue without audio
          </button>
        )}

        {!scrollUnlocked && !finished && (
          <p className="intro-hint">Listen here, or scroll to the next passage</p>
        )}

        {finished && (
          <p className="intro-scroll-cue" aria-live="polite">
            Scroll to explore
            <span className="intro-scroll-cue__arrow">↓</span>
          </p>
        )}
      </div>
    </section>
  )
}
