// 스킬·폭발 3D 연출: 입자(불꽃·연기·눈가루), 바닥 무늬(얼음·그을음·균열·마법진), 빛기둥·보호막, 상태 표시(보호막·공격 강화·둔화·기절).
// 게임 규칙과는 상관없는 화면 효과만 다룬다. 좌표는 월드 px를 받아 3D 단위(1칸 = 1)로 바꾼다.
import * as THREE from 'three';
import { ELITE, ENEMIES, SKILL, TILE } from '../game/data';
import type { BoomKind, ClassId, EnemyView, Player, ProjectileView, WeaponEffect } from '../game/types';

const U = 1 / TILE;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ─── 입자 ─────────────────────────────────────────────

/** 입자마다 크기·투명도·색이 다른 점 묶음. 빛(더하기 합성)과 연기(보통 합성) 두 가지로 쓴다 */
class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private gravity: Float32Array;
  private baseSize: Float32Array;
  private next = 0;
  private material: THREE.ShaderMaterial;

  /** maxAlpha: 연기처럼 어두운 입자는 반투명하게 (진하면 검은 구멍처럼 보인다) */
  constructor(private n: number, additive: boolean, private maxAlpha = 1) {
    this.pos = new Float32Array(n * 3).fill(-999);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.grow = new Float32Array(n);
    this.gravity = new Float32Array(n);
    this.baseSize = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  set scale(v: number) {
    this.material.uniforms.uScale.value = v;
  }

  /** 3D 좌표(x, y=높이, z)에 입자 하나 */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number, size: number, opts: { grow?: number; gravity?: number } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    const c = new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.grow[i] = opts.grow ?? 0;
    this.gravity[i] = opts.gravity ?? 0;
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]); // 1 → 0
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      const drag = 1 - Math.min(1, dt * 1.5);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * (1 - k));
      this.alpha[i] = this.maxAlpha * Math.min(1, k * 2.5) * (k > 0.9 ? (1 - k) * 10 : 1);
    }
    const g = this.points.geometry;
    for (const name of ['position', 'color', 'size', 'alpha']) g.getAttribute(name).needsUpdate = true;
  }
}

// ─── 바닥 무늬 텍스처 (캔버스로 한 번 그려 둔다) ─────────

function canvasTexture(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeTextures() {
  const radial = (g: CanvasRenderingContext2D, s: number, stops: [number, string][]) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  };
  const cracks = (g: CanvasRenderingContext2D, s: number, color: string, n: number, width: number) => {
    g.strokeStyle = color;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2), r = s * 0.06, x = s / 2, y = s / 2;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x, y);
      while (r < s * 0.46) {
        r += rand(s * 0.04, s * 0.08);
        a += rand(-0.35, 0.35);
        x = s / 2 + Math.cos(a) * r;
        y = s / 2 + Math.sin(a) * r;
        g.lineTo(x, y);
        g.lineWidth = Math.max(1, g.lineWidth * 0.85);
      }
      g.stroke();
    }
  };
  return {
    // 얼어붙은 바닥: 가운데가 진한 하늘색 얼음, 흰 균열과 결정 무늬
    ice: canvasTexture((g, s) => {
      radial(g, s, [[0, 'rgba(200,240,255,0.85)'], [0.6, 'rgba(150,215,255,0.7)'], [0.9, 'rgba(120,190,255,0.35)'], [1, 'rgba(120,190,255,0)']]);
      cracks(g, s, 'rgba(255,255,255,0.9)', 11, 3);
      for (let i = 0; i < 26; i++) {
        const a = rand(0, Math.PI * 2), r = rand(0, s * 0.42), x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r, k = rand(4, 10);
        g.fillStyle = `rgba(255,255,255,${rand(0.3, 0.7)})`;
        g.beginPath();
        g.moveTo(x, y - k);
        g.lineTo(x + k * 0.6, y);
        g.lineTo(x, y + k);
        g.lineTo(x - k * 0.6, y);
        g.fill();
      }
    }),
    // 그을음: 검게 탄 자리와 붉은 불씨
    scorch: canvasTexture((g, s) => {
      radial(g, s, [[0, 'rgba(20,10,5,0.9)'], [0.5, 'rgba(40,20,10,0.75)'], [0.8, 'rgba(60,35,20,0.35)'], [1, 'rgba(60,35,20,0)']]);
      cracks(g, s, 'rgba(255,120,30,0.55)', 7, 2);
    }),
    // 땅 균열 (대지 강타, 흑룡 착지)
    crack: canvasTexture((g, s) => {
      radial(g, s, [[0, 'rgba(70,50,30,0.6)'], [0.35, 'rgba(70,50,30,0.25)'], [1, 'rgba(70,50,30,0)']]);
      cracks(g, s, 'rgba(25,15,8,0.85)', 9, 3.5);
    }),
    // 마법진: 동심원과 별 모양 (흰색으로 그리고 재질 색으로 물들인다)
    magic: canvasTexture((g, s) => {
      const c = s / 2;
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      for (const [r, w] of [[0.47, 5], [0.42, 2], [0.28, 3]] as const) {
        g.lineWidth = w;
        g.beginPath();
        g.arc(c, c, s * r, 0, Math.PI * 2);
        g.stroke();
      }
      g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i * 2 * Math.PI * 2) / 6 - Math.PI / 2;
        const x = c + Math.cos(a) * s * 0.42, y = c + Math.sin(a) * s * 0.42;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.fillRect(c + Math.cos(a) * s * 0.445 - 3, c + Math.sin(a) * s * 0.445 - 3, 6, 6);
      }
    }, 512),
    // 빛기둥: 아래가 밝고 위로 갈수록 사라진다
    pillar: canvasTexture((g, s) => {
      const gr = g.createLinearGradient(0, s, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }, 64),
    // 부드러운 원 (표적 원, 발밑 오라)
    glowRing: canvasTexture((g, s) => {
      radial(g, s, [[0, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,0.08)'], [0.9, 'rgba(255,255,255,0.95)'], [0.96, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
    }),
  };
}

// ─── 효과 하나 ─────────────────────────────────────────

/** 진행 중인 효과 하나 (바닥 무늬·고리·빛기둥·돌 조각 등) */
type Fx = {
  obj: THREE.Object3D; // 장면에 놓인 물체
  age: number; // 생긴 뒤 지난 시간(초)
  life: number; // 사라지는 시간(초)
  tick: (k: number, age: number, dt: number) => void; // 매 프레임 모양 바꾸기 (k: 남은 비율 1 → 0)
  materials: THREE.Material[]; // 끝나면 정리할 재질
};

export class SkillFx {
  private glow = new Particles(2500, true);
  private smoke = new Particles(900, false, 0.4);
  private tex = makeTextures();
  private fxs: Fx[] = [];
  private plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private cylinder = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
  private sphere = new THREE.SphereGeometry(1, 24, 16);
  private dome = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  private spike = new THREE.ConeGeometry(0.1, 0.7, 5).translate(0, 0.35, 0);
  private rock = new THREE.DodecahedronGeometry(0.08);
  private torusHalf = new THREE.TorusGeometry(1, 0.05, 6, 32, Math.PI * 1.3).rotateX(Math.PI / 2);
  private decalLift = 0;
  // 상태 표시: 플레이어 보호막·공격 강화, 적 둔화·기절
  private shields = new Map<string, THREE.Mesh>();
  private chills = new Map<string, THREE.Mesh>(); // 얼음 마녀의 냉기에 맞아 느려진 플레이어 발밑 얼음
  private auras = new Map<string, THREE.Mesh>();
  private frostRings = new Map<number, THREE.Mesh>();
  private stars = new Map<number, THREE.Group>();
  private clock = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(this.glow.points, this.smoke.points);
  }

  /** 화면 높이(px)에 맞춰 입자 크기를 맞춘다 */
  setScreenHeight(px: number) {
    this.glow.scale = this.smoke.scale = px / 2;
  }

  // ─── 기본 재료 ─────────────────────────────────────

  private add(obj: THREE.Object3D, life: number, tick: Fx['tick'], materials: THREE.Material[]) {
    this.scene.add(obj);
    this.fxs.push({ obj, age: 0, life, tick, materials });
  }

  /** 바닥 무늬. fade: 끝나기 전 이 시간 동안 사라진다 */
  private decal(x: number, z: number, size: number, map: THREE.Texture, color: number, life: number, opts: { additive?: boolean; fade?: number; grow?: number; spin?: number; opacity?: number } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map, color, transparent: true, depthWrite: false, opacity: 0,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false,
    });
    const m = new THREE.Mesh(this.plane, mat);
    this.decalLift = (this.decalLift + 1) % 20;
    m.position.set(x, 0.03 + this.decalLift * 0.002, z);
    m.renderOrder = 1;
    const fade = opts.fade ?? life * 0.4, peak = opts.opacity ?? 1, grow = opts.grow ?? 0.12;
    this.add(m, life, (k, age, dt) => {
      const inK = Math.min(1, age / grow);
      m.scale.setScalar(size * (0.6 + 0.4 * (1 - (1 - inK) ** 3)));
      mat.opacity = peak * Math.min(inK * 1.5, 1, (life - age) / fade);
      if (opts.spin) m.rotation.y += opts.spin * dt;
    }, [mat]);
    return m;
  }

  /** 사라지지 않는 바닥 무늬 (맵 장식: 5구역 용암 자국 등) */
  staticDecal(x: number, z: number, size: number, kind: 'scorch' | 'crack' | 'ice', rot = 0) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex[kind], transparent: true, depthWrite: false, opacity: 0.9, fog: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const m = new THREE.Mesh(this.plane, mat);
    m.position.set(x, 0.015, z);
    m.rotation.y = rot;
    m.scale.setScalar(size);
    m.renderOrder = 1;
    this.scene.add(m);
  }

  /** 퍼지는 고리 */
  private ring(x: number, z: number, from: number, to: number, color: number, life: number, y = 0.06) {
    this.decal(x, z, from, this.tex.glowRing, color, life, { additive: true, fade: life, grow: 0.0001 }).position.y = y;
    const f = this.fxs[this.fxs.length - 1];
    const base = f.tick;
    f.tick = (k, age, dt) => {
      base(k, age, dt);
      f.obj.scale.setScalar(from + (to - from) * (1 - (1 - age / life) ** 2));
    };
  }

  /** 빛기둥 */
  private pillar(x: number, z: number, radius: number, height: number, color: number, life: number) {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex.pillar, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0, fog: false });
    const m = new THREE.Mesh(this.cylinder, mat);
    m.position.set(x, 0, z);
    this.add(m, life, (k, age) => {
      const inK = Math.min(1, age / 0.15);
      m.scale.set(radius * (1.3 - 0.3 * inK), height * inK, radius * (1.3 - 0.3 * inK));
      mat.opacity = Math.min(inK, k * 2) * 0.9;
    }, [mat]);
  }

  /** 빛나는 공·반구 (폭발 불덩이, 보호막 펼치기) */
  private bubble(x: number, y: number, z: number, from: number, to: number, color: number, life: number, half = false, opacity = 0.8) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(half ? this.dome : this.sphere, mat);
    m.position.set(x, y, z);
    this.add(m, life, (k, age) => {
      const t = age / life;
      m.scale.setScalar(from + (to - from) * (1 - (1 - t) ** 3));
      if (half) m.scale.y *= 0.8;
      mat.opacity = opacity * k;
    }, [mat]);
  }

  /** 튀는 돌 조각 */
  private debris(x: number, z: number, n: number, color: number, power: number) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true });
      const m = new THREE.Mesh(this.rock, mat);
      const a = rand(0, Math.PI * 2), sp = rand(0.5, 1) * power;
      const v = new THREE.Vector3(Math.cos(a) * sp, rand(2.5, 4.5) * Math.sqrt(power / 2), Math.sin(a) * sp);
      m.position.set(x, 0.1, z);
      m.scale.setScalar(rand(0.7, 1.8));
      const spin = new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      this.add(m, 1.1, (k, _age, dt) => {
        v.y -= 12 * dt;
        m.position.addScaledVector(v, dt);
        if (m.position.y < 0.05) {
          m.position.y = 0.05;
          v.multiplyScalar(0.4);
          v.y = Math.abs(v.y) * 0.3;
        }
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        mat.opacity = Math.min(1, k * 3);
      }, [mat]);
    }
  }

  /** 땅에서 솟는 얼음 가시 */
  private iceSpikes(x: number, z: number, radius: number, n: number, life: number) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x4aa8ff, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 });
      const m = new THREE.Mesh(this.spike, mat);
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * radius;
      m.position.set(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
      m.rotation.set(rand(-0.35, 0.35), rand(0, Math.PI), rand(-0.35, 0.35));
      const h = rand(0.5, 1.3), delay = (r / radius) * 0.18;
      this.add(m, life, (k, age) => {
        const t = Math.max(0, age - delay);
        const up = Math.min(1, t / 0.1);
        const down = Math.min(1, (life - age) / 0.35);
        m.scale.set(1, h * up * down + 0.001, 1);
        mat.opacity = 0.9 * Math.min(1, down * 1.5);
      }, [mat]);
    }
  }

  /** 땅에서 피어오르는 연기·흙먼지 고리 */
  private dustRing(x: number, z: number, radius: number, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
      this.smoke.emit(x + Math.cos(a) * radius * 0.3, 0.15, z + Math.sin(a) * radius * 0.3, Math.cos(a) * radius * 2.2, rand(0.2, 0.7), Math.sin(a) * radius * 2.2, rand(0.6, 1.0), color, rand(0.5, 0.9), { grow: 1.5 });
    }
  }

  private burst(x: number, y: number, z: number, n: number, speed: number, color: number, size: number, life: number, gravity = 0, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), e = rand(-0.4, 1);
      const sp = rand(0.4, 1) * speed;
      this.glow.emit(x, y, z, Math.cos(a) * sp * Math.cos(e), Math.sin(e) * sp + up, Math.sin(a) * sp * Math.cos(e), rand(0.6, 1) * life, color, size * rand(0.7, 1.3), { gravity });
    }
  }

  // ─── 게임 이벤트 ────────────────────────────────────

  /** 스킬을 썼을 때. (x, y)는 스킬 중심(대개 시전자, 화살비·메테오는 겨냥한 곳), aim은 시전자 조준 방향 */
  skill(cls: ClassId, idx: number, wx: number, wy: number, aim: number, players: Player[], caster: Player | undefined) {
    const x = wx * U, z = wy * U;
    const dx = Math.cos(aim), dz = Math.sin(aim);
    const allies = (r: number) => players.filter((p) => !p.dead && caster && Math.hypot(p.x - caster.x, p.y - caster.y) <= r);
    switch (`${cls}.${idx}`) {
      case 'swordsman.0': // 돌진 베기: 출발점에 바람 고리와 파란 섬광 (돌진 중 잔상은 상태 표시에서)
        this.ring(x, z, 0.3, 1.4, 0x9fd8ff, 0.3);
        this.burst(x, 0.5, z, 18, 3, 0xcfeaff, 0.25, 0.35);
        break;
      case 'swordsman.1': { // 회오리 베기: 몸 주위를 도는 칼날 두 줄기와 불꽃
        const r = SKILL.whirl.radius * U;
        for (const [i, color] of [[0, 0xffffff], [1, 0xffc070]] as const) {
          const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
          const m = new THREE.Mesh(this.torusHalf, mat);
          m.position.set(x, 0.45 + i * 0.12, z);
          m.scale.setScalar(r * (0.75 + i * 0.2));
          this.add(m, 0.4, (k, _age, dt) => {
            m.rotation.y -= dt * (22 + i * 4);
            mat.opacity = k;
          }, [mat]);
        }
        for (let i = 0; i < 30; i++) {
          const a = rand(0, Math.PI * 2);
          this.glow.emit(x + Math.cos(a) * r, rand(0.2, 0.7), z + Math.sin(a) * r, -Math.sin(a) * 5, rand(0, 1), Math.cos(a) * 5, rand(0.2, 0.4), 0xffd090, 0.18);
        }
        this.ring(x, z, 0.5, r * 2.2, 0xffffff, 0.35);
        break;
      }
      case 'swordsman.2': { // 전투 함성: 붉은 충격파와 마법진, 동료마다 붉은 빛기둥
        const r = SKILL.warcry.radius * U;
        this.ring(x, z, 0.5, r * 2, 0xff5a30, 0.6);
        this.decal(x, z, 3, this.tex.magic, 0xff6a30, 1.2, { additive: true, spin: 1.5 });
        for (const p of allies(SKILL.warcry.radius)) {
          this.pillar(p.x * U, p.y * U, 0.45, 2.4, 0xff5030, 0.8);
          this.burst(p.x * U, 0.3, p.y * U, 14, 1.5, 0xff8040, 0.2, 0.7, -2);
        }
        break;
      }
      case 'swordsman.3': // 검기 폭풍: 앞쪽으로 퍼지는 푸른 섬광 (날아가는 검기는 투사체 꼬리로)
        this.burst(x + dx * 0.6, 0.6, z + dz * 0.6, 30, 4, 0xa8e0ff, 0.28, 0.4);
        this.ring(x, z, 0.5, 2.5, 0x88ccff, 0.35);
        break;

      case 'dwarf.0': { // 도발: 붉은 포효 고리 두 겹
        const r = SKILL.taunt.radius * U;
        this.ring(x, z, 0.5, r * 2, 0xff3020, 0.5);
        this.ring(x, z, 0.3, r * 1.3, 0xffa040, 0.4);
        this.burst(x, 1.0, z, 16, 2.5, 0xff4030, 0.25, 0.5);
        break;
      }
      case 'dwarf.1': // 대지 강타: 'slam' 폭발 연출이 함께 온다
        break;
      case 'dwarf.2': // 방패 돌진: 출발점 흙먼지 (돌진 중 먼지는 상태 표시에서)
        this.dustRing(x, z, 0.5, 0xb09070, 10);
        break;
      case 'dwarf.3': { // 산의 수호: 금빛 반구가 펼쳐지고 동료마다 금빛 기둥
        const r = SKILL.bastion.radius * U;
        this.bubble(x, 0, z, 0.5, r, 0xffd060, 0.9, true, 0.35);
        this.decal(x, z, r * 2, this.tex.magic, 0xffd060, 1.6, { additive: true, spin: 0.6, opacity: 0.8 });
        for (const p of allies(SKILL.bastion.radius)) {
          this.pillar(p.x * U, p.y * U, 0.5, 3, 0xffd060, 1.0);
          this.burst(p.x * U, 0.2, p.y * U, 12, 1.2, 0xfff0a0, 0.18, 1.0, -1.5);
        }
        break;
      }

      case 'elf.0': // 부채 사격: 부채꼴로 퍼지는 초록 바람
      case 'elf.3': { // 폭풍의 화살: 사방으로 터지는 초록 바람
        const all = idx === 3;
        const n = all ? 48 : 20;
        for (let i = 0; i < n; i++) {
          const a = all ? (i / n) * Math.PI * 2 : aim + rand(-0.3, 0.3);
          const sp = rand(4, 8);
          this.glow.emit(x + Math.cos(a) * 0.3, 0.55, z + Math.sin(a) * 0.3, Math.cos(a) * sp, 0, Math.sin(a) * sp, rand(0.2, 0.35), 0x9cff9c, 0.16);
        }
        if (all) {
          this.ring(x, z, 0.4, 5, 0x80ff90, 0.45);
          this.decal(x, z, 2.6, this.tex.magic, 0x60ff80, 0.8, { additive: true, spin: -3 });
        }
        break;
      }
      case 'elf.1': // 저격: 활 끝의 금빛 섬광 (날아가는 화살은 꼬리로)
        this.burst(x + dx * 0.4, 0.6, z + dz * 0.4, 20, 2.5, 0xffe08a, 0.2, 0.3);
        break;
      case 'elf.2': { // 화살비: 떨어질 곳에 초록 표적 원
        const r = SKILL.rain.radius * U;
        this.decal(x, z, r * 2, this.tex.glowRing, 0x80ff90, 1.7, { additive: true, fade: 0.4 });
        this.decal(x, z, r * 1.7, this.tex.magic, 0x60ff80, 1.7, { additive: true, fade: 0.4, spin: 1, opacity: 0.45 });
        break;
      }

      case 'gnome.0': { // 치유의 빛: 초록 마법진과 동료마다 빛기둥, 떠오르는 빛가루
        this.decal(x, z, SKILL.heal.radius * U * 2, this.tex.magic, 0x70ff90, 1.2, { additive: true, spin: 1, opacity: 0.7 });
        for (const p of allies(SKILL.heal.radius)) {
          this.pillar(p.x * U, p.y * U, 0.45, 2.6, 0x80ff90, 0.9);
          for (let i = 0; i < 16; i++) this.glow.emit(p.x * U + rand(-0.4, 0.4), rand(0, 0.4), p.y * U + rand(-0.4, 0.4), 0, rand(1, 2.2), 0, rand(0.6, 1.1), 0xb0ffb0, 0.15);
        }
        break;
      }
      case 'gnome.1': { // 냉기 파동: 바닥이 얼고 얼음 가시가 솟으며 냉기가 퍼진다
        const r = SKILL.frost.radius * U;
        this.decal(x, z, r * 2.1, this.tex.ice, 0xffffff, SKILL.frost.slow, { fade: 0.9, grow: 0.18, opacity: 0.85 });
        this.ring(x, z, 0.4, r * 2.4, 0xa8e8ff, 0.45);
        this.iceSpikes(x, z, r, 16, 1.4);
        for (let i = 0; i < 40; i++) {
          const a = rand(0, Math.PI * 2), sp = rand(2, 5);
          this.glow.emit(x, rand(0.1, 0.6), z, Math.cos(a) * sp, rand(0.2, 1.2), Math.sin(a) * sp, rand(0.5, 0.9), 0xd8f4ff, 0.14);
        }
        this.dustRing(x, z, 1.2, 0xe8f6ff, 10); // 차가운 김
        break;
      }
      case 'gnome.2': // 화염구: 손끝 불꽃 (날아가는 불덩이는 꼬리, 터지는 것은 'fireball' 폭발)
        this.burst(x + dx * 0.4, 0.6, z + dz * 0.4, 14, 1.8, 0xffa040, 0.22, 0.3);
        break;
      case 'gnome.3': { // 메테오: 떨어질 곳에 붉은 경고 원과 마법진 (떨어지는 동안)
        const r = SKILL.meteor.aoe * U;
        const t = SKILL.meteor.fall;
        this.decal(x, z, r * 2, this.tex.glowRing, 0xff3010, t, { additive: true, fade: 0.1, grow: 0.25 });
        this.decal(x, z, r * 1.8, this.tex.magic, 0xff5020, t, { additive: true, fade: 0.1, spin: 2.5, opacity: 0.7 });
        break;
      }
    }
  }

  /**
   * 근접 공격의 칼자국: 가슴 높이에서 부채꼴 모양 빛 띠가 한쪽에서 반대쪽으로 빠르게 그어지며 사라진다.
   * (x, y)는 공격한 캐릭터, aim은 바라보는 방향, range·arc는 게임 판정과 같은 부채꼴 (월드 px, 라디안)
   */
  slash(wx: number, wy: number, aim: number, range: number, arc: number, color: number) {
    const x = wx * U, z = wy * U, r = range * U;
    const full = arc >= Math.PI; // 회오리처럼 한 바퀴
    const span = full ? Math.PI * 2 : arc * 2;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.45, z);
    // 화면 x·z(월드 x·y)에서 aim 방향. 링은 XY 평면이라 눕힌 뒤, 시작 각이 aim - arc가 되게 돌린다
    pivot.rotation.y = -aim;
    pivot.rotation.z = 0.25; // 살짝 비스듬히 그어지게
    this.scene.add(pivot);
    let mesh: THREE.Mesh | null = null;
    this.add(pivot, 0.22, (k, age) => {
      const t = Math.min(1, age / 0.1); // 0.1초 동안 그어진다
      if (mesh) {
        pivot.remove(mesh);
        mesh.geometry.dispose();
      }
      const len = Math.max(0.01, span * t);
      const g = new THREE.RingGeometry(r * 0.72, r * 0.95, 24, 1, -span / 2, len).rotateX(-Math.PI / 2);
      mesh = new THREE.Mesh(g, mat);
      pivot.add(mesh);
      mat.opacity = 0.55 * Math.min(1, k * 1.8);
    }, [mat]);
  }

  /** 치명타가 들어간 자리: 노란 불꽃이 튀고 작은 고리가 퍼진다 */
  critSpark(wx: number, wy: number) {
    const x = wx * U, z = wy * U;
    this.burst(x, 0.5, z, 14, 3.5, 0xffd040, 0.18, 0.35);
    this.ring(x, z, 0.2, 1.4, 0xffc040, 0.25, 0.5);
  }

  /** 회피: 몸 주위에 하늘색 바람이 휙 돈다 */
  dodgeWisp(wx: number, wy: number) {
    const x = wx * U, z = wy * U;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.glow.emit(x + Math.cos(a) * 0.35, 0.3 + (i % 3) * 0.15, z + Math.sin(a) * 0.35, -Math.sin(a) * 3, 0.4, Math.cos(a) * 3, 0.3, 0xa0f0ff, 0.14);
    }
    this.ring(x, z, 0.3, 1.2, 0x90e8ff, 0.3);
  }

  /** 유니크 무기 효과가 걸린 자리 */
  procHit(effect: WeaponEffect, wx: number, wy: number) {
    const x = wx * U, z = wy * U;
    if (effect === 'frost') this.frostHit(wx, wy);
    else if (effect === 'burn') {
      // 화염: 불씨가 확 튀어 오른다
      this.burst(x, 0.5, z, 16, 2.4, 0xff7a20, 0.16, 0.5, -1, 1.5);
      this.burst(x, 0.5, z, 8, 1.5, 0xffe080, 0.12, 0.35);
      this.ring(x, z, 0.2, 0.9, 0xff8a30, 0.3);
    } else if (effect === 'bleed') {
      // 출혈: 붉은 피가 튀어 바닥으로 떨어진다
      this.burst(x, 0.6, z, 16, 2.2, 0xc01020, 0.12, 0.5, 7, 1.2);
      this.burst(x, 0.6, z, 6, 1.2, 0xff3040, 0.1, 0.3);
    }
  }

  /** 근접 공격 칼자국에 곁들이는 무기 효과: 선혈의 검은 핏방울, 대지 분쇄 도끼는 흙먼지와 돌 조각 */
  slashFx(wx: number, wy: number, aim: number, range: number, look: WeaponEffect) {
    const r = range * U * 0.85;
    for (let i = 0; i < 8; i++) {
      const a = aim + rand(-0.8, 0.8);
      const x = wx * U + Math.cos(a) * r * rand(0.5, 1), z = wy * U + Math.sin(a) * r * rand(0.5, 1);
      if (look === 'bleed') this.glow.emit(x, rand(0.3, 0.7), z, Math.cos(a) * 1.2, rand(0.5, 1.5), Math.sin(a) * 1.2, 0.45, i % 2 ? 0xd01828 : 0xff4050, rand(0.06, 0.11));
      else if (look === 'quake') this.smoke.emit(x, 0.1, z, Math.cos(a) * 0.8, rand(0.3, 0.8), Math.sin(a) * 0.8, 0.8, 0xa08668, 0.45, { grow: 1.5 });
    }
    if (look === 'quake') this.debris(wx * U + Math.cos(aim) * r * 0.8, wy * U + Math.sin(aim) * r * 0.8, 4, 0x6a5a48, 2.5);
  }

  /** 서리바람 활의 서리가 걸린 자리: 얼음 조각이 튀고 바닥에 얼음이 번진다 */
  frostHit(wx: number, wy: number) {
    const x = wx * U, z = wy * U;
    this.burst(x, 0.5, z, 18, 2.6, 0xbfefff, 0.12, 0.45, 5, 1.5); // 얼음 조각 (떨어진다)
    this.burst(x, 0.5, z, 10, 1.4, 0xffffff, 0.16, 0.35, 0, 0.5); // 하얀 냉기
    this.ring(x, z, 0.2, 0.9, 0x9ae4ff, 0.3);
    this.decal(x, z, 0.9, this.tex.ice, 0xffffff, 1.2, { fade: 0.6, grow: 0.2, opacity: 0.7 });
  }

  /** 폭발·충격 */
  boom(wx: number, wy: number, wr: number, kind: BoomKind | undefined) {
    const x = wx * U, z = wy * U, r = Math.max(0.3, wr * U);
    switch (kind) {
      case 'fireball':
      case 'firebomb':
      case 'meteor':
      case 'boss': {
        const big = kind === 'meteor' || kind === 'boss';
        // 불덩이는 폭발 범위보다 작게 (범위는 퍼지는 고리로 보여준다)
        this.bubble(x, 0.2, z, 0.2, r * (big ? 0.5 : 0.42), 0xff7a20, big ? 0.45 : 0.3, false, 0.55);
        this.bubble(x, 0.2, z, 0.1, r * 0.28, 0xffe080, big ? 0.3 : 0.2, false, 0.6);
        this.ring(x, z, 0.3, r * 2.1, 0xffa040, big ? 0.6 : 0.4);
        this.decal(x, z, r * (big ? 1.6 : 1.3), this.tex.scorch, 0xffffff, big ? 6 : 3.5, { fade: 1.2, grow: 0.08, opacity: 0.85 });
        this.burst(x, 0.3, z, big ? 90 : 40, big ? 9 : 6, 0xff8a30, big ? 0.3 : 0.24, big ? 0.9 : 0.6, 6, 2);
        this.burst(x, 0.3, z, big ? 40 : 16, big ? 6 : 4, 0xffe0a0, 0.16, 0.5, 4, 2);
        for (let i = 0; i < (big ? 26 : 12); i++) {
          const a = rand(0, Math.PI * 2), sp = rand(0.5, 2) * r;
          this.smoke.emit(x + Math.cos(a) * r * 0.3, rand(0.2, 0.8), z + Math.sin(a) * r * 0.3, Math.cos(a) * sp, rand(0.6, 1.6), Math.sin(a) * sp, rand(1, 1.8), 0x5a524e, rand(0.6, 1.1), { grow: 2 });
        }
        if (big) this.debris(x, z, 14, 0x5a4a40, 5);
        break;
      }
      case 'slam':
      case 'bossSlam': {
        const big = kind === 'bossSlam';
        this.decal(x, z, r * (big ? 2 : 1.7), this.tex.crack, 0xffffff, big ? 3 : 2.2, { fade: 0.8, grow: 0.06, opacity: 0.75 });
        this.ring(x, z, 0.3, r * 2.3, 0xffd8a0, 0.35);
        this.dustRing(x, z, r * 0.8, 0xa08668, big ? 26 : 18);
        this.debris(x, z, big ? 16 : 10, 0x6a5a48, big ? 5 : 3.5);
        break;
      }
      case 'rain':
        this.smoke.emit(x, 0.1, z, 0, 0.4, 0, 0.5, 0xb09a78, 0.35, { grow: 1 });
        this.burst(x, 0.15, z, 5, 1.5, 0xb0ffb0, 0.1, 0.25);
        break;
      case 'orb':
        this.bubble(x, 0.4, z, 0.1, r * 0.6, 0xb080ff, 0.25);
        this.burst(x, 0.4, z, 18, 3, 0xd0a8ff, 0.15, 0.4);
        break;
      case 'fireOrb': // 업화의 지팡이: 기본 공격 구체가 작은 불꽃으로 터진다 (화염구보다 작고 그을음도 짧게)
        this.bubble(x, 0.4, z, 0.1, r * 0.55, 0xff7a20, 0.25);
        this.burst(x, 0.4, z, 20, 3.2, 0xffa040, 0.16, 0.45, 2, 1);
        this.burst(x, 0.4, z, 8, 2, 0xffe0a0, 0.12, 0.3);
        this.decal(x, z, r * 1.1, this.tex.scorch, 0xffffff, 1.5, { fade: 0.8, grow: 0.06, opacity: 0.6 });
        for (let i = 0; i < 4; i++) this.smoke.emit(x + rand(-0.2, 0.2), 0.4, z + rand(-0.2, 0.2), rand(-0.3, 0.3), rand(0.6, 1.2), rand(-0.3, 0.3), 0.9, 0x4a4240, 0.45, { grow: 1.6 });
        break;
      default:
        this.ring(x, z, 0.3, r * 2, 0xffc070, 0.35);
    }
  }

  // ─── 매 프레임 ─────────────────────────────────────

  /** 날아가는 투사체 꼬리 (불꽃·연기·빛가루). pos는 3D 위치 */
  trail(pr: ProjectileView, pos: THREE.Vector3) {
    const j = () => rand(-0.08, 0.08);
    switch (pr.kind) {
      case 'fireball':
      case 'firebomb':
        for (let i = 0; i < 3; i++) this.glow.emit(pos.x + j(), pos.y + j(), pos.z + j(), rand(-0.4, 0.4), rand(0.2, 0.9), rand(-0.4, 0.4), rand(0.25, 0.45), i ? 0xff7a20 : 0xffd070, rand(0.2, 0.32));
        this.smoke.emit(pos.x, pos.y, pos.z, 0, 0.5, 0, 0.7, 0x5a524e, 0.3, { grow: 1.5 });
        break;
      case 'meteor':
        for (let i = 0; i < 6; i++) this.glow.emit(pos.x + j() * 4, pos.y + j() * 4, pos.z + j() * 4, rand(-1, 1), rand(1, 3), rand(-1, 1), rand(0.3, 0.6), i % 2 ? 0xff5a10 : 0xffc060, rand(0.35, 0.6));
        for (let i = 0; i < 2; i++) this.smoke.emit(pos.x + j() * 3, pos.y, pos.z + j() * 3, 0, 1, 0, 1.2, 0x4a4240, 0.7, { grow: 1.8 });
        break;
      case 'wave':
        for (let i = 0; i < 4; i++) this.glow.emit(pos.x + j() * 6, pos.y + j() * 3, pos.z + j() * 6, 0, rand(0, 0.5), 0, rand(0.2, 0.35), 0xa8e0ff, rand(0.12, 0.22));
        break;
      case 'orb':
        if (pr.look === 'burn') {
          // 업화의 지팡이: 불꽃 꼬리와 옅은 연기
          for (let i = 0; i < 2; i++) this.glow.emit(pos.x + j(), pos.y + j(), pos.z + j(), rand(-0.3, 0.3), rand(0.2, 0.8), rand(-0.3, 0.3), rand(0.2, 0.35), i ? 0xff6a10 : 0xffc050, rand(0.12, 0.2));
          if (Math.random() < 0.3) this.smoke.emit(pos.x, pos.y, pos.z, 0, 0.4, 0, 0.6, 0x5a524e, 0.22, { grow: 1.4 });
        } else this.glow.emit(pos.x + j(), pos.y + j(), pos.z + j(), 0, 0.2, 0, 0.3, 0xc8a0ff, 0.14);
        break;
      case 'iceOrb': // 얼음 마녀: 하얀 냉기 꼬리
        for (let i = 0; i < 2; i++) this.glow.emit(pos.x + j(), pos.y + j(), pos.z + j(), 0, rand(-0.2, 0.2), 0, rand(0.3, 0.5), i ? 0x9ae4ff : 0xffffff, rand(0.12, 0.2));
        break;
      case 'arrow':
        if (pr.look === 'frost') {
          // 서리바람 활: 하얀·하늘색 냉기 알갱이가 꼬리처럼 남고, 가끔 눈송이가 떨어진다
          for (let i = 0; i < 2; i++) this.glow.emit(pos.x + j(), pos.y + j(), pos.z + j(), rand(-0.2, 0.2), rand(-0.1, 0.2), rand(-0.2, 0.2), rand(0.25, 0.45), i ? 0x8fe0ff : 0xffffff, rand(0.08, 0.15));
          if (Math.random() < 0.35) this.glow.emit(pos.x + j(), pos.y, pos.z + j(), rand(-0.1, 0.1), rand(-0.8, -0.4), rand(-0.1, 0.1), 0.6, 0xe8f8ff, 0.06);
        } else if (pr.r > 7) this.glow.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.35, 0xffe08a, 0.14); // 저격·폭풍의 화살: 금빛 꼬리
        break;
    }
  }

  /** 상태 표시와 효과 진행. pos(id)는 그 캐릭터의 3D 발 위치 */
  update(dt: number, players: Player[], enemies: EnemyView[]) {
    this.clock += dt;
    this.updatePlayerStatus(dt, players);
    this.updateEnemyStatus(dt, enemies);
    this.fxs = this.fxs.filter((f) => {
      f.age += dt;
      if (f.age >= f.life) {
        this.scene.remove(f.obj);
        for (const m of f.materials) m.dispose();
        return false;
      }
      f.tick(1 - f.age / f.life, f.age, dt);
      return true;
    });
    this.glow.update(dt);
    this.smoke.update(dt);
  }

  private updatePlayerStatus(dt: number, players: Player[]) {
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      const x = p.x * U, z = p.y * U;
      // 보호막 (도발·산의 수호): 몸을 감싸는 금빛 막
      let sh = this.shields.get(p.id);
      if (p.guard > 0 && !p.dead) {
        if (!sh) {
          sh = new THREE.Mesh(this.sphere, new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25, fog: false }));
          this.scene.add(sh);
          this.shields.set(p.id, sh);
        }
        sh.position.set(x, 0.5, z);
        sh.scale.set(0.62, 0.7, 0.62);
        (sh.material as THREE.MeshBasicMaterial).opacity = (0.16 + 0.08 * Math.sin(this.clock * 6)) * Math.min(1, p.guard * 2);
        sh.visible = true;
      } else if (sh) sh.visible = false;
      // 공격 강화 (전투 함성): 발밑 붉은 고리와 피어오르는 불씨
      let au = this.auras.get(p.id);
      if (p.atkBuff > 0 && !p.dead) {
        if (!au) {
          au = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({ map: this.tex.magic, color: 0xff5030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, fog: false }));
          this.scene.add(au);
          this.auras.set(p.id, au);
        }
        au.position.set(x, 0.04, z);
        au.scale.setScalar(1.3);
        au.rotation.y += dt * 2;
        (au.material as THREE.MeshBasicMaterial).opacity = 0.45 * Math.min(1, p.atkBuff);
        au.visible = true;
        if (Math.random() < dt * 14) this.glow.emit(x + rand(-0.3, 0.3), 0.1, z + rand(-0.3, 0.3), 0, rand(0.8, 1.6), 0, rand(0.4, 0.7), 0xff7040, 0.13);
      } else if (au) au.visible = false;
      // 냉기(얼음 마녀)에 맞아 느려진 동안: 발밑 얼음과 하얀 냉기
      let ch = this.chills.get(p.id);
      if (p.chill > 0 && !p.dead) {
        if (!ch) {
          ch = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({ map: this.tex.ice, transparent: true, depthWrite: false, opacity: 0.85, fog: false, polygonOffset: true, polygonOffsetFactor: -3 }));
          ch.renderOrder = 1;
          this.scene.add(ch);
          this.chills.set(p.id, ch);
        }
        ch.position.set(x, 0.05, z);
        ch.scale.setScalar(1);
        (ch.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.min(1, p.chill * 2);
        ch.visible = true;
        if (Math.random() < dt * 10) this.glow.emit(x + rand(-0.3, 0.3), rand(0.2, 0.9), z + rand(-0.3, 0.3), 0, rand(0.1, 0.4), 0, rand(0.5, 0.8), 0xdff6ff, 0.1);
      } else if (ch) ch.visible = false;
      // 돌진 중 잔상: 검사는 푸른 바람, 수호자는 흙먼지
      if (p.dashTime > 0 && !p.dead) {
        if (p.cls === 'dwarf') {
          if (Math.random() < dt * 40) this.smoke.emit(x + rand(-0.2, 0.2), 0.1, z + rand(-0.2, 0.2), rand(-0.5, 0.5), rand(0.2, 0.6), rand(-0.5, 0.5), 0.6, 0xa89070, 0.45, { grow: 1.2 });
        } else for (let i = 0; i < 3; i++) this.glow.emit(x + rand(-0.15, 0.15), rand(0.2, 0.8), z + rand(-0.15, 0.15), 0, 0, 0, 0.25, 0xbfe6ff, rand(0.18, 0.3));
      }
    }
    for (const [id, m] of this.shields) if (!seen.has(id)) m.visible = false;
    for (const [id, m] of this.auras) if (!seen.has(id)) m.visible = false;
    for (const [id, m] of this.chills) if (!seen.has(id)) m.visible = false;
  }

  private updateEnemyStatus(dt: number, enemies: EnemyView[]) {
    const seen = new Set<number>();
    for (const e of enemies) {
      seen.add(e.id);
      const x = e.x * U, z = e.y * U;
      const size = (e.elite ? ELITE.scale : 1) * (e.kind === 'boss' ? 2.5 : 1);
      // 둔화(냉기 파동): 발밑 얼음과 하얀 냉기
      let fr = this.frostRings.get(e.id);
      if (e.slow > 0 && e.hp > 0) {
        if (!fr) {
          fr = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({ map: this.tex.ice, transparent: true, depthWrite: false, opacity: 0.85, fog: false, polygonOffset: true, polygonOffsetFactor: -3 }));
          fr.renderOrder = 1;
          this.scene.add(fr);
          this.frostRings.set(e.id, fr);
        }
        fr.position.set(x, 0.05, z);
        fr.scale.setScalar(0.9 * size);
        (fr.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.min(1, e.slow * 2);
        fr.visible = true;
        if (Math.random() < dt * 8) this.glow.emit(x + rand(-0.3, 0.3) * size, rand(0.2, 0.8) * size, z + rand(-0.3, 0.3) * size, 0, rand(0.1, 0.4), 0, rand(0.5, 0.8), 0xdff6ff, 0.1);
      } else if (fr) fr.visible = false;
      // 화염(업화의 지팡이): 몸에서 불꽃이 피어오른다
      const h = ENEMIES[e.kind].height * U * (e.elite ? ELITE.scale : 1);
      if (e.burn > 0 && e.hp > 0 && Math.random() < dt * 30) {
        this.glow.emit(x + rand(-0.25, 0.25) * size, rand(0.1, h), z + rand(-0.25, 0.25) * size, rand(-0.2, 0.2), rand(0.8, 1.6), rand(-0.2, 0.2), rand(0.35, 0.6), Math.random() < 0.5 ? 0xff7a20 : 0xffc040, rand(0.1, 0.18));
        if (Math.random() < 0.25) this.smoke.emit(x, h * 0.8, z, rand(-0.2, 0.2), rand(0.5, 1), rand(-0.2, 0.2), 0.8, 0x3a3230, 0.4, { grow: 1.5 });
      }
      // 출혈(선혈의 검): 붉은 방울이 떨어진다 (겹칠수록 많이)
      if (e.bleed > 0 && e.hp > 0 && Math.random() < dt * 12) {
        this.glow.emit(x + rand(-0.2, 0.2) * size, rand(h * 0.3, h * 0.8), z + rand(-0.2, 0.2) * size, rand(-0.3, 0.3), rand(-1.5, -0.6), rand(-0.3, 0.3), rand(0.4, 0.6), 0xc01020, rand(0.06, 0.1));
      }
      // 기절(대지 강타·방패 돌진): 머리 위를 도는 노란 별
      let st = this.stars.get(e.id);
      if (e.stun > 0.15 && e.hp > 0 && e.kind !== 'boss') {
        if (!st) {
          st = new THREE.Group();
          const mat = new THREE.MeshBasicMaterial({ color: 0xffe040, fog: false });
          for (let i = 0; i < 3; i++) {
            const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), mat);
            const a = (i / 3) * Math.PI * 2;
            s.position.set(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28);
            st.add(s);
          }
          this.scene.add(st);
          this.stars.set(e.id, st);
        }
        st.position.set(x, (ENEMIES[e.kind].height * U * 1.15 + 0.15) * (e.elite ? ELITE.scale : 1) + e.z * U * 0.6, z);
        st.rotation.y += dt * 6;
        st.visible = true;
      } else if (st) st.visible = false;
    }
    // 사라진 적의 표시는 치운다
    for (const [id, m] of this.frostRings) if (!seen.has(id)) {
      this.scene.remove(m);
      (m.material as THREE.Material).dispose();
      this.frostRings.delete(id);
    }
    for (const [id, g] of this.stars) if (!seen.has(id)) {
      this.scene.remove(g);
      this.stars.delete(id);
    }
  }
}
