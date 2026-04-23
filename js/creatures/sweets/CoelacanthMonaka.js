import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// シーラカンスモナカ — a rare, slow-drifting wafer-shelled relic.
// Drifts deep, occasionally surfaces with a quiet sparkle.
// ─────────────────────────────────────────────────────────────────────────────

export class CoelacanthMonaka extends Creature {
  constructor() {
    const { mesh, tail, aura } = makeMonakaMesh();
    super({
      species: 'coelacanth-monaka',
      mesh,
      cfg: {
        speed: 0.65, maxAccel: 0.45, turnRate: 0.7,
        depthMin: TANK.floorY + 1.0, depthMax: TANK.floorY + 6.5,
        wanderMin: 8, wanderMax: 16, wallMargin: 5,
        facesVelocity: true, reactsToFood: false,
      },
    });
    this._tail  = tail;
    this._aura  = aura;
    this._phase = Math.random() * Math.PI * 2;
  }

  onUpdate(dt, time) {
    // Gentle tail sway
    this._tail.rotation.y = Math.sin(time * 1.4 + this._phase) * 0.22;
    // Slow vertical dive-and-rise cycle (long period — adds mystique)
    this.pos.y += Math.sin(time * 0.35 + this._phase) * 0.015;
    // Subtle pitch — nose tips slightly with the rise/fall
    const pitch = Math.cos(time * 0.35 + this._phase) * 0.08;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, pitch, Math.min(1, dt * 1.2));
    // Slow roll (fossil-tilt)
    this.mesh.rotation.z = Math.sin(time * 0.28 + this._phase * 0.7) * 0.05;
    // Aura breathes (rare-creature shimmer)
    const pulse = 0.35 + 0.25 * Math.sin(time * 0.9 + this._phase);
    this._aura.material.opacity = pulse;
    this._aura.scale.setScalar(1 + 0.06 * Math.sin(time * 0.7 + this._phase));
  }
}

function makeMonakaMesh() {
  const g = new THREE.Group();

  // Two wafer shells (pale monaka skin)
  const waferMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8e6c2, roughness: 0.78, metalness: 0.02,
    emissive: 0x3a2810, emissiveIntensity: 0.12,
    sheen: 0.5, sheenColor: 0xfff0c8,
    clearcoat: 0.15, clearcoatRoughness: 0.7,
  });
  const darkEdge = new THREE.MeshStandardMaterial({
    color: 0xc8a878, roughness: 0.9,
  });

  // Body — oval wafer halves (top + bottom)
  const bodyTop = new THREE.Mesh(new THREE.SphereGeometry(1.0, 18, 12, 0, Math.PI*2, 0, Math.PI/2), waferMat);
  bodyTop.scale.set(1.4, 0.55, 0.7);
  bodyTop.castShadow = true;
  g.add(bodyTop);

  const bodyBot = new THREE.Mesh(new THREE.SphereGeometry(1.0, 18, 12, 0, Math.PI*2, Math.PI/2, Math.PI/2), waferMat);
  bodyBot.scale.set(1.4, 0.55, 0.7);
  bodyBot.castShadow = true;
  g.add(bodyBot);

  // Seam line between shells
  const seam = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.035, 6, 28), darkEdge);
  seam.rotation.x = Math.PI * 0.5;
  seam.scale.set(1, 0.5, 1);
  g.add(seam);

  // Wafer pattern dots (top)
  const dotMat = new THREE.MeshStandardMaterial({ color: 0xdcbd8a, roughness: 0.7 });
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), dotMat);
    dot.position.set(Math.cos(ang) * 0.9, 0.45, Math.sin(ang) * 0.42);
    g.add(dot);
  }

  // Fleshy lobe fins (coelacanth signature — chunky, paired)
  const finMat = new THREE.MeshStandardMaterial({
    color: 0xe8cf9e, roughness: 0.8,
  });
  const finGeo = new THREE.SphereGeometry(0.35, 10, 8);
  const finPositions = [
    [ 0.45,  -0.3,  0.55],
    [ 0.45,  -0.3, -0.55],
    [-0.35, -0.35,  0.55],
    [-0.35, -0.35, -0.55],
  ];
  for (const p of finPositions) {
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.set(...p);
    fin.scale.set(0.9, 0.5, 0.55);
    g.add(fin);
  }

  // Head section — slightly narrower
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), waferMat);
  head.position.set(1.05, 0.0, 0);
  head.scale.set(1, 0.7, 0.55);
  head.castShadow = true;
  g.add(head);

  // Eye — gold leaf accent (rare vibe)
  const eyeGold = new THREE.MeshStandardMaterial({ color: 0xf8d078, metalness: 0.55, roughness: 0.25 });
  const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x1a0f08 });
  for (const s of [1, -1]) {
    const ring = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), eyeGold);
    ring.position.set(1.28, 0.12, 0.25 * s);
    g.add(ring);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeBlack);
    pup.position.set(1.36, 0.12, 0.25 * s);
    g.add(pup);
  }

  // Tail — three-lobed fossil fin
  const tail = new THREE.Group();
  tail.position.set(-1.45, 0, 0);
  for (const yOff of [0.32, 0, -0.32]) {
    const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 7), waferMat);
    lobe.rotation.z = Math.PI * 0.5;
    lobe.position.set(-0.3, yOff, 0);
    lobe.scale.set(1, 1, 0.3);
    tail.add(lobe);
  }
  g.add(tail);

  // Rare aura — subtle soft sphere around body (warmer gold shimmer)
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0xffe0a0, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const aura = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), auraMat);
  aura.scale.set(1.25, 0.7, 0.9);
  g.add(aura);

  // Inner soft glow (second smaller aura for depth)
  const innerAuraMat = new THREE.MeshBasicMaterial({
    color: 0xfff8e0, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const innerAura = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), innerAuraMat);
  innerAura.scale.set(1.2, 0.65, 0.85);
  g.add(innerAura);

  g.scale.setScalar(1.25);
  return { mesh: g, tail, aura };
}
