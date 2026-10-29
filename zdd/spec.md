# 스타의 댓글 모아보기 — spec

스타가 남긴 댓글을 한곳에 모아 팬에게 보여주고, 운영자가 코드 수정 없이 어드민에서 운영하는 템플릿.
스테이지 `ariana-test`. 이 문서가 **단일 기준**이다 — 기능이 바뀌면 이 문서·테스트·`log.md`를 함께 고친다.

- 유저 레포(이 레포, Surface USER): 팬 화면 `src/shared/StarCommentsFeed.tsx`, 슬롯·페이지 `src/slots/star-comments-feed*`, `src/pages/star-story-comments`
- 어드민 레포 `ariana-test-admin-templates-sandbox`(Surface ADMIN): 설정 화면 `/star-comments-settings` (콘솔 메뉴 "스타 댓글 모아보기 설정")
- 설정 모듈 `src/shared/starCommentsConfig.ts`는 두 레포가 **동일한 사본**이다. 어드민 쪽을 고친 뒤 이 레포로 복사한다.

## 1. 자리 (어디에 보이나)

운영자가 어드민 "어디에 보여줄까요"에서 켜고 끈다. 포털에 등록·게시된 자리만 실제로 보인다(체크를 꺼도 위젯은 남고 화면에서만 사라진다).
설정 키는 점(`.`)이 없는 짧은 키를 쓴다(점이 있으면 저장소가 500을 돌려준다).

| 설정 키 | 위치 | 슬롯 id / 주소 | ariana-test 에서 |
|---|---|---|---|
| `page` | 독립 페이지 | `/star-story-comments` | 확인됨 |
| `contents-after` | 콘텐츠 탭, 섹션 묶음 아래 | `user.contents-home.contents-section:after` | 확인됨 |
| `curation-list` | 큐레이션 목록 페이지 위 | `user.contents-curation.list:before` | **미확인** — 큐레이션 섹션은 있으나 목록 페이지 경로를 못 찾음 |
| `section-list` | 섹션 전체보기 페이지 위 | `user.contents-section.list:before` | 확인됨 |
| `contents-detail-after` | 콘텐츠 상세, 본문 아래 | `user.contents-detail.body:after` | 확인됨 |
| `contents-detail-comments` | 콘텐츠 상세, 댓글 영역 위 | `user.contents-detail.comments:before` | 확인됨 |
| `lounge-story` | 라운지 스토리 탭, 피드 위(그 라운지 스타만) | `user.lounge-story.feed:before` | **대상 제외** — 이 스테이지에 라운지 없음 |
| `lounge-contents` | 라운지 콘텐츠 탭, 섹션 위 | `user.lounge-contents.section:before` | **대상 제외** |
| `lounge-community` | 라운지 커뮤니티 탭, 게시판 위 | `user.lounge-community.feed:before` | **대상 제외** |

- 슬롯 하나에는 위젯 하나만 둘 수 있고, 한 슬롯 id는 스테이지에서 한 레포만 쓴다. 다른 레포가 쓰는 자리(스토리 홈 피드, 커뮤니티 게시판 피드, POP 홈, 샵 홈, 마이 메뉴)는 쓸 수 없고, 메인 홈에는 슬롯이 없다.
- 어드민은 이 스테이지에 라운지·큐레이션이 **없다고 확인된 경우에만** 해당 자리를 목록에서 숨긴다(확인이 안 되면 모두 보인다). "그래도 보기"로 펼칠 수 있다.
- 기본값: 저장된 설정이 없으면 예전 동작과 같다(`page`, `contents-after`만 켜짐, 나머지는 꺼짐).

## 2. 설정 (운영자가 바꾸는 값)

저장 위치: `custom-template-data`, displayKey `merry-star-comments`. 로컬 개발은 `localStorage` 키 `merry-star-comments-config-local`.

| 영역 | 항목 |
|---|---|
| 노출 | 전체 노출, 방문자용 켜기/끄기 스위치 보이기·숨기기, 노출 기간(시작·종료 날짜와 시각, 한국 시간), 대상(전체 공개 / 로그인한 팬만 — 멤버십·POP 구독자는 플랫폼에 가입 여부 API가 없어 선택 불가), 자리 |
| 문구 | 제목, 부제, 댓글 없을 때 문구, 링크 문구 3종(콘텐츠·스토리·커뮤니티) |
| 모을 댓글 | 출처 3종(콘텐츠 / 스타 스토리 / 커뮤니티), 제외할 게시판 |
| 스타 | 칩 순서(닉네임), 숨길 스타 |
| 큐레이션 | 태그 필터, 글당 최대 댓글 수와 정렬, 최소 반응 수, 맨 위에 고정할 댓글 ID, 숨길 단어, 숨길 댓글 ID |
| 목록 | 기본 정렬(최신 / 반응 많은 순), 보기 방식(블록 / 리스트), 방문자가 보기 방식을 바꿀 수 있게 할지, 한 번에 보여줄 개수(6~30) |

- 저장하면 약 10초 안에 반영된다. 팬 화면은 설정을 1분 단위 값(`?v=`)으로 읽는다. 어드민 진행 바는 70초 기준.
- 마지막 수정자·시각은 서버가 기록한 저장자(운영자 ID)로 자동 표시한다. 이름 조회가 안 되는 환경에서는 수정자 입력칸이 대신 나온다.
- "스타 순서"에 적은 닉네임은 댓글이 없어도 칩이 된다(스타 목록 API가 실패해도 칩이 남도록). "숨길 스타"는 순서에 적혀 있어도 계속 제외한다.

## 3. 데이터 출처 (팬 화면이 부르는 API)

스타 댓글을 한 번에 주는 API는 없어서 여러 소스를 합친다. 같은 댓글 id는 한 번만 표시한다.
`/svc/...`는 문서화된 게이트웨이 API가 아니라 내부 경로라 바뀔 수 있다 — 실패하면 그 소스만 건너뛴다.

| 용도 | 호출 | 현재 상태 |
|---|---|---|
| 스타 목록(칩) | `GET /home/v1/star-home/stars` | **400 Incorrect request** (2026-10-27) — 원인 미확인 |
| 스타 스토리 글 | `GET /home/v1/star-home/feeds`(라운지면 `/lounges/{handle}/feeds`) | 200 |
| 콘텐츠 글 | `GET /svc/home/api/v1/home/content`, `GET /home/v1/content-home/sections/curation`, `/shows` | 정상(`curation`·`shows`는 운영자가 큐레이션한 것만 담김) |
| 글의 스타 댓글 | `GET /svc/content/api/v1/comments/stars`, 반응 수 `GET /svc/content/api/v1/comments` | 정상 |
| 최신 스타 댓글(대체용) | `GET /content/v1/contents/{ids}/extras?preferStarComment=true` | 정상 |
| 커뮤니티 | `GET /content/v1/boards` → `/boards/{id}/posts` → 댓글 중 작성자 `type === 'STAR'` | 정상 |
| 태그 필터 | `GET /home/v1/feeds/tagged?tag=` | 응답 확인, **태그가 붙은 글이 없어 라이브 검증 못 함** |

- 팬 화면은 호출이 실패해도 빈 목록으로 넘어간다. 실패는 운영자용 `?curate=1` 점검 줄과 어드민 "연결 점검"에서 본다(PR #29, 어드민 #16 머지·배포 후).
- 어드민 쪽 호출: 설정 저장소(`/home/v1/custom-template-data/{displayKey}`, 어드민 로그인 + MANAGEMENT 키), 운영자 이름(`/account/v1/operators/{id}`), 큐레이션 확인(`/home/v1/home/content`), 라운지 확인(`/home/v1/pages/lounge-index`, 라운지가 없는 스테이지에서는 400).

## 4. 완료 기준 (회차를 닫으려면)

1. `npm run typecheck` 와 `npm test` 통과
2. 상태 4단계를 `log.md`에 기록: 머지 → 빌드 → 반영(LIVE) → **팬 화면에서 확인**
3. 확인하지 못한 항목은 "미확인"으로 남기고, 통과로 세지 않는다
4. 라이브 설정 값은 운영자 결정 없이 바꾸지 않는다

## 5. 알려진 한계 / 미확인

- 스타 목록 API 400의 원인과 시작 시점
- 큐레이션 목록 페이지 자리의 실제 위치, 라운지 자리 3곳의 동작(이 스테이지에 라운지가 없음)
- 태그 필터 라이브 동작, 글당 개수 제한과 로그인 전용 대상의 라이브 동작
- 스타가 남의 댓글에 단 답글은 반응 수를 몰라 0으로 본다. 커뮤니티는 댓글이 있는 최신 40개 글, 스타 스토리는 최근 50개 글만 본다.
