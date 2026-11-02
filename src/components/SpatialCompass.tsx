interface SpatialCompassProps {
  eraIndex: number
}

export default function SpatialCompass({ eraIndex }: SpatialCompassProps) {
  return (
    <div
      className={`spatial-compass--hero spatial-compass--${eraIndex}`}
      aria-hidden="true"
    >
      <span className="spatial-compass__head">YOU</span>
      <span className="spatial-compass__point" />
    </div>
  )
}
