import { useId } from 'react'
import { eras } from '../data/eras'
import type { DialPlacement } from '../data/eras'
import { useAnimatedNumber } from '../hooks/useAnimatedNumber'

interface QuarterDialProps {
  focusEraIndex: number
  activeEraIndex: number
  placement: DialPlacement
  revealDegrees: number
  onSelect?: (index: number) => void
  global?: boolean
  /** Fresh bottom arc — no continuity with corner quarter-dials */
  enterFromBottom?: boolean
}

const PLACEMENT_CLASS: Record<DialPlacement, string> = {
  'top-right': 'quarter-dial--top-right',
  'bottom-right': 'quarter-dial--bottom-right',
  'bottom-left': 'quarter-dial--bottom-left',
  'top-left': 'quarter-dial--top-left',
  'top-center': 'quarter-dial--top-center',
  'bottom-center': 'quarter-dial--bottom-center',
}

const ERA_SHORT: Record<string, string> = {
  baroque: 'Baroque',
  classical: 'Classical',
  romantic: 'Romantic',
  'modern-electronic': 'Modern',
  'contemporary-ai': 'AI Era',
}

interface DialGeometry {
  cx: number
  cy: number
  startAngle: number
  arcSpan: number
}

function getGeometry(placement: DialPlacement, revealDegrees: number, size: number): DialGeometry {
  const wide = placement === 'top-center' || placement === 'bottom-center'
  const span = wide ? revealDegrees : 100

  switch (placement) {
    case 'top-right':
      return { cx: size, cy: 0, startAngle: 90, arcSpan: span }
    case 'bottom-right':
      return { cx: size, cy: size, startAngle: 180, arcSpan: span }
    case 'bottom-left':
      return { cx: 0, cy: size, startAngle: 270, arcSpan: span }
    case 'top-left':
      return { cx: 0, cy: 0, startAngle: 0, arcSpan: span }
    case 'top-center':
      return { cx: size / 2, cy: 0, startAngle: 270 - span / 2, arcSpan: span }
    case 'bottom-center':
      return { cx: size / 2, cy: size, startAngle: 270 - span / 2, arcSpan: span }
  }
}

function labelRadiusOffset(placement: DialPlacement): number {
  if (placement === 'bottom-center' || placement === 'top-center') return 72
  return 64
}

function eraDialYear(era: (typeof eras)[number]): string {
  return era.dialYear ?? era.years.replace(/\s*–\s*|\s*-\s*/g, '–').replace(/Present/i, 'Now')
}

export default function QuarterDial({
  focusEraIndex,
  activeEraIndex,
  placement,
  revealDegrees,
  onSelect,
  global = false,
  enterFromBottom = false,
}: QuarterDialProps) {
  const uid = useId().replace(/:/g, '')
  const fadeId = `dial-fade-${uid}`

  const wide = placement === 'top-center' || placement === 'bottom-center'
  const size = wide ? 800 : 600
  const { cx, cy, startAngle, arcSpan } = getGeometry(placement, revealDegrees, size)
  const radius = size * 0.72
  const endAngle = startAngle + arcSpan
  const centerAngle = startAngle + arcSpan / 2
  const stepAngle = Math.min(26, arcSpan / 3.4)
  const labelInset = labelRadiusOffset(placement)

  const animatedFocus = useAnimatedNumber(focusEraIndex, 1200)

  const point = (angleDeg: number, r: number) => {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  const arcPath = (startDeg: number, endDeg: number, r: number) => {
    const start = point(startDeg, r)
    const end = point(endDeg, r)
    const largeArc = endDeg - startDeg > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  const centerPoint = point(centerAngle, radius)

  const fadeStart = point(startAngle, radius)
  const fadeEnd = point(endAngle, radius)
  const fadeMidStart = point(startAngle + arcSpan * 0.1, radius)
  const fadeMidEnd = point(endAngle - arcSpan * 0.1, radius)

  return (
    <nav
      className={[
        'quarter-dial',
        PLACEMENT_CLASS[placement],
        arcSpan > 120 ? 'quarter-dial--wide' : '',
        global ? 'quarter-dial--global' : '',
        enterFromBottom ? 'quarter-dial--enter-bottom' : '',
      ].filter(Boolean).join(' ')}
      aria-label="Era navigation dial"
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="quarter-dial__svg" aria-hidden="false">
        <defs>
          <linearGradient
            id={fadeId}
            gradientUnits="userSpaceOnUse"
            x1={fadeStart.x}
            y1={fadeStart.y}
            x2={fadeEnd.x}
            y2={fadeEnd.y}
          >
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="14%" stopColor="white" stopOpacity="0.15" />
            <stop offset="24%" stopColor="white" stopOpacity="1" />
            <stop offset="76%" stopColor="white" stopOpacity="1" />
            <stop offset="86%" stopColor="white" stopOpacity="0.15" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${fadeId}-cap-a`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.9" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id={`${fadeId}-mask`}>
            <rect width={size} height={size} fill={`url(#${fadeId})`} />
            <circle cx={fadeMidStart.x} cy={fadeMidStart.y} r={52} fill={`url(#${fadeId}-cap-a)`} opacity="0.55" />
            <circle cx={fadeMidEnd.x} cy={fadeMidEnd.y} r={52} fill={`url(#${fadeId}-cap-a)`} opacity="0.55" />
          </mask>
        </defs>

        <g mask={`url(#${fadeId}-mask)`}>
          <circle cx={cx} cy={cy} r={radius + 36} className="quarter-dial__ghost-ring" />
          <path d={arcPath(startAngle, endAngle, radius)} className="quarter-dial__arc" />
          <path d={arcPath(startAngle, endAngle, radius - 32)} className="quarter-dial__inner-arc" />
          <path d={arcPath(startAngle, endAngle, radius - 58)} className="quarter-dial__outer-arc" />

          {Array.from({ length: 72 }, (_, index) => {
            const angle = startAngle + (arcSpan / 71) * index
            const distFromCenter = Math.abs(angle - centerAngle)
            const edgeFade = Math.max(0, 1 - distFromCenter / (arcSpan * 0.52))
            const major = index % 4 === 0
            const inner = point(angle, radius - (major ? 26 : 14))
            const outer = point(angle, radius + 5)
            return (
              <line
                key={index}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                className={major ? 'quarter-dial__tick quarter-dial__tick--major' : 'quarter-dial__tick'}
                opacity={0.25 + edgeFade * 0.75}
              />
            )
          })}

          <g className="quarter-dial__markers">
            {eras.map((era, index) => {
              const displayAngle = centerAngle + (index - animatedFocus) * stepAngle
              const marker = point(displayAngle, radius)
              const yearPos = point(displayAngle, radius - labelInset + 12)
              const namePos = point(displayAngle, radius - labelInset - 8)
              const active = index === activeEraIndex
              const focused = index === focusEraIndex
              const atCenter = Math.abs(displayAngle - centerAngle) < stepAngle * 0.42
              const distFromCenter = Math.abs(displayAngle - centerAngle)
              const markerOpacity = Math.max(0.08, 1 - distFromCenter / (arcSpan * 0.62))

              return (
                <g
                  key={era.id}
                  className={[
                    'quarter-dial__marker',
                    active ? 'quarter-dial__marker--active' : '',
                    focused ? 'quarter-dial__marker--focused' : '',
                    atCenter ? 'quarter-dial__marker--at-center' : '',
                  ].filter(Boolean).join(' ')}
                  role="button"
                  tabIndex={0}
                  aria-label={`Go to ${era.name}`}
                  opacity={markerOpacity}
                  onClick={() => onSelect?.(index)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect?.(index)
                    }
                  }}
                >
                  {!atCenter && (
                    <circle cx={marker.x} cy={marker.y} r={active ? 7 : 5} />
                  )}
                  <text
                    x={yearPos.x}
                    y={yearPos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="quarter-dial__year"
                  >
                    {eraDialYear(era)}
                  </text>
                  <text
                    x={namePos.x}
                    y={namePos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="quarter-dial__label"
                  >
                    {ERA_SHORT[era.id] ?? era.name.split(' ')[0]}
                  </text>
                </g>
              )
            })}
          </g>

          <g className="quarter-dial__center-mark" transform={`translate(${centerPoint.x} ${centerPoint.y})`}>
            <circle r="14" className="quarter-dial__center-glow" />
            <circle r="5.5" className="quarter-dial__center-dot" />
          </g>
        </g>
      </svg>

      <div className="quarter-dial__caption" key={focusEraIndex}>
        <span>{eras[focusEraIndex]?.years}</span>
        <strong>{eras[focusEraIndex]?.name}</strong>
      </div>
    </nav>
  )
}
