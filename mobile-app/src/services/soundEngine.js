// Web Audio API Emergency Siren, Chime, and Haptic Vibration Engine for Mobile App
class MobileSoundEngine {
  constructor() {
    this.ctx = null;
    this.activeOscillator = null;
    this.activeGain = null;
    this.isSirenPlaying = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Two-tone warning chime (880Hz -> 1174Hz)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174.66, now + 0.12);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.55);

      // Trigger short phone haptic buzz
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 150]);
      }
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  playSiren(cycles = 6) {
    try {
      this.init();
      if (!this.ctx) return;
      this.stopSiren(); // ensure any previous tone is cleared

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';

      const cycleDuration = 0.5;
      for (let i = 0; i < cycles; i++) {
        const start = now + i * cycleDuration;
        osc.frequency.setValueAtTime(960, start);
        osc.frequency.setValueAtTime(640, start + cycleDuration / 2);
      }

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.linearRampToValueAtTime(0.35, now + cycles * cycleDuration - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + cycles * cycleDuration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + cycles * cycleDuration);

      this.activeOscillator = osc;
      this.activeGain = gain;
      this.isSirenPlaying = true;

      setTimeout(() => {
        this.isSirenPlaying = false;
      }, cycles * cycleDuration * 1000);

      // Strong emergency haptic vibration pattern (e.g. SOS buzz)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([400, 150, 400, 150, 400, 200, 600]);
      }
    } catch (e) {
      console.warn('Siren audio error:', e);
    }
  }

  stopSiren() {
    try {
      if (this.activeOscillator) {
        this.activeOscillator.stop();
        this.activeOscillator.disconnect();
        this.activeOscillator = null;
      }
      this.isSirenPlaying = false;
    } catch (e) {
      // already stopped
    }
  }
}

export const soundEngine = new MobileSoundEngine();
