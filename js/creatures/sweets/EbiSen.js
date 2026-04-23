import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// えびせん — shrimp cracker. Crisp, small, fast. Travels in little flocks,
// zipping across with a clean, snappy motion.
// ─────────────────────────────────────────────────────────────────────────────

export class EbiSen extends Creature {
  constructor() {
    const { mesh, tail, segments } = makeEbiSenMesh();
    super({
      species: 'ebi-sen',
      mesh,
      cfg: {
        speed: 2.8, maxAccel: 3.2, turnRate: 2.4,
        depthMin: TANK.floorY + 2.2, depthMax: TANK.floorY + 10,
        wanderMin: 1.8, wanderMax: 4.5, wallMargin: 4,
        facesVelocity: true, reactsToFood: true,
      },
    });
    this._tail     = tail;
    this._segments = segments;
    this._phase    = Math.random() * Math.PI * 2;
    this._dartT    = THREE.MathUtils.randFloat(2.5, 5);
  }

  onUpdate(dt, time) {
    // Tail flicks quickly
    const flick = Math.sin(time * 16 + this._phase) * 0.35 * (0.4 + this.speedNorm * 0.6);
    this._tail.rotation.y = flick;

    // Body segments ripple slightly along length
    for (let i = 0; i < this._segments.length; i++) {
      const seg = this._segments[i];
      seg.rotation.z = Math.sin(time * 12 + this._phase - i * 0.5) * 0.08 * (0.4 + this.speedNorm);
    }

    // Occasional snappy dart: brief speed burst by biasing wander
    this._dartT -= dt;
    if (this._dartT <= 0) {
      this._dartT = THREE.MathUtils.randFloat(2.5, 5);
      // Force fresh target (snap direction change)
      this.pickTarget();
    }
  }
}

function makeEbiSenMesh() {
  const g = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xffb488, roughness: 0.7, metalness: 0.04,
    emissive: 0x602818, emissiveIntensity: 0.15,
  });
  const paleMat = new THREE.MeshStandardMaterial({
    color: 0xffddc0, roughness: 0.75,
  });
  const charMat = new THREE.MeshStandardMaterial({
    color: 0xa84828, roughness: 0.85,
  });

  // Curved shrimp body — stack of small segments, each slightly rotated to curve
  const segments = [];
  const segCount = 5;
  let curX = 0.0;
  let curY = 0.0;
  let curAng = 0;
  for (let i = 0; i < segCount; i++) {
    const t = i / (segCount - 1);
    const r = 0.22 - t * 0.07; // narrows toward tail
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), shellMat);
    seg.scale.set(1.2, 1.0, 0.85);
    seg.position.set(curX, curY, 0);
    seg.rotation.z = -curAng * 0.5;
    seg.castShadow = true;
    g.add(seg);
    segments.push(seg);
    // Curve downward a bit like a shrimp
    const step = 0.3 - t * 0.03;
    curAng += 0.22;
    curX -= Math.cos(curAng * 0.35) * step;
    curY -= Math.sin(curAng * 0.6) * step * 0.45;
  }

  // Head bump (leading segment) — brighter
  const headIdx = 0;
  const head = segments[headIdx];
  head.material = paleMat;

  // Tiny antennae
  const antMat = new THREE.MeshStandardMaterial({ color: 0x6a2818, roughness: 0.8 });
  for (const s of [1, -1]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6), antMat);
    ant.position.set(0.22, 0.12, 0.06 * s);
    ant.rotation.z = -Math.PI * 0.32;
    ant.rotation.y = 0.25 * s;
    g.add(ant);
  }

  // Tiny dot eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a0f08 });
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
    e.position.set(0.16, 0.06, 0.13 * s);
    g.add(e);
  }

  // Tiny legs (paired, under body)
  for (let i = 0; i < 3; i++) {
    for (const s of [1, -1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 5), charMat);
      leg.position.set(-0.05 - i * 0.12, -0.15, 0.11 * s);
      leg.rotation.x = 0.4 * s;
      g.add(leg);
    }
  }

  // Tail fan — wedge group that can flick
  const tail = new THREE.Group();
  tail.position.set(curX, curY, 0);
  const fanGeo = new THREE.ConeGeometry(0.22, 0.3, 6);
  const fan = new THREE.Mesh(fanGeo, shellMat);
  fan.rotation.z = Math.PI * 0.5;
  fan.position.set(-0.18, 0, 0);
  fan.scale.set(1, 1, 0.35);
  tail.add(fan);
  // Fan stripes (toasted edges)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.38), charMat);
  stripe.position.set(-0.3, 0, 0);
  tail.add(stripe);
  g.add(tail);

  // Sugar sparkle dots scattered on shell
  const sparkMat = new THREE.MeshStandardMaterial({ color: 0xfff8e0, roughness: 0.3,
    emissive: 0xfff8e0, emissiveIntensity: 0.2 });
  for (let i = 0; i < 6; i++) {
    const seg = segments[Math.floor(Math.random() * segments.length)];
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), sparkMat);
    sp.position.set(
      seg.position.x + (Math.random() - 0.5) * 0.2,
      seg.position.y + 0.08 + Math.random() * 0.05,
      (Math.random() - 0.5) * 0.2
    );
    g.add(sp);
  }

  g.scale.setScalar(1.1);
  return { mesh: g, tail, segments };
}
