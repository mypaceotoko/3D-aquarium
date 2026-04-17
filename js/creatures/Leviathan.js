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

    const { map: bodyMap, roughnessMap: bodyRoughMap } = makeLeviathanBodyTextures();
    const bodyMat = injectLeviathanBend(
      new THREE.MeshPhysicalMaterial({
        color:               0xffffff,
        map:                 bodyMap,
        roughnessMap:        bodyRoughMap,
        roughness:           0.42,
        metalness:           0.12,
        clearcoat:           0.52,
        clearcoatRoughness:  0.20,
        emissive:            new THREE.Color(0x002820),
        emissiveIntensity:   0.30,
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
    const hornMat = new THREE.MeshPhysicalMaterial({
      color: 0x152a38,
      roughness: 0.58, metalness: 0.10,
      clearcoat: 0.32, clearcoatRoughness: 0.42,
      emissive: new THREE.Color(0x003830), emissiveIntensity: 0.38,
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
    const barbelMat = new THREE.MeshPhysicalMaterial({
      color: 0x0c3848,
      roughness: 0.50, metalness: 0.08,
      clearcoat: 0.28, clearcoatRoughness: 0.50,
      emissive: new THREE.Color(0x006858), emissiveIntensity: 0.42,
      transparent: true, opacity: 0.92,
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
    const browMat = new THREE.MeshPhysicalMaterial({
      color: 0x0e2e3a,
      roughness: 0.62, metalness: 0.08,
      clearcoat: 0.22, clearcoatRoughness: 0.55,
      emissive: new THREE.Color(0x002e28), emissiveIntensity: 0.28,
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
    // Wet eye: high clearcoat simulates the corneal sheen
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0xc87810,
      roughness: 0.04, metalness: 0.0,
      clearcoat: 0.90, clearcoatRoughness: 0.04,
      emissive: new THREE.Color(0xff9820), emissiveIntensity: 2.8,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x010204 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 10, 8), eyeMat);
      eye.position.set(+L * 0.365, 0.24 * scale, 0.57 * scale * side);
      group.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.058 * scale, 8, 6), pupilMat);
      pupil.position.set(+L * 0.382, 0.24 * scale, 0.62 * scale * side);
      group.add(pupil);
    }

    // ── Lighting — 4-point rig tuned for MeshPhysicalMaterial clearcoat ──────
    //
    //  glowChest  — main bioluminescent fill, ABOVE body centre so clearcoat
    //               specular reflects toward the camera at typical viewing angles
    //  glowHead   — head spot from upper-front, dramatic facial shadows + horn rim
    //  glowRim    — cool blue backlight from tail end, separates silhouette from
    //               the dark background and back-lights the translucent fins
    //  glowBelly  — soft upwelling from below, mimics caustic light bouncing off
    //               the seafloor (always present in real aquariums)
    //
    const glowChest = new THREE.PointLight(0x00d8b8, 2.8, 13 * scale, 2);
    glowChest.position.set(L * 0.05, 1.0 * scale, 0);   // chest, slightly above body
    group.add(glowChest);

    const glowHead = new THREE.PointLight(0x60e0ff, 2.0, 9 * scale, 2);
    glowHead.position.set(+L * 0.38, 1.4 * scale, 0);   // above the brow ridges
    group.add(glowHead);

    const glowRim = new THREE.PointLight(0x0058c8, 1.5, 18 * scale, 2);
    glowRim.position.set(-L * 0.42, -0.4 * scale, 0);   // behind tail, slightly below
    group.add(glowRim);

    const glowBelly = new THREE.PointLight(0x158888, 0.9, 7 * scale, 2);
    glowBelly.position.set(0, -1.4 * scale, 0);          // below belly
    group.add(glowBelly);

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
    this._glowChest   = glowChest;
    this._glowHead    = glowHead;
    this._glowRim     = glowRim;
    this._glowBelly   = glowBelly;
    this._pitchTarget = 0;

    // Burst state
    this._burstCooldown = THREE.MathUtils.randFloat(10, 20);
    this._burstTimer    = 0;
    this._isBursting    = false;

    // ── Behavior state machine ─────────────────────────────────────────────
    // Governs which movement mode the Leviathan is in.
    // Burst is a separate overlay that can trigger during any behavior.
    //
    //  CRUISE  — default slow patrol, varied depth
    //  PATROL  — deliberate diagonal sweeps corner→corner
    //  DIVE    — plunge toward the seafloor
    //  ASCENT  — rise to the surface
    //  CIRCLE  — wide orbital arc around the tank
    //  HOVER   — almost still, imposing presence
    //
    this._behavior      = 'CRUISE';
    this._behaviorTimer = THREE.MathUtils.randFloat(6, 12);
    this._behaviorSpeed = 1.85;   // non-burst speed for the current behavior
    this._patrolCorner  = 0;      // cycles 0-3 through the four tank corners
    this._circleAngle   = Math.random() * Math.PI * 2;
    this._circleDir     = 1;
    this._circleR       = 15;
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

    // ── Behavior state machine ─────────────────────────────────────────────
    this._updateBehavior(dt);

    // ── Burst — overlaid on top of current behavior ────────────────────────
    if (this._isBursting) {
      this._burstTimer -= dt;
      if (this._burstTimer <= 0) {
        this._isBursting    = false;
        this._burstCooldown = THREE.MathUtils.randFloat(16, 30);
        // Restore behavior's intended speed (not hardcoded 1.85)
        this.cfg.speed    = this._behaviorSpeed;
        this.cfg.maxAccel = this._behavior === 'HOVER' ? 0.30 : 0.52;
      }
    } else {
      this._burstCooldown -= dt;
      if (this._burstCooldown <= 0) {
        this._isBursting  = true;
        this._burstTimer  = THREE.MathUtils.randFloat(2.8, 5.0);
        // Burst speed scales relative to current behavior (faster in PATROL than HOVER)
        this.cfg.speed    = Math.min(5.8, this._behaviorSpeed * 2.6);
        this.cfg.maxAccel = 3.2;
        this.pickTarget();  // charge toward a fresh far target
      }
    }

    // ── Swim animation ─────────────────────────────────────────────────────
    const bMul = this._isBursting ? 1.6 : 1.0;
    u.uFreq.value = (0.28 + 0.55 * this.speedNorm) * bMul;
    u.uAmp.value  =  0.70 + 0.40 * this.speedNorm + (this._isBursting ? 0.3 : 0);

    // ── Body banking — more dramatic during circles and bursts ─────────────
    const bankTarget = (() => {
      const base = this.turnSignal;
      if (this._isBursting)             return -base * 0.32;
      if (this._behavior === 'CIRCLE')  return -base * 0.38;
      if (this._behavior === 'PATROL')  return -base * 0.28;
      if (this._behavior === 'HOVER')   return -base * 0.12;
      return -base * 0.22;
    })();
    this.mesh.rotation.x = THREE.MathUtils.lerp(
      this.mesh.rotation.x, bankTarget, Math.min(1, dt * 1.8),
    );
    // Pitch — more pronounced on dives and ascents
    const pitchScale = (this._behavior === 'DIVE' || this._behavior === 'ASCENT') ? 0.50 : 0.30;
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z, this._pitchTarget * pitchScale, Math.min(1, dt * 1.5),
    );

    // ── Pectoral sculling ──────────────────────────────────────────────────
    for (const p of this._pectorals) {
      const w = Math.sin(time * 0.75 + p.userData.phase);
      p.rotation.z = p.userData.baseRZ + w * 0.28 + this.turnSignal * 0.18;
      p.rotation.y = p.userData.baseRY + w * 0.12;
    }

    // ── Glow pulse — four lights pulsing with organic offsets ─────────────
    // During burst: sharp electric flicker; at rest: slow bioluminescent breathe
    const burst = this._isBursting;
    const slowBreath  = Math.sin(time * 0.9) * 0.18;           // 0.9 Hz — lazy
    const midBreath   = Math.sin(time * 1.4 + 0.8) * 0.22;     // slightly faster
    const rimBreath   = Math.sin(time * 0.6 + 2.1) * 0.12;     // very slow
    const burstFlick  = burst ? Math.sin(time * 14.0) * 0.6 : 0; // fast flicker

    this._glowChest.intensity =
      (burst ? 4.8 : 2.8) + slowBreath + burstFlick;
    this._glowHead.intensity  =
      (burst ? 3.4 : 2.0) + midBreath  + burstFlick * 0.7;
    this._glowRim.intensity   =
      (burst ? 2.6 : 1.5) + rimBreath  + burstFlick * 0.5;
    this._glowBelly.intensity =
      (burst ? 1.4 : 0.9) + slowBreath * 0.4;

    // During burst shift chest colour toward electric white-blue
    if (burst) {
      this._glowChest.color.setHex(0x40f8ff);
    } else {
      this._glowChest.color.setHex(0x00d8b8);
    }
  }

  // ── Behavior state machine ───────────────────────────────────────────────

  /**
   * Advance the behavior timer; choose a new behavior when it expires.
   * Called every frame from onUpdate. Burst is handled separately and does
   * NOT interrupt the behavior — only temporarily overrides speed.
   */
  _updateBehavior(dt) {
    if (this._isBursting) return;   // don't transition while charging

    this._behaviorTimer -= dt;
    if (this._behaviorTimer > 0)   return;

    // ── Weighted behavior picker ──────────────────────────────────────────
    const roll = Math.random();

    if (roll < 0.28) {
      // PATROL: 4-corner diagonal sweeps fill the full tank
      this._behavior      = 'PATROL';
      this._behaviorTimer = THREE.MathUtils.randFloat(24, 40);
      this._behaviorSpeed = 2.2;
      this.cfg.maxAccel   = 0.55;
      this._patrolCorner  = (this._patrolCorner + Math.floor(Math.random() * 2) + 1) % 4;
    } else if (roll < 0.42) {
      // DIVE: dramatic plunge to the seafloor
      this._behavior      = 'DIVE';
      this._behaviorTimer = THREE.MathUtils.randFloat(10, 18);
      this._behaviorSpeed = 2.6;
      this.cfg.maxAccel   = 0.70;
    } else if (roll < 0.56) {
      // ASCENT: rise toward the surface
      this._behavior      = 'ASCENT';
      this._behaviorTimer = THREE.MathUtils.randFloat(10, 16);
      this._behaviorSpeed = 2.2;
      this.cfg.maxAccel   = 0.58;
    } else if (roll < 0.70) {
      // CIRCLE: wide orbital arc, optional direction reversal
      this._behavior      = 'CIRCLE';
      this._behaviorTimer = THREE.MathUtils.randFloat(20, 32);
      this._behaviorSpeed = 2.0;
      this.cfg.maxAccel   = 0.50;
      this._circleAngle   = Math.atan2(this.pos.z, this.pos.x);
      this._circleDir     = Math.random() < 0.5 ? 1 : -1;
      this._circleR       = THREE.MathUtils.randFloat(12, 18);
    } else if (roll < 0.82) {
      // HOVER: slow drift — "the leviathan is watching"
      this._behavior      = 'HOVER';
      this._behaviorTimer = THREE.MathUtils.randFloat(5, 9);
      this._behaviorSpeed = 0.55;
      this.cfg.maxAccel   = 0.25;
    } else {
      // CRUISE: wide random wander (default)
      this._behavior      = 'CRUISE';
      this._behaviorTimer = THREE.MathUtils.randFloat(10, 18);
      this._behaviorSpeed = 1.85;
      this.cfg.maxAccel   = 0.50;
    }

    this.cfg.speed = this._behaviorSpeed;
    this.pickTarget();  // immediately head somewhere fitting the new behavior
  }

  /**
   * Override base-class target selection with behavior-aware navigation.
   * Sets this.target and this.wanderT.
   */
  pickTarget(state) {
    // Guard: called from super() before behavior state is initialised
    if (!this._behavior) {
      const m = 9;
      this.target.set(
        THREE.MathUtils.randFloat(TANK.minX + m, TANK.maxX - m),
        THREE.MathUtils.randFloat(TANK.floorY + 3.5, TANK.maxY - 3.5),
        THREE.MathUtils.randFloat(TANK.minZ + m, TANK.maxZ - m),
      );
      this.wanderT = 12;
      return;
    }

    const m   = 9;                               // safety margin from walls
    const xR  = TANK.maxX - m;
    const zR  = TANK.maxZ - m;
    const yMid = (TANK.floorY + TANK.maxY) * 0.5;

    switch (this._behavior) {

      case 'PATROL': {
        // Sweep to the next of four tank corners in sequence
        const corners = [
          [ xR,         TANK.maxZ - m],
          [-xR,         TANK.minZ + m],
          [ xR,         TANK.minZ + m],
          [-xR,         TANK.maxZ - m],
        ];
        const [tx, tz] = corners[this._patrolCorner % 4];
        this._patrolCorner = (this._patrolCorner + 1) % 4;
        this.target.set(
          tx,
          THREE.MathUtils.randFloat(TANK.floorY + 4.5, TANK.maxY - 4.5),
          tz,
        );
        this.wanderT = THREE.MathUtils.randFloat(7, 11);
        break;
      }

      case 'DIVE': {
        // Plunge to deep floor area
        this.target.set(
          THREE.MathUtils.randFloat(TANK.minX + m, TANK.maxX - m),
          THREE.MathUtils.randFloat(TANK.floorY + 3.5, TANK.floorY + 5.5),
          THREE.MathUtils.randFloat(TANK.minZ + m, TANK.maxZ - m),
        );
        this.wanderT = THREE.MathUtils.randFloat(10, 16);
        break;
      }

      case 'ASCENT': {
        // Rise near the surface
        this.target.set(
          THREE.MathUtils.randFloat(TANK.minX + m, TANK.maxX - m),
          THREE.MathUtils.randFloat(TANK.maxY - 5.0, TANK.maxY - 3.5),
          THREE.MathUtils.randFloat(TANK.minZ + m, TANK.maxZ - m),
        );
        this.wanderT = THREE.MathUtils.randFloat(8, 14);
        break;
      }

      case 'CIRCLE': {
        // Advance along the orbit; vertical position oscillates
        this._circleAngle += this._circleDir * 1.40;   // ~80° per waypoint
        const ca = this._circleAngle;
        const cy = yMid + Math.sin(ca * 0.55) * 4.5;   // gentle altitude wave
        this.target.set(
          THREE.MathUtils.clamp(Math.cos(ca) * this._circleR, TANK.minX + m, TANK.maxX - m),
          THREE.MathUtils.clamp(cy, TANK.floorY + 4, TANK.maxY - 4),
          THREE.MathUtils.clamp(Math.sin(ca) * this._circleR, TANK.minZ + m, TANK.maxZ - m),
        );
        this.wanderT = THREE.MathUtils.randFloat(4, 7);
        break;
      }

      case 'HOVER': {
        // Drift a short distance from current position
        this.target.set(
          THREE.MathUtils.clamp(this.pos.x + THREE.MathUtils.randFloatSpread(5),
            TANK.minX + m, TANK.maxX - m),
          THREE.MathUtils.clamp(this.pos.y + THREE.MathUtils.randFloatSpread(2.5),
            TANK.floorY + 3.5, TANK.maxY - 3.5),
          THREE.MathUtils.clamp(this.pos.z + THREE.MathUtils.randFloatSpread(5),
            TANK.minZ + m, TANK.maxZ - m),
        );
        this.wanderT = THREE.MathUtils.randFloat(2.5, 4.5);
        break;
      }

      default: {  // CRUISE + anything unrecognised
        // Wide sweep using the full tank depth range
        this.target.set(
          THREE.MathUtils.randFloat(TANK.minX + m, TANK.maxX - m),
          THREE.MathUtils.randFloat(this.cfg.depthMin, this.cfg.depthMax),
          THREE.MathUtils.randFloat(TANK.minZ + m, TANK.maxZ - m),
        );
        this.wanderT = THREE.MathUtils.randFloat(10, 16);
      }
    }
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
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness:           0.38,
    metalness:           0.08,
    clearcoat:           0.45,
    clearcoatRoughness:  0.28,
    side:                THREE.DoubleSide,
    emissive:            emissiveColor,
    emissiveIntensity:   0.48,
    transparent:         true,
    opacity,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural body textures: albedo map + roughness map
// roughnessMap: scale-centres dark (shiny) / scale-borders light (matte)
// → clearcoat specular highlight breaks across every individual scale
// ─────────────────────────────────────────────────────────────────────────────

function makeLeviathanBodyTextures() {
  const W = 1024, H = 256;

  // ── Albedo (colour) map ─────────────────────────────────────────────────
  const ac = document.createElement('canvas');
  ac.width = W; ac.height = H;
  const ag = ac.getContext('2d');

  // Dorsal–ventral gradient: dark indigo back → vivid teal flank → soft aqua belly
  const baseGrad = ag.createLinearGradient(0, 0, 0, H);
  baseGrad.addColorStop(0.00, '#0a2535');  // dorsal dark
  baseGrad.addColorStop(0.30, '#14546a');
  baseGrad.addColorStop(0.55, '#1e7080');  // main flank teal
  baseGrad.addColorStop(0.78, '#258a8a');  // lower flank
  baseGrad.addColorStop(1.00, '#2a9888');  // belly aqua
  ag.fillStyle = baseGrad;
  ag.fillRect(0, 0, W, H);

  // Head-to-tail length gradient: slightly darker at extremes
  const lenGrad = ag.createLinearGradient(0, 0, W, 0);
  lenGrad.addColorStop(0.00, 'rgba(0,0,0,0.35)');   // tail
  lenGrad.addColorStop(0.15, 'rgba(0,0,0,0.12)');
  lenGrad.addColorStop(0.50, 'rgba(0,0,0,0.00)');   // body
  lenGrad.addColorStop(0.85, 'rgba(0,0,0,0.10)');
  lenGrad.addColorStop(1.00, 'rgba(0,0,0,0.30)');   // head
  ag.fillStyle = lenGrad;
  ag.fillRect(0, 0, W, H);

  // Dragon scale grid (hexagonal offset)
  const sz = 24;
  const scaleData = [];   // remember positions for roughnessMap
  for (let row = 0; row * sz * 0.76 <= H + sz; row++) {
    for (let col = 0; col * sz * 0.88 <= W + sz; col++) {
      const ox = (row % 2) * (sz * 0.44);
      const cx = col * sz * 0.88 + ox;
      const cy = row * sz * 0.76;
      scaleData.push({ cx, cy });
      // Scale edge (dark border)
      ag.globalAlpha = 0.32;
      ag.strokeStyle = '#041c28';
      ag.lineWidth = 1.4;
      ag.beginPath(); ag.arc(cx, cy, sz * 0.46, 0, Math.PI * 2); ag.stroke();
      // Scale highlight (top-left iridescent catch)
      ag.globalAlpha = 0.14;
      const sh = ag.createRadialGradient(cx - sz*0.14, cy - sz*0.14, 0, cx, cy, sz*0.46);
      sh.addColorStop(0,   'rgba(60, 255, 230, 0.9)');
      sh.addColorStop(0.5, 'rgba(0,  200, 180, 0.3)');
      sh.addColorStop(1,   'rgba(0,  200, 180, 0)');
      ag.fillStyle = sh;
      ag.beginPath(); ag.arc(cx, cy, sz * 0.46, 0, Math.PI * 2); ag.fill();
    }
  }
  ag.globalAlpha = 1;

  // Lateral-line bioluminescent dots
  ag.globalCompositeOperation = 'screen';
  for (const [dotY, step, col] of [
    [H * 0.38, W * 0.040, 'rgba(0, 255, 215, 1)'],
    [H * 0.62, W * 0.055, 'rgba(30, 220, 255, 1)'],
  ]) {
    for (let x = W * 0.05; x < W * 0.93; x += step + Math.random() * W * 0.008) {
      const r = 3.5 + Math.random() * 4.5;
      ag.globalAlpha = 0.60 + Math.random() * 0.32;
      const rg = ag.createRadialGradient(x, dotY, 0, x, dotY, r * 3);
      rg.addColorStop(0,   col);
      rg.addColorStop(0.4, col.replace('1)', '0.5)'));
      rg.addColorStop(1,   col.replace('1)', '0)'));
      ag.fillStyle = rg;
      ag.beginPath(); ag.arc(x, dotY, r * 3, 0, Math.PI * 2); ag.fill();
    }
  }
  ag.globalCompositeOperation = 'source-over';
  ag.globalAlpha = 1;

  // Subtle noise grain
  {
    const img = ag.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 10;
      d[i]   = clamp255(d[i]   + n);
      d[i+1] = clamp255(d[i+1] + n * 0.9);
      d[i+2] = clamp255(d[i+2] + n * 0.7);
    }
    ag.putImageData(img, 0, 0);
  }

  const map = new THREE.CanvasTexture(ac);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;

  // ── Roughness map (512×128, green channel) ──────────────────────────────
  // Dark (low roughness) = smooth/shiny scale-centres
  // Light (high roughness) = rough scale-borders
  // Three.js reads roughness from the green channel of roughnessMap.
  const RW = 512, RH = 128;
  const rc = document.createElement('canvas');
  rc.width = RW; rc.height = RH;
  const rg = rc.getContext('2d');

  // Base: medium roughness (0.5 → grey 128)
  rg.fillStyle = '#808080';
  rg.fillRect(0, 0, RW, RH);

  // Belly smoother (lower roughness = darker)
  const bellyR = rg.createLinearGradient(0, 0, 0, RH);
  bellyR.addColorStop(0.00, 'rgba(80,80,80,0.0)');   // dorsal: no change
  bellyR.addColorStop(0.60, 'rgba(0,0,0,0.0)');
  bellyR.addColorStop(1.00, 'rgba(0,0,0,0.22)');     // belly: darker = smoother
  rg.fillStyle = bellyR;
  rg.fillRect(0, 0, RW, RH);

  // Scale centres dark (shiny), borders already grey
  const scaleRatio = RW / W;
  for (const { cx, cy } of scaleData) {
    const rx = cx * scaleRatio, ry = cy * (RH / H);
    const rs = sz * 0.46 * scaleRatio;
    // Centre: near-black (very smooth/shiny)
    rg.globalAlpha = 0.55;
    const cg = rg.createRadialGradient(rx, ry, 0, rx, ry, rs);
    cg.addColorStop(0,    'rgba(0, 0, 0, 1)');    // centre: roughness ~0.15
    cg.addColorStop(0.65, 'rgba(0, 0, 0, 0.4)');
    cg.addColorStop(1,    'rgba(255,255,255,0)');  // border: back to base 0.5
    rg.fillStyle = cg;
    rg.beginPath(); rg.arc(rx, ry, rs, 0, Math.PI * 2); rg.fill();
  }
  rg.globalAlpha = 1;

  const roughnessMap = new THREE.CanvasTexture(rc);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;

  return { map, roughnessMap };
}

function clamp255(v) { return Math.max(0, Math.min(255, v)); }

// ─────────────────────────────────────────────────────────────────────────────

export function spawnLeviathan(scene, opts = {}) {
  const lev = new Leviathan(opts);
  scene.add(lev.mesh);
  return lev;
}
