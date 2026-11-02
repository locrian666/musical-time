import { useEffect, useRef, type RefObject } from 'react'
import { indexFromSectionId, SECTION_IDS } from '../data/sections'

function getSections(): HTMLElement[] {
  return SECTION_IDS.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
}

export function getActiveSectionIndex(container: HTMLElement): number {
  const sections = getSections()
  const probe = container.scrollTop + container.clientHeight * 0.38
  let active = 0
  for (let i = 0; i < sections.length; i += 1) {
    if (sections[i].offsetTop <= probe + 2) active = i
  }
  return active
}

export function scrollToSectionIndex(index: number): boolean {
  const id = SECTION_IDS[index]
  const target = id ? document.getElementById(id) : null
  if (!target) return false
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}

interface UseSectionNavigationOptions {
  enabled: boolean
  onSectionChange?: (fromIndex: number, toIndex: number) => void
}

export function useSectionNavigation(
  containerRef: RefObject<HTMLElement | null>,
  { enabled, onSectionChange }: UseSectionNavigationOptions,
) {
  const animatingRef = useRef(false)
  const unlockTimerRef = useRef(0)
  const activeIndexRef = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    activeIndexRef.current = getActiveSectionIndex(container)

    const navigateByDelta = (delta: number, event?: Event) => {
      if (animatingRef.current) {
        event?.preventDefault()
        return
      }

      const sections = getSections()
      if (sections.length === 0) return

      const current = getActiveSectionIndex(container)
      const next = current + delta
      if (next < 0 || next >= sections.length || next === current) return

      event?.preventDefault()
      animatingRef.current = true

      const fromIndex = current
      activeIndexRef.current = next
      onSectionChange?.(fromIndex, next)

      sections[next].scrollIntoView({ behavior: 'smooth', block: 'start' })

      window.clearTimeout(unlockTimerRef.current)
      unlockTimerRef.current = window.setTimeout(() => {
        animatingRef.current = false
        activeIndexRef.current = getActiveSectionIndex(container)
      }, 850)
    }

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 16) return
      navigateByDelta(event.deltaY > 0 ? 1 : -1, event)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        navigateByDelta(1, event)
      }
      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        navigateByDelta(-1, event)
      }
      if (event.key === 'Home') {
        navigateByDelta(-getActiveSectionIndex(container), event)
      }
      if (event.key === 'End') {
        const sections = getSections()
        navigateByDelta(sections.length - 1 - getActiveSectionIndex(container), event)
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)

    return () => {
      container.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(unlockTimerRef.current)
      animatingRef.current = false
    }
  }, [containerRef, enabled, onSectionChange])
}

export function navigateToSectionId(sectionId: string): void {
  const index = indexFromSectionId(sectionId)
  if (index >= 0) scrollToSectionIndex(index)
}
