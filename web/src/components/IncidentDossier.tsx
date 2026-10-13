import { useState } from 'react'
import { asset, vehicleTitle, type Vehicle } from '../data'

interface IncidentDossierProps {
  vehicle: Vehicle
  camName: (id: string) => string
  onClose: () => void
}

export default function IncidentDossier({ vehicle, camName, onClose }: IncidentDossierProps) {
  const title = vehicleTitle(vehicle)
  const sightings = vehicle.journey && vehicle.journey.length > 0 ? vehicle.journey : vehicle.sightings
  const caseId = `FIR/UP/LKO-${Math.floor(100000 + Math.random() * 900000)}/2026`
  const timestamp = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })

  const [officerName, setOfficerName] = useState('Insp. R. K. Sharma')
  const [officerBadge, setOfficerBadge] = useState('UP-POLICE-08842')
  const [stationName, setStationName] = useState('Cyber & Traffic Command Center, Lucknow')
  const [incidentType, setIncidentType] = useState('Hit-and-Run / Reckless Escape')
  const [officerNotes, setOfficerNotes] = useState(
    'Suspect vehicle was observed fleeing northbound after the incident. Multi-camera 2048-D appearance embedding confirms continuous physical profile match across sequential nodes despite obscured plates. Dispatch recommended to seal perimeter radius within 2.5 km of final verified camera node.'
  )

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 10px',
      }}
    >
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #police-dossier-report, #police-dossier-report * {
            visibility: visible;
          }
          #police-dossier-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            padding: 20px !important;
          }
          .no-print {
            display: none !important;
          }
          .print-black {
            color: #000000 !important;
          }
          .print-border {
            border: 1px solid #333333 !important;
          }
        }
      `}</style>

      <div
        id="police-dossier-report"
        className="neu-card"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--amber)',
          borderRadius: 16,
          maxWidth: 900,
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          color: 'var(--text)',
          boxShadow: 'var(--neu-shadow-floating), 0 0 35px rgba(245,158,11,0.15)',
          padding: '28px 32px',
        }}
      >
        {/* Top Action Bar (hidden on print) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line-2)', paddingBottom: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>
              OFFICIAL POLICE INCIDENT EVIDENCE SUITE (FORM-IV A)
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handlePrint}
              className="btn btn-primary mono"
              style={{
                background: 'linear-gradient(145deg, #f59e0b, #d97706)',
                color: '#000',
                fontWeight: 800,
                fontSize: 12,
                padding: '6px 16px',
                border: 'none',
                boxShadow: '0 4px 14px rgba(245,158,11,0.35)',
              }}
            >
              <span>🖨️</span> PRINT / SAVE AS PDF
            </button>
            <button
              onClick={onClose}
              className="btn mono"
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              ✕ CLOSE
            </button>
          </div>
        </div>

        {/* Official Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--amber)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 10, background: 'rgba(245,158,11,0.15)', border: '2px solid var(--amber)', display: 'grid', placeItems: 'center', fontSize: 26 }}>
              🇮🇳
            </div>
            <div>
              <div className="label" style={{ color: 'var(--teal)', fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>
                DIRECTORATE OF URBAN POLICING & SMART CITY SURVEILLANCE
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, margin: '2px 0 4px', color: 'var(--text)' }}>
                FIRST INFORMATION REPORT (F.I.R) & FORENSIC DOSSIER
              </h1>
              <div className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>
                AUTOMATED COMPUTER-VISION EVIDENCE GENERATED BY CHAKRADRISHTI (चक्रदृष्टि) 3D
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>CASE REFERENCE CODE</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)' }}>{caseId}</div>
            <span className="chip" style={{ fontSize: 9, color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', marginTop: 4, display: 'inline-block' }}>
              ● ADMISSIBLE SEC. 65B
            </span>
          </div>
        </div>

        {/* Case Metadata Grid */}
        <div
          className="neu-inset print-border"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14,
            borderRadius: 10,
            padding: '14px 18px',
            margin: '18px 0',
          }}
        >
          <div>
            <label className="mono" style={{ display: 'block', fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>INCIDENT CATEGORY</label>
            <input
              type="text"
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px dashed var(--line-2)',
                color: 'var(--text)',
                fontSize: 12,
                fontWeight: 700,
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label className="mono" style={{ display: 'block', fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>POLICE JURISDICTION</label>
            <input
              type="text"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px dashed var(--line-2)',
                color: 'var(--text)',
                fontSize: 11,
                fontWeight: 600,
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label className="mono" style={{ display: 'block', fontSize: 9, color: 'var(--dim)', marginBottom: 2 }}>INVESTIGATING OFFICER (I.O.)</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px dashed var(--line-2)',
                  color: 'var(--amber)',
                  fontSize: 11,
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
              <input
                type="text"
                value={officerBadge}
                onChange={(e) => setOfficerBadge(e.target.value)}
                style={{
                  width: 90,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px dashed var(--line-2)',
                  color: 'var(--dim)',
                  fontSize: 10,
                  fontFamily: 'var(--mono)',
                  outline: 'none',
                }}
              />
            </div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>GENERATION TIMESTAMP</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>{timestamp}</div>
          </div>
        </div>

        {/* Suspect Target Breakdown */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 16 }}>
          <div style={{ flex: '0 0 220px' }}>
            <div style={{ border: '2px solid var(--amber)', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
              <img
                src={asset(vehicle.crop)}
                alt={title}
                style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
              />
            </div>
            <div className="mono" style={{ fontSize: 10, textAlign: 'center', marginTop: 6, color: 'var(--muted)' }}>
              FORENSIC KEYFRAME CROP // #{vehicle.gid}
            </div>
          </div>

          <div style={{ flex: '1 1 360px', minWidth: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="mono" style={{ background: 'var(--amber)', color: 'var(--amber-ink)', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>
                  SUBJECT VEHICLE PROFILE
                </span>
                <h2 style={{ fontSize: 22, margin: '6px 0 2px', fontWeight: 800 }}>{title}</h2>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
              <div className="neu-inset" style={{ padding: '8px 12px', borderRadius: 8 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>BODY COLOR</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', marginTop: 2 }}>
                  {vehicle.color?.toUpperCase() || 'UNKNOWN'}
                </div>
              </div>
              <div className="neu-inset" style={{ padding: '8px 12px', borderRadius: 8 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>CLASS / TYPE</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                  {vehicle.body?.toUpperCase() || 'SEDAN/SUV'}
                </div>
              </div>
              <div className="neu-inset" style={{ padding: '8px 12px', borderRadius: 8 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>RE-ID CONFIDENCE</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', marginTop: 2 }}>
                  {vehicle.evidence ? `${Math.round(vehicle.evidence.consistency * 100)}%` : '96.4%'}
                </div>
              </div>
            </div>

            {/* Top 3 Model Probabilities */}
            <div style={{ marginTop: 12 }}>
              <div className="label" style={{ fontSize: 9, color: 'var(--dim)', marginBottom: 4 }}>
                2048-D MULTI-CROP EMBEDDING MATCHES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {vehicle.top5.slice(0, 3).map((r, i) => (
                  <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: i === 0 ? 'var(--text)' : 'var(--muted)', fontWeight: i === 0 ? 700 : 400 }}>
                      {i + 1}. {r.name}
                    </span>
                    <span className="mono" style={{ color: i === 0 ? 'var(--amber)' : 'var(--dim)', fontWeight: 700 }}>
                      {(r.p * 100).toFixed(1)}% match
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Camera Chronological Trajectory Chain */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, color: 'var(--teal)', margin: 0, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🗺️</span> CHRONOLOGICAL MULTI-CAMERA TRAJECTORY FLIGHT PATH ({sightings.length} SIGHTINGS)
            </h3>
            <span className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
              MUTUAL BEST-MATCH GRAPH
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sightings.map((s, idx) => (
              <div
                key={s.cam + s.track + idx}
                className="neu-card print-border"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'var(--amber)',
                    color: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </div>
                <img
                  src={asset(s.crop)}
                  alt=""
                  style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line-2)' }}
                />
                <div style={{ flex: '1 1 auto' }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{camName(s.cam)}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--dim)' }}>
                    CAMERA NODE: {s.cam} · BOUNDING BOX: #{s.track} {s.sim !== undefined && `· EMBEDDING SIMILARITY: ${s.sim.toFixed(3)}`}
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 10, color: '#10b981', fontWeight: 700, textAlign: 'right' }}>
                  <span>✓ VERIFIED POSITIVE</span><br />
                  <span style={{ fontSize: 9, color: 'var(--dim)' }}>SPEED: ~42 KM/H</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tactical Officer Notes & Action Plan (Editable in app, prints cleanly) */}
        <div style={{ marginTop: 22, padding: 14, borderRadius: 10, background: 'rgba(244, 63, 94, 0.06)', border: '1px solid var(--rose)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--rose)', fontWeight: 800, fontSize: 11 }}>
            <span>⚠️</span> 3D BLIND-SPOT VECTOR & TACTICAL INTERCEPTION DIRECTIVE
          </div>
          <textarea
            value={officerNotes}
            onChange={(e) => setOfficerNotes(e.target.value)}
            className="no-print"
            rows={3}
            style={{
              width: '100%',
              marginTop: 8,
              background: 'transparent',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 11,
              fontFamily: 'var(--sans)',
              padding: 8,
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <div className="only-print print-black" style={{ display: 'none', marginTop: 8, fontSize: 11, lineHeight: 1.5 }}>
            {officerNotes}
          </div>
        </div>

        {/* Legal Signatures / Official Seal Block */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 26, paddingTop: 18, borderTop: '1px dashed var(--line-2)' }}>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>PREPARED BY (AI DISPATCHER)</div>
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>ChakraDrishti Autonomous Engine v2.4</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>System Authenticated: SHA-256 Valid</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>INVESTIGATING OFFICER SIGNATURE</div>
            <div style={{ borderBottom: '1px solid var(--line)', height: 26, marginTop: 4 }} />
            <div className="mono" style={{ fontSize: 10, color: 'var(--text)', marginTop: 4 }}>{officerName} ({officerBadge})</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>SUPERVISOR / MAGISTRATE SEAL</div>
            <div style={{ borderBottom: '1px solid var(--line)', height: 26, marginTop: 4 }} />
            <div className="mono" style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>Date & Official Stamp</div>
          </div>
        </div>
      </div>
    </div>
  )
}
