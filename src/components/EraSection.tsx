import { useEffect, useRef } from 'react'
import type { EraData } from '../data/eras'
import { isBridgeSection } from '../services/reaperBridge'
import AudioPlayer from './AudioPlayer'
import SpatialCompass from './SpatialCompass'

interface EraSectionProps {
  era: EraData
  eraIndex: number
  onVisible: (index: number) => void
  pageActive: boolean
  onNaturalEnd?: () => void
}

export default function EraSection({
  era,
  eraIndex,
  onVisible,
  pageActive,
  onNaturalEnd,
}: EraSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = sectionRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) onVisible(eraIndex)
        })
      },
      { threshold: [0.55, 0.75] },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [eraIndex, onVisible])

  const sideClass =
    era.contentLayout === 'continued'
      ? 'era-layout--continued'
      : era.contentLayout === 'horizontal'
        ? 'era-layout--horizontal'
        : era.contentSide === 'left'
          ? 'era-layout--content-left'
          : era.contentSide === 'right'
            ? 'era-layout--content-right'
            : `era-layout--${era.dialPlacement}`

  const sectionSideClass =
    era.contentLayout === 'continued'
      ? ' section--content-continued'
      : era.contentLayout === 'horizontal'
        ? ' section--content-horizontal'
        : era.contentSide === 'left'
          ? ' section--content-left'
          : era.contentSide === 'right'
            ? ' section--content-right'
            : ''

  return (
    <section
      ref={sectionRef}
      className={`section section--era section--${era.theme}${sectionSideClass}`}
      id={era.id}
      data-era={era.id}
    >
      <div className={`era-bg era-bg--${era.theme}`} aria-hidden="true" />
      <div className="era-atmosphere" aria-hidden="true" />

      <SpatialCompass eraIndex={eraIndex} />

      <div className={`era-layout ${sideClass}`}>
        {era.contentLayout === 'continued' ? (
          <div className="era-continued">
            <p className="era-chapter">Chapter {era.chapter}</p>
            <p className="era-years">{era.years}</p>
            <h2 className="era-name">{era.name}</h2>
            <p className="era-continued__note">To be continued</p>
            <div className="era-audio">
              <p className="era-audio__label">Listen to this passage</p>
              <AudioPlayer
                src={era.audioSrc}
                label={era.name}
                bridgeSection={isBridgeSection(era.id) ? era.id : undefined}
                pageActive={pageActive}
                onEnded={onNaturalEnd}
                onMissing={() => undefined}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="era-copy">
              <p className="era-chapter">Chapter {era.chapter}</p>
              <p className="era-years">{era.years}</p>
              <h2 className="era-name">{era.name}</h2>
              {era.history.trim() !== '' && <p className="era-history">{era.history}</p>}

              <div className="era-audio">
                <p className="era-audio__label">Listen to this passage</p>
                <AudioPlayer
                  src={era.audioSrc}
                  label={era.name}
                  bridgeSection={isBridgeSection(era.id) ? era.id : undefined}
                  pageActive={pageActive}
                  onEnded={onNaturalEnd}
                  onMissing={() => undefined}
                />
              </div>
            </div>

            <aside className="era-research" aria-label="Research and technical notes">
              {era.literature.trim() !== '' && (
                <article className="era-panel">
                  <span className="era-panel__index">A</span>
                  <h3>Literature</h3>
                  <p>{era.literature}</p>
                </article>
              )}
              {era.audioTechnique.trim() !== '' && (
                <article className="era-panel">
                  <span className="era-panel__index">B</span>
                  <h3>Audio Technique</h3>
                  <p>{era.audioTechnique}</p>
                </article>
              )}
              <article className="era-panel era-panel--spatial">
                <span className="era-panel__index">C</span>
                <h3>Spatial Position</h3>
                <p>{era.spatialPosition}</p>
              </article>
            </aside>
          </>
        )}
      </div>

      <div className="era-scroll-index" aria-hidden="true">
        <span>{String(eraIndex + 1).padStart(2, '0')}</span>
        <i />
        <span>05</span>
      </div>
    </section>
  )
}
