import { useEffect, useRef, useState } from 'react'
import { CHANNEL_METER_COUNT, ch28PartCount } from '../data/webAudio'
import { BRIDGE_SECTIONS, type BridgeSection } from '../services/reaperBridge'
import { usePlaybackMode } from '../context/PlaybackModeProvider'
import { webStationPlayer } from '../services/webStationPlayer'
import PlayPauseIcon from './PlayPauseIcon'

interface ChannelMonitorProps {
  activeSection: BridgeSection
}

function formatPrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.000'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

const CHANNEL_LABELS = Array.from(
  { length: CHANNEL_METER_COUNT },
  (_, i) => `CH${String(i + 1).padStart(2, '0')}`,
)

export default function ChannelMonitor({ activeSection }: ChannelMonitorProps) {
  const { mode, monitorOpen, setMonitorOpen, assignFile, assignedFiles, filesForSection } = usePlaybackMode()
  const [assignTo, setAssignTo] = useState<BridgeSection>(activeSection)
  const [dragging, setDragging] = useState<number | false>(false)
  const [busy, setBusy] = useState(false)
  const [uploadingPart, setUploadingPart] = useState<number | null>(null)
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const fillsRef = useRef<(HTMLDivElement | null)[]>([])
  const dbsRef = useRef<(HTMLSpanElement | null)[]>([])
  const timeRef = useRef<HTMLDivElement>(null)
  const seekRef = useRef<HTMLInputElement>(null)
  const seekingRef = useRef(false)
  const fileNameRef = useRef<HTMLElement>(null)
  const channelsRef = useRef<HTMLElement>(null)
  const sampleRateRef = useRef<HTMLElement>(null)
  const durationRef = useRef<HTMLElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setAssignTo(activeSection)
  }, [activeSection])

  useEffect(() => webStationPlayer.onChange(() => setTick(n => n + 1)), [])

  useEffect(() => {
    if (!monitorOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMonitorOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [monitorOpen, setMonitorOpen])

  useEffect(() => {
    if (!monitorOpen) return undefined
    let raf = 0
    const paint = () => {
      const snap = webStationPlayer.getSnapshot()
      const position = webStationPlayer.getPosition()
      const meters = webStationPlayer.analyzeMeters(position)

      if (fileNameRef.current) fileNameRef.current.textContent = snap.fileName || '—'
      if (channelsRef.current) channelsRef.current.textContent = snap.channels ? String(snap.channels) : '—'
      if (sampleRateRef.current) {
        sampleRateRef.current.textContent = snap.sampleRate ? `${snap.sampleRate} Hz` : '—'
      }
      if (durationRef.current) {
        durationRef.current.textContent = snap.duration ? formatPrecise(snap.duration) : '—'
      }
      if (timeRef.current) {
        timeRef.current.textContent = `${formatPrecise(position)} / ${formatPrecise(snap.duration)}`
      }
      if (seekRef.current && !seekingRef.current) {
        seekRef.current.max = String(Math.max(snap.duration, 1))
        seekRef.current.value = String(position)
        seekRef.current.disabled = !snap.hasBuffer
      }
      if (statusRef.current) {
        statusRef.current.textContent = snap.status
        statusRef.current.className = `ch28-status ch28-status--${snap.statusKind}`
      }

      meters.forEach((meter, index) => {
        const fill = fillsRef.current[index]
        const db = dbsRef.current[index]
        if (!fill || !db) return
        if (snap.channels > 0 && index >= snap.channels) {
          fill.style.width = '0%'
          db.textContent = 'N/A'
          return
        }
        if (!Number.isFinite(meter.rmsDb) || meter.rmsDb <= -79.9) {
          fill.style.width = '0%'
          db.textContent = '-∞ dBFS'
          return
        }
        const normalized = Math.max(0, Math.min(1, (meter.rmsDb + 60) / 60))
        fill.style.width = `${normalized * 100}%`
        db.textContent = `${meter.rmsDb.toFixed(1)} dBFS`
      })
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [monitorOpen, tick])

  if (!monitorOpen) {
    return null
  }

  const expectedChannels = mode === 'binaural' ? 2 : CHANNEL_METER_COUNT
  const snap = webStationPlayer.getSnapshot()
  const partCount = mode === 'ch28' ? ch28PartCount(assignTo) : 1
  const assignedParts = filesForSection(assignTo)
  const assignedName = assignedFiles[assignTo]?.name
  const assignedNameB = mode === 'ch28' ? assignedParts[1]?.name : undefined
  const splitElectric = partCount > 1
  const uploadRatio = snap.uploadProgress
  const showUploadBar = busy || uploadRatio != null
  const uploadPct = Math.round((uploadRatio ?? (busy ? 0.03 : 0)) * 100)
  const uploadEta = snap.uploadEtaSeconds
  const uploadWait =
    uploadEta == null
      ? 'Working…'
      : uploadEta < 1.5
        ? 'Almost done'
        : `About ${Math.ceil(uploadEta)}s left`

  const loadFile = async (file: File, partIndex = 0) => {
    setBusy(true)
    setUploadingPart(partIndex)
    try {
      await webStationPlayer.loadFromFile(file, assignTo, expectedChannels, true)
      await assignFile(assignTo, file, partIndex)
    } catch {
      /* status is set on the player; do not keep a rejected file */
    } finally {
      setBusy(false)
      setUploadingPart(null)
    }
  }

  return (
    <div className="ch28-overlay" role="dialog" aria-modal="true" aria-labelledby="ch28-title">
      <div className="ch28-panel">
        <header className="ch28-panel__head">
          <div>
            <p className="ch28-kicker">Meters · {mode === 'binaural' ? 'BINAURAL' : '28CH'}</p>
            <h2 id="ch28-title">{mode === 'binaural' ? 'Binaural monitor' : '28-channel monitor'}</h2>
          </div>
          <button type="button" className="ch28-close" onClick={() => setMonitorOpen(false)}>
            Close
          </button>
        </header>

        <p className="ch28-sub">
          {mode === 'binaural'
            ? 'Drop a stereo (2-channel) binaural WAV per station. Files that are not 2ch will be rejected. Uploads are saved on this computer.'
            : splitElectric
              ? 'Electric is split into two 28-channel WAVs. Upload Part 1 and Part 2; they play one after the other. Files that are not 28ch will be rejected.'
              : 'Drop a 28-channel WAV per station. Files that are not 28ch will be rejected. Uploads are saved on this computer. You can also place STN_*.wav in /public/audio/28ch/.'}
        </p>

        <div className="ch28-toolbar">
          <label className="ch28-assign">
            <span>Assign to station</span>
            <select
              value={assignTo}
              onChange={event => setAssignTo(event.target.value as BridgeSection)}
            >
              {BRIDGE_SECTIONS.map(section => (
                <option key={section} value={section}>
                  {section === 'modern-electronic' ? 'modern-electronic (Electric, 2 parts)' : section}
                </option>
              ))}
            </select>
          </label>
          {(assignedName || assignedNameB) && (
            <span className="ch28-assigned">
              {splitElectric
                ? `Saved: ${assignedName ?? 'Part 1 missing'} → ${assignedNameB ?? 'Part 2 missing'}`
                : `Saved on this computer: ${assignedName}`}
            </span>
          )}
        </div>

        <div className={splitElectric ? 'ch28-drops' : undefined}>
          {Array.from({ length: partCount }, (_, partIndex) => (
            <button
              key={`${assignTo}-${partIndex}`}
              type="button"
              className={dragging === partIndex ? 'ch28-drop ch28-drop--drag' : 'ch28-drop'}
              disabled={busy}
              onClick={() => fileInputRefs.current[partIndex]?.click()}
              onDragOver={event => {
                event.preventDefault()
                setDragging(partIndex)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={event => {
                event.preventDefault()
                setDragging(false)
                const file = event.dataTransfer.files[0]
                if (file) void loadFile(file, partIndex)
              }}
            >
              {splitElectric && (
                <em className="ch28-drop__part">Electric part {partIndex + 1}</em>
              )}
              <strong>
                {busy && uploadingPart === partIndex
                  ? `Uploading… ${uploadPct}%`
                  : mode === 'binaural'
                    ? 'Drop a stereo binaural WAV here'
                    : `Drop 28-channel WAV${splitElectric ? ` for part ${partIndex + 1}` : ''} here`}
              </strong>
              <span>
                {busy && uploadingPart === partIndex
                  ? `${uploadWait} — large files can take a while`
                  : assignedParts[partIndex]
                    ? assignedParts[partIndex].name
                    : 'or click to choose a file'}
              </span>
              {showUploadBar && uploadingPart === partIndex && (
                <div className="ch28-progress ch28-progress--in-drop">
                  <div className="ch28-progress__track">
                    <div className="ch28-progress__fill" style={{ width: `${uploadPct}%` }} />
                  </div>
                </div>
              )}
              <input
                ref={node => {
                  fileInputRefs.current[partIndex] = node
                }}
                type="file"
                accept="audio/*,.wav"
                hidden
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (file) void loadFile(file, partIndex)
                  event.target.value = ''
                }}
              />
            </button>
          ))}
        </div>

        <div className="ch28-meta">
          <div>
            <span>File</span>
            <b ref={fileNameRef}>—</b>
          </div>
          <div>
            <span>Channels detected</span>
            <b ref={channelsRef}>—</b>
          </div>
          <div>
            <span>Sample rate</span>
            <b ref={sampleRateRef}>—</b>
          </div>
          <div>
            <span>Duration</span>
            <b ref={durationRef}>—</b>
          </div>
        </div>
        <div ref={statusRef} className="ch28-status">
          Waiting for a {mode === 'binaural' ? 'stereo (2ch)' : '28-channel'} file.
        </div>

        <div className="ch28-controls">
          <button
            type="button"
            className="ch28-play"
            disabled={!snap.hasBuffer || busy}
            aria-label={snap.playing ? 'Pause' : 'Play'}
            onClick={async () => {
              if (snap.playing) {
                webStationPlayer.pause()
                return
              }
              if (assignedParts.length > 1 && !webStationPlayer.isPlaylistLoaded(assignTo, assignedParts)) {
                await webStationPlayer.loadFromFiles(assignedParts, assignTo, expectedChannels)
              }
              void webStationPlayer.play()
            }}
          >
            <PlayPauseIcon playing={snap.playing} />
            <span>{snap.playing ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            className="ch28-btn-secondary"
            disabled={!snap.hasBuffer}
            onClick={() => webStationPlayer.stop()}
          >
            Stop
          </button>
          <input
            ref={seekRef}
            type="range"
            min={0}
            max={1}
            step={0.001}
            defaultValue={0}
            disabled={!snap.hasBuffer}
            onPointerDown={() => {
              seekingRef.current = true
            }}
            onPointerUp={event => {
              seekingRef.current = false
              webStationPlayer.seek(Number(event.currentTarget.value))
            }}
            onChange={event => {
              if (timeRef.current) {
                timeRef.current.textContent = `${formatPrecise(Number(event.target.value))} / ${formatPrecise(snap.duration)}`
              }
            }}
          />
          <div ref={timeRef} className="ch28-time">
            00:00.000 / 00:00.000
          </div>
        </div>

        <div className="ch28-toggles">
          <label>
            <input
              type="checkbox"
              checked={snap.foldToStereo}
              onChange={event => webStationPlayer.setFoldToStereo(event.target.checked)}
            />
            Fold to stereo on this device
          </label>
          <label>
            <input
              type="checkbox"
              checked={snap.meterOnly}
              onChange={event => webStationPlayer.setMeterOnly(event.target.checked)}
            />
            Meters only (silent)
          </label>
          <span className="ch28-hw">
            Hardware out {snap.outputChannels || '—'} / max {snap.maxOutputChannels || '—'}
          </span>
        </div>

        <div className="ch28-meters">
          {CHANNEL_LABELS.map((label, index) => (
            <div key={label} className="ch28-meter-row">
              <div className="ch28-meter-label">{label}</div>
              <div className="ch28-bar">
                <div
                  className="ch28-fill"
                  ref={node => {
                    fillsRef.current[index] = node
                  }}
                />
              </div>
              <span
                className="ch28-db"
                ref={node => {
                  dbsRef.current[index] = node
                }}
              >
                -∞ dBFS
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
