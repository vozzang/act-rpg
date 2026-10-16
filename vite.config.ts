import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * 맵 편집기(editor.html)의 '저장' 버튼: 개발 서버(npm run dev)에서만 동작하며 src/game/maps/world.json을 덮어쓴다.
 * 배포된 사이트에는 이 기능도 편집기도 없다.
 */
function mapEditorSave(): Plugin {
  return {
    name: 'map-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editor/save-map', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const map = JSON.parse(body);
            if (map.version !== 1 || !Array.isArray(map.tiles)) throw new Error('맵 파일 형식이 아닙니다');
            writeFileSync(resolve(__dirname, 'src/game/maps/world.json'), body);
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  // base './' 로 두면 GitHub Pages 등 어떤 하위 경로에 올려도 동작한다.
  base: './',
  plugins: [mapEditorSave()],
  build: {
    // 큰 라이브러리는 따로 나눠서 게임 코드만 바뀌었을 때 브라우저 캐시를 재사용한다.
    chunkSizeWarningLimit: 1500, // phaser 단독 청크가 약 1.2MB
    rollupOptions: {
      // 게임 화면과 정보 페이지(직업 능력치·몬스터 도감·아이템 도감·경험치 표)를 함께 만든다. 맵 편집기(editor.html)는 개발 서버 전용이라 넣지 않는다
      input: {
        main: resolve(__dirname, 'index.html'),
        classes: resolve(__dirname, 'classes.html'),
        monsters: resolve(__dirname, 'monsters.html'),
        items: resolve(__dirname, 'items.html'),
        xp: resolve(__dirname, 'xp.html'),
      },
      output: {
        manualChunks: {
          phaser: ['phaser'],
          three: ['three'],
          peerjs: ['peerjs'],
        },
      },
    },
  },
});
