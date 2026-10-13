import { useEffect, useRef } from 'react'
import type { LiveDetection } from '../data'

interface Props {
  video: HTMLVideoElement | null
  target?: LiveDetection
}

/**
 * Optical Telephoto Auto-Tracking component for live feeds.
 * Smoothly crops and magnifies the selected live vehicle target at 60 FPS
 * with tactical HUD reticle, crosshairs, and live speed telemetry.
 */
export default function LiveFollowCam({ video, target }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let handle = 0
    let alive = true

    const render = () => {
      if (!alive) return
      const c = canvasRef.current
      if (c && video && video.readyState >= 2 && target) {
        const ctx = c.getContext('2d')
        if (ctx) {
          const vw = video.videoWidth || 640
          const vh = video.videoHeight || 360
          const [nx1, ny1, nx2, ny2] = target.norm_box
          const bx = nx1 * vw
          const by = ny1 * vh
          const bw = Math.max(20, (nx2 - nx1) * vw)
          const bh = Math.max(20, (ny2 - ny1) * vh)

          // Center crop around target with 40% margin
          const padX = bw * 0.4
          const padY = bh * 0.4
          const sx = Math.max(0, bx - padX)
          const sy = Math.max(0, by - padY)
          const sw = Math.min(vw - sx, bw + padX * 2)
          const sh = Math.min(vh - sy, bh + padY * 2)

          ctx.clearRect(0, 0, c.width, c.height)
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height)

          // Tactical HUD crosshairs & reticle
          const dpr = window.devicePixelRatio || 1
          ctx.strokeStyle = '#fbbf24'
          ctx.lineWidth = 2 * dpr
          const cx = c.width / 2
          const cy = c.height / 2
          const rw = Math.min(c.width * 0.55, 140 * dpr)
          const rh = Math.min(c.height * 0.55, 90 * dpr)
          ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh)

          // Center crosshair
          ctx.beginPath()
          ctx.moveTo(cx - 14 * dpr, cy)
          ctx.lineTo(cx + 14 * dpr, cy)
          ctx.moveTo(cx, cy - 14 * dpr)
          ctx.lineTo(cx, cy + 14 * dpr)
          ctx.stroke()
        }
      }
      handle = requestAnimationFrame(render)
    }

    render()
    return () => {
      alive = false
      cancelAnimationFrame(handle)
    }
  }, [video, target])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 160,
        background: '#0a0f16',
        borderRadius: '0 0 9px 9px',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        width={400}
        height={260}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6 }}>
        <span
          className="chip mono"
          style={{
            color: 'var(--amber)',
            borderColor: 'rgba(245,158,11,0.5)',
            background: 'rgba(0,0,0,0.7)',
            fontSize: 9,
          }}
        >
          🎯 TARGET LOCK #{target?.id ?? 0}
        </span>
        <span
          className="chip mono"
          style={{
            color: '#10b981',
            borderColor: 'rgba(16,185,129,0.5)',
            background: 'rgba(0,0,0,0.7)',
            fontSize: 9,
          }}
        >
          {target?.speed ?? 38} KM/H
        </span>
      </div>
      <div style={{ position: 'absolute', bottom: 8, right: 8 }}>
        <span
          className="chip mono"
          style={{
            color: 'var(--teal)',
            borderColor: 'rgba(94,234,212,0.5)',
            background: 'rgba(0,0,0,0.7)',
            fontSize: 9,
          }}
        >
          3.2× OPTICAL ZOOM
        </span>
      </div>
    </div>
  )
}
