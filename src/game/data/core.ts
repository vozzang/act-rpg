// 기본 상수: 화면·타일 크기, 시뮬레이션 주기, 구역 이름과 색.
// 거리·속도는 월드 좌표(px) 기준이다. 타일 한 칸(TILE = 32)이 3D 화면에서 1칸 크기의 블록이 된다.

export const TILE = 32;
export const VIEW_W = 960;
export const VIEW_H = 544;
export const TICK_RATE = 60;
export const SNAPSHOT_EVERY = 3; // 60/3 = 초당 20회 전송
export const REVIVE_TIME = 2;
export const ZONE_NAMES = ['초록 숲', '고블린 협곡', '얼어붙은 설원', '오크 요새', '불타는 화산', '독기의 늪', '사막 유적', '수정 동굴', '망령의 묘지', '마왕성'];

/** 구역별 색: ground 바닥(풀), road 길, wall 지도에서 벽(나무·바위) 색. 3D 바닥·미니맵·맵 편집기가 함께 쓴다 */
export const ZONE_PALETTE: { ground: number; road: number; wall: number }[] = [
  { ground: 0x5c9a44, road: 0xb59866, wall: 0x24301e }, // 1 초록 숲
  { ground: 0x8a9448, road: 0xb59866, wall: 0x24301e }, // 2 고블린 협곡
  { ground: 0xe4ebf2, road: 0xaebccb, wall: 0x6a7680 }, // 3 얼어붙은 설원
  { ground: 0x8a7450, road: 0xb59866, wall: 0x2e2a22 }, // 4 오크 요새
  { ground: 0x4a3c36, road: 0x7a4630, wall: 0x2a1c18 }, // 5 불타는 화산
  { ground: 0x3e5a3a, road: 0x5e5236, wall: 0x1c2a1a }, // 6 독기의 늪
  { ground: 0xd8bc80, road: 0xc8a060, wall: 0x8a6a40 }, // 7 사막 유적
  { ground: 0x3a3450, road: 0x5a5070, wall: 0x1e1a2c }, // 8 수정 동굴
  { ground: 0x5a5e60, road: 0x707070, wall: 0x2a2c2e }, // 9 망령의 묘지
  { ground: 0x40302e, road: 0x5a4a48, wall: 0x1a1212 }, // 10 마왕성
];
