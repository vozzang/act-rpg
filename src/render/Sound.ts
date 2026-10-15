// 효과음: public/sfx/*.m4a (모두 CC0, public/sfx/License.txt). Web Audio로 미리 불러 두고 짧게 겹쳐 튼다.
// 게임 이벤트 위치가 내 캐릭터에서 멀수록 작게 들리고, 화면 밖 먼 곳의 소리는 틀지 않는다.
// 같은 소리가 한꺼번에 너무 많이 나지 않게 소리마다 잠깐씩 간격을 둔다.

const FILES = [
  'swing1', 'swing2', 'swing3', 'magic', 'spell', 'unsheathe1', 'unsheathe2', 'hit1', 'hit2', 'hitHeavy', 'hurt',
  'slime1', 'slime2', 'slime3', 'beast1', 'beast2', 'beast3', 'ogre1', 'ogre2', 'shade1', 'shade2', 'giant1', 'giant2', 'giant3', 'bite',
  'coin', 'buy', 'coins', 'drink1', 'drink2', 'equip', 'pickup', 'drop', 'ui1', 'ui2', 'uiError', 'page1', 'page2', 'gate', 'latch',
  'levelup', 'revive', 'down', 'victory', 'defeat',
] as const;
/** 효과음 이름 (public/sfx/이름.m4a) */
export type SoundName = (typeof FILES)[number];

const HEAR_DIST = 700; // 이 거리(월드 px)보다 먼 소리는 틀지 않는다
const FULL_DIST = 180; // 이 거리 안은 원래 크기
const MIN_GAP = 0.045; // 같은 소리를 다시 틀기까지 최소 간격(초)

const VOLUME_KEY = 'actrpg-volume';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private lastPlayed = new Map<SoundName, number>();
  /** 듣는 위치 (내 캐릭터, 월드 px) */
  listener = { x: 0, y: 0 };

  constructor() {
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = Sound.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null; // 소리를 낼 수 없는 환경
      return;
    }
    // 브라우저는 사용자가 한 번 누르거나 클릭해야 소리를 낸다
    const resume = () => void this.ctx?.resume();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    for (const name of FILES) this.loadOne(name);
  }

  /** 로비의 효과음 크기 (0~1, 이 브라우저에 기억) */
  static get volume() {
    try {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? Math.max(0, Math.min(1, v)) : 0.7;
    } catch {
      return 0.7;
    }
  }

  static set volume(v: number) {
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      /* 무시 */
    }
  }

  private async loadOne(name: SoundName) {
    try {
      const res = await fetch(`sfx/${name}.m4a`);
      const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
    } catch {
      /* 그 소리만 빠진다 */
    }
  }

  /**
   * 소리를 튼다. at을 주면 내 위치에서의 거리로 크기를 줄인다.
   * rate: 재생 속도(음 높이), vary: rate를 이만큼 무작위로 흔들어 같은 소리가 덜 단조롭게
   */
  play(name: SoundName, opts: { volume?: number; at?: { x: number; y: number }; rate?: number; vary?: number } = {}) {
    const ctx = this.ctx, buf = this.buffers.get(name);
    if (!ctx || !buf || !this.master || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < MIN_GAP) return;
    let vol = opts.volume ?? 1;
    if (opts.at) {
      const d = Math.hypot(opts.at.x - this.listener.x, opts.at.y - this.listener.y);
      if (d > HEAR_DIST) return;
      vol *= d <= FULL_DIST ? 1 : 1 - (d - FULL_DIST) / (HEAR_DIST - FULL_DIST);
    }
    if (vol <= 0.02) return;
    this.lastPlayed.set(name, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (opts.vary ?? 0.06));
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(this.master);
    src.start();
  }

  /** 여러 소리 중 하나를 골라 튼다 */
  pick(names: SoundName[], opts: Parameters<Sound['play']>[1] = {}) {
    this.play(names[Math.floor(Math.random() * names.length)], opts);
  }

  destroy() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
