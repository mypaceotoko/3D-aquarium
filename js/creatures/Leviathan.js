import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// Full-body serpentine bend shader (unlike fishBend which is tail-only,
// the Leviathan's entire body undulates like a sea serpent).
// ─────────────────────────────────────────────────────────────────────────────

function makeLeviathanUniforms({ length = 14, amp = 0.9, freq = 0.38, waves = 2.2, curl = 0.55 } = {}) {
  return {
    uTime:  { value: 0 },
    uTurn:  { value: 0 },
    uPitch: { value: 0 },
    uAmp:   { value: amp },
    uFreq:  { value: freq },
    uLen:   { value: length },
    uWaves: { value: waves },
    uCurl:  { value: curl },
  };
}

function injectLeviathanBend(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uTurn;
        uniform float uPitch;
        uniform float uAmp;
        uniform float uFreq;
        uniform float uLen;
        uniform float uWaves;
        uniform float uCurl;
      `)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        // bodyS: +1.0 = head, -1.0 = tail
        float bodyS = clamp(transformed.x / (uLen * 0.5), -1.0, 1.0);
        // Amplitude envelope: full at tail/body, fades near head tip
        float headFade = 1.0 - smoothstep(0.55, 1.0, bodyS);
        // Travelling wave: appears to propagate head→tail
        float phase = uTime * uFreq * 6.28318 + bodyS * uWaves * 3.14159;
        float wave = sin(phase) * uAmp * headFade;
        // Steering curl: tail trails outside the turn
        wave += uTurn * uCurl * headFade;
        transformed.z += wave;
        // Pitch: vertical nose tilt, tail follows opposite
        transformed.y += -uPitch * (1.0 - bodyS * 0.6) * 0.55;
      `);
  };
  material.customProgramCacheKey = () => 'leviathanBend_v1';
  return material;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leviathan — giant deep-sea dragon
// ─────────────────────────────────────────────────────────────────────────────

export class Leviathan extends Creature {
  constructor(opts = {}) {
    const scale  = opts.scale ?? 1.0;
    const L      = 14.0 * scale;
    const group  = new THREE.Group();
    const uniforms = makeLeviathanUniforms({ length: L });

    // ── Body ──────────────────────────────────────────────────────────────
    // LatheGeometry profile: serpentine sea dragon, long and sinuous.
    // Points go from +Y (head) to -Y (tail) in local lathe space;
    // after rotateZ(-PI/2) the fish aligns with +X = head, -X = tail.
    const bodyProfile = [
      new THREE.Vector2(0.02,  +L * 0.501),  // snout tip
      new THREE.Vector2(0.18,  +L * 0.490),
      new THREE.Vector2(0.46,  +L * 0.465),  // upper jaw
      new THREE.Vector2(0.72,  +L * 0.420),  // cheek
      new THREE.Vector2(0.92,  +L * 0.360),  // neck
      new THREE.Vector2(0.80,  +L * 0.280),  // slight neck dip
      new THREE.Vector2(1.00,  +L * 0.170),  // shoulder flare
      new THREE.Vector2(1.05,  +L * 0.040),  // widest — chest
      new THREE.Vector2(1.05,  -L * 0.080),  // belly wide
      new THREE.Vector2(1.00,  -L * 0.200),
      new THREE.Vector2(0.92,  -L * 0.320),
      new THREE.Vector2(0.80,  -L * 0.390),
      new THREE.Vector2(0.62,  -L * 0.430),
      new THREE.Vector2(0.42,  -L * 0.460),
      new THREE.Vector2(0.24,  -L * 0.480),
      new THREE.Vector2(0.06,  -L * 0.498),  // tail root
      new THREE.Vector2(0.015, -L * 0.501),  // tail tip
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 18, 0, Math.PI * 2);
    bodyGeo.rotateZ(-Math.PI / 2);
    // Flatten body laterally (sea serpent is more eel-like, compressed sides)
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        // Compress Z (lateral width): slightly thinner for a sleek look
        p.setZ(i, p.getZ(i) * 0.82);
        // Head flattening top-to-bottom
        const headBlend = THREE.MathUtils.smoothstep(x, L * 0.2, L * 0.45);
        p.setY(i, p.getY(i) * THREE.MathUtils.lerp(0.88, 0.68, headBlend));
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyMat = injectLeviathanBend(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: makeLeviathanBodyTexture(L),
        roughness: 0.35,
        metalness: 0.18,
        emissive: 0x00302a,
        emissiveIntensity: 0.6,
      }),
      uniforms,
    );
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ── Dorsal ridge fins (3 along the back) ──────────────────────────────
    const dorsalMat = injectLeviathanBend(
      makeFinMat(0x0b4a5a, 0x00c8a8),
      uniforms,
    );
    const dorsalSpecs = [
      { atX: +L * 0.28, height: 1.55 * scale, length: 1.8 * scale },
      { atX:  0,        height: 1.85 * scale, length: 2.2 * scale },  // tallest
      { atX: -L * 0.22, height: 1.40 * scale, length: 1.6 * scale },
    ];
    for (const sp of dorsalSpecs) {
      const fin = makeDorsalFin(dorsalMat, sp, scale);
      group.add(fin);
    }

    // ── Tail fin (large lunate fluke, horizontal like a whale) ────────────
    const tailMat = injectLeviathanBend(makeFinMat(0x083840, 0x008878), uniforms);
    const tailFluke = makeTailFluke(tailMat, L, scale);
    group.add(tailFluke);

    // ── Pectoral fins (large wing-like, behind gills) ──────────────────────
    const pecMat = injectLeviathanBend(makeFinMat(0x0a4050, 0x009988), uniforms);
    const pectorals = [];
    for (const side of [-1, 1]) {
      const pec = makePectoralFin(pecMat, {
        L, scale, side,
        atX: +L * 0.26, atY: -0.35 * scale, atZ: 0.88 * scale * side,
      });
      pec.userData.phase  = side * Math.PI * 0.5;
      pec.userData.baseRZ = pec.rotation.z;
      pec.userData.baseRY = pec.rotation.y;
      pectorals.push(pec);
      group.add(pec);
    }

    // ── Head horns / crests ───────────────────────────────────────────────
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0x0d3a44, roughness: 0.6, metalness: 0.1,
      emissive: 0x003830, emissiveIntensity: 0.5,
    });
    for (const side of [-1, 1]) {
      const hornGeo = new THREE.ConeGeometry(0.12 * scale, 0.65 * scale, 6);
      hornGeo.rotateX(Math.PI);
      hornGeo.rotateZ(-0.55 * side);
      const horn = new THREE.Mesh(hornGeo, hornMat);
      horn.position.set(+L * 0.40, 0.60 * scale, 0.30 * scale * side);
      group.add(horn);
    }
    // Central crest horn
    {
      const crestGeo = new THREE.ConeGeometry(0.14 * scale, 0.90 * scale, 6);
      crestGeo.rotateX(Math.PI);
      const crest = new THREE.Mesh(crestGeo, hornMat);
      crest.position.set(+L * 0.38, 0.88 * scale, 0);
      group.add(crest);
    }

    // ── Eyes (glowing amber) ──────────────────────────────────────────────
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xd08010, roughness: 0.15, metalness: 0.0,
      emissive: 0xffa020, emissiveIntensity: 2.2,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x020305 });
    const eyeGeo   = new THREE.SphereGeometry(0.115 * scale, 10, 8);
    const pupilGeo = new THREE.SphereGeometry(0.055 * scale, 8, 6);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(+L * 0.37, 0.22 * scale, 0.55 * scale * side);
      group.add(eye);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(+L * 0.385, 0.22 * scale, 0.60 * scale * side);
      group.add(pupil);
    }

    // ── Bioluminescent glow point light ───────────────────────────────────
    const glow = new THREE.PointLight(0x00e8c8, 1.4, 8 * scale, 2);
    glow.position.set(0, 0.3 * scale, 0);
    group.add(glow);

    // ── Super ─────────────────────────────────────────────────────────────
    super({
      species: 'leviathan',
      mesh: group,
      cfg: {
        speed: 1.85,
        maxAccel: 0.50,
        turnRate: 0.32,
        depthMin: TANK.floorY + 3.5,
        depthMax: TANK.maxY   - 3.5,
        wanderMin: 14,
        wanderMax: 22,
        wallMargin: 8.0,
        reactsToFood: false,
        facesVelocity: true,
      },
      position: opts.position,
    });

    this._uniforms   = uniforms;
    this._scale      = scale;
    this._pectorals  = pectorals;
    this._glow       = glow;
    this._pitchTarget = 0;

    // Burst state
    this._burstCooldown = THREE.MathUtils.randFloat(15, 25);
    this._burstTimer    = 0;
    this._isBursting    = false;
  }

  onUpdate(dt, time, state) {
    const u = this._uniforms;
    u.uTime.value  = time;
    u.uTurn.value  = this.turnSignal;

    // Pitch follows vertical velocity
    const pitchTarget = THREE.MathUtils.clamp(
      this.vel.y / Math.max(this.cfg.speed, 0.01), -0.5, 0.5,
    );
    this._pitchTarget = THREE.MathUtils.lerp(this._pitchTarget, pitchTarget, Math.min(1, dt * 1.2));
    u.uPitch.value = this._pitchTarget;

    // ── Burst logic ───────────────────────────────────────────────────────
    if (this._isBursting) {
      this._burstTimer -= dt;
      if (this._burstTimer <= 0) {
        this._isBursting = false;
        this._burstCooldown = THREE.MathUtils.randFloat(18, 35);
        this.cfg.speed = 1.85;
        this.cfg.maxAccel = 0.50;
      }
    } else {
      this._burstCooldown -= dt;
      if (this._burstCooldown <= 0) {
        this._isBursting = true;
        this._burstTimer = THREE.MathUtils.randFloat(2.5, 4.5);
        this.cfg.speed   = 4.2;
        this.cfg.maxAccel = 2.5;
        this.pickTarget(); // pick a fresh far target for the burst
      }
    }

    // ── Swim animation ────────────────────────────────────────────────────
    const burstMul = this._isBursting ? 1.6 : 1.0;
    u.uFreq.value = (0.28 + 0.55 * this.speedNorm) * burstMul;
    u.uAmp.value  =  0.75 + 0.40 * this.speedNorm + (this._isBursting ? 0.3 : 0);

    // ── Body banking ──────────────────────────────────────────────────────
    this.mesh.rotation.x = THREE.MathUtils.lerp(
      this.mesh.rotation.x, -this.turnSignal * 0.22, Math.min(1, dt * 1.8),
    );
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z, this._pitchTarget * 0.30, Math.min(1, dt * 1.5),
    );

    // ── Pectoral fin sculling ─────────────────────────────────────────────
    for (const p of this._pectorals) {
      const w = Math.sin(time * 0.75 + p.userData.phase);
      p.rotation.z = p.userData.baseRZ + w * 0.28 + this.turnSignal * 0.18;
      p.rotation.y = p.userData.baseRY + w * 0.12;
    }

    // ── Glow pulse ────────────────────────────────────────────────────────
    this._glow.intensity = 1.2 + Math.sin(time * 1.8) * 0.3 + (this._isBursting ? 0.6 : 0);
  }

  /** Larger hit-test radius so it's easy to click */
  getCenter(out = new THREE.Vector3()) {
    return out.copy(this.pos);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDorsalFin(mat, { atX, height, length }, scale) {
  const s = new THREE.Shape();
  // Swept-back triangular crest with jagged tip
  s.moveTo(length * 0.3, 0);
  s.quadraticCurveTo(-length * 0.1, height * 0.55, -length * 0.25, height * 0.95);
  s.lineTo(-length * 0.28, height * 1.0);
  s.quadraticCurveTo(-length * 0.40, height * 0.70, -length * 0.65, height * 0.80);
  s.lineTo(-length * 0.70, height * 0.75);
  s.quadraticCurveTo(-length * 0.85, height * 0.30, -length * 0.90, 0);
  s.quadraticCurveTo(-length * 0.40, 0.05, 0, 0.03);
  s.lineTo(length * 0.3, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  geo.translate(atX, 0, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0.95 * scale, 0);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function makeTailFluke(mat, L, scale) {
  // Horizontal lunate fluke (like a whale, gives power)
  const W = 2.4 * scale;
  const H = 1.1 * scale;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(-W * 0.3, W * 0.65, -W * 1.05, W * 0.70);
  s.quadraticCurveTo(-W * 1.30, W * 0.25, -W * 1.25, 0);
  s.quadraticCurveTo(-W * 1.30, -W * 0.25, -W * 1.05, -W * 0.70);
  s.quadraticCurveTo(-W * 0.3, -W * 0.65, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 14);
  geo.translate(-L * 0.50, 0, 0);
  // Rotate fluke to horizontal plane
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

function makePectoralFin(mat, { L, scale, side, atX, atY, atZ }) {
  const fL = 2.0 * scale;
  const fH = 0.9 * scale;
  const s = new THREE.Shape();
  s.moveTo(fL * 0.15, 0);
  s.quadraticCurveTo(-fL * 0.3, fH * 1.0, -fL * 0.85, fH * 0.85);
  s.quadraticCurveTo(-fL * 1.05, fH * 0.25, -fL * 1.0, 0);
  s.quadraticCurveTo(-fL * 0.45, -0.06, 0, 0.02);
  s.lineTo(fL * 0.15, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  if (side < 0) geo.scale(1, -1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(atX, atY, atZ);
  mesh.rotation.set(
    0,
    side > 0 ? -0.5 : 0.5,
    side > 0 ? -0.55 : 0.55,
  );
  return mesh;
}

function makeFinMat(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.12,
    side: THREE.DoubleSide,
    emissive,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.88,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural body texture: deep-sea teal with bioluminescent stripe spots
// ─────────────────────────────────────────────────────────────────────────────

function makeLeviathanBodyTexture(L) {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Base gradient: deep navy tail → dark teal body → slightly lighter head
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0.00, '#05181e');  // tail
  grad.addColorStop(0.15, '#071f28');
  grad.addColorStop(0.35, '#0b2e3a');  // body dark
  grad.addColorStop(0.55, '#0e3a46');  // body mid
  grad.addColorStop(0.75, '#103444');
  grad.addColorStop(0.90, '#0c2830');
  grad.addColorStop(1.00, '#071c24');  // head
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Belly lightening
  const belly = g.createLinearGradient(0, 0, 0, H);
  belly.addColorStop(0.00, 'rgba(0,0,0,0.25)');
  belly.addColorStop(0.45, 'rgba(0,0,0,0.00)');
  belly.addColorStop(1.00, 'rgba(80,180,160,0.20)');
  g.fillStyle = belly;
  g.fillRect(0, 0, W, H);

  // Large dragon scales (hexagonal-ish)
  const sz = 28;
  for (let row = 0; row * sz * 0.75 < H + sz; row++) {
    for (let col = 0; col * sz * 0.88 < W + sz; col++) {
      const ox = (row % 2) * (sz * 0.44);
      const cx = col * sz * 0.88 + ox;
      const cy = row * sz * 0.75;
      const u  = cx / W;
      // Scales denser on body, sparser toward tail and head
      const density = 1.0 - Math.pow(Math.abs(u - 0.5) * 2, 1.5);
      if (Math.random() > 0.55 + density * 0.3) continue;
      // Scale border
      g.globalAlpha = 0.22 + density * 0.18;
      g.strokeStyle = '#001820';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(cx, cy, sz * 0.46, 0, Math.PI * 2);
      g.stroke();
      // Subtle iridescent sheen
      g.globalAlpha = 0.08 + density * 0.10;
      const rg = g.createRadialGradient(cx - sz * 0.12, cy - sz * 0.12, 0, cx, cy, sz * 0.46);
      rg.addColorStop(0, 'rgba(0, 230, 210, 0.7)');
      rg.addColorStop(1, 'rgba(0, 230, 210, 0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(cx, cy, sz * 0.46, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;

  // Bioluminescent lateral-line dots
  g.globalCompositeOperation = 'screen';
  const dotY = H * 0.42;
  for (let x = W * 0.05; x < W * 0.92; x += W * 0.038 + Math.random() * W * 0.01) {
    const r = 3.5 + Math.random() * 4;
    g.globalAlpha = 0.55 + Math.random() * 0.35;
    const rg = g.createRadialGradient(x, dotY, 0, x, dotY, r * 2.5);
    rg.addColorStop(0, 'rgba(0, 255, 220, 1)');
    rg.addColorStop(1, 'rgba(0, 255, 220, 0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, dotY, r * 2.5, 0, Math.PI * 2);
    g.fill();
  }
  // Second lateral line
  const dotY2 = H * 0.60;
  for (let x = W * 0.08; x < W * 0.88; x += W * 0.055 + Math.random() * W * 0.015) {
    const r = 2.5 + Math.random() * 3;
    g.globalAlpha = 0.35 + Math.random() * 0.25;
    const rg = g.createRadialGradient(x, dotY2, 0, x, dotY2, r * 2);
    rg.addColorStop(0, 'rgba(30, 220, 255, 1)');
    rg.addColorStop(1, 'rgba(30, 220, 255, 0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, dotY2, r * 2, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  // Noise grain
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i]   = clamp255(d[i]   + n);
    d[i+1] = clamp255(d[i+1] + n * 0.9);
    d[i+2] = clamp255(d[i+2] + n * 0.7);
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function clamp255(v) { return Math.max(0, Math.min(255, v)); }

// ─────────────────────────────────────────────────────────────────────────────

export function spawnLeviathan(scene, opts = {}) {
  const lev = new Leviathan(opts);
  scene.add(lev.mesh);
  return lev;
}
