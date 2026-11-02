import { resolveBridgeUrl } from '../services/reaperBridge'
import { usePlaybackModeOptional } from '../context/PlaybackModeProvider'
import { useReaperBridgeOptional } from '../context/ReaperBridgeProvider'

export default function BridgeStatus() {
  const bridge = useReaperBridgeOptional()
  const mode = usePlaybackModeOptional()
  if (!bridge || mode?.mode !== 'reaper') {
    return null
  }

  const { connected, reconnecting, lastError, playback } = bridge
  const statusClass = connected
    ? 'bridge-status bridge-status--online'
    : reconnecting
      ? 'bridge-status bridge-status--reconnecting'
      : 'bridge-status bridge-status--offline'

  const label = connected
    ? playback.state === 'playing' && playback.section
      ? `REAPER · ${playback.section}`
      : 'REAPER · connected'
    : reconnecting
      ? 'REAPER · reconnecting'
      : 'REAPER · offline'

  return (
    <div className={statusClass} title={lastError ?? resolveBridgeUrl()} role="status">
      <span className="bridge-status__dot" aria-hidden="true" />
      <span className="bridge-status__label">{label}</span>
    </div>
  )
}
