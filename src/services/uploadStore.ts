import type { BridgeSection } from './reaperBridge'

export type UploadMode = 'ch28' | 'binaural'

export interface UploadLibrary {
  ch28: Partial<Record<BridgeSection, File>>
  ch28b: Partial<Record<BridgeSection, File>>
  binaural: Partial<Record<BridgeSection, File>>
}

interface StoredUpload {
  id: string
  mode: UploadMode
  section: BridgeSection
  part: number
  name: string
  type: string
  lastModified: number
  size: number
  blob: Blob
}

const DB_NAME = 'museum-uploads'
const STORE = 'files'
const VERSION = 1

function recordId(mode: UploadMode, section: BridgeSection, part = 0): string {
  return part > 0 ? `${mode}:${section}:${part + 1}` : `${mode}:${section}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

function emptyLibrary(): UploadLibrary {
  return { ch28: {}, ch28b: {}, binaural: {} }
}

export async function saveUpload(
  mode: UploadMode,
  section: BridgeSection,
  file: File,
  part = 0,
): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Could not save upload'))
    tx.objectStore(STORE).put({
      id: recordId(mode, section, part),
      mode,
      section,
      part,
      name: file.name,
      type: file.type || 'audio/wav',
      lastModified: file.lastModified,
      size: file.size,
      blob: file,
    } satisfies StoredUpload)
  })
}

export async function loadAllUploads(): Promise<UploadLibrary> {
  const library = emptyLibrary()
  if (typeof indexedDB === 'undefined') {
    return library
  }

  const db = await openDb()
  const records = await new Promise<StoredUpload[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => resolve((request.result as StoredUpload[]) ?? [])
    request.onerror = () => reject(request.error ?? new Error('Could not read uploads'))
  })

  for (const record of records) {
    if (record.mode !== 'ch28' && record.mode !== 'binaural') continue
    const file = new File([record.blob], record.name, {
      type: record.type || 'audio/wav',
      lastModified: record.lastModified,
    })
    const part = record.part ?? (record.id.endsWith(':2') ? 1 : 0)
    if (record.mode === 'ch28' && part > 0) {
      library.ch28b[record.section] = file
    } else {
      library[record.mode][record.section] = file
    }
  }
  return library
}
