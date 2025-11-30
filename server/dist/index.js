"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dayjs_1 = __importDefault(require("dayjs"));
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const zod_1 = require("zod");
const db_1 = __importStar(require("./db"));
const scenarioGenerator_1 = require("./scenarioGenerator");
(0, db_1.bootstrapDatabase)();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, morgan_1.default)('dev'));
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
const keywordRequestSchema = zod_1.z
    .object({
    keywords: zod_1.z.array(zod_1.z.string().min(1, '키워드를 입력하세요.')).length(3, '키워드는 3개가 필요합니다.').optional(),
    conditionKeyword1: zod_1.z.string().optional(),
    conditionKeyword2: zod_1.z.string().optional(),
    conditionKeyword3: zod_1.z.string().optional(),
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
        const keywords = parsed.keywords ??
            [parsed.conditionKeyword1, parsed.conditionKeyword2, parsed.conditionKeyword3];
        const scenarios = (0, scenarioGenerator_1.generateScenarios)(keywords);
        res.json({ scenarios });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ message: error.issues.map((issue) => issue.message).join(', ') });
            return;
        }
        res.status(400).json({ message: error.message });
    }
});
const scenarioSaveSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().min(1),
    keywords: zod_1.z.array(zod_1.z.string().min(1)).length(3),
    numericThresholds: zod_1.z.array(zod_1.z.number().nullable()).length(3).optional(),
    sqlText: zod_1.z.string().min(1),
});
app.post('/api/scenarios', (req, res) => {
    try {
        const parsed = scenarioSaveSchema.parse(req.body);
        const now = (0, dayjs_1.default)();
        const [kw1, kw2, kw3] = parsed.keywords;
        const [th1, th2, th3] = parsed.numericThresholds ?? [null, null, null];
        const statement = db_1.default.prepare(`
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
        const result = statement.run(parsed.name, parsed.description, kw1, kw2, kw3, th1, th2, th3, parsed.sqlText, now.format('YYYY-MM-DD'), now.format('HH:mm:ss'), 'POC_USER');
        const scenario = db_1.default
            .prepare('SELECT * FROM TB_SCENARIO WHERE SCENARIO_ID = ?')
            .get(result.lastInsertRowid);
        res.status(201).json(scenario);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ message: error.issues.map((issue) => issue.message).join(', ') });
            return;
        }
        res.status(500).json({ message: '시나리오 저장에 실패했습니다.', detail: error.message });
    }
});
app.get('/api/scenarios', (_req, res) => {
    const scenarios = db_1.default
        .prepare(`SELECT SCENARIO_ID,
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
        ORDER BY SCENARIO_ID DESC`)
        .all();
    res.json(scenarios);
});
const detectionRunSchema = zod_1.z.object({
    scenarioIds: zod_1.z.array(zod_1.z.number().int().positive()).min(1),
});
app.post('/api/detections/run', (req, res) => {
    try {
        const parsed = detectionRunSchema.parse(req.body);
        const runs = parsed.scenarioIds.map((scenarioId) => {
            const scenario = db_1.default
                .prepare('SELECT SCENARIO_ID, SCENARIO_NAME, SQL_TEXT FROM TB_SCENARIO WHERE SCENARIO_ID = ?')
                .get(scenarioId);
            if (!scenario) {
                return { scenarioId, scenarioName: null, detectedCount: 0, status: 'NOT_FOUND' };
            }
            db_1.default.prepare('DELETE FROM TB_DETECTION_RESULT WHERE SCENARIO_ID = ?').run(scenarioId);
            const rows = db_1.default.prepare(scenario.SQL_TEXT).all();
            const insert = db_1.default.prepare(`INSERT INTO TB_DETECTION_RESULT (CUSTOMER_ID, TXN_ID, SCENARIO_ID, DETECTION_TIME)
         VALUES (?, ?, ?, ?)`);
            const now = (0, dayjs_1.default)().toISOString();
            const insertMany = db_1.default.transaction((results) => {
                results.forEach((row) => insert.run(row.CUSTOMER_ID, row.TXN_ID, scenarioId, now));
            });
            insertMany(rows);
            return {
                scenarioId,
                scenarioName: scenario.SCENARIO_NAME,
                detectedCount: rows.length,
                status: 'COMPLETED',
            };
        });
        res.json({ runs });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ message: error.issues.map((issue) => issue.message).join(', ') });
            return;
        }
        res.status(500).json({ message: '탐지 실행 중 오류가 발생했습니다.', detail: error.message });
    }
});
app.get('/api/detections', (req, res) => {
    const scenarioIdRaw = req.query.scenarioId;
    const scenarioId = scenarioIdRaw ? Number(scenarioIdRaw) : undefined;
    const rows = db_1.default
        .prepare(`
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
     ${scenarioId ? 'WHERE dr.SCENARIO_ID = ?' : ''}
     ORDER BY dr.DETECTION_TIME DESC
     LIMIT 500
  `)
        .all(scenarioId ? [scenarioId] : undefined);
    res.json(rows);
});
app.use((_req, res) => {
    res.status(404).json({ message: '해당 API를 찾을 수 없습니다.' });
});
app.listen(PORT, () => {
    /* eslint-disable no-console */
    console.log(`Siranio API listening on http://localhost:${PORT}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map