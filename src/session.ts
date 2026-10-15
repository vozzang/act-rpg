import type { AttrKey, InputState, LobbyPlayer, Snapshot } from './game/types';
import type { ClientNet, HostNet } from './net/net';

/**
 * 한 판의 게임에 필요한 정보. 로비(main.ts)에서 만들어 게임 화면으로 넘긴다.
 * 네트워크 메시지는 main.ts가 받아서 아래 on* 콜백으로 게임 화면에 전달한다.
 */
export interface Session {
  role: 'host' | 'client' | 'solo';
  myId: string;
  seed: number;
  players: LobbyPlayer[];
  /** 이 플레이어가 로비에서 '스토리 건너뛰기'를 골랐는지 (스토리는 플레이어마다 따로 본다) */
  skipStory: boolean;
  host?: HostNet;
  client?: ClientNet;
  /** 호스트/솔로가 '로비로' 버튼을 눌렀을 때 */
  backToLobby: () => void;

  onSnap?: (s: Snapshot) => void;
  onRemoteInput?: (id: string, input: InputState) => void;
  onRemoteAlloc?: (id: string, attr: AttrKey) => void;
  onRemoteBuy?: (id: string, shop: number, idx: number) => void;
  onRemoteSlot?: (id: string, idx: number) => void;
  onRemoteMove?: (id: string, from: 'inv' | 'bag', idx: number) => void;
  onRemoteDrop?: (id: string, from: 'inv' | 'bag', idx: number) => void;
  onRemoteForge?: (id: string, shop: number, picks: { from: 'inv' | 'bag'; idx: number }[], random: boolean) => void;
  onPlayerLeft?: (id: string) => void;
}
