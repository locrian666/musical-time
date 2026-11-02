import { PLAYBACK_MODES, type PlaybackMode } from '../data/webAudio'
import { usePlaybackMode } from '../context/PlaybackModeProvider'

export default function PlaybackModeSwitch() {
  const { mode, setMode, setMonitorOpen } = usePlaybackMode()
  const metersDisabled = mode === 'reaper'

  return (
    <div className="playback-switch" role="group" aria-label="Playback mode">
      <div className="playback-switch__modes">
        {PLAYBACK_MODES.map(item => (
          <button
            key={item.id}
            type="button"
            className={
              mode === item.id
                ? 'playback-switch__btn playback-switch__btn--active'
                : 'playback-switch__btn'
            }
            title={item.hint}
            aria-pressed={mode === item.id}
            onClick={() => setMode(item.id as PlaybackMode)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={
          metersDisabled
            ? 'playback-switch__monitor playback-switch__monitor--disabled'
            : 'playback-switch__monitor'
        }
        disabled={metersDisabled}
        title={
          metersDisabled
            ? 'Meters are available in 28CH and BINAURAL'
            : 'Open channel meters'
        }
        onClick={() => setMonitorOpen(true)}
      >
        METERS
      </button>
    </div>
  )
}
