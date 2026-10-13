import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Lightbox from '../components/Lightbox'
import TrackedVideo from '../components/TrackedVideo'
import { asset, detectLiveFrame, getMode, loadCameras, loadTracks, loadVehicles, resolveStream, searchPhoto, searchText, transcribe, vehicleTitle, type Camera, type Det, type LiveDetection, type PhotoHit, type PhotoQuery, type SearchHit, type Tracks, type Vehicle } from '../data'
import IncidentDossier from '../components/IncidentDossier'
import TacticalDispatchModal from '../components/TacticalDispatchModal'
import GridCopilotDrawer from '../components/GridCopilotDrawer'
import FollowCam from './FollowCam'
import LiveFollowCam from './LiveFollowCam'
import VancouverMap from './VancouverMap'
import CesiumGlobe from './CesiumGlobe'
import { CORRIDORS } from './corridors'
import { VoiceTelemetryAgent } from './voiceAgent'
import { computeInterceptionPrediction, type InterceptionPrediction } from './interception'
import { tacticalAudio } from './tacticalAudio'
import type { CopilotAction } from './gridCopilot'

const FULL = 'calc(100vh - 73px)'

/** Only re-render the dashboard when the set of vehicles in frame changes, not on every video frame. */
const sameIds = (a: Det[], b: Det[]) => a.length === b.length && a.every((d, i) => d[0] === b[i][0])

export default function Live({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({})
  const [camId, setCamId] = useState<string>()
  const [startAt, setStartAt] = useState<number>()
  const [tracks, setTracks] = useState<Tracks | null>(null)
  const [dets, setDets] = useState<Det[]>([])
  const [gid, setGid] = useState<string>()
  const [hits, setHits] = useState<(SearchHit | PhotoHit)[] | null>(null)
  const [photoQ, setPhotoQ] = useState<PhotoQuery | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoErr, setPhotoErr] = useState('')
  const [drag, setDrag] = useState(false)
  const [zoom, setZoom] = useState<{ src: string; caption: string } | null>(null)
  const [dossierVehicle, setDossierVehicle] = useState<Vehicle | null>(null)
  const [cordonActive, setCordonActive] = useState(false)
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)

  // Left Panel Adjustable Width & Responsive Collapse
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('retrace_panel_width')
      if (saved) {
        const val = parseInt(saved, 10)
        if (!isNaN(val) && val >= 320 && val <= 850) return val
      }
    } catch {}
    return 540
  })
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const onMouseMove = (e: MouseEvent) => {
      const minW = 340
      const maxW = Math.min(window.innerWidth - 360, 850)
      const clamped = Math.max(minW, Math.min(maxW, e.clientX))
      setPanelWidth(clamped)
      if (isPanelCollapsed) setIsPanelCollapsed(false)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      try {
        localStorage.setItem('retrace_panel_width', panelWidth.toString())
      } catch {}
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, panelWidth, isPanelCollapsed])

  // 3D Spatial & Tactical HUD Controls (God's Eye View mode)
  const [mapMode, setMapMode] = useState<'3d' | '2d'>('3d')
  const [opticMode, setOpticMode] = useState<'normal' | 'flir' | 'nvg' | 'crt'>('normal')
  const [showCones, setShowCones] = useState(true)
  const [showProjectionPlane, setShowProjectionPlane] = useState(true)
  const [activeVideo, setActiveVideo] = useState<HTMLVideoElement | null>(null)

  // Regional Corridors: Vancouver Metro (trained) vs. Lucknow Smart City Grid (attempted sourcing)
  const [activeCorridorId, setActiveCorridorId] = useState<'vancouver' | 'lucknow'>('vancouver')
  const [vancouverCams, setVancouverCams] = useState<Camera[]>([])
  // Dynamic pins dropped when a pasted stream auto-geocodes to a place with no existing corridor
  const [dynamicCams, setDynamicCams] = useState<Camera[]>([])
  const [dynamicCenter, setDynamicCenter] = useState<{ lon: number; lat: number; height: number } | null>(null)

  // Custom Live Stream Ingest (HLS / RTSP / MP4 / IP Camera / YouTube)
  const [customFeedModal, setCustomFeedModal] = useState(false)
  const [customStreamUrl, setCustomStreamUrl] = useState('')
  const [customFeeds, setCustomFeeds] = useState<Record<string, string>>({})
  const [resolvingStream, setResolvingStream] = useState(false)
  const [streamResolveErr, setStreamResolveErr] = useState('')

  // Real-Time YOLOv8n Live Detector State for External Feeds
  const [liveDetections, setLiveDetections] = useState<LiveDetection[]>([])
  const [isLiveDetecting, setIsLiveDetecting] = useState(false)
  const [liveDetectorFps, setLiveDetectorFps] = useState<number>(0)
  const [liveVehicle, setLiveVehicle] = useState<Vehicle | null>(null)
  const lastInferTime = useRef(0)

  // Voice Telemetry Agent State
  const [isVoiceListening, setIsVoiceListening] = useState(false)
  const voiceAgentRef = useRef<VoiceTelemetryAgent | null>(null)

  useEffect(() => {
    Promise.all([loadCameras(), loadVehicles()]).then(([c, v]) => {
      setVancouverCams(c)
      setCameras(c)
      setVehicles(v)
    })
  }, [])

  // Switch Corridors: Vancouver vs. Lucknow (dynamic pins are kept on top of both)
  const switchCorridor = (id: 'vancouver' | 'lucknow', targetCamId?: string) => {
    setActiveCorridorId(id)
    setGid(undefined)
    setDynamicCenter(null)
    const newCams = id === 'lucknow' ? CORRIDORS.lucknow.cameras : vancouverCams
    setCameras([...newCams, ...dynamicCams])
    setCamId(targetCamId || undefined)
  }

  // Voice Telemetry Agent Setup
  useEffect(() => {
    const agent = new VoiceTelemetryAgent((res) => {
      console.log('[Live VoiceTelemetry]', res)
      if (res.action === 'set_optic' && res.target) {
        setOpticMode(res.target as any)
      } else if (res.action === 'select_camera' && res.target) {
        const found = cameras.find((c) =>
          c.id.toLowerCase().includes(res.target!.toLowerCase()) ||
          c.name.toLowerCase().includes(res.target!.toLowerCase())
        )
        if (found) open(found.id)
      } else if (res.action === 'search_vehicle' && res.target) {
        searchText(res.target).then((results) => {
          setHits(results)
          setPhotoQ(null)
        })
      }
    })
    voiceAgentRef.current = agent
    return () => agent.stop()
  }, [cameras])

  const toggleVoice = () => {
    if (voiceAgentRef.current) {
      const active = voiceAgentRef.current.toggle()
      setIsVoiceListening(active)
    }
  }

  const activeCorridor = CORRIDORS[activeCorridorId]
  // When a stream auto-geocodes off-grid, fly there instead of the active corridor's center
  const globeCenter = dynamicCenter || activeCorridor.center
  const cam = cameras.find((c) => c.id === camId)
  const isCustomFeed = Boolean(cam && customFeeds[cam.id])

  useEffect(() => {
    setTracks(null)
    setLiveDetections([])
    setLiveVehicle(null)
    if (cam && !customFeeds[cam.id]) {
      loadTracks(cam).then(setTracks)
    }
  }, [cam, customFeeds])

  const vehicle = gid ? (isCustomFeed && liveVehicle?.gid === gid ? liveVehicle : vehicles[gid]) : undefined
  const selectedTrack = gid && cam && gid.startsWith(cam.id + ':') ? Number(gid.split(':')[1]) : undefined
  const journey = vehicle?.journey && vehicle.journey.length > 1 ? vehicle.journey : []
  const trail = journey.map((s) => s.cam)
  const focus = trail.length ? trail : cam ? [cam.id] : []
  const camName = (id: string) => cameras.find((c) => c.id === id)?.name ?? id

  const handleLiveFrameCapture = useCallback(async (dataUrl: string) => {
    if (!cam || !customFeeds[cam.id]) return
    const now = Date.now()
    if (now - lastInferTime.current < 280) return
    lastInferTime.current = now

    try {
      setIsLiveDetecting(true)
      const t0 = performance.now()
      const res = await detectLiveFrame(dataUrl, cam.id, cam.name || 'Live Stream')
      const inferMs = performance.now() - t0
      setLiveDetectorFps(Math.round(1000 / Math.max(inferMs, 80)))
      if (res && res.detections) {
        setLiveDetections(res.detections)
        setDets(res.detections.map((d) => [d.id, d.box[0], d.box[1], d.box[2], d.box[3], d.conf, 2] as Det))
      }
    } catch (err) {
      // Backend detection busy or offline
    } finally {
      setIsLiveDetecting(false)
    }
  }, [cam, customFeeds])

  const handleVehiclePick = (tid: number) => {
    if (!cam) return
    if (customFeeds[cam.id]) {
      const found = liveDetections.find((d) => d.id === tid)
      if (found) {
        const mockGid = `${cam.id}:${tid}`
        let cropUrl = ''
        if (activeVideo && activeVideo.videoWidth > 0) {
          try {
            const cropCanvas = document.createElement('canvas')
            const [nx1, ny1, nx2, ny2] = found.norm_box
            const vw = activeVideo.videoWidth
            const vh = activeVideo.videoHeight
            const bx = nx1 * vw
            const by = ny1 * vh
            const bw = Math.max(15, (nx2 - nx1) * vw)
            const bh = Math.max(15, (ny2 - ny1) * vh)
            cropCanvas.width = 240
            cropCanvas.height = 160
            const cCtx = cropCanvas.getContext('2d')
            if (cCtx) {
              cCtx.drawImage(activeVideo, bx, by, bw, bh, 0, 0, 240, 160)
              cropUrl = cropCanvas.toDataURL('image/jpeg', 0.8)
            }
          } catch {}
        }

        const newV: Vehicle = {
          gid: mockGid,
          color: found.color || 'identified',
          body: found.cls || 'vehicle',
          speed: found.speed || 38,
          heading: found.heading || 'SOUTH-BOUND',
          crop: cropUrl,
          crop_thumb: cropUrl,
          sightings: [{ cam: cam.id, track: tid, t: 0, crop: cropUrl, sim: 1.0 }],
          top5: [{ name: found.label, p: found.conf }],
          journey: [{ cam: cam.id, track: tid, t: 0, crop: cropUrl, sim: 1.0 }],
          reliable: true,
        }
        setLiveVehicle(newV)
        setGid(mockGid)
        tacticalAudio.playTargetLock()
        return
      }
    }
    setGid(`${cam.id}:${tid}`)
  }

  const interception = useMemo(
    () => (vehicle ? computeInterceptionPrediction(vehicle, cameras, camId) : null),
    [vehicle, cameras, camId]
  )

  const toggleCordon = (active?: boolean) => {
    const next = active !== undefined ? active : !cordonActive
    setCordonActive(next)
    if (next) {
      tacticalAudio.playCordonAlert()
    } else {
      tacticalAudio.playRadioChirp()
    }
  }

  /** Open a camera; with a vehicle, start the feed just before that vehicle is in view. */
  const open = (cameraId: string, g?: string) => {
    const t = g ? vehicles[g]?.sightings[0]?.t : undefined
    setStartAt(t !== undefined ? Math.max(0, t - 1) : undefined)
    setCamId(cameraId)
    setGid(g)
  }
  const close = () => { setCamId(undefined); setGid(undefined) }

  const handleCopilotAction = (action: CopilotAction) => {
    if (action.type === 'SELECT_CAMERA' && action.camera_id) {
      open(action.camera_id)
    } else if (action.type === 'SELECT_VEHICLE' && action.camera_id) {
      open(action.camera_id, action.target_id)
      tacticalAudio.playTargetLock()
    } else if (action.type === 'DEPLOY_ROADBLOCK') {
      toggleCordon(true)
    } else if (action.type === 'RADIO_CALL') {
      setDispatchModalOpen(true)
    }
  }

  /** Search by an uploaded photo or clip: the backend finds the car in it and ranks every indexed vehicle. */
  const searchFile = async (f: File) => {
    if (!/^(image|video)\//.test(f.type) && !/\.(jpe?g|png|webp|mp4|mov|m4v|webm)$/i.test(f.name)) { setPhotoErr('Use a photo (JPG, PNG, WebP) or a video clip.'); return }
    setPhotoErr('')
    setPhotoBusy(true)
    try {
      const r = await searchPhoto(f)
      setPhotoQ(r.query)
      setHits(r.results)
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : String(e))
    } finally {
      setPhotoBusy(false)
    }
  }

  return (
    <main style={{ display: 'flex', flexWrap: 'nowrap', height: FULL, maxHeight: FULL, overflow: 'hidden' }}>
      {/* 1. Left Inspection Panel (Adjustable & Collapsible) */}
      {!isPanelCollapsed && (
        !cam ? (
          <aside
            style={{
              flex: `0 0 ${panelWidth}px`,
              width: panelWidth,
              minWidth: 320,
              maxWidth: '65vw',
              height: FULL,
              overflowY: 'auto',
              background: 'var(--panel)',
              padding: '20px 22px',
              borderRight: 'var(--neu-border)',
              boxShadow: 'var(--neu-shadow-raised-sm)',
              zIndex: 10,
              transition: isResizing ? 'none' : 'width 0.12s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="label" style={{ color: 'var(--teal)', fontWeight: 700 }}>Autonomous Surveillance Grid</div>
              <button
                className="btn mono"
                onClick={() => setIsPanelCollapsed(true)}
                title="Collapse panel to maximize map (◀)"
                style={{ padding: '3px 9px', fontSize: 10, minHeight: 24, fontWeight: 700, color: 'var(--dim)' }}
              >
                ◀ COLLAPSE
              </button>
            </div>
            <h2 style={{ fontSize: 26, letterSpacing: -0.6, margin: '4px 0 6px', fontWeight: 800 }}>Pick a Camera</h2>
            <p style={{ color: 'var(--muted)', lineHeight: 1.5, fontSize: 13, margin: '0 0 16px' }}>
              Every feed runs real-time vehicle detection, deep trajectory re-identification, and viewshed tracking. Click any node to inspect live optical stream.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cameras.map((c) => (
                <button
                  key={c.id}
                  className="btn"
                  onClick={() => open(c.id)}
                  style={{
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700 }}>CAM-{c.id}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                  </div>
                  <span className="chip" style={{ fontSize: 9 }}>{c.condition.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </aside>
        ) : (
          <section
            style={{
              flex: `0 0 ${panelWidth}px`,
              width: panelWidth,
              minWidth: 320,
              maxWidth: '65vw',
              height: FULL,
              overflowY: 'auto',
              background: 'var(--panel)',
              padding: '14px 18px 28px',
              borderRight: 'var(--neu-border)',
              boxShadow: 'var(--neu-shadow-raised-sm)',
              zIndex: 10,
              transition: isResizing ? 'none' : 'width 0.12s ease',
            }}
          >
            {/* Header Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--line-2)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="label" style={{ color: 'var(--teal)', fontSize: 10, fontWeight: 700 }}>
                    FEED INSPECTOR · {cam.id.toUpperCase()}
                  </span>
                  <span className="chip" style={{ fontSize: 9, padding: '2px 6px', color: 'var(--teal)', borderColor: 'rgba(94, 234, 212, 0.3)' }}>
                    {cam.condition.toUpperCase()}
                  </span>
                  <span className="chip" style={{ fontSize: 9, padding: '2px 6px' }}>
                    {cam.res}
                  </span>
                </div>
                <h2 style={{ fontSize: 22, letterSpacing: -0.5, margin: '4px 0 2px', fontWeight: 800 }}>
                  {cam.name}
                </h2>
                <div className="mono" style={{ fontSize: 11, color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Source: {cam.source}</span>
                  <span>·</span>
                  <span style={{ color: 'var(--muted)' }}>{cam.view}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="btn mono"
                  onClick={() => setIsPanelCollapsed(true)}
                  title="Collapse panel (◀)"
                  style={{ minHeight: 30, padding: '3px 9px', fontSize: 11, fontWeight: 700, color: 'var(--dim)' }}
                >
                  ◀
                </button>
                <button
                  className="btn mono"
                  aria-label="Close camera"
                  onClick={close}
                  style={{ minHeight: 30, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}
                >
                  ✕ CLOSE
                </button>
              </div>
            </div>

            {vehicle && <TrackingBar v={vehicle} current={cam.id} camName={camName} onStep={open} onStop={() => setGid(undefined)} />}

            {/* Dual Monitor Video Rack (Responsive Stack / Columns) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: panelWidth < 520 ? '1fr' : 'minmax(0, 1.4fr) minmax(200px, 1fr)',
                gap: 12,
                marginTop: 12,
                alignItems: 'stretch',
              }}
            >
              {/* Primary Optical Feed Monitor */}
              <div className="neu-card" style={{ borderRadius: 12, overflow: 'hidden', padding: 3, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--panel-2)', borderBottom: '1px solid var(--line-2)', borderRadius: '9px 9px 0 0' }}>
                  <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="blink" style={{ width: 6, height: 6, borderRadius: '50%', background: isCustomFeed ? '#10b981' : 'var(--rose)' }} />
                    {isCustomFeed ? 'EXTERNAL LIVE FEED // REAL-TIME INGEST' : 'MAIN CCTV CAMERA // WIDE-ANGLE'}
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: isCustomFeed ? '#10b981' : 'var(--dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isCustomFeed && (
                      <span className="chip" style={{ fontSize: 8, padding: '1px 5px', color: isLiveDetecting ? 'var(--amber)' : '#10b981', borderColor: 'currentColor' }}>
                        {isLiveDetecting ? '● INFERENCING' : `⚡ YOLOv8n ${liveDetectorFps || 10} FPS`}
                      </span>
                    )}
                    <span>{isCustomFeed ? 'EXT-SENSOR' : 'SYS-CAM'} · {dets.length} ACTIVE</span>
                  </div>
                </div>
                <div style={{ position: 'relative', flex: 1, minHeight: panelWidth < 520 ? 190 : 160, overflow: 'hidden', borderRadius: '0 0 9px 9px' }}>
                  <TrackedVideo
                    key={cam.id + (startAt ?? '') + (isCustomFeed ? '-custom' : '')}
                    src={customFeeds[cam.id] || asset(cam.clip)}
                    poster={asset(cam.poster)}
                    tracks={isCustomFeed ? null : tracks}
                    liveDetections={isCustomFeed ? liveDetections : null}
                    isLive={isCustomFeed}
                    onCaptureFrame={handleLiveFrameCapture}
                    startAt={startAt}
                    fullscreen
                    highlight={selectedTrack}
                    othersOpacity={selectedTrack !== undefined ? 0.45 : 1}
                    labelFor={(tid) => {
                      if (isCustomFeed) {
                        const d = liveDetections.find((x) => x.id === tid)
                        return d ? `${d.label} ${d.speed ? `(${d.speed} km/h)` : ''}` : undefined
                      }
                      const v = vehicles[`${cam.id}:${tid}`]
                      return v ? vehicleTitle(v) : undefined
                    }}
                    onFrame={(_, d) => {
                      if (!isCustomFeed) {
                        setDets((prev) => (sameIds(prev, d) ? prev : d))
                      }
                    }}
                    onPick={handleVehiclePick}
                    onVideoReady={(vid) => setActiveVideo(vid)}
                  />
                </div>
              </div>

              {/* Target Telephoto Magnification / Follow Cam */}
              <div className="neu-card" style={{ borderRadius: 12, overflow: 'hidden', padding: 3, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--panel-2)', borderBottom: '1px solid var(--line-2)', borderRadius: '9px 9px 0 0' }}>
                  <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: selectedTrack !== undefined ? 'var(--amber)' : 'var(--dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🎯</span>
                    {selectedTrack !== undefined ? `TARGET LOCK #${selectedTrack}` : 'TELEPHOTO ZOOM'}
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>
                    {selectedTrack !== undefined ? 'AUTO-TRACKING' : 'STANDBY'}
                  </div>
                </div>
                <div style={{ flex: 1, minHeight: panelWidth < 520 ? 170 : 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isCustomFeed && selectedTrack !== undefined ? (
                    <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: '0 0 9px 9px' }}>
                      <LiveFollowCam
                        video={activeVideo}
                        target={liveDetections.find((d) => d.id === selectedTrack)}
                      />
                    </div>
                  ) : tracks && selectedTrack !== undefined ? (
                    <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: '0 0 9px 9px' }}>
                      <FollowCam key={gid} src={customFeeds[cam.id] || asset(cam.clip)} tracks={tracks} track={selectedTrack} />
                    </div>
                  ) : (
                    <div className="neu-inset" style={{ width: '100%', height: '100%', minHeight: 160, borderRadius: '0 0 9px 9px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 14, color: 'var(--dim)', fontSize: 11, lineHeight: 1.45 }}>
                      <span style={{ fontSize: 20, marginBottom: 6, opacity: 0.6 }}>🎯</span>
                      <span>Select vehicle box on live stream<br />to lock high-speed follow-cam.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {vehicle && (
              <VehicleDetail
                v={vehicle}
                prediction={interception}
                cordonActive={cordonActive}
                camName={camName}
                onJump={open}
                onZoom={(src, caption) => setZoom({ src, caption })}
                onBack={() => setGid(undefined)}
                onDossier={(veh) => setDossierVehicle(veh)}
                onToggleCordon={() => toggleCordon()}
                onDispatchCall={() => setDispatchModalOpen(true)}
              />
            )}
            <Strip cam={cam} dets={dets} tracks={tracks} vehicles={vehicles} selected={gid} onPick={(g) => { setGid(g); tacticalAudio.playTargetLock() }} />

            {!vehicle && (
              <div
                className="neu-card"
                style={{
                  marginTop: 12,
                  padding: '14px 16px',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="blink" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
                    <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', letterSpacing: 0.5 }}>
                      OPTICAL TELEMETRY // STANDBY
                    </span>
                  </div>
                  <span className="chip" style={{ fontSize: 9, padding: '2px 8px', color: 'var(--teal)' }}>
                    YOLOv12n · BYTETRACK · 2048-D RE-ID
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
                  Click any tracked vehicle bounding box to lock telemetry, activate the FollowCam, calculate downstream escape cones, or dispatch roadblocks.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginTop: 2 }}>
                  <div style={{ background: 'var(--panel-2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-2)' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>IN-FRAME</div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--teal)' }}>{dets.length} ACTIVE</div>
                  </div>
                  <div style={{ background: 'var(--panel-2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-2)' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>PASSAGES</div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                      {isCustomFeed ? `${liveDetections.length} DETECTED` : `${tracks?.n ?? 0} LOGGED`}
                    </div>
                  </div>
                  <div style={{ background: 'var(--panel-2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-2)' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>SENSOR RES</div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)' }}>{cam.res}</div>
                  </div>
                  <div style={{ background: 'var(--panel-2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-2)' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>STREAM</div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>
                      {isCustomFeed ? `● LIVE SENSOR` : `● 30 FPS`}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )
      )}

      {/* Draggable Resizer Divider Handle */}
      {!isPanelCollapsed && (
        <div
          onMouseDown={startResizing}
          onDoubleClick={() => setPanelWidth(cam ? 540 : 380)}
          title="Drag horizontally to resize panel · Double-click to reset width"
          style={{
            width: 8,
            cursor: 'col-resize',
            position: 'relative',
            zIndex: 25,
            background: isResizing ? 'var(--teal)' : 'var(--line)',
            transition: isResizing ? 'none' : 'background 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 2,
              height: 36,
              borderRadius: 2,
              background: isResizing ? '#000' : 'var(--dim)',
              opacity: 0.8,
            }}
          />
        </div>
      )}

      {/* 2. Map & Tactical GIS Canvas Area */}
      <div
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false) }}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) searchFile(f) }}
        style={{ position: 'relative', flex: 1, minWidth: 0, height: FULL, overflow: 'hidden' }}
      >
        {mapMode === '3d' ? (
          <CesiumGlobe
            cameras={cameras}
            selected={camId}
            highlight={trail}
            focus={focus}
            opticMode={opticMode}
            showCones={showCones}
            showProjectionPlane={showProjectionPlane}
            activeVideoElement={activeVideo}
            centerCoords={globeCenter}
            theme={theme}
            interceptionPrediction={interception}
            cordonActive={cordonActive}
            onSelect={(id) => open(id)}
          />
        ) : (
          <VancouverMap cameras={cameras} selected={camId} highlight={trail} focus={focus} onSelect={(id) => open(id)} />
        )}

        {/* Floating Restore Button when Panel is Collapsed */}
        {isPanelCollapsed && (
          <button
            onClick={() => setIsPanelCollapsed(false)}
            className="btn mono"
            title="Restore Side Inspection Panel"
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              zIndex: 35,
              padding: '6px 10px',
              fontSize: 10,
              fontWeight: 800,
              color: 'var(--teal)',
              background: 'var(--panel)',
              border: '1px solid rgba(94, 234, 212, 0.4)',
              boxShadow: 'var(--neu-shadow-floating)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <span>▶</span>
            <span>PANEL</span>
          </button>
        )}

        {/* Tactical HUD & Search Control Stack */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: isPanelCollapsed ? 104 : 14,
            right: 14,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'none',
            transition: 'left 0.2s ease',
          }}
        >
          {/* Top HUD Controls Bar - Tidy Single-Row Tactical Dock */}
          <div
            className="neu-floating"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              gap: 8,
              alignItems: 'center',
              padding: '6px 10px',
              background: theme === 'light' ? 'rgba(235, 240, 245, 0.94)' : 'rgba(17, 23, 34, 0.88)',
              backdropFilter: 'blur(16px)',
              border: theme === 'light' ? '1px solid rgba(166, 178, 194, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              boxShadow: 'var(--neu-shadow-floating)',
              width: 'fit-content',
              maxWidth: '100%',
            }}
          >
            {/* Corridor Selector: Lucknow vs Vancouver */}
            <div className="neu-inset" style={{ display: 'flex', padding: 2, gap: 2, borderRadius: 8 }}>
              <button
                onClick={() => switchCorridor('lucknow')}
                title="Switch Corridor: Lucknow Smart City Grid (UP, India)"
                style={{
                  border: 'none',
                  background: activeCorridorId === 'lucknow' ? 'var(--amber)' : 'transparent',
                  color: activeCorridorId === 'lucknow' ? 'var(--amber-ink)' : 'var(--muted)',
                  fontWeight: 700,
                  fontSize: 10,
                  padding: '4px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: activeCorridorId === 'lucknow' ? 'var(--neu-shadow-raised-sm)' : 'none',
                }}
              >
                🇮🇳 LUCKNOW
              </button>
              <button
                onClick={() => switchCorridor('vancouver')}
                title="Switch Corridor: Vancouver Metro (Canada)"
                style={{
                  border: 'none',
                  background: activeCorridorId === 'vancouver' ? 'var(--teal)' : 'transparent',
                  color: activeCorridorId === 'vancouver' ? 'var(--teal-ink)' : 'var(--muted)',
                  fontWeight: 700,
                  fontSize: 10,
                  padding: '4px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: activeCorridorId === 'vancouver' ? 'var(--neu-shadow-raised-sm)' : 'none',
                }}
              >
                🇨🇦 VANCOUVER
              </button>
            </div>

            {/* 2D / 3D Switch */}
            <div className="neu-inset" style={{ display: 'flex', padding: 2, gap: 2, borderRadius: 8 }}>
              <button
                onClick={() => setMapMode('3d')}
                title="3D Photogrammetric Globe Mode"
                style={{
                  border: 'none',
                  background: mapMode === '3d' ? 'var(--teal)' : 'transparent',
                  color: mapMode === '3d' ? 'var(--teal-ink)' : 'var(--muted)',
                  fontWeight: 700,
                  fontSize: 10,
                  padding: '4px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: mapMode === '3d' ? 'var(--neu-shadow-raised-sm)' : 'none',
                }}
              >
                3D GLOBE
              </button>
              <button
                onClick={() => setMapMode('2d')}
                title="2D Vector GIS Map Mode"
                style={{
                  border: 'none',
                  background: mapMode === '2d' ? 'var(--teal)' : 'transparent',
                  color: mapMode === '2d' ? 'var(--teal-ink)' : 'var(--muted)',
                  fontWeight: 700,
                  fontSize: 10,
                  padding: '4px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: mapMode === '2d' ? 'var(--neu-shadow-raised-sm)' : 'none',
                }}
              >
                2D VECTOR
              </button>
            </div>

            {/* Sensor Optics Shaders */}
            <div className="neu-inset" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8 }}>
              {(['normal', 'flir', 'nvg', 'crt'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setOpticMode(mode)}
                  title={`Optics Shader: ${mode.toUpperCase()}`}
                  style={{
                    border: 'none',
                    background: opticMode === mode ? 'var(--panel-elevated)' : 'transparent',
                    color: opticMode === mode ? 'var(--teal)' : 'var(--dim)',
                    fontSize: 9,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    padding: '3px 7px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    boxShadow: opticMode === mode ? 'var(--neu-shadow-raised-sm)' : 'none',
                  }}
                >
                  {mode === 'flir' ? 'FLIR 🔥' : mode === 'nvg' ? 'NVG 🟢' : mode === 'crt' ? 'CRT 📺' : 'RGB'}
                </button>
              ))}
            </div>

            {/* Tactical Overlays */}
            {mapMode === '3d' && (
              <>
                <button
                  className="btn mono"
                  onClick={() => setShowCones((prev) => !prev)}
                  title="Toggle 3D Camera Sight Visibility Cones"
                  style={{
                    minHeight: 28,
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: showCones ? 'var(--teal)' : 'var(--dim)',
                    boxShadow: showCones ? 'var(--neu-shadow-inset-sm)' : 'var(--neu-shadow-raised-sm)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  👁️ SIGHT: {showCones ? 'ON' : 'OFF'}
                </button>
                <button
                  className="btn mono"
                  onClick={() => setShowProjectionPlane((prev) => !prev)}
                  title="Toggle In-Scene 3D Video Projection Feed"
                  style={{
                    minHeight: 28,
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: showProjectionPlane ? 'var(--amber)' : 'var(--dim)',
                    boxShadow: showProjectionPlane ? 'var(--neu-shadow-inset-sm)' : 'var(--neu-shadow-raised-sm)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📹 3D FEED: {showProjectionPlane ? 'ON' : 'OFF'}
                </button>
              </>
            )}

            {/* Hands-free Voice Agent */}
            <button
              className="btn mono"
              onClick={toggleVoice}
              title={isVoiceListening ? 'Listening for commands (e.g. "FLIR", "Search red truck", "Camera 2")' : 'Click to activate Hands-Free Voice Agent'}
              style={{
                minHeight: 28,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 700,
                color: isVoiceListening ? 'var(--rose)' : 'var(--muted)',
                borderColor: isVoiceListening ? 'var(--rose)' : undefined,
                boxShadow: isVoiceListening ? 'var(--neu-shadow-inset-sm)' : 'var(--neu-shadow-raised-sm)',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{isVoiceListening ? '🎙️🔴 LISTENING' : '🎙️ VOICE'}</span>
            </button>

            {/* Connect External Feed */}
            <button
              className="btn mono"
              onClick={() => {
                setStreamResolveErr('')
                setCustomFeedModal(true)
              }}
              title="Connect Live Stream (HLS, RTSP, or YouTube Live)"
              style={{
                minHeight: 28,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--amber)',
                borderColor: 'rgba(245, 158, 11, 0.4)',
                whiteSpace: 'nowrap',
              }}
            >
              <span>📡 STREAM</span>
            </button>
          </div>

          {/* SearchBar seamlessly nested below HUD */}
          <div style={{ pointerEvents: 'auto', position: 'relative', width: '100%', maxWidth: 480 }}>
            <SearchBar onResults={(h) => { setHits(h); setPhotoQ(null) }} onFile={searchFile} fileBusy={photoBusy} fileError={photoErr} compact={!!cam} />
            {hits && <Results hits={hits} query={photoQ} vehicles={vehicles} camName={camName} onPick={(h) => { open(h.cam, h.gid); setHits(null) }} onClose={() => { setHits(null); setPhotoQ(null) }} />}
          </div>
        </div>

        {/* Modal: Connect Live Feed / Custom Stream with Multi-Region GIS Mapping */}
        {customFeedModal && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}>
            <div className="neu-card" style={{
              padding: 24,
              maxWidth: 540,
              width: '100%',
              border: 'var(--neu-border)',
              boxShadow: 'var(--neu-shadow-floating)',
              maxHeight: '92vh',
              overflowY: 'auto',
            }}>
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div className="label" style={{ color: 'var(--amber)', fontSize: 10, fontWeight: 700 }}>
                    EXTERNAL OPTICAL SENSOR · AUTO-LOCATE
                  </div>
                  <h3 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, letterSpacing: -0.4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>📡</span> Connect Live Stream
                  </h3>
                </div>
                <button
                  onClick={() => setCustomFeedModal(false)}
                  className="btn mono"
                  style={{ minHeight: 30, padding: '2px 8px', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>

              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, margin: '0 0 14px' }}>
                Paste any <strong style={{ color: 'var(--text)' }}>YouTube Live</strong> or <strong style={{ color: 'var(--text)' }}>.m3u8</strong> link. ChakraDrishti reads the stream, <strong style={{ color: 'var(--teal)' }}>auto-detects where in the world it is</strong>, and flies the 3D globe there — no manual setup.
              </p>

              {/* Stream URL input */}
              <div style={{ marginBottom: 16 }}>
                <label className="label" style={{ display: 'block', fontSize: 10, color: 'var(--dim)', marginBottom: 6 }}>
                  LIVE STREAM URL (YOUTUBE LIVE / HLS / RTSP-RELAY)
                </label>
                <div className="neu-inset" style={{ padding: '2px 10px' }}>
                  <input
                    type="text"
                    placeholder="https://www.youtube.com/watch?v=... or https://.../stream.m3u8"
                    value={customStreamUrl}
                    onChange={(e) => setCustomStreamUrl(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text)',
                      padding: '8px 0',
                      fontSize: 12,
                      fontFamily: 'var(--mono)',
                      outline: 'none',
                    }}
                  />
                </div>
                {customStreamUrl && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setCustomStreamUrl('')}
                      style={{ background: 'none', border: 'none', color: 'var(--dim)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)' }}
                    >
                      Clear URL ✕
                    </button>
                  </div>
                )}
              </div>

              {streamResolveErr && (
                <div style={{ color: 'var(--rose)', fontSize: 11, fontFamily: 'monospace', marginBottom: 14, padding: '8px 12px', background: 'rgba(244,63,94,0.1)', borderRadius: 6, border: '1px solid var(--rose)' }}>
                  ⚠️ {streamResolveErr}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 10, borderTop: '1px solid var(--line-2)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setCustomFeedModal(false)
                    setStreamResolveErr('')
                  }}
                  className="btn mono"
                  style={{ padding: '6px 14px', fontSize: 12 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={resolvingStream || !customStreamUrl.trim()}
                  onClick={async () => {
                    const rawUrl = customStreamUrl.trim()
                    if (!rawUrl) return

                    setStreamResolveErr('')
                    setResolvingStream(true)

                    let resolved: { url: string; title: string; location?: { name: string; lat: number; lon: number; city: string; country: string; located?: boolean } } = { url: rawUrl, title: 'Live Stream' }
                    try {
                      // Always resolve through the backend: it extracts the playable URL AND auto-geocodes the location.
                      resolved = await resolveStream(rawUrl)
                    } catch (err) {
                      setStreamResolveErr(err instanceof Error ? err.message : 'Failed to resolve stream')
                      setResolvingStream(false)
                      return
                    }
                    setResolvingStream(false)

                    const loc = resolved.location
                    const located = loc && loc.located !== false && Number.isFinite(loc.lat) && Number.isFinite(loc.lon) && (loc.lat !== 0 || loc.lon !== 0)
                    if (located && loc) {
                      // Auto-locate: drop a dynamic pin exactly where the stream is and fly the globe there.
                      const dynId = `live-${Date.now()}`
                      const dynCam: Camera = {
                        id: dynId,
                        name: resolved.title.length > 42 ? resolved.title.slice(0, 42) + '…' : resolved.title,
                        lat: loc.lat,
                        lon: loc.lon,
                        source: `${loc.name} · Auto-located`,
                        condition: 'day',
                        view: 'intersection',
                        res: 'LIVE',
                        clip: '',
                        tracks: '',
                        poster: '',
                      }
                      setDynamicCams((prev) => [...prev.filter((c) => c.id !== dynId), dynCam])
                      setCameras((prev) => [...prev.filter((c) => c.id !== dynId), dynCam])
                      setDynamicCenter({ lon: loc.lon, lat: loc.lat, height: 2600 })
                      setCustomFeeds((prev) => ({ ...prev, [dynId]: resolved.url }))
                      setCustomFeedModal(false)
                      open(dynId)
                    } else {
                      // No reliable geocode: attach to the currently-selected camera pole as an override.
                      const target = camId || cameras[0]?.id
                      if (!target) {
                        setStreamResolveErr('Could not detect a location for this stream. Open a camera first, then attach.')
                        return
                      }
                      setCustomFeeds((prev) => ({ ...prev, [target]: resolved.url }))
                      setCustomFeedModal(false)
                      open(target)
                    }
                  }}
                  className="btn btn-primary mono"
                  style={{
                    fontSize: 12,
                    padding: '6px 18px',
                    opacity: resolvingStream || !customStreamUrl.trim() ? 0.5 : 1,
                    cursor: resolvingStream ? 'wait' : 'pointer',
                  }}
                >
                  {resolvingStream ? 'Locating stream…' : 'Attach & Locate ⚡'}
                </button>
              </div>
            </div>
          </div>
        )}

        {(drag || photoBusy) && (
          <div style={{ position: 'absolute', inset: 12, zIndex: 20, display: 'grid', placeItems: 'center', borderRadius: 12, border: '2px dashed var(--teal)', background: 'rgba(7,11,18,.82)', pointerEvents: drag ? 'auto' : 'none', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{photoBusy ? 'Finding the car…' : 'Drop a photo or clip of a car'}</div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{photoBusy ? 'detect · best crops · re-ID fingerprint · compare with every camera' : 'ChakraDrishti finds it, then the most similar vehicles across every camera'}</div>
            </div>
          </div>
        )}
        <div className="mono" style={{ position: 'absolute', left: 16, bottom: 14, fontSize: 11, color: 'var(--dim)' }}>
          <span className="blink" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--rose)', marginRight: 6 }} />
          {cameras.length} CAMERAS ONLINE · {Object.keys(vehicles).length} VEHICLES INDEXED
        </div>
        {/* Floating Copilot Action Button (Round Circular FAB) on the Right */}
        <button
          onClick={() => {
            tacticalAudio.playRadioChirp()
            setCopilotOpen((prev) => !prev)
          }}
          title="Toggle Autonomous Multi-Agent Grid Copilot (AI Swarm)"
          aria-label="Toggle Grid Copilot Swarm"
          className="btn neu-floating"
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            zIndex: 45,
            width: 58,
            height: 58,
            borderRadius: '50%',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: copilotOpen ? 'var(--teal)' : 'var(--panel-elevated)',
            color: copilotOpen ? '#000' : 'var(--teal)',
            border: copilotOpen ? '2px solid var(--teal)' : '1.5px solid rgba(94, 234, 212, 0.45)',
            boxShadow: copilotOpen
              ? '0 0 30px rgba(94, 234, 212, 0.7), var(--neu-shadow-floating)'
              : 'var(--neu-shadow-floating), 0 0 16px rgba(94, 234, 212, 0.3)',
            cursor: 'pointer',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: copilotOpen ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>🤖</span>
          <span
            className="blink"
            style={{
              position: 'absolute',
              top: 5,
              right: 5,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: copilotOpen ? '#000' : 'var(--teal)',
              boxShadow: copilotOpen ? 'none' : '0 0 8px var(--teal)',
            }}
          />
        </button>
      </div>
      {zoom && <Lightbox src={zoom.src} caption={zoom.caption} onClose={() => setZoom(null)} />}
      {dossierVehicle && (
        <IncidentDossier
          vehicle={dossierVehicle}
          camName={camName}
          onClose={() => setDossierVehicle(null)}
        />
      )}
      {dispatchModalOpen && vehicle && (
        <TacticalDispatchModal
          vehicle={vehicle}
          prediction={interception}
          camName={camName}
          cordonActive={cordonActive}
          onCordonToggle={(active) => toggleCordon(active)}
          onClose={() => setDispatchModalOpen(false)}
        />
      )}
      <GridCopilotDrawer
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        cameras={cameras}
        vehicles={vehicles}
        activeCameraId={camId}
        selectedGid={gid}
        onExecuteAction={handleCopilotAction}
      />
    </main>
  )
}

function VehicleDetail({
  v,
  prediction,
  cordonActive = false,
  camName,
  onJump,
  onZoom,
  onBack,
  onDossier,
  onToggleCordon,
  onDispatchCall,
}: {
  v: Vehicle
  prediction?: InterceptionPrediction | null
  cordonActive?: boolean
  camName: (id: string) => string
  onJump: (cam: string, gid: string) => void
  onZoom: (src: string, caption: string) => void
  onBack: () => void
  onDossier: (v: Vehicle) => void
  onToggleCordon?: () => void
  onDispatchCall?: () => void
}) {
  const [guesses, setGuesses] = useState(false)
  const uncertain = v.reliable === false
  const title = vehicleTitle(v)
  const trackId = v.gid.split(':')[1] || '0'
  return (
    <div className="neu-card" style={{ marginTop: 16, padding: '18px 20px', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
      {/* Target Status Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--line-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ background: 'var(--amber)', color: 'var(--amber-ink)', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4 }}>
            TARGET ACQUIRED
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>
            VEHICLE TRACK ID: {v.gid}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-primary mono"
            onClick={() => onDossier(v)}
            title="Generate court-admissible Police Incident Dossier / FIR"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#000',
              fontSize: 11,
              fontWeight: 800,
              minHeight: 30,
              padding: '2px 12px',
              border: 'none',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
            }}
          >
            <span>📋</span> GENERATE DOSSIER / FIR
          </button>
          <button className="btn mono" onClick={onBack} aria-label="Deselect vehicle" style={{ fontSize: 11, minHeight: 30, padding: '2px 10px' }}>
            ✕ UNLOCK
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        {/* Optical Crop Thumbnail */}
        <div style={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={() => onZoom(asset(v.crop), title)}
            className="zoomable neu-inset"
            aria-label="View crop full screen"
            title="Click to view full-resolution crop"
            style={{ padding: 4, borderRadius: 10, overflow: 'hidden', background: 'var(--panel-2)', border: '1px solid var(--amber)', position: 'relative' }}
          >
            <img src={asset(v.crop)} alt={title} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 6 }} />
            <span style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,0.7)', color: 'var(--amber)', fontSize: 10, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
              🔍 ZOOM
            </span>
          </button>
          <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', textAlign: 'center' }}>
            RE-ID CROP // T#{trackId}
          </div>
        </div>

        {/* Telemetry & Inference Data */}
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.3 }}>{title}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {v.color && (
                  <span className="chip" style={{ fontSize: 10, padding: '2px 8px', color: 'var(--teal)' }}>
                    COLOR: {v.color.toUpperCase()}
                  </span>
                )}
                {v.body && (
                  <span className="chip" style={{ fontSize: 10, padding: '2px 8px' }}>
                    TYPE: {v.body.toUpperCase()}
                  </span>
                )}
                <span className="chip" style={{ fontSize: 10, padding: '2px 8px', color: uncertain ? 'var(--rose)' : 'var(--teal)' }}>
                  {uncertain ? 'CONFIDENCE: LOW' : 'MATCH: HIGH'}
                </span>
              </div>
            </div>
          </div>

          {uncertain && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--panel-2)', borderRadius: 8, borderLeft: '3px solid var(--amber)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700 }}>
                  ⚠️ CLASSIFIER CONFIDENCE BELOW 80%
                </span>
                <button
                  className="btn mono"
                  onClick={() => setGuesses((g) => !g)}
                  style={{ fontSize: 9, minHeight: 22, padding: '1px 7px' }}
                >
                  {guesses ? 'HIDE MODEL GUESSES' : 'INSPECT TOP-5'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.4, margin: '4px 0 0' }}>
                Low pixel density{v.evidence ? ` (${v.evidence.min_side}px crop, ${Math.round(v.evidence.consistency * 100)}% consistency)` : ''}. Cross-camera ReID continues on appearance embeddings.
              </p>
            </div>
          )}

          {(!uncertain || guesses) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
              <div className="label" style={{ fontSize: 9, color: 'var(--dim)' }}>Deep Appearance Top-5 Probabilities</div>
              {v.top5.map((r, i) => (
                <div key={r.name} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--text)' : 'var(--muted)' }}>{r.name}</span>
                    <span className="mono" style={{ color: i === 0 ? 'var(--amber)' : 'var(--dim)', fontWeight: 700 }}>{(r.p * 100).toFixed(1)}%</span>
                  </div>
                  <div className="neu-inset" style={{ height: 5, padding: 1, borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${r.p * 100}%`, background: i === 0 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'var(--line-2)', borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Predictive Tactical Interception Card */}
      {prediction && (
        <div
          className="neu-card"
          style={{
            marginTop: 16,
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(245, 158, 11, 0.05)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>🎯</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', letterSpacing: 0.5 }}>
                PREDICTIVE INTERCEPTION VECTOR
              </span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
              ESCAPE CONE: ±25° // SECTOR {Math.floor(prediction.headingDeg / 45) + 1}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <div className="neu-inset" style={{ padding: '8px 10px', borderRadius: 8 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>NEXT-HOP CHECKPOINT</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{prediction.nextWaypoint.name}</div>
            </div>
            <div className="neu-inset" style={{ padding: '8px 10px', borderRadius: 8 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>VECTOR SPEED & HEADING</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', marginTop: 2 }}>
                {prediction.speedKmh} km/h · {prediction.cardinal} ({prediction.headingDeg}°)
              </div>
            </div>
            <div className="neu-inset" style={{ padding: '8px 10px', borderRadius: 8 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>TIME TO INTERCEPT (ETA)</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--rose)', marginTop: 2 }}>
                {(() => {
                  const s = prediction.nextWaypoint.etaSeconds
                  const m = Math.floor(s / 60)
                  const rem = s % 60
                  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
                })()}
              </div>
            </div>
            <div className="neu-inset" style={{ padding: '8px 10px', borderRadius: 8 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>CORRIDOR PROBABILITY</div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 800, color: 'var(--amber)', marginTop: 2 }}>
                {prediction.confidence}% PRIMARY
              </div>
            </div>
          </div>

          {/* Tactical Action Triggers */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary mono"
              onClick={onDispatchCall}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#000',
                fontSize: 11,
                fontWeight: 800,
                minHeight: 32,
                padding: '2px 14px',
                border: 'none',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>📻</span>
              <span>RADIO PCR UNIT (VOICE CALL)</span>
            </button>

            <button
              type="button"
              className="btn mono"
              onClick={onToggleCordon}
              style={{
                fontSize: 11,
                minHeight: 32,
                padding: '2px 14px',
                fontWeight: 700,
                background: cordonActive ? 'rgba(239, 68, 68, 0.2)' : undefined,
                borderColor: cordonActive ? 'var(--rose)' : undefined,
                color: cordonActive ? 'var(--rose)' : undefined,
              }}
            >
              <span>{cordonActive ? '⛔' : '🛡️'}</span>
              <span>{cordonActive ? '✕ LIFT ROADBLOCKS (नाकाबंदी हटाएं)' : '🛡️ ACTIVATE ROADBLOCKS / घेराबंदी'}</span>
            </button>
          </div>
        </div>
      )}

      <LookAlikes items={v.similar ?? v.sightings.slice(1).filter((x) => !x.verified)} camName={camName} onJump={onJump} />
    </div>
  )
}

function TrackingBar({ v, current, camName, onStep, onStop }: { v: Vehicle; current: string; camName: (id: string) => string; onStep: (cam: string, gid: string) => void; onStop: () => void }) {
  const steps = v.journey && v.journey.length > 1 ? v.journey : null
  const i = steps ? steps.findIndex((s) => s.cam === current) : -1
  const go = (k: number) => { const s = steps?.[k]; if (s) onStep(s.cam, `${s.cam}:${s.track}`) }
  const graded = steps ? steps.filter((s) => !s.self && s.correct !== undefined && s.correct !== null).length : 0
  const right = steps ? steps.filter((s) => s.correct === true).length : 0
  return (
    <div className="neu-card" style={{ marginTop: 14, padding: '14px 16px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span className="label" style={{ color: 'var(--amber)', fontSize: 11 }}>Tracking</span>
        <img src={asset(v.crop)} alt="" style={{ width: 44, height: 33, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--amber)', boxShadow: 'var(--neu-shadow-raised-sm)' }} />
        <strong style={{ fontSize: 16 }}>{vehicleTitle(v)}</strong>
        <span className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>
          {steps ? `model found it on ${steps.length} cameras · step ${i + 1} of ${steps.length}${graded ? ` · ${right}/${graded} confirmed by ground truth` : ''}` : 'no match on other cameras'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {steps && <button className="btn mono" disabled={i <= 0} onClick={() => go(i - 1)} style={{ minHeight: 32, padding: '3px 10px', fontSize: 11 }}>‹ Prev</button>}
          {steps && <button className="btn mono" disabled={i >= steps.length - 1} onClick={() => go(i + 1)} style={{ minHeight: 32, padding: '3px 10px', fontSize: 11 }}>Next ›</button>}
          <button className="btn mono" onClick={onStop} aria-label="Stop tracking" style={{ minHeight: 32, padding: '3px 8px' }}>✕</button>
        </div>
      </div>
      {steps && (
        <ol style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '14px 0 0', padding: 0 }}>
          {steps.map((s, k) => {
            const here = k === i
            return (
              <li key={s.cam + s.track} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="btn"
                  onClick={() => go(k)}
                  aria-current={here ? 'step' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px 6px 6px',
                    borderRadius: 8,
                    background: here ? 'var(--amber)' : undefined,
                    color: here ? 'var(--amber-ink)' : 'var(--text)',
                    borderColor: here ? 'var(--amber)' : undefined,
                    boxShadow: here ? 'var(--neu-shadow-inset-sm)' : 'var(--neu-shadow-raised-sm)',
                  }}
                >
                  <span className="mono" style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: here ? 'var(--amber-ink)' : 'transparent', color: here ? 'var(--amber)' : 'var(--amber)', border: here ? 'none' : '1px solid var(--amber)' }}>{k + 1}</span>
                  <img src={asset(s.crop)} alt="" style={{ width: 38, height: 28, objectFit: 'cover', borderRadius: 4 }} />
                  <span style={{ fontSize: 12, fontWeight: here ? 700 : 500, whiteSpace: 'nowrap' }}>{camName(s.cam)}</span>
                  {here && <span className="mono" style={{ fontSize: 9 }}>YOU ARE HERE</span>}
                  {!s.self && s.correct === true && <span title="Confirmed by ground truth" style={{ color: here ? 'var(--amber-ink)' : 'var(--teal)' }}>✓</span>}
                  {!s.self && s.correct === false && <span title="Wrong match per ground truth" style={{ color: here ? 'var(--amber-ink)' : 'var(--rose)' }}>✗</span>}
                </button>
                {k < steps.length - 1 && <span aria-hidden style={{ color: 'var(--amber)', fontWeight: 700 }}>→</span>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function LookAlikes({ items, camName, onJump }: { items: Vehicle['sightings']; camName: (id: string) => string; onJump: (cam: string, gid: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div style={{ marginTop: 18 }}>
      <button className="btn mono" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ fontSize: 11, minHeight: 34, padding: '4px 12px' }}>
        {open ? '▾' : '▸'} Similar-looking vehicles on other cameras · not confirmed the same car ({items.length})
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 12 }}>
          {items.map((s) => (
            <button key={s.cam + s.track} onClick={() => onJump(s.cam, `${s.cam}:${s.track}`)} className="btn" style={{ padding: 0, textAlign: 'left', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <img src={asset(s.crop)} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' }} />
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{camName(s.cam)}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>look-alike · sim {s.sim.toFixed(2)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Strip({ cam, dets, tracks, vehicles, selected, onPick }: { cam: Camera; dets: Det[]; tracks: Tracks | null; vehicles: Record<string, Vehicle>; selected?: string; onPick: (g: string) => void }) {
  const all = useMemo(() => {
    const ids = new Set<number>()
    tracks?.frames.forEach((f) => f.forEach((d) => ids.add(d[0])))
    return [...ids].filter((tid) => vehicles[`${cam.id}:${tid}`])
  }, [tracks, vehicles, cam.id])
  const visible = new Set(dets.map((d) => d[0]))
  return (
    <div style={{ marginTop: 20 }}>
      <div className="label" style={{ color: 'var(--dim)', fontSize: 11, marginBottom: 10 }}>Identified on this camera · {all.length} · teal = in frame now</div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '6px 2px 10px' }}>
        {all.map((tid) => {
          const v = vehicles[`${cam.id}:${tid}`]
          const on = selected === v.gid
          return (
            <button
              key={tid}
              onClick={() => onPick(v.gid)}
              className="btn"
              style={{
                flex: '0 0 136px',
                padding: 0,
                borderRadius: 10,
                overflow: 'hidden',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                borderColor: on ? 'var(--amber)' : visible.has(tid) ? 'var(--teal)' : undefined,
                boxShadow: on ? 'var(--neu-shadow-inset-sm)' : 'var(--neu-shadow-raised-sm)',
              }}
            >
              <img src={asset(v.crop)} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' }} />
              <div className="mono" style={{ padding: '6px 8px', fontSize: 10, lineHeight: 1.4 }}>
                <span style={{ color: on ? 'var(--amber)' : visible.has(tid) ? 'var(--teal)' : 'var(--dim)', fontWeight: 700 }}>#{tid}</span><br />
                <span style={{ color: v.reliable === false ? 'var(--dim)' : 'var(--muted)' }}>{vehicleTitle(v)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SearchBar({ onResults, onFile, fileBusy, fileError, compact }: { onResults: (h: SearchHit[]) => void; onFile: (f: File) => void; fileBusy: boolean; fileError: string; compact: boolean }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<'' | 'search' | 'listen'>('')
  const [note, setNote] = useState('')
  const rec = useRef<MediaRecorder | null>(null)
  const fileIn = useRef<HTMLInputElement>(null)

  const run = async (text: string) => {
    if (!text.trim()) return
    setBusy('search')
    try { onResults(await searchText(text)) } finally { setBusy('') }
  }

  const voice = async () => {
    if (busy === 'listen') { rec.current?.stop(); return }
    setNote('')
    if (getMode() !== 'live') {
      const SR = (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; onend: () => void; start: () => void } }).webkitSpeechRecognition
      if (!SR) { setNote('Voice search is unavailable in this browser.'); return }
      const r = new SR()
      r.lang = 'en-US'
      r.onresult = (e) => { const t = e.results[0][0].transcript; setQ(t); run(t) }
      r.onend = () => setBusy('')
      setBusy('listen')
      r.start()
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const chunks: Blob[] = []
    const mr = new MediaRecorder(stream)
    mr.ondataavailable = (e) => chunks.push(e.data)
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      setBusy('search')
      try { const t = await transcribe(new Blob(chunks, { type: 'audio/webm' })); setQ(t); await run(t) } catch (e) { setNote(String(e)) } finally { setBusy('') }
    }
    rec.current = mr
    mr.start()
    setBusy('listen')
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); run(q) }}
      className="neu-floating"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 520,
        zIndex: 25,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        padding: '5px 10px',
        background: 'var(--panel)',
        border: 'var(--neu-border)',
        boxShadow: 'var(--neu-shadow-floating)',
      }}
    >
      {!compact && <label htmlFor="q" className="mono" style={{ fontSize: 11, color: 'var(--dim)', paddingLeft: 4, fontWeight: 700 }}>FIND</label>}
      <div className="neu-inset" style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px', height: 34 }}>
        <input
          id="q"
          aria-label="Describe a vehicle"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={compact ? 'Describe vehicle (e.g. black SUV)…' : 'white pickup, dark SUV… or drop a photo'}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: 13,
            fontFamily: 'var(--sans)',
          }}
        />
      </div>
      <button
        type="button"
        className="btn"
        onClick={voice}
        aria-label={busy === 'listen' ? 'Stop recording' : 'Search by voice'}
        style={{
          minHeight: 34,
          padding: '2px 8px',
          borderColor: busy === 'listen' ? 'var(--rose)' : undefined,
          color: busy === 'listen' ? 'var(--rose)' : undefined,
          boxShadow: busy === 'listen' ? 'var(--neu-shadow-inset-sm)' : 'var(--neu-shadow-raised-sm)',
        }}
      >
        {busy === 'listen' ? '■' : '🎙'}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => fileIn.current?.click()}
        disabled={fileBusy}
        aria-label="Search by photo or video"
        title="Search by photo or video"
        style={{ minHeight: 34, padding: '2px 8px' }}
      >
        {fileBusy ? '…' : '📷'}
      </button>
      <input ref={fileIn} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <button
        type="submit"
        className="btn btn-primary"
        style={{ minHeight: 34, padding: '2px 12px', fontSize: 12 }}
        disabled={busy === 'search'}
      >
        {busy === 'search' ? '…' : 'Search'}
      </button>
      {(note || fileError) && <span className="mono" style={{ position: 'absolute', top: '100%', left: 8, marginTop: 4, fontSize: 10, color: 'var(--rose)' }}>{note || fileError}</span>}
    </form>
  )
}

function Results({ hits, query, vehicles, camName, onPick, onClose }: { hits: (SearchHit | PhotoHit)[]; query?: PhotoQuery | null; vehicles: Record<string, Vehicle>; camName: (id: string) => string; onPick: (h: SearchHit) => void; onClose: () => void }) {
  return (
    <div
      className="neu-floating"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        width: '100%',
        maxWidth: 520,
        maxHeight: 'calc(100vh - 220px)',
        overflowY: 'auto',
        padding: 14,
        background: 'var(--panel)',
        border: 'var(--neu-border)',
        boxShadow: 'var(--neu-shadow-floating)',
        zIndex: 35,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="label" style={{ fontSize: 11, color: 'var(--dim)' }}>{query ? `${hits.length} most similar · re-ID` : `${hits.length} matches`} · click to open</span>
        <button className="btn" onClick={onClose} aria-label="Close results" style={{ minHeight: 32, padding: '4px 10px' }}>✕</button>
      </div>
      {query && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, marginBottom: 10, borderRadius: 8, border: '1px solid var(--amber)', background: 'var(--panel-2)' }}>
          <img src={query.crop} alt="Vehicle found in your upload" style={{ width: 110, height: 82, objectFit: 'cover', borderRadius: 4, flex: 'none' }} />
          <div className="mono" style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--muted)' }}>
            <div style={{ color: 'var(--amber)' }}>YOUR {query.source === 'video' ? `CLIP · ${query.frames} FRAMES · BEST ${query.crops} CROPS` : 'PHOTO'}</div>
            <div style={{ color: 'var(--text)', fontSize: 13, fontFamily: 'var(--sans)' }}>{query.guess.p >= 0.2 ? `Looks like ${query.guess.name}` : 'Make and model uncertain'}{query.guess.p >= 0.2 && <span style={{ color: 'var(--dim)' }}> · {(query.guess.p * 100).toFixed(0)}%</span>}</div>
            <div>{query.colour} · {query.body}{!query.found && ' · no vehicle detected, searched the whole image'}</div>
          </div>
        </div>
      )}
      {!hits.length && <p style={{ color: 'var(--muted)' }}>No matches.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))', gap: 10 }}>
        {hits.map((h, i) => {
          const v = vehicles[h.gid]
          return (
            <button
              key={h.gid}
              onClick={() => onPick(h)}
              className="btn"
              title={'match' in h && !h.match ? 'Different body type or colour' : undefined}
              style={{
                padding: 0,
                borderRadius: 10,
                overflow: 'hidden',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                borderColor: i === 0 ? 'var(--amber)' : undefined,
                boxShadow: 'var(--neu-shadow-raised-sm)',
                opacity: 'match' in h && !h.match ? 0.5 : 1,
              }}
            >
              <img src={asset(h.crop)} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' }} />
              <div className="mono" style={{ padding: '6px 8px', fontSize: 10, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{camName(h.cam)}</span><br />
                <span style={{ color: 'var(--muted)' }}>{v ? vehicleTitle(v) : ''}</span> · <span style={{ color: i === 0 ? 'var(--amber)' : 'var(--teal)', fontWeight: 700 }}>{h.score.toFixed(3)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
