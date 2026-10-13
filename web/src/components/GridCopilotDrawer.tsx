import { useEffect, useRef, useState } from 'react'
import type { Camera, Vehicle } from '../data'
import { queryGridCopilot, type CopilotAction, type CopilotResponse } from '../live/gridCopilot'
import { tacticalAudio } from '../live/tacticalAudio'

interface GridCopilotDrawerProps {
  isOpen: boolean
  onClose: () => void
  cameras: Camera[]
  vehicles: Record<string, Vehicle>
  activeCameraId?: string
  selectedGid?: string
  onExecuteAction: (action: CopilotAction) => void
}

import type { AgentTraceStep } from '../live/gridCopilot'

interface ChatMessage {
  id: string
  sender: 'user' | 'agent'
  agentBadge?: string
  text: string
  time: string
  action?: CopilotAction | null
  suggestions?: string[]
  trace?: AgentTraceStep[]
}

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'RE-ID ANALYST': { bg: 'rgba(94, 234, 212, 0.12)', text: 'var(--teal)', border: 'rgba(94, 234, 212, 0.35)' },
  'VECTOR PREDICTOR': { bg: 'rgba(245, 158, 11, 0.12)', text: 'var(--amber)', border: 'rgba(245, 158, 11, 0.35)' },
  'TACTICAL DISPATCH': { bg: 'rgba(167, 139, 250, 0.12)', text: 'var(--purple)', border: 'rgba(167, 139, 250, 0.35)' },
  'GRID COPILOT': { bg: 'rgba(59, 130, 246, 0.12)', text: 'var(--blue)', border: 'rgba(59, 130, 246, 0.35)' },
}

export default function GridCopilotDrawer({
  isOpen,
  onClose,
  cameras,
  vehicles,
  activeCameraId,
  selectedGid,
  onExecuteAction,
}: GridCopilotDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      agentBadge: 'GRID COPILOT',
      text: 'Grid Copilot online. Multi-agent surveillance swarm standing by. You can ask me to find vehicles across corridors, calculate escape vectors, switch cameras, or dispatch police roadblocks.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestions: [
        'Find all white SUVs',
        'Show fastest vehicle on grid',
        'Deploy police roadblocks',
        'Radio PCR Unit 7',
      ],
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>({ welcome: false })
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'agent',
        agentBadge: 'GRID COPILOT',
        text: 'Grid Copilot online. Multi-agent surveillance swarm standing by (Groq 20B). Ask me to locate vehicles across corridors, calculate escape cones, lock cameras, or dispatch police roadblocks.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: [
          'Find white Audi and tell me its speed',
          'Deploy police roadblocks',
          'Radio PCR Unit 7',
          'Find all white SUVs',
        ],
      },
    ])
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!isOpen) return null

  const handleSend = async (queryText: string) => {
    if (!queryText.trim() || busy) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryText,
      time: now,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setBusy(true)
    tacticalAudio.playRadioChirp()

    try {
      const res: CopilotResponse = await queryGridCopilot(queryText, {
        activeCameraId,
        selectedGid,
        vehicles,
        cameras,
      })

      const agentMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        agentBadge: res.agent_badge,
        text: res.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: res.action,
        suggestions: res.suggestions,
        trace: res.trace,
      }


      setMessages((prev) => [...prev, agentMsg])

      // Auto-execute GIS action if present
      if (res.action) {
        onExecuteAction(res.action)
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'agent',
        agentBadge: 'GRID COPILOT',
        text: 'Network timeout connecting to swarm reasoning node. Falling back to primary telemetry.',
        time: now,
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setBusy(false)
    }
  }

  // Push-to-Talk via Web Speech API
  const startVoiceInput = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec) {
      alert('Speech recognition is not supported in this browser.')
      return
    }

    setIsRecording(true)
    tacticalAudio.playRadioChirp()

    try {
      const rec = new SpeechRec()
      rec.lang = 'en-US'
      rec.interimResults = false
      rec.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript
        if (transcript) handleSend(transcript)
      }
      rec.onend = () => setIsRecording(false)
      rec.onerror = () => setIsRecording(false)
      rec.start()
    } catch {
      setIsRecording(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 76,
        right: 16,
        bottom: 16,
        width: 'calc(100vw - 32px)',
        maxWidth: 430,
        zIndex: 90,
        background: 'rgba(17, 23, 34, 0.94)',
        borderRadius: 16,
        boxShadow: 'var(--neu-shadow-floating), 0 0 35px rgba(94, 234, 212, 0.18)',
        border: '1px solid rgba(94, 234, 212, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backdropFilter: 'blur(16px)',
        animation: 'slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 14px',
          background: 'var(--panel-2)',
          borderBottom: '1px solid var(--line-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="blink" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
          <div>
            <div className="mono" style={{ fontSize: 12, fontWeight: 800, color: 'var(--teal)', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🤖 GRID COPILOT</span>
              <span className="chip" style={{ fontSize: 9, padding: '1px 5px', color: 'var(--teal)', borderColor: 'rgba(94, 234, 212, 0.3)' }}>
                GROQ 20B
              </span>
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>
              MULTI-AGENT SURVEILLANCE & GIS ACTION ENGINE
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="btn mono"
            onClick={handleClear}
            title="Reset conversation"
            aria-label="Clear chat"
            style={{ fontSize: 11, padding: '2px 8px', minHeight: 26, color: 'var(--dim)' }}
          >
            🧹
          </button>
          <button
            className="btn mono"
            onClick={onClose}
            aria-label="Close Copilot"
            style={{ fontSize: 11, padding: '2px 9px', minHeight: 26 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Swarm Specialist Status Badges (Tidy inline strip) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'rgba(0,0,0,0.25)',
          borderBottom: '1px solid var(--line-2)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--teal)' }} />
            RE-ID
          </span>
          <span className="mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--amber)' }} />
            VECTOR
          </span>
          <span className="mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--purple)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--purple)' }} />
            DISPATCH
          </span>
        </div>
        <span className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>
          LATENCY: ~50ms
        </span>
      </div>

      {/* Conversation Thread */}
      <div
        className="neu-inset"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          margin: 10,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.map((m) => {
          const isUser = m.sender === 'user'
          const style = AGENT_COLORS[m.agentBadge || 'GRID COPILOT'] || AGENT_COLORS['GRID COPILOT']

          return (
            <div
              key={m.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                padding: '10px 12px',
                borderRadius: 10,
                background: isUser ? 'rgba(94, 234, 212, 0.15)' : style.bg,
                border: isUser ? '1px solid rgba(94, 234, 212, 0.35)' : `1px solid ${style.border}`,
                boxShadow: 'var(--neu-shadow-raised-sm)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: isUser ? 'var(--teal)' : style.text,
                    letterSpacing: 0.5,
                  }}
                >
                  {isUser ? 'INVESTIGATOR' : m.agentBadge || 'AGENT'}
                </span>
                <span className="mono" style={{ fontSize: 9, color: 'var(--dim)' }}>
                  {m.time}
                </span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text)' }}>{m.text}</div>

              {/* Subtle Claude/ChatGPT-style Collapsed Thought Disclosure */}
              {m.trace && m.trace.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTraces((prev) => ({
                        ...prev,
                        [m.id]: !prev[m.id],
                      }))
                    }
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '3px 0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--dim)',
                      fontSize: 11,
                      fontFamily: 'var(--sans)',
                    }}
                  >
                    <span style={{ fontSize: 11 }}>💭</span>
                    <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
                      {expandedTraces[m.id] ? 'Thinking process' : 'Thought for 1s'}
                    </span>
                    <span
                      style={{
                        fontSize: 8,
                        transform: expandedTraces[m.id] ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                        opacity: 0.7,
                      }}
                    >
                      ▼
                    </span>
                  </button>

                  {expandedTraces[m.id] && (
                    <div
                      style={{
                        marginTop: 4,
                        marginBottom: 6,
                        paddingLeft: 10,
                        borderLeft: '2px solid rgba(94, 234, 212, 0.35)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                        fontSize: 11,
                        color: 'var(--muted)',
                        lineHeight: 1.45,
                      }}
                    >
                      {m.trace.map((step, sIdx) => {
                        let cleanThought = step.thought
                        if (step.action_type === 'TOOL_CALL') {
                          if (step.tool_name?.includes('reid')) {
                            cleanThought = 'Scanned 18 camera feeds; correlated visual vehicle embeddings.'
                          } else if (step.tool_name?.includes('kinematic')) {
                            cleanThought = 'Calculated vehicle velocity, heading, and downstream arrival time.'
                          } else if (step.tool_name?.includes('roadblock')) {
                            cleanThought = 'Prepared roadblock perimeter coordinates across downstream nodes.'
                          } else if (step.tool_name?.includes('vhf') || step.tool_name?.includes('radio')) {
                            cleanThought = 'Established encrypted VHF radio link with patrol unit.'
                          } else if (step.tool_name?.includes('camera') || step.tool_name?.includes('pole')) {
                            cleanThought = 'Resolved camera coordinates on 3D spatial grid.'
                          }
                        } else if (step.action_type === 'GIS_DISPATCH') {
                          cleanThought = 'Updated 3D map viewport and locked target follow-cam.'
                        } else if (step.action_type === 'AGENT_HANDOFF') {
                          cleanThought = 'Shared trajectory analysis with Tactical Dispatch.'
                        }

                        return (
                          <div key={sIdx} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ color: 'var(--teal)', fontSize: 7, flexShrink: 0 }}>●</span>
                            <span>
                              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{step.agent}: </span>
                              {cleanThought}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Minimal Clean Action Badge */}
              {m.action && (
                <div
                  style={{
                    marginTop: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: 'rgba(94, 234, 212, 0.08)',
                    border: '1px solid rgba(94, 234, 212, 0.25)',
                    fontSize: 10,
                    color: 'var(--teal)',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  <span>⚡</span>
                  <span>
                    {m.action.type === 'SELECT_VEHICLE'
                      ? 'Target locked in 3D scene & video feed'
                      : m.action.type === 'SELECT_CAMERA'
                      ? 'Switched to camera feed'
                      : m.action.type === 'DEPLOY_ROADBLOCK'
                      ? 'Activated perimeter roadblocks'
                      : m.action.type === 'RADIO_CALL'
                      ? 'Connected tactical radio channel'
                      : m.action.type.replace('_', ' ')}
                  </span>
                </div>
              )}

                            {/* Suggestion Chips */}
              {m.suggestions && m.suggestions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {m.suggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(sug)}
                      className="mono"
                      style={{
                        fontSize: 9,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: 'var(--panel-2)',
                        border: '1px solid var(--line-2)',
                        color: 'var(--dim)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--text)'
                        e.currentTarget.style.borderColor = 'var(--teal)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--dim)'
                        e.currentTarget.style.borderColor = 'var(--line-2)'
                      }}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {busy && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              borderRadius: 8,
              background: 'var(--panel-2)',
              color: 'var(--dim)',
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          >
            Swarm reasoning in progress…
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend(input)
        }}
        style={{
          display: 'flex',
          gap: 6,
          padding: '10px 12px',
          background: 'var(--panel-2)',
          borderTop: '1px solid var(--line-2)',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={startVoiceInput}
          title="Push to Talk (Voice Input)"
          className="btn mono"
          style={{
            minHeight: 34,
            width: 34,
            padding: 0,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            background: isRecording ? 'var(--rose)' : 'var(--panel)',
            color: isRecording ? '#fff' : 'var(--muted)',
            borderColor: isRecording ? 'var(--rose)' : 'var(--line-2)',
          }}
        >
          {isRecording ? '🔴' : '🎙️'}
        </button>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask swarm e.g. 'find white SUV', 'deploy roadblocks'…"
          style={{
            flex: 1,
            height: 34,
            padding: '0 12px',
            borderRadius: 18,
            background: 'var(--panel)',
            border: '1px solid var(--line-2)',
            color: 'var(--text)',
            fontSize: 12,
            outline: 'none',
          }}
        />

        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="btn btn-primary mono"
          style={{
            minHeight: 34,
            padding: '0 14px',
            borderRadius: 18,
            fontSize: 11,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
            color: '#000',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span>SEND</span>
          <span style={{ fontSize: 13 }}>↑</span>
        </button>
      </form>
    </div>
  )
}
