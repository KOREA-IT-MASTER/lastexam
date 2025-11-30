import cors from 'cors';
import dayjs from 'dayjs';
import express from 'express';
import morgan from 'morgan';
import { z } from 'zod';

import db, { bootstrapDatabase } from './db';
import { generateScenarios } from './scenarioGenerator';

bootstrapDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const keywordRequestSchema = z
  .object({
    keywords: z.array(z.string().min(1, '키워드를 입력하세요.')).length(3, '키워드는 3개가 필요합니다.').optional(),
    conditionKeyword1: z.string().optional(),
    conditionKeyword2: z.string().optional(),
    conditionKeyword3: z.string().optional(),
  })
  .refine((data) => {
    if (data.keywords) {
      return true;
    }
    return Boolean(data.conditionKeyword1 && data.conditionKeyword2 && data.conditionKeyword3);
  }, '키워드 3개를 모두 입력하세요.');

app.post('/api/scenarios/generate', (req, res) => {
  try {
    const parsed = keywordRequestSchema.parse(req.body);
    const keywords =
      parsed.keywords ??
      ([parsed.conditionKeyword1, parsed.conditionKeyword2, parsed.conditionKeyword3] as string[]);
    const scenarios = generateScenarios(keywords);
    res.json({ scenarios });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues.map((issue) => issue.message).join(', ') });
      return;
    }

    res.status(400).json({ message: (error as Error).message });
  }
});

const scenarioSaveSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string().min(1)).length(3),
  numericThresholds: z.array(z.number().nullable()).length(3).optional(),
  sqlText: z.string().min(1),
});

app.post('/api/scenarios', (req, res) => {
  try {
    const parsed = scenarioSaveSchema.parse(req.body);
    const now = dayjs();
    const [kw1, kw2, kw3] = parsed.keywords;
    const [th1, th2, th3] = parsed.numericThresholds ?? [null, null, null];

    const statement = db.prepare(`
      INSERT INTO TB_SCENARIO (
        SCENARIO_NAME,
        SCENARIO_DESC,
        CONDITION_KEYWORD1,
        CONDITION_KEYWORD2,
        CONDITION_KEYWORD3,
        THRESHOLD_1,
        THRESHOLD_2,
        THRESHOLD_3,
        SQL_TEXT,
        REG_DATE,
        REG_TIME,
        CREATED_BY
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = statement.run(
      parsed.name,
      parsed.description,
      kw1,
      kw2,
      kw3,
      th1,
      th2,
      th3,
      parsed.sqlText,
      now.format('YYYY-MM-DD'),
      now.format('HH:mm:ss'),
      'POC_USER',
    );

    const scenario = db
      .prepare('SELECT * FROM TB_SCENARIO WHERE SCENARIO_ID = ?')
      .get(result.lastInsertRowid) as Record<string, unknown>;

    res.status(201).json(scenario);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues.map((issue) => issue.message).join(', ') });
      return;
    }

    res.status(500).json({ message: '시나리오 저장에 실패했습니다.', detail: (error as Error).message });
  }
});

app.get('/api/scenarios', (_req, res) => {
  const scenarios = db
    .prepare(
      `SELECT SCENARIO_ID,
              SCENARIO_NAME,
              SCENARIO_DESC,
              CONDITION_KEYWORD1,
              CONDITION_KEYWORD2,
              CONDITION_KEYWORD3,
              THRESHOLD_1,
              THRESHOLD_2,
              THRESHOLD_3,
              SQL_TEXT,
              REG_DATE,
              REG_TIME,
              CREATED_AT
         FROM TB_SCENARIO
        ORDER BY SCENARIO_ID DESC`,
    )
    .all();

  res.json(scenarios);
});

const detectionRunSchema = z.object({
  scenarioIds: z.array(z.number().int().positive()).min(1),
});

app.post('/api/detections/run', (req, res) => {
  try {
    const parsed = detectionRunSchema.parse(req.body);
    const runs = parsed.scenarioIds.map((scenarioId) => {
      const scenario = db
        .prepare('SELECT SCENARIO_ID, SCENARIO_NAME, SQL_TEXT FROM TB_SCENARIO WHERE SCENARIO_ID = ?')
        .get(scenarioId) as { SCENARIO_ID: number; SCENARIO_NAME: string; SQL_TEXT: string } | undefined;

      if (!scenario) {
        return { scenarioId, scenarioName: null, detectedCount: 0, status: 'NOT_FOUND' as const };
      }

      db.prepare('DELETE FROM TB_DETECTION_RESULT WHERE SCENARIO_ID = ?').run(scenarioId);

      const rows = db.prepare(scenario.SQL_TEXT).all() as Array<{ CUSTOMER_ID: string; TXN_ID: number }>;
      const insert = db.prepare(
        `INSERT INTO TB_DETECTION_RESULT (CUSTOMER_ID, TXN_ID, SCENARIO_ID, DETECTION_TIME)
         VALUES (?, ?, ?, ?)`,
      );
      const now = dayjs().toISOString();
      const insertMany = db.transaction((results: typeof rows) => {
        results.forEach((row) => insert.run(row.CUSTOMER_ID, row.TXN_ID, scenarioId, now));
      });
      insertMany(rows);

      return {
        scenarioId,
        scenarioName: scenario.SCENARIO_NAME,
        detectedCount: rows.length,
        status: 'COMPLETED' as const,
      };
    });

    res.json({ runs });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues.map((issue) => issue.message).join(', ') });
      return;
    }

    res.status(500).json({ message: '탐지 실행 중 오류가 발생했습니다.', detail: (error as Error).message });
  }
});

app.get('/api/detections', (req, res) => {
  const scenarioIdRaw = req.query.scenarioId;
  const scenarioId = scenarioIdRaw ? Number(scenarioIdRaw) : undefined;

  const detectionQuery = `
    SELECT dr.RESULT_ID,
           dr.CUSTOMER_ID,
           dr.TXN_ID,
           dr.SCENARIO_ID,
           dr.DETECTION_TIME,
           t.WITHDRAWAL_DATE,
           t.WITHDRAWAL_TIME,
           t.WITHDRAWAL_AMOUNT,
           t.WITHDRAWAL_CHANNEL
      FROM TB_DETECTION_RESULT dr
      JOIN TB_TRANSACTION t ON dr.TXN_ID = t.TXN_ID
     ${scenarioId !== undefined ? 'WHERE dr.SCENARIO_ID = ?' : ''}
     ORDER BY dr.DETECTION_TIME DESC
     LIMIT 500
  `;

  const statement = db.prepare(detectionQuery);
  const rows =
    scenarioId !== undefined
      ? (statement.all(scenarioId) as Array<Record<string, unknown>>)
      : (statement.all() as Array<Record<string, unknown>>);

  res.json(rows);
});

app.use((_req, res) => {
  res.status(404).json({ message: '해당 API를 찾을 수 없습니다.' });
});

app.listen(PORT, () => {
  /* eslint-disable no-console */
  console.log(`Siranio API listening on http://localhost:${PORT}`);
});

export default app;

