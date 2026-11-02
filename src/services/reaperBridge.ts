const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:8080'

export function resolveBridgeUrl(): string {
  const fromEnv = import.meta.env.VITE_REAPER_BRIDGE_URL
  return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : DEFAULT_BRIDGE_URL
}

export const BRIDGE_SECTIONS = [
  'introduction',
  'baroque',
  'classical',
  'romantic',
  'modern-electronic',
  'contemporary-ai',
] as const

export type BridgeSection = (typeof BRIDGE_SECTIONS)[number]

export function isBridgeSection(value: string): value is BridgeSection {
  return (BRIDGE_SECTIONS as readonly string[]).includes(value)
}

export type PlaybackState = 'playing' | 'stopped'

export interface PlaybackSnapshot {
  section: BridgeSection | null
  state: PlaybackState
  position: number
  duration: number
}

export const EMPTY_PLAYBACK: PlaybackSnapshot = {
  section: null,
  state: 'stopped',
  position: 0,
  duration: 0,
}

export interface SectionProgress {
  position: number
  duration: number
}

export type BridgeCommand =
  | { type: 'PLAY_SECTION'; section: BridgeSection; position?: number; tracks?: string[] }
  | { type: 'PAUSE_SECTION'; section: BridgeSection }
  | { type: 'SEEK_SECTION'; section: BridgeSection; position: number }
  | {
      type: 'SWITCH_SECTION'
      fromSection: BridgeSection | null
      toSection: BridgeSection | null
      autoPlay?: boolean
      tracks?: string[]
      position?: number
    }
  | { type: 'STOP' }
  | { type: 'GET_STATUS' }
  | { type: 'GET_ALL_PROGRESS' }

export type BridgeMessage =
  | { type: 'CONNECTION_STATUS'; connected: boolean }
  | {
      type: 'PLAYBACK_STATUS'
      section: BridgeSection | null
      state: PlaybackState
      position: number
      duration: number
      tracks?: string[]
    }
  | { type: 'SECTION_PROGRESS'; section: BridgeSection; position: number; duration: number }
  | { type: 'ALL_PROGRESS'; progress: Partial<Record<BridgeSection, SectionProgress>> }
  | { type: 'SECTION_FINISHED'; section: BridgeSection }
  | {
      type: 'SECTION_CROSSFADE'
      fromSection: BridgeSection
      toSection: BridgeSection
      overlapSeconds: number
    }
  | { type: 'ERROR'; message: string }

type MessageHandler = (message: BridgeMessage) => void
type VoidHandler = () => void
type ErrorHandler = (message: string) => void

export interface ReaperBridgeOptions {
  url?: string
  reconnectMs?: number
}

export class ReaperBridge {
  private url: string
  private reconnectMs: number
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false

  private onMessageHandlers = new Set<MessageHandler>()
  private onOpenHandlers = new Set<VoidHandler>()
  private onCloseHandlers = new Set<VoidHandler>()
  private onErrorHandlers = new Set<ErrorHandler>()

  constructor(options: ReaperBridgeOptions = {}) {
    this.url = options.url ?? resolveBridgeUrl()
    this.reconnectMs = options.reconnectMs ?? 2000
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  connect(): void {
    this.shouldReconnect = true
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.socket = new WebSocket(this.url)

    this.socket.addEventListener('open', () => {
      this.onOpenHandlers.forEach(handler => handler())
      this.send({ type: 'GET_STATUS' })
    })

    this.socket.addEventListener('message', event => {
      const message = parseBridgeMessage(event.data)
      if (message) {
        if (message.type === 'ERROR') {
          this.onErrorHandlers.forEach(handler => handler(message.message))
        }
        this.onMessageHandlers.forEach(handler => handler(message))
      }
    })

    this.socket.addEventListener('close', () => {
      this.socket = null
      this.onCloseHandlers.forEach(handler => handler())
      this.scheduleReconnect()
    })

    this.socket.addEventListener('error', () => {
      this.socket?.close()
    })
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.socket?.close()
    this.socket = null
  }

  onMessage(handler: MessageHandler): () => void {
    this.onMessageHandlers.add(handler)
    return () => this.onMessageHandlers.delete(handler)
  }

  onOpen(handler: VoidHandler): () => void {
    this.onOpenHandlers.add(handler)
    return () => this.onOpenHandlers.delete(handler)
  }

  onClose(handler: VoidHandler): () => void {
    this.onCloseHandlers.add(handler)
    return () => this.onCloseHandlers.delete(handler)
  }

  onError(handler: ErrorHandler): () => void {
    this.onErrorHandlers.add(handler)
    return () => this.onErrorHandlers.delete(handler)
  }

  playSection(section: BridgeSection, position?: number, tracks?: string[]): void {
    this.send({ type: 'PLAY_SECTION', section, position, tracks })
  }

  pauseSection(section: BridgeSection): void {
    this.send({ type: 'PAUSE_SECTION', section })
  }

  seekSection(section: BridgeSection, position: number): void {
    this.send({ type: 'SEEK_SECTION', section, position })
  }

  switchSection(
    fromSection: BridgeSection | null,
    toSection: BridgeSection | null,
    options?: { autoPlay?: boolean; tracks?: string[]; position?: number },
  ): void {
    this.send({
      type: 'SWITCH_SECTION',
      fromSection,
      toSection,
      autoPlay: options?.autoPlay,
      tracks: options?.tracks,
      position: options?.position,
    })
  }

  stop(): void {
    this.send({ type: 'STOP' })
  }

  getStatus(): void {
    this.send({ type: 'GET_STATUS' })
  }

  getAllProgress(): void {
    this.send({ type: 'GET_ALL_PROGRESS' })
  }

  private send(command: BridgeCommand): void {
    if (!this.connected || !this.socket) {
      return
    }
    this.socket.send(JSON.stringify(command))
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) {
      return
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectMs)
  }
}

function parseBridgeMessage(raw: unknown): BridgeMessage | null {
  if (typeof raw !== 'string') {
    return null
  }

  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    if (!data || typeof data.type !== 'string') {
      return null
    }

    switch (data.type) {
      case 'CONNECTION_STATUS':
        return { type: 'CONNECTION_STATUS', connected: Boolean(data.connected) }
      case 'PLAYBACK_STATUS':
        return {
          type: 'PLAYBACK_STATUS',
          section:
            typeof data.section === 'string' && isBridgeSection(data.section) ? data.section : null,
          state: data.state === 'playing' ? 'playing' : 'stopped',
          position: typeof data.position === 'number' ? data.position : 0,
          duration: typeof data.duration === 'number' ? data.duration : 0,
          tracks: Array.isArray(data.tracks)
            ? data.tracks.filter((t): t is string => typeof t === 'string')
            : undefined,
        }
      case 'SECTION_PROGRESS':
        return typeof data.section === 'string' && isBridgeSection(data.section)
          ? {
              type: 'SECTION_PROGRESS',
              section: data.section,
              position: typeof data.position === 'number' ? data.position : 0,
              duration: typeof data.duration === 'number' ? data.duration : 0,
            }
          : null
      case 'ALL_PROGRESS': {
        const raw = data.progress
        if (!raw || typeof raw !== 'object') {
          return { type: 'ALL_PROGRESS', progress: {} }
        }
        const progress: Partial<Record<BridgeSection, SectionProgress>> = {}
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          if (!isBridgeSection(key) || !value || typeof value !== 'object') continue
          const entry = value as Record<string, unknown>
          progress[key] = {
            position: typeof entry.position === 'number' ? entry.position : 0,
            duration: typeof entry.duration === 'number' ? entry.duration : 0,
          }
        }
        return { type: 'ALL_PROGRESS', progress }
      }
      case 'SECTION_FINISHED':
        return typeof data.section === 'string' && isBridgeSection(data.section)
          ? { type: 'SECTION_FINISHED', section: data.section }
          : null
      case 'SECTION_CROSSFADE':
        return typeof data.fromSection === 'string' &&
          isBridgeSection(data.fromSection) &&
          typeof data.toSection === 'string' &&
          isBridgeSection(data.toSection)
          ? {
              type: 'SECTION_CROSSFADE',
              fromSection: data.fromSection,
              toSection: data.toSection,
              overlapSeconds:
                typeof data.overlapSeconds === 'number' ? data.overlapSeconds : 2,
            }
          : null
      case 'ERROR':
        return {
          type: 'ERROR',
          message: typeof data.message === 'string' ? data.message : 'Unknown bridge error',
        }
      default:
        return null
    }
  } catch {
    return null
  }
}

export const reaperBridge = new ReaperBridge()
