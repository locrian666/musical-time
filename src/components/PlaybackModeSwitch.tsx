import { PLAYBACK_MODES, isModeLockedOnline, type PlaybackMode } from '../data/webAudio'
import { usePlaybackMode } from '../context/PlaybackModeProvider'

export default function PlaybackModeSwitch() {
  const { mode, setMode, setMonitorOpen } = usePlaybackMode()
  const metersDisabled = mode === 'reaper'

  return (
    <div className="playback-switch" role="group" aria-label="Playback mode">
      <div className="playback-switch__modes">
        {PLAYBACK_MODES.map(item => {
          const locked = isModeLockedOnline(item.id as PlaybackMode)
          const active = mode === item.id
          const classes = ['playback-switch__btn']
          if (active) classes.push('playback-switch__btn--active')
          if (locked) classes.push('playback-switch__btn--disabled')

          return (
            <button
              key={item.id}
              type="button"
              className={classes.join(' ')}
              title={locked ? '28-channel playback is unavailable online' : item.hint}
              aria-pressed={active}
              aria-disabled={locked}
              disabled={locked}
              onClick={() => {
                if (locked) return
                setMode(item.id as PlaybackMode)
              }}
            >
              {item.label}
            </button>
          )
        })}
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
