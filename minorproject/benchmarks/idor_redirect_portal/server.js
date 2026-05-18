const http = require('http');
const { readFile } = require('fs/promises');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4002);
const PUBLIC_DIR = path.join(__dirname, 'public');

const users = {
  '101': {
    id: '101',
    name: 'Maya Rao',
    email: 'maya.rao@example.com',
    plan: 'Growth Checking',
    balance: '$8,420.10',
    lastLogin: 'May 17, 2026',
  },
  '102': {
    id: '102',
    name: 'Noah Patel',
    email: 'noah.patel@example.com',
    plan: 'Everyday Savings',
    balance: '$14,905.44',
    lastLogin: 'May 16, 2026',
  },
};

const statements = {
  '7001': {
    id: '7001',
    ownerId: '101',
    title: 'April Account Statement',
    account: 'Growth Checking',
    period: 'Apr 1 - Apr 30, 2026',
    amount: '$8,420.10',
    status: 'Ready',
    transactions: [
      ['Apr 03', 'Payroll deposit', '+$3,850.00'],
      ['Apr 08', 'Studio equipment', '-$429.50'],
      ['Apr 19', 'Client transfer', '+$1,200.00'],
      ['Apr 27', 'Utilities', '-$188.34'],
    ],
  },
  '7002': {
    id: '7002',
    ownerId: '101',
    title: 'March Account Statement',
    account: 'Growth Checking',
    period: 'Mar 1 - Mar 31, 2026',
    amount: '$6,987.88',
    status: 'Archived',
    transactions: [
      ['Mar 02', 'Payroll deposit', '+$3,850.00'],
      ['Mar 11', 'Insurance premium', '-$245.00'],
      ['Mar 23', 'Vendor payment', '-$730.15'],
    ],
  },
  '8801': {
    id: '8801',
    ownerId: '102',
    title: 'April Savings Summary',
    account: 'Everyday Savings',
    period: 'Apr 1 - Apr 30, 2026',
    amount: '$14,905.44',
    status: 'Ready',
    transactions: [
      ['Apr 01', 'Opening balance', '$13,980.30'],
      ['Apr 15', 'Interest credit', '+$25.14'],
      ['Apr 20', 'Transfer in', '+$900.00'],
    ],
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getCurrentUser(requestUrl) {
  const requestedUser = requestUrl.searchParams.get('user');
  return users[requestedUser] || users['101'];
}

function page(title, user, body) {
  const userQuery = `?user=${encodeURIComponent(user.id)}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Northstar Online</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/${userQuery}">
      <span class="brand-mark">N</span>
      <span>Northstar Online</span>
    </a>
    <nav>
      <a href="/dashboard${userQuery}">Dashboard</a>
      <a href="/statements${userQuery}">Statements</a>
      <a href="/support${userQuery}">Support</a>
    </nav>
    <div class="user-pill">${escapeHtml(user.name)}</div>
  </header>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

function sendHtml(res, html, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function statementCard(statement, user) {
  return `<article class="card statement-card">
    <div>
      <p class="eyebrow">${escapeHtml(statement.account)}</p>
      <h3>${escapeHtml(statement.title)}</h3>
      <p>${escapeHtml(statement.period)}</p>
    </div>
    <div class="card-actions">
      <span class="status">${escapeHtml(statement.status)}</span>
      <a class="button secondary" href="/statements/${encodeURIComponent(statement.id)}?user=${encodeURIComponent(user.id)}">View</a>
    </div>
  </article>`;
}

function renderHome(user) {
  return page(
    'Welcome',
    user,
    `<section class="hero">
      <div>
        <p class="eyebrow">Personal banking portal</p>
        <h1>Good afternoon, ${escapeHtml(user.name.split(' ')[0])}.</h1>
        <p>Review your balances, statements, and account activity from one secure workspace.</p>
        <div class="hero-actions">
          <a class="button" href="/dashboard?user=${encodeURIComponent(user.id)}">Open Dashboard</a>
          <a class="button secondary" href="/continue?next=https://www.example.com/rewards">Explore Rewards</a>
        </div>
      </div>
      <aside class="balance-panel">
        <span>Available Balance</span>
        <strong>${escapeHtml(user.balance)}</strong>
        <small>${escapeHtml(user.plan)}</small>
      </aside>
    </section>
    <section class="grid">
      <article class="card">
        <h2>Account Snapshot</h2>
        <p class="metric">${escapeHtml(user.balance)}</p>
        <p>Updated after your last login on ${escapeHtml(user.lastLogin)}.</p>
      </article>
      <article class="card">
        <h2>Quick Links</h2>
        <a href="/statements?user=${encodeURIComponent(user.id)}">Monthly statements</a>
        <a href="/support?user=${encodeURIComponent(user.id)}">Message support</a>
        <a href="/continue?next=https://www.example.com/loan-rates">Loan rates</a>
      </article>
    </section>`
  );
}

function renderDashboard(user) {
  const ownedStatements = Object.values(statements).filter((statement) => statement.ownerId === user.id);
  return page(
    'Dashboard',
    user,
    `<section class="page-heading">
      <p class="eyebrow">Overview</p>
      <h1>Your dashboard</h1>
      <p>Manage account documents and recent activity for ${escapeHtml(user.email)}.</p>
    </section>
    <section class="grid three">
      <article class="card">
        <span class="label">Plan</span>
        <strong>${escapeHtml(user.plan)}</strong>
      </article>
      <article class="card">
        <span class="label">Balance</span>
        <strong>${escapeHtml(user.balance)}</strong>
      </article>
      <article class="card">
        <span class="label">Last Login</span>
        <strong>${escapeHtml(user.lastLogin)}</strong>
      </article>
    </section>
    <section class="section">
      <div class="section-title">
        <h2>Recent statements</h2>
        <a href="/statements?user=${encodeURIComponent(user.id)}">View all</a>
      </div>
      ${ownedStatements.map((statement) => statementCard(statement, user)).join('')}
    </section>`
  );
}

function renderStatements(user) {
  const ownedStatements = Object.values(statements).filter((statement) => statement.ownerId === user.id);
  return page(
    'Statements',
    user,
    `<section class="page-heading">
      <p class="eyebrow">Documents</p>
      <h1>Statements</h1>
      <p>Download and review monthly account documents.</p>
    </section>
    <section class="stack">
      ${ownedStatements.map((statement) => statementCard(statement, user)).join('')}
    </section>`
  );
}

function renderStatementDetail(statement, user) {
  const rows = statement.transactions
    .map(
      ([date, description, amount]) => `<tr>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(description)}</td>
        <td class="amount">${escapeHtml(amount)}</td>
      </tr>`
    )
    .join('');

  return page(
    statement.title,
    user,
    `<section class="page-heading">
      <p class="eyebrow">${escapeHtml(statement.account)}</p>
      <h1>${escapeHtml(statement.title)}</h1>
      <p>${escapeHtml(statement.period)}</p>
    </section>
    <section class="document">
      <div class="document-summary">
        <div>
          <span class="label">Statement ID</span>
          <strong>${escapeHtml(statement.id)}</strong>
        </div>
        <div>
          <span class="label">Ending Balance</span>
          <strong>${escapeHtml(statement.amount)}</strong>
        </div>
        <div>
          <span class="label">Status</span>
          <strong>${escapeHtml(statement.status)}</strong>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Date</th><th>Description</th><th>Amount</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
  );
}

function renderSupport(user) {
  return page(
    'Support',
    user,
    `<section class="page-heading">
      <p class="eyebrow">Help desk</p>
      <h1>How can we help?</h1>
      <p>Our support team usually responds within one business day.</p>
    </section>
    <section class="grid">
      <article class="card">
        <h2>Message center</h2>
        <p>Ask about payments, statements, transfers, and account details.</p>
        <a class="button" href="mailto:support@example.com">Email Support</a>
      </article>
      <article class="card">
        <h2>Partner services</h2>
        <p>Visit selected partner services for rewards and rate information.</p>
        <a class="button secondary" href="/continue?next=https://www.example.com/rewards">Continue</a>
      </article>
    </section>`
  );
}

function renderNotFound(user) {
  return page(
    'Not Found',
    user,
    `<section class="page-heading">
      <p class="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>The page may have moved or the link may be outdated.</p>
      <a class="button" href="/?user=${encodeURIComponent(user.id)}">Return Home</a>
    </section>`
  );
}

async function serveStatic(req, res, pathname) {
  if (pathname !== '/styles.css') {
    return false;
  }

  const css = await readFile(path.join(PUBLIC_DIR, 'styles.css'), 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
  res.end(css);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
    const pathname = requestUrl.pathname;

    if (await serveStatic(req, res, pathname)) {
      return;
    }

    if (pathname === '/continue') {
      redirect(res, requestUrl.searchParams.get('next') || '/');
      return;
    }

    const user = getCurrentUser(requestUrl);

    if (pathname === '/') {
      sendHtml(res, renderHome(user));
      return;
    }

    if (pathname === '/dashboard') {
      sendHtml(res, renderDashboard(user));
      return;
    }

    if (pathname === '/statements') {
      sendHtml(res, renderStatements(user));
      return;
    }

    const statementMatch = pathname.match(/^\/statements\/([^/]+)$/);
    if (statementMatch) {
      const statement = statements[decodeURIComponent(statementMatch[1])];
      if (!statement) {
        sendHtml(res, renderNotFound(user), 404);
        return;
      }

      sendHtml(res, renderStatementDetail(statement, user));
      return;
    }

    if (pathname === '/support') {
      sendHtml(res, renderSupport(user));
      return;
    }

    sendHtml(res, renderNotFound(user), 404);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Northstar Online running at http://localhost:${PORT}`);
});
