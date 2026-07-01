// Synthesized SFX via WebAudio — zero assets, ~0 KB. The AudioContext is
// created/resumed on the first user gesture (mobile autoplay requirement);
// any sound requested before that is silently skipped.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf: AudioBuffer | null = null;

  constructor() {
    const unlock = () => {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.4;
        this.master.connect(this.ctx.destination);
      }
      void this.ctx.resume();
    };
    addEventListener("pointerdown", unlock, { passive: true });
    addEventListener("keydown", unlock);
  }

  /** Short thump + snap — kicking the ball. */
  kick() {
    this.tone("sine", 160, 55, 0.09, 0.9);
    this.noise(0.05, 0.5, 2200);
  }

  /** Air whoosh — dash. */
  dash() {
    this.noise(0.18, 0.35, 900);
  }

  /** Wall bounce; pitch/volume scale with impact speed. */
  bounce(speed: number) {
    const f = Math.min(700, 260 + speed * 18);
    this.tone("square", f, f * 0.7, 0.06, Math.min(0.55, 0.12 + speed * 0.04));
  }

  /** Countdown beep; `go` = the higher kickoff beep. */
  beep(go = false) {
    this.tone("square", go ? 880 : 440, go ? 880 : 440, 0.12, 0.35);
  }

  /** Goal: horn chord + crowd noise swell. */
  goal() {
    this.tone("sawtooth", 392, 392, 0.55, 0.4);
    this.tone("sawtooth", 494, 494, 0.55, 0.35);
    this.tone("sawtooth", 587, 587, 0.55, 0.35);
    this.noise(1.1, 0.4, 600);
    this.noise(0.8, 0.3, 1200, 0.15);
  }

  /** Victory arpeggio (trumpet-ish). */
  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => this.tone("sawtooth", f, f, 0.18, 0.45, i * 0.15));
  }

  /** Sad trombone for the loser. */
  lose() {
    this.tone("sawtooth", 300, 220, 0.35, 0.4);
    this.tone("sawtooth", 250, 160, 0.5, 0.4, 0.32);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  private noise(dur: number, vol: number, freq: number, delay = 0) {
    if (!this.ctx) return;
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate; // 1s of white noise, reused
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }
}
