import { useEffect, useRef, type RefObject } from 'react'

const SECTION_IDS = [
  'introduction',
  'baroque',
  'classical',
  'romantic',
  'modern-electronic',
  'contemporary-ai',
]

function getSections(): HTMLElement[] {
  return SECTION_IDS.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
}

function getActiveSectionIndex(container: HTMLElement, sections: HTMLElement[]): number {
  const probe = container.scrollTop + container.clientHeight * 0.38
  let active = 0
  for (let i = 0; i < sections.length; i += 1) {
    if (sections[i].offsetTop <= probe + 2) active = i
  }
  return active
}

export function useSnapScroll(containerRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const animatingRef = useRef(false)
  const unlockTimerRef = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    const onWheel = (event: WheelEvent) => {
      if (animatingRef.current) {
        event.preventDefault()
        return
      }

      const delta = event.deltaY
      if (Math.abs(delta) < 16) return

      const sections = getSections()
      if (sections.length === 0) return

      const current = getActiveSectionIndex(container, sections)
      const next = delta > 0 ? current + 1 : current - 1
      if (next < 0 || next >= sections.length || next === current) return

      event.preventDefault()
      animatingRef.current = true
      sections[next].scrollIntoView({ behavior: 'smooth', block: 'start' })

      window.clearTimeout(unlockTimerRef.current)
      unlockTimerRef.current = window.setTimeout(() => {
        animatingRef.current = false
      }, 850)
    }

    container.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', onWheel)
      window.clearTimeout(unlockTimerRef.current)
      animatingRef.current = false
    }
  }, [containerRef, enabled])
}
