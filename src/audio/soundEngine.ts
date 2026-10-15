import { loadSettings, saveSettings } from "../utils/settings";
/**
 * Audio Engine using Web Audio API for Retro-Futuristic Cyberpunk atmosphere,
 * Lo-fi ambient synth, laser blasts, UI sound effects, and voice synthesize effects.
 */

class SoundEngine {
  private masterGainNode: GainNode | null = null;
  private masterVolume: number = (() => {
    try {
      const s = loadSettings();
      return s.masterVolume !== undefined ? s.masterVolume : 0.8;
    } catch { return 0.8; }
  })();

  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGainNode) {
      this.masterGainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
    try {
      saveSettings({ masterVolume: this.masterVolume });
    } catch {}
  }

  public getMasterVolume(): number {
    try {
      const settings = loadSettings();
      if (settings.masterVolume !== undefined) {
        this.masterVolume = settings.masterVolume;
      }
    } catch {}
    return this.masterVolume;
  }

  private getAudioDestination(): AudioNode {
    this.initContext();
    if (!this.ctx) return {} as any;
    if (!this.masterGainNode) {
      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      this.masterGainNode.connect(this.getAudioDestination());
    }
    return this.masterGainNode;
  }

  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private synthGain: GainNode | null = null;
  private isPlayingLofi: boolean = false;
  private lofiInterval: number | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.synthGain && this.ctx) {
      this.synthGain.gain.setValueAtTime(this.isMuted ? 0 : 0.25, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  // Play sci-fi laser blast (for intro cinematic)
  public playLaser(pitch: number = 880) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Ignore audio autoplay restrictions
    }
  }

  // Heavy blast / combat roll explosion impact
  public playImpact() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.6);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.6);
    } catch {}
  }

  // Deep cyber bass hit / sub-bass impact for imagination transition
  public playBassHit() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, now);
      filter.frequency.exponentialRampToValueAtTime(35, now + 0.8);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.8);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.8);
    } catch {}
  }

  // Cinematic screen wipe whoosh for imagination transitions
  public playMonsterGrowl() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.8);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(250, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + 0.8);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.8);
    } catch {}
  }

  // Short alert sting when stealth is broken
  public playAlertSting() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';

      osc1.frequency.setValueAtTime(880, now);
      osc2.frequency.setValueAtTime(932, now); // Dissonant minor second

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.getAudioDestination());

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);
    } catch {}
  }

  // Sharp glass break sound effect
  public playGlassBreak() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const bufferSize = this.ctx.sampleRate * 0.35;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2500, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.getAudioDestination());

      noise.start(now);
    } catch {}
  }

  private breathingOsc: OscillatorNode | null = null;
  private breathingLfo: OscillatorNode | null = null;
  private breathingGain: GainNode | null = null;
  private isAudioMuffled: boolean = false;
  private muffleFilter: BiquadFilterNode | null = null;

  public playSlowBreathing() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      this.stopSlowBreathing();

      const now = this.ctx.currentTime;
      // Inhalation/exhalation simulation: filtered noise + low sine with slow 0.22 Hz swell
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(65, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, now);

      gain.gain.setValueAtTime(0.04, now);

      // Tremolo LFO for slow breathing cadence (~0.22 Hz, ~4.5 second breath cycle)
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.22, now);
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(0.035, now);

      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      lfo.start(now);
      this.breathingOsc = osc;
      this.breathingLfo = lfo;
      this.breathingGain = gain;
    } catch {}
  }

  public stopSlowBreathing() {
    if (this.breathingOsc) {
      try {
        this.breathingOsc.stop();
        this.breathingOsc.disconnect();
      } catch {}
      this.breathingOsc = null;
    }
    if (this.breathingLfo) {
      try {
        this.breathingLfo.stop();
        this.breathingLfo.disconnect();
      } catch {}
      this.breathingLfo = null;
    }
    if (this.breathingGain) {
      try {
        this.breathingGain.disconnect();
      } catch {}
      this.breathingGain = null;
    }
  }

  // Muffled audio state for head trauma / floor daze
  public startMuffledAudio() {
    this.isAudioMuffled = true;
  }

  public stopMuffledAudio() {
    this.isAudioMuffled = false;
  }

  private heavyBreathingOsc: OscillatorNode | null = null;

  public playHeavyBreathing() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      this.stopHeavyBreathing();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);

      gain.gain.setValueAtTime(0.08, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      this.heavyBreathingOsc = osc;
    } catch {}
  }

  public stopHeavyBreathing() {
    if (this.heavyBreathingOsc) {
      try {
        this.heavyBreathingOsc.stop();
        this.heavyBreathingOsc.disconnect();
      } catch {}
      this.heavyBreathingOsc = null;
    }
  }

  // Single heartbeat thump (thump-thump)
  public playHeartbeatThump() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Pulse 1
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(75, now);
      osc1.frequency.exponentialRampToValueAtTime(30, now + 0.12);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(this.getAudioDestination());
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Pulse 2 (0.1s later)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(65, now + 0.1);
      osc2.frequency.exponentialRampToValueAtTime(25, now + 0.22);
      gain2.gain.setValueAtTime(0.3, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(this.getAudioDestination());
      osc2.start(now + 0.1);
      osc2.stop(now + 0.22);
    } catch {}
  }

  // Monster Roar
  public playMonsterRoar() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 1.2);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(150, now + 1.2);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 1.2);
    } catch {}
  }

  // Speak Monster line in deep distorted synthesized voice
  public speakMonsterLine(text: string) {
    if (this.isMuted) return;
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.volume = 1.0 * this.getMasterVolume();
        utter.rate = 0.7;
        utter.pitch = 0.3; // Deep distorted pitch
        utter.volume = 1.0 * this.getMasterVolume();
        window.speechSynthesis.speak(utter);
      }
    } catch {}
  }

  // Single heavy "splat" impact sound (heavy squishy impact + deep sub-bass drop)
  public playSplatImpact() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // 1. Heavy low body thud
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(18, now + 0.45);
      oscGain.gain.setValueAtTime(0.7, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(oscGain);
      oscGain.connect(this.getAudioDestination());
      osc.start(now);
      osc.stop(now + 0.45);

      // 2. Wet squelch noise burst
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.25);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + 0.25);
      filter.Q.setValueAtTime(3.0, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.55, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.getAudioDestination());
      noise.start(now);
    } catch {}
  }

  // Complete silence
  public stopAllAudio() {
    this.stopSlowBreathing();
    this.stopHeavyBreathing();
    this.stopLofiSynth();
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
  }

  public playWhoosh() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // 1. Filtered white noise sweep
      const bufferSize = this.ctx.sampleRate * 0.45;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(1800, now + 0.18);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.45);
      filter.Q.value = 2.5;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.01, now);
      noiseGain.gain.linearRampToValueAtTime(0.28, now + 0.16);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.getAudioDestination());

      // 2. Low-end tonal pitch dive for weight
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);

      oscGain.gain.setValueAtTime(0.18, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(oscGain);
      oscGain.connect(this.getAudioDestination());

      noise.start(now);
      noise.stop(now + 0.45);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch {}
  }

  // Combat roll whoosh
  public playRollWhoosh() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(320, now + 0.2);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.5);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.5);
    } catch {}
  }

  // Footstep thud
  public playFootstep() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(80 + Math.random() * 20, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {}
  }

  // Cabinet door creak/open
  public playDoorCreak() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(260, now + 0.35);
      osc.frequency.linearRampToValueAtTime(140, now + 0.6);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0.03, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.6);
    } catch {}
  }

  // Telltale notification chord ("Dad will remember that" / choice made)
  public playTelltaleBell() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0.15, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 1.2);

        osc.connect(gain);
        gain.connect(this.getAudioDestination());

        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 1.2);
      });
    } catch {}
  }

  // UI Interact beep
  public playInteract() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.setValueAtTime(880, now + 0.06);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.18);
    } catch {}
  }

  // Play crisp item pickup chime
  public playItemPickup() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      osc.frequency.setValueAtTime(783.99, now + 0.16);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.32);
    } catch {}
  }

  // Soft mechanical latch click for panel alignment
  public playSoftClick() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.05);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {}
  }

  // Dad's voice line transmission radio blip
  public playRadioStatic() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.15;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 3;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.getAudioDestination());

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.15);
    } catch {}
  }

  // Voice speech synthesis for Zane & Dad lines
  public speakLine(text: string, voiceType: 'zane' | 'dad' = 'zane') {
    if (this.isMuted) return;
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = 1.0 * this.getMasterVolume();
        if (voiceType === 'zane') {
          utterance.pitch = 1.35; // youthful 11yo boy
          utterance.rate = 1.05;
        } else {
          utterance.pitch = 0.75; // deeper gruff sci-fi dad
          utterance.rate = 0.95;
        }
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Fallback
    }
  }

  // Electric spark / zap sound for wire minigame
  public playSpark() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1500, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.14);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(this.getAudioDestination());
      osc.start(now);
      osc.stop(now + 0.14);
    } catch {}
  }

  // Obstacle rattle with pitch per object
  public playRattle(obstacleType: string) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      let freq = 800;
      let decay = 0.12;
      let wave: OscillatorType = 'triangle';

      switch (obstacleType) {
        case 'spoon':
          freq = 1450 + Math.random() * 80;
          wave = 'sine';
          decay = 0.15;
          break;
        case 'fork':
          freq = 1850 + Math.random() * 100;
          wave = 'triangle';
          decay = 0.18;
          break;
        case 'jar_lid':
          freq = 360 + Math.random() * 30;
          wave = 'sine';
          decay = 0.22;
          break;
        case 'tin':
          freq = 620 + Math.random() * 40;
          wave = 'square';
          decay = 0.14;
          break;
        case 'string':
          freq = 240 + Math.random() * 20;
          wave = 'triangle';
          decay = 0.08;
          break;
        case 'rubber_band':
          freq = 190 + Math.random() * 40;
          wave = 'sawtooth';
          decay = 0.1;
          break;
        case 'bell':
          freq = 2300 + Math.random() * 60;
          wave = 'sine';
          decay = 0.35;
          break;
        default:
          freq = 900;
      }

      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now);
      if (obstacleType === 'rubber_band') {
        osc.frequency.exponentialRampToValueAtTime(80, now + decay);
      } else if (obstacleType === 'bell') {
        osc.frequency.exponentialRampToValueAtTime(freq * 0.98, now + decay);
      }

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());
      osc.start(now);
      osc.stop(now + decay);
    } catch {}
  }

  // Key jingle on movement mistake or strike
  public playKeyJingle() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const pitches = [1800, 2250, 2700, 3100];
      pitches.forEach((p, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        const start = now + idx * 0.03;
        osc.frequency.setValueAtTime(p + (Math.random() * 100 - 50), start);
        gain.gain.setValueAtTime(0.14, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
        osc.connect(gain);
        gain.connect(this.getAudioDestination());
        osc.start(start);
        osc.stop(start + 0.18);
      });
    } catch {}
  }

  // Drawer slam on 3rd strike
  public playDrawerSlam() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Low wood thud
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.getAudioDestination());
      osc.start(now);
      osc.stop(now + 0.35);

      // Noise burst for wood slap
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.15);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.getAudioDestination());
      noise.start(now);
      noise.stop(now + 0.15);
    } catch {}
  }

  // Floorboard creak panned to the left
  public playFloorboardCreak(pan: number = -0.75) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.linearRampToValueAtTime(160, now + 0.2);
      osc.frequency.linearRampToValueAtTime(95, now + 0.45);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      if ('StereoPannerNode' in window) {
        const panner = new StereoPannerNode(this.ctx, { pan });
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.getAudioDestination());
      } else {
        osc.connect(gain);
        gain.connect(this.getAudioDestination());
      }
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {}
  }

  // Subtle cough / throat clearing panned left
  public playCough(pan: number = -0.75) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [0, 0.12].forEach((offset) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        const start = now + offset;
        osc.frequency.setValueAtTime(180, start);
        osc.frequency.exponentialRampToValueAtTime(90, start + 0.1);
        gain.gain.setValueAtTime(0.1, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

        if ('StereoPannerNode' in window) {
          const panner = new StereoPannerNode(this.ctx, { pan });
          osc.connect(gain);
          gain.connect(panner);
          panner.connect(this.getAudioDestination());
        } else {
          osc.connect(gain);
          gain.connect(this.getAudioDestination());
        }
        osc.start(start);
        osc.stop(start + 0.1);
      });
    } catch {}
  }

  // Ambient Lo-fi Synth Melody (Plays especially when looking out window or exploring)
  public startLofiSynth() {
    if (this.isPlayingLofi) return;
    this.isPlayingLofi = true;
    this.initContext();
    if (!this.ctx) return;

    const chords = [
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00], // Am7
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [196.00, 246.94, 293.66, 392.00], // G7
    ];
    let chordIdx = 0;

    const playChord = () => {
      if (!this.isPlayingLofi || !this.ctx || this.isMuted) return;
      const currentChord = chords[chordIdx % chords.length];
      chordIdx++;
      const now = this.ctx.currentTime;

      currentChord.forEach((freq, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq * 0.5, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600 + Math.sin(now) * 150, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.04, now + 1.2);
        gain.gain.linearRampToValueAtTime(0.001, now + 3.8);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.getAudioDestination());

        osc.start(now);
        osc.stop(now + 4.0);
      });
    };

    playChord();
    this.lofiInterval = window.setInterval(playChord, 4000);
  }

  public stopLofiSynth() {
    this.isPlayingLofi = false;
    if (this.lofiInterval !== null) {
      clearInterval(this.lofiInterval);
      this.lofiInterval = null;
    }
  }

  // --- TV Murmur & Heavy Dread Atmosphere Web Audio (No Audio Files) ---
  private tvMurmurGain: GainNode | null = null;
  private tvMurmurFilter: BiquadFilterNode | null = null;
  private tvMurmurOsc: OscillatorNode | null = null;
  private tvMurmurNoise: AudioBufferSourceNode | null = null;

  private heavyMasterGain: GainNode | null = null;
  private heavyDroneOsc: OscillatorNode | null = null;
  private heavyDroneLfo: OscillatorNode | null = null;
  private heavyRumbleSource: AudioBufferSourceNode | null = null;
  private heavyHeartbeatInterval: number | null = null;

  // TV Murmur: distant broadcast chatter and CRT hum before Dad speaks
  public startTvMurmur() {
    if (this.isMuted) return;
    try {
      this.stopTvMurmur();
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.001, now);
      master.gain.linearRampToValueAtTime(0.12, now + 0.4);
      master.connect(this.getAudioDestination());
      this.tvMurmurGain = master;

      // Filtered chatter noise
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.5;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650, now);
      filter.Q.value = 1.8;
      this.tvMurmurFilter = filter;

      noise.connect(filter);
      filter.connect(master);
      noise.start(now);
      this.tvMurmurNoise = noise;

      // Low broadcast hum (60 Hz AC buzz + 120 Hz harmonic)
      const humOsc = this.ctx.createOscillator();
      humOsc.type = 'sawtooth';
      humOsc.frequency.setValueAtTime(60, now);

      const humFilter = this.ctx.createBiquadFilter();
      humFilter.type = 'lowpass';
      humFilter.frequency.setValueAtTime(180, now);

      const humGain = this.ctx.createGain();
      humGain.gain.setValueAtTime(0.04, now);

      humOsc.connect(humFilter);
      humFilter.connect(humGain);
      humGain.connect(master);
      humOsc.start(now);
      this.tvMurmurOsc = humOsc;
    } catch {}
  }

  // Muffle TV during the shout atmosphere
  public muffleTv() {
    try {
      if (this.ctx && this.tvMurmurFilter && this.tvMurmurGain) {
        const now = this.ctx.currentTime;
        this.tvMurmurFilter.frequency.exponentialRampToValueAtTime(110, now + 0.3);
        this.tvMurmurGain.gain.linearRampToValueAtTime(0.03, now + 0.3);
      }
    } catch {}
  }

  public stopTvMurmur() {
    try {
      if (this.tvMurmurOsc) {
        this.tvMurmurOsc.stop();
        this.tvMurmurOsc.disconnect();
        this.tvMurmurOsc = null;
      }
      if (this.tvMurmurNoise) {
        this.tvMurmurNoise.stop();
        this.tvMurmurNoise.disconnect();
        this.tvMurmurNoise = null;
      }
      if (this.tvMurmurFilter) {
        this.tvMurmurFilter.disconnect();
        this.tvMurmurFilter = null;
      }
      if (this.tvMurmurGain) {
        this.tvMurmurGain.disconnect();
        this.tvMurmurGain = null;
      }
    } catch {}
  }

  // Sharp low impact transient at the shout
  public playShoutImpact() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Punchy sub-bass drop 120Hz -> 26Hz
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(125, now);
      osc.frequency.exponentialRampToValueAtTime(26, now + 0.7);

      gain.gain.setValueAtTime(0.75, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gain);
      gain.connect(this.getAudioDestination());
      osc.start(now);
      osc.stop(now + 0.9);

      // Snappy initial thud click
      const clickOsc = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(240, now);
      clickOsc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      clickGain.gain.setValueAtTime(0.4, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      clickOsc.connect(clickGain);
      clickGain.connect(this.getAudioDestination());
      clickOsc.start(now);
      clickOsc.stop(now + 0.12);
    } catch {}
  }

  // Single dread heartbeat thump ("lub-dub")
  private playDreadHeartbeatThump() {
    if (this.isMuted || !this.ctx || !this.heavyMasterGain) return;
    try {
      const now = this.ctx.currentTime;

      // Lub
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(58, now);
      osc1.frequency.exponentialRampToValueAtTime(32, now + 0.13);

      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      osc1.connect(gain1);
      gain1.connect(this.heavyMasterGain);
      osc1.start(now);
      osc1.stop(now + 0.14);

      // Dub (0.18s later)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(48, now + 0.18);
      osc2.frequency.exponentialRampToValueAtTime(26, now + 0.30);

      gain2.gain.setValueAtTime(0.24, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

      osc2.connect(gain2);
      gain2.connect(this.heavyMasterGain);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.31);
    } catch {}
  }

  // Heavy Atmosphere Soundscape:
  // - 40 Hz sub-bass drone with slow tremolo
  // - brown-noise rumble through lowpass at 120 Hz
  // - slow heartbeat
  // - moderate volume
  public startHeavyAtmosphere() {
    if (this.isMuted) return;
    try {
      this.stopHeavyAtmosphere();
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // Master atmosphere gain: moderate volume (~0.4)
      const masterGain = this.ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(0.38, now + 0.4);
      masterGain.connect(this.getAudioDestination());
      this.heavyMasterGain = masterGain;

      // 1. 40 Hz Sub-Bass Drone with Slow Tremolo
      const droneOsc = this.ctx.createOscillator();
      droneOsc.type = 'sine';
      droneOsc.frequency.setValueAtTime(40, now);

      const droneGain = this.ctx.createGain();
      droneGain.gain.setValueAtTime(0.28, now);

      // Tremolo LFO (1.6 Hz slow sine) modulating droneGain
      const tremoloLfo = this.ctx.createOscillator();
      tremoloLfo.type = 'sine';
      tremoloLfo.frequency.setValueAtTime(1.6, now);

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(0.12, now);

      tremoloLfo.connect(lfoGain);
      lfoGain.connect(droneGain.gain);

      droneOsc.connect(droneGain);
      droneGain.connect(masterGain);

      tremoloLfo.start(now);
      droneOsc.start(now);

      this.heavyDroneOsc = droneOsc;
      this.heavyDroneLfo = tremoloLfo;

      // 2. Brown-Noise Rumble through a lowpass at 120 Hz
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = sampleRate * 2;
      const rumbleBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const rumbleData = rumbleBuffer.getChannelData(0);

      let lastBrown = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastBrown = (lastBrown + 0.02 * white) / 1.02;
        rumbleData[i] = lastBrown * 3.2;
      }

      const rumbleSource = this.ctx.createBufferSource();
      rumbleSource.buffer = rumbleBuffer;
      rumbleSource.loop = true;

      const rumbleFilter = this.ctx.createBiquadFilter();
      rumbleFilter.type = 'lowpass';
      rumbleFilter.frequency.setValueAtTime(120, now);
      rumbleFilter.Q.value = 1.6;

      const rumbleGain = this.ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.32, now);

      rumbleSource.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(masterGain);

      rumbleSource.start(now);
      this.heavyRumbleSource = rumbleSource;

      // 3. Slow Heartbeat (approx every 1.25s)
      this.playDreadHeartbeatThump();
      this.heavyHeartbeatInterval = window.setInterval(() => {
        this.playDreadHeartbeatThump();
      }, 1250);

      // 4. Muffle TV sound
      this.muffleTv();
    } catch {}
  }

  // Fade out atmosphere over specified seconds (default 3s)
  public fadeHeavyAtmosphere(fadeDuration: number = 3.0) {
    try {
      if (this.ctx && this.heavyMasterGain) {
        const now = this.ctx.currentTime;
        this.heavyMasterGain.gain.cancelScheduledValues(now);
        this.heavyMasterGain.gain.setValueAtTime(this.heavyMasterGain.gain.value, now);
        this.heavyMasterGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);

        setTimeout(() => {
          this.stopHeavyAtmosphere();
        }, fadeDuration * 1000 + 100);
      } else {
        this.stopHeavyAtmosphere();
      }
    } catch {
      this.stopHeavyAtmosphere();
    }
  }

  // Stop immediately (for Esc or scene termination so audio is NEVER stuck)
  public stopHeavyAtmosphere() {
    try {
      if (this.heavyHeartbeatInterval !== null) {
        clearInterval(this.heavyHeartbeatInterval);
        this.heavyHeartbeatInterval = null;
      }
      if (this.heavyDroneOsc) {
        this.heavyDroneOsc.stop();
        this.heavyDroneOsc.disconnect();
        this.heavyDroneOsc = null;
      }
      if (this.heavyDroneLfo) {
        this.heavyDroneLfo.stop();
        this.heavyDroneLfo.disconnect();
        this.heavyDroneLfo = null;
      }
      if (this.heavyRumbleSource) {
        this.heavyRumbleSource.stop();
        this.heavyRumbleSource.disconnect();
        this.heavyRumbleSource = null;
      }
      if (this.heavyMasterGain) {
        this.heavyMasterGain.disconnect();
        this.heavyMasterGain = null;
      }
      this.stopTvMurmur();
    } catch {}
  }
}

export const soundEngine = new SoundEngine();
