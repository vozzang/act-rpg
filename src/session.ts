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
  host?: HostNet;
  client?: ClientNet;
  /** 호스트/솔로가 '로비로' 버튼을 눌렀을 때 */
  backToLobby: () => void;

  onSnap?: (s: Snapshot) => void;
  onRemoteInput?: (id: string, input: InputState) => void;
  onRemoteAlloc?: (id: string, attr: AttrKey) => void;
  onRemoteBuy?: (id: string, shop: number, idx: number) => void;
  onRemoteSlot?: (id: string, idx: number) => void;
  onPlayerLeft?: (id: string) => void;
}
