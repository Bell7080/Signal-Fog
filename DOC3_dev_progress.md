# 문서 3 — Signal-Fog 개발 진행 척도 문서 v0.1

> 분류: 개발 관리 문서
> 팀: LNG — 상병 김응태 + 상병 장호영
> 용도: 서버·도메인·에셋·파일 구조·개발 진척도 관리
> 갱신 주기: 작업 완료 시마다 해당 항목 체크

---

## 1. 기술 스택 확정

| 항목 | 선택 | 버전 | 비고 |
|------|------|------|------|
| 게임 엔진 | Phaser.js | 3.90.0 | CDN 로드, 설치 0 |
| AI / 봇 로직 | TensorFlow.js | 최신 CDN | 통신 오류 패턴 모델 |
| 실시간 멀티 | Firebase Realtime Database | — | 턴 상태 동기화 |
| 정적 호스팅 | GitHub Pages | — | 무료, 사지방 대응 |
| 사운드 | Howler.js | 최신 CDN | 무전기 효과음 |
| 에셋 | OpenGameArt.org | — | 픽셀 아트, CC 라이선스 |
| 협업 | GitHub Private Repo | — | 2인 무제한 collaborators |

---

## 2. 서버 및 인프라 구성

### 2-1. Firebase 구성

| 항목 | 내용 | 상태 |
|------|------|------|
| 프로젝트 생성 | Firebase Console에서 프로젝트 신규 생성 | ⬜ 미완료 |
| Realtime DB 활성화 | 멀티플레이 턴 상태 동기화용 | ⬜ 미완료 |
| Authentication | 익명 로그인 또는 닉네임 기반 | ⬜ 미완료 |
| 보안 규칙 설정 | 게임 세션 단위 읽기/쓰기 제한 | ⬜ 미완료 |
| 무료 플랜 한도 확인 | Spark 플랜: 동시 접속 100, 1GB 저장 | ✅ 확인 완료 |

**Firebase Realtime DB 데이터 구조 (안)**
```
signal-fog/
├── rooms/
│   ├── {roomId}/
│   │   ├── players/       ← 플레이어 목록·역할·스탯
│   │   ├── gameState/     ← 현재 턴·맵 상태·보급 현황
│   │   ├── turnInputs/    ← 이번 턴 전 플레이어 입력값
│   │   ├── chatLog/       ← 채팅 (채널별 분리)
│   │   └── aarData/       ← 교전·이동·오류 기록
```

### 2-2. GitHub Pages 배포

| 항목 | 내용 | 상태 |
|------|------|------|
| 레포지토리 생성 | Private repo (팀원 2인) | ⬜ 미완료 |
| GitHub Pages 활성화 | Settings → Pages → main 브랜치 / root | ⬜ 미완료 |
| 배포 URL 확인 | https://{username}.github.io/{repo}/ | ⬜ 미완료 |
| 사지방 접속 테스트 | GitHub Pages URL 사지방 화이트리스트 여부 확인 | ⬜ 미완료 |

### 2-3. 도메인 (선택 사항)

| 항목 | 내용 | 상태 |
|------|------|------|
| 커스텀 도메인 필요 여부 | 예선: GitHub Pages 기본 URL로 충분 | 보류 |
| 본선 진출 시 | 도메인 구매 검토 (signal-fog.kr 등) | 보류 |

---

## 3. 파일 구조

```
signal-fog/
├── index.html              ← 진입점, Phaser·Firebase CDN 로드
├── README.md               ← 프로젝트 소개 (대회 심사용)
│
├── src/
│   ├── main.js             ← Phaser 게임 초기화
│   ├── config.js           ← 게임 설정값 (맵 크기, 턴 시간 등)
│   │
│   ├── scenes/             ← Phaser Scene 단위
│   │   ├── BootScene.js    ← 에셋 로딩
│   │   ├── LobbyScene.js   ← 방 생성·참여, 역할 배정
│   │   ├── GameScene.js    ← 메인 게임 (헥스 맵·턴 진행)
│   │   ├── NightScene.js   ← 야간 페이즈
│   │   └── AARScene.js     ← 결과·분석 화면
│   │
│   ├── systems/            ← 게임 핵심 로직
│   │   ├── HexGrid.js      ← 헥스 그리드 생성·좌표 계산
│   │   ├── TurnManager.js  ← 턴 순서·실행 관리
│   │   ├── CommsSystem.js  ← 통신 오류 판정 로직
│   │   ├── CombatSystem.js ← MILES 교전 판정
│   │   ├── SupplySystem.js ← 보급 자원 관리
│   │   ├── SurvivalStats.js← 생존 스탯 (피로·배고픔·수면)
│   │   ├── FogOfWar.js     ← 포그 오브 워·통신 음영
│   │   └── AARRecorder.js  ← 교전·오류 데이터 기록
│   │
│   ├── firebase/           ← Firebase 연동
│   │   ├── firebaseConfig.js ← API 키 (환경변수 처리)
│   │   ├── roomManager.js  ← 방 생성·참여·삭제
│   │   ├── syncManager.js  ← 턴 상태 실시간 동기화
│   │   └── chatManager.js  ← 채팅 채널 관리·도청 처리
│   │
│   └── ui/                 ← UI 컴포넌트
│       ├── HUD.js          ← 생존 스탯·보급 현황 표시
│       ├── ChatUI.js       ← 채팅창 (채널 전환 포함)
│       ├── MiniMap.js      ← 미니맵·레이더
│       └── RoleSelect.js   ← 역할 배정 화면
│
├── assets/
│   ├── tiles/              ← 헥스 지형 타일 (OpenGameArt)
│   ├── units/              ← 유닛 스프라이트
│   ├── ui/                 ← UI 아이콘·버튼
│   └── sounds/             ← 무전기 효과음·노이즈
│
└── docs/
    ├── DOC1_KCTC_reference.md
    ├── DOC2_SignalFog_design.md
    └── DOC3_dev_progress.md    ← 이 문서
```

---

## 4. 에셋 목록 및 출처

### 4-1. 그래픽 에셋

| 에셋 | 출처 | 라이선스 | 상태 |
|------|------|---------|------|
| 헥스 지형 타일 (8종) | OpenGameArt.org | CC0 / CC-BY | ⬜ 미수집 |
| 보병 유닛 스프라이트 | OpenGameArt.org | CC0 / CC-BY | ⬜ 미수집 |
| 차량 유닛 스프라이트 | OpenGameArt.org | CC0 / CC-BY | ⬜ 미수집 |
| UI 아이콘 (무전기·보급·의무 등) | OpenGameArt.org / Kenney.nl | CC0 | ⬜ 미수집 |
| 폭발·피격 이펙트 | OpenGameArt.org | CC0 | ⬜ 미수집 |

> Kenney.nl (kenney.nl/assets) — CC0 에셋 대량 제공, 군용 UI에 적합한 아이콘 다수

### 4-2. 사운드 에셋

| 사운드 | 출처 | 라이선스 | 상태 |
|--------|------|---------|------|
| 무전기 삐 소리 (전송음) | Freesound.org | CC0 | ⬜ 미수집 |
| 무전기 노이즈 (잡음) | Freesound.org | CC0 | ⬜ 미수집 |
| 총성 효과음 | Freesound.org | CC0 | ⬜ 미수집 |
| 폭발음 (수류탄·포격) | Freesound.org | CC0 | ⬜ 미수집 |
| 야간 환경음 (귀뚜라미 등) | Freesound.org | CC0 | ⬜ 미수집 |

### 4-3. 폰트

| 폰트 | 출처 | 용도 |
|------|------|------|
| 군용 모노스페이스 폰트 | Google Fonts (Share Tech Mono 등) | 채팅·좌표 표시 |
| 한글 UI 폰트 | Google Fonts (Noto Sans KR) | 메뉴·설명 |

---

## 5. 개발 진행 척도

### 5-1. Phase 1 — 예선 프로토타입 (목표: 4월 10일)

#### 핵심 기능 구현 목록

**[인프라·기반]**
- [ ] GitHub 레포지토리 생성 및 팀원 초대
- [ ] Firebase 프로젝트 생성 및 Realtime DB 설정
- [ ] GitHub Pages 배포 연동 확인
- [ ] index.html + Phaser CDN + Firebase CDN 기본 로드 확인
- [ ] 사지방 접속 테스트

**[맵·지형]**
- [ ] 헥스 그리드 기본 렌더링 (20×20)
- [ ] 지형 타일 8종 배치
- [ ] 헥스 좌표 계산 로직 (이동 거리·인접 타일)
- [ ] 지형별 이동 비용 적용
- [ ] 드래그 스크롤

**[멀티플레이 기반]**
- [ ] Firebase 방 생성·참여 로직
- [ ] 플레이어 접속·역할 배정 화면
- [ ] 실시간 유닛 위치 동기화 (Firebase)
- [ ] 채팅 채널 기본 구현 (지휘 채널 1개)

**[턴 시스템]**
- [ ] 턴 입력 페이즈 (60초 타이머)
- [ ] 지휘계통 우선순위 실행 로직
- [ ] 이동 행동 구현
- [ ] 대기(Hold) 자동 처리

**[전투 기본]**
- [ ] 소총 사격 판정 (사거리·명중률)
- [ ] 즉사/부상/경상 판정
- [ ] 포그 오브 워 기본 구현

**[통신 오류 기본]**
- [ ] 통신 품질 수치 계산
- [ ] 오청 발생 (명령 텍스트 변형)
- [ ] 통신 두절 (계곡 지형)
- [ ] 무전기 배터리 자원

**[생존 스탯 기본]**
- [ ] 피로도·배고픔·수면 턴마다 자동 감소
- [ ] 체력 스탯에 따른 감소 속도 차이
- [ ] 고갈 시 AP 패널티 적용

**[UI 기본]**
- [ ] HUD (생존 스탯·배터리 잔량)
- [ ] 채팅창 기본
- [ ] 역할 표시

**[데모 준비]**
- [ ] 1~2분 플레이 가능한 데모 시나리오 구성
- [ ] 유튜브 데모 영상 촬영 (1~2분)

---

### 5-2. Phase 2 — 본선 고도화 (본선 진출 시)

- [ ] 맵 40×40 확장
- [ ] 통신 오류 5종 전체 구현 (도청·위장삽입 포함)
- [ ] 야간 페이즈 완전 구현
- [ ] 보급 시스템 전체 구현
- [ ] AAR 시스템 구현 (히트맵·리플레이)
- [ ] 특수 이벤트 구현 (내부자·포격 오류 등)
- [ ] 인수인계 시스템 완전 구현
- [ ] TensorFlow.js 봇 AI 구현
- [ ] 모바일 터치 UI 최적화
- [ ] 사운드 전체 적용

---

## 6. 개발 일정

| 기간 | 목표 | 담당 | 상태 |
|------|------|------|------|
| ~3월 말 | 인프라 구성 + 헥스 맵 + 기본 멀티 | 공동 | ⬜ |
| 4월 1~5일 | 턴 시스템 + 전투 기본 + 통신 오류 기본 | 공동 | ⬜ |
| 4월 6~8일 | 생존 스탯 + UI + 데모 시나리오 | 공동 | ⬜ |
| 4월 9일 | 최종 테스트 + 버그 수정 | 공동 | ⬜ |
| 4월 10일 | 유튜브 영상 촬영 + 예선 접수 | 공동 | ⬜ |

---

## 7. 알려진 기술적 리스크

| 리스크 | 내용 | 대응 방안 |
|--------|------|---------|
| Firebase 무료 플랜 동시접속 한도 | Spark 플랜 동시접속 100명 | 예선 데모는 소규모로 진행, 본선 시 Blaze 플랜 업그레이드 검토 |
| 사지방 Firebase 도메인 차단 가능성 | firebase.io 도메인 차단 여부 불확실 | 사지방 환경 사전 테스트 필수, 차단 시 WebSocket 대안 검토 |
| 헥스 그리드 모바일 터치 | 헥스 터치 영역 계산 복잡 | 예선은 PC 우선, 모바일은 본선에서 최적화 |
| 대규모 인원 동기화 지연 | 30~50명 동시 Firebase 쓰기 | 턴 기반 배치 처리로 실시간 부하 분산 |
| Phaser.js 헥스 그리드 기본 미지원 | 직접 구현 필요 | 오픈소스 phaser3-hex-grid 플러그인 검토 |

---

## 8. 참고 링크

| 항목 | URL |
|------|-----|
| 육군창업경진대회 공식 | https://army-startup.co.kr/ |
| Phaser.js 공식 문서 | https://phaser.io/docs |
| Firebase 콘솔 | https://console.firebase.google.com |
| OpenGameArt | https://opengameart.org |
| Kenney 에셋 | https://kenney.nl/assets |
| Freesound | https://freesound.org |
| phaser3-hex-grid | 검색 후 링크 추가 예정 |

---

*Signal-Fog 개발 진행 척도 문서 v0.1 — 팀 LNG*
*최종 수정: 2026.03.23*
