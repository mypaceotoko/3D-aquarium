import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';
import { injectTentacleShader } from './MoonJellyfish.js';

/**
 * タコクラゲ / Spotted Jellyfish (Mastigias papua)
 *
 * Small, charming. Lilac/brown bell sprinkled with white polka-dots,
 * 8 short club-shaped oral arms with bobble tips. No long tentacles.
 */
export class SpottedJellyfish extends Creature {
  constructor(opts = {}) {
    const size = THREE.MathUtils.randFloat(0.85, 1.25) * (opts.scale ?? 1);
    const group = new THREE.Group();

    // Bell — gentle dome with a few subtle ridges ─────────────────────
    const bellGeo = new THREE.SphereGeometry(1.0, 40, 22, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const bp = bellGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const rim = 1 - THREE.MathUtils.clamp(y, 0, 1);
      const ang = Math.atan2(z, x);
      const ripple = Math.sin(ang * 12) * 0.02 * rim;
      bp.setXYZ(i, x * (1 + ripple), y * 0.82, z * (1 + ripple));
    }
    bellGeo.computeVertexNormals();

    const bellMat = new THREE.MeshPhysicalMaterial({
      color:        0xe8d8e8,
      map:          makeSpottedTexture(),
      roughness:    0.34,
      metalness:    0.0,
      transmission: 0.55,
      thickness:    0.7,
      ior:          1.33,
      transparent:  true,
      opacity:      0.86,
      side:         THREE.DoubleSide,
      clearcoat:    0.5,
      clearcoatRoughness: 0.30,
      emissive:     0xb088c0,
      emissiveIntensity: 0.10,
      depthWrite:   false,
      fog:          true,
    });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.renderOrder = 2;
    group.add(bell);

    // Inner glow — soft lilac ────────────────────────────────────────
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new THREE.MeshBasicMaterial({
        color: 0xd0a8e0,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
      }),
    );
    glow.position.y = -0.05;
    group.add(glow);

    // Rim ─────────────────────────────────────────────────────────────
    const rimGeo = new THREE.TorusGeometry(0.97, 0.045, 8, 56);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
      color: 0xeacaf0,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    rim.position.y = -0.02;
    group.add(rim);

    const tentUniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };

    // 8 short club-shaped oral arms with knobby tips ──────────────────
    const armMat = new THREE.MeshStandardMaterial({
      color: 0xd5b8d8,
      roughness: 0.45,
      transparent: true,
      opacity: 0.78,
      emissive: 0x9a6aaa,
      emissiveIntensity: 0.20,
      depthWrite: false,
      fog: true,
    });
    const armLen = 0.95;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = 0.20;
      const phase = Math.random() * Math.PI * 2;
      // tapered cylinder for the arm itself
      const g = new THREE.CylinderGeometry(0.10, 0.05, armLen, 6, 10, true);
      g.translate(0, -armLen / 2, 0);
      const m = armMat.clone();
      injectTentacleShader(m, tentUniforms, phase + ang, armLen, {
        sway: 0.14, swirl: 0.13, freq: 0.85,
      });
      const arm = new THREE.Mesh(g, m);
      arm.position.set(Math.cos(ang) * r, -0.05, Math.sin(ang) * r);
      group.add(arm);

      // bobble tip
      const tipMat = armMat.clone();
      tipMat.color = new THREE.Color(0xfff0fa);
      tipMat.emissive = new THREE.Color(0xc888d0);
      tipMat.emissiveIntensity = 0.30;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), tipMat);
      tip.position.set(Math.cos(ang) * r, -0.05 - armLen, Math.sin(ang) * r);
      group.add(tip);
    }

    group.scale.setScalar(size);

    super({
      species: 'spotted-jelly',
      mesh: group,
      cfg: {
        speed: 0.46,
        maxAccel: 0.32,
        turnRate: 0.42,
        depthMin: TANK.floorY + 3.0,
        depthMax: TANK.maxY - 1.0,
        wanderMin: 5, wanderMax: 10,
        wallMargin: 3.5,
        reactsToFood: false,
        facesVelocity: false,
      },
      position: opts.position,
    });

    this._bell = bell;
    this._glow = glow;
    this._rim  = rim;
    this._tentUniforms = tentUniforms;
    this._baseScale = size;
    this._phase = Math.random() * Math.PI * 2;
    this._pulseFreq = 0.62 + Math.random() * 0.25;
    this._lastPulse = 0;

    this.vel.set(
      (Math.random() - 0.5) * 0.10,
      Math.random() * 0.14,
      (Math.random() - 0.5) * 0.10,
    );
  }

  onPickTarget(target) {
    target.y = THREE.MathUtils.randFloat(
      this.cfg.depthMin,
      this.cfg.depthMax,
    );
  }

  onUpdate(dt, time) {
    const raw = Math.sin(time * this._pulseFreq * Math.PI + this._phase);
    const squeeze = Math.pow(Math.max(raw, 0), 3);

    const s = this._baseScale;
    this._bell.scale.set(
      s * (1 + squeeze * 0.20),
      s * (1 - squeeze * 0.30),
      s * (1 + squeeze * 0.20),
    );
    this._glow.scale.set(
      s * (1 + squeeze * 0.12),
      s * (1 - squeeze * 0.22),
      s * (1 + squeeze * 0.12),
    );
    this._rim.scale.set(
      s * (1 + squeeze * 0.24),
      s,
      s * (1 + squeeze * 0.24),
    );

    this._tentUniforms.uTime.value = time;
    this._tentUniforms.uPulse.value = squeeze;

    if (squeeze > 0.7 && this._lastPulse < 0.7) {
      this.vel.y += 0.30;
      this.vel.x += (Math.random() - 0.5) * 0.07;
      this.vel.z += (Math.random() - 0.5) * 0.07;
    }
    this._lastPulse = squeeze;

    this.vel.multiplyScalar(Math.pow(0.78, dt * 2.0));
    this.vel.y -= 0.16 * dt;

    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, -this.vel.x * 0.40, Math.min(1, dt * 1.2));
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x,  this.vel.z * 0.40, Math.min(1, dt * 1.2));
  }
}

// Procedural polka-dot bell texture
function makeSpottedTexture() {
  const w = 512, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // base gradient — pale lilac at apex, deeper at rim
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, '#f4e0f4');
  grad.addColorStop(0.55, '#c89aca');
  grad.addColorStop(1.0, '#7c5494');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // mottling
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(${130+Math.random()*60|0},${90+Math.random()*60|0},${130+Math.random()*60|0},${Math.random()*0.18})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 0, Math.PI * 2);
    g.fill();
  }
  // white polka-dots — denser near centre, sparser at edges
  const dots = 90;
  for (let i = 0; i < dots; i++) {
    const x = Math.random() * w;
    // bias y toward upper 70% of texture
    const y = Math.pow(Math.random(), 0.7) * h;
    const r = 4 + Math.random() * 9;
    const grad2 = g.createRadialGradient(x, y, 0, x, y, r);
    grad2.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad2.addColorStop(0.6, 'rgba(255,250,255,0.72)');
    grad2.addColorStop(1, 'rgba(255,245,255,0)');
    g.fillStyle = grad2;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
