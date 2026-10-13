# ACT RPG

4인 온라인 협동 횡스크롤 액션 RPG (웹, 저장 없음 — 매 판 처음부터).

**플레이:** https://vozzang.github.io/act-rpg/

`main` 브랜치에 push하면 GitHub Actions가 자동으로 빌드해서 GitHub Pages에 배포한다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 를 정적 호스팅(GitHub Pages, Netlify 등)에 올리면 된다
```

## 구조

```
src/
  game/          게임 규칙 (Phaser와 무관한 순수 TS)
    data.ts      밸런스 데이터: 직업·적·장비·경험치 곡선  ← 수치 조정은 여기
    level.ts     시드 기반 맵 생성
    physics.ts   타일 충돌
    sim.ts       게임 시뮬레이션 (호스트에서만 실행)
    types.ts     상태/스냅샷 타입
  net/net.ts     PeerJS(WebRTC) P2P 통신
  render/        Phaser 화면 (그리기 전용)
  main.ts        로비: 방 만들기/참가/직업 선택
```

## 온라인 구조 (호스트 권한 방식)

- 방장 브라우저가 `Sim`을 초당 60회 계산하고, 초당 20회 스냅샷을 참가자에게 보낸다.
- 참가자는 키 입력만 보내고, 받은 스냅샷을 보간해서 그린다.
- 모두 같은 카메라(공유 화면)를 본다. 플레이어는 화면 밖으로 나갈 수 없다.
- 맵은 시작 시 받은 시드로 각자 생성하므로 전송하지 않는다.
- 접속 연결에는 PeerJS 공개 시그널링 서버를 사용한다. 별도 게임 서버가 필요 없다.
