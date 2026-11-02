interface PlayPauseIconProps {
  playing: boolean
  loading?: boolean
}

export default function PlayPauseIcon({ playing, loading = false }: PlayPauseIconProps) {
  if (loading) {
    return (
      <svg className="play-pause-icon play-pause-icon--loading" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeDasharray="10 8"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  if (playing) {
    return (
      <svg className="play-pause-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6.25" y="5" width="3.6" height="14" rx="1.1" fill="currentColor" />
        <rect x="14.15" y="5" width="3.6" height="14" rx="1.1" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg className="play-pause-icon play-pause-icon--play" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.35v13.3L19.2 12 8 5.35z" fill="currentColor" />
    </svg>
  )
}
