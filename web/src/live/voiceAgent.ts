export interface VoiceCommandResult {
  action: 'select_camera' | 'search_vehicle' | 'set_optic' | 'clear' | 'unknown'
  target?: string
  confidence?: number
  transcript: string
}

export class VoiceTelemetryAgent {
  private recognition: any = null
  private isListening: boolean = false
  private onCommandCallback: ((res: VoiceCommandResult) => void) | null = null

  constructor(onCommand: (res: VoiceCommandResult) => void) {
    this.onCommandCallback = onCommand
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition()
      this.recognition.continuous = true
      this.recognition.interimResults = false
      this.recognition.lang = 'en-US'

      this.recognition.onresult = (event: any) => {
        const last = event.results.length - 1
        const transcript = event.results[last][0].transcript.trim()
        this.parseCommand(transcript)
      }

      this.recognition.onerror = (event: any) => {
        console.warn('[VoiceTelemetry] Speech recognition error:', event.error)
      }
    }
  }

  isSupported(): boolean {
    return !!this.recognition
  }

  start() {
    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start()
        this.isListening = true
      } catch (err) {
        console.warn('[VoiceTelemetry] Start error:', err)
      }
    }
  }

  stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop()
        this.isListening = false
      } catch (err) {
        console.warn('[VoiceTelemetry] Stop error:', err)
      }
    }
  }

  toggle(): boolean {
    if (this.isListening) {
      this.stop()
      return false
    } else {
      this.start()
      return true
    }
  }

  private parseCommand(transcript: string) {
    const text = transcript.toLowerCase()

    // 1. Optic Shader Controls
    if (text.includes('flir') || text.includes('thermal') || text.includes('heat')) {
      this.onCommandCallback?.({ action: 'set_optic', target: 'flir', transcript })
      return
    }
    if (text.includes('night vision') || text.includes('nvg') || text.includes('green')) {
      this.onCommandCallback?.({ action: 'set_optic', target: 'nvg', transcript })
      return
    }
    if (text.includes('crt') || text.includes('retro') || text.includes('monitor')) {
      this.onCommandCallback?.({ action: 'set_optic', target: 'crt', transcript })
      return
    }
    if (text.includes('normal') || text.includes('rgb') || text.includes('reset view')) {
      this.onCommandCallback?.({ action: 'set_optic', target: 'normal', transcript })
      return
    }

    // 2. Camera Navigation
    if (text.includes('camera') || text.includes('cam')) {
      // Find numbers or names
      const match = text.match(/camera\s*(\d+|[a-z]+)/i)
      if (match) {
        this.onCommandCallback?.({ action: 'select_camera', target: match[1], transcript })
        return
      }
    }

    // 3. Vehicle description search
    if (text.includes('find') || text.includes('search') || text.includes('track') || text.includes('locate')) {
      const q = text.replace(/^(find|search for|track|locate|trace)\s+/i, '')
      this.onCommandCallback?.({ action: 'search_vehicle', target: q, transcript })
      return
    }

    // 4. Default: Treat as general vehicle query
    this.onCommandCallback?.({ action: 'search_vehicle', target: transcript, transcript })
  }
}
