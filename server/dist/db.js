"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapDatabase = bootstrapDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dayjs_1 = __importDefault(require("dayjs"));
const faker_1 = require("@faker-js/faker");
const dataDir = path_1.default.join(__dirname, '..', 'data');
if (!fs_1.default.existsSync(dataDir)) {
    fs_1.default.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path_1.default.join(dataDir, 'siranio.db');
const db = new better_sqlite3_1.default(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
const REGIONS = ['서울', '경기', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '강원', '제주'];
const CHANNELS = ['ATM', '창구', '온라인'];
const CUSTOMER_TARGET_COUNT = 500;
const TRANSACTION_TARGET_COUNT = 10000;
function createTables() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS TB_CUSTOMER (
      CUSTOMER_ID TEXT PRIMARY KEY,
      CUSTOMER_AGE INTEGER NOT NULL,
      CUSTOMER_GENDER TEXT NOT NULL,
      CUSTOMER_REGION TEXT NOT NULL,
      CUSTOMER_REG_DATE TEXT NOT NULL,
      CREATED_AT TEXT NOT NULL DEFAULT (datetime('now')),
      UPDATED_AT TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS TB_TRANSACTION (
      TXN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      CUSTOMER_ID TEXT NOT NULL,
      WITHDRAWAL_DATE TEXT NOT NULL,
      WITHDRAWAL_TIME TEXT NOT NULL,
      WITHDRAWAL_AMOUNT REAL NOT NULL,
      WITHDRAWAL_CHANNEL TEXT NOT NULL,
      CREATED_AT TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (CUSTOMER_ID) REFERENCES TB_CUSTOMER(CUSTOMER_ID)
    );

    CREATE TABLE IF NOT EXISTS TB_SCENARIO (
      SCENARIO_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      SCENARIO_NAME TEXT NOT NULL,
      SCENARIO_DESC TEXT NOT NULL,
      CONDITION_KEYWORD1 TEXT NOT NULL,
      CONDITION_KEYWORD2 TEXT NOT NULL,
      CONDITION_KEYWORD3 TEXT NOT NULL,
      THRESHOLD_1 REAL,
      THRESHOLD_2 REAL,
      THRESHOLD_3 REAL,
      SQL_TEXT TEXT NOT NULL,
      REG_DATE TEXT NOT NULL,
      REG_TIME TEXT NOT NULL,
      CREATED_BY TEXT,
      CREATED_AT TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS TB_DETECTION_RESULT (
      RESULT_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      CUSTOMER_ID TEXT NOT NULL,
      TXN_ID INTEGER NOT NULL,
      SCENARIO_ID INTEGER NOT NULL,
      DETECTION_TIME TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (CUSTOMER_ID) REFERENCES TB_CUSTOMER(CUSTOMER_ID),
      FOREIGN KEY (TXN_ID) REFERENCES TB_TRANSACTION(TXN_ID),
      FOREIGN KEY (SCENARIO_ID) REFERENCES TB_SCENARIO(SCENARIO_ID)
    );
  `);
}
function seedCustomers() {
    const row = db.prepare('SELECT COUNT(1) as count FROM TB_CUSTOMER').get();
    if (row.count >= CUSTOMER_TARGET_COUNT) {
        return;
    }
    const insert = db.prepare(`
    INSERT OR REPLACE INTO TB_CUSTOMER (
      CUSTOMER_ID,
      CUSTOMER_AGE,
      CUSTOMER_GENDER,
      CUSTOMER_REGION,
      CUSTOMER_REG_DATE
    ) VALUES (@customerId, @age, @gender, @region, @regDate)
  `);
    const startDate = (0, dayjs_1.default)().subtract(5, 'year').toDate();
    const now = new Date();
    const customers = Array.from({ length: CUSTOMER_TARGET_COUNT }, (_, idx) => {
        const customerId = `C${String(idx + 1).padStart(4, '0')}`;
        const age = faker_1.faker.number.int({ min: 0, max: 80 });
        const gender = faker_1.faker.helpers.arrayElement(['M', 'F']);
        const region = faker_1.faker.helpers.arrayElement(REGIONS);
        const regDate = (0, dayjs_1.default)(faker_1.faker.date.between({ from: startDate, to: now })).format('YYYY-MM-DD');
        return {
            customerId,
            age,
            gender,
            region,
            regDate,
        };
    });
    const insertMany = db.transaction((records) => {
        records.forEach((record) => insert.run(record));
    });
    insertMany(customers);
}
function seedTransactions() {
    const row = db.prepare('SELECT COUNT(1) as count FROM TB_TRANSACTION').get();
    if (row.count >= TRANSACTION_TARGET_COUNT) {
        return;
    }
    const customerIds = db
        .prepare('SELECT CUSTOMER_ID as customerId FROM TB_CUSTOMER')
        .all();
    if (!customerIds.length) {
        return;
    }
    const insert = db.prepare(`
    INSERT INTO TB_TRANSACTION (
      CUSTOMER_ID,
      WITHDRAWAL_DATE,
      WITHDRAWAL_TIME,
      WITHDRAWAL_AMOUNT,
      WITHDRAWAL_CHANNEL
    ) VALUES (@customerId, @date, @time, @amount, @channel)
  `);
    const oneYearAgo = (0, dayjs_1.default)().subtract(1, 'year').toDate();
    const now = new Date();
    const transactions = Array.from({ length: TRANSACTION_TARGET_COUNT }, () => {
        const customerId = faker_1.faker.helpers.arrayElement(customerIds).customerId;
        const date = (0, dayjs_1.default)(faker_1.faker.date.between({ from: oneYearAgo, to: now })).format('YYYY-MM-DD');
        const hour = faker_1.faker.number.int({ min: 0, max: 23 });
        const minute = faker_1.faker.number.int({ min: 0, max: 59 });
        const second = faker_1.faker.number.int({ min: 0, max: 59 });
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second
            .toString()
            .padStart(2, '0')}`;
        const highAmount = Math.random() < 0.2;
        const amount = highAmount
            ? faker_1.faker.number.int({ min: 2000000, max: 15000000 })
            : faker_1.faker.number.int({ min: 10000, max: 1000000 });
        const channel = faker_1.faker.helpers.arrayElement(CHANNELS);
        return {
            customerId,
            date,
            time,
            amount,
            channel,
        };
    });
    const insertMany = db.transaction((rows) => {
        rows.forEach((row) => insert.run(row));
    });
    insertMany(transactions);
}
function bootstrapDatabase() {
    createTables();
    seedCustomers();
    seedTransactions();
}
exports.default = db;
//# sourceMappingURL=db.js.map