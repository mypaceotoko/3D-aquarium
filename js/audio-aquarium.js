/**
 * Procedural audio for tropical and ocean aquariums.
 * Same API shape as audio.js so callers are interchangeable.
 *
 * Themes:
 *   'tropical' — bright, gentle, light shimmer + frequent bubbles
 *   'ocean'    — vast, open, slow whale-song oscillator + deep drone
 */
export function initAquariumAudio({ theme = 'tropical', getCreatures } = {}) {
  let ctx     = null;
  let master  = null;
  let motionG = null;
  let themeG  = null;   // theme-specific layer gain node
  let started = false;
  let nextBubbleAt = 0;

  function _makePinkNoise(audioCtx) {
    const SECS = 4;
    const len  = audioCtx.sampleRate * SECS;
    const buf  = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520; b3 = 0.86650*b3 + w*0.3104856;
      b4 = 0.55000*b4 + w*0.5329522; b5 = -0.7616*b5  - w*0.0168980;
      const out = b0+b1+b2+b3+b4+b5+b6 + w*0.5362; b6 = w*0.115926;
      data[i] = out * 0.11;
    }
    return buf;
  }

  function _makeSineLfo(audioCtx, periodSecs, unipolar = false) {
    const len  = audioCtx.sampleRate * periodSecs;
    const buf  = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const s = Math.sin((i / len) * Math.PI * 2);
      data[i] = unipolar ? (s + 1) / 2 : s;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;
    return src;
  }

  function ensureContext() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    } catch (_) { return null; }

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const buf = _makePinkNoise(ctx);

    // ── Base rumble layer ───────────────────────────────────────────────
    const baseSrc = ctx.createBufferSource();
    baseSrc.buffer = buf; baseSrc.loop = true;
    const baseLP = ctx.createBiquadFilter();
    baseLP.type = 'lowpass';
    baseLP.frequency.value = theme === 'tropical' ? 340 : 220;
    const baseG = ctx.createGain();
    baseG.gain.value = theme === 'tropical' ? 0.20 : 0.38;
    baseSrc.connect(baseLP).connect(baseG).connect(master);
    baseSrc.start();

    // ── Swell layer with slow LFO ───────────────────────────────────────
    const swellSrc = ctx.createBufferSource();
    swellSrc.buffer = buf; swellSrc.loop = true;
    swellSrc.detune.value = theme === 'tropical' ? 500 : 650;
    const swellHP = ctx.createBiquadFilter();
    swellHP.type = 'highpass';
    swellHP.frequency.value = theme === 'tropical' ? 260 : 140;
    const swellLP = ctx.createBiquadFilter();
    swellLP.type = 'lowpass';
    swellLP.frequency.value = theme === 'tropical' ? 920 : 580;
    const swellG = ctx.createGain();
    swellG.gain.value = theme === 'tropical' ? 0.08 : 0.13;
    swellSrc.connect(swellHP).connect(swellLP).connect(swellG).connect(master);
    swellSrc.start();

    const lfo = _makeSineLfo(ctx, 20);
    const lfoG = ctx.createGain();
    lfoG.gain.value = theme === 'tropical' ? 0.04 : 0.06;
    lfo.connect(lfoG).connect(swellG.gain);
    lfo.start();

    // ── Theme-specific layer ────────────────────────────────────────────
    if (theme === 'tropical') {
      // High shimmer — light dancing through shallow water
      const shimSrc = ctx.createBufferSource();
      shimSrc.buffer = buf; shimSrc.loop = true;
      shimSrc.detune.value = 2400;
      const shimBP = ctx.createBiquadFilter();
      shimBP.type = 'bandpass';
      shimBP.frequency.value = 1100;
      shimBP.Q.value = 0.45;
      themeG = ctx.createGain();
      themeG.gain.value = 0.055;
      shimSrc.connect(shimBP).connect(themeG).connect(master);
      shimSrc.start();

      const shimLfo = _makeSineLfo(ctx, 8);
      const shimLfoG = ctx.createGain();
      shimLfoG.gain.value = 0.02;
      shimLfo.connect(shimLfoG).connect(themeG.gain);
      shimLfo.start();

    } else {
      // Ocean: slow deep whale-drone, gain driven by LFO + creature speed
      const whaleSrc = ctx.createBufferSource();
      whaleSrc.buffer = buf; whaleSrc.loop = true;
      whaleSrc.detune.value = -900;
      const whaleLP = ctx.createBiquadFilter();
      whaleLP.type = 'lowpass';
      whaleLP.frequency.value = 110;
      whaleLP.Q.value = 1.3;
      themeG = ctx.createGain();
      themeG.gain.value = 0.0;
      whaleSrc.connect(whaleLP).connect(themeG).connect(master);
      whaleSrc.start();

      const wLfo = _makeSineLfo(ctx, 18, true);
      const wLfoG = ctx.createGain();
      wLfoG.gain.value = 0.18;
      wLfo.connect(wLfoG).connect(themeG.gain);
      wLfo.start();
    }

    // ── Motion layer (tracks mean creature speed) ───────────────────────
    const motSrc = ctx.createBufferSource();
    motSrc.buffer = buf; motSrc.loop = true;
    motSrc.detune.value = -300;
    const motLP = ctx.createBiquadFilter();
    motLP.type = 'lowpass';
    motLP.frequency.value = theme === 'tropical' ? 420 : 290;
    motionG = ctx.createGain();
    motionG.gain.value = 0;
    motSrc.connect(motLP).connect(motionG).connect(master);
    motSrc.start();

    return ctx;
  }

  // ── Public controls ─────────────────────────────────────────────────────

  function enable() {
    if (!ensureContext()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.2);
    return true;
  }

  function disable() {
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.6);
  }

  // ── Sound effects ────────────────────────────────────────────────────────

  function triggerBubble() {
    if (!started || !ctx) return;
    const t  = ctx.currentTime;
    const f0 = theme === 'tropical'
      ? 500 + Math.random() * 700
      : 360 + Math.random() * 520;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 2.3, t + 0.10);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 260;
    osc.connect(hp).connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.32);
  }

  function triggerFeed() {
    if (!started || !ctx) return;
    const t   = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.30);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp  = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(theme === 'tropical' ? 2400 : 1700, t);
    lp.frequency.exponentialRampToValueAtTime(420, t + 0.30);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(lp).connect(g).connect(master);
    src.start(t); src.stop(t + 0.48);

    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(theme === 'tropical' ? 860 : 680, t);
    osc.frequency.exponentialRampToValueAtTime(130, t + 0.44);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(og).connect(master);
    osc.start(t); osc.stop(t + 0.60);
  }

  function triggerChomp() {
    if (!started || !ctx) return;
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = 'triangle';
    osc.frequency.setValueAtTime(theme === 'tropical' ? 300 : 210, t);
    osc.frequency.exponentialRampToValueAtTime(75, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.20, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.32);
  }

  // ── Per-frame update ─────────────────────────────────────────────────────

  function update(dt, time) {
    if (!started || !ctx) return;

    const creatures = getCreatures?.() ?? [];
    let sum = 0, n = 0;
    for (const c of creatures) {
      if (c.speedNorm !== undefined) { sum += c.speedNorm; n++; }
    }
    const meanSpeed    = n > 0 ? sum / n : 0;
    const targetMotion = 0.015 + meanSpeed * 0.05;
    motionG.gain.value += (targetMotion - motionG.gain.value) * Math.min(1, dt * 1.5);

    // Ocean: whale-drone tracks creature activity
    if (theme === 'ocean' && themeG) {
      const targetW = 0.05 + meanSpeed * 0.12;
      themeG.gain.value += (targetW - themeG.gain.value) * Math.min(1, dt * 0.5);
    }

    if (time > nextBubbleAt) {
      triggerBubble();
      const interval = theme === 'tropical'
        ? 1.5 + Math.random() * 2.5
        : 2.5 + Math.random() * 4.5;
      nextBubbleAt = time + interval;
    }
  }

  return {
    enable,
    disable,
    isStarted: () => started,
    update,
    triggerFeed,
    triggerChomp,
    triggerBubble,
  };
}
