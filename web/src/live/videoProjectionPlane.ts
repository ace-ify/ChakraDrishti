import * as Cesium from 'cesium'
import { computeFrustumGeometry, frustumCartesians } from './viewshedMesh'
import { asset } from '../data'

/**
 * Creates and updates an in-scene floating 3D monitor plane capping the selected camera's
 * viewshed with real-time video playback directly on the 3D Cesium globe.
 *
 * Implements a dual-source engine:
 * 1. Uses the active DOM video element from the inspection drawer when available.
 * 2. Seamlessly falls back to an offscreen background looping <video> element if the
 *    drawer is closed or not yet mounted, ensuring the in-scene 3D monitor plane is
 *    NEVER static/still.
 */
export class VideoProjectionPlaneManager {
  private viewer: Cesium.Viewer
  private activePlane: Cesium.Entity | null = null
  private offscreenVideo: HTMLVideoElement | null = null
  private rafHandle: number = 0

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  private getOrCreateOffscreenVideo(clipUrl: string): HTMLVideoElement {
    if (!this.offscreenVideo) {
      const v = document.createElement('video')
      v.muted = true
      v.loop = true
      v.playsInline = true
      v.autoplay = true
      v.crossOrigin = 'anonymous'
      v.style.position = 'fixed'
      v.style.top = '-9999px'
      v.style.left = '-9999px'
      v.style.width = '1px'
      v.style.height = '1px'
      v.style.opacity = '0'
      v.style.pointerEvents = 'none'
      document.body.appendChild(v)
      this.offscreenVideo = v
    }

    if (this.offscreenVideo.src !== clipUrl) {
      this.offscreenVideo.src = clipUrl
      this.offscreenVideo.load()
      this.offscreenVideo.play().catch(() => {})
    }

    return this.offscreenVideo
  }

  updateProjection(
    camera: {
      id: string
      name: string
      lat: number
      lon: number
      clip?: string
      headingDeg?: number
      pitchDeg?: number
      fovDeg?: number
      rangeM?: number
      mountHeightM?: number
    } | null,
    videoElement: HTMLVideoElement | null
  ) {
    // If camera selection changed or cleared, clean up
    if (!camera) {
      this.cleanup()
      return
    }

    // Determine target video element (live DOM element or offscreen loop)
    let targetVideo = videoElement

    if (!targetVideo && camera.clip) {
      const clipSrc = camera.clip.startsWith('http') || camera.clip.startsWith('/')
        ? camera.clip
        : asset(camera.clip)
      targetVideo = this.getOrCreateOffscreenVideo(clipSrc)
    }

    // Compute exact cap positions
    const geom = computeFrustumGeometry(camera)
    const positions = frustumCartesians(geom)

    // Clean up previous plane
    if (this.activePlane) {
      this.viewer.entities.remove(this.activePlane)
      this.activePlane = null
    }

    // Material with Video Element
    let material: Cesium.MaterialProperty

    if (targetVideo) {
      if (targetVideo.paused) {
        targetVideo.play().catch(() => {})
      }

      material = new Cesium.ImageMaterialProperty({
        image: targetVideo,
        transparent: false,
        color: Cesium.Color.WHITE.withAlpha(0.96),
      })
    } else {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#050b14'
        ctx.fillRect(0, 0, 640, 360)
        ctx.strokeStyle = 'rgba(94, 234, 212, 0.2)'
        ctx.lineWidth = 1
        for (let x = 40; x < 640; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke()
        }
        for (let y = 40; y < 360; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke()
        }
        ctx.strokeStyle = '#5eead4'
        ctx.lineWidth = 3
        ctx.strokeRect(16, 16, 608, 328)
        ctx.fillStyle = '#5eead4'
        ctx.font = 'bold 22px "JetBrains Mono", monospace'
        ctx.fillText(`CAM // ${camera.name.toUpperCase()}`, 32, 54)
        ctx.fillStyle = '#94a3b8'
        ctx.font = '14px "JetBrains Mono", monospace'
        ctx.fillText(`ID: ${camera.id}  ·  STATUS: STREAM CONNECTED`, 32, 82)
      }
      material = new Cesium.ImageMaterialProperty({
        image: canvas,
        transparent: false,
        color: Cesium.Color.WHITE.withAlpha(0.92),
      })
    }

    // Exact 4-corner coplanar polygon cap matching viewshed rays:
    // tl -> tr -> br -> bl
    this.activePlane = this.viewer.entities.add({
      id: `proj-plane-${camera.id}`,
      name: `Projection [${camera.name}]`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy([
          positions.tl,
          positions.tr,
          positions.br,
          positions.bl,
        ]),
        material,
        perPositionHeight: true,
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#5eead4'),
        outlineWidth: 2,
      },
    })

    // Start render pulse if requestRenderMode is enabled
    this.startVideoRenderLoop(targetVideo)
  }

  private startVideoRenderLoop(video: HTMLVideoElement | null) {
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = 0
    }

    if (!video) return

    const loop = () => {
      if (this.activePlane && !this.viewer.isDestroyed()) {
        // Trigger Cesium render update for video texture
        this.viewer.scene.requestRender()
        this.rafHandle = requestAnimationFrame(loop)
      }
    }
    this.rafHandle = requestAnimationFrame(loop)
  }

  cleanup() {
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = 0
    }
    if (this.activePlane && !this.viewer.isDestroyed()) {
      this.viewer.entities.remove(this.activePlane)
      this.activePlane = null
    }
    if (this.offscreenVideo) {
      this.offscreenVideo.pause()
      this.offscreenVideo.removeAttribute('src')
      this.offscreenVideo.load()
      this.offscreenVideo.remove()
      this.offscreenVideo = null
    }
  }

  destroy() {
    this.cleanup()
  }
}
