import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Det, LiveDetection, Tracks } from '../data'

interface Props {
  src: string
  poster?: string
  tracks?: Tracks | null
  /** Real-time live detections from YOLOv8n detector */
  liveDetections?: LiveDetection[] | null
  /** Flag indicating this is an active external live stream */
  isLive?: boolean
  /** Periodic frame capture callback to send frames to backend detector */
  onCaptureFrame?: (dataUrl: string) => void
  /** 0..1. When set, the video follows scroll instead of playing. */
  progress?: number
  /** Track to draw in amber; every other box is dimmed by `othersOpacity`. */
  highlight?: number
  othersOpacity?: number
  /** Per-box reveal 0..1 (index = order of first appearance); omit to show all boxes. */
  reveal?: (order: number) => number
  onFrame?: (frame: number, dets: Det[]) => void
  onPick?: (track: number) => void
  /** Seconds to jump to once the clip loads (e.g. when opening a sighting). */
  startAt?: number
  /** Show a fullscreen button; boxes stay aligned because the overlay goes fullscreen with the video. */
  fullscreen?: boolean
  /** Custom box label per track (defaults to detector class + confidence). */
  labelFor?: (track: number) => string | undefined
  className?: string
  children?: React.ReactNode
  onVideoReady?: (video: HTMLVideoElement | null) => void
}

/** Plays (or scroll-scrubs) a clip and overlays the detector's per-frame tracks or live YOLO detections. */
export default function TrackedVideo({
  src,
  poster,
  tracks,
  liveDetections,
  isLive,
  onCaptureFrame,
  progress,
  highlight,
  othersOpacity = 1,
  reveal,
  onFrame,
  onPick,
  startAt,
  fullscreen,
  labelFor,
  className,
  children,
  onVideoReady,
}: Props) {
  const outer = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [frame, setFrame] = useState(0)
  const wanted = useRef(0)
  const scrub = progress !== undefined

  // Playback mode: boxes are painted on a canvas inside the video-frame callback, together with the
  // frame itself. Going through React state here adds a render behind the video and the boxes trail.
  const canvas = useRef<HTMLCanvasElement>(null)
  const shown = useRef<{ f: number; dets: Det[] }>({ f: -1, dets: [] })
  const latest = useRef({ highlight, othersOpacity, labelFor, onFrame, liveDetections })
  latest.current = { highlight, othersOpacity, labelFor, onFrame, liveDetections }

  const paint = () => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const { highlight: hl, othersOpacity: oo, labelFor: lf, liveDetections: ld } = latest.current
    const dpr = window.devicePixelRatio || 1

    // 1. LIVE EXTERNAL STREAM DETECTION MODE
    if (ld && ld.length > 0) {
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.font = `600 ${11 * dpr}px "JetBrains Mono", monospace`
      ctx.textBaseline = 'top'

      const ordered = [...ld].sort((a, b) => Number(a.id === hl) - Number(b.id === hl))
      for (const det of ordered) {
        const target = det.id === hl
        ctx.globalAlpha = target ? 1 : oo
        const colour = target ? '#fbbf24' : '#5eead4'
        const [nx1, ny1, nx2, ny2] = det.norm_box
        const x = nx1 * c.width
        const y = ny1 * c.height
        const w = (nx2 - nx1) * c.width
        const h = (ny2 - ny1) * c.height

        // Inner tactical tint
        ctx.fillStyle = target ? 'rgba(251,191,36,.12)' : 'rgba(94,234,212,.08)'
        ctx.fillRect(x, y, w, h)
        ctx.lineWidth = (target ? 2.5 : 1.5) * dpr
        ctx.strokeStyle = colour
        ctx.strokeRect(x, y, w, h)

        // Corner tick marks
        const tick = Math.min(8 * dpr, Math.min(w, h) * 0.35)
        ctx.lineWidth = 2.5 * dpr
        ctx.beginPath()
        ctx.moveTo(x, y + tick); ctx.lineTo(x, y); ctx.lineTo(x + tick, y)
        ctx.moveTo(x + w - tick, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + tick)
        ctx.moveTo(x, y + h - tick); ctx.lineTo(x, y + h); ctx.lineTo(x + tick, y + h)
        ctx.moveTo(x + w - tick, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - tick)
        ctx.stroke()

        // Label pill
        const text = `#${det.id} ${det.label} ${det.speed ? `· ${det.speed} km/h` : ''}`
        const tw = ctx.measureText(text).width + 8 * dpr
        const th = 15 * dpr
        const ty = y - th - 2 * dpr < 0 ? y + 2 * dpr : y - th - 2 * dpr
        ctx.fillStyle = colour
        ctx.fillRect(x, ty, tw, th)
        ctx.fillStyle = target ? '#1f1300' : '#042f2c'
        ctx.fillText(text, x + 4 * dpr, ty + 2 * dpr)
      }
      ctx.globalAlpha = 1
      return
    }

    // 2. PRE-INDEXED TRACKS MODE
    if (!tracks) {
      ctx.clearRect(0, 0, c.width, c.height)
      return
    }

    const sx = c.width / tracks.w
    const sy = c.height / tracks.h
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.font = `600 ${11 * dpr}px "JetBrains Mono", monospace`
    ctx.textBaseline = 'top'
    const ordered = [...shown.current.dets].sort((a, b) => Number(a[0] === hl) - Number(b[0] === hl))
    for (const [tid, x1, y1, x2, y2, conf, cls] of ordered) {
      const target = tid === hl
      ctx.globalAlpha = target ? 1 : oo
      const colour = target ? '#fbbf24' : '#5eead4'
      const x = x1 * sx, y = y1 * sy, w = (x2 - x1) * sx, h = (y2 - y1) * sy
      ctx.fillStyle = target ? 'rgba(251,191,36,.10)' : 'rgba(94,234,212,.07)'
      ctx.fillRect(x, y, w, h)
      ctx.lineWidth = (target ? 2.5 : 1.5) * dpr
      ctx.strokeStyle = colour
      ctx.strokeRect(x, y, w, h)
      const text = `#${tid} ${lf?.(tid) ?? `${tracks.names[String(cls)] ?? 'vehicle'} ${conf.toFixed(2)}`}`
      const tw = ctx.measureText(text).width + 8 * dpr
      const th = 15 * dpr
      const ty = y - th - 2 * dpr < 0 ? y + 2 * dpr : y - th - 2 * dpr
      ctx.fillStyle = colour
      ctx.fillRect(x, ty, tw, th)
      ctx.fillStyle = target ? '#1f1300' : '#042f2c'
      ctx.fillText(text, x + 4 * dpr, ty + 2 * dpr)
    }
    ctx.globalAlpha = 1
  }

  // Periodic frame grabber for external live stream YOLO detection
  useEffect(() => {
    if (!isLive || !onCaptureFrame) return
    const v = video.current
    if (!v) return

    let alive = true
    let isProcessing = false
    const interval = setInterval(() => {
      if (!alive || !v || v.readyState < 2 || v.paused || isProcessing) return
      try {
        isProcessing = true
        const vw = v.videoWidth || 640
        const vh = v.videoHeight || 360
        const scale = Math.min(1, 640 / vw)
        const off = document.createElement('canvas')
        off.width = Math.round(vw * scale)
        off.height = Math.round(vh * scale)
        const ctx = off.getContext('2d')
        if (ctx) {
          ctx.drawImage(v, 0, 0, off.width, off.height)
          const dataUrl = off.toDataURL('image/jpeg', 0.65)
          onCaptureFrame(dataUrl)
        }
      } catch {
        // Protected against canvas tainting
      } finally {
        isProcessing = false
      }
    }, 320) // ~3.1 FPS capture rate, ideal for backend YOLO

    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [isLive, onCaptureFrame])

  useEffect(() => {
    const v = video.current
    if (!v || scrub || !tracks) return
    let handle = 0
    let alive = true
    const schedule = () => { handle = 'requestVideoFrameCallback' in v ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(() => tick(0)) }
    const tick = (_: number, meta?: VideoFrameCallbackMetadata) => {
      if (!alive) return
      const t = meta ? meta.mediaTime : v.currentTime
      const f = Math.min(tracks.n - 1, Math.round(t * tracks.fps))
      if (f !== shown.current.f) {
        shown.current = { f, dets: tracks.frames[f] ?? [] }
        paint()
        latest.current.onFrame?.(f, shown.current.dets)
      }
      schedule()
    }
    schedule()
    return () => {
      alive = false
      if ('cancelVideoFrameCallback' in v) v.cancelVideoFrameCallback(handle)
      else cancelAnimationFrame(handle)
    }
  }, [scrub, tracks, src]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the canvas at device resolution and repaint when the selection changes.
  useLayoutEffect(() => {
    const c = canvas.current
    if (!c || scrub) return
    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      c.width = Math.round(c.clientWidth * dpr)
      c.height = Math.round(c.clientHeight * dpr)
      paint()
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [scrub, tracks, liveDetections]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!scrub) paint()
  }, [highlight, othersOpacity, labelFor, liveDetections]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPick) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height

    // If live detections active, pick from live detections
    if (liveDetections && liveDetections.length > 0) {
      const hits = liveDetections.filter((d) => {
        const [nx1, ny1, nx2, ny2] = d.norm_box
        return px >= nx1 && px <= nx2 && py >= ny1 && py <= ny2
      })
      hits.sort((a, b) => {
        const areaA = (a.norm_box[2] - a.norm_box[0]) * (a.norm_box[3] - a.norm_box[1])
        const areaB = (b.norm_box[2] - b.norm_box[0]) * (b.norm_box[3] - b.norm_box[1])
        return areaA - areaB
      })
      if (hits[0]) {
        onPick(hits[0].id)
      }
      return
    }

    if (!tracks) return
    const x = px * tracks.w
    const y = py * tracks.h
    const hits = shown.current.dets.filter((d) => x >= d[1] && x <= d[3] && y >= d[2] && y <= d[4])
    hits.sort((a, b) => (a[3] - a[1]) * (a[4] - a[2]) - (b[3] - b[1]) * (b[4] - b[2]))
    if (hits[0]) onPick(hits[0][0])
  }

  // Scrub mode: scroll position drives the clip.
  useEffect(() => {
    const v = video.current
    if (!v || !scrub || !tracks) return
    const f = Math.min(tracks.n - 1, Math.max(0, Math.round(progress! * (tracks.n - 1))))
    setFrame(f)
    wanted.current = f / tracks.fps
    if (v.readyState >= 1) v.currentTime = wanted.current
  }, [progress, scrub, tracks])

  const dets = tracks?.frames[frame] ?? []
  useEffect(() => { if (scrub) onFrame?.(frame, dets) }, [frame]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onVideoReady?.(video.current)
    return () => onVideoReady?.(null)
  }, [onVideoReady])

  // Order tracks by first appearance so reveal() can stagger them.
  const order = useRef(new Map<number, number>())
  useEffect(() => {
    order.current = new Map()
    tracks?.frames.forEach((f) => f.forEach((d) => { if (!order.current.has(d[0])) order.current.set(d[0], order.current.size) }))
  }, [tracks])

  useEffect(() => {
    const v = video.current
    if (!v || !src) return

    let hls: import('hls.js').default | null = null
    const isHls = /\.m3u8(?:[?#]|$)/i.test(src)

    if (isHls) {
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30,
          })
          hls.loadSource(src)
          hls.attachMedia(v)
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            v.play().catch(() => {})
          })
        } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = src
          v.play().catch(() => {})
        }
      })
    } else {
      v.src = src
    }

    return () => {
      if (hls) {
        hls.destroy()
      }
    }
  }, [src])

  const ar = tracks ? `${tracks.w} / ${tracks.h}` : '16 / 9'
  const inner = (
    <div className={fullscreen ? 'tv-inner' : className} style={{ position: 'relative', aspectRatio: ar, overflow: 'hidden', background: '#0a0f16', ['--ar' as string]: tracks ? tracks.w / tracks.h : 16 / 9 }}>
      <video
        ref={video}
        poster={poster}
        muted
        playsInline
        loop={!scrub}
        autoPlay={!scrub}
        preload="auto"
        onLoadedData={(e) => {
          if (scrub) e.currentTarget.currentTime = wanted.current + 0.001
          else if (startAt) e.currentTarget.currentTime = startAt
        }}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {(tracks || isLive || (liveDetections && liveDetections.length > 0)) && !scrub && (
        <canvas ref={canvas} onClick={pickAt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: onPick ? 'pointer' : undefined }} />
      )}
      {tracks && scrub && dets.map((d) => {
        const [tid, x1, y1, x2, y2, conf, cls] = d
        const isTarget = highlight === tid
        const r = reveal ? reveal(order.current.get(tid) ?? 0) : 1
        const o = isTarget ? 1 : r * othersOpacity
        if (o <= 0.01) return null
        return (
          <div
            key={tid}
            className={`bbox${isTarget ? ' target' : ''}`}
            onClick={onPick ? () => onPick(tid) : undefined}
            style={{
              left: `${(x1 / tracks.w) * 100}%`, top: `${(y1 / tracks.h) * 100}%`,
              width: `${((x2 - x1) / tracks.w) * 100}%`, height: `${((y2 - y1) / tracks.h) * 100}%`,
              opacity: o, transform: `scale(${1.25 - 0.25 * Math.min(1, r)})`, cursor: onPick ? 'pointer' : undefined,
            }}
          >
            <span>#{tid} {labelFor?.(tid) ?? `${tracks.names[String(cls)] ?? 'vehicle'} ${conf.toFixed(2)}`}</span>
          </div>
        )
      })}
      {children}
    </div>
  )
  if (!fullscreen) return inner
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : outer.current?.requestFullscreen())
  return (
    <div ref={outer} className={`tv-outer ${className ?? ''}`} style={{ position: 'relative' }}>
      {inner}
      <button className="tv-fs" onClick={toggle} aria-label="Toggle fullscreen" title="Fullscreen">⛶</button>
    </div>
  )
}
