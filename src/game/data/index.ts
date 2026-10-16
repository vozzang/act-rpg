// 밸런스 데이터. 수치 조정은 대부분 이 폴더에서 하면 된다. 다른 코드는 '../game/data'로 한 번에 불러온다.
//   core.ts     화면·타일 크기, 시뮬레이션 주기, 구역 이름·색
//   classes.ts  직업, 기본 공격, 스킬과 스킬 세부 수치
//   stats.ts    능력치 → 전투 수치 계산, 레벨업 경험치
//   enemies.ts  몬스터, 중간보스·문지기, 구역·인원수 강화 배율
//   items.ts    아이템 목록 (모든 장비의 이름·등급·수치·얻는 곳)
//   gear.ts     장비 등급, 드랍, 장비 만들기
//   shop.ts     회복 음식, 아이템 상자·가방, 상점
//   forge.ts    대장간 조합법
//   dungeon.ts  던전 (5구역 던전 문, 웨이브, 보상)
export * from './core';
export * from './classes';
export * from './stats';
export * from './enemies';
export * from './items';
export * from './gear';
export * from './shop';
export * from './forge';
export * from './dungeon';
