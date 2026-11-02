/** Parse a PCM / WAVEFORMATEXTENSIBLE WAV so 28-channel files survive browsers that downmix decodeAudioData. */

export class WavFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WavFormatError'
  }
}

export class ChannelCountError extends Error {
  expected: number
  actual: number

  constructor(expected: number, actual: number) {
    const need =
      expected === 2
        ? 'stereo (2ch) binaural WAV'
        : `${expected}-channel WAV`
    super(`Upload failed: this file has ${actual} channel(s), not ${expected}. Please upload a ${need}.`)
    this.name = 'ChannelCountError'
    this.expected = expected
    this.actual = actual
  }
}

export interface WavInfo {
  channels: number
  sampleRate: number
  bitsPerSample: number
  float: boolean
  dataOffset: number
  dataBytes: number
  frames: number
  blockAlign: number
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

function findChunk(view: DataView, id: string, from: number, end: number): { offset: number; size: number } | null {
  let offset = from
  while (offset + 8 <= end) {
    const name = readFourCC(view, offset)
    const size = view.getUint32(offset + 4, true)
    if (name === id) {
      return { offset: offset + 8, size }
    }
    offset += 8 + size + (size % 2)
  }
  return null
}

export function parseWav(buffer: ArrayBuffer): WavInfo {
  if (buffer.byteLength < 12) {
    throw new WavFormatError('File is too small to be a WAV.')
  }
  const view = new DataView(buffer)
  if (readFourCC(view, 0) !== 'RIFF' && readFourCC(view, 0) !== 'RF64') {
    throw new WavFormatError('Not a WAV file. Please upload a .wav.')
  }
  if (readFourCC(view, 8) !== 'WAVE') {
    throw new WavFormatError('Not a WAV file. Please upload a .wav.')
  }

  const fmt = findChunk(view, 'fmt ', 12, buffer.byteLength)
  const data = findChunk(view, 'data', 12, buffer.byteLength)
  if (!fmt || !data) {
    throw new WavFormatError('WAV is missing fmt or data chunks.')
  }

  const formatTag = view.getUint16(fmt.offset, true)
  const channels = view.getUint16(fmt.offset + 2, true)
  const sampleRate = view.getUint32(fmt.offset + 4, true)
  const blockAlign = view.getUint16(fmt.offset + 12, true)
  let bitsPerSample = view.getUint16(fmt.offset + 14, true)
  let float = formatTag === 3

  if (formatTag === 0xfffe && fmt.size >= 40) {
    bitsPerSample = view.getUint16(fmt.offset + 18, true) || bitsPerSample
    const subFormat = view.getUint16(fmt.offset + 24, true)
    float = subFormat === 3
  } else if (formatTag !== 1 && formatTag !== 3) {
    throw new WavFormatError('Only PCM or float WAV files are supported.')
  }

  if (channels < 1 || sampleRate < 1 || bitsPerSample < 8) {
    throw new WavFormatError('WAV header is invalid.')
  }

  if (data.size === 0xffffffff) {
    throw new WavFormatError('RF64 / huge WAV is not supported. Please export a standard WAV.')
  }

  const bytesPerSample = Math.ceil(bitsPerSample / 8)
  const aligned = blockAlign || channels * bytesPerSample
  const frames = Math.floor(data.size / aligned)

  return {
    channels,
    sampleRate,
    bitsPerSample,
    float,
    dataOffset: data.offset,
    dataBytes: data.size,
    frames,
    blockAlign: aligned,
  }
}

function readSample(view: DataView, offset: number, bits: number, float: boolean): number {
  if (float) {
    return view.getFloat32(offset, true)
  }
  if (bits <= 8) {
    return (view.getUint8(offset) - 128) / 128
  }
  if (bits <= 16) {
    return view.getInt16(offset, true) / 32768
  }
  if (bits <= 24) {
    const b0 = view.getUint8(offset)
    const b1 = view.getUint8(offset + 1)
    const b2 = view.getUint8(offset + 2)
    let value = (b2 << 16) | (b1 << 8) | b0
    if (value & 0x800000) value |= ~0xffffff
    return value / 8388608
  }
  return view.getInt32(offset, true) / 2147483648
}

function yieldToUi(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })
}

export async function wavToAudioBuffer(
  ctx: BaseAudioContext,
  buffer: ArrayBuffer,
  info = parseWav(buffer),
  onProgress?: (progress: number) => void,
): Promise<AudioBuffer> {
  const audio = ctx.createBuffer(info.channels, Math.max(1, info.frames), info.sampleRate)
  const view = new DataView(buffer)
  const bytesPerSample =
    Math.round(info.blockAlign / info.channels) || Math.ceil(info.bitsPerSample / 8)
  const bits = bytesPerSample * 8
  const total = Math.max(1, info.channels * info.frames)
  let lastYield = performance.now()

  for (let ch = 0; ch < info.channels; ch += 1) {
    const dest = audio.getChannelData(ch)
    for (let i = 0; i < info.frames; i += 1) {
      dest[i] = readSample(
        view,
        info.dataOffset + i * info.blockAlign + ch * bytesPerSample,
        bits,
        info.float && bytesPerSample === 4,
      )
      if (i > 0 && i % 4096 === 0 && performance.now() - lastYield > 45) {
        onProgress?.((ch * info.frames + i) / total)
        await yieldToUi()
        lastYield = performance.now()
      }
    }
  }
  onProgress?.(1)
  return audio
}
