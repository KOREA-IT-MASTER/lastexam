import { useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  fetchDetectionResults,
  fetchScenarios,
  generateScenarios,
  runDetections,
  saveScenario,
  type DetectionResult,
  type GeneratedScenario,
  type ScenarioRecord,
} from './api';

const emptyKeywords = ['', '', ''];

function App() {
  const [keywords, setKeywords] = useState<string[]>(emptyKeywords);
  const [generatedScenarios, setGeneratedScenarios] = useState<GeneratedScenario[]>([]);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<number[]>([]);
  const [savingScenarioId, setSavingScenarioId] = useState<string | null>(null);
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>([]);
  const [activeScenarioFilter, setActiveScenarioFilter] = useState<number | null>(null);
  const [runFeedback, setRunFeedback] = useState<string | null>(null);
  const [runningDetection, setRunningDetection] = useState(false);
  const [loadingDetections, setLoadingDetections] = useState(false);

  useEffect(() => {
    refreshScenarioList();
    refreshDetectionResults();
  }, []);

  const refreshScenarioList = async () => {
    try {
      const data = await fetchScenarios();
      setScenarios(data);
      setSelectedScenarioIds((prev) => prev.filter((id) => data.some((scenario) => scenario.SCENARIO_ID === id)));
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  };

  const refreshDetectionResults = async (scenarioId?: number) => {
    try {
      setLoadingDetections(true);
      const data = await fetchDetectionResults(scenarioId);
      setDetectionResults(data);
      setActiveScenarioFilter(scenarioId ?? null);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoadingDetections(false);
    }
  };

  const handleKeywordChange = (index: number, value: string) => {
    setKeywords((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const canGenerate = useMemo(() => keywords.every((keyword) => keyword.trim().length > 0), [keywords]);

  const handleGenerate = async () => {
    if (!canGenerate) {
      setErrorMessage('3개의 키워드를 모두 입력해 주세요.');
      return;
    }

    setGenerateLoading(true);
    setErrorMessage(null);
    try {
      const scenariosResponse = await generateScenarios(keywords);
      setGeneratedScenarios(scenariosResponse);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleScenarioSave = async (scenario: GeneratedScenario) => {
    setSavingScenarioId(scenario.tempScenarioId);
    setErrorMessage(null);
    try {
      await saveScenario({
        name: scenario.name,
        description: scenario.description,
        keywords: scenario.keywords,
        numericThresholds: scenario.numericThresholds,
        sqlText: scenario.sql,
      });
      await refreshScenarioList();
      setRunFeedback(`'${scenario.name}' 시나리오가 저장되었습니다.`);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSavingScenarioId(null);
    }
  };

  const handleScenarioToggle = (scenarioId: number) => {
    setSelectedScenarioIds((prev) => {
      if (prev.includes(scenarioId)) {
        return prev.filter((id) => id !== scenarioId);
      }
      return [...prev, scenarioId];
    });
  };

  const handleRunDetection = async () => {
    if (!selectedScenarioIds.length) {
      setErrorMessage('실행할 시나리오를 선택해 주세요.');
      return;
    }

    setRunningDetection(true);
    setRunFeedback(null);
    setErrorMessage(null);
    try {
      const response = await runDetections(selectedScenarioIds);
      const summary = response.runs
        .map((run) => `${run.scenarioName ?? run.scenarioId} (${run.detectedCount}건)`)
        .join(', ');
      setRunFeedback(`탐지 실행 완료: ${summary}`);

      const filter =
        selectedScenarioIds.length === 1
          ? selectedScenarioIds[0]
          : activeScenarioFilter ?? selectedScenarioIds[selectedScenarioIds.length - 1];
      await refreshDetectionResults(filter);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setRunningDetection(false);
    }
  };

  const handleViewResults = (scenarioId?: number) => {
    refreshDetectionResults(scenarioId);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Siranio PoC</p>
          <h1>증권사 이상금융거래 탐지 시나리오 자동 생성</h1>
          <p className="lead">
            조건 키워드만 입력하면 시나리오 제안, SQL 생성, 저장, 실행, 탐지 결과 조회까지 한 번에 수행할 수 있습니다.
          </p>
        </div>
        <div className="header-meta">
          <span>고객 500건 · 거래 10,000건 합성 데이터</span>
          <span>백엔드 API: {import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'}</span>
        </div>
      </header>

      {errorMessage && <div className="banner banner-error">{errorMessage}</div>}
      {runFeedback && <div className="banner banner-info">{runFeedback}</div>}

      <main className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">STEP 1</p>
              <h2>조건 키워드 입력</h2>
            </div>
            <button className="primary" disabled={!canGenerate || generateLoading} onClick={handleGenerate}>
              {generateLoading ? '시나리오 생성 중...' : '시나리오 생성'}
            </button>
          </div>
          <div className="keywords-grid">
            {keywords.map((value, index) => (
              <label key={`keyword-${index}`} className="field">
                <span>조건 키워드 {index + 1}</span>
                <input
                  type="text"
                  value={value}
                  placeholder="예: 고액 출금"
                  onChange={(event) => handleKeywordChange(index, event.target.value)}
                  required
                />
              </label>
            ))}
          </div>
          <p className="helper-text">모든 필드를 채운 뒤 [시나리오 생성]을 클릭하세요.</p>
        </section>

        {generatedScenarios.length > 0 && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">STEP 2</p>
                <h2>자동 생성된 시나리오</h2>
              </div>
            </div>
            <div className="scenario-grid">
              {generatedScenarios.map((scenario) => (
                <article key={scenario.tempScenarioId} className="scenario-card">
                  <header>
                    <div>
                      <p className="eyebrow">{scenario.variant.toUpperCase()}</p>
                      <h3>{scenario.name}</h3>
                    </div>
                    <button
                      className="secondary"
                      disabled={savingScenarioId === scenario.tempScenarioId}
                      onClick={() => handleScenarioSave(scenario)}
                    >
                      {savingScenarioId === scenario.tempScenarioId ? '저장 중...' : '선택 및 저장'}
                    </button>
                  </header>
                  <p className="scenario-desc">{scenario.description}</p>
                  <ul className="condition-list">
                    {scenario.conditions.map((condition) => (
                      <li key={`${scenario.tempScenarioId}-${condition.label}`}>
                        <strong>{condition.label}</strong>
                        <span>{condition.detail}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="sql-section">
                    <p>SQL 미리보기</p>
                    <pre>{scenario.sql}</pre>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="panel full-span">
          <div className="panel-header">
            <div>
              <p className="eyebrow">STEP 3</p>
              <h2>시나리오 실행 및 탐지 결과</h2>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => handleViewResults(undefined)}>
                전체 결과 보기
              </button>
              <button className="primary" disabled={!selectedScenarioIds.length || runningDetection} onClick={handleRunDetection}>
                {runningDetection ? '탐지 실행 중...' : '탐지 실행'}
              </button>
            </div>
          </div>

          <div className="result-layout">
            <div className="scenario-list">
              <div className="list-header">
                <h3>등록된 시나리오</h3>
                <span>{scenarios.length}건</span>
              </div>
              <ul>
                {scenarios.length === 0 && <li className="empty">아직 저장된 시나리오가 없습니다.</li>}
                {scenarios.map((scenario) => {
                  const isSelected = selectedScenarioIds.includes(scenario.SCENARIO_ID);
                  return (
                    <li key={scenario.SCENARIO_ID}>
                      <label className="scenario-item">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleScenarioToggle(scenario.SCENARIO_ID)}
                        />
                        <div>
                          <strong>{scenario.SCENARIO_NAME}</strong>
                          <p>{scenario.SCENARIO_DESC}</p>
                          <span>
                            키워드: {scenario.CONDITION_KEYWORD1}, {scenario.CONDITION_KEYWORD2}, {scenario.CONDITION_KEYWORD3}
                          </span>
                          <span>
                            등록일시: {scenario.REG_DATE} {scenario.REG_TIME}
                          </span>
                        </div>
                      </label>
                      <button className="link" onClick={() => handleViewResults(scenario.SCENARIO_ID)}>
                        결과 보기
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="results-table">
              <div className="list-header">
                <h3>
                  탐지 결과
                  {activeScenarioFilter ? ` · 시나리오 ${activeScenarioFilter}` : ' · 전체'}
                </h3>
                <span>
                  {loadingDetections ? '조회 중...' : `${detectionResults.length.toLocaleString()}건`}
                </span>
              </div>
              <div className="table-wrapper">
                {detectionResults.length === 0 && !loadingDetections ? (
                  <p className="empty">표시할 탐지 결과가 없습니다.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>시나리오 ID</th>
                        <th>고객 ID</th>
                        <th>거래 ID</th>
                        <th>출금 일시</th>
                        <th>금액</th>
                        <th>채널</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detectionResults.map((result) => (
                        <tr key={result.RESULT_ID}>
                          <td>{result.SCENARIO_ID}</td>
                          <td>{result.CUSTOMER_ID}</td>
                          <td>{result.TXN_ID}</td>
                          <td>
                            {result.WITHDRAWAL_DATE} {result.WITHDRAWAL_TIME}
                          </td>
                          <td>{result.WITHDRAWAL_AMOUNT.toLocaleString()}원</td>
                          <td>{result.WITHDRAWAL_CHANNEL}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
