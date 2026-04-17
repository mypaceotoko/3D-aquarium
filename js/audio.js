/**
 * Procedural underwater soundscape via WebAudio. Zero hosted assets.
 *
 *   - Rumble   : long-looped pink-noise buffer → lowpass ~160 Hz → low gain
 *   - Ambience : a second noise layer with very slow LFO-modulated gain for
 *                gentle "swell" movement
 *   - Motion   : second lowpass-noise layer whose gain tracks mean fish speed
 *   - Bubbles  : random high-frequency sine pips with exp-decay every 2-6 s
 *   - Feed     : noise burst + downward pitch sweep when food is dropped
 *
 * Autoplay policy: the AudioContext is created *lazily* on the first time
 * the user toggles sound on. Initial state is muted.
 */
export function initAudio({ state, getCreatures }) {
  let ctx = null;
  let master = null;
  let rumbleG = null;       // rumble gain
  let swellG = null;        // ambience swell gain
  let motionG = null;       // motion gain (tracks mean fish speed)
  let started = false;

  let nextBubbleAt = 0;
  let leviathanG = null;   // leviathan low-frequency moan gain

  function ensureContext() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    } catch (_) {
      return null;
    }

    master = ctx.createGain();
    master.gain.value = 0;          // start muted; fades up in enable()
    master.connect(ctx.destination);

    // ---- Pink noise source (shared buffer) ------------------------
    const NOISE_SECS = 4;
    const len = ctx.sampleRate * NOISE_SECS;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Paul Kellet's pink filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = out * 0.11;
    }

    // ---- Rumble layer (deep lowpass) ------------------------------
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = buf;
    rumbleSrc.loop = true;
    const rumbleLP = ctx.createBiquadFilter();
    rumbleLP.type = 'lowpass';
    rumbleLP.frequency.value = 160;
    rumbleLP.Q.value = 0.8;
    rumbleG = ctx.createGain();
    rumbleG.gain.value = 0.42;
    rumbleSrc.connect(rumbleLP).connect(rumbleG).connect(master);
    rumbleSrc.start();

    // ---- Ambience swell layer -------------------------------------
    const swellSrc = ctx.createBufferSource();
    swellSrc.buffer = buf;
    swellSrc.loop = true;
    swellSrc.detune.value = 700;              // different tonal colour
    const swellLP = ctx.createBiquadFilter();
    swellLP.type = 'lowpass';
    swellLP.frequency.value = 520;
    swellLP.Q.value = 0.6;
    const swellHP = ctx.createBiquadFilter();
    swellHP.type = 'highpass';
    swellHP.frequency.value = 180;
    swellG = ctx.createGain();
    swellG.gain.value = 0.12;
    swellSrc.connect(swellHP).connect(swellLP).connect(swellG).connect(master);
    swellSrc.start();

    // Slow LFO on swell gain for gentle breathing
    const lfoBuf = ctx.createBuffer(1, ctx.sampleRate * 20, ctx.sampleRate);
    const lfoData = lfoBuf.getChannelData(0);
    for (let i = 0; i < lfoData.length; i++) {
      lfoData[i] = Math.sin((i / lfoData.length) * Math.PI * 2);
    }
    const lfo = ctx.createBufferSource();
    lfo.buffer = lfoBuf;
    lfo.loop = true;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(swellG.gain);
    lfo.start();

    // ---- Leviathan layer (sub-bass moan, slow LFO) ----------------
    const levSrc = ctx.createBufferSource();
    levSrc.buffer = buf;
    levSrc.loop = true;
    levSrc.detune.value = -1200;           // one octave down — deep sub-bass
    const levLP = ctx.createBiquadFilter();
    levLP.type = 'lowpass';
    levLP.frequency.value = 90;
    levLP.Q.value = 1.4;
    leviathanG = ctx.createGain();
    leviathanG.gain.value = 0.0;           // starts silent; ramped on leviathan burst
    levSrc.connect(levLP).connect(leviathanG).connect(master);
    levSrc.start();
    // Slow LFO for whale-like moan swell
    const levLfoBuf = ctx.createBuffer(1, ctx.sampleRate * 14, ctx.sampleRate);
    const levLfoData = levLfoBuf.getChannelData(0);
    for (let i = 0; i < levLfoData.length; i++) {
      levLfoData[i] = (Math.sin((i / levLfoData.length) * Math.PI * 2) + 1) / 2;
    }
    const levLfo = ctx.createBufferSource();
    levLfo.buffer = levLfoBuf;
    levLfo.loop = true;
    const levLfoG = ctx.createGain();
    levLfoG.gain.value = 0.28;
    levLfo.connect(levLfoG).connect(leviathanG.gain);
    levLfo.start();

    // ---- Motion layer (tracks fish speed) --------------------------
    const motionSrc = ctx.createBufferSource();
    motionSrc.buffer = buf;
    motionSrc.loop = true;
    motionSrc.detune.value = -400;
    const motionLP = ctx.createBiquadFilter();
    motionLP.type = 'lowpass';
    motionLP.frequency.value = 320;
    motionLP.Q.value = 0.7;
    motionG = ctx.createGain();
    motionG.gain.value = 0.0;
    motionSrc.connect(motionLP).connect(motionG).connect(master);
    motionSrc.start();

    return ctx;
  }

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

  // --- Sound effects -------------------------------------------------

  function triggerBubble() {
    if (!started || !ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f0 = 360 + Math.random() * 600;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 2.4, t + 0.12);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 240;

    osc.connect(hp).connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  function triggerFeed() {
    if (!started || !ctx) return;
    const t = ctx.currentTime;
    // Short noise splash
    const len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(lp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.5);

    // Pitched down sine sweep
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.45);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(og).connect(master);
    osc.start(t);
    osc.stop(t + 0.65);
  }

  function triggerChomp() {
    if (!started || !ctx) return;
    // Wet, thuddy ping for when a creature consumes food
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  // --- Update --------------------------------------------------------

  function update(dt, time) {
    if (!started || !ctx) return;

    // Motion gain tracks mean fish speed; leviathan gain tracks its own speed
    const creatures = getCreatures?.() ?? [];
    let sum = 0, n = 0;
    let levSpeed = 0;
    for (const c of creatures) {
      if (c.speedNorm !== undefined) { sum += c.speedNorm; n++; }
      if (c.species === 'leviathan') levSpeed = c.speedNorm ?? 0;
    }
    const meanSpeed = n > 0 ? sum / n : 0;
    const targetMotion = 0.02 + meanSpeed * 0.06;
    const cur = motionG.gain.value;
    motionG.gain.value = cur + (targetMotion - cur) * Math.min(1, dt * 1.5);

    // Leviathan sub-bass: louder during bursts
    if (leviathanG) {
      const targetLev = 0.08 + levSpeed * 0.20;
      const curLev = leviathanG.gain.value;
      leviathanG.gain.value = curLev + (targetLev - curLev) * Math.min(1, dt * 0.8);
    }

    // Periodic bubble sfx
    if (time > nextBubbleAt) {
      triggerBubble();
      nextBubbleAt = time + 2 + Math.random() * 4;
    }
  }

  return {
    enable() { return enable(); },
    disable,
    isStarted() { return started; },
    update,
    triggerFeed,
    triggerChomp,
    triggerBubble,
  };
}
