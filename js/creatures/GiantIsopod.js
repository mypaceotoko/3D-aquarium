import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';

/**
 * ダイオウグソクムシ (Bathynomus giganteus) — giant deep-sea isopod.
 *
 * Fat oval chitinous body made of 7 overlapping segment plates, a domed
 * head shield with large black compound eyes and a pair of long antennae
 * that flick in idle, a rounded pleotelson (tail fan) with small uropods,
 * and 14 visible legs cycling through a slow heavy walk.
 *
 * Locked to the seafloor (yaw-only facing), heavier and wider than the
 * trilobite.
 */
export class GiantIsopod extends Creature {
  constructor(opts = {}) {
    const scale = opts.scale ?? THREE.MathUtils.randFloat(0.85, 1.15);
    const L     = 1.90 * scale;
    const W     = 1.35 * scale;
    const FLOOR = TANK.floorY;

    const group = new THREE.Group();

    // Chitinous materials
    const shellColor   = 0xc9b7a0;   // pale sandy-lavender
    const shellDark    = 0x6a5a48;
    const belly        = 0xa89a85;

    const shellMat = new THREE.MeshStandardMaterial({
      color: shellColor,
      roughness: 0.45,
      metalness: 0.22,
      emissive: 0x1c1510,
      emissiveIntensity: 0.3,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: shellDark, roughness: 0.55, metalness: 0.15,
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: belly, roughness: 0.7, metalness: 0.05,
    });

    // ----- Under-body / belly (flattened dome, lower half) --------
    const bellyGeo = new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
    bellyGeo.scale(L * 0.48, 0.22 * scale, W * 0.50);
    bellyGeo.translate(0, 0.05, 0);
    const bellyMesh = new THREE.Mesh(bellyGeo, bellyMat);
    bellyMesh.castShadow = !!opts.castShadow;
    group.add(bellyMesh);

    // ----- Head shield (front dome) ------------------------------
    const headGeo = new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
    headGeo.scale(W * 0.50, 0.28 * scale, W * 0.44);
    headGeo.translate(+L * 0.32, 0.10 * scale, 0);
    const head = new THREE.Mesh(headGeo, shellMat);
    head.castShadow = !!opts.castShadow;
    group.add(head);

    // Dark rim at head's rear edge
    const headRim = new THREE.Mesh(
      new THREE.TorusGeometry(W * 0.30, 0.018 * scale, 6, 22, Math.PI),
      darkMat,
    );
    headRim.rotation.z = Math.PI / 2;
    headRim.rotation.y = Math.PI / 2;
    headRim.position.set(+L * 0.22, 0.12 * scale, 0);
    headRim.scale.set(1, 1, W * 0.44 / (W * 0.30));
    group.add(headRim);

    // Large black compound eyes (wider-set than trilobite)
    const eyeGeo = new THREE.SphereGeometry(1, 14, 10);
    eyeGeo.scale(0.15 * scale, 0.12 * scale, 0.12 * scale);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x050608, roughness: 0.1, metalness: 0.4, emissive: 0x1a2533, emissiveIntensity: 0.35,
    });
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(+L * 0.38, 0.15 * scale, 0.32 * scale * side);
      group.add(e);
    }

    // ----- Antennae (two long curved cylinders from head) --------
    const antennae = [];
    for (const side of [-1, 1]) {
      const antGroup = new THREE.Group();
      // Built from 3 short tapered segments so it can bend
      const segCount = 3;
      const segLen = 0.55 * scale;
      let prev = antGroup;
      for (let i = 0; i < segCount; i++) {
        const t = i / (segCount - 1);
        const r1 = 0.04 * scale * (1 - t * 0.55);
        const r2 = 0.04 * scale * (1 - (t + 1 / segCount) * 0.55);
        const segGeo = new THREE.CylinderGeometry(r1, r2, segLen, 6, 1);
        segGeo.translate(0, -segLen / 2, 0);
        const seg = new THREE.Mesh(segGeo, darkMat);
        seg.position.y = i === 0 ? 0 : -segLen;
        seg.userData.phase = i * 0.6 + side * 0.3;
        prev.add(seg);
        prev = seg;
      }
      antGroup.position.set(+L * 0.47, 0.10 * scale, 0.18 * scale * side);
      antGroup.rotation.z = Math.PI * 0.5 - side * 0.3;  // point forward (+X)
      antGroup.rotation.x = side * 0.55;
      antennae.push(antGroup);
      group.add(antGroup);
    }

    // ----- Thoracic segment plates (7 overlapping) ---------------
    const plateCount = 7;
    const plateStart = +L * 0.18;
    const plateEnd   = -L * 0.18;
    const plates = [];
    for (let i = 0; i < plateCount; i++) {
      const t = i / (plateCount - 1);
      const x = THREE.MathUtils.lerp(plateStart, plateEnd, t);
      const widthFactor = 0.80 + 0.20 * Math.sin((t * 0.9 + 0.05) * Math.PI);
      const pw = W * 0.50 * widthFactor;

      // Plate = half-ellipsoid (top hemisphere), slightly compressed
      const plateGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      plateGeo.scale(L * 0.09, 0.20 * scale, pw);
      const plate = new THREE.Mesh(plateGeo, shellMat);
      plate.position.set(x, 0.11 * scale, 0);
      plate.userData.basePos = plate.position.clone();
      plate.userData.phase = i * 0.5;
      plates.push(plate);
      group.add(plate);

      // Dark rim at rear edge of each plate (overlap hint)
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(pw * 0.9, 0.012 * scale, 5, 18, Math.PI),
        darkMat,
      );
      rim.rotation.z = Math.PI / 2;
      rim.rotation.y = Math.PI / 2;
      rim.position.set(x - L * 0.045, 0.115 * scale, 0);
      group.add(rim);
    }

    // Central axial ridge (subtle, running down the back)
    const axialGeo = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    axialGeo.scale(L * 0.42, 0.10 * scale, W * 0.06);
    axialGeo.translate(0, 0.27 * scale, 0);
    const axial = new THREE.Mesh(axialGeo, shellMat);
    group.add(axial);

    // ----- Pleotelson (rounded tail plate) + uropods -------------
    const pleGeo = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    pleGeo.scale(L * 0.22, 0.18 * scale, W * 0.46);
    pleGeo.translate(-L * 0.32, 0.08 * scale, 0);
    const pleotelson = new THREE.Mesh(pleGeo, shellMat);
    group.add(pleotelson);

    // Uropods (small paired appendages flanking the pleotelson)
    for (const side of [-1, 1]) {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(-0.22 * scale, 0.08 * scale, -0.38 * scale, 0);
      s.quadraticCurveTo(-0.22 * scale, -0.05 * scale, 0, 0);
      const uroGeo = new THREE.ExtrudeGeometry(s, {
        depth: 0.05 * scale, bevelEnabled: true,
        bevelSize: 0.008 * scale, bevelThickness: 0.008 * scale, bevelSegments: 1, steps: 1,
      });
      const uro = new THREE.Mesh(uroGeo, shellMat);
      uro.position.set(-L * 0.38, 0.04 * scale, W * 0.42 * side);
      uro.rotation.y = side > 0 ? -0.35 : 0.35;
      group.add(uro);
    }

    // ----- Legs (7 pairs, visible from the sides) ----------------
    const legMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.55, metalness: 0.2 });
    const legs = [];
    for (let i = 0; i < plateCount; i++) {
      const t = i / (plateCount - 1);
      const x = THREE.MathUtils.lerp(plateStart, plateEnd, t);
      const pw = plates[i].geometry.parameters ? W * 0.50 : plates[i].userData.basePos?.length() ?? W * 0.5;
      const widthFactor = 0.80 + 0.20 * Math.sin((t * 0.9 + 0.05) * Math.PI);
      const legReach = (W * 0.50 * widthFactor) - 0.02 * scale;
      for (const side of [-1, 1]) {
        // 2-segment articulated leg (upper + lower)
        const legGroup = new THREE.Group();
        const upperGeo = new THREE.CylinderGeometry(0.035 * scale, 0.022 * scale, 0.28 * scale, 6, 1);
        upperGeo.translate(0, -0.14 * scale, 0);
        const upper = new THREE.Mesh(upperGeo, legMat);
        upper.rotation.z = side > 0 ? -0.9 : 0.9;  // splay outward

        const lowerGeo = new THREE.CylinderGeometry(0.022 * scale, 0.012 * scale, 0.25 * scale, 5, 1);
        lowerGeo.translate(0, -0.125 * scale, 0);
        const lower = new THREE.Mesh(lowerGeo, legMat);
        lower.position.y = -0.28 * scale;
        lower.rotation.z = side > 0 ? 0.5 : -0.5;
        upper.add(lower);

        legGroup.add(upper);
        legGroup.position.set(x, -0.05, legReach * side);
        legGroup.userData.phase = i * 0.55 + (side > 0 ? 0 : Math.PI);
        legGroup.userData.baseRotX = 0;
        legs.push(legGroup);
        group.add(legGroup);
      }
    }

    super({
      species: 'isopod',
      mesh: group,
      cfg: {
        speed: 0.28,
        maxAccel: 0.18,
        turnRate: 0.4,
        depthMin: FLOOR + 0.25,
        depthMax: FLOOR + 0.40,
        wanderMin: 6, wanderMax: 14,
        wallMargin: 3.5,
        reactsToFood: false,
        facesVelocity: true,
      },
      position: opts.position ?? new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(TANK.maxX * 1.4),
        FLOOR + 0.30,
        THREE.MathUtils.randFloatSpread(TANK.maxZ * 1.3),
      ),
    });

    this._scale = scale;
    this._plates = plates;
    this._legs = legs;
    this._antennae = antennae;
    this._pauseT = 0;        // occasional idle pauses
    this._pauseCool = THREE.MathUtils.randFloat(4, 9);

    this.vel.y = 0;
    this.pos.y = FLOOR + 0.30;
  }

  onPickTarget(target) {
    target.y = TANK.floorY + 0.30;
  }

  /** Yaw-only orient. */
  orient(dt) {
    const vx = this.vel.x, vz = this.vel.z;
    const spd = Math.hypot(vx, vz);
    if (spd < 0.02) return;

    const hx = vx / spd, hz = vz / spd;
    const signed = this.heading.x * hz - this.heading.z * hx;
    this.turnSignal = THREE.MathUtils.lerp(this.turnSignal, THREE.MathUtils.clamp(signed * 2.5, -1, 1), dt * 3);

    this.heading.x = THREE.MathUtils.lerp(this.heading.x, hx, Math.min(1, dt * this.cfg.turnRate));
    this.heading.z = THREE.MathUtils.lerp(this.heading.z, hz, Math.min(1, dt * this.cfg.turnRate));
    const norm = Math.hypot(this.heading.x, this.heading.z) || 1;
    this.heading.x /= norm; this.heading.z /= norm; this.heading.y = 0;

    const yaw = Math.atan2(this.heading.z, this.heading.x);
    const targetY = -yaw;
    const cur = this.mesh.rotation.y;
    let delta = targetY - cur;
    while (delta >  Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.mesh.rotation.y = cur + delta * Math.min(1, dt * this.cfg.turnRate * 1.2);
  }

  onUpdate(dt, time) {
    // Pin to floor
    this.vel.y = 0;
    this.pos.y = TANK.floorY + 0.30;
    this.mesh.position.y = this.pos.y;

    // Occasional idle pauses — heavy feel
    this._pauseCool -= dt;
    if (this._pauseCool <= 0 && this._pauseT <= 0) {
      this._pauseT = THREE.MathUtils.randFloat(1.2, 3.0);
      this._pauseCool = THREE.MathUtils.randFloat(6, 14);
    }
    if (this._pauseT > 0) {
      this._pauseT -= dt;
      this.vel.multiplyScalar(Math.pow(0.05, dt));
    }

    const walk = this.speedNorm;
    const cyc = 4.5;

    // Segment plate subtle flex
    for (const p of this._plates) {
      const w = Math.sin(time * cyc * 0.5 + p.userData.phase);
      p.position.y = p.userData.basePos.y + Math.abs(w) * 0.012 * walk;
      p.rotation.y = w * 0.015 * walk;
    }

    // Leg walking (heavy, slower cycle than trilobite)
    for (const leg of this._legs) {
      const w = Math.sin(time * cyc * (0.4 + walk * 0.7) + leg.userData.phase);
      leg.rotation.x = w * 0.38 * (0.3 + walk * 0.8);
    }

    // Antennae: lazy curling with occasional flicks
    for (let i = 0; i < this._antennae.length; i++) {
      const ant = this._antennae[i];
      const seg = ant.children[0];
      if (!seg) continue;
      // Walk down the chain and apply a small wave
      let cur = seg;
      let idx = 0;
      while (cur) {
        const phase = cur.userData.phase ?? 0;
        const wave = Math.sin(time * 1.4 + phase + idx * 0.6);
        cur.rotation.x = wave * 0.15;
        cur.rotation.z = Math.cos(time * 1.1 + phase) * 0.08;
        cur = cur.children?.find(c => c.isMesh);
        idx++;
      }
    }

    // Tiny body wobble on turns
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z,
      this.turnSignal * 0.05,
      Math.min(1, dt * 3),
    );
  }
}

// ---------------------------------------------------------------------

export function spawnIsopods(scene, count = 3, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const g = new GiantIsopod(opts);
    scene.add(g.mesh);
    out.push(g);
  }
  return out;
}
