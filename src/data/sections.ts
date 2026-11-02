import type { BridgeSection } from '../services/reaperBridge'

/** Full-page scroll order (matches snap navigation). */
export const SECTION_IDS = [
  'introduction',
  'baroque',
  'classical',
  'romantic',
  'modern-electronic',
  'contemporary-ai',
] as const

export type SectionId = (typeof SECTION_IDS)[number]

export function sectionIdToBridgeSection(id: SectionId): BridgeSection | null {
  return id
}

export function nextSectionId(id: string): SectionId | null {
  const index = SECTION_IDS.indexOf(id as SectionId)
  if (index < 0 || index >= SECTION_IDS.length - 1) return null
  return SECTION_IDS[index + 1]
}

export function bridgeSectionFromIndex(index: number): BridgeSection | null {
  const id = SECTION_IDS[index]
  if (!id) return null
  return sectionIdToBridgeSection(id)
}

export function indexFromSectionId(id: string): number {
  return SECTION_IDS.indexOf(id as SectionId)
}
