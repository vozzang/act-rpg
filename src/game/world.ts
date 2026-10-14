// 게임이 플레이하는 맵. 모든 플레이어가 같은 맵(maps/world.json, 맵 편집기로 만든 것)을 쓴다.
import { type Level } from './level';
import { levelFromMap, type MapFile } from './mapfile';
import worldMap from './maps/world.json';

/** 맵 편집기의 '테스트 플레이'가 아직 저장하지 않은 맵을 넘겨줄 때 쓰는 localStorage 키 */
export const DRAFT_KEY = 'actrpg-map-draft';

/** 이번 판의 맵. 개발 중에 주소에 ?draft=1이 있으면 편집 중인 맵(저장 전)을 쓴다 */
export function gameLevel(): Level {
  return levelFromMap(draftMap() ?? (worldMap as MapFile));
}

function draftMap(): MapFile | null {
  try {
    if (!import.meta.env?.DEV || !new URLSearchParams(location.search).has('draft')) return null;
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as MapFile) : null;
  } catch {
    return null; // 노드(봇 시험) 등 브라우저가 아닌 곳
  }
}
