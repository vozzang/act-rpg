// PeerJS(WebRTC) 기반 P2P 통신. 방장(호스트)이 게임을 계산하고 참가자는 입력만 보낸다.
// PeerJS 공개 중계 서버는 접속 연결(시그널링)에만 쓰이고, 게임 데이터는 브라우저끼리 직접 주고받는다.
import Peer, { type DataConnection } from 'peerjs';
import type { AttrKey, ClassId, InputState, LobbyPlayer, Snapshot } from '../game/types';

export type ClientMsg =
  | { t: 'hello'; name: string }
  | { t: 'pick'; cls: ClassId }
  | { t: 'input'; input: InputState }
  | { t: 'alloc'; attr: AttrKey }
  | { t: 'buy'; shop: number; idx: number }
  | { t: 'slot'; idx: number }; // 아이템 상자 칸 사용 (음식 먹기 / 장비 내려놓기)

export type HostMsg =
  | { t: 'lobby'; players: LobbyPlayer[]; you: string }
  | { t: 'start'; seed: number; players: LobbyPlayer[] }
  | { t: 'snap'; s: Snapshot }
  | { t: 'toLobby' }
  | { t: 'reject'; reason: string };

const PREFIX = 'actrpg-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    const onError = (err: Error & { type?: string }) => {
      peer.destroy();
      reject(err);
    };
    peer.once('open', () => {
      peer.off('error', onError);
      resolve(peer);
    });
    peer.once('error', onError);
  });
}

export class HostNet {
  private conns = new Map<string, DataConnection>();
  onConnect?: (id: string) => void;
  onMessage?: (id: string, msg: ClientMsg) => void;
  onDisconnect?: (id: string) => void;
  /** 거절 사유 문자열을 반환하면 접속을 거절한다. */
  canAccept?: () => string | null;

  private constructor(private peer: Peer, readonly code: string) {
    peer.on('connection', (conn) => this.handleConnection(conn));
  }

  static async create(): Promise<HostNet> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      try {
        return new HostNet(await openPeer(PREFIX + code), code);
      } catch (err) {
        if ((err as { type?: string }).type !== 'unavailable-id') throw err;
      }
    }
    throw new Error('방 코드를 만들 수 없습니다.');
  }

  private handleConnection(conn: DataConnection) {
    conn.on('open', () => {
      const reason = this.canAccept?.() ?? null;
      if (reason) {
        conn.send({ t: 'reject', reason } satisfies HostMsg);
        setTimeout(() => conn.close(), 500);
        return;
      }
      this.conns.set(conn.peer, conn);
      this.onConnect?.(conn.peer);
    });
    conn.on('data', (data) => {
      if (this.conns.has(conn.peer)) this.onMessage?.(conn.peer, data as ClientMsg);
    });
    const drop = () => {
      if (this.conns.delete(conn.peer)) this.onDisconnect?.(conn.peer);
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  send(id: string, msg: HostMsg) {
    this.conns.get(id)?.send(msg);
  }

  broadcast(msg: HostMsg) {
    for (const c of this.conns.values()) c.send(msg);
  }

  destroy() {
    this.peer.destroy();
  }
}

export class ClientNet {
  onMessage?: (msg: HostMsg) => void;
  onClose?: () => void;

  private constructor(private peer: Peer, private conn: DataConnection) {
    conn.on('data', (d) => this.onMessage?.(d as HostMsg));
    conn.on('close', () => this.onClose?.());
    peer.on('disconnected', () => {
      // 시그널링 서버와의 연결만 끊긴 경우: 이미 맺어진 P2P 연결은 유지된다.
    });
  }

  get id(): string {
    return this.peer.id;
  }

  static async join(code: string): Promise<ClientNet> {
    const peer = await openPeer();
    return new Promise((resolve, reject) => {
      const conn = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true });
      const timer = setTimeout(() => {
        peer.destroy();
        reject(new Error('접속 시간이 초과되었습니다.'));
      }, 10000);
      peer.once('error', (err: Error & { type?: string }) => {
        clearTimeout(timer);
        peer.destroy();
        reject(new Error(err.type === 'peer-unavailable' ? '방을 찾을 수 없습니다. 코드를 확인하세요.' : err.message));
      });
      conn.once('open', () => {
        clearTimeout(timer);
        resolve(new ClientNet(peer, conn));
      });
    });
  }

  send(msg: ClientMsg) {
    if (this.conn.open) this.conn.send(msg);
  }

  destroy() {
    this.peer.destroy();
  }
}
