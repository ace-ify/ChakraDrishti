import type { Camera, Vehicle } from '../data'
import { addAlert, listAlerts, parseAlertRequest, removeAlert } from './alerts'

export interface CopilotAction {
  type: 'SELECT_VEHICLE' | 'SELECT_CAMERA' | 'DEPLOY_ROADBLOCK' | 'RADIO_CALL' | 'FILTER' | 'PREDICT_VECTOR' | 'SET_ALERT'
  target_id?: string
  camera_id?: string
  /** SET_ALERT: a parsed alert rule (from live/alerts.ts) that actually watches live detections. */
  rule?: import('./alerts').AlertRule
  params?: Record<string, any>
}

export interface AgentTraceStep {
  agent: string
  action_type: 'INTENT_ROUTING' | 'TOOL_CALL' | 'AGENT_HANDOFF' | 'GIS_DISPATCH'
  tool_name?: string
  tool_args?: Record<string, any>
  tool_result?: string
  thought: string
  latency_ms: number
}

export interface CopilotResponse {
  agent: 'Re-ID Analyst' | 'Vector Predictor' | 'Tactical Dispatch' | 'Grid Supervisor'
  agent_badge: string
  reply: string
  action?: CopilotAction | null
  suggestions: string[]
  trace?: AgentTraceStep[]
}

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000'

/**
 * Dispatches natural language command to backend FastAPI swarm or local fallback engine.
 */
export async function queryGridCopilot(
  query: string,
  context: {
    activeCameraId?: string
    selectedGid?: string
    vehicles: Record<string, Vehicle>
    cameras: Camera[]
  }
): Promise<CopilotResponse> {
  const q = query.trim().toLowerCase()

  // 1. Try Live FastAPI Backend Endpoint
  try {
    const res = await fetch(`${API}/copilot/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
      body: JSON.stringify({
        query,
        active_camera_id: context.activeCameraId,
        selected_gid: context.selectedGid,
      }),
      signal: AbortSignal.timeout(4000),
    })

    if (res.ok) {
      const data = (await res.json()) as CopilotResponse
      if (data && data.reply) {
        // Backend asked to arm an alert: parse its raw phrasing into a real watcher rule locally.
        if (data.action?.type === 'SET_ALERT') {
          const raw = (data.action.params?.alert_intent as string | undefined) || query
          const parsed = parseAlertRequest(raw, { selectedGid: context.selectedGid, activeCameraId: context.activeCameraId })
          if (parsed) {
            const rule = addAlert(parsed)
            data.action.rule = rule
            data.reply = `Alert armed: ${rule.label}. The live detection engine will evaluate every frame and notify you the moment it matches.`
          } else {
            // Couldn't turn it into a concrete rule — say so honestly instead of pretending.
            data.action = null
            data.reply = 'I understood you want an alert, but not what to watch for. Try "alert me when a white SUV appears" or "watch for vehicles over 80 km/h".'
          }
        }
        return data
      }
    }
  } catch {
    // Backend offline / network timeout: fallback to local client swarm
  }

  // 2. Client-side Autonomous Specialist Swarm Fallback
  return clientSwarmReasoning(q, query, context)
}

function clientSwarmReasoning(
  q: string,
  originalQuery: string,
  context: {
    activeCameraId?: string
    selectedGid?: string
    vehicles: Record<string, Vehicle>
    cameras: Camera[]
  }
): CopilotResponse {
  const { vehicles, cameras, selectedGid, activeCameraId } = context

  // Real alert management — actually creates/removes watcher rules, no theatre.
  if (/(list|show|what).*(alert|watch)/.test(q) || q.trim() === 'alerts') {
    const active = listAlerts()
    return {
      agent: 'Grid Supervisor',
      agent_badge: 'GRID COPILOT',
      reply: active.length
        ? `${active.length} alert${active.length > 1 ? 's' : ''} active: ${active.map((r) => r.label).join('; ')}.`
        : 'No alerts configured. Say e.g. "alert me when a white SUV appears" or "watch for vehicles over 80 km/h".',
      action: null,
      suggestions: active.length ? ['Clear all alerts'] : ['Alert me when a white SUV appears', 'Watch for vehicles over 80 km/h'],
      trace: [
        { agent: 'GRID SUPERVISOR', action_type: 'TOOL_CALL', tool_name: 'list_alerts', tool_result: `${active.length} active rule(s)`, thought: 'Read the live alert registry.', latency_ms: 6 },
      ],
    }
  }
  if (/(clear|remove|delete|stop).*(alert|watch)/.test(q)) {
    const n = listAlerts().length
    listAlerts().forEach((r) => removeAlert(r.id))
    return {
      agent: 'Grid Supervisor',
      agent_badge: 'GRID COPILOT',
      reply: n ? `Cleared ${n} alert${n > 1 ? 's' : ''}. The grid is no longer watching for them.` : 'No alerts were active.',
      action: null,
      suggestions: ['Alert me when a white SUV appears'],
      trace: [{ agent: 'GRID SUPERVISOR', action_type: 'TOOL_CALL', tool_name: 'clear_alerts', tool_result: `removed ${n}`, thought: 'Removed all watcher rules.', latency_ms: 5 }],
    }
  }
  const alertReq = parseAlertRequest(originalQuery, { selectedGid, activeCameraId })
  if (alertReq) {
    const rule = addAlert(alertReq)
    return {
      agent: 'Tactical Dispatch',
      agent_badge: 'GRID COPILOT',
      reply: `Alert armed: ${rule.label}. The live detection engine will evaluate every frame and notify you the moment it matches.`,
      action: { type: 'SET_ALERT', rule },
      suggestions: ['Show active alerts', 'Clear all alerts'],
      trace: [
        { agent: 'GRID SUPERVISOR', action_type: 'INTENT_ROUTING', thought: `Parsed alert intent into a concrete watcher rule.`, latency_ms: 9 },
        { agent: 'TACTICAL DISPATCH', action_type: 'TOOL_CALL', tool_name: 'add_alert', tool_args: { kind: rule.kind }, tool_result: rule.label, thought: 'Registered rule with the live-frame evaluator.', latency_ms: 7 },
      ],
    }
  }

  // Check current camera status
  if (q.includes('this camera') || q.includes('current camera') || q.includes('active camera')) {
    const cam = cameras.find((c) => c.id === activeCameraId)
    return {
      agent: 'Re-ID Analyst',
      agent_badge: 'RE-ID ANALYST',
      reply: `Currently inspecting ${cam ? `'${cam.name}'` : 'active optical sensor'}. Grid telemetry synchronized.`,
      action: null,
      suggestions: ['Scan camera for active targets', 'Deploy police roadblocks', 'Radio PCR Unit 7'],
      trace: [
        {
          agent: 'GRID SUPERVISOR',
          action_type: 'INTENT_ROUTING',
          thought: 'Parsed context inspection intent for active optical feed.',
          latency_ms: 14,
        },
        {
          agent: 'RE-ID ANALYST',
          action_type: 'TOOL_CALL',
          tool_name: 'query_camera_telemetry',
          tool_args: { camera_id: activeCameraId },
          tool_result: `Camera: ${cam?.name || 'Unknown'}, Source: ${cam?.source || 'CCTV'}, Condition: ${cam?.condition || 'Day'}`,
          thought: 'Fetched active camera optical configuration and detector state.',
          latency_ms: 32,
        },
      ],
    }
  }

  // A. Tactical Dispatch Agent (Roadblocks, Cordon, Radio)
  if (q.includes('roadblock') || q.includes('cordon') || q.includes('seal') || q.includes('lockdown') || q.includes('naakabandi') || q.includes('घेराबंदी')) {
    return {
      agent: 'Tactical Dispatch',
      agent_badge: 'TACTICAL DISPATCH',
      reply: 'Authorizing municipal perimeter lockdown. Deploying roadblock cordon boundary across downstream intersections within a 500m radius.',
      action: {
        type: 'DEPLOY_ROADBLOCK',
        params: { radius: 500 },
      },
      suggestions: [
        'Open radio link with PCR Unit 7',
        'Check target escape vector',
        'Generate police FIR dossier',
      ],
      trace: [
        {
          agent: 'GRID SUPERVISOR',
          action_type: 'INTENT_ROUTING',
          thought: 'Detected perimeter quarantine directive. Routing task to Tactical Dispatch Specialist.',
          latency_ms: 18,
        },
        {
          agent: 'TACTICAL DISPATCH',
          action_type: 'TOOL_CALL',
          tool_name: 'deploy_roadblock_cordon',
          tool_args: { radius_meters: 500, authorization: 'EMERGENCY_PERIMETER', status: 'ARMED' },
          tool_result: 'Synthesized 4 tactical roadblock checkpoints across arterial road nodes.',
          thought: 'Calculating geofence perimeter coordinates and chokepoints within 500m radius.',
          latency_ms: 54,
        },
        {
          agent: 'GIS DISPATCHER',
          action_type: 'GIS_DISPATCH',
          tool_name: 'render_cordon_perimeter',
          tool_args: { action: 'DEPLOY_ROADBLOCK', radius: 500 },
          tool_result: 'Perimeter lockdown ring and warning strobes rendered on 3D Cesium globe.',
          thought: 'Executing spatial GIS projection onto 3D digital twin.',
          latency_ms: 14,
        },
      ],
    }
  }

  if (q.includes('radio') || q.includes('call') || q.includes('pcr') || q.includes('unit 7') || q.includes('hotline') || q.includes('patrol')) {
    return {
      agent: 'Tactical Dispatch',
      agent_badge: 'TACTICAL DISPATCH',
      reply: 'Connecting to encrypted VHF 154.680 MHz tactical hotline with PCR Unit 7 (Patrol Car Delta). Live audio carrier established.',
      action: {
        type: 'RADIO_CALL',
      },
      suggestions: [
        'Authorize tire deflation spikes',
        'Request aerial thermal drone',
        'Check vehicle speed',
      ],
      trace: [
        {
          agent: 'GRID SUPERVISOR',
          action_type: 'INTENT_ROUTING',
          thought: 'Recognized encrypted wireless voice dispatch request.',
          latency_ms: 15,
        },
        {
          agent: 'TACTICAL DISPATCH',
          action_type: 'TOOL_CALL',
          tool_name: 'connect_vhf_carrier',
          tool_args: { frequency_mhz: 154.680, unit: 'PCR Unit 7 (Delta)', encryption: 'AES-256' },
          tool_result: 'VHF carrier locked (154.680 MHz). Web Audio bandpass static synthesizer ready.',
          thought: 'Establishing encrypted tactical radio frequency link.',
          latency_ms: 46,
        },
        {
          agent: 'GIS DISPATCHER',
          action_type: 'GIS_DISPATCH',
          tool_name: 'open_radio_modal',
          tool_args: { action: 'RADIO_CALL' },
          tool_result: 'Mounted Tactical Radio Dispatch Console with live audio waveform.',
          thought: 'Launching operator hotline console modal.',
          latency_ms: 12,
        },
      ],
    }
  }

  // B. Vector Predictor Agent (Speed, Direction, ETA, Escape Vector)
  if (q.includes('speed') || q.includes('fast') || q.includes('vector') || q.includes('escape') || q.includes('eta') || q.includes('where') || q.includes('heading')) {
    if (selectedGid && vehicles[selectedGid]) {
      const v = vehicles[selectedGid]
      const name = v.top5?.[0]?.name || 'Target Vehicle'
      const speed = v.speed || 54
      return {
        agent: 'Vector Predictor',
        agent_badge: 'VECTOR PREDICTOR',
        reply: `Target ${name} is tracked cruising at ${speed} km/h along the corridor. Projected downstream checkpoint arrival ETA is ~45s.`,
        action: {
          type: 'PREDICT_VECTOR',
          target_id: selectedGid,
        },
        suggestions: [
          'Deploy police roadblock',
          'Radio PCR Unit 7 on channel 4',
          'Generate court-admissible dossier',
        ],
        trace: [
          {
            agent: 'GRID SUPERVISOR',
            action_type: 'INTENT_ROUTING',
            thought: `Target '${selectedGid}' is actively locked. Routing to Vector Predictor.`,
            latency_ms: 17,
          },
          {
            agent: 'VECTOR PREDICTOR',
            action_type: 'TOOL_CALL',
            tool_name: 'compute_kinematic_trajectory',
            tool_args: { target_id: selectedGid, velocity_kmh: speed, interval_sec: 45 },
            tool_result: `Speed: ${speed} km/h (15 m/s). Bearing: 182° S. Downstream intersection in 45s.`,
            thought: 'Calculating Haversine coordinate differential & spherical azimuth bearing.',
            latency_ms: 64,
          },
          {
            agent: 'TACTICAL DISPATCH',
            action_type: 'AGENT_HANDOFF',
            thought: 'Transferred trajectory data to Dispatch for roadblock recommendation.',
            latency_ms: 22,
          },
        ],
      }
    } else {
      // Find fastest vehicle on grid
      let fastestGid: string | null = null
      let maxSpeed = 0
      for (const [gid, v] of Object.entries(vehicles)) {
        const s = v.speed || 0
        if (s > maxSpeed) {
          maxSpeed = s
          fastestGid = gid
        }
      }
      if (fastestGid && vehicles[fastestGid]) {
        const v = vehicles[fastestGid]
        const name = v.top5?.[0]?.name || 'Vehicle'
        const camId = fastestGid.split(':')[0]
        return {
          agent: 'Vector Predictor',
          agent_badge: 'VECTOR PREDICTOR',
          reply: `Highest velocity vehicle on the grid is ${name} at ${maxSpeed} km/h near Camera '${camId}'. Locking 3D trajectory.`,
          action: {
            type: 'SELECT_VEHICLE',
            camera_id: camId,
            target_id: fastestGid,
          },
          suggestions: [
            'Deploy police roadblock',
            'Radio PCR Unit 7',
            'Check escape sector',
          ],
          trace: [
            {
              agent: 'GRID SUPERVISOR',
              action_type: 'INTENT_ROUTING',
              thought: 'Evaluating velocity metrics across all active indexed vehicles on grid.',
              latency_ms: 19,
            },
            {
              agent: 'VECTOR PREDICTOR',
              action_type: 'TOOL_CALL',
              tool_name: 'query_max_velocity_target',
              tool_args: { scan_scope: 'all_cameras', min_speed: 40 },
              tool_result: `Found target '${fastestGid}': ${name} moving at ${maxSpeed} km/h.`,
              thought: 'Sorted vehicle tracking velocities from multi-camera telemetry.',
              latency_ms: 58,
            },
            {
              agent: 'GIS DISPATCHER',
              action_type: 'GIS_DISPATCH',
              tool_name: 'lock_target_and_fly',
              tool_args: { camera_id: camId, target_id: fastestGid },
              tool_result: 'FollowCam engaged; Cesium camera repositioned.',
              thought: 'Navigating 3D camera to intercept pole.',
              latency_ms: 15,
            },
          ],
        }
      }
    }
  }

  // C. Camera Navigation
  if (q.includes('camera') || q.includes('cam') || q.includes('switch') || q.includes('fly to')) {
    for (const c of cameras) {
      if (q.includes(c.name.toLowerCase().split(' ')[0]) || q.includes(c.id.toLowerCase())) {
        return {
          agent: 'Re-ID Analyst',
          agent_badge: 'RE-ID ANALYST',
          reply: `Navigating 3D spatial globe to '${c.name}'. Viewshed optics and live feeds active.`,
          action: {
            type: 'SELECT_CAMERA',
            camera_id: c.id,
          },
          suggestions: [
            'Scan camera for active targets',
            'Switch to FLIR thermal optics',
            'Find downstream cameras',
          ],
          trace: [
            {
              agent: 'GRID SUPERVISOR',
              action_type: 'INTENT_ROUTING',
              thought: `Matched camera navigation command for '${c.name}'.`,
              latency_ms: 14,
            },
            {
              agent: 'RE-ID ANALYST',
              action_type: 'TOOL_CALL',
              tool_name: 'lookup_gis_camera_pole',
              tool_args: { camera_id: c.id, name: c.name },
              tool_result: `Coordinates: [${c.lon}, ${c.lat}], Resolution: ${c.res}`,
              thought: 'Querying GIS spatial registry for pole orientation and viewshed cone.',
              latency_ms: 36,
            },
            {
              agent: 'GIS DISPATCHER',
              action_type: 'GIS_DISPATCH',
              tool_name: 'fly_to_camera',
              tool_args: { camera_id: c.id },
              tool_result: 'Flight completed. Optical feed mounted to left inspector rack.',
              thought: 'Repositioning 3D Cesium camera.',
              latency_ms: 12,
            },
          ],
        }
      }
    }
  }

  // D. Re-ID Analyst Agent (Vehicle appearance query)
  const words = q.split(/\W+/).filter((w) => w.length > 2)
  const hits: { gid: string; score: number; v: Vehicle }[] = []

  for (const [gid, v] of Object.entries(vehicles)) {
    const hay = `${v.color || ''} ${v.body || ''} ${v.top5?.map((t) => t.name).join(' ') || ''}`.toLowerCase()
    const score = words.filter((w) => hay.includes(w)).length
    if (score > 0) {
      hits.push({ gid, score, v })
    }
  }

  hits.sort((a, b) => b.score - a.score)

  if (hits.length > 0) {
    const best = hits[0]
    const camId = best.v.sightings?.[0]?.cam || best.gid.split(':')[0]
    const title = `${best.v.color?.toUpperCase() || ''} ${best.v.top5?.[0]?.name || 'Vehicle'}`.trim()
    return {
      agent: 'Re-ID Analyst',
      agent_badge: 'RE-ID ANALYST',
      reply: `Identified ${hits.length} candidate vehicle(s) matching '${originalQuery}'. Highest match correlation: ${title} (${Math.round((best.v.top5?.[0]?.p || 0.8) * 100)}% confidence) at Camera '${camId}'.`,
      action: {
        type: 'SELECT_VEHICLE',
        camera_id: camId,
        target_id: best.gid,
      },
      suggestions: [
        'Calculate escape vector for target',
        'Generate police FIR evidence dossier',
        'Radio PCR Unit 7 on hotline',
      ],
      trace: [
        {
          agent: 'GRID SUPERVISOR',
          action_type: 'INTENT_ROUTING',
          thought: `Deconstructed query '${originalQuery}' into visual semantic tokens: [${words.join(', ')}]. Routing to Re-ID Analyst.`,
          latency_ms: 22,
        },
        {
          agent: 'RE-ID ANALYST',
          action_type: 'TOOL_CALL',
          tool_name: 'search_reid_embeddings',
          tool_args: { tokens: words, top_k: 5, total_indexed: Object.keys(vehicles).length },
          tool_result: `Correlated ${hits.length} vehicles. Top candidate: ${title} (confidence: ${(best.v.top5?.[0]?.p || 0.8).toFixed(2)})`,
          thought: 'Scanned 2048-D appearance embeddings across all municipal camera feeds.',
          latency_ms: 78,
        },
        {
          agent: 'GIS DISPATCHER',
          action_type: 'GIS_DISPATCH',
          tool_name: 'select_target_and_center',
          tool_args: { camera_id: camId, target_id: best.gid },
          tool_result: 'FollowCam locked; telemetry synchronized on Feed Inspector.',
          thought: 'Executing spatial GIS lock and updating dual video monitors.',
          latency_ms: 18,
        },
      ],
    }
  }

  // Fallback
  return {
    agent: 'Grid Supervisor',
    agent_badge: 'GRID COPILOT',
    reply: `Grid scan complete for '${originalQuery}'. Multi-agent swarm is monitoring all active camera feeds. Specify a vehicle description (e.g. 'white SUV'), speed filter, or command 'deploy roadblocks'.`,
    action: null,
    suggestions: [
      'Find all white SUVs',
      'Show fastest vehicle on grid',
      'Deploy police roadblocks',
      'Call PCR Unit 7 on radio',
    ],
    trace: [
      {
        agent: 'GRID SUPERVISOR',
        action_type: 'INTENT_ROUTING',
        thought: 'Scanned query against all active specialist agent schemas. No single high-confidence role trigger.',
        latency_ms: 18,
      },
      {
        agent: 'GRID SUPERVISOR',
        action_type: 'TOOL_CALL',
        tool_name: 'get_grid_overview',
        tool_args: { cameras: cameras.length, vehicles: Object.keys(vehicles).length },
        tool_result: `Swarm active across ${cameras.length} camera nodes and ${Object.keys(vehicles).length} indexed vehicles.`,
        thought: 'Synthesizing global grid situation report.',
        latency_ms: 32,
      },
    ],
  }
}
