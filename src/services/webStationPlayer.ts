import { CHANNEL_METER_COUNT } from '../data/webAudio'
import { ChannelCountError, parseWav, wavToAudioBuffer, WavFormatError } from './wavDecode'

export interface ChannelMeter {
  rmsDb: number
  peak: number
}

export interface WebPlayerSnapshot {
  playing: boolean
  position: number
  duration: number
  channels: number
  sampleRate: number
  fileName: string
  stationId: string | null
  status: string
  statusKind: 'idle' | 'ok' | 'warn' | 'bad'
  meterOnly: boolean
  foldToStereo: boolean
  outputChannels: number
  maxOutputChannels: number
  hasBuffer: boolean
  uploadProgress: number | null
  uploadEtaSeconds: number | null
  partIndex: number
  partCount: number
}

type ChangeHandler = () => void

function emptyMeters(): ChannelMeter[] {
  return Array.from({ length: CHANNEL_METER_COUNT }, () => ({ rmsDb: -Infinity, peak: 0 }))
}

function emptySnapshot(): WebPlayerSnapshot {
  return {
    playing: false,
    position: 0,
    duration: 0,
    channels: 0,
    sampleRate: 0,
    fileName: '',
    stationId: null,
    status: 'Drop a WAV to upload, or play a station to load /audio/28ch/.',
    statusKind: 'idle',
    meterOnly: false,
    foldToStereo: true,
    outputChannels: 0,
    maxOutputChannels: 0,
    hasBuffer: false,
    uploadProgress: null,
    uploadEtaSeconds: null,
    partIndex: 0,
    partCount: 0,
  }
}

async function decodeAudioPreserveChannels(
  ctx: AudioContext,
  raw: ArrayBuffer,
  expectedChannels?: number,
  onProgress?: (progress: number) => void,
): Promise<AudioBuffer> {
  let header: ReturnType<typeof parseWav> | null = null
  try {
    header = parseWav(raw)
  } catch {
    header = null
  }

  if (header && expectedChannels && header.channels !== expectedChannels) {
    throw new ChannelCountError(expectedChannels, header.channels)
  }

  const mapProgress = (value: number) => onProgress?.(Math.max(0, Math.min(1, value)))

  if (header && (expectedChannels === CHANNEL_METER_COUNT || header.channels > 8)) {
    return wavToAudioBuffer(ctx, raw, header, mapProgress)
  }

  let audio: AudioBuffer | null = null
  try {
    mapProgress(0.35)
    audio = await ctx.decodeAudioData(raw.slice(0))
    mapProgress(1)
  } catch (error) {
    if (header) {
      audio = await wavToAudioBuffer(ctx, raw, header, mapProgress)
    } else {
      throw new WavFormatError(
        `Could not decode this file. Please upload a WAV. ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  if (header && audio.numberOfChannels !== header.channels) {
    audio = await wavToAudioBuffer(ctx, raw, header, mapProgress)
  }

  if (expectedChannels && audio.numberOfChannels !== expectedChannels) {
    throw new ChannelCountError(expectedChannels, audio.numberOfChannels)
  }

  return audio
}

function readFileWithProgress(
  file: File,
  onProgress: (progress: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = event => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total)
      }
    }
    reader.onload = () => {
      onProgress(1)
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
        return
      }
      reject(new Error('Could not read this file.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read this file.'))
    reader.readAsArrayBuffer(file)
  })
}

function playlistKey(files: File[]): string {
  return files.map(file => `file:${file.name}:${file.size}:${file.lastModified}`).join('|')
}

export class WebStationPlayer {
  private ctx: AudioContext | null = null
  private buffers: AudioBuffer[] = []
  private source: AudioBufferSourceNode | null = null
  private graph: AudioNode[] = []
  private playing = false
  private partIndex = 0
  private offset = 0
  private startedAt = 0
  private meterOnly = false
  private foldToStereo = true
  private fileName = ''
  private stationId: string | null = null
  private loadedKey: string | null = null
  private status = emptySnapshot().status
  private statusKind: WebPlayerSnapshot['statusKind'] = 'idle'
  private handlers = new Set<ChangeHandler>()
  private endedHandlers = new Set<(stationId: string | null) => void>()
  private snapshot: WebPlayerSnapshot = emptySnapshot()
  private uploadProgress: number | null = null
  private uploadEtaSeconds: number | null = null
  private uploadStartedAt = 0

  onChange(handler: ChangeHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  onEnded(handler: (stationId: string | null) => void): () => void {
    this.endedHandlers.add(handler)
    return () => this.endedHandlers.delete(handler)
  }

  getSnapshot(): WebPlayerSnapshot {
    return this.snapshot
  }

  isStationLoaded(stationId: string): boolean {
    return this.stationId === stationId && this.buffers.length > 0
  }

  isPlaylistLoaded(stationId: string, files: File[]): boolean {
    if (this.stationId !== stationId || this.buffers.length === 0) {
      return false
    }
    if (files.length === 0) {
      return this.loadedKey?.startsWith('url:') === true
    }
    return this.loadedKey === playlistKey(files)
  }

  private totalDuration(): number {
    return this.buffers.reduce((sum, buffer) => sum + buffer.duration, 0)
  }

  private prefixDuration(index: number): number {
    return this.buffers.slice(0, index).reduce((sum, buffer) => sum + buffer.duration, 0)
  }

  private locate(globalTime: number): { index: number; local: number } {
    if (this.buffers.length === 0) {
      return { index: 0, local: 0 }
    }
    let remaining = Math.max(0, globalTime)
    for (let index = 0; index < this.buffers.length; index += 1) {
      const duration = this.buffers[index].duration
      const last = index === this.buffers.length - 1
      if (remaining < duration || last) {
        return { index, local: Math.min(remaining, duration) }
      }
      remaining -= duration
    }
    const lastIndex = this.buffers.length - 1
    return { index: lastIndex, local: this.buffers[lastIndex].duration }
  }

  getPosition(): number {
    if (this.buffers.length === 0) return 0
    const prefix = this.prefixDuration(this.partIndex)
    if (!this.playing || !this.ctx) return prefix + this.offset
    const local = this.offset + (this.ctx.currentTime - this.startedAt)
    return Math.min(this.totalDuration(), prefix + local)
  }

  analyzeMeters(time = this.getPosition()): ChannelMeter[] {
    const meters = emptyMeters()
    if (this.buffers.length === 0) return meters
    const { index, local } = this.locate(time)
    const buffer = this.buffers[index]
    const sr = buffer.sampleRate
    const center = Math.floor(local * sr)
    const windowSize = Math.max(256, Math.floor(sr * 0.04))
    const start = Math.max(0, center - Math.floor(windowSize / 2))
    const end = Math.min(buffer.length, start + windowSize)
    for (let ch = 0; ch < CHANNEL_METER_COUNT; ch += 1) {
      if (ch >= buffer.numberOfChannels) continue
      const data = buffer.getChannelData(ch)
      let sum = 0
      let peak = 0
      let n = 0
      for (let i = start; i < end; i += 2) {
        const v = data[i]
        sum += v * v
        const abs = Math.abs(v)
        if (abs > peak) peak = abs
        n += 1
      }
      const rms = Math.sqrt(sum / Math.max(1, n))
      meters[ch] = { rmsDb: 20 * Math.log10(Math.max(rms, 1e-8)), peak }
    }
    return meters
  }

  private async getContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    return this.ctx
  }

  private applyDestinationLayout(ctx: AudioContext): void {
    const max = Math.max(2, ctx.destination.maxChannelCount)
    try {
      ctx.destination.channelCount = this.foldToStereo ? Math.min(2, max) : Math.min(CHANNEL_METER_COUNT, max)
      ctx.destination.channelCountMode = 'explicit'
      ctx.destination.channelInterpretation = this.foldToStereo ? 'speakers' : 'discrete'
    } catch {
      /* hardware refused the requested layout */
    }
  }

  async ensureContext(): Promise<AudioContext> {
    const ctx = await this.getContext()
    this.applyDestinationLayout(ctx)
    return ctx
  }

  async loadFromUrl(
    url: string,
    stationId: string,
    fileName = url.split('/').pop() ?? url,
    expectedChannels?: number,
  ): Promise<void> {
    await this.loadFromUrls([url], stationId, expectedChannels, [fileName])
  }

  async loadFromUrls(
    urls: string[],
    stationId: string,
    expectedChannels?: number,
    fileNames?: string[],
  ): Promise<void> {
    const names = fileNames ?? urls.map(url => url.split('/').pop() ?? url)
    const key = `url:${urls.join('|')}`
    if (this.loadedKey === key && this.buffers.length > 0) {
      if (expectedChannels && this.buffers.some(buffer => buffer.numberOfChannels !== expectedChannels)) {
        throw new ChannelCountError(expectedChannels, this.buffers[0]?.numberOfChannels ?? 0)
      }
      this.stationId = stationId
      this.emit()
      return
    }
    this.setStatus('Loading…')
    this.stopSource()
    this.offset = 0
    this.partIndex = 0
    this.stationId = stationId
    this.fileName = names.filter(Boolean).join(' → ')
    this.emit()
    const ctx = await this.getContext()
    const rawParts: ArrayBuffer[] = []
    const loadedNames: string[] = []
    for (let i = 0; i < urls.length; i += 1) {
      const response = await fetch(urls[i])
      if (!response.ok) {
        if (i === 0) {
          this.setStatus(`Missing file (${response.status}): ${names[i]}`, 'bad')
          this.emit()
          throw new Error(`Missing file (${response.status}): ${names[i]}`)
        }
        continue
      }
      rawParts.push(await response.arrayBuffer())
      loadedNames.push(names[i] ?? urls[i])
    }
    if (rawParts.length === 0) {
      throw new Error(`Missing file: ${names[0]}`)
    }
    this.fileName = loadedNames.join(' → ')
    await this.setBuffers(ctx, rawParts, loadedNames, key, expectedChannels)
  }

  async loadFromFile(
    file: File,
    stationId: string | null = this.stationId,
    expectedChannels?: number,
    reportUpload = false,
  ): Promise<void> {
    await this.loadFromFiles([file], stationId, expectedChannels, reportUpload)
  }

  async loadFromFiles(
    files: File[],
    stationId: string | null = this.stationId,
    expectedChannels?: number,
    reportUpload = false,
  ): Promise<void> {
    const usable = files.filter(Boolean)
    if (usable.length === 0) return
    const key = playlistKey(usable)
    if (this.loadedKey === key && this.buffers.length > 0) {
      if (expectedChannels && this.buffers.some(buffer => buffer.numberOfChannels !== expectedChannels)) {
        throw new ChannelCountError(expectedChannels, this.buffers[0]?.numberOfChannels ?? 0)
      }
      this.stationId = stationId
      this.emit()
      return
    }
    this.setStatus(reportUpload ? 'Uploading…' : 'Loading…')
    this.stopSource()
    this.offset = 0
    this.partIndex = 0
    const previousName = this.fileName
    const previousStation = this.stationId
    this.stationId = stationId
    this.fileName = usable.map(file => file.name).join(' → ')
    if (reportUpload) {
      this.beginUpload()
    }
    this.emit()
    try {
      const ctx = await this.getContext()
      const rawParts: ArrayBuffer[] = []
      for (let i = 0; i < usable.length; i += 1) {
        const slice = 1 / usable.length
        const raw = reportUpload
          ? await readFileWithProgress(usable[i], progress => {
              this.setUploadProgress((i + 0.12 * progress) * slice, `Uploading part ${i + 1}…`)
            })
          : await usable[i].arrayBuffer()
        rawParts.push(raw)
        if (reportUpload) {
          this.setUploadProgress((i + 0.2) * slice, `Uploading part ${i + 1}…`)
        }
      }
      await this.setBuffers(
        ctx,
        rawParts,
        usable.map(file => file.name),
        key,
        expectedChannels,
        reportUpload
          ? progress => {
              this.setUploadProgress(0.2 + 0.7 * progress, 'Uploading…')
            }
          : undefined,
      )
      if (reportUpload) {
        this.setUploadProgress(0.92, 'Saving to this computer…')
      }
    } catch (error) {
      this.fileName = previousName
      this.stationId = previousStation
      this.clearUploadProgress()
      this.emit()
      throw error
    }
  }

  async play(from?: number): Promise<void> {
    if (this.buffers.length === 0) return
    const ctx = await this.ensureContext()
    const global = typeof from === 'number' ? from : this.getPosition()
    const located = this.locate(global)
    this.partIndex = located.index
    this.offset = located.local
    const buffer = this.buffers[this.partIndex]
    if (!buffer) return
    if (this.offset >= buffer.duration - 0.02) {
      if (this.partIndex < this.buffers.length - 1) {
        this.partIndex += 1
        this.offset = 0
      } else {
        this.offset = 0
        this.partIndex = 0
      }
    }
    const current = this.buffers[this.partIndex]
    this.stopSource()
    const source = ctx.createBufferSource()
    source.buffer = current
    this.connectOutput(source, ctx, current)
    const startedPart = this.partIndex
    source.onended = () => {
      if (this.source !== source) return
      if (startedPart < this.buffers.length - 1) {
        this.partIndex = startedPart + 1
        this.offset = 0
        void this.play(this.prefixDuration(this.partIndex))
        return
      }
      this.playing = false
      this.offset = current.duration
      this.source = null
      this.endedHandlers.forEach(handler => handler(this.stationId))
      this.emit()
    }
    source.start(0, this.offset)
    this.source = source
    this.startedAt = ctx.currentTime
    this.playing = true
    this.emit()
  }

  pause(): void {
    if (!this.playing) {
      this.emit()
      return
    }
    const located = this.locate(this.getPosition())
    this.partIndex = located.index
    this.offset = located.local
    this.playing = false
    this.stopSource()
    this.emit()
  }

  stop(): void {
    this.playing = false
    this.partIndex = 0
    this.offset = 0
    this.stopSource()
    this.emit()
  }

  seek(time: number): void {
    const located = this.locate(Math.max(0, Math.min(time, this.totalDuration())))
    this.partIndex = located.index
    this.offset = located.local
    if (this.playing) {
      void this.play(this.prefixDuration(this.partIndex) + this.offset)
      return
    }
    this.emit()
  }

  setMeterOnly(value: boolean): void {
    this.meterOnly = value
    if (this.playing) {
      void this.play(this.getPosition())
      return
    }
    this.emit()
  }

  setFoldToStereo(value: boolean): void {
    this.foldToStereo = value
    if (this.playing) {
      void this.play(this.getPosition())
      return
    }
    this.emit()
  }

  setUploadProgress(progress: number, status?: string, kind: WebPlayerSnapshot['statusKind'] = 'idle'): void {
    this.uploadProgress = Math.max(0, Math.min(1, progress))
    const elapsed = performance.now() - this.uploadStartedAt
    this.uploadEtaSeconds =
      this.uploadProgress > 0.06 && elapsed > 400
        ? (elapsed / this.uploadProgress - elapsed) / 1000
        : null
    if (status) {
      this.setStatus(status, kind)
    }
    this.emit()
  }

  markUploadSaved(): void {
    this.uploadProgress = null
    this.uploadEtaSeconds = null
    this.setStatus('Loaded and saved on this computer.', 'ok')
    this.emit()
  }

  markUploadEphemeral(message: string): void {
    this.uploadProgress = null
    this.uploadEtaSeconds = null
    this.setStatus(message, 'warn')
    this.emit()
  }

  private beginUpload(): void {
    this.uploadStartedAt = performance.now()
    this.uploadProgress = 0.03
    this.uploadEtaSeconds = null
    this.setStatus('Uploading…')
    this.emit()
  }

  private clearUploadProgress(): void {
    this.uploadProgress = null
    this.uploadEtaSeconds = null
  }

  private async setBuffers(
    ctx: AudioContext,
    rawParts: ArrayBuffer[],
    fileNames: string[],
    key: string,
    expectedChannels?: number,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    const decoded: AudioBuffer[] = []
    try {
      for (let i = 0; i < rawParts.length; i += 1) {
        const slice = 1 / rawParts.length
        decoded.push(
          await decodeAudioPreserveChannels(ctx, rawParts[i], expectedChannels, progress => {
            onProgress?.(i * slice + progress * slice)
          }),
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setStatus(message, 'bad')
      this.clearUploadProgress()
      this.emit()
      throw error
    }
    this.buffers = decoded
    this.partIndex = 0
    this.loadedKey = key
    this.offset = 0
    const channels = decoded[0]?.numberOfChannels ?? 0
    const parts = decoded.length
    if (expectedChannels) {
      this.setStatus(
        parts > 1
          ? `Loaded ${parts} sequential ${channels}-channel files.`
          : `Loaded ${channels}-channel file.`,
        'ok',
      )
    } else if (channels === CHANNEL_METER_COUNT) {
      this.setStatus(`Loaded ${channels} independent channels.`, 'ok')
    } else if (channels > CHANNEL_METER_COUNT) {
      this.setStatus(`Loaded ${channels} channels. Meters show the first ${CHANNEL_METER_COUNT}.`, 'warn')
    } else {
      this.setStatus(`Loaded ${channels} channels.`, 'ok')
    }
    this.fileName = fileNames.join(' → ')
    this.emit()
  }

  private connectOutput(source: AudioBufferSourceNode, ctx: AudioContext, buffer: AudioBuffer): void {
    if (this.meterOnly) return

    const n = buffer.numberOfChannels
    if (this.foldToStereo && n > 2) {
      const splitter = ctx.createChannelSplitter(n)
      const left = ctx.createGain()
      const right = ctx.createGain()
      const gain = 1 / Math.sqrt(n)
      left.gain.value = gain
      right.gain.value = gain
      source.connect(splitter)
      for (let i = 0; i < n; i += 1) {
        splitter.connect(i % 2 === 0 ? left : right, i)
      }
      const merger = ctx.createChannelMerger(2)
      left.connect(merger, 0, 0)
      right.connect(merger, 0, 1)
      merger.connect(ctx.destination)
      this.graph = [splitter, left, right, merger]
      return
    }

    source.connect(ctx.destination)
  }

  private stopSource(): void {
    if (this.source) {
      this.source.onended = null
      try {
        this.source.stop()
      } catch {
        /* already stopped */
      }
      try {
        this.source.disconnect()
      } catch {
        /* already disconnected */
      }
      this.source = null
    }
    this.graph.forEach(node => {
      try {
        node.disconnect()
      } catch {
        /* already disconnected */
      }
    })
    this.graph = []
  }

  private setStatus(status: string, kind: WebPlayerSnapshot['statusKind'] = 'idle'): void {
    this.status = status
    this.statusKind = kind
  }

  private buildSnapshot(): WebPlayerSnapshot {
    const ctx = this.ctx
    return {
      playing: this.playing,
      position: this.offset,
      duration: this.totalDuration(),
      channels: this.buffers[this.partIndex]?.numberOfChannels ?? this.buffers[0]?.numberOfChannels ?? 0,
      sampleRate: this.buffers[this.partIndex]?.sampleRate ?? ctx?.sampleRate ?? 0,
      fileName: this.fileName,
      stationId: this.stationId,
      status: this.status,
      statusKind: this.statusKind,
      meterOnly: this.meterOnly,
      foldToStereo: this.foldToStereo,
      outputChannels: ctx?.destination.channelCount ?? 0,
      maxOutputChannels: ctx?.destination.maxChannelCount ?? 0,
      hasBuffer: this.buffers.length > 0,
      uploadProgress: this.uploadProgress,
      uploadEtaSeconds: this.uploadEtaSeconds,
      partIndex: this.partIndex,
      partCount: this.buffers.length,
    }
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot()
    this.handlers.forEach(handler => handler())
  }
}

export const webStationPlayer = new WebStationPlayer()
