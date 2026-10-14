// 3D 월드: Kenney Mini Forest / Mini Dungeon / Mini Arena 모델(CC0)로 Three.js 장면을 그린다.
// 게임 규칙은 모르고, 매 프레임 스냅샷을 받아 장면을 맞추기만 한다.
// HUD·글자는 위에 투명하게 겹친 Phaser 화면이 그리며, 그 위치 계산용으로 toScreen() 등을 제공한다.
//
// 좌표: 월드 (x, y) → 3D (x / TILE, 높이, y / TILE). 카메라는 북쪽(-z)을 비스듬히 내려다본다.
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CLASSES, ELITE, RARITY, TILE, VIEW_H, VIEW_W } from '../game/data';
import { G_ROAD, G_STONE, T_FLOOR, T_SHOP, T_TREE, zoneOfTx, type Level } from '../game/level';
import type { ClassId, Drop, Enemy, EnemyKind, Player, Projectile, Snapshot } from '../game/types';

const BASE = 'assets/';
const MODELS = {
  // 숲 (Mini Forest)
  archer: 'mini/forest/character-archer', bow: 'mini/forest/weapon-bow', tree: 'mini/forest/tree', treeHigh: 'mini/forest/tree-high',
  rocksLow: 'mini/forest/rocks-low', rocksHigh: 'mini/forest/rocks-high', stones: 'mini/forest/stones', plant: 'mini/forest/plant',
  patchGrass: 'mini/forest/patch-grass', tent: 'mini/forest/tent', flag: 'mini/forest/flag', target: 'mini/forest/target',
  // 던전 (Mini Dungeon)
  human: 'mini/dungeon/character-human', orc: 'mini/dungeon/character-orc', sword: 'mini/dungeon/weapon-sword',
  spear: 'mini/dungeon/weapon-spear', shieldRound: 'mini/dungeon/shield-round', shieldRect: 'mini/dungeon/shield-rectangle',
  wallHalf: 'mini/dungeon/wall-half', column: 'mini/dungeon/column', dRocks: 'mini/dungeon/rocks', chest: 'mini/dungeon/chest',
  barrel: 'mini/dungeon/barrel', coin: 'mini/dungeon/coin',
  // 사람 (Mini Characters)
  sage: 'mini/characters/character-male-e', merchant: 'mini/characters/character-male-b',
  // 마을 (Fantasy Town Kit)
  stall: 'town/stall-red', cart: 'town/cart', lantern: 'town/lantern',
  // 아레나 (Mini Arena)
  soldier: 'mini/arena/character-soldier', aFloor: 'mini/arena/floor', aFloorDetail: 'mini/arena/floor-detail',
  aColumn: 'mini/arena/column', aColumnBroken: 'mini/arena/column-damaged', statue: 'mini/arena/statue', aBanner: 'mini/arena/banner',
  // 회복 음식 (Food Kit)
  ham: 'food/whole-ham', apple: 'food/apple', grapes: 'food/grapes', wine: 'food/wine-red',
} as const;
/** 'dragon'(최종 보스)은 Collada 파일이라 따로 불러온다 (loadDragon) */
type ModelKey = keyof typeof MODELS | 'dragon';
type Model = { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

const U = 1 / TILE; // 월드 단위 → 3D 단위
const PITCH = THREE.MathUtils.degToRad(56); // 카메라가 내려다보는 각도
const CAM_DIST = 11.5; // 카메라와 캐릭터 사이 거리
const CHAR_SCALE = 1.25;
const DRAGON_SCALE = 3; // 드래곤 모델 배율 (CHAR_SCALE이 한 번 더 곱해진다) // 캐릭터 모델(키 약 0.8칸)을 맵에 비해 조금 키운다
const Z_SCALE = 1 / 40; // 투사체 높이(px) → 3D 높이

const GRASS = [0x5c9a44, 0x8a9448, 0x4e6250, 0x8a7450];
const ROAD = 0xb59866;
const STONE = 0x9a9aa4;

/**
 * 떨어진 물건 모델 배율. 원본 크기가 제각각이라(사과 0.2칸, 햄 0.64칸, 포도주 병 0.7칸 등)
 * 화면에서 비슷한 크기(높이 약 0.4~0.5칸)로 보이게 맞춘 값.
 */
const DROP_SCALE: Partial<Record<ModelKey, number>> = { chest: 0.6, ham: 0.9, apple: 2.2, grapes: 1.4, wine: 1.0, coin: 0.7 };

/** 직업·적별 3D 모델 설정 */
type Look = {
  model: ModelKey;
  scale: [number, number, number];
  tint?: number;
  weapons?: {
    model: ModelKey; bone: 'arm-right' | 'arm-left'; pos: [number, number, number]; rot: [number, number, number]; scale: number;
    glowTip?: number; // 무기 끝에 빛나는 구슬 (지팡이)
  }[];
  attack: string; // 공격 애니메이션
  /** 게임이 쓰는 애니메이션 이름 → 이 모델의 클립 이름 (Kenney 캐릭터가 아닌 모델용) */
  anims?: Record<string, string>;
};
const SWORD = { model: 'sword' as const, bone: 'arm-right' as const, pos: [-0.02, -0.2, 0.06] as [number, number, number], rot: [0.5, 0, 0] as [number, number, number], scale: 0.9 };
const SHIELD = { model: 'shieldRound' as const, bone: 'arm-left' as const, pos: [0.06, -0.16, 0.08] as [number, number, number], rot: [0, 0, 0] as [number, number, number], scale: 0.85 };
const BOW = { model: 'bow' as const, bone: 'arm-left' as const, pos: [0.03, -0.16, 0.1] as [number, number, number], rot: [0, 0, 0] as [number, number, number], scale: 0.9 };
const SPEAR = { model: 'spear' as const, bone: 'arm-right' as const, pos: [-0.02, -0.2, 0.06] as [number, number, number], rot: [0.2, 0, 0] as [number, number, number], scale: 0.9 };

const PLAYER_LOOKS: Record<ClassId, Look> = {
  swordsman: { model: 'human', scale: [1, 1, 1], weapons: [SWORD, SHIELD], attack: 'attack-melee-right' },
  dwarf: { model: 'soldier', scale: [1.15, 0.85, 1.15], tint: 0xffd0a0, weapons: [SWORD, { ...SHIELD, model: 'shieldRect' }], attack: 'attack-melee-right' },
  elf: { model: 'archer', scale: [0.95, 1.08, 0.95], weapons: [BOW], attack: 'holding-left-shoot' },
  // 흰 가운에 안경을 쓴 학자 모습 + 끝에 보라 구슬이 빛나는 지팡이
  gnome: { model: 'sage', scale: [0.85, 0.78, 0.85], weapons: [{ ...SPEAR, glowTip: 0xb070ff }], attack: 'attack-melee-right' },
};
const ENEMY_LOOKS: Record<Exclude<EnemyKind, 'slime'>, Look> = {
  goblin: { model: 'orc', scale: [0.8, 0.8, 0.8], tint: 0xd8ffb0, weapons: [{ ...SWORD, scale: 0.7 }], attack: 'attack-melee-right' },
  skeleton: { model: 'soldier', scale: [0.9, 1, 0.9], tint: 0xeeeedd, weapons: [BOW], attack: 'holding-left-shoot' },
  orc: { model: 'orc', scale: [1.25, 1.25, 1.25], weapons: [SPEAR], attack: 'attack-melee-right' },
  // 최종 보스: OpenGameArt "Cethiel's Dragon 3D" (CC0). 클립은 idle·walk·attack·die 넷뿐이라 나머지는 비슷한 것으로 대신한다
  boss: {
    model: 'dragon', scale: [DRAGON_SCALE, DRAGON_SCALE, DRAGON_SCALE], attack: 'attack',
    anims: { 'attack-melee-right': 'attack', 'holding-right': 'attack', sprint: 'walk', jump: 'idle' },
  },
};

type Char = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: string;
  oneShotUntil: number;
  materials: THREE.MeshStandardMaterial[];
  baseEmissive: THREE.Color[];
  lastX: number;
  lastZ: number;
  prevAtk: number;
  attack: string;
};

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class World3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private models = new Map<ModelKey, Model>();
  private dying: { root: THREE.Object3D; mixer: THREE.AnimationMixer; until: number }[] = []; // 죽는 모습을 보여 주는 중인 적
  private players = new Map<string, Char>();
  private enemies = new Map<number, Char | THREE.Mesh>();
  private eliteRings = new Map<number, THREE.Mesh>(); // 중간보스 발밑의 금빛 고리
  private projectiles = new Map<number, THREE.Object3D>();
  private drops = new Map<number, THREE.Object3D>();
  private npcs: Char[] = []; // 상인처럼 제자리에서 움직이기만 하는 캐릭터
  private camTarget = new THREE.Vector3();
  private camReady = false;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pxPerUnit = 40;
  private clock = 0;

  constructor(private phaserCanvas: HTMLCanvasElement, private level: Level) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '0';
    phaserCanvas.style.position = 'relative';
    phaserCanvas.style.zIndex = '1';
    phaserCanvas.parentElement!.insertBefore(this.canvas, phaserCanvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0x1d2620);
    this.scene.fog = new THREE.Fog(0x1d2620, 22, 40);
    this.camera = new THREE.PerspectiveCamera(38, VIEW_W / VIEW_H, 0.5, 80);

    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x445533, 1.6));
    this.sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
  }

  async load() {
    const loader = new GLTFLoader();
    await Promise.all([
      ...(Object.keys(MODELS) as (keyof typeof MODELS)[]).map(async (k) => {
        const g = await loader.loadAsync(`${BASE}${MODELS[k]}.glb`);
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.models.set(k, g);
      }),
      this.loadDragon(),
    ]);
    this.buildWorld();
  }

  /**
   * 최종 보스 드래곤: 몸(dragon.dae)과 동작별 애니메이션 파일 4개.
   * 애니메이션 파일의 트랙은 그 파일 안에서만 통하는 노드 id(uuid)를 가리키므로 뼈 이름으로 바꿔서 붙인다.
   */
  private async loadDragon() {
    const loader = new ColladaLoader();
    const dir = `${BASE}dragon/`;
    const [body, black, ...clips] = await Promise.all([
      loader.loadAsync(`${dir}dragon.dae`),
      new THREE.TextureLoader().loadAsync(`${dir}dragon_black.png`),
      ...['idle', 'walk', 'attack', 'die'].map(async (name) => {
        const file = await loader.loadAsync(`${dir}dragon_${name}.dae`);
        const tracks = file.scene.animations.flatMap((clip) => clip.tracks).map((t) => {
          const dot = t.name.indexOf('.');
          const node = file.scene.getObjectByProperty('uuid', t.name.slice(0, dot));
          const track = t.clone();
          track.name = `${node?.name ?? t.name.slice(0, dot)}${t.name.slice(dot)}`;
          return track;
        });
        return new THREE.AnimationClip(name, -1, tracks);
      }),
    ]);
    // 검은 비늘 텍스처로 바꾸고, 피격 번쩍임(emissive)이 되도록 표준 재질로
    black.colorSpace = THREE.SRGBColorSpace;
    body.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = new THREE.MeshStandardMaterial({ map: black, roughness: 0.75 });
      mesh.castShadow = true;
      mesh.frustumCulled = false; // 애니메이션으로 몸이 원래 경계 밖까지 움직인다
    });
    // 원본은 머리가 -x를 향한다. 다른 캐릭터처럼 +z를 보게 돌려 둔다
    const yaw = new THREE.Group();
    yaw.rotation.y = Math.PI / 2;
    yaw.add(body.scene);
    const root = new THREE.Group();
    root.add(yaw);
    this.models.set('dragon', { scene: root, animations: clips });
  }

  // ─── 정적인 맵 ─────────────────────────────────────

  private buildWorld() {
    const { w, h, tiles, ground } = this.level;

    // 바닥: 칸마다 얇은 상자 하나 (인스턴싱으로 한 번에 그린다)
    const box = new THREE.BoxGeometry(1, 0.4, 1);
    const groundMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), w * h);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let i = 0;
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        m.makeTranslation(tx + 0.5, -0.2, ty + 0.5);
        groundMesh.setMatrixAt(i, m);
        const g = ground[ty * w + tx];
        c.setHex(g === G_ROAD ? ROAD : g === G_STONE ? STONE : GRASS[zoneOfTx(this.level, tx) - 1]);
        c.multiplyScalar(0.92 + hash(tx, ty) * 0.12);
        groundMesh.setColorAt(i++, c);
      }
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    // 장애물과 장식
    const place = new Map<ModelKey, THREE.Matrix4[]>();
    const put = (k: ModelKey, x: number, z: number, rot = 0, s = 1, y = 0) => {
      const mat = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
        new THREE.Vector3(s, s, s),
      );
      if (!place.has(k)) place.set(k, []);
      place.get(k)!.push(mat);
    };
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        const t = tiles[ty * w + tx];
        const r = hash(tx, ty), r2 = hash(ty, tx);
        const x = tx + 0.5, z = ty + 0.5;
        if (t === T_TREE) {
          put(r < 0.4 ? 'treeHigh' : 'tree', x + (r2 - 0.5) * 0.3, z + (r - 0.5) * 0.3, r2 * Math.PI * 2, 0.85 + r * 0.3);
        } else if (t === T_SHOP) {
          // 상점 가판대는 아래에서 따로 놓는다
        } else if (t !== T_FLOOR) {
          let around = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = tx + dx, ny = ty + dy;
              if ((dx || dy) && (nx < 0 || ny < 0 || nx >= w || ny >= h || tiles[ny * w + nx] !== T_FLOOR)) around++;
            }
          if (this.level.zoneStartsTx.includes(tx)) put(r < 0.7 ? 'wallHalf' : 'column', x, z, Math.PI / 2, 1);
          else if (around >= 6) put('rocksHigh', x, z, Math.floor(r2 * 4) * (Math.PI / 2), 1.05);
          else put(r < 0.5 ? 'rocksLow' : r < 0.8 ? 'dRocks' : 'stones', x, z, r2 * Math.PI * 2, 1);
        } else if (ground[ty * w + tx] === G_STONE) {
          put(r < 0.85 ? 'aFloor' : 'aFloorDetail', x, z, 0, 1, 0.001);
        } else if (ground[ty * w + tx] !== G_ROAD && r < 0.05) {
          put(r2 < 0.5 ? 'plant' : 'patchGrass', x, z, r2 * Math.PI * 2, 0.9);
        }
      }

    // 상점: 가판대 앞(길이 있는 남쪽)에 상인, 옆에 수레와 가로등
    for (const sh of this.level.shops) {
      const x = sh.x * U, z = sh.y * U;
      put('stall', x, z, 0, 1.6);
      put('cart', x + 1.6, z + 0.2, -0.5, 1.2);
      put('lantern', x - 1.3, z + 0.8, 0, 1.4);
      const npc = this.makeChar({ model: 'merchant', scale: [1, 1, 1], attack: 'emote-yes' });
      npc.root.position.set(x, 0, z + 0.6);
      npc.root.rotation.y = 0; // +z(남쪽, 길 쪽)를 본다
      this.npcs.push(npc);
    }

    // 출발 지점 야영지
    const s = { x: this.level.start.x * U, z: this.level.start.y * U };
    put('tent', s.x - 2, s.z - 2.2, 0.4, 1.2);
    put('flag', s.x - 0.5, s.z - 2.4, 0, 1.2);
    put('target', s.x + 2, s.z + 2.6, -0.5, 1);
    put('barrel', s.x - 2.6, s.z - 0.6, 0, 0.9);

    // 보스 방: 기둥으로 둘러싸고 뒤쪽에 석상
    const ac = { x: this.level.arenaCenter.x * U, z: this.level.arenaCenter.y * U };
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const px = ac.x + Math.cos(a) * 10.5, pz = ac.z + Math.sin(a) * 9;
      const tx = Math.floor(px), ty = Math.floor(pz);
      if (tx >= 0 && ty >= 0 && tx < w && ty < h && tiles[ty * w + tx] === T_FLOOR && Math.cos(a) > -0.7) {
        put(k % 3 === 0 ? 'aColumnBroken' : 'aColumn', px, pz, 0, 1.4);
      }
    }
    put('statue', ac.x + 10, ac.z, -Math.PI / 2, 2);
    put('aBanner', ac.x + 9.5, ac.z - 3, -Math.PI / 2, 1.6);
    put('aBanner', ac.x + 9.5, ac.z + 3, -Math.PI / 2, 1.6);

    for (const [k, mats] of place) this.instance(k, mats);
  }

  /** 같은 모델을 여러 곳에 그릴 때 인스턴싱 (모델 안의 메시마다 InstancedMesh 하나) */
  private instance(key: ModelKey, mats: THREE.Matrix4[]) {
    const root = this.models.get(key)!.scene;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
      const local = mesh.matrixWorld;
      mats.forEach((mt, i) => im.setMatrixAt(i, mt.clone().multiply(local)));
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.scene.add(im);
    });
  }

  // ─── 캐릭터 ─────────────────────────────────────────

  private makeChar(look: Look): Char {
    const g = this.models.get(look.model)!;
    const root = cloneSkinned(g.scene);
    root.scale.set(look.scale[0] * CHAR_SCALE, look.scale[1] * CHAR_SCALE, look.scale[2] * CHAR_SCALE);
    const materials: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (look.tint !== undefined) mat.color.multiply(new THREE.Color(look.tint));
      mesh.material = mat;
      materials.push(mat);
    });
    for (const wpn of look.weapons ?? []) {
      const bone = root.getObjectByName(wpn.bone);
      if (!bone) continue;
      const wm = this.models.get(wpn.model)!.scene.clone();
      wm.position.set(...wpn.pos);
      wm.rotation.set(...wpn.rot);
      wm.scale.setScalar(wpn.scale);
      if (wpn.glowTip !== undefined) {
        // 창끝을 가리는 위치(모델의 가장 높은 곳)에 구슬을 단다
        const top = new THREE.Box3().setFromObject(this.models.get(wpn.model)!.scene).max.y;
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 12, 8),
          new THREE.MeshStandardMaterial({ color: wpn.glowTip, emissive: wpn.glowTip, emissiveIntensity: 1.5 }),
        );
        orb.position.y = top;
        wm.add(orb);
      }
      bone.add(wm);
    }
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of g.animations) actions.set(clip.name, mixer.clipAction(clip));
    for (const [alias, clip] of Object.entries(look.anims ?? {})) {
      const a = actions.get(clip);
      if (a) actions.set(alias, a);
    }
    this.scene.add(root);
    const ch: Char = {
      root, mixer, actions, current: '', oneShotUntil: 0, materials,
      baseEmissive: materials.map((m) => m.emissive.clone()), lastX: NaN, lastZ: NaN, prevAtk: 0, attack: look.attack,
    };
    this.play(ch, 'idle');
    return ch;
  }

  private play(ch: Char, name: string, once = false) {
    if (ch.current === name && !once) return;
    const next = ch.actions.get(name);
    if (!next) return;
    const prev = ch.actions.get(ch.current);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(0.12).play();
    if (prev && prev !== next) prev.fadeOut(0.12);
    ch.current = name;
    if (once) ch.oneShotUntil = this.clock + next.getClip().duration * 0.9;
  }

  private placeChar(ch: Char, x: number, y: number, aim: number, lift = 0) {
    const px = x * U, pz = y * U;
    const moved = Number.isNaN(ch.lastX) ? 0 : Math.hypot(px - ch.lastX, pz - ch.lastZ);
    ch.root.position.set(px, lift, pz);
    // 모델은 +z를 바라보므로 월드 조준 방향 (cos, sin) → (x, z)
    const target = Math.atan2(Math.cos(aim), Math.sin(aim));
    ch.root.rotation.y += Math.atan2(Math.sin(target - ch.root.rotation.y), Math.cos(target - ch.root.rotation.y)) * 0.35;
    ch.lastX = px;
    ch.lastZ = pz;
    return moved;
  }

  private flash(ch: Char, on: boolean, color = 0xffffff) {
    ch.materials.forEach((m, i) => m.emissive.copy(on ? new THREE.Color(color).multiplyScalar(0.6) : ch.baseEmissive[i]));
  }

  // ─── 매 프레임 ─────────────────────────────────────

  update(s: Snapshot, myId: string, dt: number) {
    this.clock += dt;
    this.syncPlayers(s, dt);
    this.syncEnemies(s, dt);
    this.syncProjectiles(s);
    this.syncDrops(s);
    for (const npc of this.npcs) npc.mixer.update(dt);

    const me = s.players.find((p) => p.id === myId);
    if (me) {
      const t = new THREE.Vector3(me.x * U, 0, me.y * U);
      if (!this.camReady) {
        this.camTarget.copy(t);
        this.camReady = true;
      }
      this.camTarget.lerp(t, Math.min(1, dt * 8));
    }
    const ct = this.camTarget;
    this.camera.position.set(ct.x, ct.y + Math.sin(PITCH) * CAM_DIST, ct.z + Math.cos(PITCH) * CAM_DIST);
    this.camera.lookAt(ct);
    this.camera.updateMatrixWorld();
    this.sun.position.set(ct.x - 8, 18, ct.z + 6);
    this.sun.target.position.copy(ct);

    // 화면 1월드칸이 몇 px인지 (HUD 글자 위치 계산용)
    const a = this.project3(ct.x, 0, ct.z), b = this.project3(ct.x + 1, 0, ct.z);
    this.pxPerUnit = Math.abs(b.sx - a.sx);

    this.syncCanvas();
    this.renderer.render(this.scene, this.camera);
  }

  private syncPlayers(s: Snapshot, dt: number) {
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      let ch = this.players.get(p.id);
      if (!ch) this.players.set(p.id, (ch = this.makeChar(PLAYER_LOOKS[p.cls])));
      this.placeChar(ch, p.x, p.y, p.aim);
      this.animate(ch, p, dt);
      // 무적(피격 직후) 깜빡임
      ch.root.visible = !(p.invuln > 0 && p.dashTime <= 0 && !p.dead && Math.floor(this.clock * 20) % 2 === 0);
      ch.mixer.update(dt);
    }
    for (const [id, ch] of this.players) if (!seen.has(id)) {
      this.scene.remove(ch.root);
      this.players.delete(id);
    }
  }

  private animate(ch: Char, p: Player, _dt: number) {
    if (p.dead) {
      if (ch.current !== 'die') this.play(ch, 'die', true);
      return;
    }
    if (ch.current === 'die') ch.current = '';
    const started = p.atkAnim > 0 && p.atkAnim > ch.prevAtk + 0.01;
    ch.prevAtk = p.atkAnim;
    if (started) {
      this.play(ch, CLASSES[p.cls].attack.kind === 'melee' || p.dashTime > 0 ? 'attack-melee-right' : ch.attack, true);
      return;
    }
    if (this.clock < ch.oneShotUntil) return;
    this.play(ch, p.dashTime > 0 ? 'sprint' : p.moving ? 'walk' : 'idle');
  }

  private syncEnemies(s: Snapshot, dt: number) {
    const seen = new Set<number>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let ent = this.enemies.get(e.id);
      if (!ent) {
        const size = e.elite ? ELITE.scale : 1;
        if (e.kind === 'slime') ent = this.makeSlime(size);
        else {
          const look = ENEMY_LOOKS[e.kind];
          ent = this.makeChar({ ...look, scale: [look.scale[0] * size, look.scale[1] * size, look.scale[2] * size] });
        }
        this.enemies.set(e.id, ent);
        if (e.elite) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.55, 0.72, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.8, depthWrite: false }),
          );
          this.scene.add(ring);
          this.eliteRings.set(e.id, ring);
        }
      }
      const ring = this.eliteRings.get(e.id);
      if (ring) {
        ring.position.set(e.x * U, 0.03, e.y * U);
        ring.rotation.y = this.clock;
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(this.clock * 4);
      }
      if ((ent as THREE.Mesh).isMesh) this.updateSlime(ent as THREE.Mesh, e);
      else this.updateEnemyChar(ent as Char, e, dt);
    }
    for (const [id, ent] of this.enemies) if (!seen.has(id)) {
      this.enemies.delete(id);
      const ring = this.eliteRings.get(id);
      if (ring) {
        this.scene.remove(ring);
        this.eliteRings.delete(id);
      }
      const ch = ent as Char;
      // 화면 안에서 사라졌으면 죽은 것: 쓰러지는 모습을 보여 주고 치운다 (멀어져서 빠진 적은 바로 치운다)
      const { sx, sy } = this.project3(ch.root?.position.x ?? 0, 0, ch.root?.position.z ?? 0);
      const onScreen = sx > -50 && sx < VIEW_W + 50 && sy > -50 && sy < VIEW_H + 50;
      if (ch.root && onScreen && ch.actions.has('die')) {
        this.flash(ch, false);
        this.play(ch, 'die', true);
        this.dying.push({ root: ch.root, mixer: ch.mixer, until: this.clock + ch.actions.get('die')!.getClip().duration + 0.8 });
      } else this.scene.remove(ch.root ?? (ent as THREE.Mesh));
    }
    this.dying = this.dying.filter((d) => {
      d.mixer.update(dt);
      if (this.clock < d.until) return true;
      this.scene.remove(d.root);
      return false;
    });
  }

  private updateEnemyChar(ch: Char, e: Enemy, dt: number) {
    const moved = this.placeChar(ch, e.x, e.y, e.aim, (e.z * U) * 0.6);
    this.flash(ch, e.hurt > 0 || (e.state === 'windup' && Math.floor(this.clock * 12) % 2 === 0), e.hurt > 0 ? 0xffffff : 0xff3020);
    if (this.clock >= ch.oneShotUntil) {
      if (e.state === 'attack' || (e.kind === 'skeleton' && e.timer > 1.9)) this.play(ch, ch.attack, true);
      else if (e.state === 'charge') this.play(ch, 'sprint');
      else if (e.state === 'leap') this.play(ch, 'jump');
      else if (e.state === 'windup') this.play(ch, 'holding-right');
      else this.play(ch, moved > 0.002 ? 'walk' : 'idle');
    }
    ch.mixer.update(dt * (e.slow > 0 ? 0.5 : 1));
  }

  private makeSlime(size = 1): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.42 * size, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x66dd66, roughness: 0.3, transparent: true, opacity: 0.9 }),
    );
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private updateSlime(mesh: THREE.Mesh, e: Enemy) {
    const lift = e.z * U * 1.5;
    const squash = lift > 0.05 ? 1.15 : 0.85;
    mesh.position.set(e.x * U, 0.3 * squash * (e.elite ? ELITE.scale : 1) + lift, e.y * U);
    mesh.scale.set(1 / Math.sqrt(squash), squash * 0.75, 1 / Math.sqrt(squash));
    (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(e.hurt > 0 ? 0x666666 : 0x000000);
  }

  private syncProjectiles(s: Snapshot) {
    const seen = new Set<number>();
    for (const pr of s.projectiles) {
      seen.add(pr.id);
      let obj = this.projectiles.get(pr.id);
      if (!obj) {
        obj = this.makeProjectile(pr);
        this.scene.add(obj);
        this.projectiles.set(pr.id, obj);
      }
      const falling = pr.kind === 'rain' || pr.kind === 'meteor' || pr.kind === 'firebomb';
      const y = pr.kind === 'shockwave' ? 0.05 : falling ? pr.z * Z_SCALE * 0.6 + 0.2 : 0.55 + pr.z * Z_SCALE;
      obj.position.set(pr.x * U, y, pr.y * U);
      if (pr.kind === 'arrow' || pr.kind === 'enemyArrow' || pr.kind === 'wave') {
        // 진행 방향(높이 변화 포함)으로 돌린다
        const dir = new THREE.Vector3(pr.vx * U, pr.vz * Z_SCALE, pr.vy * U);
        obj.lookAt(obj.position.clone().add(dir));
      }
    }
    for (const [id, obj] of this.projectiles) if (!seen.has(id)) {
      this.scene.remove(obj);
      this.projectiles.delete(id);
    }
  }

  private makeProjectile(pr: Projectile): THREE.Object3D {
    const glow = (color: number, r: number) =>
      new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
    switch (pr.kind) {
      case 'arrow':
      case 'enemyArrow':
      case 'rain': {
        const len = pr.r > 7 ? 0.8 : 0.55;
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, len, 5).rotateX(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: pr.kind === 'enemyArrow' ? 0xff6a50 : 0xf0e6c0, emissive: pr.r > 7 ? 0x665522 : 0x000000 }),
        );
        if (pr.kind === 'rain') mesh.rotation.x = Math.PI / 2;
        return mesh;
      }
      case 'orb': return glow(0xc89aff, 0.18);
      case 'fireball': return glow(0xff7a20, 0.35);
      case 'meteor': return glow(0xff5010, 0.9);
      case 'firebomb': return glow(0xff6a1a, 0.32); // 흑룡의 화염탄
      case 'shockwave':
        return new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.06, 16),
          new THREE.MeshStandardMaterial({ color: 0xff9a40, emissive: 0xff7a20, transparent: true, opacity: 0.8 }),
        );
      case 'wave':
        return new THREE.Mesh(
          new THREE.TorusGeometry(0.9, 0.08, 6, 20, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x88ccff, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }),
        );
    }
  }

  private syncDrops(s: Snapshot) {
    const seen = new Set<number>();
    for (const d of s.drops) {
      seen.add(d.id);
      let obj = this.drops.get(d.id);
      if (!obj) {
        obj = this.makeDrop(d);
        this.scene.add(obj);
        this.drops.set(d.id, obj);
      }
      // 바닥 빛은 땅에 두고, 물건만 통통 튀며 돈다
      obj.position.set(d.x * U, 0, d.y * U);
      const model = obj.userData.model as THREE.Object3D;
      model.position.y = (d.z > 0 ? d.z : Math.sin(this.clock * 3 + d.id) * 3 + 5) * U;
      model.rotation.y = this.clock * 1.2 + d.id;
    }
    for (const [id, obj] of this.drops) if (!seen.has(id)) {
      this.scene.remove(obj);
      this.drops.delete(id);
    }
  }

  /**
   * 바닥에 떨어진 물건: 장비는 등급 색으로 빛나는 상자, 회복 음식은 HP(빨강)·MP(파랑) 빛 위의 음식.
   * 음식 모델은 종류마다 두 가지 중 하나 (id로 정해서 모두에게 같은 모습).
   */
  private makeDrop(d: Drop): THREE.Object3D {
    const group = new THREE.Group();
    let key: ModelKey, glow: number;
    if (d.kind === 'item') {
      key = 'chest';
      glow = new THREE.Color(RARITY[d.item!.rarity].color).getHex();
    } else if (d.kind === 'gold') {
      key = 'coin';
      glow = 0xffcc33;
    } else if (d.kind === 'hpFood') {
      key = d.id % 2 ? 'ham' : 'apple';
      glow = 0xff4050;
    } else {
      key = d.id % 2 ? 'grapes' : 'wine';
      glow = 0x4a80ff;
    }

    const model = this.models.get(key)!.scene.clone();
    model.scale.setScalar(DROP_SCALE[key] ?? 1);
    if (d.kind === 'item') {
      // 장비 상자는 등급 색으로 은은하게 빛난다
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.emissive = new THREE.Color(glow).multiplyScalar(0.35);
        mesh.material = mat;
      });
    }
    group.add(model);
    group.userData.model = model;

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    disc.position.y = 0.02;
    group.add(disc);
    return group;
  }

  // ─── 화면 좌표 (HUD·입력용) ─────────────────────────
  // 모두 게임 월드 좌표(px) 기준이다. 화면 좌표는 게임 화면(VIEW_W×VIEW_H) 기준.

  private project3(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { sx: ((v.x + 1) / 2) * VIEW_W, sy: ((1 - v.y) / 2) * VIEW_H };
  }

  /** 월드 바닥의 한 점 → 화면 좌표 */
  toScreen(x: number, y: number) {
    return this.project3(x * U, 0, y * U);
  }

  /** 화면 좌표 → 월드 바닥의 한 점 (마우스 조준용) */
  toWorld(sx: number, sy: number) {
    const ndc = new THREE.Vector2((sx / VIEW_W) * 2 - 1, 1 - (sy / VIEW_H) * 2);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return { x: this.camTarget.x / U, y: this.camTarget.z / U };
    return { x: hit.x / U, y: hit.z / U };
  }

  /** 화면 기준 방향(키보드·스틱) → 월드 방향. 카메라가 북쪽을 보므로 화면 오른쪽 = +x, 화면 위 = -y */
  screenDirToWorld(dx: number, dy: number) {
    const len = Math.hypot(dx, dy);
    return len ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
  }

  /** 월드에서 반지름 r인 바닥 원이 화면에서 보이는 타원의 폭/높이 */
  groundEllipse(r: number) {
    const w = 2 * r * U * this.pxPerUnit;
    return { w, h: w * Math.sin(PITCH) };
  }

  /** 바닥에서 높이 z(월드 px)인 지점이 화면에서 얼마나 위에 보이는지(px) */
  heightPx(z: number) {
    return z * U * this.pxPerUnit * Math.cos(PITCH) * 0.85;
  }

  /** Phaser 캔버스와 같은 자리·크기로 3D 캔버스를 맞춘다 (창 크기 변경 대응) */
  private syncCanvas() {
    const pc = this.phaserCanvas;
    const st = this.canvas.style;
    const left = `${pc.offsetLeft}px`, top = `${pc.offsetTop}px`;
    const width = `${pc.clientWidth}px`, height = `${pc.clientHeight}px`;
    if (st.left !== left) st.left = left;
    if (st.top !== top) st.top = top;
    if (st.width !== width) st.width = width;
    if (st.height !== height) st.height = height;
  }

  destroy() {
    this.renderer.dispose();
    this.canvas.remove();
  }
}
