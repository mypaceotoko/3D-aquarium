import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';
import { injectFishBend, makeFishBendUniforms } from './fishBend.js';

/**
 * ピラルク (Arapaima gigas) — hero fish of the aquarium.
 *
 * Massive elongated Amazonian predator. Signature look:
 *   - Flattened head and very long cylindrical body
 *   - Bright crimson scales on the back half of the body
 *   - Dorsal + anal fins positioned very far back, almost fused to the tail,
 *     giving it a paddle-like power end
 *   - Large rounded caudal fin
 *
 * Tuned to feel heavy and purposeful — slower than the gar, but with a
 * stronger, more pronounced tail sweep.
 */
export class Pirarucu extends Creature {
  constructor(opts = {}) {
    const scale  = opts.scale ?? THREE.MathUtils.randFloat(1.25, 1.55);
    const length = 6.8 * scale;
    const L      = length;

    const group = new THREE.Group();
    const uniforms = makeFishBendUniforms({
      length, amp: 0.24, freq: 0.55, tailWeight: 1.5, curl: 0.65,
    });

    // ----- Body (lathe) -------------------------------------------
    // Torpedo body with a flattened head and a thicker back-half.
    const bodyProfile = [
      new THREE.Vector2(0.015, +L * 0.502),   // tail root
      new THREE.Vector2(0.130, +L * 0.470),
      new THREE.Vector2(0.320, +L * 0.420),
      new THREE.Vector2(0.510, +L * 0.340),
      new THREE.Vector2(0.660, +L * 0.220),
      new THREE.Vector2(0.760, +L * 0.080),
      new THREE.Vector2(0.820, -L * 0.050),   // widest
      new THREE.Vector2(0.820, -L * 0.170),
      new THREE.Vector2(0.780, -L * 0.280),
      new THREE.Vector2(0.700, -L * 0.370),
      new THREE.Vector2(0.580, -L * 0.430),   // head narrows
      new THREE.Vector2(0.440, -L * 0.465),
      new THREE.Vector2(0.300, -L * 0.488),   // flattened snout
      new THREE.Vector2(0.130, -L * 0.500),
      new THREE.Vector2(0.015, -L * 0.502),
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 22);
    bodyGeo.rotateZ(-Math.PI / 2);
    // Flatten head top-to-bottom, keep body circular. Apply along x=head→flat, tail→round.
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const headFlat = THREE.MathUtils.smoothstep(x, L * 0.15, L * 0.45); // 0→tail, 1→head
        const yScale = THREE.MathUtils.lerp(0.95, 0.72, headFlat);
        p.setY(i, p.getY(i) * yScale);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyTex = makePirarucuTexture();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,            // multiplied against the map; map carries the hue
      roughness: 0.48,
      metalness: 0.22,             // scales catch caustic highlights
      map: bodyTex,
      emissive: 0x1a0608,
      emissiveIntensity: 0.30,
    });
    injectFishBend(bodyMat, uniforms);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ----- Caudal fin (large rounded paddle) ----------------------
    const TH = 1.25 * scale;
    const TW = 1.30 * scale;
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.quadraticCurveTo(-TW * 0.25, TH * 1.00, -TW * 0.85, TH * 0.75);
    tailShape.quadraticCurveTo(-TW * 1.15, TH * 0.20, -TW * 1.20, 0);
    tailShape.quadraticCurveTo(-TW * 1.15, -TH * 0.20, -TW * 0.85, -TH * 0.75);
    tailShape.quadraticCurveTo(-TW * 0.25, -TH * 1.00, 0, 0);
    const tailGeo = new THREE.ShapeGeometry(tailShape, 16);
    tailGeo.translate(-L * 0.48, 0, 0);
    const tailMat = makeFinMaterial(0x7a1f20, 0x1a0608);
    injectFishBend(tailMat, uniforms);
    const tail = new THREE.Mesh(tailGeo, tailMat);
    group.add(tail);

    // ----- Dorsal + anal fins (fused-looking, very far back) ------
    const finMat = makeFinMaterial(0x5a1b1c, 0x1a0608);
    injectFishBend(finMat, uniforms);
    // Dorsal: long rear fin on top
    group.add(makeRearFin(finMat, {
      length: 1.7 * scale, height: 0.55 * scale,
      atX: -L * 0.28, atY: 0.70 * scale,
      rotX: Math.PI / 2, flip: false,
    }));
    // Anal: mirror on bottom
    group.add(makeRearFin(finMat, {
      length: 1.6 * scale, height: 0.52 * scale,
      atX: -L * 0.28, atY: -0.62 * scale,
      rotX: -Math.PI / 2, flip: true,
    }));

    // ----- Pectoral fins (small pair behind gills) ----------------
    const pectoralMat = makeFinMaterial(0x3a2222, 0x1a0608);
    injectFishBend(pectoralMat, uniforms);
    const pectorals = [];
    for (const side of [-1, 1]) {
      const pec = makeLeafFin(pectoralMat, {
        length: 0.70 * scale, height: 0.35 * scale,
        atX: +L * 0.18, atY: -0.32 * scale, atZ: 0.65 * scale * side,
        rotY: side > 0 ? -0.55 : 0.55,
        rotZ: side > 0 ? -0.45 : 0.45,
        flip: side < 0,
      });
      pec.userData.phase = side * 0.9;
      pec.userData.baseRotZ = pec.rotation.z;
      pec.userData.baseRotY = pec.rotation.y;
      pectorals.push(pec);
      group.add(pec);
    }

    // ----- Pelvic fins (small pair under belly, midbody) ----------
    const pelvics = [];
    for (const side of [-1, 1]) {
      const pel = makeLeafFin(pectoralMat, {
        length: 0.55 * scale, height: 0.25 * scale,
        atX: -L * 0.05, atY: -0.65 * scale, atZ: 0.35 * scale * side,
        rotY: side > 0 ? -0.4 : 0.4,
        rotZ: side > 0 ? -1.1 : 1.1,
        flip: side < 0,
      });
      pel.userData.phase = side * 1.2 + 0.8;
      pel.userData.baseRotZ = pel.rotation.z;
      pel.userData.baseRotY = pel.rotation.y;
      pelvics.push(pel);
      group.add(pel);
    }

    // ----- Mouth (wide flat underbite hint) -----------------------
    const mouthGeo = new THREE.CylinderGeometry(0.12 * scale, 0.16 * scale, 0.05 * scale, 12);
    mouthGeo.rotateZ(Math.PI / 2);
    mouthGeo.scale(1, 0.55, 1);
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x15090b, roughness: 0.9 });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(+L * 0.465, -0.10 * scale, 0);
    group.add(mouth);

    // ----- Eyes ---------------------------------------------------
    const eyeGeo = new THREE.SphereGeometry(0.095 * scale, 10, 8);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xf4e4a0, roughness: 0.28, metalness: 0.08, emissive: 0xe08a20, emissiveIntensity: 0.4,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x05070a });
    const pupilGeo = new THREE.SphereGeometry(0.045 * scale, 8, 6);
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(+L * 0.33, 0.14 * scale, 0.48 * scale * side);
      group.add(e);
      const p = new THREE.Mesh(pupilGeo, pupilMat);
      p.position.set(+L * 0.355, 0.14 * scale, 0.52 * scale * side);
      group.add(p);
    }

    // ----- Super -------------------------------------------------
    super({
      species: 'pirarucu',
      mesh: group,
      cfg: {
        speed: 1.05,
        maxAccel: 0.55,
        turnRate: 0.55,
        depthMin: TANK.floorY + 2.0,
        depthMax: TANK.maxY - 4.0,
        wanderMin: 9, wanderMax: 15,
        wallMargin: 6.0,
        reactsToFood: true,
        facesVelocity: true,
      },
      position: opts.position,
    });

    this._uniforms = uniforms;
    this._scale = scale;
    this._pectorals = pectorals;
    this._pelvics = pelvics;
    this._pitchTarget = 0;
  }

  onUpdate(dt, time, state) {
    this._uniforms.uTime.value = time;
    this._uniforms.uTurn.value = this.turnSignal;

    const targetPitch = THREE.MathUtils.clamp(this.vel.y / Math.max(this.cfg.speed, 0.01), -0.55, 0.55);
    this._pitchTarget = THREE.MathUtils.lerp(this._pitchTarget, targetPitch, Math.min(1, dt * 1.5));
    this._uniforms.uPitch.value = this._pitchTarget;

    // Heavy, slower tail but higher amplitude; food presence increases intensity
    const feeding = state?.food?.active === true;
    this._uniforms.uFreq.value = 0.40 + 0.70 * this.speedNorm + (feeding ? 0.20 : 0);
    this._uniforms.uAmp.value  = 0.22 + 0.10 * this.speedNorm + (feeding ? 0.06 : 0);

    // Heavy bank (feels massive)
    const rollTarget = -this.turnSignal * 0.28;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, rollTarget, Math.min(1, dt * 2.2));
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, this._pitchTarget * 0.35, Math.min(1, dt * 2.0));

    // Pectoral sculling
    for (const p of this._pectorals) {
      const w = Math.sin(time * 1.2 + p.userData.phase);
      p.rotation.z = p.userData.baseRotZ + w * 0.32;
      p.rotation.y = p.userData.baseRotY + w * 0.15;
    }
    for (const p of this._pelvics) {
      const w = Math.sin(time * 0.9 + p.userData.phase);
      p.rotation.z = p.userData.baseRotZ + w * 0.20;
    }
  }
}

// ---------------------------------------------------------------------
// Fin builders
// ---------------------------------------------------------------------

/** Long, low rear dorsal/anal fin — back edge is quasi-straight. */
function makeRearFin(material, {
  length = 1.7, height = 0.55,
  atX = 0, atY = 0, atZ = 0,
  rotX = 0, rotY = 0, rotZ = 0,
  flip = false,
}) {
  const s = new THREE.Shape();
  const back = -length;
  s.moveTo(length * 0.15, 0);
  s.quadraticCurveTo(back * 0.10, height * 0.85, back * 0.45, height * 0.95);
  s.lineTo(back * 0.82, height * 0.80);
  s.quadraticCurveTo(back * 1.02, height * 0.25, back * 0.98, 0);
  s.quadraticCurveTo(back * 0.55, 0.04, 0, 0.02);
  s.lineTo(length * 0.15, 0);
  const geo = new THREE.ShapeGeometry(s, 12);
  geo.translate(atX, 0, 0);
  if (flip) geo.scale(1, -1, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, atY, atZ);
  mesh.rotation.set(rotX, rotY, rotZ);
  return mesh;
}

function makeLeafFin(material, {
  length = 0.7, height = 0.3,
  atX = 0, atY = 0, atZ = 0,
  rotX = 0, rotY = 0, rotZ = 0,
  flip = false,
}) {
  const s = new THREE.Shape();
  const back = -length;
  s.moveTo(length * 0.10, 0);
  s.quadraticCurveTo(back * 0.4, height * 1.0, back * 0.92, height * 0.15);
  s.quadraticCurveTo(back * 1.0, 0, back * 0.5, -0.05);
  s.quadraticCurveTo(0, 0.02, length * 0.10, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  geo.translate(atX, 0, 0);
  if (flip) geo.scale(1, -1, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, atY, atZ);
  mesh.rotation.set(rotX, rotY, rotZ);
  return mesh;
}

function makeFinMaterial(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.15,
    side: THREE.DoubleSide,
    emissive,
    emissiveIntensity: 0.22,
  });
}

// ---------------------------------------------------------------------
// Procedural body texture: gray-green head, crimson back half with scales
// ---------------------------------------------------------------------
function makePirarucuTexture() {
  const W = 1024, H = 256;  // wide → aligned with body length
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // The fish's +X (head) is usually mapped to one end of the UV — a LatheGeometry
  // wraps its U around the tube (around), and V goes along the length. We treat
  // the U (x-axis of canvas) as the body-length axis (along fish) and V (y-axis)
  // as the around-the-body direction. That's not strictly how LatheGeometry uses
  // UVs, but the result still produces a plausible banded look because the back
  // half of the fish is what the viewer sees most.

  // Horizontal gradient along body length: head=gray-green → mid=cream → tail=crimson
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0.00, '#7f6443');   // tail-end
  grad.addColorStop(0.05, '#9b2422');
  grad.addColorStop(0.25, '#a92a27');
  grad.addColorStop(0.45, '#b13530');
  grad.addColorStop(0.62, '#a5594c');
  grad.addColorStop(0.78, '#6f6a53');
  grad.addColorStop(0.92, '#485945');
  grad.addColorStop(1.00, '#3a4a40');   // head-end
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Vertical belly fade (lighter underneath)
  const vgrad = g.createLinearGradient(0, 0, 0, H);
  vgrad.addColorStop(0.00, 'rgba(0,0,0,0.20)');
  vgrad.addColorStop(0.55, 'rgba(0,0,0,0.00)');
  vgrad.addColorStop(1.00, 'rgba(255,230,200,0.35)');
  g.fillStyle = vgrad;
  g.fillRect(0, 0, W, H);

  // Grain
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 20;
    d[i]   = clamp(d[i]   + n);
    d[i+1] = clamp(d[i+1] + n * 0.8);
    d[i+2] = clamp(d[i+2] + n * 0.6);
  }
  g.putImageData(img, 0, 0);

  // Large round scales: concentrated on the back (crimson) half
  g.save();
  const sz = 22;
  for (let y = 0; y < H + sz; y += sz * 0.78) {
    for (let x = 0; x < W + sz; x += sz * 0.88) {
      // Only render scales where the U is on the tail half (0..0.6)
      const u = x / W;
      if (u > 0.72) continue;
      const ox = (Math.floor(y / (sz * 0.78)) % 2) * (sz * 0.44);
      const cx = x + ox, cy = y;
      const tailness = THREE.MathUtils.smoothstep(u, 0.65, 0.05);  // 0 at mid → 1 at tail
      const a = 0.18 + 0.35 * tailness;
      // Edge stroke
      g.globalAlpha = a;
      g.strokeStyle = '#1a0608';
      g.lineWidth = 1.1;
      g.beginPath();
      g.arc(cx, cy, sz * 0.48, 0, Math.PI * 2);
      g.stroke();
      // Soft highlight
      g.globalAlpha = a * 0.55;
      const rg = g.createRadialGradient(cx - sz * 0.15, cy - sz * 0.15, 0, cx, cy, sz * 0.5);
      rg.addColorStop(0, 'rgba(255, 220, 190, 0.6)');
      rg.addColorStop(1, 'rgba(255, 220, 190, 0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(cx, cy, sz * 0.48, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();

  // Final pinch: overlay additional crimson hot-spots on the rear flank to pop
  g.globalCompositeOperation = 'screen';
  g.globalAlpha = 0.18;
  const hot = g.createLinearGradient(0, 0, W, 0);
  hot.addColorStop(0.0, 'rgba(255, 60, 30, 0.9)');
  hot.addColorStop(0.35, 'rgba(255, 80, 50, 0.4)');
  hot.addColorStop(0.6, 'rgba(0, 0, 0, 0.0)');
  g.fillStyle = hot;
  g.fillRect(0, H * 0.25, W, H * 0.5);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function clamp(v) { return Math.max(0, Math.min(255, v)); }

// ---------------------------------------------------------------------

export function spawnPirarucus(scene, count = 1, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = new Pirarucu(opts);
    scene.add(p.mesh);
    out.push(p);
  }
  return out;
}
