import { defineConfig } from 'vite';

export default defineConfig({
  // base './' 로 두면 GitHub Pages 등 어떤 하위 경로에 올려도 동작한다.
  base: './',
  build: {
    // 큰 라이브러리는 따로 나눠서 게임 코드만 바뀌었을 때 브라우저 캐시를 재사용한다.
    chunkSizeWarningLimit: 1500, // phaser 단독 청크가 약 1.2MB
    rollupOptions: {
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
