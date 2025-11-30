const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: Record<string, unknown> | string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...rest } = options;
  const headers: Record<string, string> = {
    ...(rest.headers as Record<string, string>),
  };

  const fetchOptions: RequestInit = { ...rest, headers };
  if (body !== undefined) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    fetchOptions.headers = {
      'Content-Type': 'application/json',
      ...headers,
    };
  }

  const response = await fetch(`${API_BASE_URL}${path}`, fetchOptions);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || '요청이 실패했습니다.');
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export type GeneratedScenario = {
  tempScenarioId: string;
  variant: string;
  name: string;
  description: string;
  conditions: Array<{ keyword: string; label: string; detail: string }>;
  sql: string;
  numericThresholds: Array<number | null>;
  keywords: string[];
};

export type ScenarioRecord = {
  SCENARIO_ID: number;
  SCENARIO_NAME: string;
  SCENARIO_DESC: string;
  CONDITION_KEYWORD1: string;
  CONDITION_KEYWORD2: string;
  CONDITION_KEYWORD3: string;
  THRESHOLD_1: number | null;
  THRESHOLD_2: number | null;
  THRESHOLD_3: number | null;
  SQL_TEXT: string;
  REG_DATE: string;
  REG_TIME: string;
  CREATED_AT: string;
};

export type DetectionResult = {
  RESULT_ID: number;
  CUSTOMER_ID: string;
  TXN_ID: number;
  SCENARIO_ID: number;
  DETECTION_TIME: string;
  WITHDRAWAL_DATE: string;
  WITHDRAWAL_TIME: string;
  WITHDRAWAL_AMOUNT: number;
  WITHDRAWAL_CHANNEL: string;
};

export async function generateScenarios(keywords: string[]): Promise<GeneratedScenario[]> {
  const result = await request<{ scenarios: GeneratedScenario[] }>('/api/scenarios/generate', {
    method: 'POST',
    body: { keywords },
  });
  return result.scenarios;
}

export async function saveScenario(payload: {
  name: string;
  description: string;
  keywords: string[];
  numericThresholds: Array<number | null>;
  sqlText: string;
}) {
  return request<ScenarioRecord>('/api/scenarios', {
    method: 'POST',
    body: payload,
  });
}

export async function fetchScenarios() {
  return request<ScenarioRecord[]>('/api/scenarios');
}

export async function runDetections(scenarioIds: number[]) {
  return request<{ runs: Array<{ scenarioId: number; scenarioName: string | null; detectedCount: number; status: string }> }>(
    '/api/detections/run',
    {
      method: 'POST',
      body: { scenarioIds },
    },
  );
}

export async function fetchDetectionResults(scenarioId?: number) {
  const query = scenarioId ? `?scenarioId=${scenarioId}` : '';
  return request<DetectionResult[]>(`/api/detections${query}`);
}

