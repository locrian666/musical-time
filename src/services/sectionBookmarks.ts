/** In-memory playback bookmarks so each page can resume from its last timecode. */

export interface SectionBookmark {
  position: number
  duration: number
}

const bookmarks = new Map<string, SectionBookmark>()

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function saveBookmark(id: string, position: number, duration: number): SectionBookmark {
  const bookmark = {
    position: Math.max(0, position),
    duration: Math.max(0, duration),
  }
  bookmarks.set(id, bookmark)
  return bookmark
}

export function getBookmark(id: string): SectionBookmark | undefined {
  return bookmarks.get(id)
}
