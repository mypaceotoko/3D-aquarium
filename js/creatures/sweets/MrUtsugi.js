import * as THREE from 'three';
import { Creature } from '../Creature.js';
import { TANK } from '../../scene.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mr. ウツギ — 水槽の名物キャラ。小さくて丸い、メガネのおじさん。
// 普段は他のスイーツ生物を追いかけ、餌を見つけると猛烈に走り出す。
// ステップ3: 他のスイーツ生物を target として追いかける土台を追加。
// ─────────────────────────────────────────────────────────────────────────────

// 追跡対象にする近接半径（これより遠ければ wander にフォールバック）
const CHASE_SIGHT_R = 18;
// 追跡 target を再選定するインターバル
const RETARGET_MIN  = 1.4;
const RETARGET_MAX  = 3.0;

export class MrUtsugi extends Creature {
  constructor() {
    const { mesh, parts } = makeMrUtsugiMesh();
    super({
      species: 'mr-utsugi',
      mesh,
      cfg: {
        speed: 1.7, maxAccel: 2.6, turnRate: 2.8,
        // 床近くを「歩く/泳ぐ」イメージで低めに
        depthMin: TANK.floorY + 0.6,
        depthMax: TANK.floorY + 5.0,
        wanderMin: 1.6, wanderMax: 3.4,
        wallMargin: 4,
        facesVelocity: true,
        reactsToFood: true,
      },
    });
    this._parts = parts;
    this._phase = Math.random() * Math.PI * 2;
    this._chaseTarget = null; // 現在追いかけているスイーツ生物
  }

  /**
   * 既定の wander は乱数で適当な点を選ぶが、Mr. ウツギは
   * 「近くのスイーツ生物を追いかける」モードを優先する。
   * 対象が居なければ既定の wander にフォールバック。
   */
  pickTarget(state) {
    const others = state?.creatures;
    if (others && others.length) {
      let best = null, bestD = CHASE_SIGHT_R * CHASE_SIGHT_R;
      for (const c of others) {
        if (c === this) continue;
        if (c.species === 'mr-utsugi') continue; // 同族は追わない
        const dx = c.pos.x - this.pos.x;
        const dz = c.pos.z - this.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) { bestD = d2; best = c; }
      }
      if (best) {
        this._chaseTarget = best;
        // ターゲットの少し前/横にオフセットを足して「追いかけ回す」感じに
        const off = (Math.random() - 0.5) * 1.4;
        this.target.set(
          best.pos.x + off,
          THREE.MathUtils.clamp(best.pos.y - 0.4, this.cfg.depthMin, this.cfg.depthMax),
          best.pos.z + (Math.random() - 0.5) * 1.4,
        );
        this.wanderT = THREE.MathUtils.randFloat(RETARGET_MIN, RETARGET_MAX);
        return;
      }
    }
    // フォールバック: 通常の wander
    this._chaseTarget = null;
    super.pickTarget(state);
  }

  onUpdate(dt, time, state) {
    // 追跡中はターゲット位置に追従更新（毎フレ少しだけ追いつめる）
    if (this._chaseTarget && !(state?.food?.active)) {
      const t = this._chaseTarget;
      // 対象が居なくなった/別水槽切替などへの保険
      if (!t.pos) { this._chaseTarget = null; }
      else {
        this.target.x += (t.pos.x - this.target.x) * Math.min(1, dt * 1.6);
        this.target.z += (t.pos.z - this.target.z) * Math.min(1, dt * 1.6);
        this.target.y = THREE.MathUtils.clamp(t.pos.y - 0.4, this.cfg.depthMin, this.cfg.depthMax);
      }
    }

    // 小走りバウンス（速度に応じて強める）
    const bounce = Math.sin(time * 9.0 + this._phase)
                 * 0.06 * (0.3 + this.speedNorm * 0.7);
    this._parts.body.position.y = this._parts.bodyBaseY + bounce;
    this._parts.head.position.y = this._parts.headBaseY + bounce * 0.6;

    // 腕の振り
    const arm = Math.sin(time * 9.0 + this._phase) * 0.5 * (0.2 + this.speedNorm * 0.8);
    this._parts.armL.rotation.x =  arm;
    this._parts.armR.rotation.x = -arm;
  }
}

// ─── Mesh ────────────────────────────────────────────────────────────────────
function makeMrUtsugiMesh() {
  const g = new THREE.Group();

  // パレット
  const SKIN     = 0xf2c89c;
  const SHIRT    = 0xc83040; // 赤チェック風
  const SHIRT_D  = 0x4a1820; // 暗い格子
  const HEADBAND = 0xe04858;
  const HAIR     = 0x3a2418;
  const FRAME    = 0x141414; // メガネ
  const PANTS    = 0x2a2a30;

  const skinMat  = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55 });
  const shirtMat = new THREE.MeshStandardMaterial({
    map: makeCheckerTexture(SHIRT, SHIRT_D),
    roughness: 0.78, metalness: 0,
  });
  const bandMat  = new THREE.MeshStandardMaterial({
    color: HEADBAND, roughness: 0.6,
    emissive: 0x401418, emissiveIntensity: 0.15,
  });
  const hairMat  = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.8 });
  const frameMat = new THREE.MeshStandardMaterial({ color: FRAME, roughness: 0.4, metalness: 0.3 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS, roughness: 0.7 });
  const eyeMat   = new THREE.MeshBasicMaterial({ color: 0x1a0f08 });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });

  // 体（太め・丸み）— 前方 +X を「正面」として配置
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 14), shirtMat);
  body.scale.set(1.05, 1.0, 1.05);
  body.position.set(0, 0.85, 0);
  body.castShadow = true;
  g.add(body);

  // 首
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.18, 12), skinMat);
  neck.position.set(0, 1.55, 0);
  g.add(neck);

  // 頭（丸顔）
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), skinMat);
  head.position.set(0, 2.05, 0);
  head.scale.set(1.05, 1.0, 1.05);
  head.castShadow = true;
  g.add(head);

  // ほっぺ（赤らみ）
  const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff9c9c, transparent: true, opacity: 0.5 });
  for (const sx of [1, -1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), cheekMat);
    cheek.position.set(0.42, 1.95, 0.30 * sx);
    cheek.scale.set(1, 0.6, 0.5);
    head.parent.add(cheek);
  }

  // メガネのフレーム（左右）— 顔の正面 +X 側
  for (const sz of [1, -1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 18), frameMat);
    ring.position.set(0.52, 2.10, 0.20 * sz);
    ring.rotation.y = Math.PI * 0.5;
    g.add(ring);
  }
  // ブリッジ
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 6), frameMat);
  bridge.position.set(0.52, 2.10, 0);
  bridge.rotation.x = Math.PI * 0.5;
  g.add(bridge);

  // 目（メガネの中、白目＋黒目＋ハイライト）
  for (const sz of [1, -1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), shineMat);
    white.position.set(0.50, 2.10, 0.20 * sz);
    white.scale.set(0.4, 1, 1);
    g.add(white);

    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
    pup.position.set(0.55, 2.10, 0.20 * sz);
    g.add(pup);

    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), shineMat);
    sh.position.set(0.59, 2.14, 0.21 * sz);
    g.add(sh);
  }

  // 口（笑顔）
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x6a2818, roughness: 0.8 });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.022, 6, 12, Math.PI), mouthMat);
  mouth.position.set(0.58, 1.88, 0);
  mouth.rotation.y = Math.PI * 0.5;
  mouth.rotation.z = Math.PI;
  g.add(mouth);

  // 髪（つんつん頭）
  for (let i = 0; i < 9; i++) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.28, 6), hairMat);
    const a = (i / 9) * Math.PI - Math.PI * 0.5;
    tuft.position.set(Math.cos(a) * 0.12, 2.50 + Math.random() * 0.05, Math.sin(a) * 0.32);
    tuft.rotation.z = (Math.random() - 0.5) * 0.4;
    tuft.rotation.x = (Math.random() - 0.5) * 0.4;
    g.add(tuft);
  }

  // ねじりハチマキ（赤）
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.60, 0.07, 8, 22), bandMat);
  band.position.set(0, 2.32, 0);
  band.rotation.x = Math.PI * 0.5;
  band.rotation.z = -0.08;
  g.add(band);
  // ハチマキの結び目
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), bandMat);
  knot.position.set(-0.45, 2.30, 0.30);
  knot.scale.set(1, 1, 1.4);
  g.add(knot);

  // 腕（チェックシャツの袖）— ピボット用 Group
  const armL = new THREE.Group();
  armL.position.set(0, 1.30, 0.85);
  const armLMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.45, 4, 8), shirtMat);
  armLMesh.position.set(0, -0.25, 0);
  armL.add(armLMesh);
  // 手
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinMat);
  handL.position.set(0, -0.55, 0);
  armL.add(handL);
  g.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0, 1.30, -0.85);
  const armRMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.45, 4, 8), shirtMat);
  armRMesh.position.set(0, -0.25, 0);
  armR.add(armRMesh);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinMat);
  handR.position.set(0, -0.55, 0);
  armR.add(handR);
  g.add(armR);

  // 脚（短め・ちょこっと）
  for (const sz of [0.30, -0.30]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.20, 4, 8), pantsMat);
    leg.position.set(0, 0.18, sz);
    g.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), pantsMat);
    shoe.position.set(0.05, 0.02, sz);
    shoe.scale.set(1.4, 0.55, 1);
    g.add(shoe);
  }

  // 全体スケール — 他の生物よりかなり小さく
  g.scale.setScalar(0.42);

  return {
    mesh: g,
    parts: {
      body, head, armL, armR,
      bodyBaseY: body.position.y,
      headBaseY: head.position.y,
    },
  };
}

// ─── Checker texture for the shirt ───────────────────────────────────────────
function makeCheckerTexture(colA, colB) {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const a = '#' + colA.toString(16).padStart(6, '0');
  const b = '#' + colB.toString(16).padStart(6, '0');
  g.fillStyle = a;
  g.fillRect(0, 0, s, s);
  g.fillStyle = b;
  const cell = s / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 0) g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  // 細い格子線
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, s); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(s, i * cell); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
