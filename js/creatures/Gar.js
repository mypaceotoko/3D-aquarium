import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';
import { injectFishBend, makeFishBendUniforms } from './fishBend.js';

/**
 * アリゲーターガー — long cylindrical predator with a needle-like snout.
 *
 * - Lathe body with a pronounced long, thin snout profile
 * - Dorsal + anal fin set far back, small pectoral pair behind head
 * - Forked caudal fin
 * - Diamond-scale patterned olive/bronze procedural texture
 * - Reacts to food: occasionally bursts from a slow patrol into a lunge
 */
export class Gar extends Creature {
  constructor(opts = {}) {
    const scale  = opts.scale ?? THREE.MathUtils.randFloat(0.95, 1.15);
    const length = 4.6 * scale;
    const L      = length;

    const group = new THREE.Group();
    const uniforms = makeFishBendUniforms({
      length, amp: 0.20, freq: 0.75, tailWeight: 1.8, curl: 0.55,
    });

    // ----- Body (lathe) -------------------------------------------
    // Very elongated cylindrical silhouette with a long tapered snout.
    const bodyProfile = [
      new THREE.Vector2(0.010, +L * 0.502),  // tail tip
      new THREE.Vector2(0.090, +L * 0.470),
      new THREE.Vector2(0.200, +L * 0.400),
      new THREE.Vector2(0.275, +L * 0.250),
      new THREE.Vector2(0.310, +L * 0.050),
      new THREE.Vector2(0.320, -L * 0.080),  // widest
      new THREE.Vector2(0.310, -L * 0.200),
      new THREE.Vector2(0.280, -L * 0.300),
      new THREE.Vector2(0.220, -L * 0.370),
      new THREE.Vector2(0.160, -L * 0.410),  // neck narrows
      new THREE.Vector2(0.105, -L * 0.435),  // snout base
      new THREE.Vector2(0.080, -L * 0.465),
      new THREE.Vector2(0.060, -L * 0.485),
      new THREE.Vector2(0.030, -L * 0.500),  // snout tip
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 18);
    bodyGeo.rotateZ(-Math.PI / 2);
    // Gar has a more cylindrical cross-section (slightly flattened top-bottom)
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setY(i, p.getY(i) * 0.94);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyTex = makeGarTexture();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x6b7844,
      roughness: 0.55,
      metalness: 0.18,          // hint of ganoid-scale sheen
      map: bodyTex,
      emissive: 0x0a1308,
      emissiveIntensity: 0.25,
    });
    injectFishBend(bodyMat, uniforms);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ----- Open jaw hint (tiny triangular mouth split on snout) ----
    // A thin dark band near the snout base makes the mouth visible.
    const mouthGeo = new THREE.CylinderGeometry(0.085 * scale, 0.055 * scale, 0.04 * scale, 10);
    mouthGeo.rotateZ(Math.PI / 2);
    const mouthMat = new THREE.MeshStandardMaterial({
      color: 0x18170f, roughness: 0.9, metalness: 0.0,
    });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(L * 0.435, 0, 0);
    group.add(mouth);

    // ----- Caudal fin (forked tail) -------------------------------
    const TH = 0.55 * scale;
    const TW = 0.85 * scale;
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.quadraticCurveTo(-TW * 0.3, TH * 0.9, -TW, TH * 0.7);
    tailShape.lineTo(-TW * 0.7, TH * 0.18);
    tailShape.lineTo(-TW * 1.05, 0);
    tailShape.lineTo(-TW * 0.7, -TH * 0.18);
    tailShape.lineTo(-TW, -TH * 0.7);
    tailShape.quadraticCurveTo(-TW * 0.3, -TH * 0.9, 0, 0);
    const tailGeo = new THREE.ShapeGeometry(tailShape, 12);
    tailGeo.translate(-L * 0.48, 0, 0);
    const tailMat = makeFinMaterial(0x3b4528, 0x0a1308);
    injectFishBend(tailMat, uniforms);
    const tail = new THREE.Mesh(tailGeo, tailMat);
    group.add(tail);

    // ----- Dorsal + anal fins (set far back, near tail) -----------
    const finMat = makeFinMaterial(0x465530, 0x0a1308);
    injectFishBend(finMat, uniforms);
    // Dorsal: back-swept triangle on top, near tail
    group.add(makeTriFin(finMat, {
      length: 0.8 * scale, height: 0.45 * scale,
      atX: -L * 0.30, atY: 0.30 * scale,
      rotX: Math.PI / 2, flip: false,
    }));
    // Anal: mirror on bottom, slightly behind dorsal
    group.add(makeTriFin(finMat, {
      length: 0.75 * scale, height: 0.42 * scale,
      atX: -L * 0.32, atY: -0.26 * scale,
      rotX: -Math.PI / 2, flip: true,
    }));

    // ----- Pectoral fins (small pair behind gills) ----------------
    const pectorals = [];
    for (const side of [-1, 1]) {
      const pec = makeTriFin(finMat, {
        length: 0.45 * scale, height: 0.30 * scale,
        atX: +L * 0.12, atY: -0.10 * scale, atZ: 0.26 * scale * side,
        rotY: side > 0 ? -0.5 : 0.5,
        rotZ: side > 0 ? -0.55 : 0.55,
        flip: side < 0,
      });
      pec.userData.phase = side * 1.0;
      pec.userData.baseRotX = pec.rotation.x;
      pec.userData.baseRotY = pec.rotation.y;
      pec.userData.baseRotZ = pec.rotation.z;
      pectorals.push(pec);
      group.add(pec);
    }

    // ----- Pelvic fins (tiny pair under belly, midbody) -----------
    const pelvics = [];
    for (const side of [-1, 1]) {
      const pel = makeTriFin(finMat, {
        length: 0.32 * scale, height: 0.22 * scale,
        atX: -L * 0.08, atY: -0.26 * scale, atZ: 0.18 * scale * side,
        rotY: side > 0 ? -0.4 : 0.4,
        rotZ: side > 0 ? -1.0 : 1.0,
        flip: side < 0,
      });
      pel.userData.phase = side * 1.3 + 0.5;
      pel.userData.baseRotX = pel.rotation.x;
      pel.userData.baseRotY = pel.rotation.y;
      pel.userData.baseRotZ = pel.rotation.z;
      pelvics.push(pel);
      group.add(pel);
    }

    // ----- Eyes ---------------------------------------------------
    const eyeGeo = new THREE.SphereGeometry(0.055 * scale, 10, 8);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xd6b85a, roughness: 0.3, metalness: 0.1, emissive: 0xc69030, emissiveIntensity: 0.45,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x04060a });
    const pupilGeo = new THREE.SphereGeometry(0.028 * scale, 8, 6);
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(+L * 0.33, 0.12 * scale, 0.20 * scale * side);
      group.add(e);
      const p = new THREE.Mesh(pupilGeo, pupilMat);
      p.position.set(+L * 0.355, 0.12 * scale, 0.235 * scale * side);
      group.add(p);
    }

    // ----- Super -------------------------------------------------
    super({
      species: 'gar',
      mesh: group,
      cfg: {
        speed: 1.15,
        maxAccel: 0.6,
        turnRate: 0.75,
        depthMin: TANK.floorY + 3.0,
        depthMax: TANK.maxY - 3.0,
        wanderMin: 6, wanderMax: 11,
        wallMargin: 4.5,
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
    this._lungeCool = Math.random() * 3;
    this._lungePhase = 0;   // 0 = idle, 1 = lunging
  }

  onUpdate(dt, time, state) {
    // Shader uniforms
    this._uniforms.uTime.value = time;
    this._uniforms.uTurn.value = this.turnSignal;

    const targetPitch = THREE.MathUtils.clamp(this.vel.y / Math.max(this.cfg.speed, 0.01), -0.6, 0.6);
    this._pitchTarget = THREE.MathUtils.lerp(this._pitchTarget, targetPitch, Math.min(1, dt * 1.8));
    this._uniforms.uPitch.value = this._pitchTarget;

    // Tail freq scales with speed; amp slightly bumps up during a lunge
    const feeding = state?.food?.active === true;
    this._uniforms.uFreq.value = 0.55 + 0.95 * this.speedNorm + (feeding ? 0.25 : 0);
    this._uniforms.uAmp.value  = 0.17 + 0.12 * this.speedNorm + (feeding ? 0.06 : 0);

    // Subtle bank into turns
    const rollTarget = -this.turnSignal * 0.35;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, rollTarget, Math.min(1, dt * 3.0));
    // Nose pitch follows vertical intent
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, this._pitchTarget * 0.4, Math.min(1, dt * 2.5));

    // Pectoral + pelvic sculling
    for (const p of this._pectorals) {
      const w = Math.sin(time * 1.6 + p.userData.phase);
      p.rotation.z = p.userData.baseRotZ + w * 0.35;
    }
    for (const p of this._pelvics) {
      const w = Math.sin(time * 1.2 + p.userData.phase);
      p.rotation.z = p.userData.baseRotZ + w * 0.22;
    }
  }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function makeTriFin(material, {
  length = 0.8, height = 0.4,
  atX = 0, atY = 0, atZ = 0,
  rotX = 0, rotY = 0, rotZ = 0,
  flip = false,
}) {
  // Back-swept triangular fin: base along X, apex at tail end + up
  const s = new THREE.Shape();
  const back = -length;
  s.moveTo(length * 0.10, 0);
  s.quadraticCurveTo(back * 0.45, height * 1.05, back * 0.92, height * 0.18);
  s.quadraticCurveTo(back * 1.02, 0, back * 0.55, -0.04);
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
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
    emissive,
    emissiveIntensity: 0.18,
  });
}

// ---------------------------------------------------------------------
// Procedural body texture: olive/bronze with ganoid diamond scales
// ---------------------------------------------------------------------
function makeGarTexture() {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Base: dark olive back → pale cream belly
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#4b5626');
  grad.addColorStop(0.40, '#6d7a3e');
  grad.addColorStop(0.72, '#b0a772');
  grad.addColorStop(1.00, '#e5daa5');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Grain
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    d[i]   = clamp(d[i]   + n);
    d[i+1] = clamp(d[i+1] + n);
    d[i+2] = clamp(d[i+2] + n * 0.6);
  }
  g.putImageData(img, 0, 0);

  // Diamond (ganoid) scale pattern: rotated grid of small rhombi
  g.save();
  g.globalAlpha = 0.28;
  g.strokeStyle = '#20280f';
  g.lineWidth = 0.8;
  const step = 16;
  for (let y = 0; y < H + step; y += step) {
    for (let x = 0; x < W + step; x += step) {
      const ox = (Math.floor(y / step) % 2) * (step / 2);
      const cx = x + ox, cy = y;
      g.beginPath();
      g.moveTo(cx,            cy - step * 0.45);
      g.lineTo(cx + step*0.45, cy);
      g.lineTo(cx,            cy + step * 0.45);
      g.lineTo(cx - step*0.45, cy);
      g.closePath();
      g.stroke();
    }
  }
  g.restore();

  // Dark mottled spots on the back half (upper third)
  for (let i = 0; i < 45; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.55;
    const r = 3 + Math.random() * 7;
    const a = 0.2 + Math.random() * 0.3;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(22, 28, 10, ${a})`);
    rg.addColorStop(1, `rgba(22, 28, 10, 0)`);
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function clamp(v) { return Math.max(0, Math.min(255, v)); }

// ---------------------------------------------------------------------

export function spawnGars(scene, count = 2, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const g = new Gar(opts);
    scene.add(g.mesh);
    out.push(g);
  }
  return out;
}
