import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, normalizePhone } from './security.js';

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return db;
}

export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function ensurePaymentHistoryStatus(db) {
  const columns = db.prepare('PRAGMA table_info(payment_history)').all();
  if (!columns.some((column) => column.name === 'status')) {
    db.exec("ALTER TABLE payment_history ADD COLUMN status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'unpaid'))");
  }
}

export function ensureAttendanceAbsenceReason(db) {
  const columns = db.prepare('PRAGMA table_info(attendance_records)').all();
  if (!columns.some((column) => column.name === 'absence_reason')) {
    db.exec('ALTER TABLE attendance_records ADD COLUMN absence_reason TEXT');
  }
}

export async function initializeDatabase(db, config) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT UNIQUE COLLATE NOCASE,
      phone TEXT,
      phone_login TEXT UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
      password_salt TEXT,
      password_hash TEXT,
      session_version INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      start_date TEXT NOT NULL,
      daily_rate REAL NOT NULL,
      paid_days REAL NOT NULL,
      avance REAL NOT NULL,
      color TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payment_history (
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      pay_date TEXT NOT NULL,
      daily_rate REAL NOT NULL,
      paid_days REAL NOT NULL,
      gross REAL NOT NULL,
      avance REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'unpaid')),
      PRIMARY KEY (employee_id, month)
    );
    CREATE TABLE IF NOT EXISTS attendance_records (
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      work_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (employee_id, work_date)
    );
    CREATE TABLE IF NOT EXISTS reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
  `);
  ensurePaymentHistoryStatus(db);
  ensureAttendanceAbsenceReason(db);
  await seedAdmin(db, config);
}

async function seedAdmin(db, config) {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!config.adminUsername || config.adminPassword.length < 12) {
    if (existing) return;
    throw new Error('Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters before starting with an empty database.');
  }
  const credentials = await hashPassword(config.adminPassword);
  const username = config.adminUsername.trim();
  const email = username.includes('@') ? username.toLowerCase() : null;
  if (existing) {
    db.prepare(`UPDATE users SET username = ?, email = ?, password_salt = ?, password_hash = ?,
      session_version = session_version + 1 WHERE id = ?`)
      .run(username, email, credentials.salt, credentials.hash, existing.id);
    return;
  }
  db.prepare(`INSERT INTO users
    (id, username, email, role, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, 'admin', ?, ?, ?)`)
    .run(randomUUID(), username, email, credentials.salt, credentials.hash, Date.now());
}

export function clearResetTokens(db, userId) {
  db.prepare('DELETE FROM reset_tokens WHERE user_id = ?').run(userId);
}

export function hashResetToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function employeeRows(db, userId = null) {
  const query = `SELECT e.id, e.name, e.title AS role, e.department, e.start_date AS startDate,
      e.daily_rate AS dailyRate, e.paid_days AS paidDays,
      CAST(ROUND(e.daily_rate * e.paid_days) AS INTEGER) AS gross,
      e.avance, e.color, u.id AS userId, u.username, u.email, u.phone,
      u.phone_login AS phoneLogin, (u.password_hash IS NOT NULL) AS hasPassword
    FROM employees e JOIN users u ON u.id = e.user_id`;
  const rows = userId
    ? db.prepare(`${query} WHERE u.id = ?`).all(userId)
    : db.prepare(`${query} ORDER BY e.name COLLATE NOCASE`).all();
  return rows.map(({ userId: accountId, phoneLogin, ...row }) => ({
    ...row,
    hasPassword: Boolean(row.hasPassword),
    phone: row.phone || '',
    username: row.username || row.email || phoneLogin || '',
    userId: accountId,
    startDate: row.startDate,
  }));
}

export function userByLogin(db, login) {
  const value = String(login || '').trim();
  const phoneLogin = normalizePhone(value);
  return db.prepare(`SELECT * FROM users
    WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE OR phone_login = ?
    LIMIT 1`).get(value, value, phoneLogin);
}