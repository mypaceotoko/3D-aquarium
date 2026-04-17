import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';
import { injectFishBend, makeFishBendUniforms } from './fishBend.js';

/**
 * シーラカンス — large, heavy, slow-swimming "living fossil".
 *
 * Built from a lathe-revolved body profile, a 3-lobe (diphycercal) tail made
 * from a custom 2D Shape, and multiple lobed fins. All sub-meshes share a
 * single set of bend uniforms so body + fins bend in lock-step.
 */
export class Coelacanth extends Creature {
  constructor(opts = {}) {
    const scale  = opts.scale ?? THREE.MathUtils.randFloat(1.0, 1.25);
    const length = 5.2 * scale;

    const group = new THREE.Group();
    const uniforms = makeFishBendUniforms({
      length,
      amp: 0.18,
      freq: 0.40,
      tailWeight: 1.6,
      curl: 0.7,
    });

    const bodyTex = makeCoelacanthTexture();

    // ----- Body (lathe) -------------------------------------------
    // Profile points: (radius, lengthOffset). Length axis = Y before rotate.
    // +Y = tail side, -Y = head side, so after rotateZ(-PI/2) head ends up at +X.
    const L = length;
    const bodyProfile = [
      new THREE.Vector2(0.015, +L * 0.500),   // tail root
      new THREE.Vector2(0.100, +L * 0.470),
      new THREE.Vector2(0.240, +L * 0.400),
      new THREE.Vector2(0.400, +L * 0.300),
      new THREE.Vector2(0.560, +L * 0.180),
      new THREE.Vector2(0.680, +L * 0.050),
      new THREE.Vector2(0.750, -L * 0.050),   // widest
      new THREE.Vector2(0.735, -L * 0.150),
      new THREE.Vector2(0.680, -L * 0.250),
      new THREE.Vector2(0.580, -L * 0.340),
      new THREE.Vector2(0.440, -L * 0.410),
      new THREE.Vector2(0.280, -L * 0.460),
      new THREE.Vector2(0.120, -L * 0.490),   // snout
      new THREE.Vector2(0.015, -L * 0.502),
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 20);
    bodyGeo.rotateZ(-Math.PI / 2);
    // Slight vertical compression → oval cross-section
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setY(i, p.getY(i) * 0.90);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x46607c,
      roughness: 0.58,
      metalness: 0.06,
      map: bodyTex,
      emissive: 0x0a1422,
      emissiveIntensity: 0.25,
    });
    injectFishBend(bodyMat, uniforms);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ----- Tail (3-lobe diphycercal) -------------------------------
    // Built as a thin Shape in the X/Y plane. Vertices live at x ∈ [-L/2-Tail, -L/2]
    // so the fishBend shader correctly picks up large tail-weight at these x values.
    const tailBaseX = -L * 0.48;   // attach to back of body
    const TH = 0.85 * scale;       // tail height
    const TW = 0.85 * scale;       // tail width (backward extent of outer lobes)
    const TM = 1.25 * scale;       // middle spike backward extent
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.quadraticCurveTo(-TW * 0.15, TH * 0.9, -TW, TH * 0.35);
    tailShape.lineTo(-TW * 0.55, TH * 0.08);
    tailShape.lineTo(-TM, 0);                                        // middle lobe tip
    tailShape.lineTo(-TW * 0.55, -TH * 0.08);
    tailShape.quadraticCurveTo(-TW, -TH * 0.35, -TW * 0.15, -TH * 0.9);
    tailShape.quadraticCurveTo(0, -TH * 0.45, 0, 0);
    const tailGeo = new THREE.ShapeGeometry(tailShape, 14);
    tailGeo.translate(tailBaseX, 0, 0);
    // tail is a vertical fin (XY plane) — rotate so it stands in the X/Y plane,
    // which is the default. But we want it "thick" — duplicate with z=0 is fine
    // (double-sided material).
    const tailMat = makeFinMaterial(0x2c3a4c, 0x0a1422, true);
    injectFishBend(tailMat, uniforms);
    const tail = new THREE.Mesh(tailGeo, tailMat);
    group.add(tail);

    // ----- Dorsal fins (two, on top) ------------------------------
    const finMat = makeFinMaterial(0x3a4f68, 0x0a1422, true);
    injectFishBend(finMat, uniforms);
    // First dorsal: forward on top, short and rounded
    group.add(makeFin(finMat, {
      length: 1.1 * scale, height: 0.55 * scale,
      atX: -L * 0.10, atY: 0.65 * scale,
      rotZ: 0, rotX: Math.PI / 2,  // fin plane lies in X-Y, rotated to stand up
      flip: false,
    }));
    // Second dorsal: further back, taller and pointed
    group.add(makeFin(finMat, {
      length: 1.0 * scale, height: 0.70 * scale,
      atX: -L * 0.30, atY: 0.58 * scale,
      rotZ: 0, rotX: Math.PI / 2,
      flip: false,
    }));

    // ----- Anal fin (underside, near tail) ------------------------
    group.add(makeFin(finMat, {
      length: 0.95 * scale, height: 0.50 * scale,
      atX: -L * 0.28, atY: -0.52 * scale,
      rotZ: 0, rotX: -Math.PI / 2,
      flip: true,
    }));

    // ----- Pectoral fins (pair of lobed fins behind head) ---------
    const pectorals = [];
    for (const side of [-1, 1]) {
      const pec = makeLobedFin(finMat, {
        length: 1.15 * scale, width: 0.5 * scale,
        atX: +L * 0.22, atY: -0.08 * scale, atZ: 0.62 * scale * side,
        rotY: side > 0 ? -0.45 : 0.45,
        rotZ: side > 0 ? -0.25 : 0.25,
      });
      pec.userData.phase = side * 1.0;
      pectorals.push(pec);
      group.add(pec);
    }

    // ----- Pelvic fins (smaller lobed fins, midbody bottom) -------
    const pelvics = [];
    for (const side of [-1, 1]) {
      const pel = makeLobedFin(finMat, {
        length: 0.85 * scale, width: 0.35 * scale,
        atX: -L * 0.02, atY: -0.55 * scale, atZ: 0.48 * scale * side,
        rotY: side > 0 ? -0.55 : 0.55,
        rotZ: side > 0 ? -1.0 : 1.0,
      });
      pel.userData.phase = side * 1.4 + 0.7;
      pelvics.push(pel);
      group.add(pel);
    }

    // ----- Eye ---------------------------------------------------
    const eyeGeo = new THREE.SphereGeometry(0.09 * scale, 10, 8);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xf2e9c8, roughness: 0.25, metalness: 0.0, emissive: 0xffcc66, emissiveIntensity: 0.6,
    });
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(+L * 0.40, 0.16 * scale, 0.28 * scale * side);
      // eyes don't bend with body — but we still want them to translate with
      // the fish shape. Since they're near the head, tailWeight ≈ 0 so the bend
      // shader doesn't move them much. Use a plain material.
      group.add(e);
    }
    // Pupils
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x06121e });
    const pupilGeo = new THREE.SphereGeometry(0.045 * scale, 8, 6);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(pupilGeo, pupilMat);
      p.position.set(+L * 0.43, 0.16 * scale, 0.32 * scale * side);
      group.add(p);
    }

    // ----- Super -------------------------------------------------
    super({
      species: 'coelacanth',
      mesh: group,
      cfg: {
        speed: 0.85,
        maxAccel: 0.35,
        turnRate: 0.45,
        depthMin: TANK.floorY + 1.8,
        depthMax: TANK.floorY + 9.0,
        wanderMin: 8, wanderMax: 14,
        wallMargin: 5,
        reactsToFood: false,
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

  onUpdate(dt, time) {
    // Shader: time + turn signal + pitch (track vy)
    this._uniforms.uTime.value = time;
    this._uniforms.uTurn.value = this.turnSignal;

    // Pitch: ease toward normalized vertical velocity. Heavy fish → slow easing.
    const targetPitch = THREE.MathUtils.clamp(this.vel.y / Math.max(this.cfg.speed, 0.01), -0.8, 0.8);
    this._pitchTarget = THREE.MathUtils.lerp(this._pitchTarget, targetPitch, Math.min(1, dt * 1.2));
    this._uniforms.uPitch.value = this._pitchTarget;

    // Slight tail-wave frequency scales with speed — "coasting" look when slow.
    this._uniforms.uFreq.value = 0.30 + 0.55 * this.speedNorm;

    // Body roll mirrors the turn signal (banks into turns very slightly)
    const rollTarget = -this.turnSignal * 0.22;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, rollTarget, Math.min(1, dt * 2.5));

    // Head pitch: tilt the whole body slightly with pitch target (nose up/down)
    // Combined with tailBend → gives the illusion of an s-curve vertical maneuver.
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z,
      this._pitchTarget * 0.35,
      Math.min(1, dt * 2.0)
    );

    // Pectoral + pelvic fins: gentle independent sculling
    const fSway = 0.45;
    for (const p of this._pectorals) {
      const w = Math.sin(time * 1.1 + p.userData.phase);
      p.rotation.z = p.userData.baseRotZ + w * fSway * 0.5;
      p.rotation.y = p.userData.baseRotY + w * fSway * 0.25;
    }
    for (const p of this._pelvics) {
      const w = Math.sin(time * 0.9 + p.userData.phase);
      p.rotation.z = p.userData.baseRotZ + w * fSway * 0.35;
    }
  }
}

// ---------------------------------------------------------------------
// Fin builders
// ---------------------------------------------------------------------

function makeFin(material, {
  length = 1.0, height = 0.5,
  atX = 0, atY = 0, atZ = 0,
  rotX = 0, rotY = 0, rotZ = 0,
  flip = false,
}) {
  // A rounded dorsal/anal fin: tapered "leaf" shape in the X-Y plane,
  // extending backward (negative X) from its base.
  const s = new THREE.Shape();
  const back = -length;
  s.moveTo(length * 0.15, 0);
  s.quadraticCurveTo(back * 0.3, height * 1.1, back * 0.85, height * 0.2);
  s.quadraticCurveTo(back * 0.95, 0, back * 0.4, -0.05);
  s.quadraticCurveTo(0, 0.02, length * 0.15, 0);
  const geo = new THREE.ShapeGeometry(s, 12);
  // Shape lives in X-Y. We want it to stand up as a vertical fin on the body
  // (XZ plane should be horizontal, the fin sticks up in +Y). Rotate X by +90°
  // puts the fin's Y into world Z. But caller supplies the rotation.
  geo.translate(atX, 0, 0);
  if (flip) geo.scale(1, -1, 1);

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, atY, atZ);
  mesh.rotation.set(rotX, rotY, rotZ);
  return mesh;
}

function makeLobedFin(material, {
  length = 1.0, width = 0.5,
  atX = 0, atY = 0, atZ = 0,
  rotX = 0, rotY = 0, rotZ = 0,
}) {
  // Distinctive lobed fin: has a fleshy stalk (group shape) extending out from
  // the body, tapering to a rounded blade. Built as one Shape in the X-Z plane
  // (horizontal fin) with an oval silhouette.
  const s = new THREE.Shape();
  const L = length, W = width;
  s.moveTo(0, 0);
  s.quadraticCurveTo(L * 0.5, W * 0.5, L, W * 0.18);
  s.quadraticCurveTo(L * 1.08, 0, L, -W * 0.18);
  s.quadraticCurveTo(L * 0.5, -W * 0.5, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  geo.translate(atX, 0, 0);

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, atY, atZ);
  mesh.rotation.set(rotX, rotY, rotZ);
  mesh.userData.baseRotX = rotX;
  mesh.userData.baseRotY = rotY;
  mesh.userData.baseRotZ = rotZ;
  return mesh;
}

function makeFinMaterial(color, emissive = 0x000000, doubleSide = true) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.05,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    emissive,
    emissiveIntensity: 0.15,
  });
}

// ---------------------------------------------------------------------
// Procedural body texture: dark blue-gray with pale irregular spots
// ---------------------------------------------------------------------
function makeCoelacanthTexture() {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Base gradient: lighter belly, darker back
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#2a3b53');
  grad.addColorStop(0.45, '#3b536e');
  grad.addColorStop(0.70, '#5a748c');
  grad.addColorStop(1.00, '#8aa3b8');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Grain
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 24;
    d[i]   = clamp(d[i]   + n);
    d[i+1] = clamp(d[i+1] + n);
    d[i+2] = clamp(d[i+2] + n);
  }
  g.putImageData(img, 0, 0);

  // Signature pale cream spots (irregular)
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.85;
    const r = 4 + Math.random() * 9;
    const a = 0.35 + Math.random() * 0.45;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0,   `rgba(238, 228, 198, ${a})`);
    rg.addColorStop(0.6, `rgba(238, 228, 198, ${a * 0.4})`);
    rg.addColorStop(1,   `rgba(238, 228, 198, 0)`);
    g.fillStyle = rg;
    // subtle oval distortion
    g.save();
    g.translate(x, y);
    g.scale(1, 0.6 + Math.random() * 0.5);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // Faint scale pattern
  g.globalAlpha = 0.12;
  g.strokeStyle = '#0d1520';
  for (let y = 0; y < H; y += 4) {
    g.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const yy = y + Math.sin((x + y) * 0.12) * 0.8;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
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

export function spawnCoelacanths(scene, count = 1, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = new Coelacanth(opts);
    scene.add(c.mesh);
    out.push(c);
  }
  return out;
}
