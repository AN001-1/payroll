const app = document.querySelector('#app');
let logoMarkup = '';
let currentUser = null;
let currentEmployee = null;
let employees = [];
let paymentHistory = [];
let attendanceByMonth = [];
let attendanceRecords = [];
let attendanceMonthRecords = [];
let attendanceDate = dateInputValue(new Date());
let attendanceStatusFilter = 'active';
let attendanceError = '';
let activeView = 'overview';
let selectedEmployeeId = '';
let employeeSearch = '';
let historyEmployeeFilter = 'all';
let historyMonthFilter = 'all';
let payrollMonth = monthInputValue(new Date());
let lastViewKey = '';

try {
  const storedTheme = localStorage.getItem('mr-theme');
  if (storedTheme === 'dark' || storedTheme === 'light') document.documentElement.dataset.theme = storedTheme;
} catch {}

const iconPaths = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  people: '<path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M21 19v-1a4 4 0 0 0-3-3.87"/><path d="M16 4.13a4 4 0 0 1 0 7.75"/>',
  payroll: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  attendance: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/><path d="m9 15.5 2 2 4-4"/>',
  payslip: '<path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z"/><path d="M14 2.5v5h5"/><path d="M9 13h6M9 17h4"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10"/><path d="M8 7h4M8 11h4M8 15h4M3 21h18"/>',
  minus: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.5v.01"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[name] || ''}</svg>`;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function isDarkTheme() {
  const { theme } = document.documentElement.dataset;
  return theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function toggleTheme(event) {
  const next = isDarkTheme() ? 'light' : 'dark';
  const apply = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('mr-theme', next); } catch {}
  };
  if (!document.startViewTransition || prefersReducedMotion()) return apply();
  const x = event.clientX || window.innerWidth - 40;
  const y = event.clientY || 40;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  document.startViewTransition(apply).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.2, .8, .2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
}

function formatCount(value, format) {
  if (format === 'money') return money(value);
  if (format === 'pad') return String(Math.round(value)).padStart(2, '0');
  if (format === 'num') return String(Math.round(value * 10) / 10);
  return String(Math.round(value));
}

// The visible number animates, so screen readers get the final value separately.
function countable(value, format = 'money') {
  const target = Number(value) || 0;
  return `<span data-count="${target}" data-format="${format}" aria-hidden="true">${formatCount(target, format)}</span><span class="sr-only">${formatCount(target, format)}</span>`;
}

function animateCounters() {
  if (prefersReducedMotion()) return;
  document.querySelectorAll('[data-count]').forEach((element) => {
    const target = Number(element.dataset.count);
    if (!target) return;
    const { format } = element.dataset;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, Math.max(0, (now - start) / 1300));
      element.textContent = formatCount(target * (1 - (1 - progress) ** 4), format);
      if (progress < 1 && element.isConnected) requestAnimationFrame(step);
    };
    element.textContent = formatCount(0, format);
    requestAnimationFrame(step);
  });
}

async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Cannot reach the payroll server. Start it with npm run dev.');
  }
  const result = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result?.error || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return result;
}

async function loadEmployees() {
  const result = await api('/api/employees');
  employees = result.employees;
  currentEmployee = currentUser?.role === 'employee'
    ? { ...employees[0], jobTitle: employees[0]?.role, role: 'employee' }
    : null;
}

async function loadPaymentHistory() {
  const result = await api('/api/payment-history');
  paymentHistory = result.payments;
  attendanceByMonth = result.attendanceByMonth;
}

async function loadAttendance() {
  const result = await api(`/api/attendance?date=${encodeURIComponent(attendanceDate)}&status=${attendanceStatusFilter}`);
  attendanceRecords = result.attendance;
  attendanceMonthRecords = result.monthAttendance || [];
  attendanceError = '';
}

function deductionEntries(person) {
  return [{ name: 'Avance', amount: Number(person.avance || 0) }];
}

function deductionTotal(person) {
  return deductionEntries(person).reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function netPay(person) {
  return Number(person.gross) - deductionTotal(person);
}

function payrollRecordsForMonth() {
  return employees.map((person) => {
    const snapshot = paymentHistory.find((payment) => payment.employeeId === person.id && payment.month === payrollMonth);
    const attendance = attendanceByMonth.find((record) => record.employeeId === person.id && record.month === payrollMonth);
    if (attendance?.daysRecorded) {
      const dailyRate = snapshot?.dailyRate ?? person.dailyRate;
      const gross = Math.round(dailyRate * attendance.daysWorked);
      return {
        ...person,
        dailyRate,
        paidDays: attendance.daysWorked,
        gross,
        avance: Math.min(gross, snapshot?.avance ?? person.avance),
        source: 'attendance',
        paymentStatus: snapshot?.status || null,
        payDate: snapshot?.payDate || null,
        payrollMonth,
      };
    }
    if (snapshot) {
      return {
        ...person,
        dailyRate: snapshot.dailyRate,
        paidDays: snapshot.paidDays,
        gross: snapshot.gross,
        avance: snapshot.avance,
        source: 'snapshot',
        paymentStatus: snapshot.status,
        payDate: snapshot.payDate,
        payrollMonth,
      };
    }
    if (person.inactiveSince && person.inactiveSince.slice(0, 7) < payrollMonth) return null;
    return { ...person, paidDays: null, gross: null, avance: 0, source: 'missing', payrollMonth };
  }).filter(Boolean);
}

async function loadLogo() {
  try {
    const response = await fetch('/assets/logo.svg?v=3');
    if (!response.ok) return;
    logoMarkup = (await response.text()).replace(/<\?xml[^>]*\?>\s*/, '')
      .replace('<svg ', '<svg class="brand-logo" aria-hidden="true" focusable="false" ');
  } catch {
    logoMarkup = '';
  }
}

const brandLogo = () => logoMarkup || '<img class="brand-logo" src="/assets/logo.svg?v=3" alt="" width="414" height="394" />';

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

const money = (amount) => new Intl.NumberFormat('fr-MA', {
  style: 'currency', currency: 'MAD', maximumFractionDigits: 0,
}).format(amount);
const moneyPrecise = (amount) => new Intl.NumberFormat('fr-MA', {
  style: 'currency', currency: 'MAD', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount);
const activeEmployees = () => employees.filter((person) => person.active !== false);
const totalPayroll = () => activeEmployees().reduce((sum, person) => sum + netPay(person), 0);
const averagePay = () => activeEmployees().length ? Math.round(totalPayroll() / activeEmployees().length) : 0;
const departmentCount = () => new Set(activeEmployees().map((person) => person.department)).size;
const initials = (name) => name.split(' ').map((part) => part[0]).slice(0, 2).join('');
const localMoroccoPhone = (phone) => String(phone || '').replace(/\D/g, '').replace(/^212/, '').replace(/^0/, '');
const moroccoPhone = (phone) => `+212${String(phone || '').replace(/\D/g, '').replace(/^0/, '')}`;

function dateInputValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthInputValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function displayDate(value) {
  const dateText = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(`${dateText}T12:00:00`) : new Date(dateText);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function displayMonth(value) {
  const date = new Date(`${value}-01T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// Start dates may be stored as YYYY-MM or as older full YYYY-MM-DD values.
const startMonthValue = (value) => String(value || '').slice(0, 7);
const displayStartMonth = (value) => displayMonth(startMonthValue(value));

function payrollMonthLabel(person) {
  return displayMonth(person.payrollMonth || '2026-10');
}

function payrollPayDate(person) {
  return person.payDate ? displayDate(person.payDate) : 'To be scheduled';
}

function nextEmployeeId() {
  const serials = employees.map((person) => Number(person.id.split('-').at(-1))).filter(Number.isFinite);
  return `MR-${String(Math.max(0, ...serials) + 1).padStart(3, '0')}`;
}

function renderHome() {
  lastViewKey = '';
  window.scrollTo({ top: 0, behavior: 'instant' });
  const heroTitle = ['Good', 'work', 'deserves', 'good', '<em>care.</em>']
    .map((word, index) => `<span class="word"><span style="--i:${index}">${word}</span></span>`).join(' ');
  const marqueeItems = ['Croissants au beurre', 'Pain au chocolat', 'Viennoiserie', 'Halwa beldia', 'Rghayef', 'Made by hand, every morning']
    .map((item) => `<span>${item}</span>`).join('');
  app.innerHTML = `<main class="home-page">
    <header class="home-header">
      <a class="home-brand" href="/" aria-label="Maison Rotterdam home">${brandLogo()}<span>MAISON ROTTERDAM<small>HANDCRAFTED PATISSERIE</small></span></a>
      <button class="staff-access" type="button" data-staff-access aria-label="Open staff sign in" title="Staff sign in">Staff access <span aria-hidden="true">↗</span></button>
    </header>
    <section class="home-hero" aria-labelledby="home-title">
      <img class="home-hero-image" src="/assets/patisserie-counter.jpg" alt="Fresh croissants dusted with sugar at Maison Rotterdam" />
      <div class="home-hero-content">
        <span class="home-eyebrow">MAISON ROTTERDAM · PEOPLE & PATISSERIE</span>
        <h1 id="home-title">${heroTitle}</h1>
        <p>Carefully made pastries start with a team that feels cared for.</p>
        <div class="home-hero-actions"><button class="primary-button" type="button" data-staff-access>Staff sign in <span aria-hidden="true">→</span></button><a class="home-discover" href="#our-approach"><span aria-hidden="true">↓</span>A little about our way</a></div>
      </div>
      <span class="home-image-caption">FRESH FROM OUR KITCHEN · ROTTERDAM</span>
      <span class="home-scroll-hint" aria-hidden="true"></span>
    </section>
    <div class="home-marquee" aria-hidden="true"><div class="home-marquee-track">${marqueeItems}${marqueeItems}</div></div>
    <section class="home-intro" id="our-approach">
      <div class="home-intro-heading" data-scroll-reveal><span class="home-kicker">A GOOD DAY, MADE TOGETHER</span><h2>A thoughtful place for the people behind every bake.</h2></div>
      <p class="home-intro-copy" data-scroll-reveal>From clear pay details to the everyday essentials, this is a considered home for the Maison Rotterdam team.</p>
      <div class="home-pillars">
        <article data-scroll-reveal><span>01</span><h3>Clear by design</h3><p>Important work and pay details, easier to find.</p></article>
        <article data-scroll-reveal><span>02</span><h3>Made for people</h3><p>A simple place for your team and employment information.</p></article>
        <article data-scroll-reveal><span>03</span><h3>Care in the details</h3><p>Thoughtful work starts with the small things done well.</p></article>
      </div>
    </section>
    <footer class="home-footer" data-scroll-reveal><span>MAISON ROTTERDAM <small>HANDCRAFTED PATISSERIE</small></span><span>Rotterdam · Made with care</span></footer>
  </main>`;
  const homePage = document.querySelector('.home-page');
  const revealItems = homePage.querySelectorAll('[data-scroll-reveal]');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    homePage.classList.add('has-scroll-reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }
  document.querySelectorAll('[data-staff-access]').forEach((button) => button.addEventListener('click', renderSignIn));
}

function renderSignIn() {
  window.scrollTo({ top: 0, behavior: 'instant' });
  app.innerHTML = `
    <main class="login-page">
      <section class="login-story">
        <div class="brand"><a class="brand-link" href="/" aria-label="Maison Rotterdam home">${brandLogo()}<span>MAISON ROTTERDAM<small class="brand-category">HANDCRAFTED PATISSERIE</small></span></a></div>
        <div class="story-copy">
          <span class="eyebrow">Patisserie staff workspace</span>
          <h1>The team behind every bake.</h1>
          <p>Clear pay details and payroll administration for the Maison Rotterdam pastry team.</p>
        </div>
        <div class="story-foot">Hand-finished pastries. People-first payroll.</div>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <button class="sign-in-back" type="button" data-home>← Maison Rotterdam</button>
          <span class="eyebrow">Secure workspace</span>
          <h2>Sign in</h2>
          <p>Use your staff username or administrator account to continue.</p>
          <form id="login-form">
            <div class="field"><label for="login-input">Email or phone number</label><input id="login-input" name="login" type="text" autocomplete="username" required placeholder="Email or phone number" /></div>
            <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password" /></div>
            <button class="primary-button login-submit" type="submit">Sign in <span aria-hidden="true">→</span></button>
            <button class="secondary-button dev-login" type="button" data-dev-login hidden>Dev: continue as admin</button>
            <div id="login-error" class="login-error" role="alert"></div>
          </form>
        </div>
      </section>
    </main>`;

  const submitLogin = async (login, password, path = '/api/login') => {
    const error = document.querySelector('#login-error');
    const submitButton = document.querySelector('.login-submit');
    error.textContent = '';
    submitButton.classList.add('is-loading');
    try {
      const result = await api(path, { method: 'POST', body: path === '/api/login' ? { login, password } : {} });
      currentUser = result.user;
      activeView = currentUser.role === 'admin' ? 'overview' : 'payslip';
      await loadEmployees();
      await loadPaymentHistory();
      renderApp();
    } catch (loginError) {
      submitButton.classList.remove('is-loading');
      error.textContent = loginError.message;
    }
  };
  document.querySelector('#login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submitLogin(String(form.get('login')).trim(), String(form.get('password')));
  });
  const devLoginButton = document.querySelector('[data-dev-login]');
  api('/api/dev-login').then(() => { devLoginButton.hidden = false; }).catch(() => {});
  devLoginButton.addEventListener('click', () => submitLogin('', '', '/api/dev-login'));
  document.querySelectorAll('[data-home]').forEach((button) => button.addEventListener('click', renderHome));
}

function renderPasswordReset(token) {
  app.innerHTML = `<main class="login-page">
    <section class="login-story"><div class="brand"><a class="brand-link" href="/" aria-label="Maison Rotterdam home">${brandLogo()}<span>MAISON ROTTERDAM<small class="brand-category">HANDCRAFTED PATISSERIE</small></span></a></div><div class="story-copy"><span class="eyebrow">Patisserie staff access</span><h1>Set a new password.</h1><p>Choose a private password for your staff account.</p></div><div class="story-foot">Password reset links expire after 10 minutes.</div></section>
    <section class="login-panel"><div class="login-card"><span class="eyebrow">Password reset</span><h2>Choose a password.</h2><p>Your administrator will not see the password you enter.</p>
      <form id="password-reset-form"><div class="field"><label for="new-password">New password</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /></div>
      <div class="field"><label for="confirm-password">Confirm password</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required /></div>
      <button class="primary-button login-submit" type="submit">Set password</button><div id="reset-error" class="login-error" role="alert"></div></form>
    </div></section>
  </main>`;
  document.querySelector('#password-reset-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.querySelector('#new-password').value;
    const confirmation = document.querySelector('#confirm-password').value;
    const error = document.querySelector('#reset-error');
    error.textContent = '';
    if (password !== confirmation) {
      error.textContent = 'The passwords do not match.';
      return;
    }
    try {
      const result = await api('/api/password-reset/complete', { method: 'POST', body: { token, password } });
      history.replaceState({}, '', '/');
      renderHome();
      showSaveNotice(result.message);
    } catch (resetError) {
      error.textContent = resetError.message;
    }
  });
}

function renderUnavailable(message) {
  app.innerHTML = `<main class="login-panel"><div class="login-card"><span class="eyebrow">Payroll workspace</span><h2>Server unavailable.</h2><p>${escapeHtml(message)}</p></div></main>`;
}

function sidebar() {
  const items = currentUser.role === 'admin'
    ? [['overview', 'overview', 'Overview'], ['people', 'people', 'Employees'], ['payroll', 'payroll', 'Payroll'], ['history', 'history', 'Payment history'], ['attendance', 'attendance', 'Attendance']]
    : [['payslip', 'payslip', 'My payslip'], ['history', 'history', 'Payment history'], ['profile', 'profile', 'My details']];
  const currentNavView = activeView === 'employeeDetails' ? 'people' : activeView;
  return `<aside class="sidebar">
    <div class="brand"><a class="brand-link" href="/" aria-label="Maison Rotterdam home">${brandLogo()}<span>MAISON ROTTERDAM<small class="brand-category">HANDCRAFTED PATISSERIE</small></span></a><button class="mobile-menu-toggle" type="button" data-mobile-menu-toggle aria-label="Open navigation menu" aria-controls="main-navigation" aria-expanded="false"><span></span><span></span><span></span></button></div>
    <div class="company-label">Patisserie staff</div>
    <nav class="side-nav" id="main-navigation" aria-label="Main navigation">${items.map(([view, iconName, label]) => `<button class="nav-button ${currentNavView === view ? 'active' : ''}" data-view="${view}" type="button"${currentNavView === view ? ' aria-current="page"' : ''}><span class="nav-icon">${icon(iconName)}</span>${label}</button>`).join('')}</nav>
    <div class="sidebar-bottom">
      <div class="sidebar-user"><a class="sidebar-profile-link" href="/profile" data-view="profile" aria-label="View your profile" title="View your profile"${activeView === 'profile' ? ' aria-current="page"' : ''}><span class="avatar" aria-hidden="true">${escapeHtml(initials(currentUser.name))}</span></a><div class="sidebar-user-text"><strong>${escapeHtml(currentUser.name)}</strong><span>${currentUser.role === 'admin' ? 'Payroll admin' : 'Employee'}</span></div><button class="sidebar-logout" type="button" data-logout aria-label="Sign out" title="Sign out">${icon('logout')}</button></div>
    </div>
  </aside>`;
}

function topbar() {
  const label = currentUser.role === 'admin' ? 'Employees / Payroll' : 'My account / Payroll';
  const period = activeView === 'payroll' ? displayMonth(payrollMonth).toUpperCase() : 'OCTOBER 2026';
  const role = currentUser.role === 'admin' ? 'Payroll admin' : 'Employee';
  return `<header class="topbar"><div class="breadcrumb">${label}</div><div class="topbar-right"><span class="period-pill">${escapeHtml(period)}</span><button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle dark mode" title="Toggle theme"><span class="theme-moon">${icon('moon')}</span><span class="theme-sun">${icon('sun')}</span></button><div class="account-menu"><button class="topbar-profile" type="button" data-account-menu-toggle aria-label="Account menu for ${escapeHtml(currentUser.name)}" aria-haspopup="menu" aria-expanded="false" title="Account menu"><span class="avatar" aria-hidden="true">${escapeHtml(initials(currentUser.name))}</span><span class="topbar-dot" aria-label="Online"></span></button><div class="account-menu-panel" role="menu" hidden><div class="account-menu-heading"><strong>${escapeHtml(currentUser.name)}</strong><span>${role}</span></div><button class="account-menu-item" type="button" role="menuitem" data-view="profile">Personal information</button><button class="account-menu-item" type="button" role="menuitem" data-logout>Sign out</button></div></div></div></header>`;
}

function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head"><div><span class="eyebrow">${currentUser.role === 'admin' ? 'People operations' : 'Your compensation'}</span><h1>${title}</h1><p>${subtitle}</p></div><div class="page-actions">${actions}</div></div>`;
}

function illustrativeBanner() {
  return `<div class="illustrative-banner"><strong>Illustrative figures</strong><span>Payroll figures are estimates and are not statutory Moroccan payroll calculations or tax advice.</span></div>`;
}

function metric(label, value, foot, symbol, view = '') {
  const tag = view ? 'button' : 'article';
  const attributes = view ? ` type="button" data-view="${view}" aria-label="View ${escapeHtml(label)} details"` : '';
  const interactiveClass = view ? ' metric-link' : '';
  return `<${tag} class="metric${interactiveClass}"${attributes}><div class="metric-top"><span>${label}</span><span class="metric-symbol" aria-hidden="true">${symbol}</span></div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></${tag}>`;
}

function employeeNameLink(employeeId, employeeName) {
  if (currentUser?.role !== 'admin') return `<strong>${escapeHtml(employeeName)}</strong>`;
  return `<button class="employee-name-link" type="button" data-employee-details="${escapeHtml(employeeId)}" aria-label="View ${escapeHtml(employeeName)} employee details">${escapeHtml(employeeName)}</button>`;
}

function employeeRowDetailsAttributes(employeeId, employeeName) {
  if (currentUser?.role !== 'admin') return '';
  return `class="employee-detail-row" data-employee-row="${escapeHtml(employeeId)}" tabindex="0" aria-label="Open details for ${escapeHtml(employeeName)}"`;
}

function openEmployeeDetails(employeeId) {
  if (currentUser?.role !== 'admin') return;
  const person = employees.find((employee) => employee.id === employeeId);
  if (!person) return;
  selectedEmployeeId = person.id;
  activeView = 'employeeDetails';
  renderApp();
}

function employeeTable(rows, showActions = true, showUsername = false) {
  if (!rows.length) return '<div class="empty-state">No employees match that search.</div>';
  const resetAction = 'Send password reset';
  return `<div class="table-wrap"><table><thead><tr><th>Employee</th>${showUsername ? '<th>Username</th>' : ''}<th>Department</th><th>Gross pay</th><th>Net pay</th>${showUsername ? '<th>Account</th>' : '<th>Status</th>'}${showActions ? '<th></th>' : ''}</tr></thead><tbody>${rows.map((person) => `<tr ${employeeRowDetailsAttributes(person.id, person.name)}>
    <td><div class="person-cell"><span class="avatar" style="background:${person.color}">${escapeHtml(initials(person.name))}</span><div>${employeeNameLink(person.id, person.name)}<small>${escapeHtml(person.role)}${person.active === false ? ` · Inactive since ${escapeHtml(displayDate(person.inactiveSince))}` : ''}</small></div></div></td>
    ${showUsername ? `<td><span class="username-cell">${escapeHtml(person.username || 'Not set')}</span></td>` : ''}<td>${escapeHtml(person.department)}</td><td class="money">${money(person.gross)}</td><td class="money"><strong>${money(netPay(person))}</strong></td><td><span class="status ${person.hasPassword ? '' : 'status-pending'}">${showUsername ? (person.hasPassword ? 'Password set' : 'Setup needed') : 'Ready'}</span></td>${showActions ? `<td><div class="employee-actions"><button class="row-action" type="button" data-edit-person="${escapeHtml(person.id)}">Edit</button>${showUsername ? `<button class="row-action" type="button" data-reset-password="${escapeHtml(person.id)}" ${person.phone ? '' : 'disabled'}>${resetAction}</button><button class="row-action danger" type="button" data-delete-person="${escapeHtml(person.id)}">Delete</button>` : ''}</div></td>` : ''}
  </tr>`).join('')}</tbody></table></div>`;
}

function overview() {
  const recent = activeEmployees().slice(0, 4);
  const monthly = [...new Set(paymentHistory.map((payment) => payment.month))].sort().slice(-6).map((month) => ({
    month,
    total: paymentHistory.filter((payment) => payment.month === month).reduce((sum, payment) => sum + payment.net, 0),
  }));
  const maxMonthlyTotal = Math.max(1, ...monthly.map((period) => period.total));
  return `${pageHead('Payroll overview', 'A clear picture of this month’s people costs.', '<button class="secondary-button" type="button" data-view="payroll">View payroll run →</button>')}
    ${illustrativeBanner()}
    <section class="metric-grid" aria-label="Payroll summary">
      ${metric('Monthly net payroll', countable(totalPayroll()), `<em>${activeEmployees().length}</em> people included this month`, icon('trend'), 'payroll')}
      ${metric('Active employees', countable(activeEmployees().length, 'pad'), `Across ${departmentCount()} departments`, icon('people'), 'people')}
      ${metric('Average net salary', countable(averagePay()), 'Per employee, monthly', icon('pulse'), 'people')}
      ${metric('Next pay date', '30 Oct', 'October 2026 payroll', icon('clock'), 'payroll')}
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-head"><h2>Payroll at a glance</h2><span>Net pay · MAD</span></div><div class="panel-body"><div class="payroll-total"><strong>${countable(totalPayroll())}</strong><span>${escapeHtml(displayMonth(payrollMonth))}</span></div>${monthly.length ? `<div class="bar-chart" role="img" aria-label="Net payroll by month">${monthly.map((period, index) => `<div class="bar-column"><div class="bar ${period.month === payrollMonth ? 'current' : ''}" style="--i:${index};height:${Math.max(4, Math.round(period.total / maxMonthlyTotal * 100))}%" data-label="${escapeHtml(money(period.total))}"></div><span class="bar-label">${escapeHtml(new Date(`${period.month}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'short' }))}</span></div>`).join('')}</div><div class="chart-key"><span class="key-dot"></span>Saved monthly net payroll</div>` : '<div class="empty-state">No payment history available.</div>'}</div></article>
      <article class="next-run"><span class="eyebrow">Upcoming payroll</span><h3>October salary run</h3><p>Review the payroll totals before payday.</p><div class="run-detail"><span>Pay date</span><strong>30 OCT 2026</strong></div><div class="run-detail"><span>Employees</span><strong>${String(activeEmployees().length).padStart(2, '0')} PEOPLE</strong></div><div class="run-detail"><span>Net total</span><strong>${money(totalPayroll())}</strong></div></article>
    </section>
    <section class="panel table-panel"><div class="panel-head"><h2>People in this payroll</h2><button class="row-action" type="button" data-view="people">All employees →</button></div>${employeeTable(recent)}</section>`;
}

function people() {
  const rows = employees.filter((person) => `${person.name} ${person.role} ${person.department}`.toLowerCase().includes(employeeSearch.toLowerCase()));
  const peopleActions = `<button class="primary-button" type="button" data-add-employee>＋ Add employee</button><button class="secondary-button" type="button" data-print-report="employees">Print list</button><button class="secondary-button" type="button" data-export>Export CSV ↓</button>`;
  return `${pageHead('Employees', `${activeEmployees().length} active · ${employees.length - activeEmployees().length} inactive employees.`, peopleActions)}${illustrativeBanner()}
    <section class="metric-grid">${metric('Total headcount', countable(activeEmployees().length, 'pad'), 'Active employee records', icon('people'))}${metric('Departments', countable(departmentCount(), 'pad'), 'Across the company', icon('building'))}${metric('Monthly net payroll', countable(totalPayroll()), 'All listed employees', icon('trend'))}${metric('Average net pay', countable(averagePay()), 'Per month', icon('pulse'))}</section>
    <section class="panel table-panel"><div class="panel-head"><h2>Employee directory</h2><div class="table-tools"><input class="search-input" type="search" placeholder="Search employees" aria-label="Search employees" value="${escapeHtml(employeeSearch)}" /><span>${rows.length} records</span></div></div>${employeeTable(rows, true, true)}</section>`;
}

function payroll() {
  const records = payrollRecordsForMonth();
  const calculated = records.filter((person) => person.gross !== null);
  const daysTotal = calculated.reduce((sum, person) => sum + Number(person.paidDays || 0), 0);
  const grossTotal = calculated.reduce((sum, person) => sum + person.gross, 0);
  const avanceTotal = calculated.reduce((sum, person) => sum + person.avance, 0);
  const netTotal = grossTotal - avanceTotal;
  const missingCount = records.filter((person) => person.source === 'missing').length;
  const monthOptions = [...new Set([...paymentHistory.map((payment) => payment.month), ...attendanceByMonth.map((record) => record.month)])].sort().reverse();
  if (!monthOptions.includes(payrollMonth)) monthOptions.unshift(payrollMonth);
  const monthControl = `<label class="payroll-month-picker" for="payroll-month">Payroll month<select id="payroll-month">${monthOptions.map((month) => `<option value="${escapeHtml(month)}" ${month === payrollMonth ? 'selected' : ''}>${escapeHtml(displayMonth(month))}</option>`).join('')}</select></label>`;
  const rows = records.map((person) => {
    const rowNet = person.gross === null ? null : person.gross - person.avance;
    const sourceLabel = person.source === 'attendance'
      ? `Attendance estimate${person.paymentStatus ? ` · ${person.paymentStatus} snapshot` : ''}`
      : person.source === 'snapshot' ? `Saved ${person.paymentStatus} payroll` : 'No attendance';
    return `<tr ${employeeRowDetailsAttributes(person.id, person.name)}><td><div class="person-cell"><span class="avatar" style="background:${escapeHtml(person.color)}">${escapeHtml(initials(person.name))}</span><div>${employeeNameLink(person.id, person.name)}<small>${escapeHtml(person.id)}</small></div></div></td>
      <td class="money">${moneyPrecise(person.dailyRate)}</td><td>${person.paidDays ?? '—'}</td><td class="money">${person.gross === null ? '—' : money(person.gross)}</td><td class="money">${person.gross === null ? '—' : money(person.avance)}</td><td class="money"><strong>${rowNet === null ? '—' : money(rowNet)}</strong></td><td><span class="payroll-source ${person.source}">${sourceLabel}</span></td>
      <td><div class="payroll-actions">${person.gross === null ? '' : `<button class="row-action" type="button" data-print-person="${escapeHtml(person.id)}">Print</button><button class="row-action" type="button" data-download-person="${escapeHtml(person.id)}">PDF ↓</button>`}<button class="row-action" type="button" data-edit-person="${escapeHtml(person.id)}">Edit employee</button></div></td></tr>`;
  }).join('');
  return `${pageHead('Payroll run', `${displayMonth(payrollMonth)} · attendance-based estimate.`, `<button class="secondary-button" type="button" data-export>Export CSV ↓</button>${monthControl}`)}${illustrativeBanner()}
    <section class="metric-grid">${metric('Days worked', countable(daysTotal, 'num'), `${calculated.length} employees with payroll data`, icon('clock'))}${metric('Total gross', countable(grossTotal), 'Before Avance deductions', icon('trend'))}${metric('Avance deductions', countable(avanceTotal), 'Illustrative advance amounts', icon('minus'))}${metric('Estimated net', countable(netTotal), `${missingCount} employees missing attendance`, icon('payroll'))}</section>
    <section class="panel table-panel"><div class="panel-head"><h2>${escapeHtml(displayMonth(payrollMonth))} salary register</h2><span>${calculated.length} of ${employees.length} calculable · MAD</span></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Rate / day</th><th>Days worked</th><th>Gross estimate</th><th>Avance</th><th>Net estimate</th><th>Calculation</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel-body"><div class="earnings-row total"><span>Estimated net payroll total</span><strong>${money(netTotal)}</strong></div><p class="notice-line">Days worked count dates marked Present. Saved payroll months use their original payroll snapshot; other months estimate gross pay as daily rate × present days and cap Avance at gross. Missing attendance is left blank. Review all records before payment; figures are illustrative and are not statutory payroll calculations.</p></div></section>`;
}

function employeeDetailsView() {
  const person = employees.find((employee) => employee.id === selectedEmployeeId);
  if (!person) return `${pageHead('Employee details', 'Select an employee from the directory.')}`;
  const currentPayroll = payrollRecordsForMonth().find((record) => record.id === person.id);
  const currentNet = currentPayroll && currentPayroll.gross !== null ? currentPayroll.gross - currentPayroll.avance : null;
  const payments = paymentHistory.filter((payment) => payment.employeeId === person.id);
  const attendance = attendanceByMonth.filter((record) => record.employeeId === person.id);
  const paymentRows = payments.map((payment) => `<tr><td>${escapeHtml(displayMonth(payment.month))}</td><td>${escapeHtml(displayDate(payment.payDate))}</td><td>${payment.paidDays}</td><td class="money">${moneyPrecise(payment.dailyRate)}</td><td class="money">${money(payment.gross)}</td><td class="money">${money(payment.avance)}</td><td class="money"><strong>${money(payment.net)}</strong></td><td><span class="status ${payment.status === 'unpaid' ? 'status-pending' : ''}">${payment.status === 'paid' ? 'Paid' : 'Unpaid'}</span></td></tr>`).join('');
  const attendanceRows = attendance.map((record) => `<tr><td>${escapeHtml(displayMonth(record.month))}</td><td>${record.daysWorked}</td><td>${record.daysAbsent}</td><td>${record.daysRecorded}</td></tr>`).join('');
  const actions = `<button class="secondary-button" type="button" data-view="people">← Employee directory</button><button class="secondary-button" type="button" data-edit-person="${escapeHtml(person.id)}">Edit employee</button><button class="secondary-button" type="button" data-toggle-employee-status="${escapeHtml(person.id)}" aria-pressed="${person.active === false}">${person.active === false ? 'Reactivate employee' : 'Mark inactive'}</button><button class="secondary-button danger-button" type="button" data-delete-person="${escapeHtml(person.id)}">Delete employee</button>`;
  return `${pageHead(escapeHtml(person.name), `${escapeHtml(person.role)} · ${escapeHtml(person.department)}`, actions)}${illustrativeBanner()}
    <section class="employee-summary">
      <article class="employee-id-card"><div class="person-cell"><span class="avatar" style="background:${escapeHtml(person.color)}">${escapeHtml(initials(person.name))}</span><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role)}</small></div></div><div class="profile-grid"><div class="info-pair"><span>Employee ID</span><strong>${escapeHtml(person.id)}</strong></div><div class="info-pair"><span>Department</span><strong>${escapeHtml(person.department)}</strong></div><div class="info-pair"><span>Phone</span><strong>${escapeHtml(person.phone || 'Not provided')}</strong></div><div class="info-pair"><span>Email</span><strong>${escapeHtml(person.email || 'Not provided')}</strong></div><div class="info-pair"><span>Start date</span><strong>${escapeHtml(displayStartMonth(person.startDate))}</strong></div><div class="info-pair"><span>Account</span><strong>${person.hasPassword ? 'Ready' : 'Setup needed'}</strong></div><div class="info-pair"><span>Username</span><strong>${escapeHtml(person.username || 'Not set')}</strong></div><div class="info-pair"><span>Status</span><strong>${person.active === false ? `Inactive since ${escapeHtml(displayDate(person.inactiveSince))}` : person.inactiveSince ? `Active until ${escapeHtml(displayDate(person.inactiveSince))}` : 'Active'}</strong></div></div></article>
      <article class="net-card"><div><span class="eyebrow">${escapeHtml(displayMonth(payrollMonth))} net pay</span><h2>${currentNet === null ? '—' : countable(currentNet)}</h2><p>${currentPayroll?.source === 'snapshot' ? 'Saved payroll record' : currentPayroll?.source === 'attendance' ? 'Attendance-based estimate' : 'No payroll data for this month'}</p></div><div class="net-meta"><div><span>Rate per day</span><strong>${currentPayroll ? moneyPrecise(currentPayroll.dailyRate) : '—'}</strong></div><div><span>Days worked</span><strong>${currentPayroll?.paidDays ?? '—'}</strong></div><div><span>Gross pay</span><strong>${currentPayroll?.gross == null ? '—' : money(currentPayroll.gross)}</strong></div></div></article>
    </section>
    <section class="panel table-panel"><div class="panel-head"><h2>Payment history</h2><span>${payments.length} records</span></div>${paymentRows ? `<div class="table-wrap"><table><thead><tr><th>Month</th><th>Pay date</th><th>Days</th><th>Rate / day</th><th>Gross</th><th>Avance</th><th>Net</th><th>Status</th></tr></thead><tbody>${paymentRows}</tbody></table></div>` : '<div class="empty-state">No payment history for this employee.</div>'}</section>
    <section class="panel table-panel"><div class="panel-head"><h2>Monthly attendance</h2><span>${attendance.length} records</span></div>${attendanceRows ? `<div class="table-wrap"><table><thead><tr><th>Month</th><th>Days worked</th><th>Days absent</th><th>Days recorded</th></tr></thead><tbody>${attendanceRows}</tbody></table></div>` : '<div class="empty-state">No attendance history for this employee.</div>'}</section>`;
}

function payslip(person) {
  const gross = person.gross;
  return `${pageHead('Your payslip', 'A breakdown of your October 2026 compensation.', '<button class="secondary-button" type="button" data-print-current>Print payslip ↗</button><button class="secondary-button" type="button" data-download-current>Download PDF ↓</button>')}${illustrativeBanner()}
    <section class="employee-summary">
      <article class="net-card"><div><span class="eyebrow">Net pay · October 2026</span><h2>${countable(netPay(person))}</h2><p>Illustrative take-home amount for this month</p></div><div class="net-meta"><div><span>Pay date</span><strong>30 OCT 2026</strong></div><div><span>Pay frequency</span><strong>MONTHLY</strong></div><div><span>Currency</span><strong>MAD</strong></div></div></article>
        <article class="employee-id-card"><div class="person-cell"><span class="avatar" style="background:${person.color}">${escapeHtml(initials(person.name))}</span><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.jobTitle || person.role)}</small></div></div><div class="info-pair"><span>Employee ID</span><strong>${escapeHtml(person.id)}</strong></div><div class="info-pair"><span>Department</span><strong>${escapeHtml(person.department)}</strong></div><div class="info-pair"><span>Start date</span><strong>${escapeHtml(displayStartMonth(person.startDate))}</strong></div></article>
    </section>
    <section class="panel"><div class="panel-head"><h2>Salary specification</h2><span>October 2026 · MAD</span></div><div class="panel-body"><div class="profile-grid"><div>
      <div class="eyebrow">Earnings</div><div class="earnings-row"><span>Rate per paid day</span><strong>${moneyPrecise(person.dailyRate)}</strong></div><div class="earnings-row"><span>Paid days this month</span><strong>${person.paidDays}</strong></div><div class="earnings-row total"><span>Gross monthly salary</span><strong>${money(gross)}</strong></div>
    </div><div>
      <div class="eyebrow">Only deduction · illustrative</div>${deductionEntries(person).map((item) => `<div class="earnings-row"><span>${escapeHtml(item.name)}</span><strong>− ${money(item.amount)}</strong></div>`).join('')}<div class="earnings-row total"><span>Net salary</span><strong>${money(netPay(person))}</strong></div>
    </div></div><p class="notice-line">This payslip is illustrative. Deductions do not represent Moroccan payroll law, CNSS, AMO, tax withholding, or any legally reviewed calculation. Contact your payroll administrator for official statements.</p></div></section>`;
}

function paymentHistoryView() {
  const isAdmin = currentUser.role === 'admin';
  const months = [...new Set([...paymentHistory.map((payment) => payment.month), ...attendanceByMonth.map((entry) => entry.month)])].sort().reverse();
  const visiblePayments = paymentHistory.filter((payment) =>
    (!isAdmin || historyEmployeeFilter === 'all' || payment.employeeId === historyEmployeeFilter)
      && (historyMonthFilter === 'all' || payment.month === historyMonthFilter));
  const visibleAttendanceMonths = attendanceByMonth.filter((entry) =>
    (!isAdmin || historyEmployeeFilter === 'all' || entry.employeeId === historyEmployeeFilter)
      && (historyMonthFilter === 'all' || entry.month === historyMonthFilter));
  const rows = visiblePayments.map((payment) => `<tr ${employeeRowDetailsAttributes(payment.employeeId, payment.employeeName)}>
    <td><strong>${escapeHtml(displayMonth(payment.month))}</strong></td>
    ${isAdmin ? `<td><div class="person-cell"><span class="avatar">${escapeHtml(initials(payment.employeeName))}</span><div>${employeeNameLink(payment.employeeId, payment.employeeName)}<small>${escapeHtml(payment.employeeId)}</small></div></div></td>` : ''}
    <td>${escapeHtml(displayDate(payment.payDate))}</td>
    <td>${payment.paidDays}</td>
    <td class="money">${money(payment.gross)}</td>
    <td class="money">− ${money(payment.avance)}</td>
    <td class="money"><strong>${money(payment.net)}</strong></td>
    <td>${isAdmin
      ? `<button class="payment-status-toggle ${payment.status}" type="button" data-payment-status="${escapeHtml(payment.status)}" data-employee-id="${escapeHtml(payment.employeeId)}" data-month="${escapeHtml(payment.month)}" aria-pressed="${payment.status === 'paid'}" aria-label="Mark ${escapeHtml(payment.employeeName)} ${escapeHtml(displayMonth(payment.month))} as ${payment.status === 'paid' ? 'unpaid' : 'paid'}">${payment.status === 'paid' ? 'Paid' : 'Unpaid'}</button>`
      : `<span class="status ${payment.status === 'unpaid' ? 'status-pending' : ''}">${payment.status === 'paid' ? 'Paid' : 'Unpaid'}</span>`}</td>
    ${isAdmin ? `<td><button class="row-action" type="button" data-edit-payment data-employee-id="${escapeHtml(payment.employeeId)}" data-month="${escapeHtml(payment.month)}">Edit</button></td>` : ''}
  </tr>`).join('');
  const attendanceRows = visibleAttendanceMonths.map((entry) => `<tr ${employeeRowDetailsAttributes(entry.employeeId, entry.employeeName)}>
    <td><strong>${escapeHtml(displayMonth(entry.month))}</strong></td>
    ${isAdmin ? `<td><div class="person-cell"><span class="avatar">${escapeHtml(initials(entry.employeeName))}</span><div>${employeeNameLink(entry.employeeId, entry.employeeName)}<small>${escapeHtml(entry.employeeId)}</small></div></div></td>` : ''}
    <td>${entry.daysWorked}</td>
    <td>${entry.daysAbsent}</td>
    <td>${entry.daysRecorded}</td>
  </tr>`).join('');
  const periodCount = new Set(visiblePayments.map((payment) => payment.month)).size;
  const filters = isAdmin ? `<div class="history-filters">
    <label for="history-employee-filter">Employee<select id="history-employee-filter" data-history-filter="employeeId"><option value="all" ${historyEmployeeFilter === 'all' ? 'selected' : ''}>All employees</option>${employees.map((person) => `<option value="${escapeHtml(person.id)}" ${historyEmployeeFilter === person.id ? 'selected' : ''}>${escapeHtml(person.name)} · ${escapeHtml(person.id)}</option>`).join('')}</select></label>
    <label for="history-month-filter">Payroll month<select id="history-month-filter" data-history-filter="month"><option value="all" ${historyMonthFilter === 'all' ? 'selected' : ''}>All months</option>${months.map((month) => `<option value="${escapeHtml(month)}" ${historyMonthFilter === month ? 'selected' : ''}>${escapeHtml(displayMonth(month))}</option>`).join('')}</select></label>
  </div>` : '';
  const historyActions = isAdmin ? '<button class="primary-button" type="button" data-add-payment>＋ Add payment record</button><button class="secondary-button" type="button" data-print-report="payments">Print records</button>' : '';
  return `${pageHead('Payment history', isAdmin ? 'Historical payment records for all employees · MAD.' : 'Previous monthly payments · MAD.', historyActions)}${illustrativeBanner()}
    <section class="panel table-panel"><div class="panel-head"><h2>${isAdmin ? 'Company payment records' : 'Monthly payment records'}</h2><span>${isAdmin ? `${visiblePayments.length} records` : `${periodCount} months`}</span></div>
      ${filters}${rows ? `<div class="table-wrap"><table><thead><tr><th>Pay period</th>${isAdmin ? '<th>Employee</th>' : ''}<th>Paid on</th><th>Days</th><th>Gross pay</th><th>Avance</th><th>Net paid</th><th>Status</th>${isAdmin ? '<th>Actions</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty-state">No payment records match these filters.</div>'}
      <div class="panel-body"><p class="notice-line">These historical amounts are illustrative. Ask your payroll administrator for official payment statements.</p></div>
    </section>
    <section class="panel table-panel"><div class="panel-head"><h2>Monthly attendance totals</h2><span>${visibleAttendanceMonths.length} employee-months</span></div>
      ${attendanceRows ? `<div class="table-wrap"><table><thead><tr><th>Month</th>${isAdmin ? '<th>Employee</th>' : ''}<th>Days worked</th><th>Days absent</th><th>Days recorded</th></tr></thead><tbody>${attendanceRows}</tbody></table></div>` : '<div class="empty-state">No daily attendance has been recorded for these months.</div>'}
      <div class="panel-body"><p class="notice-line">Days worked counts dates marked Present; dates marked Absent are listed separately. Unmarked dates are not included.</p></div>
    </section>`;
}

function attendanceTotals(records) {
  const present = records.filter((entry) => entry.status === 'present').length;
  return { present, absent: records.length - present };
}

function attendanceView() {
  const presentCount = attendanceRecords.filter((record) => record.status === 'present').length;
  const absentCount = attendanceRecords.filter((record) => record.status === 'absent').length;
  const unmarkedCount = attendanceRecords.filter((record) => record.active !== false && !record.status).length;
  const visibleIds = new Set(attendanceRecords.map((record) => record.employeeId));
  const monthTotals = attendanceTotals(attendanceMonthRecords.filter((entry) => visibleIds.has(entry.employeeId)));
  const monthLabel = displayMonth(attendanceDate.slice(0, 7));
  const rows = attendanceRecords.map((record) => {
    const status = record.status || 'unmarked';
    const personTotals = attendanceTotals(attendanceMonthRecords.filter((entry) => entry.employeeId === record.employeeId));
    return `<tr ${employeeRowDetailsAttributes(record.employeeId, record.name)}>
      <td><div class="person-cell"><span class="avatar" style="background:${escapeHtml(record.color)}">${escapeHtml(initials(record.name))}</span><div>${employeeNameLink(record.employeeId, record.name)}<small>${escapeHtml(record.employeeId)} · ${escapeHtml(record.department)}${record.active === false ? ` · Inactive since ${escapeHtml(displayDate(record.inactiveSince))}` : ''}</small></div></div></td>
      <td><div class="attendance-actions" role="group" aria-label="Attendance for ${escapeHtml(record.name)}">
        <button class="attendance-choice present ${status === 'present' ? 'active' : ''}" type="button" data-attendance-status="present" data-employee-id="${escapeHtml(record.employeeId)}" aria-pressed="${status === 'present'}" ${record.active === false ? 'disabled' : ''}>Present</button>
        <button class="attendance-choice absent ${status === 'absent' ? 'active' : ''}" type="button" data-attendance-status="absent" data-employee-id="${escapeHtml(record.employeeId)}" aria-pressed="${status === 'absent'}" ${record.active === false ? 'disabled' : ''}>Absent</button>
        ${status === 'absent' ? `<input class="absence-reason" type="text" data-absence-reason data-employee-id="${escapeHtml(record.employeeId)}" maxlength="200" value="${escapeHtml(record.absenceReason || '')}" placeholder="Reason for absence" aria-label="Reason for ${escapeHtml(record.name)}'s absence" />` : ''}
      </div></td>
      <td><span class="attendance-month-stat"><strong>${personTotals.present}</strong> present · <strong>${personTotals.absent}</strong> absent</span></td>
      <td><button class="row-action" type="button" data-attendance-history data-employee-id="${escapeHtml(record.employeeId)}" aria-haspopup="dialog" aria-label="View or edit past attendance for ${escapeHtml(record.name)}">Past days ▾</button></td>
    </tr>`;
  }).join('');
  const today = dateInputValue(new Date());
  return `${pageHead('Attendance', 'Daily attendance records for the team.')}${illustrativeBanner()}
    <section class="attendance-summary" aria-label="Attendance totals">
      <article><strong>${countable(presentCount, 'int')}</strong><span>Present on ${escapeHtml(displayDate(attendanceDate))}</span><small>${monthTotals.present} present days in ${escapeHtml(monthLabel)}</small></article>
      <article><strong>${countable(absentCount, 'int')}</strong><span>Absent on ${escapeHtml(displayDate(attendanceDate))}</span><small>${monthTotals.absent} absent days in ${escapeHtml(monthLabel)}</small></article>
      <article><strong>${countable(unmarkedCount, 'int')}</strong><span>Not marked on ${escapeHtml(displayDate(attendanceDate))}</span><small>${attendanceRecords.length} employees</small></article>
    </section>
    <section class="panel table-panel"><div class="panel-head"><h2>Employee attendance</h2><span>${attendanceRecords.length} employees</span></div>
      <div class="attendance-toolbar"><div class="attendance-filter" role="group" aria-label="Filter employees by status">${[['all', 'All'], ['active', 'Active Only'], ['inactive', 'Inactive Only']].map(([value, label]) => `<button class="attendance-filter-button ${attendanceStatusFilter === value ? 'active' : ''}" type="button" data-attendance-filter="${value}" aria-pressed="${attendanceStatusFilter === value}">${label}</button>`).join('')}</div><div class="attendance-month-controls"><button class="month-step" type="button" data-attendance-day-shift="-1" aria-label="Previous day" title="Previous day">‹</button><label class="attendance-date-field"><span class="sr-only">Attendance date</span><input id="attendance-date" type="date" value="${escapeHtml(attendanceDate)}" required /></label><button class="month-step" type="button" data-attendance-day-shift="1" aria-label="Next day" title="Next day">›</button><button class="secondary-button" type="button" data-attendance-today ${attendanceDate === today ? 'disabled' : ''}>Today</button></div></div>
      ${attendanceError ? `<div class="empty-state" role="alert">${escapeHtml(attendanceError)}</div>` : rows ? `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Mark attendance</th><th>${escapeHtml(monthLabel)}</th><th><span class="sr-only">Past days</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty-state">No employees match this filter.</div>'}
      <div class="panel-body"><p class="notice-line">Attendance is recorded manually for the selected date. Inactive employees are not required to be marked from their inactive date, and their past records are kept for payroll. Use Past days to review or correct an earlier date. Payroll estimates use recorded attendance.</p></div>
    </section>`;
}

function profile(person) {
  return `${pageHead('My details', 'Your employee information on file.')}${illustrativeBanner()}<section class="panel"><div class="panel-head"><h2>Employment record</h2><span>${escapeHtml(person.id)}</span></div><div class="panel-body"><div class="person-cell" style="margin-bottom:20px"><span class="avatar" style="background:${person.color}">${escapeHtml(initials(person.name))}</span><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.jobTitle || person.role)}</small></div></div><div class="profile-grid"><div class="info-pair"><span>Phone number</span><strong>${escapeHtml(person.phone || 'Not provided')}</strong></div><div class="info-pair"><span>Department</span><strong>${escapeHtml(person.department)}</strong></div><div class="info-pair"><span>Start date</span><strong>${escapeHtml(displayStartMonth(person.startDate))}</strong></div><div class="info-pair"><span>Pay frequency</span><strong>Monthly</strong></div></div></div></section>`;
}

function adminProfile() {
  return `${pageHead('Personal information', 'Administrator account details.')}${illustrativeBanner()}<section class="panel"><div class="panel-head"><h2>Account record</h2><span>Payroll admin</span></div><div class="panel-body"><div class="profile-grid"><div class="info-pair"><span>Name</span><strong>${escapeHtml(currentUser.name)}</strong></div><div class="info-pair"><span>Username</span><strong>${escapeHtml(currentUser.username)}</strong></div><div class="info-pair"><span>Email</span><strong>${escapeHtml(currentUser.email || 'Not provided')}</strong></div><div class="info-pair"><span>Role</span><strong>Administrator</strong></div></div></div></section>`;
}

const jobTitleOptions = ['Cook', 'Vendor', 'Cleaning', 'Driver'];
const departmentOptions = ['Rghayef', 'Boulanger', 'Patisserie', 'Viennoiserie', 'Malah', 'Halwa beldia', 'Cleaning', 'Despacho'];

function categoryOptions(options, current, placeholder) {
  const values = current && !options.some((option) => option.toLowerCase() === String(current).toLowerCase()) ? [...options, current] : options;
  const selected = options.find((option) => option.toLowerCase() === String(current).toLowerCase()) || current;
  return `<option value="" ${selected ? '' : 'selected'} disabled>${placeholder}</option>${values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}`;
}

function openEmployeeEditor(employeeId = null) {
  const person = employeeId ? employees.find((employee) => employee.id === employeeId) : null;
  if (employeeId && !person) return;
  const record = person || {
    id: nextEmployeeId(), name: '', phone: '', role: '', department: '',
    startDate: monthInputValue(new Date()), dailyRate: 0, paidDays: 26, avance: 0,
  };
  const isNew = !person;
  const [startYear, startMonth] = (startMonthValue(record.startDate) || monthInputValue(new Date())).split('-');
  const latestYear = Math.max(new Date().getFullYear() + 1, Number(startYear));
  const startYears = Array.from({ length: latestYear - Math.min(latestYear - 40, Number(startYear)) + 1 }, (_, index) => latestYear - index);
  const startMonthOptions = Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, '0');
    const label = new Date(2000, index, 1).toLocaleDateString('en-GB', { month: 'long' });
    return `<option value="${value}" ${value === startMonth ? 'selected' : ''}>${label}</option>`;
  }).join('');
  const startYearOptions = startYears.map((year) => `<option value="${year}" ${String(year) === startYear ? 'selected' : ''}>${year}</option>`).join('');
  const dialog = document.createElement('dialog');
  dialog.className = 'edit-dialog';
  dialog.setAttribute('aria-labelledby', 'employee-editor-title');
  dialog.setAttribute('aria-describedby', 'employee-editor-description');
  dialog.innerHTML = `<form class="edit-form" id="employee-editor">
    <header class="edit-header"><div><span class="eyebrow">Employee record · ${escapeHtml(record.id)}</span><h2 id="employee-editor-title">${isNew ? 'Add employee' : 'Edit employee'}</h2><p>Profile and illustrative monthly compensation</p></div><button class="icon-button" type="button" data-close-edit aria-label="Close editor" title="Close">×</button></header>
    <div class="edit-fields">
      <label>Full name<input name="name" type="text" autocomplete="name" maxlength="80" required value="${escapeHtml(record.name)}" /></label>
      <label>Phone number<span class="phone-entry"><span class="phone-entry-prefix" aria-hidden="true">+212</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="18" required value="${escapeHtml(localMoroccoPhone(record.phone))}" placeholder="6 00 00 00 00" /></span></label>
      <label>Job title / role<select name="role" required>${categoryOptions(jobTitleOptions, record.role, 'Select job title')}</select></label>
      <label>Department<select name="department" required>${categoryOptions(departmentOptions, record.department, 'Select department')}</select></label>
      <label>Start date<span class="date-select"><select name="startMonth" aria-label="Start month" required>${startMonthOptions}</select><select name="startYear" aria-label="Start year" required>${startYearOptions}</select></span></label>
      <label>Rate per paid day <span>MAD</span><input name="dailyRate" type="number" min="0" step="0.01" required value="${Number(record.dailyRate).toFixed(2)}" /></label>
    </div>
    <div class="calculation-note" id="employee-editor-description">Employees sign in with the phone number shown as their username. New employees receive a one-time password setup link by SMS; administrators cannot view employee passwords.</div>
    <p class="editor-error" role="alert"></p>
    <footer class="edit-footer"><button class="secondary-button" type="button" data-close-edit>Cancel</button><button class="primary-button" type="submit">${isNew ? 'Add employee' : 'Save changes'}</button></footer>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('#employee-editor');
  form.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-edit]')) dialog.close();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      name: form.elements.name.value.trim(),
      phone: moroccoPhone(form.elements.phone.value),
      role: form.elements.role.value.trim(),
      department: form.elements.department.value.trim(),
      startDate: `${form.elements.startYear.value}-${form.elements.startMonth.value}`,
      dailyRate: Number(form.elements.dailyRate.value),
      paidDays: Number(record.paidDays),
      avance: Number(record.avance) || 0,
    };
    const error = form.querySelector('.editor-error');
    error.textContent = '';
    try {
      const result = await api(isNew ? '/api/employees' : `/api/employees/${encodeURIComponent(record.id)}`, {
        method: isNew ? 'POST' : 'PUT',
        body: payload,
      });
      await loadEmployees();
      dialog.close();
      renderApp();
      const notice = isNew && result.resetDelivery === 'console'
        ? 'Employee added. The development reset link is in the server terminal.'
        : isNew ? 'Employee added. Password setup SMS sent.' : 'Employee record updated.';
      showSaveNotice(notice);
    } catch (saveError) {
      error.textContent = saveError.message;
    }
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function confirmDeleteEmployee(employeeId) {
  const person = employees.find((employee) => employee.id === employeeId);
  if (!person) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'edit-dialog';
  dialog.setAttribute('aria-labelledby', 'delete-employee-title');
  dialog.innerHTML = `<form class="edit-form" method="dialog">
    <header class="edit-header"><div><span class="eyebrow">Employee record · ${escapeHtml(person.id)}</span><h2 id="delete-employee-title">Delete ${escapeHtml(person.name)}?</h2><p>This permanently removes the employee, their sign-in, payment records and attendance. It cannot be undone.</p></div></header>
    <p class="editor-error" role="alert"></p>
    <footer class="edit-footer"><button class="secondary-button" type="button" data-close-edit>Cancel</button><button class="primary-button danger-confirm" type="button" data-confirm-delete>Delete employee</button></footer>
  </form>`;
  document.body.append(dialog);
  dialog.addEventListener('click', async (event) => {
    if (event.target.closest('[data-close-edit]')) return dialog.close();
    if (!event.target.closest('[data-confirm-delete]')) return;
    try {
      await api(`/api/employees/${encodeURIComponent(person.id)}`, { method: 'DELETE' });
      await loadEmployees();
      await loadPaymentHistory();
      if (selectedEmployeeId === person.id) selectedEmployeeId = '';
      if (activeView === 'employeeDetails') activeView = 'people';
      if (historyEmployeeFilter === person.id) historyEmployeeFilter = 'all';
      dialog.close();
      renderApp();
      showSaveNotice(`${person.name} deleted.`);
    } catch (deleteError) {
      dialog.querySelector('.editor-error').textContent = deleteError.message;
    }
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function openPaymentEditor(existing = null) {
  if (!employees.length) return showSaveNotice('Add an employee before adding payment records.');
  const first = existing ? employees.find((person) => person.id === existing.employeeId) || employees[0] : employees[0];
  const isEdit = Boolean(existing);
  const dialog = document.createElement('dialog');
  dialog.className = 'edit-dialog';
  dialog.setAttribute('aria-labelledby', 'payment-editor-title');
  dialog.innerHTML = `<form class="edit-form" id="payment-editor">
    <header class="edit-header"><div><span class="eyebrow">Payment history</span><h2 id="payment-editor-title">${isEdit ? 'Edit' : 'Add'} payment record</h2><p>Illustrative past monthly payment</p></div><button class="icon-button" type="button" data-close-edit aria-label="Close editor" title="Close">×</button></header>
    <div class="edit-fields">
      <label>Employee<select name="employeeId" required ${isEdit ? 'disabled' : ''}>${employees.map((person) => `<option value="${escapeHtml(person.id)}" ${person.id === first.id ? 'selected' : ''}>${escapeHtml(person.name)} · ${escapeHtml(person.id)}</option>`).join('')}</select></label>
      <label>Payroll month<input name="month" type="month" required ${isEdit ? 'disabled' : ''} value="${escapeHtml(existing?.month || '2025-01')}" /></label>
      <label>Pay date<input name="payDate" type="date" required value="${escapeHtml(existing?.payDate || '2025-01-31')}" /></label>
      <label>Rate per paid day <span>MAD</span><input name="dailyRate" type="number" min="0" step="0.01" required value="${Number(existing?.dailyRate ?? first.dailyRate).toFixed(2)}" /></label>
      <label>Days worked <span>days</span><input name="paidDays" type="number" min="0" max="31" step="0.5" required value="${existing ? Number(existing.paidDays) : 30}" /></label>
      <label>Avance deduction <span>MAD</span><input name="avance" type="number" min="0" step="0.01" required value="${Number(existing?.avance ?? 0)}" /></label>
      <label>Status<select name="status"><option value="paid" ${existing?.status !== 'unpaid' ? 'selected' : ''}>Paid</option><option value="unpaid" ${existing?.status === 'unpaid' ? 'selected' : ''}>Unpaid</option></select></label>
    </div>
    <section class="edit-preview"><div><span>Gross salary</span><strong data-preview-gross></strong></div><div><span>Avance deduction</span><strong data-preview-deductions></strong></div><div class="preview-net"><span>Net pay</span><strong data-preview-net></strong></div></section>
    <p class="editor-error" role="alert"></p>
    <footer class="edit-footer"><button class="secondary-button" type="button" data-close-edit>Cancel</button><button class="primary-button" type="submit">${isEdit ? 'Save changes' : 'Add record'}</button></footer>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('#payment-editor');
  const updatePreview = () => {
    const gross = Math.round((Number(form.elements.dailyRate.value) || 0) * (Number(form.elements.paidDays.value) || 0));
    const avance = Number(form.elements.avance.value) || 0;
    form.querySelector('[data-preview-gross]').textContent = money(gross);
    form.querySelector('[data-preview-deductions]').textContent = money(avance);
    form.querySelector('[data-preview-net]').textContent = money(gross - avance);
  };
  form.addEventListener('input', updatePreview);
  if (!isEdit) {
    form.elements.employeeId.addEventListener('change', () => {
      const person = employees.find((employee) => employee.id === form.elements.employeeId.value);
      if (person) form.elements.dailyRate.value = Number(person.dailyRate).toFixed(2);
      updatePreview();
    });
    form.elements.month.addEventListener('change', () => {
      const [year, month] = form.elements.month.value.split('-').map(Number);
      if (year && month) form.elements.payDate.value = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    });
  }
  form.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-edit]')) dialog.close();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = form.querySelector('.editor-error');
    error.textContent = '';
    try {
      const url = isEdit
        ? `/api/payment-history/${encodeURIComponent(existing.employeeId)}/${encodeURIComponent(existing.month)}`
        : '/api/payment-history';
      await api(url, {
        method: isEdit ? 'PUT' : 'POST',
        body: {
          employeeId: form.elements.employeeId.value,
          month: form.elements.month.value,
          payDate: form.elements.payDate.value,
          dailyRate: Number(form.elements.dailyRate.value),
          paidDays: Number(form.elements.paidDays.value),
          avance: Number(form.elements.avance.value),
          status: form.elements.status.value,
        },
      });
      await loadPaymentHistory();
      dialog.close();
      renderApp();
      showSaveNotice(isEdit ? 'Payment record updated.' : 'Payment record added.');
    } catch (saveError) {
      error.textContent = saveError.message;
    }
  });
  dialog.addEventListener('close', () => dialog.remove());
  updatePreview();
  dialog.showModal();
}

function showSaveNotice(message) {
  document.querySelectorAll('.save-notice').forEach((existing) => existing.remove());
  const notice = document.createElement('div');
  notice.className = 'save-notice';
  notice.setAttribute('role', 'status');
  const badge = document.createElement('span');
  badge.className = 'save-notice-icon';
  badge.setAttribute('aria-hidden', 'true');
  badge.innerHTML = icon('check');
  const text = document.createElement('span');
  text.textContent = message;
  notice.append(badge, text);
  document.body.append(notice);
  window.setTimeout(() => notice.classList.add('leaving'), 3200);
  window.setTimeout(() => notice.remove(), 3600);
}

function amountInWords(value) {
  const smallWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tensWords = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const belowThousand = (number) => {
    const words = [];
    const hundreds = Math.floor(number / 100);
    const remainder = number % 100;
    if (hundreds) words.push(`${smallWords[hundreds]} hundred`);
    if (remainder < 20 && remainder > 0) words.push(smallWords[remainder]);
    if (remainder >= 20) words.push(`${tensWords[Math.floor(remainder / 10)]}${remainder % 10 ? ` ${smallWords[remainder % 10]}` : ''}`);
    return words.join(' ');
  };
  let remaining = Math.round(Math.max(0, Number(value) || 0));
  if (!remaining) return 'Zero Moroccan Dirhams Only';
  const words = [];
  for (const [scale, label] of [[1000000, 'million'], [1000, 'thousand'], [1, '']]) {
    const group = Math.floor(remaining / scale);
    if (group) words.push(`${belowThousand(group)}${label ? ` ${label}` : ''}`);
    remaining %= scale;
  }
  return `${words.join(' ').replace(/\b\w/g, (character) => character.toUpperCase())} Moroccan Dirhams Only`;
}

function printPayslip(person) {
  const printRoot = document.querySelector('#print-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-root' }));
  printRoot.innerHTML = `<article class="print-sheet">
    <header class="print-heading"><div class="print-company-name">MAISON ROTTERDAM</div><h1>Payslip</h1><p>Payroll statement · MAD</p></header>
    <section class="print-meta">
      <div><span>Date of joining</span><strong>${escapeHtml(displayStartMonth(person.startDate))}</strong></div><div><span>Employee name</span><strong>${escapeHtml(person.name)}</strong></div>
      <div><span>Pay period</span><strong>${escapeHtml(payrollMonthLabel(person))}</strong></div><div><span>Designation</span><strong>${escapeHtml(person.jobTitle || person.role)}</strong></div>
      <div><span>Worked days</span><strong>${person.paidDays} days</strong></div><div><span>Department</span><strong>${escapeHtml(person.department)}</strong></div>
      <div><span>Employee ID</span><strong>${escapeHtml(person.id)}</strong></div><div><span>Pay date</span><strong>${escapeHtml(payrollPayDate(person))}</strong></div>
    </section>
    <table class="print-register"><thead><tr><th>Earnings</th><th>Amount</th><th>Deductions</th><th>Amount</th></tr></thead><tbody>
      <tr><td>Gross monthly salary</td><td>${money(person.gross)}</td><td>Avance</td><td>${money(person.avance)}</td></tr>
      <tr><td>Rate per paid day</td><td>${moneyPrecise(person.dailyRate)}</td><td></td><td></td></tr>
      <tr class="print-totals"><th>Total earnings</th><td>${money(person.gross)}</td><th>Total deductions</th><td>${money(person.avance)}</td></tr>
      <tr class="print-net-row"><th colspan="2">Net pay</th><td colspan="2">${money(netPay(person))}</td></tr>
    </tbody></table>
    <p class="print-words"><span>Net pay in words</span><strong>${amountInWords(netPay(person))}</strong></p>
    <section class="print-signatures"><div><span></span><strong>Employer signature</strong></div><div><span></span><strong>Employee signature</strong></div></section>
    <footer class="print-footer"><strong>This is a system-generated payslip.</strong><p>Illustrative statement only. Avance is the only deduction shown; no statutory payroll calculations are included.</p></footer>
  </article>`;
  const previousTitle = document.title;
  document.title = `Payslip ${person.id} - ${payrollMonthLabel(person)}`;
  document.body.classList.add('printing-payslip');
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-payslip');
    printRoot.replaceChildren();
    document.title = previousTitle;
  }, { once: true });
  window.print();
}

function printReport(kind) {
  const payments = kind === 'payments';
  const visible = paymentHistory.filter((payment) =>
    (historyEmployeeFilter === 'all' || payment.employeeId === historyEmployeeFilter)
      && (historyMonthFilter === 'all' || payment.month === historyMonthFilter));
  const sum = (key) => visible.reduce((total, payment) => total + payment[key], 0);
  const table = payments
    ? `<thead><tr><th>Month</th><th>Employee</th><th>Paid on</th><th>Days</th><th>Gross</th><th>Avance</th><th>Net</th><th>Status</th></tr></thead><tbody>${visible.map((payment) => `<tr><td>${escapeHtml(displayMonth(payment.month))}</td><td>${escapeHtml(payment.employeeName)} (${escapeHtml(payment.employeeId)})</td><td>${escapeHtml(displayDate(payment.payDate))}</td><td>${payment.paidDays}</td><td>${money(payment.gross)}</td><td>${money(payment.avance)}</td><td>${money(payment.net)}</td><td>${payment.status === 'paid' ? 'Paid' : 'Unpaid'}</td></tr>`).join('')}<tr class="print-totals"><th colspan="4">Total</th><td>${money(sum('gross'))}</td><td>${money(sum('avance'))}</td><td>${money(sum('net'))}</td><td></td></tr></tbody>`
    : `<thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Department</th><th>Start date</th><th>Phone</th><th>Rate / day</th></tr></thead><tbody>${employees.map((person) => `<tr><td>${escapeHtml(person.id)}</td><td>${escapeHtml(person.name)}</td><td>${escapeHtml(person.role)}</td><td>${escapeHtml(person.department)}</td><td>${escapeHtml(displayStartMonth(person.startDate))}</td><td>${escapeHtml(person.phone || '—')}</td><td>${moneyPrecise(person.dailyRate)}</td></tr>`).join('')}</tbody>`;
  const title = payments ? 'Payment records' : 'Employee list';
  const printRoot = document.querySelector('#print-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-root' }));
  printRoot.innerHTML = `<article class="print-sheet">
    <header class="print-heading"><div class="print-company-name">MAISON ROTTERDAM</div><h1>${title}</h1><p>${payments ? 'MAD · ' : ''}Printed ${escapeHtml(displayDate(new Date().toISOString().slice(0, 10)))}</p></header>
    <table class="print-list">${table}</table>
    <footer class="print-footer"><p>Illustrative figures only; not statutory Moroccan payroll calculations.</p></footer>
  </article>`;
  const previousTitle = document.title;
  document.title = `Maison Rotterdam - ${title}`;
  document.body.classList.add('printing-payslip');
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-payslip');
    printRoot.replaceChildren();
    document.title = previousTitle;
  }, { once: true });
  window.print();
}

function createPayslipPdf(person) {
  const pageHeight = 842;
  const commands = [];
  const navy = '0.133 0.161 0.263';
  const ink = '0.114 0.141 0.200';
  const muted = '0.333 0.365 0.435';
  const beige = '0.965 0.922 0.871';
  const pale = '0.906 0.910 0.929';
  const safeText = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
  const text = (value, x, top, size = 9, bold = false, color = ink) => {
    const content = safeText(value).replace(/[\\()]/g, '\\$&');
    commands.push(`${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(pageHeight - top).toFixed(2)} Tm (${content}) Tj ET`);
  };
  const centeredText = (value, centerX, top, size = 9, bold = false, color = ink) => {
    const safe = safeText(value);
    const width = safe.length * size * (bold ? 0.55 : 0.5);
    text(safe, centerX - width / 2, top, size, bold, color);
  };
  const rightText = (value, rightX, top, size = 9, bold = false, color = ink) => {
    const safe = safeText(value);
    const width = safe.length * size * (bold ? 0.55 : 0.5);
    text(safe, rightX - width, top, size, bold, color);
  };
  const line = (x1, top1, x2, top2, color = '0.420 0.443 0.494', width = 0.6) => {
    commands.push(`${color} RG ${width} w ${x1} ${(pageHeight - top1).toFixed(2)} m ${x2} ${(pageHeight - top2).toFixed(2)} l S`);
  };
  const rectangle = (x, top, width, height, color) => {
    commands.push(`${color} rg ${x} ${(pageHeight - top - height).toFixed(2)} ${width} ${height} re f`);
  };
  const moneyForPdf = (amount, fractionDigits = 0) => `${new Intl.NumberFormat('en-US', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(amount)} MAD`;

  centeredText('MAISON ROTTERDAM', 297.5, 48, 12, true, navy);
  centeredText('PAYSLIP', 297.5, 72, 18, true, navy);
  centeredText('PAYROLL STATEMENT - MAD', 297.5, 88, 8, false, muted);
  line(45, 101, 550, 101, navy, 1.2);

  const metadataTop = 122;
  const metadataBottom = 252;
  const middleX = 297.5;
  line(45, metadataTop, 550, metadataTop, navy);
  line(45, metadataBottom, 550, metadataBottom, navy);
  line(45, metadataTop, 45, metadataBottom, navy);
  line(middleX, metadataTop, middleX, metadataBottom, navy);
  line(550, metadataTop, 550, metadataBottom, navy);
  for (let row = 1; row < 4; row += 1) line(45, metadataTop + row * 32.5, 550, metadataTop + row * 32.5, '0.820 0.827 0.851', 0.4);
  const metadata = [
    ['Date of joining', displayStartMonth(person.startDate), 'Employee name', person.name],
    ['Pay period', payrollMonthLabel(person), 'Designation', person.jobTitle || person.role],
    ['Worked days', `${person.paidDays} days`, 'Department', person.department],
    ['Employee ID', person.id, 'Pay date', payrollPayDate(person)],
  ];
  metadata.forEach((row, index) => {
    const baseline = metadataTop + index * 32.5 + 20;
    text(row[0], 56, baseline, 8, false, muted);
    text(row[1], 139, baseline, 8.5, true, ink);
    text(row[2], 309, baseline, 8, false, muted);
    text(row[3], 386, baseline, 8.5, true, ink);
  });

  const columns = [45, 204, 274, 433, 550];
  const rows = [283, 315, 347, 379, 413, 453];
  rectangle(columns[0], rows[0], columns[4] - columns[0], rows[1] - rows[0], pale);
  rectangle(columns[0], rows[3], columns[4] - columns[0], rows[4] - rows[3], beige);
  rectangle(columns[0], rows[4], columns[4] - columns[0], rows[5] - rows[4], navy);
  for (const column of columns) line(column, rows[0], column, rows[5], '0.333 0.349 0.396', 0.65);
  for (const row of rows) line(columns[0], row, columns[4], row, '0.333 0.349 0.396', 0.65);
  centeredText('EARNINGS', (columns[0] + columns[1]) / 2, 304, 8.5, true, navy);
  centeredText('AMOUNT', (columns[1] + columns[2]) / 2, 304, 8.5, true, navy);
  centeredText('DEDUCTIONS', (columns[2] + columns[3]) / 2, 304, 8.5, true, navy);
  centeredText('AMOUNT', (columns[3] + columns[4]) / 2, 304, 8.5, true, navy);
  text('Gross monthly salary', 52, 336, 8.5);
  rightText(moneyForPdf(person.gross), columns[2] - 7, 336, 8.5, true);
  text('Avance', columns[2] + 7, 336, 8.5);
  rightText(moneyForPdf(person.avance), columns[4] - 7, 336, 8.5, true);
  text('Rate per paid day', 52, 368, 8.5);
  rightText(moneyForPdf(person.dailyRate, 2), columns[2] - 7, 368, 8.5);
  text('Total earnings', 52, 402, 8.5, true, navy);
  rightText(moneyForPdf(person.gross), columns[2] - 7, 402, 8.5, true, navy);
  text('Total deductions', columns[2] + 7, 402, 8.5, true, navy);
  rightText(moneyForPdf(person.avance), columns[4] - 7, 402, 8.5, true, navy);
  text('NET PAY', 57, 438, 11, true, '1 1 1');
  rightText(moneyForPdf(netPay(person)), columns[4] - 8, 438, 11, true, '1 1 1');

  line(45, 476, 550, 476, '0.650 0.667 0.718', 0.7);
  centeredText('NET PAY IN WORDS', 297.5, 493, 7.5, true, muted);
  centeredText(amountInWords(netPay(person)), 297.5, 510, 9, true, navy);
  line(80, 637, 245, 637, muted, 0.7);
  line(350, 637, 515, 637, muted, 0.7);
  centeredText('EMPLOYER SIGNATURE', 162.5, 654, 8, false, ink);
  centeredText('EMPLOYEE SIGNATURE', 432.5, 654, 8, false, ink);
  line(45, 710, 550, 710, '0.820 0.827 0.851', 0.5);
  centeredText('THIS IS A SYSTEM-GENERATED PAYSLIP', 297.5, 729, 8, true, navy);
  centeredText('Illustrative statement only. No statutory payroll calculations are included.', 297.5, 746, 7, false, muted);

  const stream = `${commands.join('\n')}\n`;
  const encoder = new TextEncoder();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

function downloadPayslip(person) {
  const pdf = createPayslipPdf(person);
  const objectUrl = URL.createObjectURL(pdf);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `payslip-${person.id.toLowerCase()}-${person.payrollMonth || '2026-10'}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  showSaveNotice(`Payslip PDF downloaded for ${person.name}.`);
}

async function sendPasswordReset(employeeId) {
  try {
    const result = await api(`/api/employees/${encodeURIComponent(employeeId)}/password-reset`, { method: 'POST', body: {} });
    showSaveNotice(result.message);
  } catch (error) {
    showSaveNotice(error.message);
  }
}

async function togglePaymentStatus(button) {
  const { employeeId, month, paymentStatus } = button.dataset;
  const status = paymentStatus === 'paid' ? 'unpaid' : 'paid';
  try {
    await api(`/api/payment-history/${encodeURIComponent(employeeId)}/${encodeURIComponent(month)}`, {
      method: 'PUT', body: { status },
    });
    const payment = paymentHistory.find((entry) => entry.employeeId === employeeId && entry.month === month);
    if (payment) payment.status = status;
    renderApp();
    showSaveNotice(`Payment marked ${status}.`);
  } catch (error) {
    showSaveNotice(error.message);
  }
}

function applyAttendanceResult(employeeId, date, result) {
  const record = date === attendanceDate ? attendanceRecords.find((entry) => entry.employeeId === employeeId) : null;
  if (record) {
    record.status = result.status;
    record.absenceReason = result.absenceReason;
  }
  if (date.slice(0, 7) === attendanceDate.slice(0, 7)) {
    const monthRecord = attendanceMonthRecords.find((entry) => entry.employeeId === employeeId && entry.date === date);
    if (monthRecord) monthRecord.status = result.status;
    else attendanceMonthRecords.push({ employeeId, date, status: result.status });
  }
  return record;
}

async function setAttendanceStatus(button) {
  const { employeeId, attendanceStatus } = button.dataset;
  const absenceReason = attendanceStatus === 'absent'
    ? button.closest('tr').querySelector('[data-absence-reason]')?.value || ''
    : '';
  try {
    const result = await api(`/api/attendance/${encodeURIComponent(employeeId)}/${encodeURIComponent(attendanceDate)}`, {
      method: 'PUT', body: { status: attendanceStatus, absenceReason },
    });
    const record = applyAttendanceResult(employeeId, attendanceDate, result);
    renderApp();
    showSaveNotice(`${record?.name || 'Employee'} marked ${result.status}.`);
  } catch (error) {
    showSaveNotice(error.message);
  }
}

async function saveAbsenceReason(input) {
  const record = attendanceRecords.find((entry) => entry.employeeId === input.dataset.employeeId);
  if (!record) return;
  try {
    const result = await api(`/api/attendance/${encodeURIComponent(record.employeeId)}/${encodeURIComponent(attendanceDate)}`, {
      method: 'PUT', body: { status: 'absent', absenceReason: input.value },
    });
    record.absenceReason = result.absenceReason;
    showSaveNotice('Absence reason saved.');
  } catch (error) {
    showSaveNotice(error.message);
  }
}

async function changeAttendanceDate(date) {
  attendanceDate = date;
  attendanceRecords = [];
  attendanceMonthRecords = [];
  try { await loadAttendance(); } catch (error) { attendanceError = error.message; }
  renderApp();
}

async function changeAttendanceFilter(filter) {
  attendanceStatusFilter = filter;
  await changeAttendanceDate(attendanceDate);
}

async function toggleEmployeeStatus(employeeId) {
  const person = employees.find((employee) => employee.id === employeeId);
  if (!person) return;
  const active = person.active === false;
  try {
    const result = await api(`/api/employees/${encodeURIComponent(employeeId)}/status`, {
      method: 'PUT', body: { active, inactiveSince: dateInputValue(new Date()) },
    });
    Object.assign(person, result.employee);
    renderApp();
    showSaveNotice(`${person.name} marked ${active ? 'active' : 'inactive'}.`);
  } catch (error) {
    showSaveNotice(error.message);
  }
}

function shiftAttendanceDay(offset) {
  const [year, month, day] = attendanceDate.split('-').map(Number);
  changeAttendanceDate(new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10));
}

async function openAttendanceHistory(employeeId) {
  const person = attendanceRecords.find((entry) => entry.employeeId === employeeId);
  if (!person) return;
  let month = attendanceDate.slice(0, 7);
  let selected = attendanceDate;
  let monthRecords = [];
  let day = { status: null, absenceReason: '' };
  let message = '';
  const dialog = document.createElement('dialog');
  dialog.className = 'edit-dialog attendance-history-dialog';
  dialog.setAttribute('aria-labelledby', 'attendance-history-title');
  document.body.append(dialog);

  const load = async () => {
    const [monthResult, dayResult] = await Promise.all([
      api(`/api/attendance?date=${encodeURIComponent(`${month}-01`)}`),
      api(`/api/attendance?date=${encodeURIComponent(selected)}`),
    ]);
    monthRecords = monthResult.monthAttendance.filter((entry) => entry.employeeId === employeeId);
    const entry = dayResult.attendance.find((item) => item.employeeId === employeeId);
    day = { status: entry?.status || null, absenceReason: entry?.absenceReason || '' };
  };

  const render = () => {
    const [year, monthNumber] = month.split('-').map(Number);
    const offset = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const byDay = new Map(monthRecords.map((entry) => [Number(entry.date.slice(-2)), entry.status]));
    const totals = attendanceTotals(monthRecords);
    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((name) => `<span class="calendar-weekday" aria-hidden="true">${name}</span>`).join('');
    const blanks = Array.from({ length: offset }, () => '<span class="calendar-day empty" aria-hidden="true"></span>').join('');
    const buttons = Array.from({ length: daysInMonth }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, '0')}`;
      const status = byDay.get(index + 1) || 'unmarked';
      return `<button class="calendar-day ${status} ${date === selected ? 'selected' : ''}" type="button" data-history-date="${date}" aria-label="${escapeHtml(displayDate(date))}: ${status}" aria-pressed="${date === selected}">${index + 1}</button>`;
    }).join('');
    dialog.innerHTML = `<div class="edit-form">
      <header class="edit-header"><div><span class="eyebrow">Past attendance</span><h2 id="attendance-history-title">${escapeHtml(person.name)}</h2><p>${escapeHtml(person.employeeId)} · ${escapeHtml(person.department)}</p></div><button class="icon-button" type="button" data-close-edit aria-label="Close" title="Close">×</button></header>
      <div class="attendance-history-body">
        <div>
          <div class="attendance-month-controls"><button class="month-step" type="button" data-history-month="-1" aria-label="Previous month" title="Previous month">‹</button><strong>${escapeHtml(displayMonth(month))}</strong><button class="month-step" type="button" data-history-month="1" aria-label="Next month" title="Next month">›</button></div>
          <div class="attendance-calendar"><div class="calendar-grid">${weekdays}${blanks}${buttons}</div></div>
          <p class="attendance-history-totals"><strong>${totals.present}</strong> present · <strong>${totals.absent}</strong> absent this month</p>
        </div>
        <div class="attendance-history-day">
          <strong>${escapeHtml(displayDate(selected))}</strong>
          <span class="attendance-state ${day.status || 'unmarked'}">${day.status === 'present' ? 'Present' : day.status === 'absent' ? 'Absent' : 'Not marked'}</span>
          <div class="attendance-actions" role="group" aria-label="Attendance for ${escapeHtml(displayDate(selected))}">
            <button class="attendance-choice present ${day.status === 'present' ? 'active' : ''}" type="button" data-history-status="present" aria-pressed="${day.status === 'present'}">Present</button>
            <button class="attendance-choice absent ${day.status === 'absent' ? 'active' : ''}" type="button" data-history-status="absent" aria-pressed="${day.status === 'absent'}">Absent</button>
          </div>
          ${day.status === 'absent' ? `<input class="absence-reason" type="text" data-history-reason maxlength="200" value="${escapeHtml(day.absenceReason)}" placeholder="Reason for absence" aria-label="Reason for absence on ${escapeHtml(displayDate(selected))}" />` : ''}
        </div>
      </div>
      <p class="editor-error" role="alert">${escapeHtml(message)}</p>
      <footer class="edit-footer"><button class="secondary-button" type="button" data-close-edit>Done</button></footer>
    </div>`;
  };

  const run = async (action) => {
    message = '';
    try { await action(); } catch (error) { message = error.message; }
    render();
  };

  const save = (status, absenceReason) => run(async () => {
    const result = await api(`/api/attendance/${encodeURIComponent(employeeId)}/${encodeURIComponent(selected)}`, {
      method: 'PUT', body: { status, absenceReason },
    });
    day = { status: result.status, absenceReason: result.absenceReason };
    const existing = monthRecords.find((entry) => entry.date === selected);
    if (existing) existing.status = result.status;
    else monthRecords.push({ employeeId, date: selected, status: result.status });
    applyAttendanceResult(employeeId, selected, result);
    renderApp();
  });

  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-edit]')) return dialog.close();
    const dateButton = event.target.closest('[data-history-date]');
    if (dateButton) {
      selected = dateButton.dataset.historyDate;
      return run(load);
    }
    const monthButton = event.target.closest('[data-history-month]');
    if (monthButton) {
      const [year, monthNumber] = month.split('-').map(Number);
      const target = new Date(Date.UTC(year, monthNumber - 1 + Number(monthButton.dataset.historyMonth), 1));
      month = target.toISOString().slice(0, 7);
      const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      selected = `${month}-${String(Math.min(Number(selected.slice(-2)), lastDay)).padStart(2, '0')}`;
      return run(load);
    }
    const statusButton = event.target.closest('[data-history-status]');
    if (statusButton) {
      const status = statusButton.dataset.historyStatus;
      save(status, status === 'absent' && day.status === 'absent' ? day.absenceReason : '');
    }
  });
  dialog.addEventListener('change', (event) => {
    if (event.target.matches('[data-history-reason]')) save('absent', event.target.value);
  });
  dialog.addEventListener('close', () => dialog.remove());
  render();
  dialog.showModal();
  await run(load);
}

function renderApp() {
  if (!currentUser) return renderHome();
  const views = currentUser.role === 'admin'
    ? { overview, people, payroll, history: paymentHistoryView, attendance: attendanceView, employeeDetails: employeeDetailsView, profile: adminProfile }
    : { payslip: () => payslip(currentEmployee), history: paymentHistoryView, profile: () => profile(currentEmployee) };
  if (!views[activeView]) activeView = currentUser.role === 'admin' ? 'overview' : 'payslip';
  const viewKey = `${activeView}|${selectedEmployeeId}|${payrollMonth}|${attendanceDate.slice(0, 7)}`;
  const isNewView = viewKey !== lastViewKey;
  const viewChanged = !lastViewKey.startsWith(`${activeView}|${selectedEmployeeId}|`);
  lastViewKey = viewKey;
  app.innerHTML = `<div class="app-shell">${sidebar()}<main class="content${isNewView ? ' view-enter' : ''}">${topbar()}${views[activeView]()}</main></div>`;
  if (viewChanged) window.scrollTo({ top: 0, behavior: 'instant' });
  if (isNewView) animateCounters();
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', toggleTheme);
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', async (event) => {
    if (button.tagName === 'A') {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
    }
    activeView = button.dataset.view;
    employeeSearch = '';
    if (activeView === 'attendance') {
      try { await loadAttendance(); } catch (error) { attendanceError = error.message; }
    } else if (activeView === 'history') {
      try { await loadPaymentHistory(); } catch (error) { showSaveNotice(error.message); }
    }
    renderApp();
  }));
  document.querySelectorAll('[data-employee-details]').forEach((button) => button.addEventListener('click', () => {
    openEmployeeDetails(button.dataset.employeeDetails);
  }));
  document.querySelectorAll('[data-employee-row]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input, select, textarea, label, summary')) return;
      openEmployeeDetails(row.dataset.employeeRow);
    });
    row.addEventListener('keydown', (event) => {
      if (event.target !== row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openEmployeeDetails(row.dataset.employeeRow);
    });
  });
  document.querySelector('[data-account-menu-toggle]')?.addEventListener('click', (event) => {
    const trigger = event.currentTarget;
    const panel = trigger.nextElementSibling;
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  });
  document.querySelector('.account-menu-panel')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const trigger = document.querySelector('[data-account-menu-toggle]');
    event.currentTarget.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    trigger?.focus();
  });
  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST', body: {} }); } catch {}
    currentUser = null;
    currentEmployee = null;
    selectedEmployeeId = '';
    employees = [];
    paymentHistory = [];
    attendanceByMonth = [];
    attendanceRecords = [];
    attendanceMonthRecords = [];
    attendanceError = '';
    historyEmployeeFilter = 'all';
    historyMonthFilter = 'all';
    renderHome();
  }));
  document.querySelector('[data-print-current]')?.addEventListener('click', () => printPayslip(currentEmployee));
  document.querySelector('[data-download-current]')?.addEventListener('click', () => downloadPayslip(currentEmployee));
  document.querySelectorAll('[data-print-person]').forEach((button) => button.addEventListener('click', () => {
    const person = employees.find((employee) => employee.id === button.dataset.printPerson);
    if (person) printPayslip(person);
  }));
  document.querySelectorAll('[data-download-person]').forEach((button) => button.addEventListener('click', () => {
    const person = employees.find((employee) => employee.id === button.dataset.downloadPerson);
    if (person) downloadPayslip(person);
  }));
  document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', exportPayroll));
  document.querySelectorAll('[data-print-report]').forEach((button) => button.addEventListener('click', () => printReport(button.dataset.printReport)));
  document.querySelectorAll('[data-edit-person]').forEach((button) => button.addEventListener('click', () => openEmployeeEditor(button.dataset.editPerson)));
  document.querySelectorAll('[data-delete-person]').forEach((button) => button.addEventListener('click', () => confirmDeleteEmployee(button.dataset.deletePerson)));
  document.querySelectorAll('[data-reset-password]').forEach((button) => button.addEventListener('click', () => sendPasswordReset(button.dataset.resetPassword)));
  document.querySelectorAll('[data-payment-status]').forEach((button) => button.addEventListener('click', () => togglePaymentStatus(button)));
  document.querySelectorAll('[data-edit-payment]').forEach((button) => button.addEventListener('click', () => {
    const payment = paymentHistory.find((entry) => entry.employeeId === button.dataset.employeeId && entry.month === button.dataset.month);
    if (payment) openPaymentEditor(payment);
  }));
  document.querySelectorAll('[data-attendance-status]').forEach((button) => button.addEventListener('click', () => setAttendanceStatus(button)));
  document.querySelectorAll('[data-absence-reason]').forEach((input) => input.addEventListener('change', () => saveAbsenceReason(input)));
  document.querySelectorAll('[data-attendance-history]').forEach((button) => button.addEventListener('click', () => openAttendanceHistory(button.dataset.employeeId)));
  document.querySelectorAll('[data-attendance-filter]').forEach((button) => button.addEventListener('click', () => changeAttendanceFilter(button.dataset.attendanceFilter)));
  document.querySelectorAll('[data-toggle-employee-status]').forEach((button) => button.addEventListener('click', () => toggleEmployeeStatus(button.dataset.toggleEmployeeStatus)));
  document.querySelectorAll('[data-attendance-day-shift]').forEach((button) => button.addEventListener('click', () => shiftAttendanceDay(Number(button.dataset.attendanceDayShift))));
  document.querySelector('[data-attendance-today]')?.addEventListener('click', () => changeAttendanceDate(dateInputValue(new Date())));
  document.querySelector('#attendance-date')?.addEventListener('change', (event) => {
    if (event.currentTarget.value) changeAttendanceDate(event.currentTarget.value);
  });
  document.querySelector('#payroll-month')?.addEventListener('change', (event) => {
    payrollMonth = event.currentTarget.value;
    renderApp();
  });
  document.querySelector('[data-mobile-menu-toggle]')?.addEventListener('click', (event) => {
    const toggle = event.currentTarget;
    const navigation = document.querySelector('#main-navigation');
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.setAttribute('aria-label', expanded ? 'Open navigation menu' : 'Close navigation menu');
    navigation?.classList.toggle('open', !expanded);
  });
  document.querySelector('#main-navigation')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const toggle = document.querySelector('[data-mobile-menu-toggle]');
    document.querySelector('#main-navigation')?.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Open navigation menu');
    toggle?.focus();
  });
  document.querySelector('[data-add-employee]')?.addEventListener('click', () => openEmployeeEditor());
  document.querySelector('[data-add-payment]')?.addEventListener('click', () => openPaymentEditor());
  document.querySelectorAll('[data-history-filter]').forEach((select) => select.addEventListener('change', (event) => {
    const { historyFilter } = event.currentTarget.dataset;
    if (historyFilter === 'employeeId') {
      historyEmployeeFilter = event.currentTarget.value;
      historyMonthFilter = 'all';
    } else {
      historyMonthFilter = event.currentTarget.value;
    }
    renderApp();
  }));
  document.querySelector('.search-input')?.addEventListener('input', (event) => {
    const cursor = event.currentTarget.selectionStart;
    employeeSearch = event.currentTarget.value;
    renderApp();
    const input = document.querySelector('.search-input');
    input.focus();
    input.setSelectionRange(cursor, cursor);
  });
}

function exportPayroll() {
  const payrollRegister = activeView === 'payroll';
  const records = payrollRegister ? payrollRecordsForMonth() : employees;
  const columns = payrollRegister
    ? ['Payroll month', 'Employee ID', 'Name', 'Department', 'Rate per day MAD', 'Days worked', 'Gross MAD', 'Avance MAD', 'Net MAD', 'Calculation']
    : ['Employee ID', 'Name', 'Department', 'Rate per day MAD', 'Paid days', 'Gross salary MAD', 'Avance MAD', 'Net salary MAD'];
  const rows = payrollRegister
    ? records.map((person) => [payrollMonth, person.id, person.name, person.department, person.dailyRate, person.paidDays ?? '', person.gross ?? '', person.gross === null ? '' : person.avance, person.gross === null ? '' : person.gross - person.avance, person.source])
    : records.map((person) => [person.id, person.name, person.department, person.dailyRate, person.paidDays, person.gross, person.avance, netPay(person)]);
  const csv = [columns, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `maison-rotterdam-payroll-${payrollRegister ? payrollMonth : 'october-2026'}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function initializeApp() {
  await loadLogo();
  document.addEventListener('pointermove', (event) => {
    const card = event.target.closest?.('.metric, .home-pillars article, .next-run, .net-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }, { passive: true });
  window.addEventListener('scroll', () => {
    const header = document.querySelector('.home-header');
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 24);
    document.querySelector('.home-hero-content')?.style.setProperty('--scroll', String(Math.min(window.scrollY, 800)));
  }, { passive: true });
  document.addEventListener('click', (event) => {
    if (event.target.closest('.account-menu')) return;
    const panel = document.querySelector('.account-menu-panel');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.querySelector('[data-account-menu-toggle]')?.setAttribute('aria-expanded', 'false');
  });
  if (window.location.pathname === '/reset-password') {
    renderPasswordReset(new URLSearchParams(window.location.search).get('token') || '');
    return;
  }
  try {
    const result = await api('/api/me');
    currentUser = result.user;
    activeView = currentUser.role === 'admin' ? 'overview' : 'payslip';
    if (window.location.pathname === '/profile') {
      activeView = 'profile';
      history.replaceState({}, '', '/');
    }
    await loadEmployees();
    await loadPaymentHistory();
    renderApp();
  } catch (error) {
    if (error.status === 401) renderHome();
    else renderUnavailable(error.message);
  }
}

initializeApp();
