import * as THREE from 'three';
import { Creature } from './Creature.js';
import { TANK } from '../scene.js';

/**
 * 田本 (Tamoto) — masked casual swimmer who drifts through the deep-sea tank
 * staring at his phone.  Short black hair, white surgical mask, navy tee,
 * khaki chinos, white sneakers, red earphone cable.
 *
 * STEP 1 (this file): mesh + basic calm swim, spawned by main.js.
 * Later steps will add: floor-dwelling preference, hide-in-sand reaction to
 * trilobite / giant isopod, and food-chase frenzy.
 */
export class Tamoto extends Creature {
  constructor(opts = {}) {
    super({
      species: 'tamoto',
      mesh: makeTamotoMesh(opts),
      cfg: {
        speed: 0.55, maxAccel: 0.7, turnRate: 1.0,
        depthMin: TANK.floorY + 0.7, depthMax: TANK.floorY + 3.2,
        wanderMin: 6, wanderMax: 14, wallMargin: 3.5,
        reactsToFood: true, facesVelocity: true,
      },
    });
    this._phase       = Math.random() * Math.PI * 2;
    this._baseSpeed   = 0.55;
    this._baseAccel   = 0.7;
    this._baseTurn    = 1.0;
    this._feedBoostT  = 0;   // lerp-in timer for food-chase excitement
  }

  onPickTarget(target) {
    // Prefer the lower third of the tank — he likes the seafloor
    target.y = THREE.MathUtils.randFloat(TANK.floorY + 0.7, TANK.floorY + 3.2);
  }

  onUpdate(dt, time, state) {
    const ud = this.mesh.userData;
    const t  = time * 1.2 + this._phase;

    // ── Food-chase frenzy ────────────────────────────────────────────
    // Whenever food is active in the tank, 田本 becomes hyper-excited:
    // boost speed + accel + turn rate, faster leg kicks, phone forgotten.
    const wantsFood = !!state?.food?.active;
    const target    = wantsFood ? 1 : 0;
    // Ease the boost in/out so the state change doesn't feel snappy.
    this._feedBoostT = THREE.MathUtils.lerp(
      this._feedBoostT, target, Math.min(1, dt * (wantsFood ? 3.5 : 2.2)),
    );
    const boost = this._feedBoostT;          // 0..1

    this.cfg.speed    = this._baseSpeed  * (1 + boost * 3.2);
    this.cfg.maxAccel = this._baseAccel  * (1 + boost * 2.8);
    this.cfg.turnRate = this._baseTurn   * (1 + boost * 1.6);

    // Flutter kick — amplitude + frequency both rise during the rush
    const kickFreq = 2.4 + boost * 3.6;
    const kickAmp  = 0.22 + boost * 0.30;
    const kick = Math.sin(t * kickFreq);
    if (ud.hipL)  ud.hipL.rotation.z  = -0.04 + kick * kickAmp;
    if (ud.hipR)  ud.hipR.rotation.z  = -0.04 - kick * kickAmp;
    if (ud.kneeL) ud.kneeL.rotation.z =  0.10 - kick * (kickAmp * 1.3);
    if (ud.kneeR) ud.kneeR.rotation.z =  0.10 + kick * (kickAmp * 1.3);

    // Free left arm drift — reaches forward during the rush like a grab
    if (ud.shoulderFree) {
      const base = -0.22 + boost * 0.50;    // swings up/forward when chasing
      ud.shoulderFree.rotation.z = base + Math.sin(t * (0.85 + boost * 2)) * 0.10;
      ud.shoulderFree.rotation.x =        Math.cos(t * (0.80 + boost * 2)) * 0.08;
    }
    if (ud.elbowFree) {
      ud.elbowFree.rotation.y = 0.25 + boost * 0.35
                              + Math.sin(t * (0.95 + boost * 2) + 0.5) * 0.10;
    }

    // Phone arm — normally locked, but during the rush it tucks in
    if (ud.shoulderPhone) {
      ud.shoulderPhone.rotation.x = -0.05 - boost * 0.35
                                  + Math.sin(t * (0.55 + boost * 1.5)) * 0.03;
    }

    // Head — normally locked on phone; during rush, snaps forward toward food
    if (ud.head) {
      ud.head.rotation.z = (-0.28) * (1 - boost) + boost * 0.05
                         + Math.sin(t * 0.55) * 0.02;
      ud.head.rotation.y =  Math.sin(t * 0.38) * 0.02 * (1 - boost);
    }

    // Hair sway — a touch livelier under acceleration
    if (ud.hairTufts) {
      for (let i = 0; i < ud.hairTufts.length; i++) {
        const h = ud.hairTufts[i];
        h.rotation.z = h.userData.rz0
                     + Math.sin(t * (1.6 + boost * 1.5) + i * 0.5) * (0.05 + boost * 0.08);
      }
    }

    // Phone screen — dim & go idle during the chase (he's not looking)
    if (ud.screenMat) {
      ud.screenMat.emissiveIntensity = (1.05 + Math.sin(time * 2.1) * 0.22)
                                     * (1 - boost * 0.8);
    }

    // Body-level motion — banks harder, bobs less when sprinting
    this.mesh.rotation.z = -this.turnSignal * (0.20 + boost * 0.10)
                         + Math.sin(t * 0.35) * 0.022;
    this.mesh.rotation.x =  Math.sin(t * 0.28) * 0.028 - boost * 0.18;   // nose-down lunge
    this.mesh.position.y =  this.pos.y + Math.sin(t * 0.45) * (0.18 * (1 - boost * 0.6));
  }
}

// ─── Mesh factory ────────────────────────────────────────────────────────────
// Convention: +X = forward (head direction), +Y = up (dorsal side).
// The whole character is built face-down-horizontal, legs trailing -X.
function makeTamotoMesh(opts = {}) {
  const g = new THREE.Group();
  const castShadow = !!opts.castShadow;

  // ── Materials ──────────────────────────────────────────────────────────
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: 0xdcb293, roughness: 0.60, metalness: 0.0,
    clearcoat: 0.22, clearcoatRoughness: 0.55,
    sheen: 0.30, sheenColor: new THREE.Color(0xffe4d2), sheenRoughness: 0.5,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x0c0a09, roughness: 0.72, metalness: 0.05,   // dry matte black
  });
  const maskMat = new THREE.MeshPhysicalMaterial({
    color: 0xf3f2ed, roughness: 0.78, metalness: 0.0,
    sheen: 0.3, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.9,
  });
  const shirtMat = new THREE.MeshPhysicalMaterial({
    color: 0x1c2742, roughness: 0.70, metalness: 0.02,
    sheen: 0.35, sheenColor: new THREE.Color(0x4a6090), sheenRoughness: 0.8,
  });
  const shirtLogoMat = new THREE.MeshStandardMaterial({
    color: 0xe6e6e0, roughness: 0.65,
  });
  const pantMat = new THREE.MeshPhysicalMaterial({
    color: 0xb5a078, roughness: 0.78, metalness: 0.0,    // khaki chinos
    sheen: 0.28, sheenColor: new THREE.Color(0xd0c098), sheenRoughness: 0.85,
  });
  const sneakerMat = new THREE.MeshPhysicalMaterial({
    color: 0xf3efe6, roughness: 0.70, metalness: 0.0,     // off-white canvas
    sheen: 0.25, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.8,
  });
  const sneakerRubberMat = new THREE.MeshPhysicalMaterial({
    color: 0xfbfaf4, roughness: 0.55, metalness: 0.02,    // rubber toe cap
    clearcoat: 0.25, clearcoatRoughness: 0.4,
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: 0x141414, roughness: 0.55,
  });
  const laceMat = new THREE.MeshStandardMaterial({
    color: 0xf8f6ef, roughness: 0.72,
  });
  const sockMat = new THREE.MeshStandardMaterial({
    color: 0x0b0c10, roughness: 0.8,
  });
  const phoneBodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a1b1f, roughness: 0.20, metalness: 0.80,
    clearcoat: 0.75, clearcoatRoughness: 0.12,
  });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x6a8fbc, roughness: 0.10, metalness: 0.0,
    emissive: new THREE.Color(0x4a78c8), emissiveIntensity: 1.1,
  });
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0xc42828, roughness: 0.55, metalness: 0.05,    // red earphone cable
  });
  const budMat = new THREE.MeshPhysicalMaterial({
    color: 0xc42828, roughness: 0.40, metalness: 0.05, clearcoat: 0.6,
  });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xfbf6ee, roughness: 0.30,
  });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x05060a });
  const browMat = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.5 });

  // ── Torso (navy tee) — rounded, shorter than a jacket ─────────────────
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 14), shirtMat);
  torso.scale.set(1.55, 0.78, 1.00);
  torso.position.set(-0.08, -0.02, 0);
  torso.castShadow = castShadow;
  g.add(torso);

  // Lower waist — slightly narrower; top of pants starts here
  const waist = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), shirtMat);
  waist.scale.set(0.80, 0.60, 0.92);
  waist.position.set(-0.78, -0.06, 0);
  waist.castShadow = castShadow;
  g.add(waist);

  // Small white chest graphic on tee
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.10, 16), shirtLogoMat);
  logo.rotation.y =  Math.PI / 2;       // face outward (toward +Y / up since he's face-down? no, +Y is up/dorsal)
  logo.rotation.z = -Math.PI / 2;       // align to body normal
  logo.position.set(0.12, -0.38, 0.05); // on the chest (belly since he's face-down)
  g.add(logo);

  // Tee hem line at the bottom — slight darker band
  const hem = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.022, 6, 18),
    new THREE.MeshStandardMaterial({ color: 0x141b2e, roughness: 0.7 }),
  );
  hem.rotation.y = Math.PI / 2;
  hem.scale.set(1.0, 1.0, 0.55);
  hem.position.set(-0.78, -0.06, 0);
  g.add(hem);

  // ── Neck ──────────────────────────────────────────────────────────────
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 12), skinMat);
  neck.rotation.z = Math.PI / 2;
  neck.position.set(0.45, 0.04, 0);
  g.add(neck);

  // ── Head group ────────────────────────────────────────────────────────
  const head = new THREE.Group();
  head.position.set(0.56, 0.04, 0);
  g.add(head);
  g.userData.head = head;

  // Skull
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 16), skinMat);
  skull.scale.set(1.05, 1.08, 0.98);
  skull.castShadow = castShadow;
  head.add(skull);

  // Jaw — narrower chin
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), skinMat);
  jaw.scale.set(0.85, 0.55, 0.95);
  jaw.position.set(0.11, -0.13, 0);
  head.add(jaw);

  // Ears
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skinMat);
    ear.scale.set(0.55, 1.15, 0.75);
    ear.position.set(-0.05, 0.02, s * 0.22);
    head.add(ear);
  }

  // Brows
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.09), browMat);
    brow.rotation.y =  s * 0.08;
    brow.position.set(0.17, 0.10, s * 0.10);
    head.add(brow);
  }

  // Eyes (gentle downward gaze — looking at phone)
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), eyeWhiteMat);
    eye.position.set(0.185, 0.05, s * 0.093);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.020, 10, 8), pupilMat);
    pupil.position.set(0.210, 0.038, s * 0.093);
    head.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(0.225, 0.045, s * 0.088);
    head.add(glint);
  }

  // ── Surgical mask — covers nose + mouth (lower half of face) ─────────
  // Built from two curved planes + side straps.
  const maskFront = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 18, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.45),
    maskMat,
  );
  maskFront.scale.set(1.10, 1.0, 1.02);
  maskFront.position.set(0.04, -0.04, 0);
  head.add(maskFront);

  // Mask pleats — three thin ridges across the front
  for (let i = 0; i < 3; i++) {
    const pleat = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.005, 5, 14, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.85 }),
    );
    pleat.rotation.y = Math.PI / 2;
    pleat.rotation.z = Math.PI;
    pleat.position.set(0.19, -0.02 - i * 0.055, 0);
    head.add(pleat);
  }

  // Ear-loop straps — thin light-colored loops from mask edge to ears
  for (const s of [-1, 1]) {
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.006, 5, 16),
      new THREE.MeshStandardMaterial({ color: 0xf0eee5, roughness: 0.8 }),
    );
    strap.rotation.y = Math.PI / 2;
    strap.scale.set(1.0, 0.8, 1.0);
    strap.position.set(0.02, -0.04, s * 0.20);
    head.add(strap);
  }

  // ── Hair — short dry spikes on the crown ─────────────────────────────
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.235, 18, 12), hairMat);
  cap.scale.set(1.02, 0.70, 1.02);
  cap.position.set(-0.02, 0.11, 0);
  head.add(cap);

  const hairTufts = [];
  const tuftDefs = [
    { x:  0.14, y: 0.20, z:  0.00, rx: -0.15, rz:  0.30, s: 0.85 },
    { x:  0.10, y: 0.24, z: -0.12, rx: -0.05, rz:  0.25, s: 0.75 },
    { x:  0.10, y: 0.24, z:  0.12, rx: -0.25, rz:  0.40, s: 0.75 },
    { x:  0.02, y: 0.27, z:  0.00, rx:  0.00, rz:  0.08, s: 0.90 },
    { x:  0.02, y: 0.26, z: -0.16, rx:  0.10, rz:  0.20, s: 0.70 },
    { x:  0.02, y: 0.26, z:  0.16, rx: -0.10, rz:  0.20, s: 0.70 },
    { x: -0.10, y: 0.24, z:  0.00, rx:  0.08, rz: -0.05, s: 0.85 },
    { x: -0.16, y: 0.20, z: -0.12, rx:  0.18, rz: -0.15, s: 0.70 },
    { x: -0.16, y: 0.20, z:  0.12, rx: -0.18, rz: -0.15, s: 0.70 },
  ];
  for (const td of tuftDefs) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16 * td.s, 5), hairMat);
    tuft.rotation.x = td.rx;
    tuft.rotation.z = td.rz;
    tuft.position.set(td.x, td.y, td.z);
    tuft.userData.rz0 = td.rz;
    head.add(tuft);
    hairTufts.push(tuft);
  }
  g.userData.hairTufts = hairTufts;

  // ── Arms (bare skin — short-sleeve tee) ───────────────────────────────
  function buildArm(sideZ, mode) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.30, 0.05, sideZ * 0.32);
    g.add(shoulder);

    // Short tee sleeve cap — covers the top of the upper arm
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.10, 0.22, 10), shirtMat,
    );
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.x = 0.11;
    shoulder.add(sleeve);

    // Upper arm (skin)
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.082, 0.42, 10), skinMat,
    );
    upper.rotation.z = Math.PI / 2;
    upper.position.x = 0.33;
    shoulder.add(upper);

    // Elbow pivot
    const elbow = new THREE.Group();
    elbow.position.set(0.52, 0, 0);
    shoulder.add(elbow);

    if (mode === 'phone') {
      elbow.rotation.y = -sideZ * 1.05;
      elbow.rotation.z = -0.30;
    } else {
      elbow.rotation.y = -sideZ * 0.45;
      elbow.rotation.z = -0.10;
    }

    // Forearm (skin)
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.082, 0.44, 10), skinMat,
    );
    forearm.rotation.z = Math.PI / 2;
    forearm.position.x = 0.24;
    elbow.add(forearm);

    // Wrist
    const wrist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.072, 0.04, 8), skinMat,
    );
    wrist.rotation.z = Math.PI / 2;
    wrist.position.x = 0.48;
    elbow.add(wrist);

    // Hand
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.10), skinMat);
    hand.position.set(0.56, -0.01, 0);
    elbow.add(hand);
    // Fingers
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.028, 0.020), skinMat);
      finger.position.set(0.65, -0.025, -0.035 + i * 0.023);
      elbow.add(finger);
    }

    return { shoulder, elbow };
  }

  const rightArm = buildArm(-1, 'phone');
  g.userData.shoulderPhone = rightArm.shoulder;
  const leftArm  = buildArm(+1, 'free');
  g.userData.shoulderFree = leftArm.shoulder;
  g.userData.elbowFree    = leftArm.elbow;

  // ── Phone — parented to the phone-arm elbow so it follows the hand ─
  const phone = new THREE.Group();
  phone.position.set(0.60, 0.05, 0.02);
  phone.rotation.z = 0.18;
  phone.rotation.y = 0.30;
  rightArm.elbow.add(phone);

  const phoneBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.014, 0.14), phoneBodyMat,
  );
  phone.add(phoneBody);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.004, 0.12), screenMat,
  );
  screen.position.y = 0.010;
  phone.add(screen);
  g.userData.screenMat = screenMat;

  // ── Legs (khaki chinos + white sneakers) ─────────────────────────────
  function buildLeg(sideZ) {
    const hip = new THREE.Group();
    hip.position.set(-1.05, -0.10, sideZ * 0.13);
    hip.rotation.y = Math.PI;   // thigh points -X (trailing)
    g.add(hip);

    // Thigh
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.128, 0.108, 0.64, 10), pantMat,
    );
    thigh.rotation.z = Math.PI / 2;
    thigh.position.x = 0.32;
    thigh.castShadow = castShadow;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0.64, 0, 0);
    hip.add(knee);

    // Shin
    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.108, 0.090, 0.62, 10), pantMat,
    );
    shin.rotation.z = Math.PI / 2;
    shin.position.x = 0.31;
    shin.castShadow = castShadow;
    knee.add(shin);

    // Cuffed hem
    const hem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.108, 0.095, 0.05, 10), pantMat,
    );
    hem.rotation.z = Math.PI / 2;
    hem.position.x = 0.60;
    knee.add(hem);

    // Visible sock between pants hem and shoe
    const sock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.080, 0.078, 0.06, 10), sockMat,
    );
    sock.rotation.z = Math.PI / 2;
    sock.position.x = 0.66;
    knee.add(sock);

    // ── Sneaker ────────────────────────────────────────────────
    // Main canvas body
    const shoeBody = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), sneakerMat);
    shoeBody.scale.set(1.65, 0.72, 0.90);
    shoeBody.position.set(0.82, -0.02, 0);
    shoeBody.castShadow = castShadow;
    knee.add(shoeBody);

    // Rubber toe cap — slightly whiter/glossier
    const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), sneakerRubberMat);
    toeCap.scale.set(0.95, 0.70, 0.98);
    toeCap.position.set(0.94, -0.04, 0);
    knee.add(toeCap);

    // Rubber sole — dark edge band
    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.035, 0.17), soleMat,
    );
    sole.position.set(0.83, -0.095, 0);
    knee.add(sole);

    // Thin rubber rim above the sole (classic Converse stripe)
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.022, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xf7f4ec, roughness: 0.55 }),
    );
    rim.position.set(0.83, -0.070, 0);
    knee.add(rim);

    // Laces — 4 thin crossbars
    for (let i = 0; i < 4; i++) {
      const lace = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.008, 0.14), laceMat,
      );
      lace.position.set(0.74 + i * 0.045, 0.06, 0);
      knee.add(lace);
    }

    return { hip, knee };
  }

  const legL = buildLeg(-1); g.userData.hipL = legL.hip; g.userData.kneeL = legL.knee;
  const legR = buildLeg(+1); g.userData.hipR = legR.hip; g.userData.kneeR = legR.knee;

  // ── Red earphone cable — from ear to phone ───────────────────────────
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), budMat);
  bud.position.set(-0.04, 0.02, 0.23);
  head.add(bud);

  const cablePts = [];
  const start = new THREE.Vector3(0.52, 0.02, 0.22);    // near left ear (+Z)
  const mid   = new THREE.Vector3(0.35, -0.30, 0.10);
  const near  = new THREE.Vector3(0.55, -0.25, -0.05);
  const end   = new THREE.Vector3(0.80, -0.10, -0.35);  // reaches phone
  for (let i = 0; i <= 22; i++) {
    const k = i / 22;
    const p = new THREE.Vector3();
    if (k < 0.5) {
      p.lerpVectors(start, mid, k / 0.5);
    } else {
      p.lerpVectors(mid, near, (k - 0.5) / 0.5).lerp(end, (k - 0.5) * 1.1);
    }
    p.y += Math.sin(k * Math.PI) * -0.10;     // gentle droop in the current
    cablePts.push(p);
  }
  const cableCurve = new THREE.CatmullRomCurve3(cablePts);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurve, 36, 0.0075, 5, false),
    cableMat,
  );
  g.add(cable);

  // ── A few exhalation bubbles around the mask ─────────────────────────
  const bubbleMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe8ff, roughness: 0.04, metalness: 0.0,
    transmission: 0.9, transparent: true, opacity: 0.55,
    clearcoat: 1.0, clearcoatRoughness: 0.05,
  });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.022 + Math.random() * 0.018, 8, 6),
      bubbleMat,
    );
    b.position.set(0.74 + i * 0.06, 0.12 + i * 0.07, -0.04 + Math.random() * 0.08);
    g.add(b);
  }

  // Final scale — small, similar to Innocence; keeps him appropriately
  // diminutive next to pirarucu / leviathan.
  g.scale.setScalar(0.55);
  return g;
}
