import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import { faker } from '@faker-js/faker';

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'siranio.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const REGIONS = ['서울', '경기', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '강원', '제주'];
const CHANNELS = ['ATM', '창구', '온라인'];

const CUSTOMER_TARGET_COUNT = 500;
const TRANSACTION_TARGET_COUNT = 10_000;

type CustomerSeed = {
  customerId: string;
  age: number;
  gender: string;
  region: string;
  regDate: string;
};

type TransactionSeed = {
  customerId: string;
  date: string;
  time: string;
  amount: number;
  channel: string;
};

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
  const row = db.prepare('SELECT COUNT(1) as count FROM TB_CUSTOMER').get() as { count: number };
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

  const startDate = dayjs().subtract(5, 'year').toDate();
  const now = new Date();

  const customers: CustomerSeed[] = Array.from({ length: CUSTOMER_TARGET_COUNT }, (_, idx) => {
    const customerId = `C${String(idx + 1).padStart(4, '0')}`;
    const age = faker.number.int({ min: 0, max: 80 });
    const gender = faker.helpers.arrayElement(['M', 'F']);
    const region = faker.helpers.arrayElement(REGIONS);
    const regDate = dayjs(faker.date.between({ from: startDate, to: now })).format('YYYY-MM-DD');

    return {
      customerId,
      age,
      gender,
      region,
      regDate,
    };
  });

  const insertMany = db.transaction((records: CustomerSeed[]) => {
    records.forEach((record) => insert.run(record));
  });

  insertMany(customers);
}

function seedTransactions() {
  const row = db.prepare('SELECT COUNT(1) as count FROM TB_TRANSACTION').get() as { count: number };
  if (row.count >= TRANSACTION_TARGET_COUNT) {
    return;
  }

  const customerIds = db
    .prepare('SELECT CUSTOMER_ID as customerId FROM TB_CUSTOMER')
    .all() as Array<{ customerId: string }>;

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

  const oneYearAgo = dayjs().subtract(1, 'year').toDate();
  const now = new Date();

  const transactions: TransactionSeed[] = Array.from({ length: TRANSACTION_TARGET_COUNT }, () => {
    const customerId = faker.helpers.arrayElement(customerIds).customerId;
    const date = dayjs(faker.date.between({ from: oneYearAgo, to: now })).format('YYYY-MM-DD');

    const hour = faker.number.int({ min: 0, max: 23 });
    const minute = faker.number.int({ min: 0, max: 59 });
    const second = faker.number.int({ min: 0, max: 59 });
    const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second
      .toString()
      .padStart(2, '0')}`;

    const highAmount = Math.random() < 0.2;
    const amount = highAmount
      ? faker.number.int({ min: 2_000_000, max: 15_000_000 })
      : faker.number.int({ min: 10_000, max: 1_000_000 });

    const channel = faker.helpers.arrayElement(CHANNELS);

    return {
      customerId,
      date,
      time,
      amount,
      channel,
    };
  });

  const insertMany = db.transaction((rows: TransactionSeed[]) => {
    rows.forEach((row) => insert.run(row));
  });

  insertMany(transactions);
}

export function bootstrapDatabase() {
  createTables();
  seedCustomers();
  seedTransactions();
}

export default db;

