// Procedural WebAudio sound effects, ambience and a slow generative dirge.
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  ambBus!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  private voices = 0;
  enabled = true;
  musicOn = true;
  volume = 0.7;
  private musicT = 0;
  private dripT = 0;
  private chordIdx = 0;
  private started = false;

  constructor() {
    const unlock = () => {
      this.init();
      if (this.ctx?.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);
    this.ambBus = c.createGain();
    this.ambBus.gain.value = 0.5;
    this.ambBus.connect(this.master);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.started = true;
    setInterval(() => this.tickMusic(), 250);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicBus) this.musicBus.gain.value = this.musicOn ? 0.32 : 0;
  }

  // ---------------------------------------------------------------- primitives
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, bus?: AudioNode, attack = 0.005) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, attack, vol, dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + attack + 0.05);
    this.voices++;
    o.onended = () => this.voices--;
  }

  private noiseHit(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1, delay = 0, bus?: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.004, vol, dur);
    s.connect(f).connect(g).connect(bus ?? this.sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    this.voices++;
    s.onended = () => this.voices--;
  }

  play(name: string, vol = 1) {
    if (!this.ctx || !this.enabled || vol <= 0.01) return;
    const now = performance.now();
    const lt = this.last.get(name) ?? 0;
    if (now - lt < 45) return;
    this.last.set(name, now);
    if (this.voices > 40) return;
    const v = Math.min(1, vol);
    const r = () => 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'dig':
        this.noiseHit(0.09, 0.35 * v, 'bandpass', 900 * r(), 500, 2);
        this.tone('sine', 110 * r(), 60, 0.12, 0.35 * v);
        break;
      case 'dig_gold':
        this.noiseHit(0.07, 0.25 * v, 'bandpass', 1400, 900, 2);
        this.tone('sine', 1900 * r(), 1850, 0.25, 0.08 * v);
        this.tone('sine', 2650 * r(), 2600, 0.2, 0.05 * v);
        break;
      case 'rubble':
        this.noiseHit(0.7, 0.45 * v, 'lowpass', 900, 150, 0.7);
        this.tone('sine', 70, 40, 0.5, 0.3 * v);
        break;
      case 'claim':
        this.tone('sine', 520 * r(), 780, 0.35, 0.07 * v);
        this.tone('triangle', 780 * r(), 1040, 0.3, 0.04 * v, 0.06);
        break;
      case 'fortify':
        this.tone('sine', 90, 55, 0.25, 0.35 * v);
        this.noiseHit(0.3, 0.2 * v, 'lowpass', 600, 200);
        break;
      case 'coins':
        for (let k = 0; k < 4; k++) this.tone('sine', 2200 + Math.random() * 1500, 2100, 0.12, 0.05 * v, k * 0.04);
        break;
      case 'payday':
        for (let k = 0; k < 10; k++) this.tone('sine', 2000 + Math.random() * 1800, 1900, 0.15, 0.06, k * 0.05);
        break;
      case 'hit':
        this.noiseHit(0.08, 0.4 * v, 'bandpass', 1300 * r(), 700, 1.5);
        this.tone('sine', 160 * r(), 80, 0.1, 0.3 * v);
        break;
      case 'clang':
        this.noiseHit(0.06, 0.3 * v, 'highpass', 2500, 2000);
        this.tone('square', 420 * r(), 400, 0.18, 0.06 * v);
        this.tone('sine', 1250 * r(), 1200, 0.25, 0.07 * v);
        break;
      case 'slap':
        this.noiseHit(0.07, 0.7 * v, 'highpass', 1400, 900, 0.7);
        this.tone('sine', 220, 90, 0.08, 0.3 * v);
        break;
      case 'pickup':
        this.tone('sine', 300, 700, 0.12, 0.15 * v);
        break;
      case 'drop':
        this.noiseHit(0.2, 0.15 * v, 'bandpass', 1200, 300, 1);
        break;
      case 'land':
        this.tone('sine', 120, 60, 0.12, 0.25 * v);
        break;
      case 'summon':
      case 'portal':
        this.tone('sawtooth', 110, 440, 0.8, 0.07 * v, 0, undefined, 0.2);
        this.tone('sawtooth', 112, 445, 0.8, 0.06 * v, 0, undefined, 0.2);
        this.noiseHit(0.8, 0.1 * v, 'bandpass', 400, 2000, 4);
        break;
      case 'build':
        this.tone('sine', 220 * r(), 180, 0.12, 0.2 * v);
        this.noiseHit(0.08, 0.15 * v, 'bandpass', 700, 500, 2);
        break;
      case 'sell':
        this.tone('square', 600, 200, 0.2, 0.06 * v);
        break;
      case 'die':
        this.tone('sawtooth', 160 * r(), 50, 0.6, 0.12 * v);
        this.noiseHit(0.4, 0.2 * v, 'lowpass', 800, 200);
        break;
      case 'herodie':
        this.tone('square', 260 * r(), 90, 0.45, 0.08 * v);
        this.noiseHit(0.3, 0.15 * v, 'lowpass', 1200, 300);
        break;
      case 'bell': {
        const f = 196;
        for (const [m, a] of [
          [1, 0.12],
          [2.76, 0.05],
          [5.4, 0.03],
          [0.5, 0.06],
        ])
          this.tone('sine', f * m, f * m, 1.8, a, 0, undefined, 0.002);
        break;
      }
      case 'research':
        [0, 3, 7, 12].forEach((s, k) => this.tone('triangle', 330 * Math.pow(2, s / 12), 330 * Math.pow(2, s / 12), 0.5, 0.06, k * 0.1));
        break;
      case 'levelup':
        [0, 4, 7, 12].forEach((s, k) => this.tone('square', 440 * Math.pow(2, s / 12), 440 * Math.pow(2, s / 12), 0.15, 0.04 * v, k * 0.07));
        break;
      case 'horn':
        this.tone('sawtooth', 98, 98, 1.2, 0.12, 0, undefined, 0.15);
        this.tone('sawtooth', 147, 147, 1.0, 0.07, 0.3, undefined, 0.15);
        break;
      case 'horn_hero':
        this.tone('square', 392, 392, 0.3, 0.06, 0);
        this.tone('square', 523, 523, 0.3, 0.06, 0.3);
        this.tone('square', 659, 659, 0.6, 0.06, 0.6);
        break;
      case 'thunder':
        this.noiseHit(0.15, 0.8 * v, 'highpass', 2000, 800);
        this.noiseHit(1.6, 0.6 * v, 'lowpass', 500, 60, 0.5, 0.05);
        break;
      case 'explode':
        this.noiseHit(1.2, 0.8 * v, 'lowpass', 1200, 60);
        this.tone('sine', 80, 30, 0.8, 0.5 * v);
        break;
      case 'explode_small':
        this.noiseHit(0.35, 0.35 * v, 'lowpass', 1500, 200);
        break;
      case 'cast':
        this.noiseHit(0.3, 0.2 * v, 'bandpass', 500, 2500, 3);
        break;
      case 'bow':
        this.tone('triangle', 220, 150, 0.12, 0.2 * v);
        this.noiseHit(0.1, 0.1 * v, 'highpass', 3000, 3000);
        break;
      case 'heal':
      case 'magic':
        for (let k = 0; k < 5; k++) this.tone('sine', 900 + k * 220, 1000 + k * 240, 0.25, 0.04 * v, k * 0.05);
        break;
      case 'heartHit':
        this.tone('sine', 60, 35, 0.35, 0.6 * v);
        this.noiseHit(0.15, 0.25 * v, 'lowpass', 400, 100);
        break;
      case 'deny':
        this.tone('square', 110, 100, 0.15, 0.07);
        break;
      case 'tag':
        this.tone('square', 900, 900, 0.03, 0.03 * v);
        break;
      case 'untag':
        this.tone('square', 600, 600, 0.03, 0.03 * v);
        break;
      case 'chomp':
        this.noiseHit(0.12, 0.3 * v, 'bandpass', 1800, 900, 3);
        this.noiseHit(0.1, 0.25 * v, 'bandpass', 1500, 700, 3, 0.15);
        break;
      case 'cluck':
        this.tone('square', 700, 500, 0.06, 0.05 * v);
        this.tone('square', 750, 450, 0.08, 0.05 * v, 0.1);
        break;
      case 'thwack':
        this.tone('sine', 180 * r(), 110, 0.1, 0.18 * v);
        this.noiseHit(0.06, 0.15 * v, 'bandpass', 900, 700, 2);
        break;
      case 'anvil':
        this.tone('sine', 820 * r(), 800, 0.4, 0.07 * v);
        this.tone('sine', 2150 * r(), 2100, 0.3, 0.04 * v);
        break;
      case 'crate':
        [0, 4, 7, 11, 14].forEach((s, k) => this.tone('triangle', 523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.4, 0.06, k * 0.06));
        break;
      case 'alert':
        this.tone('square', 500, 500, 0.1, 0.05 * v);
        this.tone('square', 700, 700, 0.12, 0.05 * v, 0.12);
        break;
      case 'join':
        [0, 7, 12].forEach((s, k) => this.tone('sine', 392 * Math.pow(2, s / 12), 392 * Math.pow(2, s / 12), 0.4, 0.08, k * 0.08));
        break;
      case 'victory':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => this.tone('sawtooth', 147 * Math.pow(2, s / 12), 147 * Math.pow(2, s / 12), 1.2, 0.05, k * 0.12, undefined, 0.05));
        break;
      case 'defeat':
        [12, 8, 5, 0, -4].forEach((s, k) => this.tone('sawtooth', 147 * Math.pow(2, s / 12), 147 * Math.pow(2, s / 12), 1.4, 0.06, k * 0.3, undefined, 0.1));
        break;
      case 'click':
        this.tone('square', 1200, 1200, 0.02, 0.03);
        break;
      default:
        this.tone('sine', 440, 440, 0.05, 0.03 * v);
    }
  }

  // ---------------------------------------------------------------- ambience & music
  private startAmbience() {
    const c = this.ctx!;
    // cavern wind: filtered noise with slow sweep
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 280;
    f.Q.value = 0.8;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(f.frequency);
    const g = c.createGain();
    g.gain.value = 0.16;
    s.connect(f).connect(g).connect(this.ambBus);
    s.start();
    lfo.start();
    // deep drone
    for (const fr of [36.7, 55.1]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      const of = c.createBiquadFilter();
      of.type = 'lowpass';
      of.frequency.value = 120;
      const og = c.createGain();
      og.gain.value = 0.05;
      o.connect(of).connect(og).connect(this.ambBus);
      o.start();
    }
  }

  private tickMusic() {
    if (!this.ctx || !this.started) return;
    const c = this.ctx;
    this.dripT -= 0.25;
    if (this.dripT <= 0) {
      this.dripT = 1.5 + Math.random() * 5;
      const f = 1200 + Math.random() * 1400;
      this.tone('sine', f, f * 1.8, 0.08, 0.025, 0, this.ambBus, 0.002);
    }
    if (!this.musicOn) return;
    this.musicT -= 0.25;
    if (this.musicT > 0) return;
    // D minor dirge: i - VI - iv - V
    const chords = [
      [50, 53, 57],
      [46, 50, 53],
      [43, 46, 50],
      [45, 49, 52],
      [50, 53, 57],
      [48, 52, 55],
      [46, 50, 53],
      [45, 49, 52],
    ];
    const ch = chords[this.chordIdx++ % chords.length];
    const dur = 6.4;
    this.musicT = dur;
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const t0 = c.currentTime;
    for (const n of ch) {
      for (const det of [-6, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(300, t0);
        f.frequency.linearRampToValueAtTime(900, t0 + dur * 0.5);
        f.frequency.linearRampToValueAtTime(300, t0 + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.035, t0 + 1.8);
        g.gain.linearRampToValueAtTime(0.03, t0 + dur - 1);
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.6);
        o.connect(f).connect(g).connect(this.musicBus);
        o.start(t0);
        o.stop(t0 + dur + 0.8);
      }
    }
    // bass
    this.tone('triangle', midi(ch[0] - 12), midi(ch[0] - 12), dur, 0.09, 0, this.musicBus, 1.2);
    // sparse bell melody from D minor
    const scale = [62, 64, 65, 67, 69, 70, 72, 74];
    const notes = Math.floor(Math.random() * 3);
    for (let k = 0; k < notes; k++) {
      const n = scale[Math.floor(Math.random() * scale.length)];
      const at = 0.8 + k * 1.6 + Math.random() * 0.8;
      for (const [m, a] of [
        [1, 0.05],
        [2.76, 0.015],
        [5.4, 0.008],
      ])
        this.tone('sine', midi(n) * m, midi(n) * m, 2.4, a, at, this.musicBus, 0.003);
    }
  }
}
