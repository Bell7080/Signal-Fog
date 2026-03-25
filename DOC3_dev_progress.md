# 문서 3 — Signal-Fog 개발 진행 척도 문서 v0.2

> 분류: 개발 관리 문서
> 팀: LNG — 상병 김응태 + 상병 장호영
> 용도: 서버·도메인·에셋·파일 구조·개발 진척도 관리
> 갱신 주기: 작업 완료 시마다 해당 항목 체크

---

## 1. 기술 스택

### 1-1. 예선 MVP (확정)

| 항목 | 선택 | 버전 | 비고 |
|------|------|------|------|
| 게임 엔진 | Phaser.js | 3.90.0 | CDN 로드, 설치 0 |
| 적 AI | Gemini API | Gemini Flash | Google AI Studio 무료 플랜, fetch 호출 |
| 정적 호스팅 | GitHub Pages | — | 무료, 사지방 대응 |
| 사운드 | Howler.js | 최신 CDN | 무전기 효과음 |
| 에셋 | Kenney.nl / OpenGameArt.org | — | CC0 무료 |
| 협업 | GitHub Private Repo | — | 2인 무제한 collaborators |

> Firebase, TensorFlow.js는 예선 MVP에서 제외. 사지방 환경에서 외부 의존성 최소화 + 구현 복잡도 감소.

### 1-2. 본선 확장 (예정)

| 항목 | 선택 | 비고 |
|------|------|------|
| 실시간 멀티 | Firebase Realtime Database | 25v25 멀티플레이 |
| AI 고도화 | Gemini API 난이도 자동 조절 | 전황 복잡도 연동 |
| 모바일 UI | Phaser Scale Manager | 터치 최적화 |

---

## 2. 인프라 구성

### 2-1. GitHub Pages 배포

| 항목 | 내용 | 상태 |
|------|------|------|
| 레포지토리 생성 | Private repo (팀원 2인) | ⬜ 미완료 |
| GitHub Pages 활성화 | Settings → Pages → main 브랜치 / root | ⬜ 미완료 |
| 배포 URL 확인 | https://{username}.github.io/{repo}/ | ⬜ 미완료 |
| 사지방 접속 테스트 | GitHub Pages URL 사지방 화이트리스트 여부 확인 | ⬜ 미완료 |

### 2-2. Gemini API 설정

| 항목 | 내용 | 상태 |
|------|------|------|
| Google AI Studio 계정 생성 | https://aistudio.google.com/ | ⬜ 미완료 |
| API 키 발급 | 무료 플랜 (Gemini Flash) | ⬜ 미완료 |
| API 키 환경 처리 | index.html 내 상수 또는 .env 처리 | ⬜ 미완료 |
| 사지방 외부 API 접근 테스트 | generativelanguage.googleapis.com 호출 가능 여부 | ⬜ **최우선 테스트 항목** |
| 폴백 로직 준비 | API 차단 시 랜덤 이동 AI로 전환 | ⬜ 미완료 |

> ⚠ 사지방에서 Gemini API 호출이 차단될 경우 즉시 폴백으로 전환. 데모 영상은 사지방 외부(개인 기기)에서 촬영하므로 심사 영상에는 지장 없음.

### 2-3. 도메인 (선택 사항)

| 항목 | 내용 | 상태 |
|------|------|------|
| 커스텀 도메인 필요 여부 | 예선: GitHub Pages 기본 URL로 충분 | 보류 |
| 본선 진출 시 | 도메인 구매 검토 (signal-fog.kr 등) | 보류 |

---

## 3. 파일 구조

```
signal-fog/
├── index.html              ← 진입점, Phaser·Gemini CDN 로드
├── README.md               ← 프로젝트 소개 (대회 심사용)
│
├── src/
│   ├── main.js             ← Phaser 게임 초기화
│   ├── config.js           ← 게임 설정값 (맵 크기, 턴 시간, Gemini API 키 등)
│   │
│   ├── scenes/             ← Phaser Scene 단위
│   │   ├── BootScene.js    ← 에셋 로딩 + 부팅 시퀀스
│   │   ├── GameScene.js    ← 메인 게임 (8×8 그리드·턴 진행)
│   │   └── ResultScene.js  ← 결과 화면 (승패·통신 오류 요약)
│   │
│   ├── systems/            ← 게임 핵심 로직
│   │   ├── GridMap.js      ← 8×8 정사각형 그리드 생성·좌표 계산
│   │   ├── TurnManager.js  ← 턴 순서·실행 관리
│   │   ├── CommsSystem.js  ← 오청 판정 로직 (통신 품질 → 텍스트 변형)
│   │   ├── CombatSystem.js ← 교전 판정 (명중률·피해)
│   │   ├── FogOfWar.js     ← 포그 오브 워 (시야 범위 관리)
│   │   └── SurvivalStats.js← 생존 스탯 HUD 표시 (피로·배고픔·수면)
│   │
│   ├── ai/                 ← Gemini AI 적군
│   │   ├── GeminiClient.js ← Gemini API fetch 호출·응답 파싱
│   │   ├── EnemyAI.js      ← 적 유닛 행동 실행 (Gemini 응답 → 게임 반영)
│   │   └── FallbackAI.js   ← API 차단·실패 시 랜덤 이동 폴백
│   │
│   └── ui/                 ← UI 컴포넌트
│       ├── HUD.js          ← 생존 스탯·배터리·AP 표시
│       ├── ChatUI.js       ← 통신 채팅창 (오청 글리치 효과)
│       └── MiniMap.js      ← 미니맵·시야 표시
│
├── assets/
│   ├── tiles/              ← 지형 타일 (Kenney.nl CC0)
│   ├── units/              ← 유닛 스프라이트 (Kenney.nl CC0)
│   ├── ui/                 ← UI 아이콘
│   └── sounds/             ← 무전기 효과음 (Freesound.org CC0)
│
└── docs/
    ├── DOC1_KCTC_reference.md
    ├── DOC2_SignalFog_design.md
    └── DOC3_dev_progress.md
```

> Firebase 관련 디렉터리(`src/firebase/`) 및 LobbyScene, NightScene, AARScene은 예선에서 제외. 본선 진출 시 추가.

---

## 4. 에셋 목록

### 4-1. 그래픽 에셋

| 에셋 | 출처 | 라이선스 | 상태 |
|------|------|---------|------|
| 지형 타일 (3~4종) | Kenney.nl (Tiny Town / Topdown Shooter) | CC0 | ⬜ 미수집 |
| 보병 유닛 스프라이트 | Kenney.nl | CC0 | ⬜ 미수집 |
| UI 아이콘 (무전기·AP 등) | Kenney.nl (UI Pack) | CC0 | ⬜ 미수집 |
| 피격·폭발 이펙트 | OpenGameArt.org | CC0 | ⬜ 미수집 |

> Kenney.nl 우선 사용. 군용 UI에 적합한 CC0 에셋 다수 제공.

### 4-2. 사운드 에셋

| 사운드 | 출처 | 라이선스 | 상태 |
|--------|------|---------|------|
| 무전기 전송음 | Freesound.org | CC0 | ⬜ 미수집 |
| 무전기 노이즈 (오청 효과) | Freesound.org | CC0 | ⬜ 미수집 |
| 총성 | Freesound.org | CC0 | ⬜ 미수집 |

### 4-3. 폰트

| 폰트 | 출처 | 용도 |
|------|------|------|
| Share Tech Mono | Google Fonts | 채팅·좌표·HUD |
| Noto Sans KR | Google Fonts | 메뉴·설명 |

---

## 5. 개발 진행 척도

### 5-1. Phase 1 — 예선 MVP (목표: 4월 10일)

**[인프라·기반]**
- [ ] GitHub 레포지토리 생성 및 팀원 초대
- [ ] GitHub Pages 배포 연동 확인
- [ ] Gemini API 키 발급 및 사지방 접근 테스트 ← **최우선**
- [ ] index.html + Phaser CDN 기본 로드 확인

**[맵·지형]**
- [ ] 8×8 정사각형 그리드 렌더링
- [ ] 지형 타일 3~4종 배치 (개활지·수풀·계곡·고지)
- [ ] 타일 클릭 → 유닛 이동 입력
- [ ] 지형별 이동 비용 적용

**[플레이어 — 대대장 시점]**
- [ ] 아군 분대 3~5개 생성 및 선택
- [ ] 분대 이동 명령 입력
- [ ] 분대 사격 명령 입력
- [ ] AP(행동력) 시스템 (분대당 턴마다 초기화)

**[AI 적군 — Gemini API]**
- [ ] GeminiClient.js 기본 구현 (fetch + 응답 파싱)
- [ ] 맵 상태 직렬화 (프롬프트용 JSON 생성)
- [ ] 적 유닛 행동 실행 (이동·공격)
- [ ] FallbackAI.js 랜덤 이동 폴백 구현

**[턴 시스템]**
- [ ] 명령 입력 페이즈 (클릭 입력)
- [ ] 실행 페이즈 (아군 → AI 적군 순 실행)
- [ ] 턴 종료 버튼

**[통신 오류 — 오청 1종]**
- [ ] 통신 품질 수치 계산 (지형·배터리 기반)
- [ ] 오청 발생 시 명령 텍스트 변형 (좌표·방향 치환)
- [ ] 채팅창 글리치 효과 + 경고음

**[교전 판정]**
- [ ] 소총 사거리·명중률 판정
- [ ] 즉사·부상 처리
- [ ] 포그 오브 워 (시야 범위 3타일)

**[생존 스탯 HUD]**
- [ ] 피로도·배고픔·수면 HUD 표시
- [ ] 매 턴 자동 감소 + 고갈 시 AP -1 패널티

**[데모 준비]**
- [ ] 데모 시나리오 스크립트 작성
- [ ] 1~2분 플레이 가능한 시나리오 구성
- [ ] 유튜브 데모 영상 촬영 (1~2분)

---

### 5-2. Phase 2 — 본선 고도화 (본선 진출 시)

- [ ] 8×8 → 20×20 헥스 그리드 전환
- [ ] 통신 오류 5종 전체 구현 (오청·지연·두절·도청·위장삽입)
- [ ] 야간 페이즈 완전 구현
- [ ] 생존 스탯 완전 구현 (체력 내성·회복 수단·수면 딜레마)
- [ ] 보급 시스템 전체 구현
- [ ] AAR 시스템 (히트맵·리플레이·통신 오류 통계)
- [ ] 인수인계 체계 구현 (KCTC 실제 방식)
- [ ] 특수 이벤트 (내부자·포격 오류·배터리 위기)
- [ ] 멀티플레이 도입 (Firebase Realtime DB, 25v25)
- [ ] 역할 편성 전체 구현 (무전병·의무병·공병 등)
- [ ] Gemini AI 난이도 자동 조절
- [ ] 모바일 터치 UI 최적화
- [ ] 사운드 전체 적용

---

## 6. 개발 일정

| 기간 | 목표 | 담당 | 상태 |
|------|------|------|------|
| ~3월 말 | 인프라 + 8×8 맵 + Gemini API 접근 테스트 | 공동 | ⬜ |
| 4월 1~3일 | 대대장 조작 + AI 적군 기본 동작 | 공동 | ⬜ |
| 4월 4~6일 | 오청 시스템 + 교전 판정 + 포그 오브 워 | 공동 | ⬜ |
| 4월 7~8일 | HUD + UI 정리 + 데모 시나리오 | 공동 | ⬜ |
| 4월 9일 | 최종 테스트 + 버그 수정 | 공동 | ⬜ |
| 4월 10일 | 유튜브 영상 촬영 + 예선 접수 | 공동 | ⬜ |

---

## 7. 알려진 기술적 리스크

| 리스크 | 내용 | 대응 방안 |
|--------|------|---------|
| **사지방 Gemini API 차단** | generativelanguage.googleapis.com 도메인 차단 가능 | 사전 테스트 필수. 차단 시 FallbackAI(랜덤 이동)로 즉시 전환. 데모 영상은 개인 기기에서 촬영 |
| Gemini 응답 지연 | API 응답 1~3초 소요 | 로딩 인디케이터 표시, 타임아웃 3초 설정 |
| Gemini 비정형 응답 | JSON 파싱 실패 가능 | try-catch + 폴백 행동(제자리 대기) |
| 정사각형 → 헥스 전환 | 본선 시 좌표 계산 로직 전면 교체 필요 | 예선 GridMap.js를 모듈화해 교체 용이하게 설계 |
| 모바일 터치 | 예선은 PC 전용 | 본선에서 최적화 |

---

## 8. 참고 링크

| 항목 | URL |
|------|-----|
| 육군창업경진대회 공식 | https://army-startup.co.kr/ |
| Phaser.js 공식 문서 | https://phaser.io/docs |
| Google AI Studio (Gemini API) | https://aistudio.google.com/ |
| Gemini API 문서 | https://ai.google.dev/docs |
| Kenney 에셋 | https://kenney.nl/assets |
| OpenGameArt | https://opengameart.org |
| Freesound | https://freesound.org |

---

*Signal-Fog 개발 진행 척도 문서 v0.2 — 팀 LNG*
*최종 수정: 2026.03.25*
