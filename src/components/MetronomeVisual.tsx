export const METRONOME_CLOSED = '/images/metronome/closed.png'
export const METRONOME_OPEN = '/images/metronome/open.png'
export const METRONOME_COVER = '/images/metronome/cover.png'

interface MetronomeVisualProps {
  active?: boolean
  open?: boolean
}

export default function MetronomeVisual({ active = false, open = false }: MetronomeVisualProps) {
  return (
    <div
      className={[
        'metronome-visual',
        active ? 'metronome-visual--active' : '',
        open ? 'metronome-visual--open' : '',
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <div className="metronome-visual__stage">
        <img
          src={METRONOME_CLOSED}
          alt=""
          className="metronome-visual__body metronome-visual__body--closed"
          draggable={false}
        />
        <img
          src={METRONOME_OPEN}
          alt=""
          className="metronome-visual__body metronome-visual__body--open"
          draggable={false}
        />
        <img
          src={METRONOME_COVER}
          alt=""
          className="metronome-visual__cover"
          draggable={false}
        />
      </div>
    </div>
  )
}
