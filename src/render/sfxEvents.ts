// 게임 이벤트 → 효과음. 어떤 상황에 어떤 소리를 낼지 여기서 고른다 (소리 파일 목록은 Sound.ts).
import type { EnemyKind, GameEvent } from '../game/types';
import type { Sound, SoundName } from './Sound';

/** 적이 쓰러질 때 내는 소리 (종류별) */
const DEATH: Record<EnemyKind, SoundName[]> = {
  slime: ['slime1', 'slime2', 'slime3'],
  hound: ['bite'],
  goblin: ['beast1', 'beast2', 'beast3'],
  thrower: ['beast1', 'beast2', 'beast3'],
  bandit: ['beast1', 'beast2', 'beast3'],
  assassin: ['beast1', 'beast2'],
  skeleton: ['shade1', 'shade2'],
  zombie: ['shade1', 'shade2'],
  iceWitch: ['shade1', 'shade2'],
  pyromancer: ['shade1', 'shade2'],
  orc: ['ogre1', 'ogre2'],
  raider: ['ogre1', 'ogre2'],
  darkKnight: ['ogre1', 'ogre2'],
  flameKnight: ['ogre1', 'ogre2'],
  boss: ['giant3'],
};

export function playEventSound(sfx: Sound, e: GameEvent, myId: string) {
  const at = 'x' in e && 'y' in e ? { x: e.x, y: e.y } : undefined;
  switch (e.t) {
    case 'dmg':
      if (e.dot) break; // 지속 피해는 0.5초마다 들어가 소리를 내지 않는다
      if (e.toPlayer) sfx.play('hurt', { at, volume: 0.6 });
      else if (e.crit) sfx.play('hitHeavy', { at, volume: 0.55 });
      else sfx.pick(['hit1', 'hit2'], { at, volume: 0.4 });
      break;
    case 'swing': // 근접 공격 (플레이어는 칼 휘두르는 소리, 적은 낮게)
      if (e.enemy) sfx.play('swing2', { at, volume: 0.35, rate: 0.75 });
      else sfx.pick(['swing1', 'swing2', 'swing3'], { at, volume: 0.5 });
      break;
    case 'shoot':
      if (e.kind === 'arrow') sfx.play('swing3', { at, volume: 0.35, rate: 1.6 }); // 시위 소리
      else if (e.kind === 'orb') sfx.play('magic', { at, volume: 0.25, rate: 1.4 });
      else if (e.kind === 'iceOrb') sfx.play('magic', { at, volume: 0.35, rate: 1.7 });
      else if (e.kind === 'firebomb') sfx.play('magic', { at, volume: 0.4, rate: 0.7 });
      else sfx.play('swing3', { at, volume: 0.3, rate: 1.25 }); // 적 화살·돌
      break;
    case 'boom':
      if (e.kind === 'meteor' || e.kind === 'boss') sfx.play('hitHeavy', { at, volume: 1, rate: 0.42 });
      else if (e.kind === 'fireball' || e.kind === 'firebomb') sfx.play('hitHeavy', { at, volume: 0.7, rate: 0.6 });
      else if (e.kind === 'slam' || e.kind === 'bossSlam') sfx.play('hitHeavy', { at, volume: 0.85, rate: 0.5 });
      else if (e.kind === 'rain') sfx.play('hit2', { at, volume: 0.15, rate: 1.3 });
      else sfx.play('hit1', { at, volume: 0.3, rate: 0.75 });
      break;
    case 'skill': {
      const mine = e.pid === myId;
      const vol = mine ? 0.7 : 0.4;
      if (e.idx === 3) sfx.play('spell', { at, volume: vol, vary: 0 }); // 최종 스킬
      else if (e.cls === 'swordsman') sfx.pick(['unsheathe1', 'unsheathe2'], { at, volume: vol });
      else if (e.cls === 'dwarf') sfx.play('unsheathe2', { at, volume: vol, rate: 0.75 });
      else if (e.cls === 'elf') sfx.play('swing3', { at, volume: vol, rate: 1.5 });
      else sfx.play('magic', { at, volume: vol, rate: e.idx === 1 ? 1.5 : 1 });
      break;
    }
    case 'kill':
      sfx.pick(DEATH[e.kind], { at, volume: e.kind === 'boss' ? 1 : e.elite ? 0.8 : 0.4, rate: e.elite ? 0.8 : 1 });
      break;
    case 'levelup':
      sfx.play('levelup', { volume: e.pid === myId ? 0.85 : 0.3, vary: 0 });
      break;
    case 'unlock':
      if (e.pid === myId) sfx.play('unsheathe1', { volume: 0.6 });
      break;
    case 'gold':
      if (e.pid === myId) sfx.play('coin', { volume: 0.3 });
      break;
    case 'bought':
      if (e.pid === myId) sfx.play('buy', { volume: 0.6 });
      break;
    case 'equip':
      if (e.pid === myId) sfx.play('equip', { volume: 0.6 });
      break;
    case 'stash':
      if (e.pid === myId) sfx.play('pickup', { volume: 0.5 });
      break;
    case 'heal':
      if (!e.passive) sfx.play('drink1', { at, volume: 0.35 }); // 패시브 흡혈은 자주 생겨 소리를 내지 않는다
      break;
    case 'mana':
      if (!e.passive) sfx.play('drink2', { at, volume: 0.3 });
      break;
    case 'notice':
      if (e.pid === myId) sfx.play('uiError', { volume: 0.45 });
      break;
    case 'dodge':
      sfx.play('swing2', { at, volume: 0.35, rate: 1.8 });
      break;
    case 'warp': // 던전 문 순간이동
      sfx.play('spell', { at, volume: 0.45, rate: 1.4 });
      break;
    case 'proc': // 유니크 무기 효과: 서리는 높은 마법 소리, 화염은 낮은 마법 소리, 출혈은 짧게 물어뜯는 소리 (대지 가르기는 boom이 낸다)
      if (e.effect === 'frost') sfx.play('magic', { at, volume: 0.3, rate: 1.7 });
      else if (e.effect === 'burn') sfx.play('magic', { at, volume: 0.3, rate: 0.75 });
      else if (e.effect === 'bleed') sfx.play('bite', { at, volume: 0.25, rate: 1.3 });
      break;
    case 'down':
      sfx.play('down', { volume: e.pid === myId ? 0.8 : 0.45, vary: 0 });
      break;
    case 'revive':
      sfx.play('revive', { volume: e.pid === myId ? 0.7 : 0.4, vary: 0 });
      break;
    case 'forged': // 망치로 내려치는 소리와 장비 소리
      sfx.play('hitHeavy', { volume: e.pid === myId ? 0.8 : 0.3, rate: 0.9 });
      if (e.pid === myId) sfx.play('equip', { volume: 0.6 });
      break;
    case 'gate':
      sfx.play('gate', { at, volume: 0.9, rate: 0.8 });
      sfx.play('latch', { at, volume: 0.6 });
      break;
    case 'banner':
      // 중간보스가 나타나면 포효, 흑룡이 깨어나면 큰 포효, 새 구역이면 종소리 비슷한 UI 소리
      if (e.sub?.includes('등장')) sfx.play('giant1', { volume: 0.6 });
      else if (e.sub === '최종 보스') sfx.play('giant2', { volume: 1, rate: 0.7, vary: 0 });
      else if (e.text.endsWith('구역')) sfx.play('ui2', { volume: 0.5, vary: 0 });
      break;
  }
}
