type ScenarioVariantKey = 'strict' | 'balanced' | 'relaxed';

export type ScenarioConditionDetail = {
  keyword: string;
  label: string;
  detail: string;
};

export type GeneratedScenario = {
  tempScenarioId: string;
  variant: ScenarioVariantKey;
  name: string;
  description: string;
  conditions: ScenarioConditionDetail[];
  sql: string;
  numericThresholds: Array<number | null>;
  keywords: string[];
};

type VariantConfig = {
  key: ScenarioVariantKey;
  order: number;
  title: string;
  displayName: string;
};

const VARIANTS: VariantConfig[] = [
  { key: 'strict', order: 1, title: '시나리오 1', displayName: '엄격형' },
  { key: 'balanced', order: 2, title: '시나리오 2', displayName: '표준형' },
  { key: 'relaxed', order: 3, title: '시나리오 3', displayName: '민감형' },
];

type ConditionBuilder = (variant: ScenarioVariantKey, keyword: string) => {
  label: string;
  detail: string;
  sql: string;
  numericThreshold?: number;
};

const amountThresholds: Record<ScenarioVariantKey, number> = {
  strict: 5_000_000,
  balanced: 3_000_000,
  relaxed: 1_500_000,
};

const youthAgeThresholds: Record<ScenarioVariantKey, number> = {
  strict: 28,
  balanced: 32,
  relaxed: 38,
};

const seniorAgeThresholds: Record<ScenarioVariantKey, number> = {
  strict: 65,
  balanced: 60,
  relaxed: 55,
};

const nightWindows: Record<ScenarioVariantKey, { from: string; to: string }> = {
  strict: { from: '23:00:00', to: '04:59:59' },
  balanced: { from: '22:00:00', to: '05:59:59' },
  relaxed: { from: '21:00:00', to: '06:59:59' },
};

const afternoonWindows: Record<ScenarioVariantKey, { from: string; to: string }> = {
  strict: { from: '12:00:00', to: '13:30:00' },
  balanced: { from: '11:30:00', to: '14:00:00' },
  relaxed: { from: '11:00:00', to: '15:00:00' },
};

const buildHighWithdrawalCondition: ConditionBuilder = (variant) => {
  const threshold = amountThresholds[variant];
  return {
    label: '출금 금액',
    detail: `출금 금액이 ${threshold.toLocaleString()}원 초과`,
    sql: `t.WITHDRAWAL_AMOUNT > ${threshold}`,
    numericThreshold: threshold,
  };
};

const buildNightCondition: ConditionBuilder = (variant) => {
  const window = nightWindows[variant];
  return {
    label: '야간 시간대',
    detail: `${window.from}~${window.to} 사이 출금`,
    sql: `((t.WITHDRAWAL_TIME >= '${window.from}') OR (t.WITHDRAWAL_TIME <= '${window.to}'))`,
  };
};

const buildYouthCustomerCondition: ConditionBuilder = (variant) => {
  const threshold = youthAgeThresholds[variant];
  return {
    label: '고객 나이',
    detail: `${threshold}세 미만 고객`,
    sql: `c.CUSTOMER_AGE < ${threshold}`,
    numericThreshold: threshold,
  };
};

const buildSeniorCustomerCondition: ConditionBuilder = (variant) => {
  const threshold = seniorAgeThresholds[variant];
  return {
    label: '고객 나이',
    detail: `${threshold}세 이상 고객`,
    sql: `c.CUSTOMER_AGE >= ${threshold}`,
    numericThreshold: threshold,
  };
};

const buildChannelCondition = (channelLabel: string, channelValue: string): ConditionBuilder => {
  return () => ({
    label: '거래 채널',
    detail: `${channelLabel} 이용`,
    sql: `t.WITHDRAWAL_CHANNEL = '${channelValue}'`,
  });
};

const buildLunchCondition: ConditionBuilder = (variant) => {
  const window = afternoonWindows[variant];
  return {
    label: '점심 시간대',
    detail: `${window.from}~${window.to} 출금`,
    sql: `(t.WITHDRAWAL_TIME BETWEEN '${window.from}' AND '${window.to}')`,
  };
};

const KEYWORD_RULES: Record<string, ConditionBuilder> = {
  '고액 출금': buildHighWithdrawalCondition,
  '대규모 출금': buildHighWithdrawalCondition,
  '야간': buildNightCondition,
  '야간 출금': buildNightCondition,
  '심야': buildNightCondition,
  '젊은 고객': buildYouthCustomerCondition,
  '청년 고객': buildYouthCustomerCondition,
  '고령 고객': buildSeniorCustomerCondition,
  '고령자': buildSeniorCustomerCondition,
  'atm': buildChannelCondition('ATM 채널', 'ATM'),
  '창구': buildChannelCondition('창구 채널', '창구'),
  '인터넷': buildChannelCondition('온라인 채널', '온라인'),
  '온라인': buildChannelCondition('온라인 채널', '온라인'),
  '점심 시간': buildLunchCondition,
};

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function escapeLikeValue(value: string) {
  return value.replace(/'/g, "''");
}

function buildCondition(keyword: string, variant: ScenarioVariantKey) {
  const normalized = normalizeKeyword(keyword);
  const builder = KEYWORD_RULES[normalized];

  if (builder) {
    return builder(variant, keyword);
  }

  const sanitized = escapeLikeValue(keyword);
  return {
    label: `${keyword} 사용자 정의 조건`,
    detail: `거래 채널 값에 '${keyword}' 포함`,
    sql: `t.WITHDRAWAL_CHANNEL LIKE '%${sanitized}%'`,
  };
}

function generateTempId(order: number) {
  return `TEMP-${order}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateScenarios(keywordsInput: string[]): GeneratedScenario[] {
  const keywords = keywordsInput.map((keyword) => keyword.trim()).filter(Boolean);
  if (keywords.length !== 3) {
    throw new Error('3개의 키워드를 정확히 입력해 주세요.');
  }

  return VARIANTS.map((variant) => {
    const conditions = keywords.map((keyword) => {
      const condition = buildCondition(keyword, variant.key);
      return {
        keyword,
        label: condition.label,
        detail: condition.detail,
        sql: condition.sql,
        numericThreshold: condition.numericThreshold ?? null,
      };
    });

    const numericThresholds = conditions.map((condition) => condition.numericThreshold ?? null).slice(0, 3);
    const sqlConditions = conditions.map((condition) => condition.sql).join('\n  AND ');

    const sql = `
SELECT
  c.CUSTOMER_ID,
  t.TXN_ID,
  t.WITHDRAWAL_DATE,
  t.WITHDRAWAL_TIME,
  t.WITHDRAWAL_AMOUNT,
  t.WITHDRAWAL_CHANNEL
FROM TB_CUSTOMER c
JOIN TB_TRANSACTION t ON c.CUSTOMER_ID = t.CUSTOMER_ID
WHERE
  ${sqlConditions}
ORDER BY t.WITHDRAWAL_DATE DESC, t.WITHDRAWAL_TIME DESC;
    `.trim();

    const conditionsForResponse = conditions.map(({ keyword, label, detail }) => ({
      keyword,
      label,
      detail,
    }));

    const description = `${variant.displayName} 민감도로 ${keywords.join(', ')} 조건을 동시에 만족하는 거래를 탐지합니다.`;

    return {
      tempScenarioId: generateTempId(variant.order),
      variant: variant.key,
      name: `${variant.title} | ${variant.displayName}`,
      description,
      conditions: conditionsForResponse,
      sql,
      numericThresholds,
      keywords,
    };
  });
}

