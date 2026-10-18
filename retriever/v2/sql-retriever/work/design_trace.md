# SQL 검색기 설계 대조표

설계와 구현이 서로 다른 약속을 갖지 않도록, 먼저 입력과 출력, 시간 제한, 실패 경로를 연결합니다.
현재는 개발 전 분석본입니다. 아래 소스 경로와 시험 이름은 배치 후보이며 아직 구현하거나 실행하지 않았습니다.
문의 항목에 대한 사용자 답을 받은 뒤 개발 계획을 확정합니다.

## 확인한 자료와 범위

- 설계 폴더: `design/sql-retriever`
- 출력 폴더: `retriever/v2/sql-retriever`
- PPT: `sql_retriever_워크플로우설계서.pptx` 28장 전체의 제목, 본문, 표와 도형 글자를 추출했습니다.
- 스크립트: 같은 이름의 `.md` 전체와 시스템 프롬프트 전문을 읽었습니다.
- 결정 기록: `work/decisions.json` 전체를 읽었습니다.
- DB 구조: `work/db_catalog.json` 전체를 읽었습니다.
- 구조 확인 스크립트: `tools/read_views.py` 전체를 읽었으며 실행하지 않았습니다.
- 미리보기: `build/out/slide-6.png`에서 화살표 방향과 분기를 확인했습니다.
- 기존 미리보기는 PPT보다 새로 생성되어 다시 렌더링하지 않았습니다.
- `build/build_deck.js`와 허용 입력 밖의 설계 파일은 읽지 않았습니다.
- 출력 폴더는 작업 시작 시 없었습니다. 덮어쓴 기존 결과는 없습니다.
- `RDB_PASSWORD`, `GROQ_API_KEY`의 비어 있지 않음만 확인했습니다. 값은 기록하지 않습니다.

PPT의 주요 값과 스크립트, 결정 기록의 모델, 시간 제한, 재시도, 허용 목록은 일치합니다.
흐름 그림과 Mermaid도 같은 연결을 보입니다. 다만 설계 내부의 규칙 충돌과 빠진 세부 계약은 아래에 남깁니다.

## 단계와 시험 연결

NL2SQL은 사람의 질문을 SQL 조회문으로 바꾸는 방식입니다.
정형쿼리는 자주 쓰는 조회를 미리 정해 둔 SQL이며, 모델은 SQL 대신 조회 ID를 고릅니다.

| 단계 | 근거 | 구현 위치 후보 | 확인할 시험 후보 |
|---|---|---|---|
| S-R1 요청 접수와 검증 | PPT 8 | `application/services.py` | `tests/test_request.py` |
| S-R2 경로와 SQL 계획 | PPT 9, 17 ~ 19 | `application/services.py` | `tests/test_planning.py` |
| S-R3 계획 적합성 | PPT 10 | `domain/planning.py` | `tests/test_planning.py` |
| S-R4 SQL 검증 | PPT 11, 24 | `infrastructure/sql_validator.py` | `tests/test_sql_validation.py` |
| S-R5 읽기 전용 실행 | PPT 12 | `infrastructure/postgres.py` | `tests/test_postgres.py` |
| S-R6 응답 구성 | PPT 13, 25 ~ 26 | `application/services.py` | `tests/test_response.py` |
| L-1 재생성 1회 | PPT 5 ~ 7, 15 | `application/services.py` | `tests/test_workflow.py` |
| 단계 진입 시간 검사 | PPT 20 ~ 21 | `domain/budget.py` | `tests/test_budget.py` |
| CLI와 동기 API | 개발 프롬프트 4단계 | `presentation/` | `tests/test_presentation.py` |

### S-R1: 요청 접수와 검증

입력은 `request_id(str, 선택)`, `member_id(str, 필수)`, `question(str, 필수)`와
`base_date(date, 선택)`입니다. 회원ID는 `M-`와 숫자 4자리이며 질문 길이는 1 ~ 500자입니다.

메타데이터에서 기준일과 거래 제공 시작일을 정하고, 세션 범위를 지정한 뒤 회원 존재와 가입일을 확인합니다.
질문의 회원ID, 카드번호, 전화번호, 주민등록번호, 이메일은 규칙으로 가립니다.
이름은 현재 설계에서 완전하게 가리지 못하는 위험으로 남아 있습니다.

출력은 다음과 같습니다.

- `request_id(str, 필수)`, `member_id(str, 필수, 내부 전용)`
- `masked_question(str, 필수)`, `masked_types(list, 필수)`
- `base_date(date, 필수)`, `coverage_start(date, 필수)`
- `started_at(float, 필수)`, `attempt(int, 필수, 1)`

형식 오류, 회원 없음, 가입 전 기준일, DB 접속 실패를 각각 시험합니다.
메타데이터 값의 형식과 선택 기준일의 허용 범위는 아직 확정되지 않았습니다.

### S-R2: 정형쿼리 또는 NL2SQL 판단

입력은 `masked_question`, `base_date`, `coverage_start`, `attempt`입니다.
재생성 시에는 `validation_errors(list)`와 `previous_sql(str)`도 받습니다.

한 번의 C-01 호출로 경로와 계획을 함께 받습니다. 응답은 엄격한 JSON 스키마로 검증합니다.
LLM 응답의 `sql`은 내부 단계 필드 `generated_sql`로 연결합니다.
출력은 `route(str)`, `fixed_query_id(str, 선택)`, `generated_sql(str, 선택)`,
`used_views(list)`, `reason(str)`, `plan_source(str)`와 `attempt(int)`입니다.
`plan_source`는 `llm` 또는 `keyword_fallback`입니다.

호출 실패 시 키워드 대체 경로를 사용합니다. 키워드가 없거나 여러 조회에 동시에 맞으면 실패합니다.
2회차 호출 실패에도 대체 경로를 허용하는지는 확인이 필요합니다.

### S-R3: 계획 적합성 판정

S-R2의 출력 필드를 입력으로 받습니다.
`fixed`는 FQ-01 ~ FQ-09의 SQL을 선택하고, `nl2sql`은 비어 있지 않은 SQL과 허용 뷰를 검사합니다.
답할 수 없으면 S-R6로 이동합니다. 경로와 값의 모순은 `plan_issues`에 기록해 S-R4로 넘깁니다.

출력은 `decision(str, to_validate 또는 unanswerable)`, `candidate_sql(str, 선택)`,
`plan_issues(list)`, `route(str)`, `fixed_query_id(str, 선택)`,
`unanswerable_reason(str, 선택)`와 `attempt(int)`입니다.

경로별 정상 값과 서로 맞지 않는 조합, 시간 부족을 시험합니다.

### S-R4: SQL 검증

입력은 `candidate_sql`, `plan_issues`, `route`, `fixed_query_id`, `attempt`입니다.
구문 분석으로 읽기 SQL 한 문장인지 확인하고 허용 뷰, 컬럼과 함수만 통과시킵니다.
그 뒤 읽기 전용 트랜잭션에서 EXPLAIN으로 문법과 권한을 검사합니다.
EXPLAIN은 조회 실행 결과 대신 실행 계획을 확인하는 기능입니다.

출력은 `validated_sql(str, 선택)`, `row_limit(int, 200)`, `validation_errors(list)`,
`previous_sql(str, 선택)`, `attempt(int)`, `route`, `fixed_query_id`입니다.
처음 실패하면 `attempt=2`로 S-R2에 돌아가며 두 번째 검증 실패는 422로 종료합니다.

현재의 LIMIT 201 강제 문구는 작은 LIMIT의 의미와 충돌하므로 적용 방법을 확인해야 합니다.
DB 접속 실패는 오류 표에서 별도로 지정되어 있습니다. EXPLAIN 시간 초과 등은 분류 확정이 필요합니다.

### S-R5: SQL 실행

입력은 S-R4의 검증된 SQL과 행 상한, 경로, 조회 ID와 S-R1의 회원ID, 기준일, 거래 제공 시작일입니다.
`sql_retriever_user`로 연결하여 `BEGIN READ ONLY` 안에서 조회한 뒤 `ROLLBACK`으로 정리합니다.
문장 제한 시간은 실행 직전에 다시 계산한 남은 예산과 5초 중 작은 값입니다.

출력은 `columns(list)`, `rows(list, 최대 200행)`, `row_count(int)`, `truncated(bool)`,
`db_elapsed_ms(int)`, `route`, `fixed_query_id`입니다. 201번째 행은 잘림 여부만 판단합니다.
0행도 정상입니다. 실제 데이터 행을 LLM에 보내지 않습니다.

읽기 전용 여부, 세션 범위와 롤백, 0행, 잘림, 시간 초과와 접속 실패를 시험합니다.
`columns`와 `rows`의 원소 구조는 아직 명세에 없습니다.

### S-R6: 응답 구성과 반환

S-R5의 조회 결과 또는 S-R3의 답할 수 없음 판정과 S-R1의 추적 ID, 기간, 시작 시각을 받습니다.
정상 응답 필드는 `request_id`, `status`, `route`, `fixed_query_id(선택)`, `period`,
`columns`, `rows`, `row_count`, `truncated`, `message`, `elapsed_ms`입니다.

`status`는 `ok` 또는 `unanswerable`입니다. 응답에는 SQL을 넣지 않습니다.
가린 질문, 경로, SQL 해시, 회원ID 해시, 행 수, 소요 시간과 토큰 사용량을 감사 로그로 기록합니다.
응답 조립에는 별도로 확보한 종료 처리 시간 1초를 사용합니다.

## LLM 커넥터 C-01

| 항목 | 설계 값 | 근거 |
|---|---|---|
| 제공자와 모델 | Groq, `openai/gpt-oss-120b` | PPT 17, D-03 |
| 베이스 URL | `https://api.groq.com/openai/v1` | PPT 17, 조사 기록 |
| 엔드포인트 | `POST /chat/completions` | PPT 17 |
| 인증 | Bearer, 환경변수 `GROQ_API_KEY` | PPT 17 |
| temperature, top_p | 0.1, 1 | PPT 17, D-04 |
| reasoning_effort, reasoning_format | high, hidden | PPT 17, D-04 |
| max_completion_tokens, seed | 5000, 42 | PPT 17, D-04 |
| n, stream | 1, false | PPT 17, D-04 |
| response_format | json_schema, strict true | PPT 17, D-04 |
| 타임아웃과 재시도 | 12초, SDK 포함 0회 | PPT 17, D-05 |

시스템 프롬프트는 스크립트 부록의 8섹션 전문을 그대로 별도 파일에 둡니다.
PPT 18의 목표, 역할, 맥락, 입력, 처리, 출력, 제약조건, 예시 요약과 의미가 일치합니다.
유저 프롬프트의 question, period, fixed_queries, views, row_limit, validation_feedback 태그를 유지합니다.
응답 5개 필드는 `route`, `fixed_query_id`, `sql`, `used_views`, `reason`입니다.
모든 필드가 필수이며 추가 필드는 금지합니다. 선택 값은 null을 허용합니다.

커넥터 구현 후보는 `infrastructure/groq_gateway.py`입니다.
가짜 포트 시험으로 요청 파라미터와 정보 노출 방지를 확인하고 실제 LLM 시험으로 동작과 지연을 측정합니다.
요청 한도와 시스템/user 역할 비교는 결정 기록의 확인 필요 항목입니다.

## 정형쿼리

PPT 23에는 아래 요지만 있습니다. 전체 SQL을 가리키는 `work/fixed_queries.json`은
개발 프롬프트의 허용 입력 목록에 없어 아직 읽지 않았습니다. 사용자 확인 후 대조표를 보완합니다.

| 조회 ID | 설계상 조회 | 근거 | 구현과 확인 후보 |
|---|---|---|---|
| FQ-01 | 고객 기본정보 | PPT 23 | `domain/fixed_queries.py`, 실제 DB 1회 |
| FQ-02 | 보유 카드, card_ref 순 | PPT 23 | 같은 파일, 실제 DB 1회 |
| FQ-03 | 카드별 월 이용금액 6개월 | PPT 23 | 같은 파일, 실제 DB 1회 |
| FQ-04 | 월별 이용금액 합계 6개월 | PPT 23 | 같은 파일, 실제 DB 1회 |
| FQ-05 | 최근 연체 현황 | PPT 23 | 같은 파일, 실제 DB 1회 |
| FQ-06 | 연체 이력 12개월 | PPT 23 | 같은 파일, 실제 DB 1회 |
| FQ-07 | 일별 이용금액 90일 | PPT 23 | 같은 파일, 실제 DB 1회 |
| FQ-08 | 업종별 이용금액 6개월 | PPT 23 | 같은 파일, 실제 DB 1회 |
| FQ-09 | 가맹점 이용 상위 10곳 | PPT 23 | 같은 파일, 실제 DB 1회 |

## SQL 허용 범위와 DB 실행

PPT 22, 24와 D-07을 기준으로 LLM에는 다음 7개 뷰와 카탈로그의 모든 컬럼만 제공합니다.

- `app.customer_profile`, `app.customer_cards`, `app.monthly_usage`
- `app.customer_delinquency`, `app.customer_delinquency_history`
- `app.customer_daily_usage`, `app.merchant_usage`

구문은 SELECT 한 문장, WITH, WHERE, 허용 뷰끼리 JOIN, GROUP BY, HAVING, ORDER BY, LIMIT, CASE입니다.
함수는 sum, count, avg, min, max, date_trunc, to_char, extract, coalesce, round,
greatest, least, abs, nullif만 허용합니다.

쓰기와 정의 구문, 여러 문장, 주석, SELECT INTO, FOR UPDATE는 금지합니다.
`app_internal`, `public`, `private`, `pg_catalog`, `information_schema` 접근을 금지합니다.
set_config, current_setting, pg_sleep, generate_series와 허용 목록 밖의 함수도 금지합니다.

서비스 내부의 고정 조회만 메타데이터와 `app_internal.member_basic`에 접근합니다.
세션 변수는 `app.member_id`, `app.base_date`, `app.coverage_start`이며 트랜잭션에만 적용합니다.
행 수준 보안은 DB가 한 요청 회원의 행만 보여 주는 규칙입니다.

DB 접속 값은 PostgreSQL 18.4, localhost:5432, DB `cardlab`입니다.
실행 계정은 D-01의 `sql_retriever_user`입니다.
카탈로그의 `cardlab`은 설계 당시 구조 확인용 관리자 계정이므로 실행 계정으로 사용하지 않습니다.
구조 확인 스크립트도 실행할 때 `--user sql_retriever_user`와 출력 경로를 명시해야 합니다.
이 스크립트는 허용 입력 밖의 뷰 생성 SQL도 읽으므로, 같은 카탈로그 조회만 수행하는 대체 시험을 검토합니다.

## 시간 예산

| 항목 | 값 또는 식 | 근거 |
|---|---|---|
| 전체 예산 | 30초 | PPT 16, D-02 |
| 종료 처리 | 1초 | PPT 16, D-02 |
| 남은 시간 | 30 - 사용 시간 - 1 | PPT 20 |
| 단계의 남은 예산 | 남은 시간 - 남은 외부 연동 최악값 | PPT 20 |
| 남은 외부 연동 | S-R2 전 12초, S-R3 이후 0초 | PPT 20 |
| 단계 시작 기준 | 30 × 0.05 = 1.5초 | PPT 20 |
| DB 문장 제한 | min(그 시점의 남은 예산, 5초) | PPT 20 |
| L-1 최악값 | (12 + 0 + 0) × 2 = 24초 | PPT 15 |
| DB와 규칙 처리 몫 | 30 - 24 - 1 = 5초 | PPT 16 |

최악값은 외부 연동이 제한 시간까지 걸리는 경우의 계산값입니다.
DB를 0초로 표시한 것은 외부 연동 합계에서 제외했다는 뜻이며 실제 DB 시간이 0이라는 뜻이 아닙니다.

계산 예는 사용 13초일 때 S-R2 예산 4초, 사용 16초일 때 1초,
사용 26초일 때 S-R5 예산과 DB 제한 3초입니다.

| 단계 | 시작 기준 미달 시 처리 | 시험 후보 |
|---|---|---|
| S-R1 | BUDGET_EXCEEDED | 가짜 시계로 경계값 검사 |
| S-R2 1회차 | 키워드 대체, 불일치면 BUDGET_EXCEEDED | 일치, 다중 일치, 불일치 |
| S-R2 2회차 | SQL_VALIDATION_FAILED | 재생성 진입 전 시간 부족 |
| S-R3, S-R4, S-R5 | BUDGET_EXCEEDED | 각 단계의 1.5초 직전과 직후 |
| S-R6 | 확보한 종료 시간 사용 | 정상과 답할 수 없음 응답 |

연결, 여러 DB 문장과 응답 조립을 합친 전체 제한 적용 방법은 개발 계획에서 구체화해야 합니다.
반복 후에도 조건을 다시 계산하며, 외부 SDK 자동 재시도는 끕니다.

## 오류 응답

오류 JSON은 `request_id`, `status(error)`, `error(code, message)`, `elapsed_ms`만 갖습니다.
메시지는 PPT 26의 문구를 그대로 사용하며 SQL, DB 식별자, 접속 정보와 키는 포함하지 않습니다.

| 오류 코드 | HTTP | 단계 | 확인할 시험 |
|---|---|---|---|
| INVALID_REQUEST | 400 | S-R1 | 누락, 형식, 길이 |
| MEMBER_NOT_FOUND | 404 | S-R1 | 회원 없음, 가입 전 |
| LLM_UNAVAILABLE | 503 | S-R2 | 호출과 대체 모두 실패 |
| SQL_VALIDATION_FAILED | 422 | S-R4 | 2회 실패와 L-1 착지 |
| SQL_TIMEOUT | 504 | S-R5 | SQLSTATE 57014 |
| SQL_EXECUTION_FAILED | 500 | S-R5 | 그 밖의 실행 오류 |
| DB_UNAVAILABLE | 503 | S-R1, S-R4, S-R5 | 연결 실패 |
| BUDGET_EXCEEDED | 504 | S-R1 ~ S-R5 | 단계 진입 예산 부족 |
| INTERNAL_ERROR | 500 | 모든 단계 | 예상하지 못한 오류 |

## 확인이 필요한 결정

아래 내용은 제안이며 사용자 승인 기록이 아닙니다.

1. 정형쿼리 전문 파일 `design/sql-retriever/work/fixed_queries.json`을 설계 입력에 추가할지 확인합니다.
2. 작은 LIMIT은 유지하고 LIMIT이 없거나 200을 넘으면 최대 201행까지만 조회할지 확인합니다.
   근거는 PPT 11, 24의 201 강제와 PPT 23의 상위 10, 시스템 전문 예시의 LIMIT 1입니다.
3. S-R2 2회차 호출 실패는 키워드 대체 없이 SQL_VALIDATION_FAILED로 종료할지 확인합니다.
   PPT 9, 14의 일반 대체 규칙과 PPT 15, 21의 반복 착지를 함께 확정해야 합니다.
4. 답할 수 없음 응답에서 `status=unanswerable`, `route=none`을 쓸지 확인합니다.
   내부 계획의 unanswerable과 PPT 25의 응답 route enum을 연결하는 변환이 명시되어 있지 않습니다.
5. `columns=[{name, type}]`, `rows=[[값, ...]]`처럼 컬럼 순서를 따르는 배열을 쓸지 확인합니다.
   날짜는 ISO 문자열, Decimal은 정밀도를 보존하는 문자열로 표현하는 안을 검토합니다.
6. 메타데이터의 `base_date`, `txn_period` 실제 형식을 읽기 전용으로 확인하고 해석 규칙을 확정해야 합니다.
   요청 기준일 생략 시 메타데이터 기준일을 쓰고, 이후 날짜와 제공 시작일 전 날짜는 400으로 거절하는 안입니다.
7. API 경로 `POST /search`, 로컬 주소 `127.0.0.1:8000`과 기본 CLI 인자를 개발 계획에 반영할지 확인합니다.
8. 오류 표에 없는 S-R1, S-R4의 DB 실패를 다음처럼 기존 코드로 연결할지 확인합니다.
   S-R1과 S-R4의 문장 시간 초과는 BUDGET_EXCEEDED, 연결 단절은 DB_UNAVAILABLE로 종료하는 안입니다.
   EXPLAIN의 문법과 권한 실패는 기존 검증 실패 규칙을 따르고, 기타 서버 오류는 INTERNAL_ERROR로 종료합니다.
   메타데이터 누락과 해석 불가는 INTERNAL_ERROR로 처리합니다. 오류 원문은 공개하지 않습니다.
9. Groq 조직별 요청 한도는 아직 확인되지 않았습니다.
   값을 알려 주시거나, 미확인 상태를 보고서에 남기고 순차 시험과 설계된 429 대체 경로만 검증하는 안입니다.
10. 시스템 전문은 원칙대로 system 메시지에 두고 user 역할 비교는 별도 평가 시험으로만 할지 확인합니다.
    다만 전문의 예시 질문은 '지난달'인데 SQL은 가장 최근 데이터 월을 선택합니다.
    SQL을 유지하면서 예시 질문만 '데이터가 있는 가장 최근 달'로 바로잡는 변경을 제안합니다.
    이 한 줄 수정도 사용자 승인 전에는 적용하지 않습니다.
11. 통합 시험에 사용할 실습 회원ID가 필요합니다.
    지정된 ID 또는 사용자 동의가 있는 `M-0001`을 존재 확인 후 사용하는 안입니다.
    보고서와 로그에는 회원ID 원문을 적지 않습니다.
12. 전체 요청 기한으로 연결과 외부 호출도 제한하고 초과 시 진행 중 작업을 취소하는 안을 확인합니다.
    단계 진입의 착지는 PPT 21을 유지합니다. S-R1, S-R3, S-R4의 실행 중 전체 기한 초과는
    BUDGET_EXCEEDED, S-R5 실행 중 초과는 SQL_TIMEOUT으로 연결합니다.
    S-R2 호출 실패는 3번에서 확정한 회차별 규칙으로 처리합니다.
    감사 로그는 출력 폴더 안의 로컬 `work/audit.jsonl`에 기록하고 S-R6의 1초 안에 끝내는 안입니다.
    감사 기록 실패 또는 응답 조립 실패는 INTERNAL_ERROR로 처리하는 안을 제안합니다.
13. 외부로 보내는 검증 피드백에는 DB 오류 원문 대신 허용 목록 기준의 정리된 사유를 사용합니다.
    이전 SQL도 개인 식별자를 다시 가린 뒤 보내는 안입니다.
    회원ID를 가릴 때 요청 회원은 `[회원]`, 다른 회원은 `[다른 회원]`으로 관계를 보존할지 확인합니다.
    모든 회원ID를 같은 표현으로 가리면 다른 회원의 정보 요청이라는 단서를 잃을 수 있습니다.

## 현재 검증 상태

자료 존재 확인, PPT 28장 텍스트 추출, 흐름 그림 확인과 설계 대조를 수행했습니다.
앱 소스 작성, 패키지 설치, DB 접속, LLM 호출, 단위 시험과 통합 시험은 수행하지 않았습니다.
설계 가정의 실측값도 아직 없습니다.

팀원 정의 원본이 작업공간에 없어 제공된 프로파일로 일반 에이전트를 호출했습니다.
지식니는 데이터와 SQL 규칙, 플로니는 흐름과 시간 예산, 커넥니는 연결과 응답 계약을 검토합니다.
최종 구현 배치와 패키지 버전은 문의 답변 후 개발 계획에서 확정합니다.
