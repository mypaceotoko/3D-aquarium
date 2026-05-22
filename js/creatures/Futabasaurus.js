import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';
import { injectFishBend, makeFishBendUniforms } from './fishBend.js';

/**
 * フタバスズキリュウ (Futabasaurus suzukii) — Late-Cretaceous plesiosaur.
 *
 * Anatomy goals (matching the reference illustration closely):
 *   - Long slender neck (~35% of total length) with a small pointed head
 *   - BEEFY barrel body: widest part sits just behind midline, deep belly,
 *     substantial mass between the shoulders and hips (the part the user
 *     said felt too thin before — fixed by bumping the lathe profile to
 *     ~0.95 radius and giving the cross-section a tall oval shape)
 *   - Smoothly tapering tail (no fluke; ends in a soft point)
 *   - Four large paddle-shaped flippers in coordinated "underwater flight"
 *     (front pair leads, rear pair trails by ~half a cycle)
 *   - Countershaded blue-grey/teal skin with subtle mottling
 *
 * Motion goals:
 *   - Slow, deliberate cruise (not a fish wiggle — the body barely flexes;
 *     the flippers do the work)
 *   - Independent neck sway driven by a custom vertex-shader bend so the
 *     long neck arcs gracefully into turns without geometry rebuilds
 *   - The head rides at the neck tip via a CPU-side mirror of the same
 *     bend math
 *   - Heavy bank into turns, slight pitch tracking vertical velocity
 */
export class Futabasaurus extends Creature {
  constructor(opts = {}) {
    const scale  = opts.scale ?? THREE.MathUtils.randFloat(1.05, 1.25);

    // Length budget (in local units, pre-scale).
    const BODY_LEN = 4.20;     // lathe trunk + tail
    const NECK_LEN = 3.10;     // base → head tip (head sits at end)
    const HEAD_LEN = 0.72;     // small but visible head

    const group = new THREE.Group();
    group.scale.setScalar(scale);

    // Body bend uniforms (very subtle — plesiosaurs swam with their fins,
    // not by wiggling their bodies; we only allow a hint of tail sway)
    const bodyUniforms = makeFishBendUniforms({
      length: BODY_LEN,
      amp: 0.045,
      freq: 0.18,
      tailWeight: 2.4,
      curl: 0.18,
    });

    // ----- Body (lathe, beefy barrel) ----------------------------------
    // Length axis convention (matches fishBend.js): head at +X, tail at -X.
    // Profile values are in (radius, lengthOffset) where the lengthOffset is
    // along the lathe Y-axis BEFORE rotateZ(-PI/2). The rotation maps +Y → +X,
    // so to put the head/shoulder at +X we use +Y for shoulder data and -Y for
    // tail data.
    const L = BODY_LEN;
    // Two key joint radii — both ends of the body lathe end at a finite
    // radius so the appendages (tail-tip cone, neck base) graft on cleanly
    // without a needle-tip artifact.
    const NECK_BASE_R = 0.255;
    const TAIL_TIP_R  = 0.075;   // finite "soft point" tail (not a needle)
    const bodyProfile = [
      new THREE.Vector2(TAIL_TIP_R, -L * 0.500),   // tail tip (-X side, finite cap)
      new THREE.Vector2(0.135,      -L * 0.470),
      new THREE.Vector2(0.225,      -L * 0.425),
      new THREE.Vector2(0.340,      -L * 0.360),
      new THREE.Vector2(0.475,      -L * 0.275),
      new THREE.Vector2(0.620,      -L * 0.170),
      new THREE.Vector2(0.760,      -L * 0.060),
      new THREE.Vector2(0.875,      +L * 0.050),   // back-mid swell
      new THREE.Vector2(0.945,      +L * 0.150),
      new THREE.Vector2(0.975,      +L * 0.230),   // WIDEST — full meaty belly
      new THREE.Vector2(0.965,      +L * 0.305),
      new THREE.Vector2(0.915,      +L * 0.365),
      new THREE.Vector2(0.825,      +L * 0.415),
      new THREE.Vector2(0.700,      +L * 0.450),
      new THREE.Vector2(0.555,      +L * 0.475),   // shoulders narrow into neck
      new THREE.Vector2(0.420,      +L * 0.490),
      new THREE.Vector2(0.320,      +L * 0.499),
      new THREE.Vector2(NECK_BASE_R, +L * 0.503),  // shoulder cap — neck mates here
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 28);
    bodyGeo.rotateZ(-Math.PI / 2);

    // Cross-section sculpting:
    //   - Chest slightly taller than wide (deeper keel, more presence)
    //   - Tail kept close to circular (so the tail tip doesn't read as a knife)
    //   - Belly drops a little along the midbody to give a real plesiosaur paunch
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        // 0 at tail tip (-X) → 1 at shoulder (+X)
        const frontness = THREE.MathUtils.smoothstep(x, -L * 0.40, L * 0.45);
        // Vertical scale: 0.95 at tail (round, not squashed), 1.06 at chest (deep)
        const yScale = THREE.MathUtils.lerp(0.95, 1.06, frontness);
        // Horizontal (Z) scale: 1.02 at tail, 0.97 at chest
        const zScale = THREE.MathUtils.lerp(1.02, 0.97, frontness);
        // Belly bulge: push the bottom downward through the midbody
        const bellyZone = Math.exp(-Math.pow(x / (L * 0.25), 2));
        const yOffset = (y < 0 ? bellyZone * 0.12 : 0);
        p.setY(i, y * yScale - yOffset);
        p.setZ(i, z * zScale);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyTex = makeFutabaSkinTexture();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,            // texture carries the hue
      map: bodyTex,
      roughness: 0.62,
      metalness: 0.10,
      emissive: 0x0a1b28,
      emissiveIntensity: 0.22,
    });
    injectFishBend(bodyMat, bodyUniforms);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ----- Neck (lathe taper + custom vertex bend) ---------------------
    // Built straight along its local +X axis from base (x=0) to head tip
    // (x=NECK_LEN). Then the vertex shader curves it. Head is computed
    // on the CPU using the same bend math so it stays attached.
    // Slender and near-uniform — like a swan's neck. Base matches the
    // body's shoulder cap radius so the join is seamless.
    const NB_R = NECK_BASE_R;   // 0.255 — exact match with body shoulder cap
    const NH_R = 0.135;          // narrow at head
    const neckSegments = 28;
    const neckProfile = [];
    for (let i = 0; i <= neckSegments; i++) {
      const t = i / neckSegments;
      // Power < 1 → taper is concentrated near the head; base stays fuller for a
      // smoother shoulder-to-neck transition.
      const r = THREE.MathUtils.lerp(NB_R, NH_R, Math.pow(t, 1.25));
      neckProfile.push(new THREE.Vector2(r, t * NECK_LEN));
    }
    const neckGeo = new THREE.LatheGeometry(neckProfile, 18);
    // Lathe spins around +Y; rotate so neck axis becomes +X.
    // Profile has Y in [0, NECK_LEN], so after rotateZ(-PI/2) the neck spans
    // x ∈ [0, +NECK_LEN] — base at x=0, head tip at x=+NECK_LEN.
    neckGeo.rotateZ(-Math.PI / 2);
    // Slight vertical compression so cross-section is a tall oval at base.
    {
      const p = neckGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setY(i, p.getY(i) * 0.94);
      }
      neckGeo.computeVertexNormals();
    }

    const neckUniforms = makeNeckBendUniforms({ length: NECK_LEN });
    const neckMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: bodyTex,
      roughness: 0.62,
      metalness: 0.10,
      emissive: 0x0a1b28,
      emissiveIntensity: 0.22,
    });
    injectNeckBend(neckMat, neckUniforms);
    const neck = new THREE.Mesh(neckGeo, neckMat);
    neck.castShadow = !!opts.castShadow;
    // Mount neck at the front of the body. Body's +X end (shoulder) is at
    // +BODY_LEN/2; we tuck the neck base ~0.08 *inside* the body so the
    // shoulder cap and neck root overlap (no visible disk-seam at the join).
    neck.position.set(+BODY_LEN * 0.5 - 0.08, 0.02, 0);
    group.add(neck);

    // ----- Head (small pointed, follows neck tip on CPU) --------------
    const head = makeHead(HEAD_LEN, bodyTex);
    // Mount head as a child of the group (not the neck) — its position is
    // updated each frame from neck-bend math so it stays glued to the tip.
    group.add(head);

    // Cache the head anchor (relative to neck root in *bent* coords) so we
    // can compute it cheaply each frame.
    const headAnchor = new THREE.Vector3();
    const headTangent = new THREE.Vector3(1, 0, 0);

    // ----- Flippers (4 large paddles) ---------------------------------
    // Plesiosaur flippers are roughly equal-size paddles, all four lobed
    // and curved. The front pair sits behind the shoulders, the rear pair
    // ahead of the hip. Each flipper is a 3D extruded shape so it has
    // proper thickness (not a flat sheet).
    const flipperMat = new THREE.MeshStandardMaterial({
      color: 0x2d4458,
      roughness: 0.55,
      metalness: 0.12,
      emissive: 0x0a1422,
      emissiveIntensity: 0.18,
    });

    const flippers = [];
    // Front pair: behind the shoulder, slightly below the centerline.
    // Rear pair:  ahead of the hip, slightly below the centerline.
    // All four are substantial paddles (close to half the body length).
    const flipperConfigs = [
      { atX: +L * 0.22, atY: -0.22, side: -1, length: 1.85, width: 0.78, phase: 0.0,    front: true  },
      { atX: +L * 0.22, atY: -0.22, side: +1, length: 1.85, width: 0.78, phase: 0.0,    front: true  },
      { atX: -L * 0.16, atY: -0.26, side: -1, length: 1.65, width: 0.72, phase: Math.PI, front: false },
      { atX: -L * 0.16, atY: -0.26, side: +1, length: 1.65, width: 0.72, phase: Math.PI, front: false },
    ];
    for (const cfg of flipperConfigs) {
      const f = makeFlipper(flipperMat, cfg);
      f.castShadow = !!opts.castShadow;
      group.add(f);
      flippers.push(f);
    }

    // ----- Super --------------------------------------------------------
    super({
      species: 'futabasaurus',
      mesh: group,
      cfg: {
        speed: 0.95,
        maxAccel: 0.40,
        turnRate: 0.55,
        depthMin: TANK.floorY + 2.5,
        depthMax: TANK.maxY - 2.0,
        wanderMin: 10, wanderMax: 16,
        wallMargin: 6.5,
        reactsToFood: false,    // peaceful giant, not a scavenger
        facesVelocity: true,
      },
      position: opts.position,
    });

    this._bodyUniforms = bodyUniforms;
    this._neckUniforms = neckUniforms;
    this._head = head;
    this._headAnchor = headAnchor;
    this._headTangent = headTangent;
    this._neckRootX = +BODY_LEN * 0.5 - 0.08;
    this._neckLen = NECK_LEN;
    this._headLen = HEAD_LEN;
    this._flippers = flippers;
    this._scale = scale;
    this._pitchTarget = 0;
    this._neckPose = 0;       // -1..1 slow drift, gives an idle "looking around" arc
    this._neckPoseT = 0;
    this._neckPoseTarget = 0;
  }

  onUpdate(dt, time) {
    // --- Body shader (very subtle tail flex) -------------------------
    this._bodyUniforms.uTime.value  = time;
    this._bodyUniforms.uTurn.value  = this.turnSignal;
    this._bodyUniforms.uPitch.value = this._pitchTarget;
    this._bodyUniforms.uFreq.value  = 0.15 + 0.18 * this.speedNorm;
    this._bodyUniforms.uAmp.value   = 0.035 + 0.025 * this.speedNorm;

    // --- Neck: drifting idle pose + turn-curl + breath sway ----------
    // Periodically retarget a slow neck pose (-1..1) to look slightly off-axis
    this._neckPoseT -= dt;
    if (this._neckPoseT <= 0) {
      this._neckPoseTarget = (Math.random() - 0.5) * 1.2;
      this._neckPoseT = THREE.MathUtils.randFloat(4.0, 8.5);
    }
    this._neckPose = THREE.MathUtils.lerp(this._neckPose, this._neckPoseTarget, Math.min(1, dt * 0.4));

    this._neckUniforms.uTime.value  = time;
    this._neckUniforms.uTurn.value  = this.turnSignal;
    this._neckUniforms.uPose.value  = this._neckPose;
    // A gentle vertical "breath" so the neck doesn't feel rigid (head bobs)
    this._neckUniforms.uRise.value  = 0.10 + Math.sin(time * 0.35) * 0.06;

    // --- Pitch tracking (heavy easing) -------------------------------
    const targetPitch = THREE.MathUtils.clamp(this.vel.y / Math.max(this.cfg.speed, 0.01), -0.55, 0.55);
    this._pitchTarget = THREE.MathUtils.lerp(this._pitchTarget, targetPitch, Math.min(1, dt * 1.0));

    // --- Head transform (mirror neck bend on CPU) --------------------
    // Sample the neck-bend formula at t=1 (head end of neck) to get the
    // head position offset, and at t=0.95 to estimate the tangent.
    const t1 = 1.0;
    const t0 = 0.92;
    const p1 = sampleNeckBend(t1, this._neckLen, this._neckUniforms, this._headAnchor);
    const _tmp = sampleNeckBend(t0, this._neckLen, this._neckUniforms, new THREE.Vector3());
    this._headTangent.subVectors(p1, _tmp).normalize();

    // Place head so its back end meets the neck tip (with slight overlap).
    // Head's local space has back at x=-HL/2 and snout at +HL/2, so we
    // shift forward by ~HL*0.42 so the back of the head sits just inside
    // the neck tip — hides any seam in the silhouette.
    const headOffset = this._headLen * 0.42;
    this._head.position.set(
      this._neckRootX + p1.x + this._headTangent.x * headOffset,
      0.02 + p1.y       + this._headTangent.y * headOffset,
      p1.z              + this._headTangent.z * headOffset,
    );
    // Orient head's local +X along the neck tangent
    const yaw   = Math.atan2(this._headTangent.z, this._headTangent.x);
    const pitch = -Math.atan2(this._headTangent.y, Math.hypot(this._headTangent.x, this._headTangent.z));
    this._head.rotation.set(0, -yaw, pitch);

    // --- Bank into turns (heavy → feels massive) ---------------------
    const rollTarget = -this.turnSignal * 0.22;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, rollTarget, Math.min(1, dt * 1.6));
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, this._pitchTarget * 0.30, Math.min(1, dt * 1.4));

    // --- Flippers: underwater "flight" stroke ------------------------
    // Each flipper rocks around its base. Plesiosaur swimming was a figure-8
    // motion: vertical sweep + slight forward/back pitch. We approximate
    // with two coupled sines, mirroring left/right and front/rear out of
    // phase so the gait reads as deliberate.
    const strokeFreq = 0.55 + 0.45 * this.speedNorm;  // Hz
    const w = time * strokeFreq * Math.PI * 2;
    for (const f of this._flippers) {
      const ud = f.userData;
      const swing = Math.sin(w + ud.phase);         // vertical sweep (down→up)
      const pitch = Math.cos(w + ud.phase) * 0.45;   // forward/back blade angle
      // Z-rot in body-space = vertical sweep about the X axis of the flipper plane.
      // Because we built the flipper to extend outward along ±Z then rotated
      // for the side, the per-flipper rotation we want is "rotate about X" of
      // the flipper's own frame for the sweep, and "rotate about Z" for pitch.
      f.rotation.x = ud.baseRotX + swing * 0.55;
      f.rotation.z = ud.baseRotZ + pitch * 0.35;
      // Tiny yaw flex on each stroke for organic feel
      f.rotation.y = ud.baseRotY + swing * 0.08;
    }
  }

  /** Override center so camera-follow looks at the *body*, not the head. */
  getCenter(out = new THREE.Vector3()) {
    return out.copy(this.pos);
  }
}

// ---------------------------------------------------------------------
// Neck bend shader (custom — mirrors fishBend but weighted toward the
// head end, not the tail, and exposes a static "uPose" curl in addition
// to the time-based wave + steering turn).
// ---------------------------------------------------------------------

function makeNeckBendUniforms({ length }) {
  return {
    uTime: { value: 0 },
    uTurn: { value: 0 },
    uPose: { value: 0 },     // -1..1 idle pose (looking left/right)
    uRise: { value: 0.08 },  // gentle vertical arc at head end
    uLen:  { value: length },
    // Tunables (could expose if needed)
    uSwayAmp:  { value: 0.07 },
    uSwayFreq: { value: 0.28 },
    uTurnCurl: { value: 0.85 },
    uPoseCurl: { value: 0.55 },
  };
}

function injectNeckBend(material, u) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uTime     = u.uTime;
    shader.uniforms.uTurn     = u.uTurn;
    shader.uniforms.uPose     = u.uPose;
    shader.uniforms.uRise     = u.uRise;
    shader.uniforms.uLen      = u.uLen;
    shader.uniforms.uSwayAmp  = u.uSwayAmp;
    shader.uniforms.uSwayFreq = u.uSwayFreq;
    shader.uniforms.uTurnCurl = u.uTurnCurl;
    shader.uniforms.uPoseCurl = u.uPoseCurl;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uTurn;
        uniform float uPose;
        uniform float uRise;
        uniform float uLen;
        uniform float uSwayAmp;
        uniform float uSwayFreq;
        uniform float uTurnCurl;
        uniform float uPoseCurl;
      `)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        // Neck axis: x=0 at base, x=uLen at head tip
        float t = clamp(transformed.x / uLen, 0.0, 1.0);
        // Bend weight: quadratic, head-tip-heavy
        float w = t * t;
        // Lateral curl: turn signal + idle pose + breath sway
        float sway = sin(uTime * uSwayFreq * 6.2831853 + t * 2.2) * uSwayAmp;
        float lat  = (-uTurn * uTurnCurl) + (uPose * uPoseCurl) + sway;
        transformed.z += lat * w * uLen * 0.5;
        // Vertical arc: head rises slightly above straight axis (graceful S-curve hint)
        transformed.y += uRise * w * uLen * 0.5;
      `);
  };
  material.customProgramCacheKey = () => 'neckBend_v1';
  return material;
}

/** Mirror of the neck vertex shader, evaluated on the CPU at parameter t∈[0,1]. */
function sampleNeckBend(t, neckLen, u, out) {
  const w = t * t;
  const sway = Math.sin(u.uTime.value * u.uSwayFreq.value * Math.PI * 2 + t * 2.2) * u.uSwayAmp.value;
  const lat  = (-u.uTurn.value * u.uTurnCurl.value) + (u.uPose.value * u.uPoseCurl.value) + sway;
  out.x = t * neckLen;
  out.y = u.uRise.value * w * neckLen * 0.5;
  out.z = lat * w * neckLen * 0.5;
  return out;
}

// ---------------------------------------------------------------------
// Head: small pointed muzzle with eyes + visible tooth row
// ---------------------------------------------------------------------

function makeHead(headLen, skinTex) {
  const group = new THREE.Group();

  // Skull: tapered oval (lathe). Snout tip at +X, neck-attachment at -X.
  // Profile uses +Y for snout side (→+X after rotate), -Y for back side.
  const HL = headLen;
  const headProfile = [
    new THREE.Vector2(0.014, +HL * 0.502),    // tip of snout (at +X)
    new THREE.Vector2(0.060, +HL * 0.498),
    new THREE.Vector2(0.115, +HL * 0.470),
    new THREE.Vector2(0.150, +HL * 0.410),
    new THREE.Vector2(0.175, +HL * 0.290),
    new THREE.Vector2(0.180, +HL * 0.140),    // braincase widest
    new THREE.Vector2(0.165, -HL * 0.020),
    new THREE.Vector2(0.140, -HL * 0.180),
    new THREE.Vector2(0.105, -HL * 0.330),
    new THREE.Vector2(0.060, -HL * 0.440),
    new THREE.Vector2(0.014, -HL * 0.500),    // back of head (at -X, joins neck)
  ];
  const headGeo = new THREE.LatheGeometry(headProfile, 16);
  headGeo.rotateZ(-Math.PI / 2);
  // Slightly taller than wide (narrow head)
  {
    const p = headGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, p.getY(i) * 1.05);
      p.setZ(i, p.getZ(i) * 0.85);
    }
    headGeo.computeVertexNormals();
  }
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: skinTex,
    roughness: 0.62,
    metalness: 0.10,
    emissive: 0x0a1b28,
    emissiveIntensity: 0.22,
  });
  const skull = new THREE.Mesh(headGeo, headMat);
  group.add(skull);

  // Mouth line: thin dark band along the side, splitting upper/lower jaw.
  // Centered slightly forward of the head-center; the jaw runs along +X
  // (snout side). Cross-section is a thin horizontal slit.
  const mouthMat = new THREE.MeshStandardMaterial({
    color: 0x0a0508, roughness: 0.95, metalness: 0.0,
  });
  const mouthGeo = new THREE.BoxGeometry(HL * 0.82, HL * 0.04, HL * 0.36);
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(HL * 0.08, -HL * 0.05, 0);
  group.add(mouth);

  // Tooth row: tiny cones lining each jaw side, front (snout tip, +X) toward back.
  const toothMat = new THREE.MeshStandardMaterial({
    color: 0xf2ead0, roughness: 0.35, metalness: 0.0,
    emissive: 0xb09a70, emissiveIntensity: 0.15,
  });
  const toothCount = 7;
  for (const s of [-1, 1]) {
    for (let i = 0; i < toothCount; i++) {
      const u = (i + 0.5) / toothCount;          // 0..1 along mouth
      const tg = new THREE.ConeGeometry(HL * 0.020, HL * 0.060, 5);
      tg.rotateX(Math.PI);                       // point downward
      const tm = new THREE.Mesh(tg, toothMat);
      tm.position.set(
        HL * (0.42 - u * 0.62),                  // snout (+X) → back
        -HL * 0.08,
        s * HL * 0.155,
      );
      group.add(tm);
    }
  }

  // Eyes — small, set high on the skull, slightly behind midpoint
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xf2dca0, roughness: 0.25, metalness: 0.0,
    emissive: 0xc89030, emissiveIntensity: 0.55,
  });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x04060a });
  const eyeGeo = new THREE.SphereGeometry(HL * 0.085, 12, 10);
  const pupilGeo = new THREE.SphereGeometry(HL * 0.040, 8, 6);
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(-HL * 0.05, HL * 0.13, side * HL * 0.17);
    group.add(e);
    const p = new THREE.Mesh(pupilGeo, pupilMat);
    p.position.set(-HL * 0.03, HL * 0.13, side * HL * 0.195);
    group.add(p);
  }

  // Nostril hint: tiny dark dots on top of the snout (forward of eyes)
  const nostrilMat = new THREE.MeshBasicMaterial({ color: 0x06121e });
  const nostrilGeo = new THREE.SphereGeometry(HL * 0.022, 6, 5);
  for (const side of [-1, 1]) {
    const n = new THREE.Mesh(nostrilGeo, nostrilMat);
    n.position.set(HL * 0.30, HL * 0.10, side * HL * 0.050);
    group.add(n);
  }

  return group;
}

// ---------------------------------------------------------------------
// Flipper: large lobed paddle with real thickness (extruded shape).
// Built in the paddle's own local frame:
//   - extends outward along +X (will be rotated to face ±Z on each side)
//   - chord (front-to-back) along Z
//   - thickness in Y
// ---------------------------------------------------------------------

function makeFlipper(material, cfg) {
  const { atX, atY, side, length: FL, width: FW, phase, front } = cfg;
  const group = new THREE.Group();

  // 2D paddle outline in the X-Z plane (X = root→tip, Z = chord)
  const s = new THREE.Shape();
  // Curved leading edge sweeps back as it extends to the tip; trailing edge
  // gently rounded. Tip is rounded, not pointed.
  s.moveTo(0, +FW * 0.45);                                                   // root, trailing
  s.bezierCurveTo(FL * 0.20, +FW * 0.55,
                  FL * 0.55, +FW * 0.50,
                  FL * 0.92, +FW * 0.20);                                    // tip back-edge
  s.bezierCurveTo(FL * 1.04, +FW * 0.04,
                  FL * 1.04, -FW * 0.10,
                  FL * 0.92, -FW * 0.22);                                    // tip front-edge
  s.bezierCurveTo(FL * 0.62, -FW * 0.42,
                  FL * 0.28, -FW * 0.52,
                  0,         -FW * 0.40);                                    // root, leading
  s.bezierCurveTo(-FL * 0.05, -FW * 0.20,
                  -FL * 0.05, +FW * 0.20,
                  0,         +FW * 0.45);

  const extrudeOpts = {
    depth: 0.085,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 14,
    steps: 1,
  };
  const flipperGeo = new THREE.ExtrudeGeometry(s, extrudeOpts);
  // Center thickness on Y=0
  flipperGeo.translate(0, 0, -0.085 / 2 - 0.04);
  // Rotate so the paddle's thickness axis is local Y (currently Z after extrude)
  flipperGeo.rotateX(-Math.PI / 2);
  // Slight twist along length so the tip flares outward (gives airfoil hint)
  {
    const p = flipperGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const tw = THREE.MathUtils.clamp(x / FL, 0, 1);
      // 8° max twist
      const a = tw * 0.14;
      const ca = Math.cos(a), sa = Math.sin(a);
      p.setY(i, y * ca - p.getZ(i) * sa);
      p.setZ(i, y * sa + p.getZ(i) * ca);
    }
    flipperGeo.computeVertexNormals();
  }

  const paddle = new THREE.Mesh(flipperGeo, material);
  group.add(paddle);

  // Position + orient the flipper on the body
  group.position.set(atX, atY, side * 0.45);
  // Lay the flipper out along the body's lateral axis (±Z):
  //   - rotate Y by ±90° so paddle root→tip points outward (±Z)
  //   - tilt downward by ~12° at rest (paddles droop naturally)
  group.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
  group.rotation.x = -0.20;
  group.rotation.z = 0;

  group.userData.baseRotX = group.rotation.x;
  group.userData.baseRotY = group.rotation.y;
  group.userData.baseRotZ = group.rotation.z;
  group.userData.phase = phase + (side > 0 ? 0 : Math.PI * 0.15);  // tiny L/R offset
  group.userData.front = front;
  return group;
}

// ---------------------------------------------------------------------
// Procedural body texture: blue-grey countershading with subtle mottling
// (plesiosaur skin reconstructions usually show a dark dorsal / pale
// ventral pattern, sometimes with faint tiger-stripes near the back).
// ---------------------------------------------------------------------

function makeFutabaSkinTexture() {
  const W = 1024, H = 384;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Vertical countershading gradient (top = dark back, bottom = pale belly)
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#1a2c3c');
  grad.addColorStop(0.18, '#243d52');
  grad.addColorStop(0.42, '#385a72');
  grad.addColorStop(0.60, '#5a7d92');
  grad.addColorStop(0.80, '#9eb6c4');
  grad.addColorStop(1.00, '#dfe8ec');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Long-grain noise to break up the gradient
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i]   = clamp(d[i]   + n * 0.85);
    d[i+1] = clamp(d[i+1] + n * 0.9);
    d[i+2] = clamp(d[i+2] + n);
  }
  g.putImageData(img, 0, 0);

  // Faint tiger-stripe banding across the back (upper third only)
  g.save();
  g.globalAlpha = 0.18;
  g.strokeStyle = '#0a1a26';
  g.lineWidth = 4;
  const bands = 14;
  for (let i = 0; i < bands; i++) {
    const x = (i / bands) * W + Math.random() * 30;
    const yTop = Math.random() * H * 0.10;
    const yBot = H * (0.30 + Math.random() * 0.18);
    g.beginPath();
    g.moveTo(x, yTop);
    g.quadraticCurveTo(x + (Math.random() - 0.5) * 30, (yTop + yBot) * 0.5,
                       x + (Math.random() - 0.5) * 40, yBot);
    g.stroke();
  }
  g.restore();

  // Dark dorsal mottling spots
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.55;
    const r = 4 + Math.random() * 14;
    const a = 0.12 + Math.random() * 0.28;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0,   `rgba(8, 20, 32, ${a})`);
    rg.addColorStop(0.6, `rgba(8, 20, 32, ${a * 0.4})`);
    rg.addColorStop(1,   `rgba(8, 20, 32, 0)`);
    g.fillStyle = rg;
    g.save();
    g.translate(x, y);
    g.scale(1.3, 0.7);    // elongated horizontal blotches
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // Pale belly speckling (low-contrast small dots)
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * W;
    const y = H * 0.75 + Math.random() * H * 0.25;
    const r = 2 + Math.random() * 4;
    const a = 0.18 + Math.random() * 0.22;
    g.fillStyle = `rgba(220, 230, 235, ${a})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // Faint horizontal flank line (lateral stripe, very subtle)
  g.save();
  g.globalAlpha = 0.16;
  const flank = g.createLinearGradient(0, H * 0.50, 0, H * 0.62);
  flank.addColorStop(0, 'rgba(180, 200, 215, 0)');
  flank.addColorStop(0.5, 'rgba(200, 220, 230, 0.65)');
  flank.addColorStop(1, 'rgba(180, 200, 215, 0)');
  g.fillStyle = flank;
  g.fillRect(0, H * 0.50, W, H * 0.12);
  g.restore();

  // Subtle scale-cell hint: tiny irregular polygons across the body, very low alpha
  g.save();
  g.globalAlpha = 0.07;
  g.strokeStyle = '#06121e';
  g.lineWidth = 0.6;
  for (let y = 0; y < H; y += 9) {
    for (let x = 0; x < W; x += 9) {
      const ox = (Math.floor(y / 9) % 2) * 4.5;
      const cx = x + ox + (Math.random() - 0.5) * 1.5;
      const cy = y + (Math.random() - 0.5) * 1.5;
      g.beginPath();
      g.arc(cx, cy, 3.5, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function clamp(v) { return Math.max(0, Math.min(255, v)); }

// ---------------------------------------------------------------------

export function spawnFutabasaurus(scene, count = 1, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const f = new Futabasaurus(opts);
    scene.add(f.mesh);
    out.push(f);
  }
  return out;
}
