/**
 * Tactical Web Audio & Voice Radio Synthesizer
 * Generates military & police radio effects using Web Audio API oscillators,
 * bandpass filters, white noise buffers, and SpeechSynthesis.
 * Requires 0 external audio files — 100% resilient and offline-capable.
 */

class TacticalAudioEngine {
  private ctx: AudioContext | null = null
  private isMuted: boolean = false

  private getContext(): AudioContext | null {
    if (this.isMuted) return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted
    if (muted && this.ctx) {
      this.ctx.suspend().catch(() => {})
    }
  }

  public getMuted(): boolean {
    return this.isMuted
  }

  /**
   * High-tech target lock-on dual ping
   */
  public playTargetLock() {
    const ctx = this.getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.08)

    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.12)
  }

  /**
   * Tactical walkie-talkie radio chirp / roger beep
   */
  public playRadioChirp() {
    const ctx = this.getContext()
    if (!ctx) return

    const now = ctx.currentTime
    // Dual tone chirp (1200 Hz then 2400 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()

    osc1.type = 'triangle'
    osc1.frequency.setValueAtTime(1209, now)
    osc1.frequency.setValueAtTime(2418, now + 0.04)

    gain1.gain.setValueAtTime(0.18, now)
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08)

    osc1.connect(gain1)
    gain1.connect(ctx.destination)

    osc1.start(now)
    osc1.stop(now + 0.08)
  }

  /**
   * Police radio squelch static burst (shhh-krrrk)
   */
  public playRadioStatic(durationSeconds: number = 0.15) {
    const ctx = this.getContext()
    if (!ctx) return

    const bufferSize = ctx.sampleRate * durationSeconds
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    // Bandpass filter to mimic radio transmission bandwidth (300Hz - 3400Hz)
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1400
    filter.Q.value = 1.2

    const gain = ctx.createGain()
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + durationSeconds)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    noise.start(now)
    noise.stop(now + durationSeconds)
  }

  /**
   * Perimeter breach / Cordon Lockdown warning klaxon
   */
  public playCordonAlert() {
    const ctx = this.getContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(540, now)
    osc.frequency.linearRampToValueAtTime(780, now + 0.25)
    osc.frequency.linearRampToValueAtTime(540, now + 0.5)

    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.5)
  }

  /**
   * Voice synthesis with tactical police radio acoustic styling
   */
  public speakRadioMessage(text: string, onEnd?: () => void) {
    if (this.isMuted) {
      onEnd?.()
      return
    }

    // Play initial radio click/chirp
    this.playRadioChirp()
    setTimeout(() => {
      this.playRadioStatic(0.12)
    }, 50)

    if (!('speechSynthesis' in window)) {
      setTimeout(() => onEnd?.(), 1000)
      return
    }

    window.speechSynthesis.cancel() // clear any prior queue
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    utterance.pitch = 0.95
    utterance.volume = 0.95

    // Choose preferred English radio-like voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferredVoice =
      voices.find((v) => v.lang.startsWith('en') && (v.name.includes('David') || v.name.includes('Natural') || v.name.includes('Male'))) ||
      voices.find((v) => v.lang.startsWith('en'))

    if (preferredVoice) {
      utterance.voice = preferredVoice
    }

    utterance.onend = () => {
      // Play roger beep / trailing static when message concludes
      this.playRadioStatic(0.2)
      setTimeout(() => {
        this.playRadioChirp()
        onEnd?.()
      }, 150)
    }

    utterance.onerror = () => {
      onEnd?.()
    }

    window.speechSynthesis.speak(utterance)
  }

  public stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }
}

export const tacticalAudio = new TacticalAudioEngine()
