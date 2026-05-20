import * as THREE from 'three';
import { initControls } from '../controls.js';
import { createObservationUI } from '../interaction/observationUI.js';
import { initAudio } from '../audio.js';
import { Creature } from '../creatures/Creature.js';

// ─────────────────────────────────────────────────────────────────────────────
// 太古巨獣・超巨大水槽 (Ancient Giants — Mega Tank)
//
// Past-tense apex creatures of Earth's history, presented at a colossal scale.
// Compared to the prior version: tank bounds nearly doubled in every axis
// (≈ 8× volume), creatures fully re-modeled with PBR/clearcoat materials,
// procedural body textures, body-bend shaders, behaviour state machines, and
// proper button/audio wiring.
// ─────────────────────────────────────────────────────────────────────────────

export const GIANT_TANK = {
  minX: -180, maxX: 180,
  minY:  -42, maxY:  52,
  minZ: -135, maxZ: 135,
  floorY: -42,
};

// ─────────────────────────────────────────────────────────────────────────────
// Body-bend shader — shared across all four creatures
//
// Bends mesh vertices along local +X (head) → -X (tail) with a travelling
// sine wave + steering curl. All sub-meshes of a single creature share the
// same uniforms so body, fins, and tail bend in lock-step.
// ─────────────────────────────────────────────────────────────────────────────

function makeBendUniforms({ length, amp = 0.28, freq = 1.0, tailW = 1.6, curl = 0.7 } = {}) {
  return {
    uTime:  { value: 0 },
    uTurn:  { value: 0 },
    uPitch: { value: 0 },
    uAmp:   { value: amp },
    uFreq:  { value: freq },
    uLen:   { value: length },
    uTailW: { value: tailW },
    uCurl:  { value: curl },
  };
}

function injectBend(material, uniforms) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
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
        vec3 transformed = vec3(position);
        float bodyS = clamp(transformed.x / (uLen * 0.5), -1.0, 1.0);
        float tw = pow(clamp(-bodyS, 0.0, 1.0), uTailW);
        float wave = sin(uTime * uFreq * 6.2831853 - bodyS * 3.2) * uAmp * tw;
        wave += uTurn * uCurl * tw;
        transformed.z += wave;
        transformed.y += -uPitch * tw * 0.45;
      `);
  };
  material.customProgramCacheKey = () => 'ancientGiantsBend_v2';
  return material;
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural texture helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp255(v) { return Math.max(0, Math.min(255, v)); }

function addNoise(g, w, h, amt = 14) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i]   = clamp255(d[i]   + n);
    d[i+1] = clamp255(d[i+1] + n * 0.95);
    d[i+2] = clamp255(d[i+2] + n * 0.85);
  }
  g.putImageData(img, 0, 0);
}

/** Plesiosaur body texture: dark indigo dorsal → grey-blue flank → pale ventral
 *  with subtle mottling and lateral counter-shading line. */
function makePlesiosaurTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#0c1f2c');
  grad.addColorStop(0.30, '#1c3c4f');
  grad.addColorStop(0.55, '#3e6678');
  grad.addColorStop(0.80, '#88a8b4');
  grad.addColorStop(1.00, '#c4dde2');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Mottled blotches (large) — dark on top, pale on belly
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 8 + Math.random() * 38;
    const dark = y < H * 0.5;
    const a = 0.06 + Math.random() * 0.16;
    const col = dark
      ? `rgba(4, 18, 30, ${a})`
      : `rgba(220, 240, 248, ${a * 0.7})`;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col);
    rg.addColorStop(1, col.replace(/,[^,]+\)$/, ', 0)'));
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // Lateral light line (subtle)
  g.globalCompositeOperation = 'screen';
  g.fillStyle = 'rgba(180, 220, 230, 0.18)';
  g.fillRect(0, H * 0.55, W, 6);
  g.globalCompositeOperation = 'source-over';

  // Faint pebbled scale grid
  g.globalAlpha = 0.10;
  g.strokeStyle = '#000';
  const cell = 14;
  for (let row = 0; row * cell * 0.78 <= H; row++) {
    for (let col = 0; col * cell * 0.92 <= W; col++) {
      const ox = (row % 2) * (cell * 0.46);
      const cx = col * cell * 0.92 + ox;
      const cy = row * cell * 0.78;
      g.beginPath(); g.arc(cx, cy, cell * 0.48, 0, Math.PI * 2); g.stroke();
    }
  }
  g.globalAlpha = 1;
  addNoise(g, W, H, 12);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Orange-brown segmented chitin texture for Opabinia (Burgess Shale style). */
function makeOpabiniaTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#3a1f0c');
  grad.addColorStop(0.25, '#6a3a18');
  grad.addColorStop(0.55, '#a06030');
  grad.addColorStop(0.80, '#c88858');
  grad.addColorStop(1.00, '#e0b48c');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Crisp segmented ring bands (15 visible somites)
  for (let i = 1; i < 18; i++) {
    const x = W * (i / 18);
    g.fillStyle = 'rgba(28, 12, 4, 0.45)';
    g.fillRect(x - 3, 0, 6, H);
    g.fillStyle = 'rgba(255, 220, 170, 0.18)';
    g.fillRect(x + 3, 0, 2, H);
  }

  // Faint darker dorsal mottling (more pronounced on top)
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.55;
    const r = 6 + Math.random() * 22;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(20, 8, 0, 0.22)');
    rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // Pale belly highlight
  g.globalCompositeOperation = 'screen';
  const belly = g.createLinearGradient(0, H * 0.6, 0, H);
  belly.addColorStop(0, 'rgba(255, 220, 180, 0)');
  belly.addColorStop(1, 'rgba(255, 230, 200, 0.30)');
  g.fillStyle = belly;
  g.fillRect(0, H * 0.6, W, H * 0.4);

  // Subtle chitin sheen highlights
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 18 + Math.random() * 40;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255, 220, 170, 0.14)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  addNoise(g, W, H, 12);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Striped Anomalocaris body texture — copper-bronze with dark dorsal stripes. */
function makeAnomalocarisTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#3a1808');
  grad.addColorStop(0.25, '#7a3c14');
  grad.addColorStop(0.55, '#b86a28');
  grad.addColorStop(0.80, '#d49654');
  grad.addColorStop(1.00, '#f0c890');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Dark dorsal bars (tiger-like)
  g.fillStyle = 'rgba(20, 6, 0, 0.55)';
  for (let i = 0; i < 14; i++) {
    const x = (W * 0.05) + i * (W * 0.062);
    const w = 8 + Math.random() * 6;
    g.fillRect(x, 0, w, H * 0.45);
  }
  // Lateral fine bars
  g.fillStyle = 'rgba(40, 16, 4, 0.25)';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * W;
    g.fillRect(x, H * 0.45, 2, H * 0.20);
  }

  // Iridescent metallic sheen
  g.globalCompositeOperation = 'screen';
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 12 + Math.random() * 40;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255, 220, 160, 0.18)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  addNoise(g, W, H, 10);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Cameroceras shell — pearly cream with concentric growth bands + ridges. */
function makeCamerocerasTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Base cream gradient (apex narrow → opening wider)
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0.00, '#2a2018');
  grad.addColorStop(0.15, '#6a503a');
  grad.addColorStop(0.40, '#b89878');
  grad.addColorStop(0.75, '#dcc4a0');
  grad.addColorStop(1.00, '#f0dcb8');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Vertical growth bands (chambers): dark ridges at intervals
  for (let i = 1; i < 22; i++) {
    const x = W * (i / 22);
    g.fillStyle = 'rgba(40, 24, 10, 0.45)';
    g.fillRect(x - 1.5, 0, 3, H);
    g.fillStyle = 'rgba(255, 240, 220, 0.22)';
    g.fillRect(x + 2, 0, 1.5, H);
  }

  // Longitudinal subtle stripes (color zoning)
  g.globalCompositeOperation = 'multiply';
  for (let y = 0; y < H; y += 14) {
    g.fillStyle = `rgba(${130 + Math.random() * 30 | 0}, ${100 + Math.random() * 20 | 0}, ${70 + Math.random() * 20 | 0}, 0.10)`;
    g.fillRect(0, y, W, 6);
  }
  g.globalCompositeOperation = 'source-over';

  // Pearly sheen
  g.globalCompositeOperation = 'screen';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 25 + Math.random() * 60;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255, 240, 220, 0.16)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  addNoise(g, W, H, 8);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Curved tube helper — tapered TubeGeometry along a Catmull-Rom spline
// ─────────────────────────────────────────────────────────────────────────────

function makeTaperedTube(points, { rBase, rTip, segs = 24, radial = 12 }) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const geo = new THREE.TubeGeometry(curve, segs, rBase, radial, false);
  const RAD = radial + 1;
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
  return geo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Futabasaurus — plesiosaur (long-neck marine reptile, Japan, late Cretaceous)
// ─────────────────────────────────────────────────────────────────────────────

export class Futabasaurus extends Creature {
  constructor(opts = {}) {
    const scale = opts.scale ?? 1.0;
    const L     = 16.0 * scale;            // nose-to-tail tip length (local units)
    const group = new THREE.Group();
    const uniforms = makeBendUniforms({ length: L, amp: 0.22, freq: 0.55, tailW: 1.4, curl: 0.5 });

    // ── Main torso (sleek streamlined egg, slightly flattened) ─────────────
    const bodyProfile = [
      new THREE.Vector2(0.02,  +L * 0.18),
      new THREE.Vector2(0.32,  +L * 0.16),
      new THREE.Vector2(0.78,  +L * 0.12),
      new THREE.Vector2(1.10,  +L * 0.07),
      new THREE.Vector2(1.42,  +L * 0.02),
      new THREE.Vector2(1.55,  -L * 0.04),
      new THREE.Vector2(1.50,  -L * 0.10),
      new THREE.Vector2(1.32,  -L * 0.16),
      new THREE.Vector2(1.04,  -L * 0.22),
      new THREE.Vector2(0.72,  -L * 0.26),
      new THREE.Vector2(0.42,  -L * 0.28),
      new THREE.Vector2(0.18,  -L * 0.30),
      new THREE.Vector2(0.02,  -L * 0.31),
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 28);
    bodyGeo.rotateZ(-Math.PI / 2);
    // Flatten the body slightly top-to-bottom (turtle-like)
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setY(i, y * 0.78);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyTex = makePlesiosaurTexture();
    const bodyMat = injectBend(new THREE.MeshPhysicalMaterial({
      color:              0xffffff,
      map:                bodyTex,
      roughness:          0.55,
      metalness:          0.05,
      clearcoat:          0.45,
      clearcoatRoughness: 0.32,
      emissive:           new THREE.Color(0x041820),
      emissiveIntensity:  0.18,
    }), uniforms);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ── Long S-curved neck (the iconic plesiosaur silhouette) ─────────────
    const neckMat = new THREE.MeshPhysicalMaterial({
      color: 0x9bb5be, map: bodyTex, roughness: 0.60, metalness: 0.04,
      clearcoat: 0.40, clearcoatRoughness: 0.36,
    });
    const neckPts = [
      new THREE.Vector3(+L * 0.15, +L * 0.02, 0),
      new THREE.Vector3(+L * 0.24, +L * 0.06, 0),
      new THREE.Vector3(+L * 0.32, +L * 0.13, 0),
      new THREE.Vector3(+L * 0.40, +L * 0.20, 0),
      new THREE.Vector3(+L * 0.48, +L * 0.26, 0),
      new THREE.Vector3(+L * 0.55, +L * 0.31, 0),
      new THREE.Vector3(+L * 0.61, +L * 0.34, 0),
    ];
    const neckGeo = makeTaperedTube(neckPts, { rBase: 0.55 * scale, rTip: 0.32 * scale, segs: 40, radial: 16 });
    const neck = new THREE.Mesh(neckGeo, neckMat);
    group.add(neck);

    // ── Head (larger, elongated muzzle) ───────────────────────────────────
    const headMat = new THREE.MeshPhysicalMaterial({
      color: 0xa8c0c8, roughness: 0.50, metalness: 0.05,
      clearcoat: 0.42, clearcoatRoughness: 0.30,
    });
    const headGeo = new THREE.SphereGeometry(0.55 * scale, 18, 14);
    headGeo.scale(1.55, 0.78, 0.85);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(+L * 0.66, +L * 0.355, 0);
    head.rotation.z = -0.22;
    group.add(head);

    // Long snout cap
    const snoutGeo = new THREE.ConeGeometry(0.40 * scale, 0.75 * scale, 14);
    snoutGeo.rotateZ(-Math.PI / 2);
    snoutGeo.translate(0.55 * scale, 0, 0);
    const snout = new THREE.Mesh(snoutGeo, headMat);
    snout.position.copy(head.position);
    snout.rotation.z = head.rotation.z;
    group.add(snout);

    // Lower jaw — a flattened wedge below the muzzle, suggesting open mouth
    const jawGeo = new THREE.ConeGeometry(0.32 * scale, 0.60 * scale, 12);
    jawGeo.rotateZ(-Math.PI / 2);
    jawGeo.translate(0.55 * scale, -0.10 * scale, 0);
    const jaw = new THREE.Mesh(jawGeo, headMat);
    jaw.position.copy(head.position);
    jaw.rotation.z = head.rotation.z - 0.10;
    group.add(jaw);

    // Golden eyes (signature amber)
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0a020, roughness: 0.10, metalness: 0.05,
      clearcoat: 0.95, clearcoatRoughness: 0.05,
      emissive: new THREE.Color(0xc88820), emissiveIntensity: 0.95,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x040206 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14 * scale, 12, 10), eyeMat);
      eye.position.set(+L * 0.66, +L * 0.380, 0.34 * scale * side);
      group.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075 * scale, 8, 6), pupilMat);
      pupil.position.set(+L * 0.682, +L * 0.385, 0.42 * scale * side);
      group.add(pupil);
    }

    // Teeth ridge along upper jaw (small white triangles)
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d4, roughness: 0.4, metalness: 0.05 });
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      for (const side of [-1, 1]) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.026 * scale, 0.12 * scale, 6), toothMat);
        tooth.position.set(
          THREE.MathUtils.lerp(+L * 0.66, +L * 0.78, t),
          +L * 0.340 - 0.012 * scale,
          0.20 * scale * side - 0.05 * scale * (1 - t),
        );
        tooth.rotation.x = Math.PI;
        group.add(tooth);
      }
    }

    // ── Tail (long, tapered, curving down — true plesiosaur proportion) ───
    const tailMat = injectBend(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: bodyTex, roughness: 0.55, metalness: 0.05,
      clearcoat: 0.45, clearcoatRoughness: 0.32,
    }), uniforms);
    const tailPts = [
      new THREE.Vector3(-L * 0.28, -L * 0.005, 0),
      new THREE.Vector3(-L * 0.42, +L * 0.012, 0),
      new THREE.Vector3(-L * 0.55, +L * 0.030, 0),
      new THREE.Vector3(-L * 0.68, +L * 0.046, 0),
      new THREE.Vector3(-L * 0.78, +L * 0.058, 0),
      new THREE.Vector3(-L * 0.86, +L * 0.066, 0),
    ];
    const tailGeo = makeTaperedTube(tailPts, { rBase: 0.85 * scale, rTip: 0.05 * scale, segs: 36, radial: 14 });
    const tail = new THREE.Mesh(tailGeo, tailMat);
    group.add(tail);

    // ── Dorsal ridge — subtle row of small bumps along the back ────────────
    const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x2a4658, roughness: 0.55, metalness: 0.06 });
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = THREE.MathUtils.lerp(-L * 0.25, +L * 0.12, t);
      const bump = new THREE.Mesh(new THREE.ConeGeometry(0.08 * scale, 0.16 * scale, 6), ridgeMat);
      bump.position.set(x, +L * 0.12, 0);
      group.add(bump);
    }

    // ── Four flippers (paddle-shaped, extruded with bevel) ─────────────────
    const flipperMat = injectBend(new THREE.MeshPhysicalMaterial({
      color: 0x5f8090, map: bodyTex, roughness: 0.50, metalness: 0.06,
      clearcoat: 0.55, clearcoatRoughness: 0.28,
      side: THREE.DoubleSide,
    }), uniforms);

    function makeFlipperShape(scale_) {
      const W = 3.0 * scale_;
      const H = 1.05 * scale_;
      const s = new THREE.Shape();
      s.moveTo(0.10 * W, 0);
      s.quadraticCurveTo( 0.05 * W,  H * 1.12, -0.55 * W, H * 0.96);
      s.quadraticCurveTo(-1.20 * W,  H * 0.42, -1.32 * W, 0);
      s.quadraticCurveTo(-1.20 * W, -H * 0.22, -0.40 * W, -H * 0.05);
      s.lineTo(0.10 * W, 0);
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.22 * scale_,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.06 * scale_,
        bevelThickness: 0.06 * scale_,
        steps: 1,
        curveSegments: 14,
      });
      geo.translate(0, 0, -0.11 * scale_);
      return geo;
    }
    const flipperGeo = makeFlipperShape(scale);

    const flippers = [];
    const flipperDefs = [
      // front L, front R, rear L, rear R — pushed slightly further out for
      // the larger flipper silhouette
      { x: +L * 0.08,  z: +1.75 * scale,  side: +1, isFront: true  },
      { x: +L * 0.08,  z: -1.75 * scale,  side: -1, isFront: true  },
      { x: -L * 0.20,  z: +1.65 * scale,  side: +1, isFront: false },
      { x: -L * 0.20,  z: -1.65 * scale,  side: -1, isFront: false },
    ];
    for (const def of flipperDefs) {
      const geo = flipperGeo.clone();
      if (def.side < 0) geo.scale(1, 1, -1);
      const f = new THREE.Mesh(geo, flipperMat);
      f.position.set(def.x, -0.35 * scale, def.z);
      f.rotation.y = def.side > 0 ? -0.5 : 0.5;
      f.rotation.z = def.side > 0 ? -0.18 : 0.18;
      f.userData.baseRY = f.rotation.y;
      f.userData.baseRZ = f.rotation.z;
      f.userData.phase  = (def.isFront ? 0 : Math.PI * 0.5) + (def.side > 0 ? 0 : Math.PI);
      flippers.push(f);
      group.add(f);
    }

    // ── Dorsal hump light (subtle bioluminescent breathing) ────────────────
    const glow = new THREE.PointLight(0x40c8e0, 1.2, 18 * scale, 2);
    glow.position.set(+L * 0.05, +L * 0.20, 0);
    group.add(glow);

    super({
      species: 'futabasaurus',
      mesh: group,
      position: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxX * 0.6),
        THREE.MathUtils.randFloat(-8, 22),
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxZ * 0.6),
      ),
      cfg: {
        speed: 3.6, maxAccel: 0.85, turnRate: 0.50,
        depthMin: GIANT_TANK.floorY + 8,
        depthMax: GIANT_TANK.maxY - 5,
        wanderMin: 12, wanderMax: 22,
        wallMargin: 18,
        bounds: GIANT_TANK,
        facesVelocity: true,
      },
    });

    this._uniforms  = uniforms;
    this._flippers  = flippers;
    this._glow      = glow;
    this._pitchT    = 0;
    this._behavior  = 'CRUISE';
    this._behaviorT = THREE.MathUtils.randFloat(10, 18);
    this._circleA   = Math.random() * Math.PI * 2;
    this._circleR   = 110;
  }

  onUpdate(dt, time) {
    const u = this._uniforms;
    u.uTime.value = time;
    u.uTurn.value = this.turnSignal;

    // Pitch follows vertical velocity
    const pitch = THREE.MathUtils.clamp(this.vel.y / Math.max(this.cfg.speed, 0.01), -0.4, 0.4);
    this._pitchT = THREE.MathUtils.lerp(this._pitchT, pitch, Math.min(1, dt * 1.2));
    u.uPitch.value = this._pitchT;

    // Swim amplitude/frequency rises with speed
    u.uFreq.value = 0.45 + 0.55 * this.speedNorm;
    u.uAmp.value  = 0.18 + 0.20 * this.speedNorm;

    // Body banking into turns
    const bank = THREE.MathUtils.clamp(-this.turnSignal * 0.28, -0.4, 0.4);
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, bank, Math.min(1, dt * 1.8));
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, this._pitchT * 0.35, Math.min(1, dt * 1.4));

    // Flipper sculling — front and rear flippers alternate
    for (const f of this._flippers) {
      const w = Math.sin(time * 1.2 + f.userData.phase);
      f.rotation.y = f.userData.baseRY + w * 0.42;
      f.rotation.z = f.userData.baseRZ + Math.cos(time * 1.2 + f.userData.phase) * 0.22 + this.turnSignal * 0.12;
    }

    // Glow breathing
    this._glow.intensity = 1.0 + Math.sin(time * 0.85) * 0.30;

    // Behavior cycle for varied roaming
    this._behaviorT -= dt;
    if (this._behaviorT <= 0) {
      this._behaviorT = THREE.MathUtils.randFloat(14, 26);
      const roll = Math.random();
      // Favour sweeping CIRCLE / cross-tank PATROL paths so it really fills
      // the volume on screen
      this._behavior = roll < 0.32 ? 'CRUISE'
                     : roll < 0.62 ? 'CIRCLE'
                     : roll < 0.78 ? 'PATROL'
                     : roll < 0.90 ? 'ASCENT'
                     :               'DIVE';
      if (this._behavior === 'CIRCLE') {
        this._circleR = THREE.MathUtils.randFloat(80, 150);
        this._circleA = Math.atan2(this.pos.z, this.pos.x);
      }
      this.pickTarget();
    }
  }

  pickTarget() {
    if (!this._behavior) {
      // Pre-init call from super constructor
      super.pickTarget();
      return;
    }
    const b = GIANT_TANK;
    const m = this.cfg.wallMargin;
    switch (this._behavior) {
      case 'DIVE':
        this.target.set(
          THREE.MathUtils.randFloat(b.minX + m, b.maxX - m),
          THREE.MathUtils.randFloat(b.floorY + 10, b.floorY + 22),
          THREE.MathUtils.randFloat(b.minZ + m, b.maxZ - m),
        );
        this.wanderT = THREE.MathUtils.randFloat(10, 18);
        break;
      case 'ASCENT':
        this.target.set(
          THREE.MathUtils.randFloat(b.minX + m, b.maxX - m),
          THREE.MathUtils.randFloat(b.maxY - 16, b.maxY - 5),
          THREE.MathUtils.randFloat(b.minZ + m, b.maxZ - m),
        );
        this.wanderT = THREE.MathUtils.randFloat(10, 18);
        break;
      case 'PATROL': {
        // Sweep diagonally to a far corner of the tank
        const tx = (this.pos.x > 0 ? -1 : 1) * (b.maxX - m);
        const tz = (this.pos.z > 0 ? -1 : 1) * (b.maxZ - m);
        this.target.set(
          tx,
          THREE.MathUtils.randFloat(-8, 24),
          tz,
        );
        this.wanderT = THREE.MathUtils.randFloat(12, 20);
        break;
      }
      case 'CIRCLE':
        this._circleA += (Math.random() < 0.5 ? 1 : -1) * 1.0;
        this.target.set(
          THREE.MathUtils.clamp(Math.cos(this._circleA) * this._circleR, b.minX + m, b.maxX - m),
          THREE.MathUtils.randFloat(-6, 20),
          THREE.MathUtils.clamp(Math.sin(this._circleA) * this._circleR, b.minZ + m, b.maxZ - m),
        );
        this.wanderT = THREE.MathUtils.randFloat(6, 11);
        break;
      default:
        super.pickTarget();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Opabinia — small Cambrian arthropod, 5 stalked eyes + proboscis with claw
// ─────────────────────────────────────────────────────────────────────────────

export class Opabinia extends Creature {
  constructor(opts = {}) {
    const scale = opts.scale ?? 1.0;
    const L     = 8.0 * scale;
    const group = new THREE.Group();
    const uniforms = makeBendUniforms({ length: L, amp: 0.30, freq: 1.3, tailW: 1.8, curl: 0.8 });

    // ── Body (segmented sausage with visible ring grooves) ─────────────────
    const bodyProfile = [
      new THREE.Vector2(0.02,  +L * 0.40),
      new THREE.Vector2(0.40,  +L * 0.38),
      new THREE.Vector2(0.85,  +L * 0.30),
      new THREE.Vector2(1.05,  +L * 0.18),
      new THREE.Vector2(1.18,  +L * 0.04),
      new THREE.Vector2(1.20,  -L * 0.10),
      new THREE.Vector2(1.16,  -L * 0.22),
      new THREE.Vector2(1.06,  -L * 0.30),
      new THREE.Vector2(0.85,  -L * 0.36),
      new THREE.Vector2(0.55,  -L * 0.42),
      new THREE.Vector2(0.28,  -L * 0.46),
      new THREE.Vector2(0.04,  -L * 0.49),
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 24);
    bodyGeo.rotateZ(-Math.PI / 2);
    // Ring grooves: pinch every ~1/15 along X to suggest segmentation
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const seg = Math.sin(x * (Math.PI * 15 / L));
        const pinch = 1.0 + seg * 0.045;
        p.setY(i, p.getY(i) * pinch);
        p.setZ(i, p.getZ(i) * pinch);
      }
      bodyGeo.computeVertexNormals();
    }

    const opaTex = makeOpabiniaTexture();
    const bodyMat = injectBend(new THREE.MeshPhysicalMaterial({
      color:              0xffffff,
      map:                opaTex,
      roughness:          0.42,
      metalness:          0.10,
      clearcoat:          0.55,
      clearcoatRoughness: 0.25,
      emissive:           new THREE.Color(0x2a1004),
      emissiveIntensity:  0.15,
    }), uniforms);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ── 5 stalked eyes (the signature feature — mushroom-like black globes) ─
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x5a3618, roughness: 0.55, metalness: 0.08 });
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x040406, roughness: 0.08, metalness: 0.0,
      clearcoat: 1.0, clearcoatRoughness: 0.04,
      emissive: new THREE.Color(0x141820), emissiveIntensity: 0.20,
    });
    const eyeHighlightMat = new THREE.MeshBasicMaterial({ color: 0xe8f4ff });
    // 5 eyes arranged in a row across the dorsal surface, splayed outward
    const eyePositions = [
      { x: +L * 0.36, z:  0.00,           tilt:  0.00, lift: 1.00 },
      { x: +L * 0.34, z: +0.55 * scale,   tilt:  0.32, lift: 0.94 },
      { x: +L * 0.34, z: -0.55 * scale,   tilt: -0.32, lift: 0.94 },
      { x: +L * 0.30, z: +0.95 * scale,   tilt:  0.50, lift: 0.82 },
      { x: +L * 0.30, z: -0.95 * scale,   tilt: -0.50, lift: 0.82 },
    ];
    for (const ep of eyePositions) {
      // Tall, slightly curved stalk
      const stalkH = 1.05 * scale * ep.lift;
      const stalkGeo = new THREE.CylinderGeometry(0.10 * scale, 0.14 * scale, stalkH, 12);
      // bend the stalk slightly outward by skewing its top
      {
        const p = stalkGeo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          const tBend = (y + stalkH * 0.5) / stalkH;
          p.setZ(i, p.getZ(i) + Math.sin(ep.tilt) * tBend * 0.30 * scale);
          p.setX(i, p.getX(i) + Math.cos(ep.tilt) * 0 /* keep X */);
        }
        stalkGeo.computeVertexNormals();
      }
      const stalk = new THREE.Mesh(stalkGeo, stalkMat);
      stalk.position.set(ep.x, +L * 0.40 + stalkH * 0.5, ep.z);
      group.add(stalk);
      // Big black mushroom-head eye on top
      const eyeR = 0.32 * scale;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 18, 14), eyeMat);
      const tipY = +L * 0.40 + stalkH;
      const tipZ = ep.z + Math.sin(ep.tilt) * 0.30 * scale;
      eye.position.set(ep.x, tipY + eyeR * 0.4, tipZ);
      eye.scale.set(1.05, 0.95, 1.05);
      group.add(eye);
      // Tiny white highlight dot (catchlight)
      const hl = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.18, 8, 6), eyeHighlightMat);
      hl.position.set(ep.x + eyeR * 0.5, tipY + eyeR * 0.7, tipZ - eyeR * 0.45);
      group.add(hl);
    }

    // ── Proboscis (front grasping arm — long curved tube with spiky claw) ──
    const probMat = new THREE.MeshPhysicalMaterial({
      color: 0xb27440, roughness: 0.45, metalness: 0.08,
      clearcoat: 0.45, clearcoatRoughness: 0.28,
    });
    const probPts = [
      new THREE.Vector3(+L * 0.45, +L * 0.20, 0),
      new THREE.Vector3(+L * 0.65, +L * 0.06, 0),
      new THREE.Vector3(+L * 0.85, -L * 0.10, 0),
      new THREE.Vector3(+L * 1.00, -L * 0.22, 0),
      new THREE.Vector3(+L * 1.10, -L * 0.30, 0),
    ];
    const probGeo = makeTaperedTube(probPts, { rBase: 0.22 * scale, rTip: 0.11 * scale, segs: 32, radial: 12 });
    const proboscis = new THREE.Mesh(probGeo, probMat);
    group.add(proboscis);
    // Articulated rings on proboscis — many tightly-spaced rings to suggest segments
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x4a2c10, roughness: 0.55, metalness: 0.08 });
    const probCurve = new THREE.CatmullRomCurve3(probPts);
    for (let i = 0; i < 14; i++) {
      const t = (i + 1) / 15;
      const pos = new THREE.Vector3();
      probCurve.getPointAt(t, pos);
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.18 * scale * (1 - t * 0.40), 0.035 * scale, 8, 18), ringMat);
      r.position.copy(pos);
      const tan = new THREE.Vector3();
      probCurve.getTangentAt(t, tan);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
      r.quaternion.copy(q);
      group.add(r);
    }
    // Claw at tip — 6 curved spikes radiating outward like a sea anemone grip
    const clawTipPos = new THREE.Vector3();
    probCurve.getPointAt(1, clawTipPos);
    const clawTan = new THREE.Vector3();
    probCurve.getTangentAt(1, clawTan).normalize();
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x2a1604, roughness: 0.4, metalness: 0.18 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05 * scale, 0.42 * scale, 8), clawMat);
      const offX = Math.cos(a) * 0.16 * scale;
      const offY = Math.sin(a) * 0.16 * scale;
      // Tilt outward
      spike.position.set(
        clawTipPos.x + offX + clawTan.x * 0.16 * scale,
        clawTipPos.y + offY + clawTan.y * 0.16 * scale,
        clawTipPos.z,
      );
      spike.rotation.z = a + Math.PI;
      spike.rotation.x = -0.3;
      group.add(spike);
    }

    // ── 15 pairs of lateral lobes — feather/leaf-shaped, overlapping ───────
    const lobeMat = injectBend(new THREE.MeshPhysicalMaterial({
      color: 0xe8a890, roughness: 0.32, metalness: 0.08,
      clearcoat: 0.75, clearcoatRoughness: 0.18,
      transparent: true, opacity: 0.86,
      side: THREE.DoubleSide,
    }), uniforms);

    // Leaf-shaped lobe with veined center and pointed tip
    function makeLobeGeo(scaleF) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.bezierCurveTo(
        0.10 * scaleF,  0.85 * scaleF,
        0.55 * scaleF,  1.00 * scaleF,
        0.95 * scaleF,  0.92 * scaleF,
      );
      sh.bezierCurveTo(
        1.25 * scaleF,  0.65 * scaleF,
        1.40 * scaleF,  0.20 * scaleF,
        1.30 * scaleF,  0,
      );
      sh.bezierCurveTo(
        1.20 * scaleF, -0.12 * scaleF,
        0.55 * scaleF, -0.08 * scaleF,
        0,             0,
      );
      const geo = new THREE.ExtrudeGeometry(sh, {
        depth: 0.05 * scaleF, bevelEnabled: true, bevelSegments: 2,
        bevelSize: 0.025 * scaleF, bevelThickness: 0.025 * scaleF, steps: 1, curveSegments: 16,
      });
      geo.translate(0, 0, -0.025 * scaleF);
      return geo;
    }

    const lobes = [];
    const LOBE_COUNT = 15;
    for (let i = 0; i < LOBE_COUNT; i++) {
      const t = i / (LOBE_COUNT - 1);
      const x = THREE.MathUtils.lerp(+L * 0.32, -L * 0.42, t);
      // Lobe size tapers slightly at head and tail ends
      const sz = (0.8 + 0.55 * Math.sin(t * Math.PI)) * scale;
      for (const side of [-1, 1]) {
        const lobe = new THREE.Mesh(makeLobeGeo(sz), lobeMat);
        // Slight overlap by lifting alternating rows
        const yLift = -L * 0.04 + (i % 2 === 0 ? 0 : 0.05 * scale);
        lobe.position.set(x, yLift, side * 0.84 * scale);
        // Side flips and a slight downward droop near the head end
        lobe.rotation.set(0, side > 0 ? 0 : Math.PI, side > 0 ? 0.08 : -0.08);
        lobe.userData.phase   = t * Math.PI * 2.2 + (side > 0 ? 0 : Math.PI * 0.5);
        lobe.userData.baseRZ  = lobe.rotation.z;
        lobe.userData.tNorm   = t;
        lobes.push(lobe);
        group.add(lobe);
      }
    }

    // ── Caudal fin (small triangular tail fan) ─────────────────────────────
    const finMat = injectBend(new THREE.MeshPhysicalMaterial({
      color: 0xd09070, roughness: 0.38, metalness: 0.08,
      clearcoat: 0.55, clearcoatRoughness: 0.24,
      side: THREE.DoubleSide,
    }), uniforms);
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(-0.8 * scale,  0.4 * scale);
    finShape.lineTo(-0.95 * scale, 0);
    finShape.lineTo(-0.8 * scale, -0.4 * scale);
    finShape.lineTo(0, 0);
    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.05 * scale, bevelEnabled: true, bevelSegments: 1,
      bevelSize: 0.02 * scale, bevelThickness: 0.02 * scale, steps: 1, curveSegments: 8,
    });
    finGeo.translate(-L * 0.46, 0, -0.025 * scale);
    finGeo.rotateY(Math.PI / 2); // vertical fin
    const tailFin = new THREE.Mesh(finGeo, finMat);
    group.add(tailFin);

    // Soft glow (warm amber, matches body tones)
    const glow = new THREE.PointLight(0xf08040, 0.8, 8 * scale, 2);
    glow.position.set(+L * 0.30, +L * 0.18, 0);
    group.add(glow);

    super({
      species: 'opabinia',
      mesh: group,
      position: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxX * 0.7),
        THREE.MathUtils.randFloat(-12, 20),
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxZ * 0.7),
      ),
      cfg: {
        speed: 4.2, maxAccel: 2.6, turnRate: 2.4,
        depthMin: GIANT_TANK.floorY + 5,
        depthMax: GIANT_TANK.maxY - 4,
        wanderMin: 6, wanderMax: 12,
        wallMargin: 10,
        bounds: GIANT_TANK,
        facesVelocity: true,
      },
    });

    this._uniforms = uniforms;
    this._lobes    = lobes;
    this._glow     = glow;
  }

  onUpdate(dt, time) {
    const u = this._uniforms;
    u.uTime.value = time;
    u.uTurn.value = this.turnSignal;
    u.uFreq.value = 0.9 + 0.8 * this.speedNorm;
    u.uAmp.value  = 0.24 + 0.18 * this.speedNorm;

    // Lateral lobes ripple in a smooth wave from head to tail
    for (const lobe of this._lobes) {
      const w = Math.sin(time * 3.6 - lobe.userData.phase);
      lobe.rotation.z = lobe.userData.baseRZ + w * 0.38;
    }

    // Body banking
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -this.turnSignal * 0.22, Math.min(1, dt * 2.2));

    this._glow.intensity = 0.7 + Math.sin(time * 1.4) * 0.20;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Anomalocaris — Cambrian apex predator, ~1m, lateral flap propulsion
// ─────────────────────────────────────────────────────────────────────────────

export class Anomalocaris extends Creature {
  constructor(opts = {}) {
    const scale = opts.scale ?? 1.0;
    const L     = 14.0 * scale;
    const group = new THREE.Group();
    const uniforms = makeBendUniforms({ length: L, amp: 0.22, freq: 0.85, tailW: 1.5, curl: 0.6 });

    // ── Streamlined body (laterally compressed) ────────────────────────────
    const bodyProfile = [
      new THREE.Vector2(0.03,  +L * 0.45),
      new THREE.Vector2(0.50,  +L * 0.40),
      new THREE.Vector2(1.05,  +L * 0.32),
      new THREE.Vector2(1.35,  +L * 0.18),
      new THREE.Vector2(1.45,  +L * 0.00),
      new THREE.Vector2(1.40,  -L * 0.16),
      new THREE.Vector2(1.20,  -L * 0.30),
      new THREE.Vector2(0.92,  -L * 0.40),
      new THREE.Vector2(0.55,  -L * 0.46),
      new THREE.Vector2(0.20,  -L * 0.49),
      new THREE.Vector2(0.04,  -L * 0.50),
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 28);
    bodyGeo.rotateZ(-Math.PI / 2);
    // Lateral compression (sleek)
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setZ(i, p.getZ(i) * 0.72);
        // Slight dorsal hump
        const x = p.getX(i);
        const hump = Math.sin((x / L) * Math.PI) * 0.10;
        if (p.getY(i) > 0) p.setY(i, p.getY(i) + hump * scale);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyTex = makeAnomalocarisTexture();
    const bodyMat = injectBend(new THREE.MeshPhysicalMaterial({
      color:              0xffffff,
      map:                bodyTex,
      roughness:          0.40,
      metalness:          0.18,
      clearcoat:          0.62,
      clearcoatRoughness: 0.22,
      emissive:           new THREE.Color(0x2a1004),
      emissiveIntensity:  0.20,
    }), uniforms);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ── Head segment cap (slightly darker) ─────────────────────────────────
    const headMat = new THREE.MeshPhysicalMaterial({
      color: 0x7a3c14, roughness: 0.45, metalness: 0.16,
      clearcoat: 0.55, clearcoatRoughness: 0.22,
    });
    const headGeo = new THREE.SphereGeometry(0.72 * scale, 18, 14);
    headGeo.scale(1.2, 1.1, 0.95);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(+L * 0.42, +L * 0.05, 0);
    group.add(head);

    // ── Compound eyes on prominent stalks (tall pillar-like, signature
    //    feature — large upright capsules on stout cylindrical bases) ──────
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x4a2410, roughness: 0.50, metalness: 0.14 });
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a0a14, roughness: 0.06, metalness: 0.08,
      clearcoat: 1.0, clearcoatRoughness: 0.05,
      emissive: new THREE.Color(0x0a3050), emissiveIntensity: 0.55,
    });
    const eyeBandMat = new THREE.MeshPhysicalMaterial({
      color: 0x102030, roughness: 0.30, metalness: 0.25,
      clearcoat: 0.85, clearcoatRoughness: 0.12,
      emissive: new THREE.Color(0x205088), emissiveIntensity: 0.4,
    });
    for (const side of [-1, 1]) {
      // Stalk: angled outward, tall
      const stalkLen = 1.10 * scale;
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20 * scale, 0.30 * scale, stalkLen, 14),
        stalkMat,
      );
      stalk.position.set(+L * 0.46, +L * 0.18, 0.55 * scale * side);
      stalk.rotation.z = -0.18 * side;
      stalk.rotation.x = -0.10;
      group.add(stalk);
      // Big capsule-shaped compound eye on top, with subtle horizontal band
      const eyeGroup = new THREE.Group();
      const eye = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.40 * scale, 0.55 * scale, 12, 18),
        eyeMat,
      );
      eyeGroup.add(eye);
      // Horizontal iridescent band around the middle (compound-eye highlight)
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.405 * scale, 0.045 * scale, 8, 24),
        eyeBandMat,
      );
      band.rotation.x = Math.PI / 2;
      eyeGroup.add(band);
      // Catchlight dot for life
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff8e0 }));
      hl.position.set(0.20 * scale, 0.20 * scale, 0.32 * scale);
      eyeGroup.add(hl);
      eyeGroup.position.set(+L * 0.46, +L * 0.18 + stalkLen * 0.55, 0.55 * scale * side + 0.08 * scale * side);
      eyeGroup.rotation.z = -0.15 * side;
      group.add(eyeGroup);
    }

    // ── Disc mouth (circular array of plates) underneath head ──────────────
    const mouthGroup = new THREE.Group();
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x4a2008, roughness: 0.4, metalness: 0.2, emissive: 0x200804, emissiveIntensity: 0.4,
    });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const plate = new THREE.Mesh(new THREE.ConeGeometry(0.12 * scale, 0.38 * scale, 6), plateMat);
      plate.position.set(Math.cos(a) * 0.35 * scale, 0, Math.sin(a) * 0.35 * scale);
      plate.rotation.set(Math.PI / 2, 0, -a);
      mouthGroup.add(plate);
    }
    mouthGroup.position.set(+L * 0.40, -L * 0.05, 0);
    mouthGroup.rotation.x = Math.PI * 0.5;
    group.add(mouthGroup);

    // ── 2 large grasping front appendages (curved tubes with spines) ───────
    const appMat = new THREE.MeshPhysicalMaterial({
      color: 0x9a4818, roughness: 0.40, metalness: 0.18,
      clearcoat: 0.55, clearcoatRoughness: 0.20,
    });
    const spineMat = new THREE.MeshStandardMaterial({ color: 0x281008, roughness: 0.55, metalness: 0.15 });

    for (const side of [-1, 1]) {
      const appPts = [
        new THREE.Vector3(+L * 0.46, -L * 0.10,  0.20 * scale * side),
        new THREE.Vector3(+L * 0.60, -L * 0.16,  0.45 * scale * side),
        new THREE.Vector3(+L * 0.72, -L * 0.20,  0.55 * scale * side),
        new THREE.Vector3(+L * 0.82, -L * 0.18,  0.35 * scale * side),
        new THREE.Vector3(+L * 0.88, -L * 0.12,  0.18 * scale * side),
      ];
      const appGeo = makeTaperedTube(appPts, { rBase: 0.24 * scale, rTip: 0.10 * scale, segs: 22, radial: 10 });
      const app = new THREE.Mesh(appGeo, appMat);
      group.add(app);
      // Spines along the inner curve
      const curve = new THREE.CatmullRomCurve3(appPts);
      for (let i = 0; i < 8; i++) {
        const t = (i + 1) / 9;
        const p = new THREE.Vector3();
        curve.getPointAt(t, p);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05 * scale, 0.30 * scale, 6), spineMat);
        spike.position.set(p.x, p.y - 0.12 * scale, p.z);
        spike.rotation.z = -Math.PI * 0.5;
        group.add(spike);
      }
    }

    // ── 14 pairs of lateral swim flaps (leaf/petal-shaped, overlapping like
    //    fish scales — the iconic locomotion structures of Anomalocaris) ──
    const flapMat = injectBend(new THREE.MeshPhysicalMaterial({
      color: 0xd89868, roughness: 0.38, metalness: 0.10,
      clearcoat: 0.70, clearcoatRoughness: 0.18,
      transparent: true, opacity: 0.90,
      side: THREE.DoubleSide,
    }), uniforms);
    // Leaf/petal shape with pointed tip — like an elongated tear drop
    function makeFlapShape(scaleF) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.bezierCurveTo(
        0.08 * scaleF,  0.95 * scaleF,
        0.55 * scaleF,  1.15 * scaleF,
        1.00 * scaleF,  1.00 * scaleF,
      );
      sh.bezierCurveTo(
        1.40 * scaleF,  0.78 * scaleF,
        1.55 * scaleF,  0.32 * scaleF,
        1.45 * scaleF,  0,
      );
      sh.bezierCurveTo(
        1.30 * scaleF, -0.14 * scaleF,
        0.55 * scaleF, -0.08 * scaleF,
        0,             0,
      );
      return sh;
    }

    const flaps = [];
    const FLAP_COUNT = 14;
    for (let i = 0; i < FLAP_COUNT; i++) {
      const t = i / (FLAP_COUNT - 1);
      const x = THREE.MathUtils.lerp(+L * 0.26, -L * 0.40, t);
      // Per-flap size — fatter in the middle of the body, narrower at ends
      const sizeF = (0.78 + 0.55 * Math.sin(t * Math.PI)) * scale;
      // Build flap shape at this exact size so the dark edge ring aligns
      const sh = makeFlapShape(sizeF);
      const flapGeo = new THREE.ExtrudeGeometry(sh, {
        depth: 0.06 * scale, bevelEnabled: true, bevelSegments: 2,
        bevelSize: 0.025 * scale, bevelThickness: 0.025 * scale, steps: 1, curveSegments: 16,
      });
      flapGeo.translate(0, 0, -0.03 * scale);

      // Thin dark "rib" outline traced on top via a simple Line — adds
      // anatomical detail at the flap edge.
      const ribPts = sh.getPoints(48).map(v => new THREE.Vector3(v.x, v.y, 0.04 * scale));
      const ribGeo = new THREE.BufferGeometry().setFromPoints(ribPts);

      for (const side of [-1, 1]) {
        const subgroup = new THREE.Group();
        const flap = new THREE.Mesh(flapGeo, flapMat);
        subgroup.add(flap);
        const rib = new THREE.Line(ribGeo, new THREE.LineBasicMaterial({ color: 0x2a1408, transparent: true, opacity: 0.5 }));
        subgroup.add(rib);
        // Position — stagger overlap with neighbours by alternating Y offset
        const yLift = -L * 0.08 + (i % 2 === 0 ? 0 : 0.08 * scale);
        subgroup.position.set(x, yLift, side * 0.60 * scale);
        subgroup.rotation.set(0, side > 0 ? 0 : Math.PI, side > 0 ? 0.07 : -0.07);
        subgroup.userData.phase = t * Math.PI * 2.8 + (side > 0 ? 0 : Math.PI * 0.4);
        subgroup.userData.baseRZ = subgroup.rotation.z;
        flaps.push(subgroup);
        group.add(subgroup);
      }
    }

    // ── 3-blade tail fan ────────────────────────────────────────────────────
    const fanMat = injectBend(new THREE.MeshPhysicalMaterial({
      color: 0xa66838, roughness: 0.40, metalness: 0.15,
      clearcoat: 0.50, clearcoatRoughness: 0.22, side: THREE.DoubleSide,
    }), uniforms);
    const fanShape = new THREE.Shape();
    fanShape.moveTo(0, 0);
    fanShape.quadraticCurveTo(-0.8 * scale, 0.5 * scale, -1.6 * scale, 0.55 * scale);
    fanShape.quadraticCurveTo(-1.85 * scale, 0.20 * scale, -1.85 * scale, 0);
    fanShape.quadraticCurveTo(-1.85 * scale, -0.20 * scale, -1.6 * scale, -0.55 * scale);
    fanShape.quadraticCurveTo(-0.8 * scale, -0.5 * scale, 0, 0);
    const fanGeo = new THREE.ExtrudeGeometry(fanShape, {
      depth: 0.07 * scale, bevelEnabled: true, bevelSegments: 1,
      bevelSize: 0.025 * scale, bevelThickness: 0.025 * scale, steps: 1, curveSegments: 12,
    });
    fanGeo.translate(-L * 0.46, 0, -0.035 * scale);
    fanGeo.rotateY(Math.PI / 2); // vertical tail
    const tailFan = new THREE.Mesh(fanGeo, fanMat);
    group.add(tailFan);

    // Subtle glowing belly
    const glow = new THREE.PointLight(0xff8040, 1.4, 14 * scale, 2);
    glow.position.set(0, -L * 0.15, 0);
    group.add(glow);

    super({
      species: 'anomalocaris',
      mesh: group,
      position: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxX * 0.7),
        THREE.MathUtils.randFloat(-15, 18),
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxZ * 0.7),
      ),
      cfg: {
        speed: 3.6, maxAccel: 1.8, turnRate: 1.4,
        depthMin: GIANT_TANK.floorY + 6,
        depthMax: GIANT_TANK.maxY - 5,
        wanderMin: 8, wanderMax: 16,
        wallMargin: 12,
        bounds: GIANT_TANK,
        facesVelocity: true,
      },
    });

    this._uniforms = uniforms;
    this._flaps    = flaps;
    this._glow     = glow;
  }

  onUpdate(dt, time) {
    const u = this._uniforms;
    u.uTime.value = time;
    u.uTurn.value = this.turnSignal;
    u.uFreq.value = 0.55 + 0.55 * this.speedNorm;
    u.uAmp.value  = 0.18 + 0.18 * this.speedNorm;

    // Lateral flaps create the iconic travelling wave of locomotion
    for (const f of this._flaps) {
      const w = Math.sin(time * 3.2 - f.userData.phase);
      f.rotation.z = f.userData.baseRZ + w * 0.45;
    }

    // Body banking
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -this.turnSignal * 0.25, Math.min(1, dt * 2));

    this._glow.intensity = 1.2 + Math.sin(time * 1.2) * 0.22;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cameroceras — colossal straight-shelled nautiloid (~6m+)
// ─────────────────────────────────────────────────────────────────────────────

export class Cameroceras extends Creature {
  constructor(opts = {}) {
    const scale = opts.scale ?? 1.0;
    const L     = 18.0 * scale;            // shell length
    const group = new THREE.Group();

    // ── Long conical shell ─────────────────────────────────────────────────
    const shellPts = [];
    const SEGS = 18;
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS;
      const x = (t - 1) * L;
      const r = THREE.MathUtils.lerp(0.10, 1.80, Math.pow(t, 0.85)) * scale;
      shellPts.push(new THREE.Vector2(r, x));
    }
    const shellGeo = new THREE.LatheGeometry(shellPts, 32);
    // Add visible growth ring grooves
    {
      const p = shellGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getY(i); // along axis (lathe Y)
        const groove = Math.cos(x * (Math.PI * 22 / L));
        const pinch = 1.0 + groove * 0.018;
        p.setX(i, p.getX(i) * pinch);
        p.setZ(i, p.getZ(i) * pinch);
      }
      shellGeo.computeVertexNormals();
    }
    shellGeo.rotateZ(Math.PI / 2);  // align long axis with X

    const shellTex = makeCamerocerasTexture();
    const shellMat = new THREE.MeshPhysicalMaterial({
      color:              0xffffff,
      map:                shellTex,
      roughness:          0.45,
      metalness:          0.10,
      clearcoat:          0.65,
      clearcoatRoughness: 0.25,
      emissive:           new THREE.Color(0x1a0c04),
      emissiveIntensity:  0.10,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.castShadow = !!opts.castShadow;
    group.add(shell);

    // Raised growth ridges at intervals
    const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.55, metalness: 0.08 });
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      const x = (t - 1) * L;
      const r = THREE.MathUtils.lerp(0.10, 1.80, Math.pow(t, 0.85)) * scale + 0.04 * scale;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05 * scale, 8, 28), ridgeMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x;
      group.add(ring);
    }

    // Inner chamber partitions visible at the wide end (the body chamber)
    const partitionMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.6, metalness: 0.05 });
    for (let i = 0; i < 4; i++) {
      const x = -i * 1.2 * scale - 0.5 * scale;
      const r = 1.78 * scale - i * 0.05 * scale;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 32), partitionMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x;
      group.add(ring);
    }

    // ── Hood (fleshy collar at the wide opening) ───────────────────────────
    const fleshMat = new THREE.MeshPhysicalMaterial({
      color: 0xb8745c, roughness: 0.50, metalness: 0.05,
      clearcoat: 0.40, clearcoatRoughness: 0.30,
      emissive: new THREE.Color(0x401808), emissiveIntensity: 0.18,
    });
    const hoodGeo = new THREE.SphereGeometry(1.80 * scale, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const hood = new THREE.Mesh(hoodGeo, fleshMat);
    hood.position.set(0, 0, 0);
    hood.rotation.z = -Math.PI / 2;
    hood.scale.set(1, 1, 1);
    group.add(hood);

    // ── Single eye on the side of the hood ─────────────────────────────────
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x080418, roughness: 0.08, metalness: 0.0,
      clearcoat: 0.95, clearcoatRoughness: 0.06,
      emissive: new THREE.Color(0xf0b860), emissiveIntensity: 1.4,
    });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32 * scale, 16, 12), eyeMat);
      eye.position.set(0.10 * scale, 0.60 * scale * side, 1.55 * scale);
      eye.scale.set(0.7, 1, 1);
      group.add(eye);
    }

    // ── Funnel/siphon — small directional tube near hood underside ─────────
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * scale, 0.42 * scale, 0.85 * scale, 14), fleshMat);
    funnel.position.set(0.35 * scale, -0.95 * scale, 0);
    funnel.rotation.z = Math.PI * 0.5 + 0.4;
    group.add(funnel);

    // ── 10 thick octopus-like tentacles fanning out from the hood opening ─
    const tentMat = new THREE.MeshPhysicalMaterial({
      color: 0xb87648, roughness: 0.50, metalness: 0.04,
      clearcoat: 0.42, clearcoatRoughness: 0.32,
      emissive: new THREE.Color(0x301808), emissiveIntensity: 0.12,
    });
    const suckerMat = new THREE.MeshStandardMaterial({
      color: 0x6a3a20, roughness: 0.60, metalness: 0.05,
    });

    const tentacles = [];
    const TENT_COUNT = 10;
    for (let i = 0; i < TENT_COUNT; i++) {
      const a = (i / TENT_COUNT) * Math.PI * 2;
      const baseR = 1.20 * scale;
      const tipR  = 3.80 * scale;
      // Each tentacle curls outward and slightly downward, with a gentle S
      const pts = [
        new THREE.Vector3(0.55 * scale,                    Math.cos(a) * baseR,            Math.sin(a) * baseR),
        new THREE.Vector3(0.55 * scale + 0.70 * scale,     Math.cos(a) * baseR * 1.30,     Math.sin(a) * baseR * 1.30),
        new THREE.Vector3(0.55 * scale + 1.55 * scale,     Math.cos(a) * tipR * 0.62,      Math.sin(a) * tipR * 0.62),
        new THREE.Vector3(0.55 * scale + 2.30 * scale,     Math.cos(a) * tipR * 0.86,      Math.sin(a) * tipR * 0.86),
        new THREE.Vector3(0.55 * scale + 2.85 * scale,     Math.cos(a) * tipR * 0.98,      Math.sin(a) * tipR * 0.98),
        new THREE.Vector3(0.55 * scale + 3.20 * scale,     Math.cos(a) * tipR,             Math.sin(a) * tipR),
      ];
      // Much thicker base than before — octopus-arm proportions
      const tentGeo = makeTaperedTube(pts, { rBase: 0.34 * scale, rTip: 0.06 * scale, segs: 32, radial: 14 });
      const tent = new THREE.Mesh(tentGeo, tentMat);
      tent.userData.basePts = pts.map(p => p.clone());
      tent.userData.phase = a;
      tentacles.push(tent);
      group.add(tent);

      // Suction-cup style bumps along the underside of each tentacle
      const curve = new THREE.CatmullRomCurve3(pts);
      for (let j = 1; j < 12; j++) {
        const t = j / 12;
        const pos = new THREE.Vector3();
        curve.getPointAt(t, pos);
        const tan = new THREE.Vector3();
        curve.getTangentAt(t, tan).normalize();
        // Inward (toward central axis) — for visual interest the cups sit on
        // the curve interior
        const inward = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)).normalize();
        const r = THREE.MathUtils.lerp(0.30, 0.06, t * t) * scale;
        const cup = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 8, 6), suckerMat);
        cup.position.copy(pos).addScaledVector(inward, r * 0.85);
        cup.scale.set(1.0, 0.55, 1.0);
        group.add(cup);
      }
    }

    // Bioluminescent glow at opening
    const glow = new THREE.PointLight(0xf8c080, 1.6, 14 * scale, 2);
    glow.position.set(1.5 * scale, 0, 0);
    group.add(glow);

    super({
      species: 'cameroceras',
      mesh: group,
      position: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxX * 0.6),
        THREE.MathUtils.randFloat(-20, 12),
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxZ * 0.6),
      ),
      cfg: {
        speed: 2.4, maxAccel: 0.75, turnRate: 0.55,
        depthMin: GIANT_TANK.floorY + 10,
        depthMax: GIANT_TANK.maxY - 8,
        wanderMin: 12, wanderMax: 22,
        wallMargin: 18,
        bounds: GIANT_TANK,
        facesVelocity: true,
      },
    });

    this._tentacles = tentacles;
    this._glow      = glow;
  }

  onUpdate(dt, time) {
    // Tentacles wave with soft sine offsets (no body bend for the hard shell)
    for (const t of this._tentacles) {
      const w = Math.sin(time * 0.9 + t.userData.phase) * 0.22;
      const w2 = Math.cos(time * 0.6 + t.userData.phase * 1.3) * 0.16;
      t.rotation.y = w;
      t.rotation.z = w2;
    }
    this._glow.intensity = 1.4 + Math.sin(time * 0.7) * 0.30;

    // Slight roll for organic feel
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -this.turnSignal * 0.12, Math.min(1, dt * 1.2));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Giant scene builder — custom large environment for the ancient giants tank
// ─────────────────────────────────────────────────────────────────────────────

function buildGiantScene(scene, isMobile) {
  scene.fog = new THREE.FogExp2(0x031420, isMobile ? 0.0085 : 0.0072);
  scene.background = makeGradientBg();

  const updaters = [];

  // Lighting — dramatic key + colored fills
  const ambient = new THREE.AmbientLight(0x1a4060, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xd8f0ff, 1.05);
  key.position.set(40, 120, 60);
  key.target.position.set(0, GIANT_TANK.floorY, 0);
  scene.add(key.target);
  if (!isMobile) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -120;
    key.shadow.camera.right = 120;
    key.shadow.camera.top = 120;
    key.shadow.camera.bottom = -120;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 320;
    key.shadow.bias = -0.0006;
  }
  scene.add(key);

  const fillCyan = new THREE.PointLight(0x28a0d0, 1.6, 240, 1.6);
  fillCyan.position.set(-80, 30, 40);
  scene.add(fillCyan);

  const fillEmerald = new THREE.PointLight(0x40d8a8, 1.0, 220, 1.7);
  fillEmerald.position.set(80, -10, -50);
  scene.add(fillEmerald);

  const fillPurple = new THREE.PointLight(0x6040c0, 0.9, 220, 1.8);
  fillPurple.position.set(0, 45, -90);
  scene.add(fillPurple);

  // Seafloor (huge, with dunes and caustics)
  const floorGeo = new THREE.PlaneGeometry(440, 360, 96, 80);
  floorGeo.rotateX(-Math.PI / 2);
  {
    const p = floorGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = Math.sin(x * 0.06) * 1.3
              + Math.cos(z * 0.05) * 1.6
              + Math.sin((x + z) * 0.03) * 2.0
              + Math.cos((x - z) * 0.02) * 1.2;
      p.setY(i, h);
    }
    floorGeo.computeVertexNormals();
  }
  const sandTex = makeSandTexture();
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x9a8266,
    roughness: 0.96,
    metalness: 0.0,
    map: sandTex,
  });
  const causticsU = { uTime: { value: 0 } };
  floorMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = causticsU.uTime;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vWPos;'
    ).replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWPos = worldPosition.xyz;'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      varying vec3 vWPos;
      float caustic(vec2 p){
        float t = uTime * 0.35;
        vec2 a = p * 0.18;
        vec2 b = mat2(0.87,-0.5,0.5,0.87) * p * 0.26 + vec2(t*0.5, -t*0.3);
        vec2 c = mat2(0.5,0.87,-0.87,0.5) * p * 0.36 + vec2(-t*0.2, t*0.4);
        float s = sin(a.x + cos(a.y + t)) + sin(a.y*1.3 - t*0.7);
        float s2 = sin(b.x*1.1 + cos(b.y*0.9));
        float s3 = sin(c.x + cos(c.y*1.2 - t));
        float v = s + s2 + s3;
        v = pow(max(v*0.22, 0.0), 3.0);
        return v;
      }`
    ).replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      float c = caustic(vWPos.xz);
      gl_FragColor.rgb += vec3(0.30, 0.80, 0.95) * c * 0.7;`
    );
  };
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = GIANT_TANK.floorY;
  floor.receiveShadow = !isMobile;
  scene.add(floor);
  updaters.push((dt, t) => { causticsU.uTime.value = t; });

  // God rays (more rays, larger)
  const rayCount = isMobile ? 6 : 12;
  const rayTex = makeGodRayTex();
  const rayMat = new THREE.MeshBasicMaterial({
    map: rayTex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0.20, color: 0xbfe8ff, side: THREE.DoubleSide, fog: true,
  });
  const rays = [];
  for (let i = 0; i < rayCount; i++) {
    const geo = new THREE.PlaneGeometry(18, 110);
    const m = new THREE.Mesh(geo, rayMat);
    const ang = (i / rayCount) * Math.PI * 2 + Math.random() * 0.6;
    const r = 30 + Math.random() * 80;
    m.position.set(Math.cos(ang) * r, 18, Math.sin(ang) * r);
    m.rotation.y = Math.random() * Math.PI;
    m.rotation.z = (Math.random() - 0.5) * 0.18;
    m.userData.phase = Math.random() * Math.PI * 2;
    m.userData.baseX = m.position.x;
    m.userData.baseZ = m.position.z;
    rays.push(m);
    scene.add(m);
  }
  updaters.push((dt, t) => {
    for (const r of rays) {
      r.position.x = r.userData.baseX + Math.sin(t * 0.1 + r.userData.phase) * 1.6;
      r.position.z = r.userData.baseZ + Math.cos(t * 0.08 + r.userData.phase) * 1.2;
      r.rotation.y += dt * 0.03;
    }
  });

  // Background rocks scattered around the perimeter
  const rocksGroup = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x202832, roughness: 0.95, metalness: 0.0 });
  const rockCount = isMobile ? 24 : 44;
  for (let i = 0; i < rockCount; i++) {
    const geo = new THREE.IcosahedronGeometry(2.5 + Math.random() * 5.5, 0);
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const n = 0.8 + Math.random() * 0.5;
      p.setXYZ(j, p.getX(j) * n, p.getY(j) * (n * 0.7), p.getZ(j) * n);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, rockMat);
    const ang = Math.random() * Math.PI * 2;
    const r = 90 + Math.random() * 70;
    m.position.set(Math.cos(ang) * r, GIANT_TANK.floorY + Math.random() * 3, Math.sin(ang) * r);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.setScalar(1.0 + Math.random() * 2.4);
    rocksGroup.add(m);
  }
  scene.add(rocksGroup);

  // Plankton field
  const planktonCount = isMobile ? 1600 : 3200;
  const plankton = makePlankton(planktonCount);
  scene.add(plankton.object);
  updaters.push((dt, t) => plankton.update(dt, t));

  // Bubble streams
  const bubbles = makeBubbles(isMobile ? 80 : 160);
  scene.add(bubbles.object);
  updaters.push((dt, t) => bubbles.update(dt, t));

  return {
    update(dt, t) { for (const fn of updaters) fn(dt, t); },
    bubbles,
  };
}

function makeGradientBg() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#0a2c44');
  grad.addColorStop(0.30, '#062236');
  grad.addColorStop(0.65, '#031624');
  grad.addColorStop(1.0, '#010608');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSandTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#a89274';
  g.fillRect(0, 0, s, s);
  const img = g.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    d[i] = clamp255(d[i] + n);
    d[i+1] = clamp255(d[i+1] + n * 0.9);
    d[i+2] = clamp255(d[i+2] + n * 0.6);
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 1 + Math.random() * 3;
    g.fillStyle = `rgba(${60+Math.random()*70|0},${50+Math.random()*60|0},${40+Math.random()*50|0},${0.25+Math.random()*0.4})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI*2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 24);
  tex.anisotropy = 4;
  return tex;
}

function makeGodRayTex() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(200,240,255,0.32)');
  grad.addColorStop(1.0, 'rgba(0,20,40,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

function makePlanktonSprite() {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  grad.addColorStop(0, 'rgba(220,255,255,1)');
  grad.addColorStop(0.35, 'rgba(160,220,255,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

function makePlankton(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i*3]   = (Math.random() - 0.5) * 360;
    positions[i*3+1] = GIANT_TANK.floorY + 1 + Math.random() * (GIANT_TANK.maxY - GIANT_TANK.floorY);
    positions[i*3+2] = (Math.random() - 0.5) * 260;
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i]  = 0.25 + Math.random() * 1.4;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const uniforms = {
    uTime: { value: 0 },
    uTex:  { value: makePlanktonSprite() },
    uPixel:{ value: window.innerHeight },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixel;
      varying float vAlpha;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.25 + aPhase) * 1.0;
        p.y += sin(uTime * 0.18 + aPhase * 1.3) * 0.6;
        p.z += cos(uTime * 0.22 + aPhase * 0.7) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float depthFade = clamp(1.0 + mv.z / 220.0, 0.0, 1.0);
        vAlpha = depthFade * (0.25 + 0.75 * aSize);
        gl_PointSize = aSize * uPixel * 0.020 / max(-mv.z, 0.1);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vAlpha;
      void main(){
        vec4 c = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(c.rgb, c.a * vAlpha * 0.70);
      }
    `,
  });
  const object = new THREE.Points(geo, mat);
  object.frustumCulled = false;
  return {
    object,
    update(dt, t) { uniforms.uTime.value = t; uniforms.uPixel.value = window.innerHeight; }
  };
}

function makeBubbles(maxCount) {
  const geo = new THREE.SphereGeometry(0.18, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd8f2ff, transparent: true, opacity: 0.50,
    roughness: 0.15, metalness: 0.0,
    emissive: 0x88c8e0, emissiveIntensity: 0.18,
  });
  const inst = new THREE.InstancedMesh(geo, mat, maxCount);
  inst.frustumCulled = false;
  const state = [];
  function reset(b, initial) {
    b.x = (Math.random() - 0.5) * 320;
    b.z = (Math.random() - 0.5) * 240;
    b.y = initial ? GIANT_TANK.floorY + Math.random() * 60 : GIANT_TANK.floorY + 0.3;
    b.vy = 1.0 + Math.random() * 2.5;
    b.scale = 0.6 + Math.random() * 1.8;
    b.phase = Math.random() * Math.PI * 2;
    b.wobble = 0.3 + Math.random() * 0.8;
    return b;
  }
  for (let i = 0; i < maxCount; i++) state.push(reset({}, true));
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  return {
    object: inst,
    spawnAt(x, y, z, n = 12) {
      for (let k = 0; k < n; k++) {
        const b = state[Math.floor(Math.random() * state.length)];
        b.x = x + (Math.random() - 0.5) * 1.2;
        b.z = z + (Math.random() - 0.5) * 1.2;
        b.y = y;
        b.vy = 1.4 + Math.random() * 2.0;
      }
    },
    update(dt, t) {
      for (let i = 0; i < state.length; i++) {
        const b = state[i];
        b.y += b.vy * dt;
        if (b.y > GIANT_TANK.maxY + 2) reset(b, false);
        v.set(
          b.x + Math.sin(t * 1.1 + b.phase) * b.wobble,
          b.y,
          b.z + Math.cos(t * 0.85 + b.phase) * b.wobble * 0.8,
        );
        const s = b.scale * (0.6 + 0.4 * Math.min(1, (b.y - GIANT_TANK.floorY) / 40));
        m.makeScale(s, s, s);
        m.setPosition(v);
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Launch
// ─────────────────────────────────────────────────────────────────────────────

export function launch() {
  const ui = document.getElementById('ui');
  ui.style.display = '';

  const canvas = document.getElementById('stage');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
                || window.matchMedia?.('(max-width: 780px)').matches;

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !isMobile, powerPreference: 'high-performance', alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.20;
  if (!isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.5, 900);
  camera.position.set(0, 28, 220);

  const sceneApi = buildGiantScene(scene, isMobile);

  const state = {
    ambient: true,
    soundOn: false,
    food: { active: false, position: new THREE.Vector3() },
    creatures: null,
  };

  // ── Creatures: exactly one of each species so the giant volume reads
  //    cleanly. Futabasaurus is sized as the apex of the four.
  const creatures = [];
  creatures.push(new Futabasaurus({ scale: 5.0, castShadow: !isMobile }));
  creatures.push(new Anomalocaris({ scale: 2.8, castShadow: !isMobile }));
  creatures.push(new Cameroceras ({ scale: 2.5, castShadow: !isMobile }));
  creatures.push(new Opabinia    ({ scale: 3.4, castShadow: !isMobile }));

  for (const c of creatures) scene.add(c.mesh);
  state.creatures = creatures;
  const getCreatures = () => creatures;

  // ── UI buttons configured for this aquarium ──────────────────────────────
  configureSpeciesButtons();

  const obsUI = createObservationUI();

  // Cinematic waypoints tuned to the giant tank's massive scale
  const cinematicWaypoints = [
    { pos: new THREE.Vector3(   0, 24, 220), look: new THREE.Vector3(  0,   4,   0) },
    { pos: new THREE.Vector3(-140, 30, 160), look: new THREE.Vector3( 10,   2, -20) },
    { pos: new THREE.Vector3( 140, 40,-140), look: new THREE.Vector3(-20,  10,  20) },
    { pos: new THREE.Vector3( 100,-20, 180), look: new THREE.Vector3(  0, -16, -10) },
    { pos: new THREE.Vector3(-120, 46, -90), look: new THREE.Vector3(  0,   8,  40) },
    { pos: new THREE.Vector3(  40,-28, 230), look: new THREE.Vector3(  0,   6,   0) },
  ];

  const controls = initControls({
    camera, renderer, state, getCreatures,
    onFeed: (p) => sceneApi.bubbles.spawnAt(p.x, p.y, p.z, 18),
    onObserve: (c) => obsUI.show(c.species),
    onRelease: () => obsUI.hide(),
    tank: GIANT_TANK,
    orbitDistance: { min: 24, max: 380 },
    cinematicWaypoints,
  });
  obsUI.onClose(() => controls.release());

  const audio = initAudio({ state, getCreatures });

  // ── Ambient auto-species follow (subtle showcase rotation) ───────────────
  const speciesPool = ['futabasaurus', 'opabinia', 'anomalocaris', 'cameroceras'];
  let ambientTimer = null;
  function startAmbientCycle() {
    stopAmbientCycle();
    const pick = () => controls.selectSpecies(speciesPool[Math.floor(Math.random() * speciesPool.length)]);
    ambientTimer = setInterval(pick, 16000);
    pick();
  }
  function stopAmbientCycle() {
    if (ambientTimer != null) { clearInterval(ambientTimer); ambientTimer = null; }
  }
  startAmbientCycle();

  // ── Wire common UI buttons ───────────────────────────────────────────────
  const btnAmbient  = document.getElementById('btn-ambient');
  const btnSound    = document.getElementById('btn-sound');
  const btnFeed     = document.getElementById('btn-feed');
  const btnBright   = document.getElementById('btn-bright');
  const btnUiToggle = document.getElementById('btn-ui-toggle');
  const speciesBtns = [...document.querySelectorAll('.species-btn')];

  // Initial UI state — reflect actual world state
  btnAmbient.setAttribute('aria-pressed', String(state.ambient));
  btnAmbient.textContent = state.ambient ? '鑑賞 ON' : '鑑賞 OFF';
  btnSound.setAttribute('aria-pressed', String(state.soundOn));
  btnSound.textContent = state.soundOn ? '音 ON' : '音 OFF';
  btnUiToggle.setAttribute('aria-expanded', 'true');
  btnUiToggle.textContent = '▾';

  // Brightness cycle (3 levels, mirrors main.js)
  const EXPOSURE_LEVELS = [
    { label: '暗め',   value: 0.85 },
    { label: '標準',   value: 1.20 },
    { label: '明るめ', value: 1.65 },
  ];
  let exposureIdx = 1;
  function applyExposure() {
    const lvl = EXPOSURE_LEVELS[exposureIdx];
    renderer.toneMappingExposure = lvl.value;
    btnBright.textContent = `明 ${lvl.label}`;
  }
  applyExposure();

  btnAmbient.addEventListener('click', () => {
    state.ambient = !state.ambient;
    btnAmbient.setAttribute('aria-pressed', String(state.ambient));
    btnAmbient.textContent = state.ambient ? '鑑賞 ON' : '鑑賞 OFF';
    if (state.ambient) startAmbientCycle();
    else { stopAmbientCycle(); controls.release(); }
  });

  btnSound.addEventListener('click', () => {
    if (state.soundOn) {
      audio.disable();
      state.soundOn = false;
      btnSound.setAttribute('aria-pressed', 'false');
      btnSound.textContent = '音 OFF';
    } else {
      const ok = audio.enable();
      if (ok) {
        state.soundOn = true;
        btnSound.setAttribute('aria-pressed', 'true');
        btnSound.textContent = '音 ON';
      }
    }
  });

  btnFeed.addEventListener('click', () => {
    // Burst of bubbles at a random upper-mid spot
    const x = THREE.MathUtils.randFloatSpread(GIANT_TANK.maxX * 0.7);
    const z = THREE.MathUtils.randFloatSpread(GIANT_TANK.maxZ * 0.7);
    const y = GIANT_TANK.maxY - 8;
    sceneApi.bubbles.spawnAt(x, y, z, 22);
  });

  btnBright.addEventListener('click', () => {
    exposureIdx = (exposureIdx + 1) % EXPOSURE_LEVELS.length;
    applyExposure();
  });

  btnUiToggle.addEventListener('click', () => {
    const collapsed = ui.classList.toggle('collapsed');
    btnUiToggle.setAttribute('aria-expanded', String(!collapsed));
    btnUiToggle.textContent = collapsed ? '▴' : '▾';
    btnUiToggle.title = collapsed ? 'メニューを開く' : 'メニューを閉じる';
  });

  speciesBtns.forEach((b) => {
    if (!b.dataset.species) return;
    b.addEventListener('click', () => controls.selectSpecies(b.dataset.species));
  });

  // ── Resize / pause ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  let paused = false;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });

  // ── Animation loop ────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    if (paused) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    sceneApi.update(dt, t);
    for (const c of creatures) c.update(dt, t, state);
    controls.update(dt);
    audio.update(dt, t);
    renderer.render(scene, camera);
  }
  animate();
}

// ─────────────────────────────────────────────────────────────────────────────
// Species button configuration — relabel for the four ancient creatures,
// strip the leviathan glow class (so the Futabasaurus slot doesn't inherit
// the apex-creature highlight), hide unused slots.
// ─────────────────────────────────────────────────────────────────────────────
function configureSpeciesButtons() {
  const SPECIES = [
    { id: 'futabasaurus', label: 'フタバスズキリュウ' },
    { id: 'opabinia',     label: 'オパビニア' },
    { id: 'anomalocaris', label: 'アノマロカリス' },
    { id: 'cameroceras',  label: 'カメロケラス' },
  ];
  const buttons = [...document.querySelectorAll('.species-btn')];
  buttons.forEach((b, i) => {
    // Always strip any apex-glow styling carried over from other aquariums
    b.classList.remove('leviathan-btn');
    b.removeAttribute('aria-pressed');
    const sp = SPECIES[i];
    if (!sp) {
      b.style.display = 'none';
      b.dataset.species = '';
      return;
    }
    b.style.display = '';
    b.dataset.species = sp.id;
    b.textContent = sp.label;
    b.title = sp.label;
  });
}
