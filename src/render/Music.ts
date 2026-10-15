// 배경음악: public/music/*.m4a (모두 CC0, public/music/License.txt). 로비와 게임이 함께 쓰는 하나뿐인 재생기.
// 곡을 바꾸면 이전 곡은 줄어들고 새 곡은 커지며(교차 페이드) 넘어간다. 곡은 처음부터 반복한다.
// 브라우저는 사용자가 한 번 누르거나 클릭해야 소리를 내므로, 그 전에 고른 곡은 첫 입력 때 시작한다.

export type Track = 'town' | 'forest' | 'field' | 'battle';

const FADE = 1.5; // 교차 페이드 시간(초)
const VOLUME_KEY = 'actrpg-music';

class MusicPlayer {
  private els = new Map<Track, HTMLAudioElement>();
  private current: Track | null = null;
  private fades = new Map<HTMLAudioElement, number>(); // 오디오 → 목표 크기 (0이면 끝나면 멈춘다)
  private raf = 0;
  private unlocked = false;

  constructor() {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      if (this.current) this.start(this.current);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /** 배경음악 크기 (0~1, 이 브라우저에 기억) */
  get volume() {
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      return raw === null ? 0.5 : Math.max(0, Math.min(1, Number(raw)));
    } catch {
      return 0.5;
    }
  }

  set volume(v: number) {
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      /* 무시 */
    }
    // 지금 나오는 곡에 바로 적용
    const el = this.current && this.els.get(this.current);
    if (el) {
      this.fades.delete(el);
      el.volume = v;
    }
  }

  /** 곡을 바꾼다 (같은 곡이면 그대로). null이면 서서히 멈춘다 */
  play(track: Track | null) {
    if (track === this.current) return;
    const prev = this.current && this.els.get(this.current);
    if (prev) this.fadeTo(prev, 0);
    this.current = track;
    if (track && this.unlocked) this.start(track);
  }

  private el(track: Track) {
    let el = this.els.get(track);
    if (!el) {
      el = new Audio(`music/${track}.m4a`);
      el.loop = true;
      el.preload = 'auto';
      this.els.set(track, el);
    }
    return el;
  }

  private start(track: Track) {
    const el = this.el(track);
    el.volume = 0;
    el.currentTime = 0;
    void el.play().catch(() => {});
    this.fadeTo(el, this.volume);
  }

  private fadeTo(el: HTMLAudioElement, target: number) {
    this.fades.set(el, target);
    if (!this.raf) {
      let last = performance.now();
      const tick = (now: number) => {
        const step = ((now - last) / 1000 / FADE) * Math.max(0.05, this.volume);
        last = now;
        for (const [a, t] of this.fades) {
          const v = a.volume + Math.sign(t - a.volume) * Math.min(Math.abs(t - a.volume), step);
          a.volume = Math.max(0, Math.min(1, v));
          if (a.volume === t) {
            this.fades.delete(a);
            if (t === 0) a.pause();
          }
        }
        this.raf = this.fades.size ? requestAnimationFrame(tick) : 0;
      };
      this.raf = requestAnimationFrame(tick);
    }
  }
}

export const Music = new MusicPlayer();

/** 구역별 곡: 숲·협곡·늪·묘지는 숲 테마, 나머지(설원·요새·화산·사막·동굴·마왕성)는 들판 테마 */
export function zoneTrack(zone: number): Track {
  return [1, 2, 6, 9].includes(zone) || zone <= 0 ? 'forest' : 'field';
}
