import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp, loadConfig, sendSms } from './index.js';
import { initializeDatabase } from './database.js';
import { hashPassword } from './security.js';

const employeePassword = 'employee-password-for-tests';
const employeeFixtures = Array.from({ length: 6 }, (_, index) => ({
  id: `TEST-${String(index + 1).padStart(3, '0')}`,
  name: `Employee ${index + 1}`,
  email: `employee${index + 1}@example.test`,
  role: `Role ${index + 1}`,
  department: `Department ${index + 1}`,
  startDate: '2024-01-15',
  dailyRate: 500 + index * 50,
  paidDays: 26,
  avance: 100 + index * 25,
  color: '#dddddd',
}));
const historyPeriods = [
  ['2026-05', '2026-05-29', 25],
  ['2026-06', '2026-06-30', 26],
  ['2026-07', '2026-07-31', 24],
  ['2026-08', '2026-08-31', 26],
  ['2026-09', '2026-09-30', 25],
];

async function seedTestEmployees(db) {
  const credentials = await hashPassword(employeePassword);
  const addUser = db.prepare(`INSERT INTO users
    (id, username, email, role, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, 'employee', ?, ?, ?)`);
  const addEmployee = db.prepare(`INSERT INTO employees
    (id, user_id, name, title, department, start_date, daily_rate, paid_days, avance, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const addPayment = db.prepare(`INSERT INTO payment_history
    (employee_id, month, pay_date, daily_rate, paid_days, gross, avance)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const person of employeeFixtures) {
    const userId = randomUUID();
    addUser.run(userId, person.email, person.email, credentials.salt, credentials.hash, Date.now());
    addEmployee.run(person.id, userId, person.name, person.role, person.department, person.startDate,
      person.dailyRate, person.paidDays, person.avance, person.color);
    historyPeriods.forEach(([month, payDate, paidDays]) => {
      const gross = Math.round(person.dailyRate * paidDays);
      addPayment.run(person.id, month, payDate, person.dailyRate, paidDays, gross, Math.min(gross, person.avance));
    });
  }
}

const config = {
  production: false,
  sessionSecret: 'test-session-secret-long-enough-for-tests',
  adminUsername: 'admin@example.test',
  adminPassword: 'admin-password-for-tests',
  smsProvider: 'console',
  publicUrl: 'http://localhost:8000',
};
let db;
let app;
let admin;
let employee;
const deliveredLinks = [];

before(async () => {
  db = new DatabaseSync(':memory:');
  await initializeDatabase(db, config);
  await seedTestEmployees(db);
  app = createApp({ db, config, smsSender: async (_config, phone, url) => deliveredLinks.push({ phone, url }) });
  admin = request.agent(app);
  employee = request.agent(app);
});

after(() => db?.close());

test('rejects employee data requests without a session', async () => {
  const response = await request(app).get('/api/employees');
  assert.equal(response.status, 401);
  const history = await request(app).get('/api/payment-history');
  assert.equal(history.status, 401);
  const attendance = await request(app).get('/api/attendance?date=2026-10-03');
  assert.equal(attendance.status, 401);
});

test('does not force HTTPS for the local development app', async () => {
  const response = await request(app).get('/');
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.headers['content-security-policy'], /upgrade-insecure-requests/);
});

test('does not expose runtime configuration or credentials', async () => {
  const response = await request(app).get('/api/config');
  assert.equal(response.status, 404);
});

test('requires explicit admin credentials for a fresh database', async () => {
  const freshDb = new DatabaseSync(':memory:');
  try {
    await assert.rejects(
      initializeDatabase(freshDb, { adminUsername: '', adminPassword: '' }),
      /Set ADMIN_USERNAME and an ADMIN_PASSWORD/,
    );
  } finally {
    freshDb.close();
  }
});

test('adds missing attendance absence fields when creating the app schema', async () => {
  const legacyDb = new DatabaseSync(':memory:');
  try {
    legacyDb.exec(`
      CREATE TABLE users (
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
      CREATE TABLE employees (
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
      CREATE TABLE attendance_records (
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        work_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (employee_id, work_date)
      );
    `);
    createApp({ db: legacyDb, config: { ...config, adminUsername: 'legacy@example.test', adminPassword: 'legacy-password-123' } });
    const columns = legacyDb.prepare('PRAGMA table_info(attendance_records)').all();
    assert.ok(columns.some((column) => column.name === 'absence_reason'));
  } finally {
    legacyDb.close();
  }
});

test('rotates an existing admin account when explicit credentials are configured', async () => {
  const adminDb = new DatabaseSync(':memory:');
  const updatedConfig = {
    ...config,
    adminUsername: 'owner@example.test',
    adminPassword: 'replacement-admin-password',
  };
  try {
    await initializeDatabase(adminDb, config);
    await initializeDatabase(adminDb, updatedConfig);
    const adminApp = createApp({ db: adminDb, config: updatedConfig });
    const oldLogin = await request(adminApp).post('/api/login').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
      login: config.adminUsername,
      password: config.adminPassword,
    });
    assert.equal(oldLogin.status, 401);
    const newLogin = await request(adminApp).post('/api/login').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
      login: updatedConfig.adminUsername,
      password: updatedConfig.adminPassword,
    });
    assert.equal(newLogin.status, 200);
  } finally {
    adminDb.close();
  }
});

test('limits an employee session to their own payroll record', async () => {
  const login = await employee.post('/api/login').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    login: 'employee1@example.test',
    password: employeePassword,
  });
  assert.equal(login.status, 200);
  const response = await employee.get('/api/employees');
  assert.equal(response.status, 200);
  assert.equal(response.body.employees.length, 1);
  assert.equal(response.body.employees[0].id, 'TEST-001');
  const history = await employee.get('/api/payment-history');
  assert.equal(history.status, 200);
  assert.equal(history.body.payments.length, 5);
  assert.equal(history.body.payments[0].month, '2026-09');
  assert.equal(history.body.payments.at(-1).month, '2026-05');
  assert.equal(history.body.payments[0].net, history.body.payments[0].gross - history.body.payments[0].avance);
  const attendance = await employee.get('/api/attendance?date=2026-10-03');
  assert.equal(attendance.status, 403);
});

test('prevents employees from creating or editing payroll records', async () => {
  const response = await employee.post('/api/employees').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({});
  assert.equal(response.status, 403);
  const statusUpdate = await employee.put('/api/payment-history/TEST-001/2026-09').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({ status: 'unpaid' });
  assert.equal(statusUpdate.status, 403);
  const attendanceUpdate = await employee.put('/api/attendance/TEST-001/2026-10-03').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({ status: 'present' });
  assert.equal(attendanceUpdate.status, 403);
});

test('lets admins trigger a reset without returning a password or raw reset token', async () => {
  const login = await admin.post('/api/login').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    login: config.adminUsername,
    password: config.adminPassword,
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.name, 'Anouar Ezzoubai');
  const history = await admin.get('/api/payment-history');
  assert.equal(history.status, 200);
  assert.equal(history.body.payments.length, 30);
  assert.equal(new Set(history.body.payments.map((payment) => payment.employeeId)).size, 6);
  const attendance = await admin.get('/api/attendance?date=2026-10-03');
  assert.equal(attendance.status, 200);
  assert.equal(attendance.body.attendance.length, 6);
  assert.equal(attendance.body.attendance.every((record) => record.status === null), true);
  const attendanceUpdate = await admin.put('/api/attendance/TEST-001/2026-10-03').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({ status: 'present' });
  assert.equal(attendanceUpdate.status, 200);
  await admin.put('/api/attendance/TEST-001/2026-10-04').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({ status: 'present' });
  await admin.put('/api/attendance/TEST-001/2026-10-05').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({ status: 'absent', absenceReason: 'Family emergency' });
  const savedAttendance = await admin.get('/api/attendance?date=2026-10-03');
  assert.equal(savedAttendance.body.attendance.find((record) => record.employeeId === 'TEST-001').status, 'present');
  const calendarDays = savedAttendance.body.monthAttendance
    .filter((record) => record.employeeId === 'TEST-001')
    .sort((first, second) => first.date.localeCompare(second.date))
    .map((record) => [record.date, record.status]);
  assert.deepEqual(calendarDays, [
    ['2026-10-03', 'present'],
    ['2026-10-04', 'present'],
    ['2026-10-05', 'absent'],
  ]);
  const savedAbsence = await admin.get('/api/attendance?date=2026-10-05');
  assert.equal(savedAbsence.body.attendance.find((record) => record.employeeId === 'TEST-001').absenceReason, 'Family emergency');
  const update = await admin.put('/api/payment-history/TEST-001/2026-09').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({ status: 'unpaid' });
  assert.equal(update.status, 200);
  const updatedHistory = await admin.get('/api/payment-history');
  assert.equal(updatedHistory.body.payments.find((payment) => payment.employeeId === 'TEST-001' && payment.month === '2026-09').status, 'unpaid');
  const monthlyAttendance = updatedHistory.body.attendanceByMonth.find((record) => record.employeeId === 'TEST-001' && record.month === '2026-10');
  assert.equal(monthlyAttendance.daysWorked, 2);
  assert.equal(monthlyAttendance.daysAbsent, 1);
  assert.equal(monthlyAttendance.daysRecorded, 3);
  const employeeHistory = await employee.get('/api/payment-history');
  assert.equal(employeeHistory.body.attendanceByMonth.length, 1);
  assert.equal(employeeHistory.body.attendanceByMonth[0].employeeId, 'TEST-001');
  assert.equal(employeeHistory.body.attendanceByMonth[0].daysWorked, 2);
  await admin.put('/api/attendance/TEST-001/2026-10-06').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({ status: 'absent', absenceReason: 'Illness' });
  await admin.put('/api/attendance/TEST-001/2026-10-06').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({ status: 'present' });
  const changedToPresent = await admin.get('/api/attendance?date=2026-10-06');
  assert.equal(changedToPresent.body.attendance.find((record) => record.employeeId === 'TEST-001').absenceReason, null);
  const create = await admin.post('/api/employees').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    name: 'Test Employee', phone: '+212 600 123 456', role: 'Test role', department: 'Test',
    startDate: '2026-10-01', dailyRate: 500, paidDays: 26, avance: 0,
  });
  assert.equal(create.status, 201);
  assert.equal(deliveredLinks.length, 1);
  assert.equal(create.body.employee.username, '+212 600 123 456');
  assert.equal(create.body.employee.hasPassword, false);
  assert.equal(create.headers['cache-control'], 'no-store');
  assert.equal(JSON.stringify(create.body).includes('reset-password?token='), false);
  assert.equal(JSON.stringify(create.body).includes('password_hash'), false);
  const resetRequest = await admin.post(`/api/employees/${create.body.employee.id}/password-reset`).set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({});
  assert.equal(resetRequest.status, 200);
  assert.equal(JSON.stringify(resetRequest.body).includes('reset-password?token='), false);
  const token = new URL(deliveredLinks.at(-1).url).searchParams.get('token');
  const reset = await request(app).post('/api/password-reset/complete').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    token, password: 'new-password-12345',
  });
  assert.equal(reset.status, 200);
  const reuse = await request(app).post('/api/password-reset/complete').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    token, password: 'another-new-password',
  });
  assert.equal(reuse.status, 400);
  const newLogin = await request(app).post('/api/login').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    login: '+212 600 123 456', password: 'new-password-12345',
  });
  assert.equal(newLogin.status, 200);
  const employeeSession = request.agent(app);
  await employeeSession.post('/api/login').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    login: '+212 600 123 456', password: 'new-password-12345',
  });
  await admin.post(`/api/employees/${create.body.employee.id}/password-reset`).set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({});
  const secondToken = new URL(deliveredLinks.at(-1).url).searchParams.get('token');
  const secondReset = await request(app).post('/api/password-reset/complete').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    token: secondToken, password: 'replacement-password-5678',
  });
  assert.equal(secondReset.status, 200);
  const concurrentLinks = [];
  const concurrentApp = createApp({ db, config, smsSender: async (_config, _phone, url) => concurrentLinks.push(url) });
  const concurrentAdmin = request.agent(concurrentApp);
  await concurrentAdmin.post('/api/login').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    login: config.adminUsername, password: config.adminPassword,
  });
  await concurrentAdmin.post(`/api/employees/${create.body.employee.id}/password-reset`).set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({});
  const concurrentToken = new URL(concurrentLinks[0]).searchParams.get('token');
  const completeReset = (password) => request(concurrentApp).post('/api/password-reset/complete').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send({
    token: concurrentToken, password,
  });
  const concurrentResets = await Promise.all([
    completeReset('first-concurrent-password'),
    completeReset('second-concurrent-password'),
  ]);
  assert.deepEqual(concurrentResets.map((response) => response.status).sort(), [200, 400]);
  const revokedSession = await employeeSession.get('/api/employees');
  assert.equal(revokedSession.status, 401);
});

test('lets admins add historical payment records and rejects invalid or duplicate ones', async () => {
  const post = (agent, body) => agent.post('/api/payment-history').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send(body);
  const record = { employeeId: 'TEST-001', month: '2025-03', payDate: '2025-03-31', dailyRate: 500, paidDays: 24, avance: 200, status: 'paid' };
  assert.equal((await post(employee, record)).status, 403);
  const created = await post(admin, record);
  assert.equal(created.status, 201);
  assert.equal(created.body.payment.gross, 12000);
  assert.equal(created.body.payment.net, 11800);
  assert.equal((await post(admin, record)).status, 409);
  assert.equal((await post(admin, { ...record, month: '2025-13' })).status, 400);
  assert.equal((await post(admin, { ...record, month: '2025-04', avance: 99999 })).status, 400);
  assert.equal((await post(admin, { ...record, month: '2025-04', employeeId: 'NOPE' })).status, 404);
  const history = await admin.get('/api/payment-history');
  assert.ok(history.body.payments.some((payment) => payment.employeeId === 'TEST-001' && payment.month === '2025-03'));

  const put = (agent, body) => agent.put('/api/payment-history/TEST-001/2025-03').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send(body);
  const edit = { payDate: '2025-04-02', dailyRate: 600, paidDays: 30, avance: 100, status: 'unpaid' };
  assert.equal((await put(employee, edit)).status, 403);
  const edited = await put(admin, edit);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.gross, 18000);
  assert.equal(edited.body.net, 17900);
  assert.equal((await put(admin, { ...edit, avance: 99999 })).status, 400);
  assert.equal((await admin.put('/api/payment-history/NOPE/2025-03').set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').send(edit)).status, 404);
  const afterEdit = await admin.get('/api/payment-history');
  const saved = afterEdit.body.payments.find((payment) => payment.employeeId === 'TEST-001' && payment.month === '2025-03');
  assert.equal(saved.net, 17900);
  assert.equal(saved.status, 'unpaid');
});

test('dev quick login is off by default, never in production, and only for the local machine', async () => {
  const origin = (req) => req.set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1');
  assert.equal((await origin(request(app).post('/api/dev-login')).send({})).status, 404);
  assert.equal((await request(app).get('/api/dev-login')).status, 404);
  assert.equal(loadConfig({ NODE_ENV: 'development', DEV_QUICK_LOGIN: 'true' }).devQuickLogin, true);
  assert.equal(loadConfig({ NODE_ENV: 'development' }).devQuickLogin, false);
  const enabled = createApp({ db, config: { ...config, devQuickLogin: true } });
  const local = request.agent(enabled);
  assert.equal((await local.get('/api/dev-login')).status, 200);
  const signedIn = await origin(local.post('/api/dev-login')).send({});
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.user.role, 'admin');
  assert.equal((await local.get('/api/me')).status, 200);
});

test('lets admins delete an employee and everything attached to them, but not employees', async () => {
  const del = (agent, id) => agent.delete(`/api/employees/${id}`).set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1');
  assert.equal((await del(employee, 'TEST-002')).status, 403);
  assert.equal((await del(admin, 'TEST-002')).status, 204);
  assert.equal((await del(admin, 'TEST-002')).status, 404);
  const list = await admin.get('/api/employees');
  assert.ok(!list.body.employees.some((person) => person.id === 'TEST-002'));
  const history = await admin.get('/api/payment-history');
  assert.ok(!history.body.payments.some((payment) => payment.employeeId === 'TEST-002'));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'employee2@example.test'").get().n, 0);
});

test('sends Vonage SMS with Basic auth and E.164 destination digits', async () => {
  const originalFetch = globalThis.fetch;
  let sentRequest;
  globalThis.fetch = async (url, options) => {
    sentRequest = { url, options };
    return Response.json({ messages: [{ status: '0' }] });
  };
  try {
    await sendSms({
      smsProvider: 'vonage',
      vonageApiKey: '12345678',
      vonageApiSecret: 'test-secret',
      vonageFrom: 'MaisonPayroll',
    }, '+212 600 123 456', 'https://payroll.example/reset-password?token=test');
    assert.equal(sentRequest.url, 'https://rest.nexmo.com/sms/json');
    assert.equal(sentRequest.options.headers.Authorization, `Basic ${Buffer.from('12345678:test-secret').toString('base64')}`);
    const body = new URLSearchParams(sentRequest.options.body);
    assert.equal(body.get('to'), '212600123456');
    assert.equal(body.get('from'), 'MaisonPayroll');
    assert.match(body.get('text'), /reset-password\?token=test/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects Vonage responses that do not accept the message', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ messages: [{ status: '4', 'error-text': 'invalid credentials' }] });
  try {
    await assert.rejects(sendSms({
      smsProvider: 'vonage',
      vonageApiKey: '12345678',
      vonageApiSecret: 'test-secret',
      vonageFrom: 'MaisonPayroll',
    }, '+212600123456', 'https://payroll.example/reset-password?token=test'), /Vonage could not accept/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});