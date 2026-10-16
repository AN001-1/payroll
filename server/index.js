import 'dotenv/config';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { clearResetTokens, employeeRows, ensureAttendanceAbsenceReason, ensurePaymentHistoryStatus, hashResetToken, openDatabase, initializeDatabase, transaction, userByLogin } from './database.js';
import { hashPassword, normalizePhone, verifyPassword } from './security.js';
import { SQLiteSessionStore } from './session-store.js';

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 8000);
  const sessionSecret = env.SESSION_SECRET || (production ? '' : 'local-development-only-session-secret');
  const smsProvider = env.SMS_PROVIDER || (production ? 'vonage' : 'console');
  const publicUrl = env.PUBLIC_URL || `http://localhost:${port}`;
  const config = {
    production,
    port,
    host: env.HOST || '0.0.0.0',
    databasePath: resolve(rootDirectory, env.DATABASE_PATH || 'data/payroll.sqlite'),
    sessionSecret,
    adminUsername: env.ADMIN_USERNAME || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    publicUrl,
    smsProvider,
    vonageApiKey: env.VONAGE_API_KEY || '',
    vonageApiSecret: env.VONAGE_API_SECRET || '',
    vonageFrom: env.VONAGE_FROM || '',
    devQuickLogin: !production && env.DEV_QUICK_LOGIN === 'true',
  };
  if (production && (sessionSecret.length < 32 || !config.adminUsername || config.adminPassword.length < 12 || smsProvider !== 'vonage' || !config.vonageApiKey || !config.vonageApiSecret || !config.vonageFrom || !publicUrl.startsWith('https://'))) {
    throw new Error('Production requires strong session/admin secrets, Vonage credentials, and an HTTPS PUBLIC_URL.');
  }
  return config;
}

function normalizeEmployee(row) {
  const { userId, ...person } = row;
  return person;
}

function publicUser(db, user) {
  const employee = user.role === 'employee'
    ? db.prepare('SELECT id, name, title AS jobTitle, department FROM employees WHERE user_id = ?').get(user.id)
    : null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role,
    name: employee?.name || 'Anouar Ezzoubai',
    jobTitle: employee?.jobTitle || (user.role === 'admin' ? 'Payroll admin' : ''),
    employeeId: employee?.id || null,
  };
}

function validPhone(phone) {
  const normalized = normalizePhone(phone);
  return String(phone || '').trim().startsWith('+') && normalized.length >= 8 && normalized.length <= 15 ? normalized : null;
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseEmployee(payload) {
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || '').trim();
  const role = String(payload.role || '').trim();
  const department = String(payload.department || '').trim();
  const startDate = String(payload.startDate || '').trim();
  const dailyRate = Number(payload.dailyRate);
  const paidDays = Number(payload.paidDays);
  const avance = Number(payload.avance);
  const phoneLogin = validPhone(phone);
  if (!name || name.length > 80 || !phoneLogin || phone.length > 30 || !role || role.length > 80 || !department || department.length > 60 || !startDate || !Number.isFinite(Date.parse(startDate)) || !Number.isFinite(dailyRate) || dailyRate < 0 || dailyRate > 1000000 || !Number.isFinite(paidDays) || paidDays < 0 || paidDays > 31 || !Number.isFinite(avance) || avance < 0) {
    return { error: 'Enter valid employee details and a valid phone number.' };
  }
  const gross = Math.round(dailyRate * paidDays);
  if (avance > gross) return { error: 'Avance cannot exceed the gross salary.' };
  return { value: { name, phone, phoneLogin, role, department, startDate, dailyRate, paidDays, avance, gross } };
}

function installSchema(db) {
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
      absence_reason TEXT,
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
}

export function createApp({ db, config, smsSender = sendSms }) {
  installSchema(db);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.production ? 1 : false);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'], fontSrc: ["'self'", 'data:'], connectSrc: ["'self'"],
        objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"],
        'upgrade-insecure-requests': config.production ? [] : null,
      },
    },
  }));
  app.use(express.json({ limit: '20kb' }));
  app.use('/api', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
    const origin = request.get('origin');
    if (!origin) return response.status(403).json({ error: 'Request origin required.' });
    try {
      if (new URL(origin).host !== request.get('host')) return response.status(403).json({ error: 'Cross-origin request rejected.' });
    } catch {
      return response.status(403).json({ error: 'Invalid request origin.' });
    }
    next();
  });
  app.use(session({
    name: 'maison.sid',
    store: new SQLiteSessionStore(db),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: config.production, maxAge: 8 * 60 * 60 * 1000 },
  }));

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });

  function authenticated(request, response, next) {
    const userId = request.session.userId;
    if (!userId) return response.status(401).json({ error: 'Sign in required.' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user || user.session_version !== request.session.sessionVersion || !user.password_hash) {
      request.session.destroy(() => {});
      return response.status(401).json({ error: 'Sign in required.' });
    }
    request.user = user;
    next();
  }

  function adminOnly(request, response, next) {
    if (request.user?.role !== 'admin') return response.status(403).json({ error: 'Admin access required.' });
    next();
  }

  app.post('/api/login', loginLimiter, async (request, response) => {
    const login = String(request.body?.login || '').trim();
    const password = String(request.body?.password || '');
    const user = userByLogin(db, login);
    const matches = await verifyPassword(password, user?.password_salt, user?.password_hash);
    if (!user || !matches) return response.status(401).json({ error: 'Those credentials did not match.' });
    startSession(request, response, user);
  });

  function startSession(request, response, user) {
    request.session.regenerate((error) => {
      if (error) return response.status(500).json({ error: 'Unable to start a session.' });
      request.session.userId = user.id;
      request.session.sessionVersion = user.session_version;
      request.session.save((saveError) => {
        if (saveError) return response.status(500).json({ error: 'Unable to start a session.' });
        response.json({ user: publicUser(db, user) });
      });
    });
  }

  // Local-development shortcut: opt-in via DEV_QUICK_LOGIN, never in production, same-machine requests only.
  const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  const quickLoginAllowed = (request) => config.devQuickLogin && loopbackAddresses.has(request.socket.remoteAddress);
  app.get('/api/dev-login', (request, response) => {
    if (!quickLoginAllowed(request)) return response.status(404).json({ error: 'API route not found.' });
    response.json({ available: true });
  });
  app.post('/api/dev-login', loginLimiter, (request, response) => {
    if (!quickLoginAllowed(request)) return response.status(404).json({ error: 'API route not found.' });
    const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' AND password_hash IS NOT NULL LIMIT 1").get();
    if (!admin) return response.status(404).json({ error: 'No admin account is available.' });
    startSession(request, response, admin);
  });
  app.post('/api/logout', authenticated, (request, response) => {
    request.session.destroy((error) => {
      if (error) return response.status(500).json({ error: 'Unable to sign out.' });
      response.clearCookie('maison.sid', { httpOnly: true, sameSite: 'strict', secure: config.production });
      response.status(204).end();
    });
  });
  app.get('/api/me', authenticated, (request, response) => response.json({ user: publicUser(db, request.user) }));

  app.get('/api/employees', authenticated, (request, response) => {
    const rows = request.user.role === 'admin'
      ? employeeRows(db)
      : employeeRows(db, request.user.id);
    response.json({ employees: rows.map(normalizeEmployee) });
  });

  app.get('/api/payment-history', authenticated, (request, response) => {
    const query = `SELECT e.id AS employeeId, e.name AS employeeName, h.month,
        h.pay_date AS payDate, h.daily_rate AS dailyRate, h.paid_days AS paidDays,
        h.gross, h.avance, h.gross - h.avance AS net, h.status
      FROM payment_history h JOIN employees e ON e.id = h.employee_id`;
    const payments = request.user.role === 'admin'
      ? db.prepare(`${query} ORDER BY h.month DESC, e.name COLLATE NOCASE`).all()
      : db.prepare(`${query} WHERE e.user_id = ? ORDER BY h.month DESC`).all(request.user.id);
    const attendanceQuery = `SELECT e.id AS employeeId, e.name AS employeeName,
        substr(a.work_date, 1, 7) AS month,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS daysWorked,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS daysAbsent,
        COUNT(*) AS daysRecorded
      FROM attendance_records a JOIN employees e ON e.id = a.employee_id`;
    const attendanceByMonth = request.user.role === 'admin'
      ? db.prepare(`${attendanceQuery} GROUP BY e.id, substr(a.work_date, 1, 7) ORDER BY month DESC, e.name COLLATE NOCASE`).all()
      : db.prepare(`${attendanceQuery} WHERE e.user_id = ? GROUP BY e.id, substr(a.work_date, 1, 7) ORDER BY month DESC`).all(request.user.id);
    response.json({ payments, attendanceByMonth });
  });

  app.get('/api/attendance', authenticated, adminOnly, (request, response) => {
    const workDate = String(request.query.date || '');
    if (!validIsoDate(workDate)) return response.status(400).json({ error: 'Choose a valid attendance date.' });
    const attendance = db.prepare(`SELECT e.id AS employeeId, e.name, e.title AS role,
      e.department, e.color, a.status, a.absence_reason AS absenceReason
      FROM employees e LEFT JOIN attendance_records a
        ON a.employee_id = e.id AND a.work_date = ?
      ORDER BY e.name COLLATE NOCASE`).all(workDate);
    const monthAttendance = db.prepare(`SELECT employee_id AS employeeId, work_date AS date, status
      FROM attendance_records WHERE substr(work_date, 1, 7) = ?`).all(workDate.slice(0, 7));
    response.json({ date: workDate, attendance, monthAttendance });
  });

  app.put('/api/attendance/:employeeId/:date', authenticated, adminOnly, (request, response) => {
    const { employeeId, date } = request.params;
    const status = request.body?.status;
    const absenceReason = request.body?.absenceReason ?? '';
    if (!validIsoDate(date) || !['present', 'absent'].includes(status)) {
      return response.status(400).json({ error: 'Choose a valid attendance date and status.' });
    }
    if (typeof absenceReason !== 'string' || absenceReason.length > 200) {
      return response.status(400).json({ error: 'Absence reason must be 200 characters or fewer.' });
    }
    const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
    if (!employee) return response.status(404).json({ error: 'Employee not found.' });
    const savedReason = status === 'absent' ? absenceReason.trim() : '';
    db.prepare(`INSERT INTO attendance_records (employee_id, work_date, status, absence_reason, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (employee_id, work_date) DO UPDATE SET status = excluded.status,
        absence_reason = excluded.absence_reason, updated_at = excluded.updated_at`)
      .run(employeeId, date, status, savedReason || null, Date.now());
    response.json({ employeeId, date, status, absenceReason: savedReason });
  });

  app.post('/api/payment-history', authenticated, adminOnly, (request, response) => {
    const body = request.body || {};
    const employeeId = String(body.employeeId || '');
    const month = String(body.month || '');
    const payDate = String(body.payDate || '');
    const status = body.status ?? 'paid';
    const dailyRate = Number(body.dailyRate);
    const paidDays = Number(body.paidDays);
    const avance = Number(body.avance ?? 0);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validIsoDate(payDate) || !['paid', 'unpaid'].includes(status)
      || !Number.isFinite(dailyRate) || dailyRate < 0 || dailyRate > 1000000
      || !Number.isFinite(paidDays) || paidDays < 0 || paidDays > 31
      || !Number.isFinite(avance) || avance < 0) {
      return response.status(400).json({ error: 'Enter a valid month, pay date, rate, paid days, avance, and status.' });
    }
    const gross = Math.round(dailyRate * paidDays);
    if (avance > gross) return response.status(400).json({ error: 'Avance cannot exceed the gross salary.' });
    const employee = db.prepare('SELECT id, name FROM employees WHERE id = ?').get(employeeId);
    if (!employee) return response.status(404).json({ error: 'Employee not found.' });
    const existing = db.prepare('SELECT 1 FROM payment_history WHERE employee_id = ? AND month = ?').get(employeeId, month);
    if (existing) return response.status(409).json({ error: 'A payment record already exists for that employee and month.' });
    db.prepare(`INSERT INTO payment_history (employee_id, month, pay_date, daily_rate, paid_days, gross, avance, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(employeeId, month, payDate, dailyRate, paidDays, gross, avance, status);
    response.status(201).json({
      payment: { employeeId, employeeName: employee.name, month, payDate, dailyRate, paidDays, gross, avance, net: gross - avance, status },
    });
  });

  app.put('/api/payment-history/:employeeId/:month', authenticated, adminOnly, (request, response) => {
    const { employeeId, month } = request.params;
    const body = request.body || {};
    const status = body.status;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !['paid', 'unpaid'].includes(status)) {
      return response.status(400).json({ error: 'Choose a valid payroll month and payment status.' });
    }
    if (body.payDate === undefined) {
      const result = db.prepare('UPDATE payment_history SET status = ? WHERE employee_id = ? AND month = ?')
        .run(status, employeeId, month);
      if (!result.changes) return response.status(404).json({ error: 'Payment record not found.' });
      return response.json({ employeeId, month, status });
    }
    const payDate = String(body.payDate);
    const dailyRate = Number(body.dailyRate);
    const paidDays = Number(body.paidDays);
    const avance = Number(body.avance ?? 0);
    if (!validIsoDate(payDate)
      || !Number.isFinite(dailyRate) || dailyRate < 0 || dailyRate > 1000000
      || !Number.isFinite(paidDays) || paidDays < 0 || paidDays > 31
      || !Number.isFinite(avance) || avance < 0) {
      return response.status(400).json({ error: 'Enter a valid pay date, rate, paid days, avance, and status.' });
    }
    const gross = Math.round(dailyRate * paidDays);
    if (avance > gross) return response.status(400).json({ error: 'Avance cannot exceed the gross salary.' });
    const result = db.prepare(`UPDATE payment_history SET pay_date = ?, daily_rate = ?, paid_days = ?,
      gross = ?, avance = ?, status = ? WHERE employee_id = ? AND month = ?`)
      .run(payDate, dailyRate, paidDays, gross, avance, status, employeeId, month);
    if (!result.changes) return response.status(404).json({ error: 'Payment record not found.' });
    response.json({ employeeId, month, payDate, dailyRate, paidDays, gross, avance, net: gross - avance, status });
  });

  app.post('/api/employees', authenticated, adminOnly, async (request, response) => {
    const parsed = parseEmployee(request.body || {});
    if (parsed.error) return response.status(400).json({ error: parsed.error });
    const { value } = parsed;
    const duplicate = db.prepare('SELECT id FROM users WHERE phone_login = ?').get(value.phoneLogin);
    if (duplicate) return response.status(409).json({ error: 'That phone number is already assigned to an employee.' });
    const serial = db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id, 4) AS INTEGER)), 0) + 1 AS serial FROM employees WHERE id GLOB 'MR-[0-9]*'").get().serial;
    const employeeId = `MR-${String(serial).padStart(3, '0')}`;
    const userId = randomBytes(16).toString('hex');
    const color = ['#e6d5ca', '#d9e2c7', '#e8dfad', '#d5e0dc', '#ecd4c4', '#d9d6e8'][serial % 6];
    const insert = () => transaction(db, () => {
      db.prepare(`INSERT INTO users (id, username, phone, phone_login, role, created_at)
        VALUES (?, ?, ?, ?, 'employee', ?)`)
        .run(userId, value.phone, value.phone, value.phoneLogin, Date.now());
      db.prepare(`INSERT INTO employees (id, user_id, name, title, department, start_date, daily_rate, paid_days, avance, color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(employeeId, userId, value.name, value.role, value.department, value.startDate, value.dailyRate, value.paidDays, value.avance, color);
    });
    try {
      insert();
      const employee = employeeRows(db).find((person) => person.id === employeeId);
      await issueReset(db, config, employee, smsSender);
      response.status(201).json({ employee: normalizeEmployee(employee), resetDelivery: config.smsProvider });
    } catch (error) {
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'That phone number is already assigned to an employee.' });
      response.status(error.status || 502).json({ error: error.message || 'Unable to send the setup SMS.' });
    }
  });

  app.put('/api/employees/:id', authenticated, adminOnly, (request, response) => {
    const parsed = parseEmployee(request.body || {});
    if (parsed.error) return response.status(400).json({ error: parsed.error });
    const { value } = parsed;
    const existing = db.prepare(`SELECT e.id, e.user_id AS userId FROM employees e WHERE e.id = ?`).get(request.params.id);
    if (!existing) return response.status(404).json({ error: 'Employee not found.' });
    const duplicate = db.prepare('SELECT id FROM users WHERE phone_login = ? AND id <> ?').get(value.phoneLogin, existing.userId);
    if (duplicate) return response.status(409).json({ error: 'That phone number is already assigned to another employee.' });
    const update = () => transaction(db, () => {
      db.prepare('UPDATE users SET username = ?, phone = ?, phone_login = ? WHERE id = ?')
        .run(value.phone, value.phone, value.phoneLogin, existing.userId);
      db.prepare(`UPDATE employees SET name = ?, title = ?, department = ?, start_date = ?, daily_rate = ?, paid_days = ?, avance = ? WHERE id = ?`)
        .run(value.name, value.role, value.department, value.startDate, value.dailyRate, value.paidDays, value.avance, existing.id);
    });
    try {
      update();
      const employee = employeeRows(db).find((person) => person.id === existing.id);
      response.json({ employee: normalizeEmployee(employee) });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'That phone number is already assigned to another employee.' });
      throw error;
    }
  });

  app.delete('/api/employees/:id', authenticated, adminOnly, (request, response) => {
    const employee = db.prepare('SELECT user_id AS userId FROM employees WHERE id = ?').get(request.params.id);
    if (!employee) return response.status(404).json({ error: 'Employee not found.' });
    // The users row cascades to the employee, payment history, attendance and reset tokens.
    db.prepare("DELETE FROM users WHERE id = ? AND role = 'employee'").run(employee.userId);
    response.status(204).end();
  });

  app.post('/api/employees/:id/password-reset', authenticated, adminOnly, resetLimiter, async (request, response) => {
    const employee = employeeRows(db).find((person) => person.id === request.params.id);
    if (!employee) return response.status(404).json({ error: 'Employee not found.' });
    if (!employee.phone) return response.status(400).json({ error: 'Add a phone number before sending a password reset.' });
    try {
      await issueReset(db, config, employee, smsSender);
      response.json({ message: config.smsProvider === 'vonage' ? 'Password reset SMS accepted by Vonage.' : 'Development reset link logged on the server.' });
    } catch (error) {
      response.status(error.status || 502).json({ error: 'Unable to send the password reset SMS.' });
    }
  });

  app.post('/api/password-reset/complete', resetLimiter, async (request, response) => {
    const token = String(request.body?.token || '');
    const password = String(request.body?.password || '');
    if (password.length < 12 || password.length > 128) return response.status(400).json({ error: 'Choose a password between 12 and 128 characters.' });
    const tokenHash = hashResetToken(token);
    const reset = db.prepare('SELECT user_id AS userId FROM reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(tokenHash, Date.now());
    if (!reset) return response.status(400).json({ error: 'This reset link is invalid or expired. Ask your administrator for a new one.' });
    const credentials = await hashPassword(password);
    const completed = transaction(db, () => {
      const usedAt = Date.now();
      const claimed = db.prepare(`UPDATE reset_tokens SET used_at = ?
        WHERE token_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > ?`)
        .run(usedAt, tokenHash, reset.userId, usedAt);
      if (!claimed.changes) return false;
      db.prepare('UPDATE users SET password_salt = ?, password_hash = ?, session_version = session_version + 1 WHERE id = ?')
        .run(credentials.salt, credentials.hash, reset.userId);
      clearResetTokens(db, reset.userId);
      return true;
    });
    if (!completed) return response.status(400).json({ error: 'This reset link is invalid or expired. Ask your administrator for a new one.' });
    response.json({ message: 'Password updated. Sign in with your new password.' });
  });

  app.get('/', (_request, response) => response.sendFile(join(rootDirectory, 'index.html')));
  app.get(['/app.js', '/styles.css'], (request, response) => {
    response.sendFile(join(rootDirectory, request.path.slice(1)));
  });
  app.get('/reset-password', (_request, response) => response.sendFile(join(rootDirectory, 'index.html')));
  app.use('/assets', express.static(join(rootDirectory, 'assets'), { dotfiles: 'deny', fallthrough: false, maxAge: '7d' }));
  app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found.' }));
  app.use((error, _request, response, _next) => {
    console.error(error);
    if (response.headersSent) return;
    response.status(500).json({ error: 'Unexpected server error.' });
  });
  return app;
}

async function issueReset(db, config, employee, smsSender) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 10 * 60 * 1000;
  clearResetTokens(db, employee.userId);
  db.prepare('INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashResetToken(token), employee.userId, expiresAt);
  const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(token)}`, config.publicUrl).toString();
  try {
    await smsSender(config, employee.phone, resetUrl);
  } catch (error) {
    clearResetTokens(db, employee.userId);
    throw error;
  }
}

export async function sendSms(config, phone, resetUrl) {
  if (config.smsProvider === 'console' && !config.production) {
    console.log(`[development reset link for ${phone}] ${resetUrl}`);
    return;
  }
  if (config.smsProvider !== 'vonage' || !config.vonageApiKey || !config.vonageApiSecret || !config.vonageFrom) {
    const error = new Error('SMS delivery is not configured.');
    error.status = 503;
    throw error;
  }
  const response = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.vonageApiKey}:${config.vonageApiSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      from: config.vonageFrom,
      to: normalizePhone(phone),
      text: `Maison Rotterdam payroll password setup: ${resetUrl} (expires in 10 minutes)`,
      type: 'text',
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.messages?.[0]?.status !== '0') {
    const error = new Error('Vonage could not accept the password reset SMS. Check your account, sender, balance, and destination.');
    error.status = 502;
    throw error;
  }
}

async function start() {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  await initializeDatabase(db, config);
  const app = createApp({ db, config });
  app.listen(config.port, config.host, () => {
    console.log(`Payroll backend listening at ${config.publicUrl}`);
    if (!config.production) console.log(`Development admin: ${config.adminUsername} / ${config.adminPassword}`);
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  start().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}