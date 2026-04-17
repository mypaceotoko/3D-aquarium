import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';

/**
 * 三葉虫 (Trilobite) — seafloor crawler.
 *
 * Three longitudinal lobes (hence the name):
 *   - Central *axial* lobe = raised ridge
 *   - Two *pleural* lobes  = flattened side wings
 * Divided into cephalon (head shield), thorax (segmented), and pygidium
 * (tail shield).
 *
 * Pinned to the seafloor — no vertical motion, yaw-only facing, gentle
 * per-segment undulation and a walking-leg cycle scaled by speed.
 */
export class Trilobite extends Creature {
  constructor(opts = {}) {
    const scale  = opts.scale ?? THREE.MathUtils.randFloat(0.75, 1.00);
    const L      = 1.55 * scale;  // length (head→tail)
    const W      = 1.15 * scale;  // max width
    const FLOOR  = TANK.floorY;

    const group = new THREE.Group();

    // Shell material — chitinous bronzy-brown with soft highlights
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x5a4020,
      roughness: 0.55,
      metalness: 0.35,
      emissive: 0x1a1006,
      emissiveIntensity: 0.25,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x2e1e0e,
      roughness: 0.5,
      metalness: 0.25,
    });
    const axialMat = new THREE.MeshStandardMaterial({
      color: 0x6b4b24,
      roughness: 0.5,
      metalness: 0.40,
      emissive: 0x1a1006,
      emissiveIntensity: 0.3,
    });

    // ----- Cephalon (head shield) --------------------------------
    // A front crescent — widest at the base, tapering rearward. Model as
    // half-ellipsoid scaled to a flat oval.
    const cephGeo = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    cephGeo.scale(W * 0.60, 0.28 * scale, W * 0.50);
    cephGeo.translate(+L * 0.30, 0.01, 0);
    const cephalon = new THREE.Mesh(cephGeo, shellMat);
    cephalon.castShadow = !!opts.castShadow;
    group.add(cephalon);

    // Compound eyes: bean-shaped raised patches on the cephalon
    const eyeGeo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    eyeGeo.scale(0.12 * scale, 0.10 * scale, 0.07 * scale);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a, roughness: 0.2, metalness: 0.1, emissive: 0x331a08, emissiveIntensity: 0.35,
    });
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(+L * 0.32, 0.14 * scale, 0.22 * scale * side);
      e.rotation.y = side * 0.25;
      group.add(e);
    }

    // Cephalon rim (slight dark ridge defining the head shield edge)
    const cephRim = new THREE.Mesh(
      new THREE.TorusGeometry(W * 0.30, 0.015 * scale, 6, 22, Math.PI),
      darkMat,
    );
    cephRim.rotation.z = Math.PI / 2;
    cephRim.rotation.y = Math.PI / 2;
    cephRim.position.set(+L * 0.30, 0.02, 0);
    cephRim.scale.set(1, 1, W * 0.50 / (W * 0.30));  // stretch to cephalon width
    group.add(cephRim);

    // ----- Thorax segments (ribs) --------------------------------
    // 8 segments, each is a half-torus arc across the body; they undulate
    // independently in onUpdate with a walking phase.
    const segmentCount = 8;
    const thoraxXStart = +L * 0.12;
    const thoraxXEnd   = -L * 0.22;
    const segments = [];
    for (let i = 0; i < segmentCount; i++) {
      const t = i / (segmentCount - 1);
      const x = THREE.MathUtils.lerp(thoraxXStart, thoraxXEnd, t);
      // Width profile: widest in the middle, narrower fore and aft
      const widthFactor = 0.65 + 0.35 * Math.sin((t * 0.9 + 0.05) * Math.PI);
      const segW = W * 0.50 * widthFactor;

      const ribGroup = new THREE.Group();
      // Raised pleural wings (left + right) as thin curved wedges
      for (const side of [-1, 1]) {
        const wedgeShape = new THREE.Shape();
        wedgeShape.moveTo(0, 0);
        wedgeShape.quadraticCurveTo(segW * 0.5, 0.04 * scale, segW, 0);
        wedgeShape.lineTo(segW, -0.05 * scale);
        wedgeShape.quadraticCurveTo(segW * 0.5, -0.04 * scale, 0, -0.06 * scale);
        wedgeShape.lineTo(0, 0);
        const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, {
          depth: 0.10 * scale, bevelEnabled: true,
          bevelSize: 0.015 * scale, bevelThickness: 0.015 * scale, bevelSegments: 2, steps: 1,
        });
        // Extrude is along +Z — rotate so depth goes along body length.
        wedgeGeo.rotateY(Math.PI / 2);
        wedgeGeo.translate(0, 0.01, 0);
        if (side < 0) wedgeGeo.scale(1, 1, -1);

        const wedge = new THREE.Mesh(wedgeGeo, shellMat);
        wedge.position.set(0, 0, 0);
        wedge.rotation.y = 0;
        // Orient the wedge so its width extends along +/- Z
        wedge.position.z = 0; // shape already goes outward from 0 in Z via scale
        wedge.scale.z = side;
        ribGroup.add(wedge);
      }

      // Thin dark groove line at the back of the rib
      const groove = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015 * scale, 0.015 * scale, segW * 2, 6, 1),
        darkMat,
      );
      groove.rotation.x = Math.PI / 2;
      groove.position.set(-0.055 * scale, 0.055 * scale, 0);
      ribGroup.add(groove);

      ribGroup.position.set(x, 0, 0);
      ribGroup.userData.basePos = ribGroup.position.clone();
      ribGroup.userData.segW = segW;
      ribGroup.userData.phase = i * 0.55;
      segments.push(ribGroup);
      group.add(ribGroup);
    }

    // ----- Axial lobe (central raised ridge) ---------------------
    // Tapered half-ellipsoid running along the thorax center.
    const axialGeo = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    axialGeo.scale(L * 0.42, 0.22 * scale, W * 0.14);
    axialGeo.translate(-L * 0.04, 0.05 * scale, 0);
    const axial = new THREE.Mesh(axialGeo, axialMat);
    group.add(axial);

    // Axial segmentation cross-grooves (lines across the ridge)
    for (let i = 0; i < segmentCount; i++) {
      const t = i / (segmentCount - 1);
      const x = THREE.MathUtils.lerp(thoraxXStart, thoraxXEnd, t);
      const w = W * 0.14 * (0.7 + 0.3 * Math.sin(t * Math.PI));
      const lineGeo = new THREE.BoxGeometry(0.018 * scale, 0.04 * scale, w * 2);
      const line = new THREE.Mesh(lineGeo, darkMat);
      line.position.set(x, 0.14 * scale, 0);
      group.add(line);
    }

    // ----- Pygidium (tail shield) --------------------------------
    const pygGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    pygGeo.scale(L * 0.22, 0.20 * scale, W * 0.40);
    pygGeo.translate(-L * 0.34, 0.01, 0);
    const pygidium = new THREE.Mesh(pygGeo, shellMat);
    group.add(pygidium);
    // Pygidium rim
    const pygRim = new THREE.Mesh(
      new THREE.TorusGeometry(W * 0.24, 0.013 * scale, 6, 20, Math.PI),
      darkMat,
    );
    pygRim.rotation.z = Math.PI / 2;
    pygRim.rotation.y = -Math.PI / 2;
    pygRim.position.set(-L * 0.34, 0.02, 0);
    pygRim.scale.set(1, 1, W * 0.40 / (W * 0.24));
    group.add(pygRim);

    // ----- Legs (tiny chitinous segments peeking out from under) -
    const legMat = new THREE.MeshStandardMaterial({ color: 0x201208, roughness: 0.7, metalness: 0.1 });
    const legs = [];
    for (let i = 0; i < segmentCount; i++) {
      const t = i / (segmentCount - 1);
      const x = THREE.MathUtils.lerp(thoraxXStart, thoraxXEnd, t);
      const segW = segments[i].userData.segW;
      for (const side of [-1, 1]) {
        const legGeo = new THREE.CylinderGeometry(0.025 * scale, 0.010 * scale, 0.22 * scale, 5, 1);
        legGeo.translate(0, -0.11 * scale, 0);
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(x, -0.02, (segW - 0.04) * side);
        leg.rotation.z = side * 0.3;
        leg.userData.baseRotX = 0;
        leg.userData.baseRotZ = leg.rotation.z;
        leg.userData.phase = i * 0.5 + (side > 0 ? 0 : Math.PI);
        legs.push(leg);
        group.add(leg);
      }
    }

    // Whole group faces +X (head). Base class sets it via quaternion from vel.
    super({
      species: 'trilobite',
      mesh: group,
      cfg: {
        speed: 0.42,
        maxAccel: 0.25,
        turnRate: 0.55,
        depthMin: FLOOR + 0.20,
        depthMax: FLOOR + 0.32,
        wanderMin: 5, wanderMax: 10,
        wallMargin: 3.5,
        reactsToFood: false,
        facesVelocity: true,
      },
      position: opts.position ?? new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(TANK.maxX * 1.5),
        FLOOR + 0.25,
        THREE.MathUtils.randFloatSpread(TANK.maxZ * 1.3),
      ),
    });

    this._scale = scale;
    this._segments = segments;
    this._legs = legs;

    // Lock Y: trilobite walks on the seafloor only
    this.vel.y = 0;
    this.pos.y = FLOOR + 0.25;
  }

  onPickTarget(target) {
    // Stay on the floor plane
    target.y = TANK.floorY + 0.25;
  }

  /** Override: yaw-only orient (ignore pitch/roll). */
  orient(dt) {
    // Project velocity to XZ plane for heading
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
    // Our mesh's local +X = forward; rotation about -Y yields the correct yaw.
    const targetY = -yaw;
    const cur = this.mesh.rotation.y;
    let delta = targetY - cur;
    // shortest path
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.mesh.rotation.y = cur + delta * Math.min(1, dt * this.cfg.turnRate * 1.3);
  }

  onUpdate(dt, time) {
    // Clamp to floor
    this.vel.y = 0;
    this.pos.y = TANK.floorY + 0.25;
    this.mesh.position.y = this.pos.y;

    const walkSpeed = this.speedNorm;  // 0..1
    const legCycle = 6.0;

    // Body segment undulation (very gentle)
    for (let i = 0; i < this._segments.length; i++) {
      const s = this._segments[i];
      const ph = s.userData.phase;
      const wave = Math.sin(time * legCycle * 0.5 + ph);
      s.rotation.y = wave * 0.03 * walkSpeed;
      s.position.y = s.userData.basePos.y + Math.abs(wave) * 0.01 * walkSpeed;
    }

    // Leg walking cycle
    for (const leg of this._legs) {
      const w = Math.sin(time * legCycle * (0.3 + walkSpeed * 0.8) + leg.userData.phase);
      leg.rotation.x = w * 0.45 * (0.4 + walkSpeed * 0.7);
      leg.rotation.z = leg.userData.baseRotZ + w * 0.1 * walkSpeed;
    }

    // Slight body wobble laterally with turning
    this.mesh.rotation.z = THREE.MathUtils.lerp(
      this.mesh.rotation.z,
      this.turnSignal * 0.08,
      Math.min(1, dt * 3),
    );
  }
}

// ---------------------------------------------------------------------

export function spawnTrilobites(scene, count = 4, opts = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = new Trilobite(opts);
    scene.add(t.mesh);
    out.push(t);
  }
  return out;
}
