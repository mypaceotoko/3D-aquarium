import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// Full-body serpentine bend shader
// ─────────────────────────────────────────────────────────────────────────────

function makeLeviathanUniforms({ length = 14, amp = 0.85, freq = 0.38, waves = 2.2, curl = 0.55 } = {}) {
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
        float bodyS = clamp(transformed.x / (uLen * 0.5), -1.0, 1.0);
        float t = (bodyS + 1.0) * 0.5;
        float headFade = 1.0 - t * t * 0.7;
        float wave = sin(uTime * uFreq * 6.28318 + bodyS * uWaves * 3.14159) * uAmp * headFade;
        wave += uTurn * uCurl * headFade;
        transformed.z += wave;
        transformed.y += -uPitch * (1.0 - t) * 0.55;
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
    const scale    = opts.scale ?? 1.0;
    const L        = 14.0 * scale;
    const group    = new THREE.Group();
    const uniforms = makeLeviathanUniforms({ length: L });

    // ── Body (lathe, long serpentine) ─────────────────────────────────────
    // High-res profile (22 pts) for smooth silhouette + 32 radial segments
    // to eliminate visible polygon facets around the body.
    const bodyProfile = [
      new THREE.Vector2(0.02,  +L * 0.500),  // snout tip
      new THREE.Vector2(0.14,  +L * 0.492),
      new THREE.Vector2(0.32,  +L * 0.478),
      new THREE.Vector2(0.55,  +L * 0.455),  // upper jaw line
      new THREE.Vector2(0.78,  +L * 0.420),
      new THREE.Vector2(0.94,  +L * 0.375),  // brow
      new THREE.Vector2(1.02,  +L * 0.325),  // head-back crest
      new THREE.Vector2(0.88,  +L * 0.275),  // neck dip (slender)
      new THREE.Vector2(0.95,  +L * 0.210),
      new THREE.Vector2(1.08,  +L * 0.130),  // shoulder flare
      new THREE.Vector2(1.14,  +L * 0.030),  // widest chest
      new THREE.Vector2(1.12,  -L * 0.060),
      new THREE.Vector2(1.06,  -L * 0.160),
      new THREE.Vector2(0.98,  -L * 0.250),
      new THREE.Vector2(0.86,  -L * 0.330),
      new THREE.Vector2(0.70,  -L * 0.390),
      new THREE.Vector2(0.52,  -L * 0.430),
      new THREE.Vector2(0.36,  -L * 0.455),
      new THREE.Vector2(0.22,  -L * 0.475),
      new THREE.Vector2(0.10,  -L * 0.488),
      new THREE.Vector2(0.03,  -L * 0.498),
      new THREE.Vector2(0.01,  -L * 0.501),
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 32);
    bodyGeo.rotateZ(-Math.PI / 2);
    // Sculpt the silhouette: lateral compression + head flatten
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        // Head flatten (top-bottom)
        const headBlend = THREE.MathUtils.smoothstep(x, L * 0.12, L * 0.44);
        const yScale = THREE.MathUtils.lerp(0.92, 0.66, headBlend);
        // Body slight lateral compression (sleek like sea-snake)
        const zScale = THREE.MathUtils.lerp(0.88, 0.80, headBlend);
        // Belly keel (subtly flatter underside in body middle)
        const bellyT = THREE.MathUtils.smoothstep(x, -L * 0.30, L * 0.05);
        const bellyFlat = 1.0 - (y < 0 ? bellyT * 0.18 : 0);
        p.setY(i, y * yScale * bellyFlat);
        p.setZ(i, z * zScale);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyMat = injectLeviathanBend(
      new THREE.MeshStandardMaterial({
        color:              0xffffff,
        map:                makeLeviathanBodyTexture(),
        roughness:          0.30,
        metalness:          0.20,
        emissive:           new THREE.Color(0x00c8a0),
        emissiveIntensity:  0.55,
      }),
      uniforms,
    );
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ── Dorsal ridge fins (3 crests along back, 3D with bevel) ────────────
    const dorsalMat = injectLeviathanBend(
      makeFinMat(0x1a7888, new THREE.Color(0x00e8c0), 0.80),
      uniforms,
    );
    const dorsalDefs = [
      { atX: +L * 0.27, h: 1.60 * scale, len: 1.9 * scale },
      { atX:  0,        h: 2.10 * scale, len: 2.4 * scale },  // tallest central crest
      { atX: -L * 0.21, h: 1.45 * scale, len: 1.7 * scale },
    ];
    for (const d of dorsalDefs) {
      group.add(makeDorsalFin(dorsalMat, d, scale));
    }

    // Inter-crest spinal spines (7 small dorsal spikes for a dragon ridge)
    const spineMat = injectLeviathanBend(
      makeFinMat(0x1a6878, new THREE.Color(0x00c0a0), 0.95),
      uniforms,
    );
    const spineRanges = [
      { from: +L * 0.26, to: +L * 0.03, count: 3, h: 0.30 },
      { from: -L * 0.04, to: -L * 0.20, count: 2, h: 0.28 },
      { from: -L * 0.22, to: -L * 0.38, count: 2, h: 0.20 },
    ];
    for (const r of spineRanges) {
      for (let i = 0; i < r.count; i++) {
        const t = (i + 1) / (r.count + 1);
        const x = THREE.MathUtils.lerp(r.from, r.to, t);
        const spine = makeSpinalSpike(spineMat, x, r.h * scale, scale);
        group.add(spine);
      }
    }

    // ── Tail fluke (horizontal lunate, like a whale) ───────────────────────
    const tailMat = injectLeviathanBend(
      makeFinMat(0x0e5060, new THREE.Color(0x00b898), 0.75),
      uniforms,
    );
    group.add(makeTailFluke(tailMat, L, scale));

    // ── Pectoral fins (large wing-like) ────────────────────────────────────
    const pecMat = injectLeviathanBend(
      makeFinMat(0x186870, new THREE.Color(0x00d0b0), 0.78),
      uniforms,
    );
    const pectorals = [];
    for (const side of [-1, 1]) {
      const pec = makePectoralFin(pecMat, { L, scale, side });
      pec.userData.phase  = side * Math.PI * 0.5;
      pec.userData.baseRZ = pec.rotation.z;
      pec.userData.baseRY = pec.rotation.y;
      pectorals.push(pec);
      group.add(pec);
    }

    // ── Head horns / crests (curved tubes, not straight cones) ────────────
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0x1a5a68, roughness: 0.5, metalness: 0.15,
      emissive: new THREE.Color(0x00a888), emissiveIntensity: 0.6,
    });
    // Two swept-back side horns, curving outward-upward-backward
    for (const side of [-1, 1]) {
      const horn = makeCurvedHorn(hornMat, {
        base:   new THREE.Vector3(+L * 0.42, 0.55 * scale, 0.32 * scale * side),
        mid:    new THREE.Vector3(+L * 0.34, 1.00 * scale, 0.60 * scale * side),
        tip:    new THREE.Vector3(+L * 0.22, 1.25 * scale, 0.68 * scale * side),
        rBase:  0.14 * scale,
        rTip:   0.015 * scale,
      });
      group.add(horn);
    }
    // Central tall crest, curving slightly forward
    const crest = makeCurvedHorn(hornMat, {
      base: new THREE.Vector3(+L * 0.38, 0.82 * scale, 0),
      mid:  new THREE.Vector3(+L * 0.40, 1.30 * scale, 0),
      tip:  new THREE.Vector3(+L * 0.36, 1.72 * scale, 0),
      rBase: 0.16 * scale,
      rTip:  0.018 * scale,
    });
    group.add(crest);

    // ── Barbels / whiskers (4 trailing from lower jaw) ─────────────────────
    const barbelMat = new THREE.MeshStandardMaterial({
      color: 0x0e4858, roughness: 0.6, metalness: 0.1,
      emissive: new THREE.Color(0x00a090), emissiveIntensity: 0.45,
    });
    const barbelDefs = [
      { at: [+L * 0.455,  0.02 * scale,  0.18 * scale], len: 1.15 * scale, drop: 0.85 * scale, r: 0.028 * scale },
      { at: [+L * 0.455,  0.02 * scale, -0.18 * scale], len: 1.15 * scale, drop: 0.85 * scale, r: 0.028 * scale },
      { at: [+L * 0.440, -0.05 * scale,  0.32 * scale], len: 0.85 * scale, drop: 0.65 * scale, r: 0.022 * scale },
      { at: [+L * 0.440, -0.05 * scale, -0.32 * scale], len: 0.85 * scale, drop: 0.65 * scale, r: 0.022 * scale },
    ];
    for (const b of barbelDefs) {
      group.add(makeBarbel(barbelMat, b));
    }

    // ── Brow ridges above eyes (raised bony arches) ────────────────────────
    const browMat = new THREE.MeshStandardMaterial({
      color: 0x103848, roughness: 0.65, metalness: 0.1,
      emissive: new THREE.Color(0x004838), emissiveIntensity: 0.4,
    });
    for (const side of [-1, 1]) {
      const bg = new THREE.TorusGeometry(0.18 * scale, 0.045 * scale, 8, 14, Math.PI * 0.85);
      const brow = new THREE.Mesh(bg, browMat);
      brow.position.set(+L * 0.365, 0.32 * scale, 0.57 * scale * side);
      brow.rotation.set(Math.PI * 0.5, 0, side > 0 ? -0.2 : 0.2);
      brow.scale.set(1.1, 1, 0.7);
      group.add(brow);
    }

    // ── Nostril bumps (small raised spheres on snout) ──────────────────────
    for (const side of [-1, 1]) {
      const ng = new THREE.SphereGeometry(0.05 * scale, 8, 6);
      const nostril = new THREE.Mesh(ng, browMat);
      nostril.position.set(+L * 0.465, 0.18 * scale, 0.18 * scale * side);
      nostril.scale.set(1.2, 0.7, 0.9);
      group.add(nostril);
    }

    // ── Eyes (bright glowing amber) ───────────────────────────────────────
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xe09020, roughness: 0.1, metalness: 0,
      emissive: new THREE.Color(0xffb030), emissiveIntensity: 3.5,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x020305 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 10, 8), eyeMat);
      eye.position.set(+L * 0.365, 0.24 * scale, 0.57 * scale * side);
      group.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.058 * scale, 8, 6), pupilMat);
      pupil.position.set(+L * 0.382, 0.24 * scale, 0.62 * scale * side);
      group.add(pupil);
    }

    // ── Bioluminescent glow lights ─────────────────────────────────────────
    // Central body glow
    const glowBody = new THREE.PointLight(0x00e8c8, 3.5, 14 * scale, 2);
    glowBody.position.set(0, 0, 0);
    group.add(glowBody);
    // Head glow
    const glowHead = new THREE.PointLight(0x40d8f0, 2.0, 8 * scale, 2);
    glowHead.position.set(+L * 0.30, 0, 0);
    group.add(glowHead);

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
      // Start roughly centered so it's immediately visible
      position: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(10),
        THREE.MathUtils.randFloat(-2, 4),
        THREE.MathUtils.randFloat(-8, 8),
      ),
    });

    this._uniforms    = uniforms;
    this._scale       = scale;
    this._pectorals   = pectorals;
    this._glowBody    = glowBody;
    this._glowHead    = glowHead;
    this._pitchTarget = 0;

    // Burst state
    this._burstCooldown = THREE.MathUtils.randFloat(12, 22);
    this._burstTimer    = 0;
    this._isBursting    = false;
  }

  onUpdate(dt, time, state) {
    const u = this._uniforms;
    u.uTime.value = time;
    u.uTurn.value = this.turnSignal;

    const pitchTarget = THREE.MathUtils.clamp(
      this.vel.y / Math.max(this.cfg.speed, 0.01), -0.5, 0.5,
    );
    this._pitchTarget = THREE.MathUtils.lerp(this._pitchTarget, pitchTarget, Math.min(1, dt * 1.2));
    u.uPitch.value = this._pitchTarget;

    // ── Burst ─────────────────────────────────────────────────────────────
    if (this._isBursting) {
      this._burstTimer -= dt;
      if (this._burstTimer <= 0) {
        this._isBursting    = false;
        this._burstCooldown = THREE.MathUtils.randFloat(18, 35);
        this.cfg.speed      = 1.85;
        this.cfg.maxAccel   = 0.50;
      }
    } else {
      this._burstCooldown -= dt;
      if (this._burstCooldown <= 0) {
        this._isBursting  = true;
        this._burstTimer  = THREE.MathUtils.randFloat(2.5, 4.5);
        this.cfg.speed    = 4.2;
        this.cfg.maxAccel = 2.5;
        this.pickTarget();
      }
    }

    // ── Swim animation ─────────────────────────────────────────────────────
    const bMul = this._isBursting ? 1.6 : 1.0;
    u.uFreq.value = (0.28 + 0.55 * this.speedNorm) * bMul;
    u.uAmp.value  =  0.70 + 0.40 * this.speedNorm + (this._isBursting ? 0.3 : 0);

    // ── Body banking ───────────────────────────────────────────────────────
    this.mesh.rotation.x = THREE.MathUtils.lerp(
      this.mesh.rotation.x, -this.turnSignal * 0.22, Math.min(1, dt * 1.8),
    );
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z, this._pitchTarget * 0.30, Math.min(1, dt * 1.5),
    );

    // ── Pectoral sculling ──────────────────────────────────────────────────
    for (const p of this._pectorals) {
      const w = Math.sin(time * 0.75 + p.userData.phase);
      p.rotation.z = p.userData.baseRZ + w * 0.28 + this.turnSignal * 0.18;
      p.rotation.y = p.userData.baseRY + w * 0.12;
    }

    // ── Glow pulse ─────────────────────────────────────────────────────────
    const glowBase = this._isBursting ? 5.0 : 3.5;
    this._glowBody.intensity = glowBase + Math.sin(time * 1.8) * 0.5;
    this._glowHead.intensity = (this._isBursting ? 3.2 : 2.0) + Math.sin(time * 2.3 + 1) * 0.3;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extrude options shared by all fins — thin but 3D with bevel. */
function finExtrude(depth, bevel = 0.03) {
  return {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    steps: 1,
    curveSegments: 12,
  };
}

/**
 * Dorsal fin: swept-back triangular crest with real thickness + bevel.
 * The Shape is extruded in +Z then centered so the fin is a flat
 * membrane standing upright in the body's XY plane.
 */
function makeDorsalFin(mat, { atX, h, len }, scale) {
  const s = new THREE.Shape();
  s.moveTo( len * 0.25,  0);
  s.quadraticCurveTo(-len * 0.05, h * 0.50, -len * 0.20, h * 0.92);
  s.lineTo(-len * 0.23,  h * 1.00);
  s.quadraticCurveTo(-len * 0.42, h * 0.68, -len * 0.62, h * 0.78);
  s.lineTo(-len * 0.68,  h * 0.72);
  s.quadraticCurveTo(-len * 0.88, h * 0.28, -len * 0.92, 0);
  s.quadraticCurveTo(-len * 0.40, 0.04,      0,           0.02);
  s.lineTo( len * 0.25,  0);
  const depth = 0.14 * scale;
  const geo = new THREE.ExtrudeGeometry(s, finExtrude(depth, 0.035 * scale));
  // Center thickness around Z=0 so the fin sits on the dorsal midline
  geo.translate(atX, 0, -depth * 0.5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0.98 * scale, 0);
  return mesh;
}

function makeTailFluke(mat, L, scale) {
  const W = 2.5 * scale;
  const s = new THREE.Shape();
  s.moveTo(0,  0);
  s.quadraticCurveTo(-W * 0.3,  W * 0.65, -W * 1.05,  W * 0.72);
  s.quadraticCurveTo(-W * 1.32,  W * 0.25, -W * 1.28, 0);
  s.quadraticCurveTo(-W * 1.32, -W * 0.25, -W * 1.05, -W * 0.72);
  s.quadraticCurveTo(-W * 0.3,  -W * 0.65,  0, 0);
  const depth = 0.16 * scale;
  const geo = new THREE.ExtrudeGeometry(s, finExtrude(depth, 0.04 * scale));
  geo.translate(-L * 0.50, 0, -depth * 0.5);
  geo.rotateX(Math.PI / 2);  // horizontal fluke (whale-like)
  return new THREE.Mesh(geo, mat);
}

function makePectoralFin(mat, { L, scale, side }) {
  const fL = 2.0 * scale;
  const fH = 0.9 * scale;
  const s = new THREE.Shape();
  s.moveTo( fL * 0.15, 0);
  s.quadraticCurveTo(-fL * 0.3,  fH * 1.0, -fL * 0.85, fH * 0.85);
  s.quadraticCurveTo(-fL * 1.05, fH * 0.25, -fL * 1.0,  0);
  s.quadraticCurveTo(-fL * 0.45, -0.05, 0, 0.02);
  s.lineTo(fL * 0.15, 0);
  const depth = 0.11 * scale;
  const geo = new THREE.ExtrudeGeometry(s, finExtrude(depth, 0.03 * scale));
  geo.translate(0, 0, -depth * 0.5);
  if (side < 0) geo.scale(1, -1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(+L * 0.25, -0.35 * scale, 0.90 * scale * side);
  mesh.rotation.set(0, side > 0 ? -0.5 : 0.5, side > 0 ? -0.55 : 0.55);
  return mesh;
}

/** Curved horn built from a TubeGeometry along a Catmull-Rom spline. */
function makeCurvedHorn(mat, { base, mid, tip, rBase, rTip }) {
  const curve = new THREE.CatmullRomCurve3([base, mid, tip], false, 'catmullrom', 0.5);
  // Taper via radius function: TubeGeometry has constant radius, so we
  // taper after construction by scaling Y/Z of each vertex ring.
  const segs = 18;
  const geo = new THREE.TubeGeometry(curve, segs, rBase, 10, false);
  // Apply linear taper along the curve (u coordinate lives in the vertex ID:
  // TubeGeometry produces (segs+1) rings of (radialSegs+1) vertices).
  const RAD = 10 + 1;
  const p = geo.attributes.position;
  const center = new THREE.Vector3();
  for (let ring = 0; ring <= segs; ring++) {
    const t = ring / segs;
    const rScale = THREE.MathUtils.lerp(1, rTip / rBase, t * t);
    curve.getPointAt(t, center);
    for (let r = 0; r < RAD; r++) {
      const i = ring * RAD + r;
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const dx = vx - center.x, dy = vy - center.y, dz = vz - center.z;
      p.setXYZ(i, center.x + dx * rScale, center.y + dy * rScale, center.z + dz * rScale);
    }
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** Flexible barbel — a short drooping tube from the jaw. */
function makeBarbel(mat, { at, len, drop, r }) {
  const start = new THREE.Vector3(at[0], at[1], at[2]);
  const mid   = new THREE.Vector3(at[0] - len * 0.45, at[1] - drop * 0.5, at[2] + len * 0.1);
  const end   = new THREE.Vector3(at[0] - len * 0.85, at[1] - drop, at[2] + len * 0.2);
  const curve = new THREE.CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.5);
  const geo = new THREE.TubeGeometry(curve, 14, r, 6, false);
  // Taper the end
  const RAD = 6 + 1;
  const segs = 14;
  const p = geo.attributes.position;
  const center = new THREE.Vector3();
  for (let ring = 0; ring <= segs; ring++) {
    const t = ring / segs;
    const rScale = THREE.MathUtils.lerp(1, 0.25, t);
    curve.getPointAt(t, center);
    for (let k = 0; k < RAD; k++) {
      const i = ring * RAD + k;
      const dx = p.getX(i) - center.x, dy = p.getY(i) - center.y, dz = p.getZ(i) - center.z;
      p.setXYZ(i, center.x + dx * rScale, center.y + dy * rScale, center.z + dz * rScale);
    }
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** Small dorsal spike — rounded cone along the spine between crests. */
function makeSpinalSpike(mat, atX, h, scale) {
  const rBase = 0.10 * scale;
  const g = new THREE.ConeGeometry(rBase, h, 10, 1, false);
  // Slight forward lean for organic feel
  g.translate(0, h * 0.5, 0);
  g.rotateZ(0.25);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(atX, 0.88 * scale, 0);
  return mesh;
}

function makeFinMat(color, emissiveColor, opacity = 0.88) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.40,
    metalness: 0.12,
    side: THREE.DoubleSide,
    emissive: emissiveColor,
    emissiveIntensity: 0.75,
    transparent: opacity < 1,
    opacity,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural body texture: bright teal with bioluminescent spots
// ─────────────────────────────────────────────────────────────────────────────

function makeLeviathanBodyTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Base: vivid teal-cyan body, slightly darker at extremes
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0.00, '#0a3040');  // tail
  grad.addColorStop(0.12, '#0e4858');
  grad.addColorStop(0.30, '#1a6878');  // body dark
  grad.addColorStop(0.52, '#207888');  // body mid
  grad.addColorStop(0.70, '#1e6878');
  grad.addColorStop(0.88, '#165868');
  grad.addColorStop(1.00, '#0c3848');  // head
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Belly lighter stripe
  const belly = g.createLinearGradient(0, 0, 0, H);
  belly.addColorStop(0.00, 'rgba(0,0,0,0.30)');
  belly.addColorStop(0.42, 'rgba(0,0,0,0.00)');
  belly.addColorStop(1.00, 'rgba(100,220,200,0.25)');
  g.fillStyle = belly;
  g.fillRect(0, 0, W, H);

  // Dragon scales
  const sz = 26;
  for (let row = 0; row * sz * 0.76 < H + sz; row++) {
    for (let col = 0; col * sz * 0.88 < W + sz; col++) {
      const ox = (row % 2) * (sz * 0.44);
      const cx = col * sz * 0.88 + ox;
      const cy = row * sz * 0.76;
      const u  = cx / W;
      const density = 1.0 - Math.pow(Math.abs(u - 0.5) * 2.0, 1.8);
      if (Math.random() > 0.45 + density * 0.40) continue;
      g.globalAlpha = 0.28 + density * 0.20;
      g.strokeStyle = '#052830';
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(cx, cy, sz * 0.46, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.10 + density * 0.12;
      const rg = g.createRadialGradient(cx - sz*0.12, cy - sz*0.12, 0, cx, cy, sz*0.46);
      rg.addColorStop(0, 'rgba(0, 255, 230, 0.8)');
      rg.addColorStop(1, 'rgba(0, 255, 230, 0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, cy, sz * 0.46, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;

  // Bioluminescent lateral-line dots (bright, clearly visible)
  g.globalCompositeOperation = 'screen';
  for (const dotY of [H * 0.40, H * 0.62]) {
    const step = W * 0.038 + (dotY > H * 0.5 ? W * 0.015 : 0);
    for (let x = W * 0.05; x < W * 0.93; x += step + Math.random() * W * 0.01) {
      const r = 4 + Math.random() * 5;
      g.globalAlpha = 0.65 + Math.random() * 0.30;
      const rg = g.createRadialGradient(x, dotY, 0, x, dotY, r * 2.8);
      rg.addColorStop(0, 'rgba(0, 255, 220, 1)');
      rg.addColorStop(0.4, 'rgba(0, 200, 180, 0.6)');
      rg.addColorStop(1, 'rgba(0, 200, 180, 0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, dotY, r * 2.8, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  // Noise grain
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
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
