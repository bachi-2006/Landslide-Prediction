// Web Audio API Emergency Siren and Notification Chime
class SoundEngine {
    constructor() {
        this.ctx = null;
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

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.5);
        } catch (e) {
            console.warn('Audio alert error:', e);
        }
    }

    playSiren(cycles = 3) {
        try {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            
            // European/NDMA high-low evacuation siren
            const cycleDuration = 0.4;
            for (let i = 0; i < cycles; i++) {
                const start = now + i * cycleDuration;
                osc.frequency.setValueAtTime(960, start);
                osc.frequency.setValueAtTime(640, start + cycleDuration / 2);
            }

            gain.gain.setValueAtTime(0.25, now);
            gain.gain.linearRampToValueAtTime(0.25, now + cycles * cycleDuration - 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + cycles * cycleDuration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + cycles * cycleDuration);
        } catch (e) {
            console.warn('Siren audio error:', e);
        }
    }
}

export const soundEngine = new SoundEngine();
