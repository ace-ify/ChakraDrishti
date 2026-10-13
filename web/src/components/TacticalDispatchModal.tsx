import { useEffect, useRef, useState } from 'react'
import type { InterceptionPrediction } from '../live/interception'
import type { Vehicle } from '../data'
import { vehicleTitle } from '../data'
import { tacticalAudio } from '../live/tacticalAudio'

interface TacticalDispatchModalProps {
  vehicle: Vehicle
  prediction: InterceptionPrediction | null
  camName: (id: string) => string
  onClose: () => void
  onCordonToggle: (active: boolean) => void
  cordonActive: boolean
}

interface RadioMessage {
  id: string
  speaker: string
  role: 'field' | 'control' | 'ai'
  text: string
  time: string
}

export default function TacticalDispatchModal({
  vehicle,
  prediction,
  camName,
  onClose,
  onCordonToggle,
  cordonActive,
}: TacticalDispatchModalProps) {
  const [messages, setMessages] = useState<RadioMessage[]>([])
  const [isTransmitting, setIsTransmitting] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [isMuted, setIsMuted] = useState(tacticalAudio.getMuted())
  const [audioLevel, setAudioLevel] = useState<number[]>([12, 28, 45, 60, 32, 18, 55, 78, 40, 22])
  const [roadblockDeployed, setRoadblockDeployed] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  const title = vehicleTitle(vehicle)
  const etaSec = prediction?.nextWaypoint.etaSeconds ?? 45
  const interceptLoc = prediction?.nextWaypoint.name ?? 'Next Intersection'

  const formatEta = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Animate audio waveform
  useEffect(() => {
    const timer = setInterval(() => {
      setAudioLevel(Array.from({ length: 12 }, () => Math.floor(Math.random() * 70) + 10))
    }, 120)
    return () => clearInterval(timer)
  }, [])

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initial radio connection & voice transmission sequence
  useEffect(() => {
    tacticalAudio.playRadioChirp()
    tacticalAudio.playRadioStatic(0.2)

    const nowStr = new Date().toLocaleTimeString([], { hour12: false })
    const initMsg: RadioMessage = {
      id: 'msg-1',
      speaker: 'UNIT 7 (PCR PATROL DELTA)',
      role: 'field',
      text: `Control Room, Unit 7 responding on Channel 4. Receiving telemetry for target ${title}. Target heading ${prediction?.cardinal ?? 'NE'} towards ${interceptLoc}. ETA ${etaSec} seconds.`,
      time: nowStr,
    }

    setMessages([initMsg])

    // Speak initial message through tactical radio voice
    const timer = setTimeout(() => {
      tacticalAudio.speakRadioMessage(
        `Control Room, Unit 7 responding. Target ${title} heading towards ${interceptLoc}. Interception ETA ${etaSec} seconds. Standing by for roadblock authorization.`
      )
    }, 600)

    return () => {
      clearTimeout(timer)
      tacticalAudio.stopSpeaking()
    }
  }, [])

  // Transmit command
  const sendTransmission = (text: string, isFromOfficer: boolean = false) => {
    if (!text.trim()) return

    const nowStr = new Date().toLocaleTimeString([], { hour12: false })
    const userMsg: RadioMessage = {
      id: `msg-${Date.now()}`,
      speaker: isFromOfficer ? 'INVESTIGATING OFFICER (HQ)' : 'GRID DISPATCH AI',
      role: isFromOfficer ? 'control' : 'ai',
      text,
      time: nowStr,
    }

    setMessages((prev) => [...prev, userMsg])
    tacticalAudio.playRadioChirp()
    setCustomInput('')

    // Field unit responds in 1.5 seconds
    setTimeout(() => {
      tacticalAudio.playRadioStatic(0.18)
      const fieldReply = getFieldReply(text)
      const replyMsg: RadioMessage = {
        id: `msg-${Date.now() + 1}`,
        speaker: 'UNIT 7 (PCR PATROL DELTA)',
        role: 'field',
        text: fieldReply,
        time: new Date().toLocaleTimeString([], { hour12: false }),
      }
      setMessages((prev) => [...prev, replyMsg])
      tacticalAudio.speakRadioMessage(fieldReply)
    }, 1200)
  }

  const getFieldReply = (command: string) => {
    const lower = command.toLowerCase()
    if (lower.includes('roadblock') || lower.includes('spike')) {
      setRoadblockDeployed(true)
      return `Copy that HQ! Tire deflation spikes deployed across ${interceptLoc}. Interception lane locked.`
    }
    if (lower.includes('cordon') || lower.includes('lockdown') || lower.includes('seal')) {
      onCordonToggle(true)
      return `Unit 7 confirms perimeter cordon lock. Secondary patrol units 4 and 9 holding cross-streets.`
    }
    if (lower.includes('backup') || lower.includes('air') || lower.includes('drone')) {
      return `Copy HQ, requesting drone thermal grid overhead. Maintaining visual pursuit at safe distance.`
    }
    return `Copy that Control Room. Unit 7 holding tactical position near ${interceptLoc}. Telemetry matched.`
  }

  // Push-to-Talk via Web Speech API
  const startPTT = () => {
    setIsTransmitting(true)
    tacticalAudio.playRadioChirp()
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRec) {
      try {
        const sr = new SpeechRec()
        sr.lang = 'en-US'
        sr.interimResults = false
        sr.onresult = (e: any) => {
          const t = e.results[0][0].transcript
          if (t) sendTransmission(t, true)
        }
        sr.onend = () => setIsTransmitting(false)
        sr.onerror = () => setIsTransmitting(false)
        sr.start()
      } catch {
        setIsTransmitting(false)
      }
    } else {
      setTimeout(() => setIsTransmitting(false), 800)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(5, 10, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="neu-card"
        style={{
          width: '100%',
          maxWidth: 680,
          background: 'var(--panel)',
          borderRadius: 16,
          boxShadow: 'var(--neu-shadow-floating), 0 0 40px rgba(245, 158, 11, 0.25)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            background: 'var(--panel-2)',
            borderBottom: '1px solid var(--line-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="blink" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--rose)' }} />
            <div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', letterSpacing: 0.5 }}>
                📻 TACTICAL RADIO HOTLINE // VHF 154.680 MHz
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
                ENCRYPTED PATROL DISPATCH NET · PCR UNIT 7 (INTERCEPT CAR)
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn mono"
              onClick={() => {
                const next = !isMuted
                setIsMuted(next)
                tacticalAudio.setMuted(next)
              }}
              style={{ fontSize: 11, padding: '4px 10px', minHeight: 28 }}
            >
              {isMuted ? '🔇 VOICE MUTED' : '🔊 VOICE ON'}
            </button>
            <button
              className="btn mono"
              onClick={onClose}
              aria-label="Disconnect radio"
              style={{ fontSize: 11, padding: '4px 12px', minHeight: 28 }}
            >
              ✕ DISCONNECT
            </button>
          </div>
        </div>

        {/* Telemetry Summary Banner */}
        <div
          className="neu-inset"
          style={{
            margin: '12px 18px 0',
            padding: '10px 14px',
            borderRadius: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10,
            fontSize: 11,
          }}
        >
          <div>
            <div className="mono" style={{ color: 'var(--dim)', fontSize: 9 }}>TARGET VEHICLE</div>
            <div style={{ fontWeight: 800, color: 'var(--text)' }}>{title}</div>
          </div>
          <div>
            <div className="mono" style={{ color: 'var(--dim)', fontSize: 9 }}>LAST CONTACT</div>
            <div style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {prediction ? camName(prediction.lastCam.id) : 'Active Feed'}
            </div>
          </div>
          <div>
            <div className="mono" style={{ color: 'var(--dim)', fontSize: 9 }}>SPEED & HEADING</div>
            <div className="mono" style={{ fontWeight: 700, color: 'var(--teal)' }}>
              {prediction?.speedKmh ?? 54} km/h · {prediction?.cardinal ?? 'NE'} ({prediction?.headingDeg ?? 45}°)
            </div>
          </div>
          <div>
            <div className="mono" style={{ color: 'var(--dim)', fontSize: 9 }}>INTERCEPT POINT</div>
            <div style={{ fontWeight: 700, color: 'var(--amber)' }}>{interceptLoc}</div>
          </div>
          <div>
            <div className="mono" style={{ color: 'var(--dim)', fontSize: 9 }}>ETA COUNTDOWN</div>
            <div className="mono" style={{ fontWeight: 800, color: 'var(--rose)', fontSize: 13 }}>
              {formatEta(etaSec)}
            </div>
          </div>
        </div>

        {/* Radio Audio Waveform Visualizer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            height: 38,
            padding: '4px 18px',
            background: 'rgba(0,0,0,0.25)',
            marginTop: 10,
          }}
        >
          <span className="mono" style={{ fontSize: 9, color: 'var(--dim)', marginRight: 8 }}>CARRIER: ACTIVE</span>
          {audioLevel.map((h, i) => (
            <div
              key={i}
              style={{
                width: 4,
                height: `${h}%`,
                background: isTransmitting ? 'var(--rose)' : 'var(--amber)',
                borderRadius: 2,
                transition: 'height 0.1s ease',
              }}
            />
          ))}
          <span className="mono" style={{ fontSize: 9, color: isTransmitting ? 'var(--rose)' : 'var(--amber)', marginLeft: 8 }}>
            {isTransmitting ? '🎙️ TX (TRANSMITTING)' : 'RX (MONITORING)'}
          </span>
        </div>

        {/* Live Radio Messages Scroll Area */}
        <div
          className="neu-inset"
          style={{
            flex: 1,
            minHeight: 200,
            maxHeight: 280,
            overflowY: 'auto',
            margin: '10px 18px',
            padding: 12,
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {messages.map((m) => {
            const isField = m.role === 'field'
            const isControl = m.role === 'control'
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isControl ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: isField
                    ? 'rgba(245, 158, 11, 0.12)'
                    : isControl
                    ? 'rgba(94, 234, 212, 0.15)'
                    : 'rgba(167, 139, 250, 0.12)',
                  border: isField
                    ? '1px solid rgba(245, 158, 11, 0.3)'
                    : isControl
                    ? '1px solid rgba(94, 234, 212, 0.35)'
                    : '1px solid rgba(167, 139, 250, 0.3)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: isField ? 'var(--amber)' : isControl ? 'var(--teal)' : 'var(--purple)',
                    }}
                  >
                    {m.speaker}
                  </span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>
                    {m.time}
                  </span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text)' }}>{m.text}</div>
              </div>
            )
          })}
          <div ref={logEndRef} />
        </div>

        {/* Quick Tactical Preset Directives */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 18px 8px' }}>
          <button
            className="btn mono"
            onClick={() => sendTransmission('Unit 7, authorize spike strips and roadblock at interception point.', true)}
            style={{
              fontSize: 10,
              padding: '3px 8px',
              minHeight: 26,
              background: roadblockDeployed ? 'rgba(239, 68, 68, 0.2)' : undefined,
              borderColor: roadblockDeployed ? 'var(--rose)' : undefined,
            }}
          >
            🚧 {roadblockDeployed ? 'ROADBLOCK ACTIVE (नाकाबंदी चालू)' : 'DEPLOY ROADBLOCK SPIKES (नाकाबंदी लगाएं)'}
          </button>
          <button
            className="btn mono"
            onClick={() => {
              onCordonToggle(!cordonActive)
              sendTransmission(cordonActive ? 'HQ orders: lift perimeter roadblocks.' : `HQ orders: seal perimeter radius ${prediction?.cordonRadiusMeters ?? 450}m.`, true)
            }}
            style={{
              fontSize: 10,
              padding: '3px 8px',
              minHeight: 26,
              background: cordonActive ? 'rgba(239, 68, 68, 0.2)' : undefined,
              borderColor: cordonActive ? 'var(--rose)' : undefined,
            }}
          >
            ⛔ {cordonActive ? '✕ LIFT ROADBLOCKS (नाकाबंदी हटाएं)' : '🚨 SEAL PERIMETER (घेराबंदी लगाएं)'}
          </button>
          <button
            className="btn mono"
            onClick={() => sendTransmission('Unit 7, dispatch aerial recon drone overhead for thermal tracking.', true)}
            style={{ fontSize: 10, padding: '3px 8px', minHeight: 26 }}
          >
            🚨 REQUEST AIR RECON
          </button>
        </div>

        {/* Transmission Input Bar & PTT Button */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 18px 16px',
            borderTop: '1px solid var(--line-2)',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="btn btn-primary mono"
            onClick={startPTT}
            title="Press to Speak over Radio (Push-To-Talk)"
            style={{
              minHeight: 38,
              padding: '0 14px',
              fontSize: 11,
              fontWeight: 800,
              background: isTransmitting ? 'var(--rose)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#000',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>🎙️</span>
            <span>{isTransmitting ? 'RECORDING…' : 'PUSH TO TALK (PTT)'}</span>
          </button>

          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendTransmission(customInput, true)
            }}
            placeholder="Type tactical directive or message to Unit 7…"
            style={{
              flex: 1,
              height: 38,
              padding: '0 12px',
              borderRadius: 8,
              background: 'var(--panel-2)',
              border: '1px solid var(--line-2)',
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'var(--sans)',
              outline: 'none',
            }}
          />

          <button
            type="button"
            className="btn mono"
            onClick={() => sendTransmission(customInput, true)}
            disabled={!customInput.trim()}
            style={{ minHeight: 38, padding: '0 14px', fontSize: 11, fontWeight: 700 }}
          >
            TRANSMIT
          </button>
        </div>
      </div>
    </div>
  )
}
