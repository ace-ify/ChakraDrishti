import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { Camera } from '../data'
import type { InterceptionPrediction } from './interception'
import { computeFrustumGeometry, frustumCartesians, createFrustumVolumePrimitive } from './viewshedMesh'
import { TacticalShaderStageManager } from './tacticalShaders'
import { VideoProjectionPlaneManager } from './videoProjectionPlane'

interface Props {
  cameras: Camera[]
  selected?: string
  highlight?: string[]
  focus?: string[]
  opticMode?: 'normal' | 'flir' | 'nvg' | 'crt'
  showCones?: boolean
  showProjectionPlane?: boolean
  activeVideoElement?: HTMLVideoElement | null
  centerCoords?: { lon: number; lat: number; height: number }
  theme?: 'dark' | 'light'
  interceptionPrediction?: InterceptionPrediction | null
  cordonActive?: boolean
  onSelect: (id: string) => void
}

// Color palettes for camera markers and optical views
const COND_COLOR: Record<Camera['condition'], Cesium.Color> = {
  day: Cesium.Color.fromCssColorString('#5eead4'),
  dusk: Cesium.Color.fromCssColorString('#fbbf24'),
  night: Cesium.Color.fromCssColorString('#a78bfa'),
  rain: Cesium.Color.fromCssColorString('#60a5fa'),
  snow: Cesium.Color.fromCssColorString('#e2e8f0'),
}

export default function CesiumGlobe({
  cameras,
  selected,
  highlight = [],
  focus = [],
  opticMode = 'normal',
  showCones = true,
  showProjectionPlane = true,
  activeVideoElement = null,
  centerCoords,
  theme = 'dark',
  interceptionPrediction = null,
  cordonActive = false,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const entitiesRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const primitivesRef = useRef<Cesium.Primitive[]>([])
  const shaderManagerRef = useRef<TacticalShaderStageManager | null>(null)
  const projectionManagerRef = useRef<VideoProjectionPlaneManager | null>(null)
  const lastFlightTargetRef = useRef<string>('')

  // 1. Initialize Cesium Viewer
  useEffect(() => {
    if (!containerRef.current) return

    // Create viewer with dark theme & optimal performance
    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      scene3DOnly: true,
      shouldAnimate: true,
      creditContainer: document.createElement('div'), // Hide attribution clutter
    })

    viewerRef.current = viewer
    shaderManagerRef.current = new TacticalShaderStageManager(viewer.scene)
    projectionManagerRef.current = new VideoProjectionPlaneManager(viewer)

    // Configure Scene Atmosphere for Tactical Look
    viewer.scene.globe.enableLighting = false
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#070b12')
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#070b12')
    viewer.scene.globe.depthTestAgainstTerrain = false

    // Initial flight
    const dest = centerCoords || { lon: -123.1207, lat: 49.2827, height: 6000 }
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(dest.lon, dest.lat - 0.04, dest.height),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0.0,
      },
      duration: 1.5,
    })

    // Screen space event handler
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

    // Cancel automated camera flights immediately when user interacts with map
    handler.setInputAction(() => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.camera.cancelFlight()
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN)

    handler.setInputAction(() => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.camera.cancelFlight()
      }
    }, Cesium.ScreenSpaceEventType.RIGHT_DOWN)

    // Click handler for 3D Camera Pins & Frustums
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = viewer.scene.pick(click.position)
      if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.name) {
        const camId = pickedObject.id.id.replace('cam-', '').replace('proj-plane-', '')
        onSelect(camId)
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      handler.destroy()
      shaderManagerRef.current?.destroy()
      projectionManagerRef.current?.destroy()
      if (!viewer.isDestroyed()) {
        viewer.destroy()
      }
      viewerRef.current = null
    }
  }, [])

  // Auto-resize Cesium viewport when right panel opens or collapses
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.resize()
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // 2. Flight on Corridor Change
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !centerCoords) return

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        centerCoords.lon,
        centerCoords.lat - 0.04,
        centerCoords.height
      ),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0.0,
      },
      duration: 1.8,
    })
  }, [centerCoords?.lon, centerCoords?.lat])

  // 3. WebGL Custom Shaders Sync (FLIR / NVG / CRT)
  useEffect(() => {
    if (shaderManagerRef.current) {
      shaderManagerRef.current.setMode(opticMode)
    }
  }, [opticMode])

  // Theme Sync: Update Globe and Background Atmosphere
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    const bgHex = theme === 'light' ? '#d5dde5' : '#070b12'
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(bgHex)
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(bgHex)
  }, [theme])

  // 4. Sync Camera Pins, True 3D Frustum Geometries & Trajectories
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    // Clear previous entities and volumetric primitives
    entitiesRef.current.forEach((e) => viewer.entities.remove(e))
    entitiesRef.current.clear()

    primitivesRef.current.forEach((p) => viewer.scene.primitives.remove(p))
    primitivesRef.current = []

    cameras.forEach((c, idx) => {
      const isSelected = c.id === selected
      const isHighlighted = highlight.includes(c.id)
      const baseColor = isSelected
        ? Cesium.Color.fromCssColorString('#f43f5e') // Rose when selected
        : isHighlighted
        ? Cesium.Color.fromCssColorString('#5eead4') // Teal when route highlight
        : COND_COLOR[c.condition] || Cesium.Color.fromCssColorString('#5eead4')

      // 1. Camera Ground Pole & Pin Marker
      const pin = viewer.entities.add({
        id: `cam-${c.id}`,
        name: c.name,
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 25),
        point: {
          pixelSize: isSelected ? 18 : isHighlighted ? 14 : 10,
          color: baseColor,
          outlineColor: Cesium.Color.fromCssColorString('#070b12'),
          outlineWidth: 3,
        },
        label: {
          text: isSelected || isHighlighted ? `[CAM] ${c.name}` : c.name.split('&')[0].trim(),
          font: '11px JetBrains Mono, monospace, sans-serif',
          fillColor: isSelected ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#94a3b8'),
          outlineColor: Cesium.Color.fromCssColorString('#070b12'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000),
        },
      })
      entitiesRef.current.set(c.id, pin)

      // 2. True 3D Mathematical Frustum Mesh (God's Eye View 5-vertex pyramid)
      if (showCones) {
        const headingDeg = (idx * 55) % 360 // Realistic spatial heading spread
        const geom = computeFrustumGeometry({
          lat: c.lat,
          lon: c.lon,
          headingDeg,
          pitchDeg: -22,
          fovDeg: 68,
          rangeM: isSelected ? 220 : 160,
          mountHeightM: 20,
        })
        const positions = frustumCartesians(geom)

        // Add 3D Volumetric Mesh Primitive
        const fillColor = isSelected
          ? Cesium.Color.fromCssColorString('#f43f5e').withAlpha(0.28)
          : isHighlighted
          ? Cesium.Color.fromCssColorString('#5eead4').withAlpha(0.22)
          : baseColor.withAlpha(0.12)

        const omitCap = isSelected && showProjectionPlane
        const prim = createFrustumVolumePrimitive(positions, fillColor, omitCap)
        viewer.scene.primitives.add(prim)
        primitivesRef.current.push(prim)

        // Add wireframe edge lines
        const edgeColor = isSelected
          ? Cesium.Color.fromCssColorString('#f43f5e').withAlpha(0.8)
          : isHighlighted
          ? Cesium.Color.fromCssColorString('#5eead4').withAlpha(0.7)
          : baseColor.withAlpha(0.4)

        // Add 5 clean wireframe entities matching God's Eye View:
        // 4 corner rays + 1 closed cap rectangle
        const rays = [
          viewer.entities.add({ polyline: { positions: [positions.mount, positions.tl], width: 1.2, material: edgeColor } }),
          viewer.entities.add({ polyline: { positions: [positions.mount, positions.tr], width: 1.2, material: edgeColor } }),
          viewer.entities.add({ polyline: { positions: [positions.mount, positions.br], width: 1.2, material: edgeColor } }),
          viewer.entities.add({ polyline: { positions: [positions.mount, positions.bl], width: 1.2, material: edgeColor } }),
          viewer.entities.add({ polyline: { positions: [positions.tl, positions.tr, positions.br, positions.bl, positions.tl], width: 1.5, material: edgeColor } }),
        ]
        rays.forEach((r, i) => entitiesRef.current.set(`wire-${c.id}-${i}`, r))
      }
    })

    // Draw Trajectory Journey lines connecting route cameras
    if (highlight.length > 1) {
      const positions: Cesium.Cartesian3[] = []
      highlight.forEach((id) => {
        const cam = cameras.find((c) => c.id === id)
        if (cam) {
          positions.push(Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 25))
        }
      })

      if (positions.length > 1) {
        const polyline = viewer.entities.add({
          id: 'route-polyline',
          name: 'Tracked Trajectory',
          polyline: {
            positions,
            width: 4,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.25,
              color: Cesium.Color.fromCssColorString('#5eead4'),
            }),
          },
        })
        entitiesRef.current.set('route-polyline', polyline)
      }
    }

    // 3. Predictive Interception Vectors, Escape Cone & Cordon
    if (interceptionPrediction) {
      const pred = interceptionPrediction
      const lastPos = Cesium.Cartesian3.fromDegrees(pred.lastCam.lon, pred.lastCam.lat, 25)
      const nextPos = Cesium.Cartesian3.fromDegrees(pred.nextWaypoint.lon, pred.nextWaypoint.lat, 25)

      // A. Escape Sector Cone Polyline
      if (pred.coneVertices.length > 2) {
        const conePositions = pred.coneVertices.map((pt) => Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, 15))
        const conePoly = viewer.entities.add({
          id: 'intercept-cone',
          name: 'Escape Sector Cone',
          polyline: {
            positions: conePositions,
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.65),
              dashLength: 12,
            }),
          },
        })
        entitiesRef.current.set('intercept-cone', conePoly)
      }

      // B. Projected Pursuit Vector Ray
      const vectorRay = viewer.entities.add({
        id: 'intercept-vector-ray',
        name: 'Projected Pursuit Vector',
        polyline: {
          positions: [lastPos, nextPos],
          width: 3.5,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.35,
            color: Cesium.Color.fromCssColorString('#f59e0b'),
          }),
        },
      })
      entitiesRef.current.set('intercept-vector-ray', vectorRay)

      // C. Interception Checkpoint 3D Pin & Beacon
      const beacon = viewer.entities.add({
        id: 'intercept-beacon',
        name: `Intercept: ${pred.nextWaypoint.name}`,
        position: nextPos,
        point: {
          pixelSize: 18,
          color: Cesium.Color.fromCssColorString('#f59e0b'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
        },
        label: {
          text: `[ 🎯 INTERCEPT: ${pred.nextWaypoint.name} ]\nETA ${pred.nextWaypoint.etaSeconds}s · ${pred.speedKmh} km/h ${pred.cardinal} · PROB ${pred.confidence}%`,
          font: 'bold 11px JetBrains Mono, monospace, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#fbbf24'),
          outlineColor: Cesium.Color.fromCssColorString('#070b12'),
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 60000),
        },
      })
      entitiesRef.current.set('intercept-beacon', beacon)

      // D. Tactical Virtual Cordon Perimeter Ring
      if (cordonActive) {
        const cordonEntity = viewer.entities.add({
          id: 'tactical-cordon-boundary',
          name: 'Tactical Perimeter Cordon',
          position: Cesium.Cartesian3.fromDegrees(pred.cordonCenter.lon, pred.cordonCenter.lat, 5),
          ellipse: {
            semiMinorAxis: pred.cordonRadiusMeters,
            semiMajorAxis: pred.cordonRadiusMeters,
            material: Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.18),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#ef4444'),
            outlineWidth: 3,
          },
          label: {
            text: `[ ⛔ PERIMETER CORDON ENGAGED: LOCKDOWN SECTOR ]\nRADIUS ${pred.cordonRadiusMeters}m · UNITS EN ROUTE`,
            font: 'bold 12px JetBrains Mono, monospace, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#ef4444'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 4,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.TOP,
            pixelOffset: new Cesium.Cartesian2(0, 20),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 80000),
          },
        })
        entitiesRef.current.set('tactical-cordon-boundary', cordonEntity)
      }
    }
  }, [cameras, selected, highlight, showCones, interceptionPrediction, cordonActive])

  // 5. In-Scene 3D Video Projection Plane
  useEffect(() => {
    if (!projectionManagerRef.current) return

    if (showProjectionPlane && selected) {
      const idx = cameras.findIndex((c) => c.id === selected)
      const activeCam = cameras[idx]
      if (activeCam) {
        const headingDeg = (idx * 55) % 360
        projectionManagerRef.current.updateProjection(
          {
            ...activeCam,
            headingDeg,
            pitchDeg: -22,
            fovDeg: 68,
            rangeM: 220,
            mountHeightM: 20,
          },
          activeVideoElement
        )
      }
    } else {
      projectionManagerRef.current.updateProjection(null, null)
    }
  }, [selected, showProjectionPlane, activeVideoElement, cameras])

  // 6. Camera flight on target selection / focus (Only fly once when selection actually changes)
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const flightKey = selected ? `cam:${selected}` : focus.length > 1 ? `focus:${focus.join(',')}` : ''
    if (!flightKey || flightKey === lastFlightTargetRef.current) {
      return
    }
    lastFlightTargetRef.current = flightKey

    if (selected) {
      const targetCam = cameras.find((c) => c.id === selected)
      if (targetCam) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(targetCam.lon, targetCam.lat - 0.007, 750),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-40),
            roll: 0.0,
          },
          duration: 1.2,
        })
      }
    } else if (focus.length > 1) {
      const lats = focus.map((id) => cameras.find((c) => c.id === id)?.lat || 0).filter(Boolean)
      const lons = focus.map((id) => cameras.find((c) => c.id === id)?.lon || 0).filter(Boolean)
      if (lats.length && lons.length) {
        const minLat = Math.min(...lats)
        const maxLat = Math.max(...lats)
        const minLon = Math.min(...lons)
        const maxLon = Math.max(...lons)
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            (minLon + maxLon) / 2,
            (minLat + maxLat) / 2 - 0.015,
            3500
          ),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0.0,
          },
          duration: 1.2,
        })
      }
    }
  }, [selected, focus])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
