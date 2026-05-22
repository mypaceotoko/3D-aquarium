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

/**
 * Whale variant — cetaceans pump their fluke VERTICALLY (mammal swimming).
 * Same uniform names as injectBend so behaviour code is interchangeable.
 */
function injectWhaleBend(material, uniforms) {
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
        float wave = sin(uTime * uFreq * 6.2831853 - bodyS * 2.6) * uAmp * tw;
        transformed.y += wave;
        transformed.z += uTurn * uCurl * tw;
        transformed.y += -uPitch * tw * 0.40;
      `);
  };
  material.customProgramCacheKey = () => 'whaleBend_v1';
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

    // ── Main torso (MEATY barrel — full midsection, no thin-middle artifact) ─
    //
    // Radii are scaled with `scale` so the body's mass actually matches its
    // length budget; the previous profile used unscaled radii while the neck,
    // tail, and flippers all multiplied by `scale`, which left the trunk
    // looking pinched compared to the appendages. Profile shape: full barrel
    // with the widest girth in the back-mid (matches plesiosaur reference
    // illustrations), shoulder cap radius matches the neck base so the join
    // is seamless, trailing cap matches the tail base for the same reason.
    const NECK_BASE_R = 0.55 * scale;   // matches the neck tube's rBase below
    const TAIL_BASE_R = 0.85 * scale;   // matches the tail tube's rBase below
    const bodyProfile = [
      new THREE.Vector2(NECK_BASE_R,            +L * 0.180),  // shoulder cap (neck joins here)
      new THREE.Vector2(0.95 * scale,           +L * 0.155),
      new THREE.Vector2(1.55 * scale,           +L * 0.115),
      new THREE.Vector2(2.10 * scale,           +L * 0.060),
      new THREE.Vector2(2.55 * scale,           +L * 0.000),
      new THREE.Vector2(2.85 * scale,           -L * 0.060),  // approaching widest
      new THREE.Vector2(3.00 * scale,           -L * 0.115),  // ◀ WIDEST — full meaty belly
      new THREE.Vector2(2.95 * scale,           -L * 0.165),
      new THREE.Vector2(2.70 * scale,           -L * 0.205),
      new THREE.Vector2(2.25 * scale,           -L * 0.235),
      new THREE.Vector2(1.70 * scale,           -L * 0.258),
      new THREE.Vector2(1.20 * scale,           -L * 0.275),
      new THREE.Vector2(TAIL_BASE_R,            -L * 0.288),  // trailing cap (tail joins here)
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 32);
    bodyGeo.rotateZ(-Math.PI / 2);

    // Sculpting pass: gentler vertical squash than before (rounded barrel,
    // not turtle-flat), plus a midbody belly bulge so the underside hangs
    // a little — matches the reference illustration's "圧倒的な肉感".
    {
      const p = bodyGeo.attributes.position;
      // Body's local X spans approx [-L*0.18, +L*0.288]; midpoint ≈ +L*0.054
      const midX = (+L * 0.180 - L * 0.288) * 0.5 + L * 0.054;  // ≈ midline of belly
      const beltSigma = L * 0.18;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);

        // Frontness: 0 at tail-trailing, 1 at shoulder. Used to vary
        // cross-section subtly (chest a touch deeper than hips).
        const frontness = THREE.MathUtils.smoothstep(x, -L * 0.27, +L * 0.16);
        const yScale = THREE.MathUtils.lerp(0.92, 1.02, frontness);
        const zScale = THREE.MathUtils.lerp(1.02, 0.98, frontness);

        // Belly bulge — only pushes the underside down (y < 0)
        const beltZone = Math.exp(-Math.pow((x - midX) / beltSigma, 2));
        const yOffset  = (y < 0 ? beltZone * 0.45 * scale : 0);

        p.setY(i, y * yScale - yOffset);
        p.setZ(i, z * zScale);
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

    // ── Dorsal ridge — small bumps that actually sit on the body surface ──
    // The body's local-Y top edge varies along X (curve of the back). We
    // sample the lathe profile to place each bump exactly on the skin.
    const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x2a4658, roughness: 0.55, metalness: 0.06 });
    // Helper: linearly interp the body's top radius at a given X.
    // bodyProfile entries are (radius, Y_in_local) — after rotateZ(-PI/2) the
    // Y axis becomes the local X axis. Sample between the entries.
    function bodyTopAt(x) {
      // bodyProfile is sorted descending in Y (which becomes X after rotate)
      // — so the first entry is at largest X (+L*0.180), last at smallest (-L*0.288)
      let prev = bodyProfile[0], next = bodyProfile[bodyProfile.length - 1];
      for (let i = 1; i < bodyProfile.length; i++) {
        if (bodyProfile[i].y <= x) { next = bodyProfile[i]; prev = bodyProfile[i - 1]; break; }
      }
      const span = prev.y - next.y;
      const t = span > 1e-6 ? (prev.y - x) / span : 0;
      const r = THREE.MathUtils.lerp(prev.x, next.x, t);
      return r * 0.92;  // yScale used in the sculpting pass (chest≈1.02, hips≈0.92, average lower)
    }
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const x = THREE.MathUtils.lerp(-L * 0.22, +L * 0.14, t);
      const yTop = bodyTopAt(x);
      const bump = new THREE.Mesh(new THREE.ConeGeometry(0.10 * scale, 0.22 * scale, 7), ridgeMat);
      bump.position.set(x, yTop, 0);
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
// Blue whale procedural texture — high-res countershaded skin.
//
//   - Dorsal: slate / indigo with subtle bluer cast
//   - Ventral: warm pale gray-cream (true blue whales have a distinctly paler
//     belly with a soft mottled boundary, not a hard line)
//   - Heavy irregular mottle blotches both dark (above) and pale (below) plus
//     a "shoulder" band where the two zones meet
//   - Subtle longitudinal striations + scattered scarring streaks
//   - Faint barnacle / parasitic copepod patches near chin and flippers
// ─────────────────────────────────────────────────────────────────────────────
function makeBlueWhaleTexture() {
  const W = 2048, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // ── Base countershading: dark indigo dorsal → pale belly ─────────────────
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#0f1d2a');   // very dark dorsal
  grad.addColorStop(0.18, '#1a2e42');
  grad.addColorStop(0.42, '#3a536b');
  grad.addColorStop(0.62, '#7a8a9c');   // shoulder transition
  grad.addColorStop(0.82, '#b8c2cc');
  grad.addColorStop(1.00, '#d8dee4');   // pale ventral
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // ── Longitudinal hue shift: slightly bluer mid-flank ─────────────────────
  const hgrad = g.createLinearGradient(0, 0, W, 0);
  hgrad.addColorStop(0.0, 'rgba(18, 42, 72, 0.14)');
  hgrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.00)');
  hgrad.addColorStop(1.0, 'rgba(34, 60, 90, 0.10)');
  g.fillStyle = hgrad;
  g.fillRect(0, 0, W, H);

  addNoise(g, W, H, 14);

  // Helper: irregular soft blob with random oval distortion
  function blob(x, y, r, color, alpha) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0,    `rgba(${color}, ${alpha})`);
    rg.addColorStop(0.55, `rgba(${color}, ${alpha * 0.45})`);
    rg.addColorStop(1,    `rgba(${color}, 0)`);
    g.fillStyle = rg;
    g.save();
    g.translate(x, y);
    g.rotate(Math.random() * Math.PI);
    g.scale(0.6 + Math.random() * 0.7, 0.45 + Math.random() * 0.55);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // ── LARGE pale dorsal mottles (the signature look) ───────────────────────
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.55;          // dorsal half
    const r = 28 + Math.random() * 80;            // large irregular patches
    blob(x, y, r, '180, 198, 214', 0.22 + Math.random() * 0.20);
  }
  // Cluster of smaller pale spots layered on top
  for (let i = 0; i < 340; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.70;
    const r = 5 + Math.random() * 18;
    blob(x, y, r, '196, 212, 224', 0.18 + Math.random() * 0.28);
  }

  // ── DARK shoulder spots near the mid-flank transition ────────────────────
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * W;
    const y = H * (0.18 + Math.random() * 0.45);
    const r = 6 + Math.random() * 16;
    blob(x, y, r, '14, 24, 36', 0.22 + Math.random() * 0.32);
  }

  // ── Belly cream patches (warmer mottle on the ventral side) ──────────────
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * W;
    const y = H * (0.75 + Math.random() * 0.20);
    const r = 14 + Math.random() * 40;
    blob(x, y, r, '230, 226, 210', 0.18 + Math.random() * 0.22);
  }

  // ── Soft longitudinal striations along body length ───────────────────────
  g.globalAlpha = 0.08;
  g.strokeStyle = '#0a1622';
  for (let y = 0; y < H; y += 5) {
    g.lineWidth = 0.6 + Math.random() * 0.7;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const yy = y + Math.sin((x + y) * 0.045) * 1.4;
      if (x === 0) g.moveTo(x, yy);
      else         g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.globalAlpha = 1;

  // ── Scattered scarring streaks (longitudinal scratches) ──────────────────
  for (let i = 0; i < 24; i++) {
    const x0 = Math.random() * W;
    const y0 = H * (0.10 + Math.random() * 0.80);
    const len = 60 + Math.random() * 220;
    const angle = (Math.random() - 0.5) * 0.18;
    g.save();
    g.translate(x0, y0);
    g.rotate(angle);
    const sg = g.createLinearGradient(0, 0, len, 0);
    sg.addColorStop(0,   'rgba(230, 232, 240, 0)');
    sg.addColorStop(0.5, `rgba(230, 232, 240, ${0.15 + Math.random() * 0.20})`);
    sg.addColorStop(1,   'rgba(230, 232, 240, 0)');
    g.fillStyle = sg;
    g.fillRect(0, -0.6, len, 1.2);
    g.restore();
  }

  // ── Faint orangish barnacle / copepod clusters near the chin ─────────────
  for (let i = 0; i < 10; i++) {
    const x = W * (0.78 + Math.random() * 0.20);  // head end
    const y = H * (0.78 + Math.random() * 0.16);  // ventral
    const r = 6 + Math.random() * 12;
    blob(x, y, r, '162, 134, 92', 0.30 + Math.random() * 0.20);
  }

  // ── Tonal smoothing pass (subtle vignette to suppress hard texture seams)
  const vg = g.createRadialGradient(W * 0.5, H * 0.5, H * 0.4, W * 0.5, H * 0.5, H * 0.95);
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frilled shark procedural texture: very dark olive-brown with mottling and
// faint longitudinal stripes; pale cream specks along the underside.
// ─────────────────────────────────────────────────────────────────────────────
function makeFrilledSharkTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#1d160e');
  grad.addColorStop(0.40, '#2b2117');
  grad.addColorStop(0.75, '#3a2d1f');
  grad.addColorStop(1.00, '#4a3a28');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  addNoise(g, W, H, 26);

  // Irregular dark blotches
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 6 + Math.random() * 30;
    const a = 0.18 + Math.random() * 0.30;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(8, 6, 4, ${a})`);
    rg.addColorStop(1, `rgba(8, 6, 4, 0)`);
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(x, y, r * (0.7 + Math.random() * 0.5), r * (0.5 + Math.random() * 0.4),
              Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  // Faint longitudinal striping
  g.globalAlpha = 0.10;
  g.strokeStyle = '#0a0604';
  for (let y = 0; y < H; y += 6) {
    g.lineWidth = 0.6 + Math.random() * 0.6;
    g.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const yy = y + Math.sin((x + y) * 0.06) * 1.0;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.globalAlpha = 1;

  // Cream specks (counter-shading along the belly)
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * W;
    const y = H * (0.7 + Math.random() * 0.3);
    const r = 1.2 + Math.random() * 1.8;
    g.fillStyle = `rgba(220, 200, 160, ${0.12 + Math.random() * 0.18})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ammonite shell texture: alternating warm tan and dark brown bands with
// pearly highlights and organic speckle.
// ─────────────────────────────────────────────────────────────────────────────
function makeAmmoniteShellTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#705036');
  grad.addColorStop(0.50, '#a07349');
  grad.addColorStop(1.00, '#cba98a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Wide alternating bands of cream + dark brown
  for (let i = 0; i < 22; i++) {
    const x = (i / 22) * W;
    const bw = (Math.random() * 0.6 + 0.4) * (W / 22);
    g.fillStyle = i % 2 === 0
      ? `rgba(50, 32, 18, ${0.22 + Math.random() * 0.18})`
      : `rgba(245, 230, 200, ${0.18 + Math.random() * 0.18})`;
    g.fillRect(x, 0, bw, H);
  }

  addNoise(g, W, H, 22);

  // Pearly highlight streaks
  g.globalAlpha = 0.20;
  g.strokeStyle = '#fff6d8';
  for (let i = 0; i < 48; i++) {
    const x = Math.random() * W;
    g.lineWidth = 0.4 + Math.random() * 1.2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (Math.random() - 0.5) * 22, H);
    g.stroke();
  }
  g.globalAlpha = 1;

  // Organic speckles
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 0.4 + Math.random() * 1.8;
    g.fillStyle = `rgba(${20 + Math.random() * 40 | 0}, ${10 + Math.random() * 25 | 0}, ${5 + Math.random() * 15 | 0}, ${0.30 + Math.random() * 0.30})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// シロナガスクジラ / Blue whale — the largest animal on Earth (CHUNKY build)
//
// Major upgrade over the previous pass — the body is now properly proportioned
// (≈3.5:1 length-to-girth like a real blue whale), scaled to match the apex
// silhouette of Futabasaurus, and given a fuller PBR / sculpt pipeline.
//
//  - Length scaled with `scale` AND radii independently scaled by a chunky
//    radial multiplier (RM), giving a body diameter ~1/3 of the length —
//    the iconic torpedo bulk that the previous build was missing
//  - Lathe profile re-sculpted: short pointed rostrum, broad shoulders
//    just behind the head, fat barrel torso, sharply tapered caudal peduncle
//  - Carved throat pleats on the fattened belly (sin pattern across the
//    ventral arc), tapered along the throat length, much DEEPER than before
//  - Dorsal splash hump along the rostrum centerline, more pronounced
//  - Caudal keel pinched into the peduncle
//  - 22 paired tubercles along the upper lip, scaled to the new body
//  - U-shaped mouth seam (two mirrored tube curves + chin seam) sized to
//    the broader rostrum, with 18 visible baleen plates inside the jaw
//  - Big crescent splashguard in front of paired raised blowholes
//  - 4-layer eye (socket + sclera + iris + pupil) sized up for visibility
//  - Massively enlarged pectoral flippers (extruded + beveled bezier blade)
//  - Falcate dorsal fin + thick beveled fluke with up-curled tips
//  - Caudal peduncle lateral ridges along the keel
// ─────────────────────────────────────────────────────────────────────────────

export class BlueWhale extends Creature {
  constructor(opts = {}) {
    const scale = opts.scale ?? 1.0;
    const L     = 22.0 * scale;                 // total nose-to-tail length
    const RM    = 5.0  * scale;                 // radial multiplier — CHUNKY
    const group = new THREE.Group();
    const uniforms = makeBendUniforms({ length: L, amp: 0.15, freq: 0.24, tailW: 1.55, curl: 0.55 });

    // ── Body lathe — radii multiplied by RM for fat-bodied proportions ────
    // The shoulder peak sits at radius 0.620 * RM. With scale=5 → RM=25,
    // that is a body radius of ~15.5 units (diameter 31), against a 110-unit
    // length → realistic blue-whale 3.5:1 ratio.
    const bodyProfile = [
      new THREE.Vector2(0.008 * RM, +L * 0.502),
      new THREE.Vector2(0.028 * RM, +L * 0.495),
      new THREE.Vector2(0.058 * RM, +L * 0.475),
      new THREE.Vector2(0.098 * RM, +L * 0.450),
      new THREE.Vector2(0.150 * RM, +L * 0.420),
      new THREE.Vector2(0.222 * RM, +L * 0.378),
      new THREE.Vector2(0.310 * RM, +L * 0.318),
      new THREE.Vector2(0.402 * RM, +L * 0.250),
      new THREE.Vector2(0.490 * RM, +L * 0.170),
      new THREE.Vector2(0.560 * RM, +L * 0.080),
      new THREE.Vector2(0.605 * RM, -L * 0.005),
      new THREE.Vector2(0.620 * RM, -L * 0.085),   // shoulder peak (widest)
      new THREE.Vector2(0.612 * RM, -L * 0.165),
      new THREE.Vector2(0.585 * RM, -L * 0.235),
      new THREE.Vector2(0.548 * RM, -L * 0.300),
      new THREE.Vector2(0.498 * RM, -L * 0.355),
      new THREE.Vector2(0.430 * RM, -L * 0.405),
      new THREE.Vector2(0.348 * RM, -L * 0.444),
      new THREE.Vector2(0.260 * RM, -L * 0.471),
      new THREE.Vector2(0.175 * RM, -L * 0.488),
      new THREE.Vector2(0.095 * RM, -L * 0.498),
      new THREE.Vector2(0.020 * RM, -L * 0.502),
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 56);
    bodyGeo.rotateZ(-Math.PI / 2);

    // ── Vertex sculpting pass ─────────────────────────────────────────────
    {
      const p = bodyGeo.attributes.position;
      const PLEAT_COUNT = 44;
      const PLEAT_DEPTH = 0.052 * RM;             // visibly carved grooves
      const PLEAT_X0    = +L * 0.36;              // forward (near chin)
      const PLEAT_X1    = -L * 0.05;              // rear (near pectorals)
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        let   y = p.getY(i);
        let   z = p.getZ(i);

        // (a) Rostrum top flatten + softer U-shape underside
        const headness = THREE.MathUtils.smoothstep(x, L * 0.10, L * 0.42);
        if (y > 0) y *= THREE.MathUtils.lerp(1.00, 0.56, headness);
        else        y *= THREE.MathUtils.lerp(1.00, 0.80, headness);

        // (b) Caudal peduncle pinch + keel sharpening
        const tailness = THREE.MathUtils.smoothstep(-x, L * 0.30, L * 0.48);
        if (tailness > 0) {
          z *= THREE.MathUtils.lerp(1.00, 0.50, tailness);
          y *= THREE.MathUtils.lerp(1.00, 0.90, tailness);
          y += Math.sign(y) * 0.06 * RM * tailness;
        }

        // (c) Throat pleats carved into the belly arc
        const inThroat = (x < PLEAT_X0 && x > PLEAT_X1);
        if (inThroat && y < 0) {
          const ang = Math.atan2(z, -y);              // 0 at bottom, ±π/2 sides
          const sideFade = Math.cos(ang);             // 1 bottom → 0 sides
          if (sideFade > 0) {
            const groove = Math.sin(ang * PLEAT_COUNT);
            const arc = Math.sqrt(y * y + z * z);
            if (arc > 1e-4) {
              const along = (x - PLEAT_X1) / (PLEAT_X0 - PLEAT_X1);
              const taper = Math.sin(Math.PI * along);
              const d = PLEAT_DEPTH * groove * sideFade * taper * (0.55 + 0.45 * sideFade * sideFade);
              y += (-y / arc) * d;
              z += ( z / arc) * d * 0.22;
            }
          }
        }

        // (d) Dorsal splash hump along the rostrum centerline
        if (y > 0 && Math.abs(z) < 0.20 * RM && x > L * 0.20 && x < L * 0.46) {
          const hump = Math.sin(THREE.MathUtils.smoothstep(x, L * 0.20, L * 0.46) * Math.PI);
          y += 0.030 * RM * hump;
        }

        p.setXYZ(i, x, y, z);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyTex = makeBlueWhaleTexture();
    const bodyMat = injectWhaleBend(new THREE.MeshPhysicalMaterial({
      color:              0xffffff,
      map:                bodyTex,
      roughness:          0.50,
      metalness:          0.06,
      clearcoat:          0.70,
      clearcoatRoughness: 0.26,
      emissive:           new THREE.Color(0x050a14),
      emissiveIntensity:  0.22,
    }), uniforms);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ── Pleat accent stripes inside the carved grooves ────────────────────
    {
      const pleatAccentMat = injectWhaleBend(new THREE.MeshStandardMaterial({
        color: 0x0c121b, roughness: 0.85, metalness: 0.04,
        emissive: new THREE.Color(0x04060c), emissiveIntensity: 0.16,
      }), uniforms);
      const PAC = 20;                              // accent grooves
      const PX0 = +L * 0.35, PX1 = -L * 0.04;
      // Body radius along the belly midline at the throat (interpolated)
      const beltR = 0.50 * RM;
      for (let i = 0; i < PAC; i++) {
        const t = i / (PAC - 1);
        const ang = (t - 0.5) * Math.PI * 0.74;    // sweep across belly arc
        const groove = new THREE.Mesh(
          new THREE.CylinderGeometry(0.040 * scale, 0.040 * scale, (PX0 - PX1) * 0.96, 4, 1),
          pleatAccentMat,
        );
        groove.rotation.z = Math.PI / 2;
        // Place each accent at the lowered radius (inside the carved groove)
        const yOff = -Math.cos(ang) * beltR * 0.96;
        const zOff =  Math.sin(ang) * beltR * 0.66;
        groove.position.set((PX0 + PX1) * 0.5, yOff, zOff);
        group.add(groove);
      }
    }

    // ── U-shaped mouth seam built from two mirrored TubeGeometry curves ──
    const seamMat = injectWhaleBend(new THREE.MeshStandardMaterial({
      color: 0x07090f, roughness: 0.88, metalness: 0.04,
      emissive: new THREE.Color(0x080c14), emissiveIntensity: 0.10,
    }), uniforms);
    {
      const seamPts = [];
      const SEG = 36;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const x = THREE.MathUtils.lerp(+L * 0.05, +L * 0.46, t);
        const headness = THREE.MathUtils.smoothstep(x, +L * 0.18, +L * 0.42);
        const y = -L * (0.022 + 0.075 * headness);
        seamPts.push(new THREE.Vector3(x, y, 0));
      }
      const seamCurve = new THREE.CatmullRomCurve3(seamPts, false);
      const seamGeo = new THREE.TubeGeometry(seamCurve, 64, 0.055 * scale, 6, false);
      const seamWidth = 0.40 * RM;
      const seamL = new THREE.Mesh(seamGeo, seamMat);
      seamL.position.z = +seamWidth;
      group.add(seamL);
      const seamR = new THREE.Mesh(seamGeo, seamMat);
      seamR.position.z = -seamWidth;
      group.add(seamR);

      // Chin seam — the lower mandible's leading edge
      const chinGeo = new THREE.TubeGeometry(seamCurve, 64, 0.040 * scale, 6, false);
      const chin = new THREE.Mesh(chinGeo, seamMat);
      chin.position.set(0, -L * 0.025, 0);
      group.add(chin);
    }

    // ── Baleen plates: 18 dark sheets inside the upper jaw ────────────────
    {
      const baleenMat = injectWhaleBend(new THREE.MeshStandardMaterial({
        color: 0x101724, roughness: 0.60, metalness: 0.10,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0x07091a), emissiveIntensity: 0.18,
      }), uniforms);
      const PLATES = 22;
      for (let i = 0; i < PLATES; i++) {
        const t = i / (PLATES - 1);
        const x = THREE.MathUtils.lerp(+L * 0.10, +L * 0.44, t);
        const w = 0.46 * RM * Math.sin(THREE.MathUtils.smoothstep(t, 0.0, 0.7) * Math.PI);
        const plate = new THREE.Mesh(
          new THREE.PlaneGeometry(0.020 * scale, w * 0.5),
          baleenMat,
        );
        plate.rotation.y = Math.PI / 2;
        plate.position.set(x, -L * 0.040 + w * 0.04, 0);
        group.add(plate);
      }
    }

    // ── Tubercles along the upper lip ─────────────────────────────────────
    {
      const tubMat = new THREE.MeshStandardMaterial({
        color: 0x141c26, roughness: 0.62, metalness: 0.08,
        emissive: new THREE.Color(0x04080c), emissiveIntensity: 0.18,
      });
      const TUB = 24;
      for (let i = 0; i < TUB; i++) {
        const t = i / (TUB - 1);
        const x = THREE.MathUtils.lerp(+L * 0.18, +L * 0.46, t);
        const r = 0.080 * scale * (0.7 + Math.random() * 0.5);
        // z position roughly tracks the body radius at this x (linear approx)
        const bodyRadAtX = THREE.MathUtils.lerp(0.490 * RM, 0.115 * RM, t);
        const zBase = bodyRadAtX * 0.78;
        for (const side of [-1, 1]) {
          const tub = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), tubMat);
          const y = -L * 0.016 + 0.04 * scale * (0.5 + Math.random() * 0.5);
          tub.position.set(x, y, zBase * side);
          tub.scale.setScalar(0.85 + Math.random() * 0.5);
          group.add(tub);
        }
      }
    }

    // ── Splash-guard ridge atop the rostrum ───────────────────────────────
    {
      const ridgePts = [
        new THREE.Vector3(+L * 0.04, +L * 0.020, 0),
        new THREE.Vector3(+L * 0.16, +L * 0.040, 0),
        new THREE.Vector3(+L * 0.28, +L * 0.058, 0),
        new THREE.Vector3(+L * 0.36, +L * 0.065, 0),
        new THREE.Vector3(+L * 0.42, +L * 0.058, 0),
        new THREE.Vector3(+L * 0.46, +L * 0.042, 0),
      ];
      const ridgeCurve = new THREE.CatmullRomCurve3(ridgePts);
      const ridgeGeo = new THREE.TubeGeometry(ridgeCurve, 48, 0.090 * scale, 10, false);
      const ridgeMat = injectWhaleBend(new THREE.MeshPhysicalMaterial({
        color: 0x2a3848, roughness: 0.55, metalness: 0.06,
        clearcoat: 0.55, clearcoatRoughness: 0.32,
        emissive: new THREE.Color(0x04080c), emissiveIntensity: 0.18,
      }), uniforms);
      group.add(new THREE.Mesh(ridgeGeo, ridgeMat));
    }

    // ── Blowhole assembly: raised splashguard + paired vents ──────────────
    {
      const sgPts = [];
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        const a = -Math.PI * 0.5 + t * Math.PI;
        sgPts.push(new THREE.Vector3(
          +L * 0.252 + Math.sin(a) * 0.020 * L,
          +L * 0.072 + Math.cos(a) * 0.010 * L,
          Math.sin(a) * 0.045 * L,
        ));
      }
      const sgCurve = new THREE.CatmullRomCurve3(sgPts);
      const sgGeo = new THREE.TubeGeometry(sgCurve, 40, 0.06 * scale, 8, false);
      const sgMat = injectWhaleBend(new THREE.MeshStandardMaterial({
        color: 0x223044, roughness: 0.55, metalness: 0.08,
        emissive: new THREE.Color(0x04080c), emissiveIntensity: 0.15,
      }), uniforms);
      group.add(new THREE.Mesh(sgGeo, sgMat));

      const blowMat = injectWhaleBend(new THREE.MeshStandardMaterial({
        color: 0x030608, roughness: 0.95,
      }), uniforms);
      for (const side of [-1, 1]) {
        const bh = new THREE.Mesh(
          new THREE.SphereGeometry(0.10 * scale, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
          blowMat,
        );
        bh.scale.set(1.5, 0.42, 1.0);
        bh.position.set(+L * 0.296, +L * 0.066, 0.026 * L * side);
        group.add(bh);
      }
    }

    // ── Eyes (socket + sclera + iris + pupil) ─────────────────────────────
    {
      const socketMat = injectWhaleBend(new THREE.MeshStandardMaterial({
        color: 0x10171f, roughness: 0.75, metalness: 0.04,
        emissive: new THREE.Color(0x05080c), emissiveIntensity: 0.18,
      }), uniforms);
      const scleraMat = new THREE.MeshPhysicalMaterial({
        color: 0xc8b48c, roughness: 0.40, metalness: 0.10,
        clearcoat: 0.95, clearcoatRoughness: 0.08,
        emissive: new THREE.Color(0x40320c), emissiveIntensity: 0.20,
      });
      const irisMat = new THREE.MeshPhysicalMaterial({
        color: 0x382014, roughness: 0.28, metalness: 0.15,
        clearcoat: 1.0, clearcoatRoughness: 0.06,
        emissive: new THREE.Color(0x1a0c04), emissiveIntensity: 0.10,
      });
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x010102 });
      for (const side of [-1, 1]) {
        // Eye sits just behind the corner of the mouth, on the side of the head
        const ex = +L * 0.20;
        const ey = -L * 0.035;
        const ez = 0.42 * RM * side;        // outside the body — on the side wall
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 16, 12), socketMat);
        socket.position.set(ex, ey, ez);
        socket.scale.set(1.15, 0.95, 0.85);
        group.add(socket);
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.21 * scale, 18, 14), scleraMat);
        e.position.set(ex + 0.025 * scale, ey, ez + 0.05 * scale * side);
        group.add(e);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.115 * scale, 16, 12), irisMat);
        iris.position.set(ex + 0.05 * scale, ey, ez + 0.10 * scale * side);
        group.add(iris);
        const pup = new THREE.Mesh(new THREE.SphereGeometry(0.055 * scale, 12, 10), pupilMat);
        pup.position.set(ex + 0.065 * scale, ey, ez + 0.12 * scale * side);
        group.add(pup);
      }
    }

    // ── Pectoral flippers (massively enlarged, extruded + beveled) ───────
    const flipMat = injectWhaleBend(new THREE.MeshPhysicalMaterial({
      color: 0x1a2a3c, roughness: 0.50, metalness: 0.10,
      clearcoat: 0.60, clearcoatRoughness: 0.30,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x05080c), emissiveIntensity: 0.22,
    }), uniforms);
    const flippers = [];
    for (const side of [-1, 1]) {
      const s = new THREE.Shape();
      s.moveTo(0.25, 0);
      s.bezierCurveTo(-0.20, 0.50, -1.30, 0.44, -2.40, 0.26);
      s.bezierCurveTo(-3.10, 0.10, -3.40, -0.02, -3.28, -0.08);
      s.bezierCurveTo(-2.95, -0.22, -2.10, -0.36, -1.30, -0.38);
      s.bezierCurveTo(-0.60, -0.36, -0.05, -0.22, 0.25, 0);
      const fgeo = new THREE.ExtrudeGeometry(s, {
        depth: 0.13,
        bevelEnabled: true,
        bevelSize: 0.055,
        bevelThickness: 0.040,
        bevelSegments: 3,
        steps: 1,
      });
      fgeo.center();
      // Scale to match the new chunky body
      fgeo.scale(scale * 2.6, scale * 2.6, scale * 2.6);
      const flip = new THREE.Mesh(fgeo, flipMat);
      // Sit on the lower side of the body, just behind the head
      flip.position.set(-L * 0.08, -L * 0.05, 0.48 * RM * side);
      flip.rotation.set(
        side > 0 ? -1.05 : 1.05,
        side > 0 ? -0.40 : 0.40,
        side > 0 ? -0.28 : 0.28,
      );
      flip.userData.baseRot = flip.rotation.clone();
      flip.userData.phase = side * 0.8;
      flip.castShadow = !!opts.castShadow;
      flippers.push(flip);
      group.add(flip);
    }

    // ── Dorsal fin (small falcate hook, set very far back) ───────────────
    {
      const s = new THREE.Shape();
      s.moveTo(0.60, 0);
      s.bezierCurveTo(0.30, 1.10, -0.20, 1.20, -0.78, 0.85);
      s.bezierCurveTo(-0.55, 0.55, -0.55, 0.30, -0.78, 0.06);
      s.bezierCurveTo(-0.50, 0.0, 0.15, 0.0, 0.60, 0);
      const dgeo = new THREE.ExtrudeGeometry(s, {
        depth: 0.13,
        bevelEnabled: true,
        bevelSize: 0.050,
        bevelThickness: 0.035,
        bevelSegments: 3,
        steps: 1,
      });
      dgeo.center();
      dgeo.scale(scale * 1.05, scale * 1.05, scale * 1.05);
      dgeo.translate(-L * 0.315, +L * 0.060, 0);
      const dorsalMat = injectWhaleBend(new THREE.MeshPhysicalMaterial({
        color: 0x1a2a3c, roughness: 0.55, metalness: 0.10,
        clearcoat: 0.60, clearcoatRoughness: 0.30,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0x05080c), emissiveIntensity: 0.22,
      }), uniforms);
      const dorsal = new THREE.Mesh(dgeo, dorsalMat);
      dorsal.castShadow = !!opts.castShadow;
      group.add(dorsal);
    }

    // ── Fluke (huge, thick, beveled, with up-curled tips and notch) ──────
    {
      const s = new THREE.Shape();
      const HW = 0.22 * L, FL = 0.115 * L;
      s.moveTo(0.012 * L, 0);
      s.bezierCurveTo(-FL * 0.18, HW * 0.22, -FL * 0.45, HW * 0.98, -FL * 0.62, HW * 1.05);
      s.bezierCurveTo(-FL * 0.88, HW * 1.12, -FL * 1.06, HW * 0.86, -FL * 1.10, HW * 0.78);
      s.bezierCurveTo(-FL * 0.95, HW * 0.40, -FL * 0.65, HW * 0.15, -FL * 0.40, HW * 0.10);
      s.bezierCurveTo(-FL * 0.50, HW * 0.04, -FL * 0.56, -HW * 0.04, -FL * 0.40, -HW * 0.10);
      s.bezierCurveTo(-FL * 0.65, -HW * 0.15, -FL * 0.95, -HW * 0.40, -FL * 1.10, -HW * 0.78);
      s.bezierCurveTo(-FL * 1.06, -HW * 0.86, -FL * 0.88, -HW * 1.12, -FL * 0.62, -HW * 1.05);
      s.bezierCurveTo(-FL * 0.45, -HW * 0.98, -FL * 0.18, -HW * 0.22, 0.012 * L, 0);
      const fgeo = new THREE.ExtrudeGeometry(s, {
        depth: 0.062 * L,
        bevelEnabled: true,
        bevelSize: 0.022 * L,
        bevelThickness: 0.014 * L,
        bevelSegments: 4,
        steps: 1,
      });
      fgeo.translate(0, 0, -0.031 * L);
      // Up-curl the tips slightly + tilt trailing edge
      {
        const p = fgeo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          const y = p.getY(i);
          const tipness = Math.max(0, (Math.abs(y) - HW * 0.5) / (HW * 0.6));
          if (tipness > 0) p.setZ(i, p.getZ(i) + tipness * tipness * 0.050 * L);
          const trailness = Math.max(0, -x / FL);
          p.setZ(i, p.getZ(i) - trailness * 0.010 * L);
        }
        fgeo.computeVertexNormals();
      }
      fgeo.rotateX(-Math.PI / 2);
      fgeo.translate(-L * 0.46, 0, 0);
      const flukeMat = injectWhaleBend(new THREE.MeshPhysicalMaterial({
        color: 0x18283a, roughness: 0.50, metalness: 0.10,
        clearcoat: 0.65, clearcoatRoughness: 0.24,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0x05080c), emissiveIntensity: 0.22,
      }), uniforms);
      const fluke = new THREE.Mesh(fgeo, flukeMat);
      fluke.castShadow = !!opts.castShadow;
      group.add(fluke);
    }

    // ── Caudal peduncle lateral ridges (sharp keel) ──────────────────────
    {
      const ridgeMat = injectWhaleBend(new THREE.MeshStandardMaterial({
        color: 0x152130, roughness: 0.55, metalness: 0.06,
        emissive: new THREE.Color(0x05080c), emissiveIntensity: 0.15,
      }), uniforms);
      const RX0 = -L * 0.25;
      const RX1 = -L * 0.45;
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const x = THREE.MathUtils.lerp(RX0, RX1, t);
        pts.push(new THREE.Vector3(x, 0, 0));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      for (const yOff of [+L * 0.044, -L * 0.044]) {
        const geo = new THREE.TubeGeometry(curve, 28, 0.030 * scale, 6, false);
        const r = new THREE.Mesh(geo, ridgeMat);
        r.position.y = yOff;
        group.add(r);
      }
    }

    super({
      species: 'bluewhale',
      mesh: group,
      position: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxX * 0.45),
        THREE.MathUtils.randFloat(0, GIANT_TANK.maxY - 14),
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxZ * 0.45),
      ),
      cfg: {
        speed: 5.0, maxAccel: 0.55, turnRate: 0.24,
        depthMin: GIANT_TANK.floorY + 22,
        depthMax: GIANT_TANK.maxY - 8,
        wanderMin: 26, wanderMax: 40,
        wallMargin: 42,
        bounds: GIANT_TANK,
        facesVelocity: true,
      },
    });

    this._uniforms = uniforms;
    this._flippers = flippers;
    this._pitchTarget = 0;
    this._breathePhase = Math.random() * Math.PI * 2;
  }

  onPickTarget(target) {
    // Upper-mid water column for an apex pelagic cruise
    target.y = THREE.MathUtils.randFloat(
      THREE.MathUtils.lerp(this.cfg.depthMin, this.cfg.depthMax, 0.45),
      this.cfg.depthMax - 5,
    );
  }

  onUpdate(dt, time) {
    this._uniforms.uTime.value = time;
    this._uniforms.uTurn.value = this.turnSignal;

    const targetPitch = THREE.MathUtils.clamp(this.vel.y / Math.max(this.cfg.speed, 0.01), -0.50, 0.50);
    this._pitchTarget = THREE.MathUtils.lerp(this._pitchTarget, targetPitch, Math.min(1, dt * 0.45));
    this._uniforms.uPitch.value = this._pitchTarget;

    this._uniforms.uFreq.value = 0.16 + 0.22 * this.speedNorm;
    this._uniforms.uAmp.value  = 0.15 + 0.09 * this.speedNorm;

    const rollTarget = -this.turnSignal * 0.10;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, rollTarget, Math.min(1, dt * 1.1));
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, this._pitchTarget * 0.18, Math.min(1, dt * 1.3));

    for (const f of this._flippers) {
      const w = Math.sin(time * 0.30 + f.userData.phase);
      const b = f.userData.baseRot;
      f.rotation.x = b.x + w * 0.16;
      f.rotation.y = b.y + w * 0.05;
    }

    // Subtle breathing vertical drift
    const breathe = Math.sin(time * 0.16 + this._breathePhase) * 0.06;
    this.vel.y += breathe * dt;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ラブカ / Frilled shark — "living fossil" deep-sea shark
// ─────────────────────────────────────────────────────────────────────────────

export class FrilledShark extends Creature {
  constructor(opts = {}) {
    const scale = opts.scale ?? 1.0;
    const L     = 8.0 * scale;
    const group = new THREE.Group();
    const uniforms = makeBendUniforms({
      length: L,
      amp: 0.32, freq: 0.55,
      tailW: 0.75,        // < 1 → wave spreads across the entire body (eel-like)
      curl: 0.50,
    });

    // ── Body lathe — slender, nearly uniform tube ─────────────────────────
    const bodyProfile = [
      new THREE.Vector2(0.008, +L * 0.502),
      new THREE.Vector2(0.060, +L * 0.470),
      new THREE.Vector2(0.130, +L * 0.380),
      new THREE.Vector2(0.190, +L * 0.260),
      new THREE.Vector2(0.225, +L * 0.120),
      new THREE.Vector2(0.235, -L * 0.030),
      new THREE.Vector2(0.232, -L * 0.140),
      new THREE.Vector2(0.225, -L * 0.260),
      new THREE.Vector2(0.220, -L * 0.355),
      new THREE.Vector2(0.215, -L * 0.420),
      new THREE.Vector2(0.190, -L * 0.460),
      new THREE.Vector2(0.150, -L * 0.485),
      new THREE.Vector2(0.090, -L * 0.498),
      new THREE.Vector2(0.012, -L * 0.502),
    ];
    const bodyGeo = new THREE.LatheGeometry(bodyProfile, 22);
    bodyGeo.rotateZ(-Math.PI / 2);
    // Slight lateral flattening — eel cross-section is taller than wide
    {
      const p = bodyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setY(i, p.getY(i) * 1.16);
        p.setZ(i, p.getZ(i) * 0.86);
      }
      bodyGeo.computeVertexNormals();
    }

    const bodyTex = makeFrilledSharkTexture();
    const bodyMat = injectBend(new THREE.MeshPhysicalMaterial({
      color:              0xffffff,
      map:                bodyTex,
      roughness:          0.62,
      metalness:          0.12,
      clearcoat:          0.30,
      clearcoatRoughness: 0.45,
      emissive:           new THREE.Color(0x080604),
      emissiveIntensity:  0.30,
    }), uniforms);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = !!opts.castShadow;
    group.add(body);

    // ── Six pairs of frilly gill rings around the front body ─────────────
    const gillMat = injectBend(new THREE.MeshStandardMaterial({
      color: 0x9a8266, roughness: 0.45, metalness: 0.12,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x1a1208), emissiveIntensity: 0.40,
    }), uniforms);
    const darkGillMat = injectBend(new THREE.MeshStandardMaterial({
      color: 0x1a1006, roughness: 0.7, side: THREE.DoubleSide,
    }), uniforms);
    // Approximate the body radius at a given x by sampling the lathe profile
    const sampleR = (x) => {
      for (let i = 0; i < bodyProfile.length - 1; i++) {
        const a = bodyProfile[i], b = bodyProfile[i + 1];
        const ax = a.y, bx = b.y;
        if ((ax <= x && bx >= x) || (bx <= x && ax >= x)) {
          const t = (x - ax) / (bx - ax || 1e-6);
          return THREE.MathUtils.lerp(a.x, b.x, t);
        }
      }
      return 0.10;
    };
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const x = THREE.MathUtils.lerp(+L * 0.40, +L * 0.18, t);
      const bodyR = sampleR(x) + 0.020 * scale;
      const frillR = bodyR + 0.055 * scale;

      const shp = new THREE.Shape();
      const segs = 40;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const ruffle = 1 + Math.sin(a * 12) * 0.05;
        const r = frillR * ruffle;
        if (s === 0) shp.moveTo(r * Math.cos(a), r * Math.sin(a));
        else         shp.lineTo(r * Math.cos(a), r * Math.sin(a));
      }
      const hole = new THREE.Path();
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const r = bodyR * 0.92;
        if (s === 0) hole.moveTo(r * Math.cos(a), r * Math.sin(a));
        else         hole.lineTo(r * Math.cos(a), r * Math.sin(a));
      }
      shp.holes.push(hole);
      const ringGeo = new THREE.ShapeGeometry(shp, 1);
      ringGeo.rotateY(Math.PI / 2);
      ringGeo.translate(x, 0, 0);
      group.add(new THREE.Mesh(ringGeo, gillMat));

      // Dark slit just behind each frill
      const slit = new THREE.Mesh(
        new THREE.TorusGeometry(bodyR * 0.96, 0.014 * scale, 6, 30),
        darkGillMat,
      );
      slit.rotation.y = Math.PI / 2;
      slit.position.set(x - 0.018 * scale, 0, 0);
      group.add(slit);
    }

    // ── Continuous dorsal+caudal ribbon along the back third ──────────────
    const ribbonMat = injectBend(new THREE.MeshStandardMaterial({
      color: 0x2c2218, roughness: 0.6, metalness: 0.06,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x0a0604), emissiveIntensity: 0.30,
    }), uniforms);
    {
      const s = new THREE.Shape();
      const x0 = +L * 0.05, x1 = -L * 0.50;
      const segs = 28;
      s.moveTo(x0, 0);
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const x = THREE.MathUtils.lerp(x0, x1, t);
        const peak = Math.pow(t, 1.7);
        s.lineTo(x, (0.04 + 0.42 * peak) * scale);
      }
      s.lineTo(x1, 0);
      for (let i = segs; i >= 0; i--) {
        const t = i / segs;
        const x = THREE.MathUtils.lerp(x0, x1, t);
        s.lineTo(x, -0.02 * scale);
      }
      group.add(new THREE.Mesh(new THREE.ShapeGeometry(s, 2), ribbonMat));
    }
    {
      const s = new THREE.Shape();
      const x0 = -L * 0.05, x1 = -L * 0.49;
      const segs = 22;
      s.moveTo(x0, 0);
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const x = THREE.MathUtils.lerp(x0, x1, t);
        const peak = Math.pow(t, 1.6);
        s.lineTo(x, -(0.03 + 0.32 * peak) * scale);
      }
      s.lineTo(x1, 0);
      for (let i = segs; i >= 0; i--) {
        const t = i / segs;
        const x = THREE.MathUtils.lerp(x0, x1, t);
        s.lineTo(x, 0.02 * scale);
      }
      group.add(new THREE.Mesh(new THREE.ShapeGeometry(s, 2), ribbonMat));
    }

    // ── Small pectoral fins ───────────────────────────────────────────────
    const pecMat = injectBend(new THREE.MeshStandardMaterial({
      color: 0x3a2e20, roughness: 0.6, side: THREE.DoubleSide,
      emissive: new THREE.Color(0x0a0604), emissiveIntensity: 0.25,
    }), uniforms);
    const pectorals = [];
    for (const side of [-1, 1]) {
      const sp = new THREE.Shape();
      sp.moveTo(0.10, 0);
      sp.quadraticCurveTo(-0.05, 0.04, -0.35, 0.04);
      sp.quadraticCurveTo(-0.55, 0, -0.30, -0.05);
      sp.quadraticCurveTo(-0.05, -0.04, 0.10, 0);
      const pgeo = new THREE.ShapeGeometry(sp, 4);
      pgeo.scale(scale * 1.2, scale * 1.2, scale * 1.2);
      pgeo.translate(+L * 0.13, 0, 0);
      const pec = new THREE.Mesh(pgeo, pecMat);
      pec.position.set(0, -0.12 * scale, 0.22 * scale * side);
      pec.rotation.set(side > 0 ? -1.05 : 1.05, side > 0 ? -0.4 : 0.4, 0);
      pec.userData.baseRotZ = pec.rotation.z;
      pec.userData.phase = side * 0.9;
      pectorals.push(pec);
      group.add(pec);
    }

    // ── Cavity for the gaping terminal mouth ──────────────────────────────
    const mouthGeo = new THREE.SphereGeometry(0.18 * scale, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    mouthGeo.rotateZ(Math.PI / 2);
    mouthGeo.scale(1.6, 0.7, 1.0);
    mouthGeo.translate(+L * 0.46, -0.02, 0);
    group.add(new THREE.Mesh(mouthGeo, new THREE.MeshStandardMaterial({
      color: 0x080404, roughness: 0.9, side: THREE.BackSide,
      emissive: new THREE.Color(0x100806), emissiveIntensity: 0.12,
    })));

    // ── Trident teeth (two rows along the jaw) ────────────────────────────
    const toothMat = new THREE.MeshPhysicalMaterial({
      color: 0xf2eadc, roughness: 0.25, metalness: 0.12,
      clearcoat: 0.95, clearcoatRoughness: 0.05,
      emissive: new THREE.Color(0xaaa080), emissiveIntensity: 0.18,
    });
    const toothGeo = new THREE.ConeGeometry(0.018 * scale, 0.08 * scale, 4);
    toothGeo.translate(0, -0.04 * scale, 0);
    for (let i = 0; i < 34; i++) {
      const t = i / 33;
      const ang = THREE.MathUtils.lerp(-1.15, 1.15, t);
      const r = 0.135 * scale;
      const upper = new THREE.Mesh(toothGeo, toothMat);
      upper.position.set(+L * 0.44, 0.025 * scale, Math.sin(ang) * r);
      upper.rotation.x = Math.cos(ang) * 0.6;
      upper.rotation.z = -0.20;
      group.add(upper);
      const lower = new THREE.Mesh(toothGeo, toothMat);
      lower.position.set(+L * 0.44, -0.07 * scale, Math.sin(ang) * r);
      lower.rotation.x = Math.cos(ang) * 0.6;
      lower.rotation.z = Math.PI + 0.20;
      group.add(lower);
    }

    // ── Eyes ──────────────────────────────────────────────────────────────
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x141008, roughness: 0.20, metalness: 0.6,
      clearcoat: 0.85, clearcoatRoughness: 0.08,
      emissive: new THREE.Color(0x665522), emissiveIntensity: 0.45,
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.07 * scale, 12, 8), eyeMat);
      e.position.set(+L * 0.405, 0.085 * scale, 0.135 * scale * side);
      group.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.025 * scale, 8, 6), pupilMat);
      p.position.set(+L * 0.420, 0.088 * scale, 0.155 * scale * side);
      group.add(p);
    }

    super({
      species: 'frilledshark',
      mesh: group,
      position: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxX * 0.65),
        THREE.MathUtils.randFloat(GIANT_TANK.floorY + 8, GIANT_TANK.floorY + 36),
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxZ * 0.65),
      ),
      cfg: {
        speed: 3.6, maxAccel: 0.9, turnRate: 0.55,
        depthMin: GIANT_TANK.floorY + 6,
        depthMax: GIANT_TANK.floorY + 50,    // prefers the lower water column
        wanderMin: 14, wanderMax: 22,
        wallMargin: 16,
        bounds: GIANT_TANK,
        facesVelocity: true,
      },
    });

    this._uniforms = uniforms;
    this._pectorals = pectorals;
    this._pitchTarget = 0;
  }

  onPickTarget(target) {
    // Strong bias to the bottom half of the tank — deep-water dweller
    if (Math.random() < 0.75) {
      target.y = THREE.MathUtils.randFloat(this.cfg.depthMin, this.cfg.depthMin + 20);
    }
  }

  onUpdate(dt, time) {
    this._uniforms.uTime.value = time;
    this._uniforms.uTurn.value = this.turnSignal;

    const targetPitch = THREE.MathUtils.clamp(this.vel.y / Math.max(this.cfg.speed, 0.01), -0.75, 0.75);
    this._pitchTarget = THREE.MathUtils.lerp(this._pitchTarget, targetPitch, Math.min(1, dt * 1.0));
    this._uniforms.uPitch.value = this._pitchTarget;

    this._uniforms.uFreq.value = 0.45 + 0.40 * this.speedNorm;
    this._uniforms.uAmp.value  = 0.28 + 0.10 * this.speedNorm;

    const rollTarget = -this.turnSignal * 0.20;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, rollTarget, Math.min(1, dt * 2.0));
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, this._pitchTarget * 0.30, Math.min(1, dt * 1.8));

    for (const p of this._pectorals) {
      const w = Math.sin(time * 0.7 + p.userData.phase);
      p.rotation.z = p.userData.baseRotZ + w * 0.22;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// アンモナイト / Ammonite — extinct spiral-shelled cephalopod
// ─────────────────────────────────────────────────────────────────────────────

export class Ammonite extends Creature {
  constructor(opts = {}) {
    const scale  = opts.scale ?? 1.0;
    const SHELL_R = 2.6 * scale;
    const group = new THREE.Group();

    // ── Logarithmic spiral path in XY plane ───────────────────────────────
    const TURNS = 2.6;
    const b = Math.log(SHELL_R / (SHELL_R * 0.05)) / (TURNS * Math.PI * 2);
    const r0 = SHELL_R * 0.05;
    const totalAngle = TURNS * Math.PI * 2;
    const SEG = 60;
    const pathPoints = [];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * totalAngle;
      const r = r0 * Math.exp(b * a);
      pathPoints.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }

    // Build the shell as a variable-radius swept tube.
    // makeTaperedTube linearly tapers; we approximate the spiral's growing
    // tube by chaining short sub-curves with locally interpolated radii.
    // (TubeGeometry is one continuous tube, but with rScale = lerp(1, rTip/rBase, t*t)
    //  applied to each ring we get the desired growing taper.)
    const tubeBaseR  = SHELL_R * 0.05;
    const tubeOuterR = SHELL_R * 0.50;
    const tubeGeo = makeTaperedTube(pathPoints, {
      rBase: tubeBaseR,
      rTip:  tubeOuterR,
      segs: SEG,
      radial: 18,
    });
    // Add radial rib bumps along the tube
    {
      const RAD = 19;
      const p = tubeGeo.attributes.position;
      const center = new THREE.Vector3();
      // Reconstruct the curve for ring-center lookup
      const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.5);
      for (let ring = 0; ring <= SEG; ring++) {
        const t = ring / SEG;
        const ribFreq = 50;
        const rib = 1 + Math.sin(t * ribFreq) * 0.07;
        curve.getPointAt(t, center);
        for (let r = 0; r < RAD; r++) {
          const i = ring * RAD + r;
          const dx = p.getX(i) - center.x;
          const dy = p.getY(i) - center.y;
          const dz = p.getZ(i) - center.z;
          p.setXYZ(i, center.x + dx * rib, center.y + dy * rib, center.z + dz * rib);
        }
      }
      tubeGeo.computeVertexNormals();
    }

    const shellTex = makeAmmoniteShellTexture();
    const shellMat = new THREE.MeshPhysicalMaterial({
      color:              0xffffff,
      map:                shellTex,
      roughness:          0.42,
      metalness:          0.28,
      clearcoat:          0.55,
      clearcoatRoughness: 0.22,
      emissive:           new THREE.Color(0x1a1208),
      emissiveIntensity:  0.22,
    });
    const shell = new THREE.Mesh(tubeGeo, shellMat);
    shell.castShadow = !!opts.castShadow;
    group.add(shell);

    // ── Aperture (outer rim of the spiral, where the body emerges) ────────
    const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.5);
    const apPt  = curve.getPointAt(1.0);
    const apTan = curve.getTangentAt(1.0).normalize();
    const apRad = tubeOuterR;

    // Flared lip
    {
      const lipGeo = new THREE.TorusGeometry(apRad * 1.05, apRad * 0.10, 10, 28);
      const lip = new THREE.Mesh(lipGeo, new THREE.MeshStandardMaterial({
        color: 0x2b1d10, roughness: 0.55, metalness: 0.18,
        emissive: new THREE.Color(0x180c06), emissiveIntensity: 0.30,
      }));
      lip.position.copy(apPt);
      lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), apTan);
      group.add(lip);
    }

    // ── Mantle (fleshy cap inside the aperture) ───────────────────────────
    const mantleMat = new THREE.MeshPhysicalMaterial({
      color: 0x9c5436, roughness: 0.45, metalness: 0.05,
      clearcoat: 0.40, clearcoatRoughness: 0.32,
      emissive: new THREE.Color(0x180a04), emissiveIntensity: 0.32,
    });
    {
      const mantleGeo = new THREE.SphereGeometry(apRad * 0.95, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
      mantleGeo.rotateX(Math.PI / 2);
      const mantle = new THREE.Mesh(mantleGeo, mantleMat);
      mantle.position.copy(apPt).addScaledVector(apTan, apRad * 0.06);
      mantle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), apTan);
      group.add(mantle);
    }

    // ── Eye on the mantle ────────────────────────────────────────────────
    {
      const eyeMat = new THREE.MeshPhysicalMaterial({
        color: 0xf6e6c0, roughness: 0.20, metalness: 0.10,
        clearcoat: 0.95, clearcoatRoughness: 0.06,
        emissive: new THREE.Color(0xe8b46c), emissiveIntensity: 0.45,
      });
      const side = new THREE.Vector3(0, 0, 1).cross(apTan).normalize();
      const eye = new THREE.Mesh(new THREE.SphereGeometry(apRad * 0.22, 14, 10), eyeMat);
      eye.position.copy(apPt).addScaledVector(apTan, apRad * 0.45).addScaledVector(side, apRad * 0.65);
      group.add(eye);
      const pup = new THREE.Mesh(
        new THREE.SphereGeometry(apRad * 0.10, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x000000 }),
      );
      pup.position.copy(eye.position).addScaledVector(side, apRad * 0.16);
      group.add(pup);
    }

    // ── Eight octopus-like tentacles emerging from the aperture ───────────
    const tentMat = new THREE.MeshPhysicalMaterial({
      color: 0x9c5436, roughness: 0.55, metalness: 0.05,
      clearcoat: 0.42, clearcoatRoughness: 0.30,
      emissive: new THREE.Color(0x180a04), emissiveIntensity: 0.30,
    });
    const tentUniforms = { uTime: { value: 0 } };
    const tentacles = [];
    const tentCount = 8;
    for (let i = 0; i < tentCount; i++) {
      const tentLen = (1.4 + Math.random() * 0.7) * scale * 1.8;
      const geo = new THREE.CylinderGeometry(0.08 * scale, 0.014 * scale, tentLen, 8, 14, true);
      geo.translate(0, -tentLen / 2, 0);
      const mat = tentMat.clone();
      const phase = (i / tentCount) * Math.PI * 2 + Math.random() * 0.3;
      const sideSign = i < tentCount / 2 ? 1 : -1;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = tentUniforms.uTime;
        sh.uniforms.uPhase = { value: phase };
        sh.uniforms.uSidedness = { value: sideSign };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
            uniform float uTime;
            uniform float uPhase;
            uniform float uSidedness;
          `)
          .replace('#include <begin_vertex>', `
            vec3 transformed = vec3(position);
            float Llen = ${tentLen.toFixed(3)};
            float t = clamp(-transformed.y / Llen, 0.0, 1.0);
            float grow = pow(t, 1.2);
            float wave  = sin(uTime * 1.4 + uPhase + t * 4.5);
            float swirl = cos(uTime * 1.05 + uPhase * 0.7 + t * 3.0);
            transformed.x += wave  * 0.22 * grow * uSidedness;
            transformed.z += swirl * 0.20 * grow;
          `);
      };

      const tent = new THREE.Mesh(geo, mat);
      const ang = (i / tentCount) * Math.PI * 2;
      const rim = new THREE.Vector3(
        Math.cos(ang) * apRad * 0.70,
        Math.sin(ang) * apRad * 0.70,
        0,
      );
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), apTan);
      rim.applyQuaternion(q);
      tent.position.copy(apPt).add(rim);
      // Point each tentacle outward through the aperture along apTan
      tent.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), apTan);
      tent.rotateX((Math.random() - 0.5) * 0.5);
      tent.rotateZ((Math.random() - 0.5) * 0.5);
      tentacles.push(tent);
      group.add(tent);
    }

    // ── Align the spiral so the aperture trails behind motion ─────────────
    // Creature.orient() makes local +X = velocity. To have the tentacles
    // stream BEHIND, rotate the entire shell so apTan aligns with -X.
    const targetBack = new THREE.Vector3(-1, 0, 0);
    const groupAlign = new THREE.Quaternion().setFromUnitVectors(apTan.clone(), targetBack);
    group.children.forEach((child) => {
      child.position.applyQuaternion(groupAlign);
      child.quaternion.premultiply(groupAlign);
    });

    super({
      species: 'ammonite',
      mesh: group,
      position: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxX * 0.6),
        THREE.MathUtils.randFloat(-10, 24),
        THREE.MathUtils.randFloatSpread(GIANT_TANK.maxZ * 0.6),
      ),
      cfg: {
        speed: 2.6, maxAccel: 0.85, turnRate: 0.65,
        depthMin: GIANT_TANK.floorY + 10,
        depthMax: GIANT_TANK.maxY - 10,
        wanderMin: 9, wanderMax: 16,
        wallMargin: 14,
        bounds: GIANT_TANK,
        facesVelocity: true,
      },
    });

    this._tentUniforms = tentUniforms;
    this._bobPhase = Math.random() * Math.PI * 2;
  }

  onUpdate(dt, time) {
    this._tentUniforms.uTime.value = time;

    // Gentle buoyancy bob — chamber gas adjustment
    const bob = Math.sin(time * 0.55 + this._bobPhase) * 0.12;
    this.vel.y += bob * dt;

    // Bank into turns + pitch with intent
    const targetRoll = -this.turnSignal * 0.30;
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, targetRoll, Math.min(1, dt * 1.6));
    const pitch = THREE.MathUtils.clamp(this.vel.y / Math.max(this.cfg.speed, 0.01), -0.5, 0.5);
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -pitch * 0.25, Math.min(1, dt * 1.5));
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
  creatures.push(new BlueWhale   ({ scale: 5.0, castShadow: !isMobile }));
  creatures.push(new FrilledShark({ scale: 3.6, castShadow: !isMobile }));
  creatures.push(new Ammonite    ({ scale: 5.0, castShadow: !isMobile }));

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
  const speciesPool = ['futabasaurus', 'opabinia', 'anomalocaris', 'cameroceras', 'bluewhale', 'frilledshark', 'ammonite'];
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
    { id: 'bluewhale',    label: 'シロナガスクジラ' },
    { id: 'futabasaurus', label: 'フタバスズキリュウ' },
    { id: 'frilledshark', label: 'ラブカ' },
    { id: 'ammonite',     label: 'アンモナイト' },
    { id: 'anomalocaris', label: 'アノマロカリス' },
    { id: 'cameroceras',  label: 'カメロケラス' },
    { id: 'opabinia',     label: 'オパビニア' },
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
