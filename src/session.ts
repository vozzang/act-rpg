import type { AttrKey, InputState, LobbyPlayer, Snapshot } from './game/types';
import type { ClientNet, HostNet } from './net/net';

/**
 * 한 판의 게임에 필요한 정보. 로비(main.ts)에서 만들어 게임 화면으로 넘긴다.
 * 네트워크 메시지는 main.ts가 받아서 아래 on* 콜백으로 게임 화면에 전달한다.
 */
export interface Session {
  role: 'host' | 'client' | 'solo'; // 방장(게임 계산) · 참가자(입력만 보냄) · 혼자
  myId: string; // 내 접속 id (방장·혼자는 'host')
  seed: number; // 이번 판의 시드 (떨어지는 물건 같은 운에 쓴다)
  players: LobbyPlayer[]; // 참가자와 고른 직업
  /** 이 플레이어가 로비에서 '스토리 건너뛰기'를 골랐는지 (스토리는 플레이어마다 따로 본다) */
  skipStory: boolean;
  /** 개발용: 모든 플레이어의 시작 레벨 (개발 서버 로비의 '시작 레벨', 방장·혼자만 쓴다). 없으면 1 */
  startLevel?: number;
  host?: HostNet; // 방장일 때 네트워크
  client?: ClientNet; // 참가자일 때 네트워크
  /** 호스트/솔로가 '로비로' 버튼을 눌렀을 때 */
  backToLobby: () => void;

  // 참가자: 방장에게서 스냅샷을 받았을 때
  onSnap?: (s: Snapshot) => void;
  // 방장: 참가자가 보낸 입력·행동 (id = 보낸 참가자)
  onRemoteInput?: (id: string, input: InputState) => void; // 매 프레임 입력
  onRemoteAlloc?: (id: string, attr: AttrKey) => void; // 능력치 포인트 배분
  onRemoteBuy?: (id: string, shop: number, idx: number) => void; // 상점에서 사기
  onRemoteSlot?: (id: string, idx: number) => void; // 아이템 상자 칸 사용
  onRemoteMove?: (id: string, from: 'inv' | 'bag', idx: number) => void; // 장비를 상자 ↔ 가방으로
  onRemoteDrop?: (id: string, from: 'inv' | 'bag', idx: number) => void; // 장비 버리기
  onRemoteForge?: (id: string, shop: number, picks: { from: 'inv' | 'bag'; idx: number }[], random: boolean) => void; // 대장간 조합
  onPlayerLeft?: (id: string) => void; // 참가자가 나갔을 때
}
