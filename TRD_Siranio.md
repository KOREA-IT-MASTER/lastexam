# TRD – 증권사 이상금융거래 탐지 시나리오 자동 생성 시스템(Siranio) 기술 명세

## 1. 시스템 개요 (기술 관점)

- **목적**  
  - 웹 기반 UI와 백엔드 API, 관계형 DB를 이용하여  
    - 3개 조건 키워드 입력 → 시나리오/SQL 자동 생성  
    - 시나리오 저장/관리  
    - 시나리오 실행 및 탐지 결과 이력 저장/조회  
    를 수행하는 단일 애플리케이션을 구현한다.

- **구성 요소**
  - 웹 프론트엔드 (조건 입력, 시나리오 표시, 결과 목록)
  - 백엔드 API 서버
  - 관계형 DBMS (고객, 거래, 시나리오, 탐지결과 테이블)
  - 시나리오 생성 엔진(룰/템플릿 로직)
  - 합성 데이터 생성 모듈(유틸리티/배치)

---

## 2. 기술 스택(예시, 확정은 착수 시 결정)

- **Frontend**
  - React + TypeScript 또는 동급 SPA 프레임워크
  - 빌드: Vite 또는 Webpack
- **Backend**
  - Java 17 + Spring Boot 3.x  
    또는 Node.js + Express (조직 표준에 따라 선택)
  - 인증: JWT 또는 세션 기반(POC용 간단 구조)
- **Database**
  - PostgreSQL(권장) 또는 기존 표준 DBMS (Oracle, MySQL 등)
  - Connection Pool: HikariCP(Java 기준)

---

## 3. 아키텍처 구조

### 3.1. 논리 아키텍처

- **Presentation Layer**
  - React 기반 Web UI
- **Application Layer**
  - `ScenarioController`
  - `ScenarioService`
  - `DetectionService`
  - `DataGenerationService`
- **Domain / Repository Layer**
  - `CustomerRepository`
  - `TransactionRepository`
  - `ScenarioRepository`
  - `DetectionResultRepository`
- **Infra Layer**
  - DB 연결, 로깅, 보안, 설정 관리

---

## 4. 데이터베이스 설계

### 4.1. 고객 정보 테이블

- **테이블명**: `TB_CUSTOMER`

| 컬럼명           | 타입           | 제약조건                              | 설명           |
|------------------|----------------|----------------------------------------|----------------|
| CUSTOMER_ID      | VARCHAR(20)    | PK                                     | 고객 ID        |
| CUSTOMER_AGE     | INT            | NOT NULL                               | 고객 나이      |
| CUSTOMER_GENDER  | CHAR(1)        | NOT NULL                               | 고객 성별(M/F) |
| CUSTOMER_REGION  | VARCHAR(50)    | NOT NULL                               | 거주지역       |
| CUSTOMER_REG_DATE| DATE           | NOT NULL                               | 고객 등록일자  |
| CREATED_AT       | TIMESTAMP      | NOT NULL, DEFAULT now()                | 생성 시각      |
| UPDATED_AT       | TIMESTAMP      | NOT NULL, DEFAULT now()                | 수정 시각      |

---

### 4.2. 고객 거래 정보 테이블

- **테이블명**: `TB_TRANSACTION`

| 컬럼명           | 타입           | 제약조건                                      | 설명                        |
|------------------|----------------|----------------------------------------------|-----------------------------|
| TXN_ID           | BIGSERIAL      | PK                                           | 거래 ID(내부 식별자)       |
| CUSTOMER_ID      | VARCHAR(20)    | FK → TB_CUSTOMER(CUSTOMER_ID)               | 고객 ID                     |
| WITHDRAWAL_DATE  | DATE           | NOT NULL                                     | 출금일자                    |
| WITHDRAWAL_TIME  | TIME           | NOT NULL                                     | 출금시간                    |
| WITHDRAWAL_AMOUNT| NUMERIC(18,2)  | NOT NULL                                     | 출금금액                    |
| WITHDRAWAL_CHANNEL| VARCHAR(20)   | NOT NULL                                     | 출금매체(ATM, 창구, 온라인) |
| CREATED_AT       | TIMESTAMP      | NOT NULL, DEFAULT now()                      | 생성 시각                   |

> 아이디어의 “거래번호”는 `TXN_ID`로 매핑. 필요 시 업무용 거래번호 컬럼 `TXN_NO` 추가 가능.

---

### 4.3. 이상금융거래 탐지 시나리오 테이블

- **테이블명**: `TB_SCENARIO`

| 컬럼명             | 타입           | 제약조건                       | 설명                                |
|--------------------|----------------|---------------------------------|-------------------------------------|
| SCENARIO_ID        | BIGSERIAL      | PK                              | 시나리오 ID                         |
| SCENARIO_NAME      | VARCHAR(200)   | NOT NULL                        | 시나리오 이름                       |
| SCENARIO_DESC      | TEXT           | NOT NULL                        | 시나리오 설명                       |
| CONDITION_KEYWORD1 | VARCHAR(100)   | NOT NULL                        | 입력 키워드 1                       |
| CONDITION_KEYWORD2 | VARCHAR(100)   | NOT NULL                        | 입력 키워드 2                       |
| CONDITION_KEYWORD3 | VARCHAR(100)   | NOT NULL                        | 입력 키워드 3                       |
| THRESHOLD_1        | NUMERIC(18,2)  | NULL                            | 조건별 임계값 1                     |
| THRESHOLD_2        | NUMERIC(18,2)  | NULL                            | 조건별 임계값 2                     |
| THRESHOLD_3        | NUMERIC(18,2)  | NULL                            | 조건별 임계값 3                     |
| SQL_TEXT           | TEXT           | NOT NULL                        | 자동 생성된 SQL 문                  |
| REG_DATE           | DATE           | NOT NULL                        | 시나리오 등록일                     |
| REG_TIME           | TIME           | NOT NULL                        | 시나리오 등록시간                   |
| CREATED_BY         | VARCHAR(50)    | NULL                            | 등록 사용자 ID                      |
| CREATED_AT         | TIMESTAMP      | NOT NULL, DEFAULT now()         | 생성 시각                           |

---

### 4.4. 실제 탐지 결과 이력 테이블

- **테이블명**: `TB_DETECTION_RESULT`

| 컬럼명        | 타입           | 제약조건                                      | 설명                    |
|---------------|----------------|----------------------------------------------|-------------------------|
| RESULT_ID     | BIGSERIAL      | PK                                           | 탐지 결과 ID            |
| CUSTOMER_ID   | VARCHAR(20)    | FK → TB_CUSTOMER(CUSTOMER_ID)               | 고객 ID                 |
| TXN_ID        | BIGINT         | FK → TB_TRANSACTION(TXN_ID)                 | 거래 ID                 |
| SCENARIO_ID   | BIGINT         | FK → TB_SCENARIO(SCENARIO_ID)               | 시나리오 ID             |
| DETECTION_TIME| TIMESTAMP      | NOT NULL, DEFAULT now()                      | 탐지 수행 시각          |

---

## 5. API 설계(예시)

### 5.1. 시나리오 자동 생성 API

- **메서드/URL**: `POST /api/scenarios/generate`
- **요청 바디**
```json
{
  "conditionKeyword1": "고액 출금",
  "conditionKeyword2": "야간",
  "conditionKeyword3": "젊은 고객"
}
```
- **응답 바디**
```json
{
  "scenarios": [
    {
      "tempScenarioId": "TEMP-1",
      "name": "젊은 고객의 야간 고액 출금",
      "description": "30세 미만 고객이 야간(22~06시)에 일정 금액 이상 출금하는 패턴 탐지",
      "thresholds": {
        "amount": 3000000,
        "timeFrom": "22:00",
        "timeTo": "06:00",
        "ageMax": 30
      },
      "sql": "SELECT ... FROM TB_CUSTOMER c JOIN TB_TRANSACTION t ON ... WHERE ..."
    },
    {
      "tempScenarioId": "TEMP-2",
      "...": "..."
    },
    {
      "tempScenarioId": "TEMP-3",
      "...": "..."
    }
  ]
}
```

---

### 5.2. 시나리오 저장 API

- **메서드/URL**: `POST /api/scenarios`
- **요청 바디**
```json
{
  "name": "젊은 고객의 야간 고액 출금",
  "description": "30세 미만 고객이 야간 시간대에 ...",
  "conditionKeyword1": "고액 출금",
  "conditionKeyword2": "야간",
  "conditionKeyword3": "젊은 고객",
  "threshold1": 3000000,
  "threshold2": 30,
  "threshold3": null,
  "sqlText": "SELECT c.customer_id, t.txn_id ... "
}
```
- **응답 바디**
```json
{
  "scenarioId": 101,
  "status": "SAVED"
}
```

---

### 5.3. 시나리오 목록 조회 API

- **메서드/URL**: `GET /api/scenarios`
- **응답 바디**
```json
[
  {
    "scenarioId": 101,
    "name": "젊은 고객의 야간 고액 출금",
    "regDate": "2025-11-29",
    "regTime": "09:00:00"
  }
]
```

---

### 5.4. 탐지 실행 API

- **메서드/URL**: `POST /api/detections/run`
- **요청 바디**
```json
{
  "scenarioIds": [101]
}
```
- **동작**
  - 각 시나리오 ID에 대해 `TB_SCENARIO`에서 `SQL_TEXT`를 조회.
  - SQL을 실행하여 결과를 `TB_DETECTION_RESULT`에 INSERT.
- **응답 바디(예시)**
```json
{
  "scenarioId": 101,
  "detectedCount": 25
}
```

---

### 5.5. 탐지 결과 조회 API

- **메서드/URL**: `GET /api/detections?scenarioId=101`
- **응답 바디(예시)**
```json
[
  {
    "resultId": 1,
    "customerId": "C0001",
    "txnId": 1234,
    "scenarioId": 101,
    "detectionTime": "2025-11-29T09:05:00"
  }
]
```

---

## 6. 시나리오 생성 로직(고수준)

1. **입력**: 3개의 조건 키워드 문자열
2. **전처리**
   - 공백 제거, 소문자/표준어 정규화 등
3. **키워드 → 조건 템플릿 매핑**
   - “고액 출금” → `WITHDRAWAL_AMOUNT > THRESHOLD_1`
   - “야간” → `WITHDRAWAL_TIME BETWEEN '22:00' AND '06:00'`
   - “젊은 고객” → `CUSTOMER_AGE < THRESHOLD_2`
4. **3개 시나리오 생성**
   - 시나리오 1: 가장 엄격한 임계값(금액 높게, 시간대 좁게 등)
   - 시나리오 2: 중간 수준 임계값
   - 시나리오 3: 완화된 임계값(민감도 높음)
5. **SQL 조합**
   ```sql
   SELECT c.customer_id,
          t.txn_id
     FROM TB_CUSTOMER c
     JOIN TB_TRANSACTION t
       ON c.customer_id = t.customer_id
    WHERE t.withdrawal_amount > :amountThreshold
      AND (t.withdrawal_time >= '22:00' OR t.withdrawal_time <= '06:00')
      AND c.customer_age < :ageThreshold;
   ```
6. 각 시나리오별로 이름, 설명, 임계값, SQL을 구성하여 프론트엔드로 반환.

---

## 7. 합성 데이터 생성 로직

- **서비스명(예)**: `DataGenerationService`

### 7.1. 고객 데이터 생성

- 메서드: `generateCustomers(count = 5_000)`
  - 1~5,000 루프:
    - 나이: 0~80 사이 랜덤
    - 성별: M/F 랜덤
    - 거주지역: 미리 정의된 리스트(예: “서울”, “경기”, “부산”, …) 중 랜덤 선택
    - 등록일자: 최근 5년 범위 내 랜덤
    - `TB_CUSTOMER`에 INSERT

### 7.2. 거래 데이터 생성

- 메서드: `generateTransactions(count = 100000)`
  - 1~100,000 루프:
    - CUSTOMER_ID: `TB_CUSTOMER`에서 랜덤 선택
    - 출금일자: 최근 1년 중 랜덤
    - 출금시간: 00:00~23:59 중 랜덤
    - 출금금액: 80%는 소액, 20%는 고액이 되도록 분포 정의
    - 출금매체: ATM/창구/온라인 중 랜덤
    - `TB_TRANSACTION`에 INSERT

---

## 8. 보안 및 로깅

- **인증**
  - PoC 단계에서는 단일 계정 혹은 간단한 로그인 화면으로 제한.
- **권한**
  - 모든 기능은 “RISK_ANALYST” 역할로 가정. (추후 Role 기반 확장 가능)
- **로깅**
  - 시나리오 생성 요청/응답(사용자, 키워드, 결과 개수).
  - 시나리오 저장(시나리오 ID, 사용자, 시간).
  - 탐지 실행(시나리오 ID, 실행 시각, 탐지 건수).
