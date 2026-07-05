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
    this.crowdCheer(false);
  }

  /** Stadium crowd roar — synthesized from noise (no assets). `big` = victory-sized. */
  crowdCheer(big = false) {
    if (!this.ctx) return;
    // Layer 1: roar swell — noise through a lowpass sweeping 400 -> 3200 Hz.
    this.noiseSweep(400, 3200, 0.25, big ? 0.6 : 0.45, big ? 2.4 : 1.6);
    // Layer 2: "aah" body — bandpass noise around 900 Hz, Q~1.2 for a vocal-ish tone.
    this.noise(1.2, big ? 0.4 : 0.3, 900, 0.05, 1.2);
    // Layer 3: whistles — a handful of random sine chirps.
    const chirps = big ? 5 : 3;
    for (let i = 0; i < chirps; i++) {
      const f0 = 2000 + Math.random() * 1000;
      const f1 = f0 * 0.7;
      const dur = 0.15 + Math.random() * 0.1;
      const delay = 0.2 + Math.random() * 0.8;
      this.tone("sine", f0, f1, dur, 0.12, delay);
    }
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

  private noise(dur: number, vol: number, freq: number, delay = 0, q = 0.8) {
    if (!this.ctx) return;
    const src = this.makeNoiseSource(dur);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const t0 = this.ctx.currentTime + delay;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  /**
   * Noise through a lowpass filter whose cutoff ramps f0 -> f1 over `sweep`
   * seconds — used for the crowd "roar swell". Gain envelope: linear attack
   * to `vol` over 0.12s, then exponential decay to silence over `decay` s.
   */
  private noiseSweep(f0: number, f1: number, sweep: number, vol: number, decay: number) {
    if (!this.ctx) return;
    const total = Math.max(sweep, decay);
    const src = this.makeNoiseSource(total);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    const t0 = this.ctx.currentTime;
    lp.frequency.setValueAtTime(f0, t0);
    lp.frequency.linearRampToValueAtTime(f1, t0 + sweep);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + total + 0.03);
  }

  /** Shared white-noise buffer source, looped so callers can request any duration. */
  private makeNoiseSource(dur: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate; // 1s of white noise, reused (looped for longer sounds)
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    if (dur > 1) src.loop = true;
    return src;
  }
}
