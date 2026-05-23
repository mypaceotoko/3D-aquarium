import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';

/**
 * ジュゴン (Dugong dugon) — gentle marine herbivore.
 *
 * Big, chubby torpedo body with a signature downward-bent muzzle, two paddle
 * pectoral flippers, and a horizontal crescent fluke that flaps up & down
 * (mammalian, not lateral like a fish). Cute small eyes and a subtle smile.
 *
 * Because dugongs flap vertically (Y axis) rather than laterally (Z axis),
 * the shared `fishBend` shader can't be reused as-is — this file provides a
 * dedicated mammal-bend shader injection that warps the body and fluke in Y.
 *
 * Behaviour: slow, peaceful, prefers near-floor grazing depths. Long wander
 * intervals, gentle turns, big pectoral sculls, light body roll into turns.
 */
export class Dugong extends Creature {
  constructor(opts = {}) {
    const scale  = opts.scale ?? THREE.MathUtils.randFloat(1.05, 1.25);
    const length = 5.6 * scale;
    const L      = length;

    const group = new THREE.Group();
    const uniforms = makeMammalBendUniforms({
      length: L,
      amp: 0.18,
      freq: 0.45,
      tailWeight: 1.55,
      curl: 0.55,
    });

    // ---------------------------------------------------------------
    // Body (lathe → chubby manatee/dugong torpedo with rounded head)
    // Radii chosen so body aspect ≈ 3.3:1 (length:diameter) — matches a
    // real dugong's chubby silhouette.
    // ---------------------------------------------------------------
    const bodyProfile = [
      new THREE.Vector2(0.012, +L * 0.502),   // tail peduncle (thin, joins fluke)
      new THREE.Vector2(0.090, +L * 0.475),
      new THREE.Vector2(0.220, +L * 0.430),
      new THREE.Vector2(0.380, +L * 0.355),
      new THREE.Vector2(0.560, +L * 0.250),
      new THREE.Vector2(0.720, +L * 0.110),
      new THREE.Vector2(0.820, -L * 0.010),   // widest just aft of midbody
      new THREE.Vector2(0.840, -L * 0.130),
      new THREE.Vector2(0.825, -L * 0.245),
      new THREE.Vector2(0.770, -L * 0.330),   // shoulder
      new THREE.Vector2(0.700, -L * 0.395),
      new THREE.Vector2(0.620, -L * 0.440),
      new THREE.Vector2(0.520, -L * 0.470),   // muzzle base
      new THREE.Vector2(0.410, -L * 0.488),   // rostrum (rounded snout)
      new THREE.Vector2(0.290, -L * 0.498),
      new THREE.Vector2(0.140, -L * 0.502),
      new THREE.Vector2(0.012, -L * 0.503),
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 32);
    bodyGeo.rotateZ(-Math.PI / 2);   // length axis = X, head conv. → +X

    // Reshape: oval cross-section (slightly flatter top), a static downward
    // muzzle curl (the signature dugong feature), and a flattened caudal
    // peduncle so the fluke attachment reads as horizontal.
    {
      const p = bodyGeo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);

        // Body axis normalised: 0 at tail end, 1 at snout
        const t = THREE.MathUtils.clamp((v.x / L) + 0.5, 0, 1);

        // Oval cross-section: top a touch flatter than belly
        const yScale = v.y >= 0 ? 0.94 : 0.98;
        v.y *= yScale;

        // Static downward muzzle curl: ramps up only over the front ~20% of
        // the body. Coefficient tuned so the snout tip drops ~10% of body
        // length — readable as a downward muzzle without becoming grotesque.
        const drop = muzzleDrop(L, t);
        v.y -= drop;

        // Soften the very rostrum tip — slightly narrower in Z so the snout
        // looks rounded rather than blunt-ended.
        if (t > 0.93) {
          const k = (t - 0.93) / 0.07;
          v.z *= 1.0 - 0.10 * k;
        }

        // Caudal peduncle: flatten dorsoventrally where the fluke attaches
        const pedT = THREE.MathUtils.smoothstep(t, 0.12, 0.0);
        if (pedT > 0) {
          v.y *= THREE.MathUtils.lerp(1.0, 0.55, pedT);
          v.z *= THREE.MathUtils.lerp(1.0, 1.20, pedT);
        }

        p.setXYZ(i, v.x, v.y, v.z);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyTex = makeDugongTexture();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: bodyTex,
      roughness: 0.62,
      metalness: 0.04,
      emissive: 0x1a2330,
      emissiveIntensity: 0.18,
    });
    injectMammalBend(bodyMat, uniforms);

    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    body.receiveShadow = !!opts.castShadow;
    group.add(body);

    // ---------------------------------------------------------------
    // Caudal fluke (horizontal crescent — dolphin-like, NOT lateral fish tail)
    // ---------------------------------------------------------------
    // The fluke lies in the XZ plane: its lobes spread sideways in Z, its
    // up/down motion is driven by the mammal-bend uniforms.
    const FW = 1.55 * scale;   // half-span (one lobe sideways extent)
    const FB = 1.05 * scale;   // backward extent
    const fluke = makeFluke(FW, FB);
    fluke.translate(-L * 0.49, 0, 0);
    const flukeMat = new THREE.MeshStandardMaterial({
      color: 0x4d586a,
      roughness: 0.58,
      metalness: 0.06,
      side: THREE.DoubleSide,
      emissive: 0x0c1422,
      emissiveIntensity: 0.20,
    });
    injectMammalBend(flukeMat, uniforms);
    const tail = new THREE.Mesh(fluke, flukeMat);
    tail.castShadow = !!opts.castShadow;
    group.add(tail);

    // ---------------------------------------------------------------
    // Pectoral flippers (a pair of paddle blades just behind the head)
    // ---------------------------------------------------------------
    const flipperMat = new THREE.MeshStandardMaterial({
      color: 0x47525f,
      roughness: 0.62,
      metalness: 0.05,
      side: THREE.DoubleSide,
      emissive: 0x0c1422,
      emissiveIntensity: 0.18,
    });
    // Flippers do NOT use the body bend — they are rigid blades animated by
    // direct rotation of their pivots.
    const flippers = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      // Pivot anchored on the shoulder; flipper geometry extends outward
      pivot.position.set(+L * 0.13, -0.30 * scale, 0.55 * scale * side);
      const blade = makeFlipperGeometry(1.30 * scale, 0.55 * scale);
      // Place blade so its root is at pivot, tip sweeps outward & back
      const fl = new THREE.Mesh(blade, flipperMat);
      fl.castShadow = !!opts.castShadow;
      // Orient blade: long axis runs outward (+Z * side), trailing back (-X).
      // The base shape is built in the X-Y plane oriented along +X; rotate so
      // long axis follows world Z*side and the blade leans gently down.
      fl.rotation.y = (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      fl.rotation.x = side > 0 ? -0.20 : 0.20;
      pivot.add(fl);

      // Slight outward & downward base tilt (relaxed swim pose)
      pivot.rotation.z = side > 0 ? -0.22 : 0.22;
      pivot.rotation.x = -0.10;
      pivot.userData.baseRotZ = pivot.rotation.z;
      pivot.userData.baseRotX = pivot.rotation.x;
      pivot.userData.baseRotY = pivot.rotation.y;
      pivot.userData.phase = side > 0 ? 0 : Math.PI;
      pivot.userData.side = side;

      group.add(pivot);
      flippers.push(pivot);
    }

    // ---------------------------------------------------------------
    // Eyes — small, dark, gentle. Sit on the side of the head, just behind
    // the muzzle bend. Account for the same static muzzle-drop applied to
    // the body so the eye lands on the visible surface.
    // ---------------------------------------------------------------
    const eyeBallMat = new THREE.MeshStandardMaterial({
      color: 0x141a22, roughness: 0.18, metalness: 0.0,
      emissive: 0x0a1018, emissiveIntensity: 0.10,
    });
    const eyeShineMat = new THREE.MeshBasicMaterial({ color: 0xe8f4ff });
    for (const side of [-1, 1]) {
      const ex = +L * 0.22;                 // just behind the muzzle base
      const tE = (ex / L) + 0.5;
      const eyeY = 0.22 - muzzleDrop(L, tE);
      const eyeZ = 0.62 * side;             // out on the flank

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), eyeBallMat);
      eye.position.set(ex, eyeY, eyeZ);
      group.add(eye);

      // Small white shine, offset forward & up so it reads as a highlight
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeShineMat);
      shine.position.set(ex + 0.05, eyeY + 0.04, eyeZ + 0.05 * side);
      group.add(shine);

      // Faint pale eyelid ring — softens the contrast between eye and skin
      const lidMat = new THREE.MeshStandardMaterial({
        color: 0xb8b2a4, roughness: 0.65, metalness: 0.0,
      });
      const lidGeo = new THREE.TorusGeometry(0.10, 0.018, 6, 18);
      lidGeo.rotateY(Math.PI / 2);
      const lid = new THREE.Mesh(lidGeo, lidMat);
      lid.position.set(ex, eyeY, eyeZ);
      group.add(lid);
    }

    // ---------------------------------------------------------------
    // Nostrils — twin flattened ovals on the top of the snout, near where
    // the muzzle starts bending downward.
    // ---------------------------------------------------------------
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x141820, roughness: 0.85, metalness: 0.0,
    });
    for (const side of [-1, 1]) {
      const nx = +L * 0.40;
      const tN = (nx / L) + 0.5;
      const ny = 0.36 - muzzleDrop(L, tN);   // top of the (dropped) snout
      const nz = 0.18 * side;
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), darkMat);
      nostril.scale.set(1.2, 0.55, 0.75);
      nostril.position.set(nx, ny, nz);
      group.add(nostril);
    }

    // ---------------------------------------------------------------
    // Mouth — wide oval disk on the underside of the rostrum (the iconic
    // dugong "vacuum-cleaner" lip).
    // ---------------------------------------------------------------
    {
      const mx = +L * 0.475;
      const tM = (mx / L) + 0.5;
      // Body radius at mx (interpolated from the profile) is ~0.45 — place
      // the mouth a hair below the underside so it visibly rests on it.
      const my = -0.46 - muzzleDrop(L, tM) + 0.04;
      const mouthGeo = new THREE.CircleGeometry(0.20, 22);
      mouthGeo.rotateX(-Math.PI / 2);
      mouthGeo.scale(1.0, 1.0, 0.65);
      const mouth = new THREE.Mesh(mouthGeo, darkMat);
      mouth.position.set(mx, my, 0);
      group.add(mouth);

      // Soft lip — a thin torus encircling the mouth disk for the
      // distinctive raised-lip look
      const lipMat = new THREE.MeshStandardMaterial({
        color: 0x6a6f7a, roughness: 0.55, metalness: 0.03,
      });
      const lipGeo = new THREE.TorusGeometry(0.21, 0.045, 8, 22);
      lipGeo.rotateX(Math.PI / 2);
      lipGeo.scale(1.0, 1.0, 0.65);
      const lip = new THREE.Mesh(lipGeo, lipMat);
      lip.position.set(mx, my + 0.025, 0);
      group.add(lip);
    }

    // ---------------------------------------------------------------
    // Super
    // ---------------------------------------------------------------
    super({
      species: 'dugong',
      mesh: group,
      cfg: {
        speed: 0.65,
        maxAccel: 0.30,
        turnRate: 0.55,
        depthMin: TANK.floorY + 1.6,
        depthMax: TANK.floorY + 7.0,
        wanderMin: 9, wanderMax: 16,
        wallMargin: 5.5,
        reactsToFood: false,
        facesVelocity: true,
      },
      position: opts.position,
    });

    this._uniforms = uniforms;
    this._scale = scale;
    this._flippers = flippers;
    this._pitchTarget = 0;
    this._rollTarget = 0;
    this._graze = Math.random() * 5;
  }

  // Bias wander targets to the lower half of the tank — dugongs graze near
  // the seafloor.
  onPickTarget(target) {
    target.y = THREE.MathUtils.randFloat(
      this.cfg.depthMin,
      THREE.MathUtils.lerp(this.cfg.depthMin, this.cfg.depthMax, 0.55),
    );
  }

  onUpdate(dt, time) {
    // Mammal-bend uniforms
    this._uniforms.uTime.value = time;
    this._uniforms.uTurn.value = this.turnSignal;

    // Pitch tracks vertical velocity; gentle easing
    const targetPitch = THREE.MathUtils.clamp(
      this.vel.y / Math.max(this.cfg.speed, 0.01), -0.55, 0.55
    );
    this._pitchTarget = THREE.MathUtils.lerp(this._pitchTarget, targetPitch, Math.min(1, dt * 1.3));
    this._uniforms.uPitch.value = this._pitchTarget;

    // Fluke-stroke frequency scales with speed; idle "glide" when slow
    this._uniforms.uFreq.value = 0.25 + 0.55 * this.speedNorm;
    this._uniforms.uAmp.value  = 0.16 + 0.10 * this.speedNorm;

    // Gentle body roll into turns (dugongs barely roll — keep small)
    const rollTarget = -this.turnSignal * 0.16;
    this._rollTarget = THREE.MathUtils.lerp(this._rollTarget, rollTarget, Math.min(1, dt * 2.0));
    this.mesh.rotation.x = this._rollTarget;
    // Whole-body pitch (head up/down) — small fraction of pitch target
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z,
      this._pitchTarget * 0.32,
      Math.min(1, dt * 1.8),
    );

    // Pectoral flippers: gentle sculling, plus a small "swim stroke" when
    // accelerating. Each side phase-offset.
    for (const f of this._flippers) {
      const w = Math.sin(time * 0.9 + f.userData.phase);
      f.rotation.z = f.userData.baseRotZ + w * 0.18;
      f.rotation.x = f.userData.baseRotX + w * 0.10;
      f.rotation.y = f.userData.baseRotY + w * 0.06 * f.userData.side;
    }

    // Occasional grazing nod: when near the floor, tilt nose down briefly
    this._graze -= dt;
    if (this._graze <= 0 && this.pos.y < this.cfg.depthMin + 1.2) {
      this._graze = 6 + Math.random() * 8;
      // Inject a small downward velocity hint so behaviour & pose match
      this.vel.y -= 0.25;
    }
  }
}

// =====================================================================
// Mammal-bend shader (vertical undulation + steering curl + pitch tilt)
// =====================================================================
// Bends each vertex in Y (not Z like the fish version) — head and tail
// oscillate up & down while midbody stays put. Steering adds a small
// horizontal trailing curl.
// =====================================================================
function makeMammalBendUniforms({
  length, amp = 0.18, freq = 0.45, tailWeight = 1.55, curl = 0.55,
} = {}) {
  return {
    uTime:  { value: 0 },
    uTurn:  { value: 0 },
    uPitch: { value: 0 },
    uAmp:   { value: amp },
    uFreq:  { value: freq },
    uLen:   { value: length },
    uTailW: { value: tailWeight },
    uCurl:  { value: curl },
  };
}

function injectMammalBend(material, uniforms) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uTime  = uniforms.uTime;
    shader.uniforms.uTurn  = uniforms.uTurn;
    shader.uniforms.uPitch = uniforms.uPitch;
    shader.uniforms.uAmp   = uniforms.uAmp;
    shader.uniforms.uFreq  = uniforms.uFreq;
    shader.uniforms.uLen   = uniforms.uLen;
    shader.uniforms.uTailW = uniforms.uTailW;
    shader.uniforms.uCurl  = uniforms.uCurl;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uTurn;
        uniform float uPitch;
        uniform float uAmp;
        uniform float uFreq;
        uniform float uLen;
        uniform float uTailW;
        uniform float uCurl;
      `)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3( position );
        // Body axis normalised: +1 at head (+X), -1 at tail (-X)
        float bodyS = clamp(transformed.x / (uLen * 0.5), -1.0, 1.0);
        float tw = pow(clamp(-bodyS, 0.0, 1.0), uTailW);
        // Vertical travelling wave (mammals undulate up-down)
        float wave = sin(uTime * uFreq * 6.2831853 - bodyS * 3.0) * uAmp * tw;
        transformed.y += wave;
        transformed.y += uPitch * tw * 0.45;
        transformed.z += uTurn * uCurl * tw * 0.5;
      `);
  };
  material.customProgramCacheKey = () => 'mammalBend_v1';
  return material;
}

// =====================================================================
// Geometry helpers
// =====================================================================

/**
 * Vertical drop applied to the muzzle so it points downward (signature
 * dugong trait). Returns a Y offset to *subtract* from each affected
 * vertex. Body, eyes, nostrils and mouth all use this so they stay aligned.
 *
 *   t in [0..1]   — normalised body axis (0 = tail end, 1 = snout tip)
 *   Drop ramps smoothly over the front ~20% of the body, peaking at the
 *   rostrum tip with ~10% of body length of droop.
 */
function muzzleDrop(L, t) {
  const m = THREE.MathUtils.smoothstep(t, 0.78, 0.99);
  return m * m * 0.10 * L;
}

/**
 * Crescent fluke shape. Built as a flat ShapeGeometry in the X-Z plane:
 *   - root at origin (+X side faces forward toward body)
 *   - two lobes spread sideways in ±Z
 *   - trailing edge concave between the lobes (notch in the middle)
 */
function makeFluke(span, back) {
  const s = new THREE.Shape();
  // Trace the perimeter clockwise starting at the right lobe root.
  // (X back = -1, Z right = +span)
  s.moveTo(0, 0);                                            // root center
  s.quadraticCurveTo(0.05 * back, span * 0.35, -0.20 * back, span * 0.95);   // right leading
  s.quadraticCurveTo(-0.55 * back, span * 1.05, -0.85 * back, span * 0.85);  // right tip outer
  s.quadraticCurveTo(-1.05 * back, span * 0.55, -0.95 * back, span * 0.25);  // right trailing
  s.quadraticCurveTo(-0.62 * back, span * 0.08, -0.45 * back, 0);            // right notch
  s.quadraticCurveTo(-0.62 * back, -span * 0.08, -0.95 * back, -span * 0.25); // left trailing
  s.quadraticCurveTo(-1.05 * back, -span * 0.55, -0.85 * back, -span * 0.85); // left tip
  s.quadraticCurveTo(-0.55 * back, -span * 1.05, -0.20 * back, -span * 0.95); // left leading
  s.quadraticCurveTo(0.05 * back, -span * 0.35, 0, 0);                       // back to root

  // The Shape lives in 2D (x, y of the shape == x, z of the fluke). Build the
  // geometry, then rotate so its plane becomes XZ (horizontal).
  const geo = new THREE.ShapeGeometry(s, 18);
  geo.rotateX(-Math.PI / 2);          // bring Shape's Y up into world Z

  // Add a tiny vertical thickness profile — taper to zero at the tips so the
  // fluke catches a highlight.
  {
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      // Distance from the centerline (z=0) as fraction of half-span
      const lateral = Math.min(1, Math.abs(v.z) / span);
      // Distance from leading edge (x close to 0 = leading, x close to -back = trailing)
      const chord = THREE.MathUtils.clamp((-v.x) / back, 0, 1);
      // Subtle camber: leading edge a touch above zero, trailing slightly below
      const camber = 0.04 * span * (1 - chord * chord) * (1 - lateral);
      v.y += camber;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
  }
  return geo;
}

/**
 * Pectoral flipper blade — a paddle-shaped Shape in the X-Y plane.
 * Built so its base sits at origin and the tip extends in +X.
 */
function makeFlipperGeometry(length, width) {
  const s = new THREE.Shape();
  const L = length, W = width;
  // Start at upper root and trace around
  s.moveTo(0, +W * 0.32);
  s.quadraticCurveTo(L * 0.35, +W * 0.55, L * 0.82, +W * 0.18);
  s.quadraticCurveTo(L * 1.05, 0.0, L * 0.82, -W * 0.20);
  s.quadraticCurveTo(L * 0.35, -W * 0.55, 0, -W * 0.30);
  s.quadraticCurveTo(-W * 0.18, 0.0, 0, +W * 0.32);
  const geo = new THREE.ShapeGeometry(s, 16);

  // Add a small chordwise camber — flipper is convex on top, flat below
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const chord = THREE.MathUtils.clamp(v.x / L, 0, 1);
    const span  = 1.0 - Math.abs(v.y) / (W * 0.6);
    const camb  = 0.06 * L * Math.sin(chord * Math.PI) * Math.max(0, span);
    v.z += camb;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// =====================================================================
// Procedural skin texture
// =====================================================================
function makeDugongTexture() {
  // LatheGeometry UVs:
  //   U (canvas X, wraps) — around the body. After our rotateZ(-PI/2), U=0
  //     lands roughly at the belly, U=0.5 at the dorsal seam, U=1 wraps back
  //     to the belly. So a dark-middle / light-edge gradient becomes a clean
  //     dark-top / light-belly shading on the rendered body.
  //   V (canvas Y) — along the body length. Tail end at V=0, head end at V=1.
  //     CanvasTextures default to flipY=true, so canvas-Y=H maps to V=0 (tail)
  //     and canvas-Y=0 maps to V=1 (head).
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Around-the-body dorsoventral gradient: dark crown at U=0.5, soft warm
  // belly at U=0 and U=1 (matched stops → seamless wrap).
  const around = g.createLinearGradient(0, 0, W, 0);
  around.addColorStop(0.00, '#c5c4bd');   // belly (lit ventral)
  around.addColorStop(0.12, '#a9aaa4');
  around.addColorStop(0.30, '#7c8388');
  around.addColorStop(0.45, '#525c66');
  around.addColorStop(0.50, '#3f4a55');   // mid-dorsal (darkest)
  around.addColorStop(0.55, '#525c66');
  around.addColorStop(0.70, '#7c8388');
  around.addColorStop(0.88, '#a9aaa4');
  around.addColorStop(1.00, '#c5c4bd');   // belly wrap
  g.fillStyle = around;
  g.fillRect(0, 0, W, H);

  // Subtle along-body warmth: head end (canvas Y=0) a touch warmer / pinker.
  const along = g.createLinearGradient(0, 0, 0, H);
  along.addColorStop(0.00, 'rgba(208, 180, 158, 0.16)');  // head end
  along.addColorStop(0.35, 'rgba(190, 170, 150, 0.06)');
  along.addColorStop(1.00, 'rgba(160, 150, 140, 0.00)');  // tail end
  g.fillStyle = along;
  g.fillRect(0, 0, W, H);

  // Fine grain — paper-like skin texture
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i]   = clamp(d[i]   + n);
    d[i+1] = clamp(d[i+1] + n * 0.95);
    d[i+2] = clamp(d[i+2] + n * 0.9);
  }
  g.putImageData(img, 0, 0);

  // Soft mottled blotches scattered across the dorsal band — concentrate
  // near U=0.5 (canvas X = W/2) where the dark crown sits.
  g.save();
  for (let i = 0; i < 70; i++) {
    const cx = W * (0.30 + Math.random() * 0.40);   // around U=0.5
    const cy = Math.random() * H;
    const r  = 8 + Math.random() * 18;
    const a  = 0.04 + Math.random() * 0.07;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0.0, `rgba(28, 36, 44, ${a})`);
    rg.addColorStop(1.0, `rgba(28, 36, 44, 0)`);
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  // Soft pale blotches near belly (U=0 and U=1) for a warmer underside
  g.save();
  for (let i = 0; i < 80; i++) {
    const u = Math.random() < 0.5 ? Math.random() * 0.18 : 0.82 + Math.random() * 0.18;
    const cx = u * W;
    const cy = Math.random() * H;
    const r  = 8 + Math.random() * 20;
    const a  = 0.06 + Math.random() * 0.10;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0.0, `rgba(245, 240, 232, ${a})`);
    rg.addColorStop(1.0, `rgba(245, 240, 232, 0)`);
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  // Wrinkle hatching across the dorsal half — runs roughly along the body
  // length (vertical lines on canvas, since V=along-body).
  g.save();
  g.globalAlpha = 0.10;
  g.strokeStyle = '#1c232c';
  g.lineWidth = 1.0;
  for (let i = 0; i < 40; i++) {
    const x = W * (0.32 + Math.random() * 0.36);   // dorsal band only
    const y0 = Math.random() * H;
    const len = 30 + Math.random() * 110;
    g.beginPath();
    g.moveTo(x, y0);
    for (let dy = 0; dy < len; dy += 5) {
      const xx = x + Math.sin((dy + i * 11) * 0.07) * 1.4;
      g.lineTo(xx, y0 + dy);
    }
    g.stroke();
  }
  g.restore();

  // Old pale scratch scars on the flanks (dugongs accumulate them from
  // coral & boats). Run roughly along the body length (mostly vertical).
  g.save();
  g.globalAlpha = 0.22;
  g.strokeStyle = '#ece6d4';
  g.lineWidth = 0.9;
  for (let i = 0; i < 14; i++) {
    const x0 = W * (0.20 + Math.random() * 0.60);
    const y0 = Math.random() * H;
    const ang = Math.PI / 2 + (Math.random() - 0.5) * 0.5;  // mostly vertical
    const len = 60 + Math.random() * 160;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    g.stroke();
  }
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function clamp(v) { return Math.max(0, Math.min(255, v)); }

// ---------------------------------------------------------------------

export function spawnDugongs(scene, count = 1, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Dugong(opts);
    scene.add(d.mesh);
    out.push(d);
  }
  return out;
}
