const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4001);

function page(title, body, activeLink = 'home') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Global Connect Solutions</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <aside class="sidebar">
    <a href="/" class="logo">Global Connect</a>
    <ul class="nav-menu">
      <li class="nav-item">
        <a href="/" class="nav-link ${activeLink === 'home' ? 'active' : ''}">Dashboard</a>
      </li>
      <li class="nav-item">
        <a href="/profile" class="nav-link ${activeLink === 'profile' ? 'active' : ''}">Personnel Directory</a>
      </li>
      <li class="nav-item">
        <a href="/search" class="nav-link ${activeLink === 'search' ? 'active' : ''}">Asset Search</a>
      </li>
    </ul>
  </aside>

  <div class="main-content">
    <header>
      <div class="user-info">
        <span class="badge">Enterprise Account</span>
      </div>
      <div class="header-actions">
        <a href="/go?next=https://partner.globalconnect.test" style="color: var(--secondary); text-decoration: none; font-size: 0.875rem;">External Partner Portal &rarr;</a>
      </div>
    </header>

    <main class="container">
      ${body}
    </main>

    <footer>
      <p>&copy; 2026 Global Connect Solutions. All rights reserved. Registered Enterprise Node.</p>
    </footer>
  </div>
</body>
</html>`;
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    // Intentionally missing security headers for benchmark purposes
  });
  res.end(html);
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  // Serve static CSS
  if (requestUrl.pathname === '/style.css') {
    serveFile(res, path.join(__dirname, 'public', 'style.css'), 'text/css');
    return;
  }

  if (requestUrl.pathname === '/') {
    sendHtml(
      res,
      page(
        'Operational Dashboard',
        `<div class="card">
          <h1>Corporate Dashboard</h1>
          <p>Welcome to the Global Connect centralized operations hub. This portal provides real-time access to distributed enterprise resources and personnel records.</p>
          
          <div class="search-section">
            <h3>Quick Asset Retrieval</h3>
            <p>Locate specific infrastructure components or digital assets across the organizational network.</p>
            <form action="/search" method="GET" class="search-bar">
              <input type="text" name="q" placeholder="Enter asset ID or tag...">
              <button type="submit">Execute Search</button>
            </form>
          </div>
        </div>`,
        'home'
      )
    );
    return;
  }

  if (requestUrl.pathname === '/profile') {
    sendHtml(
      res,
      page(
        'Personnel Directory',
        `<div class="card">
          <h1>Authorized Personnel Directory</h1>
          <p>Accessing verified employee records and departmental contact information.</p>
          <div style="margin-top: 2rem;">
            <p><strong>Status:</strong> Active Session</p>
            <p><strong>Department:</strong> Infrastructure Management</p>
            <hr style="border: 0; border-top: 1px solid var(--border); margin: 2rem 0;">
            <p>To verify external credentials, please use our <a href="/go?next=https://auth.partner-verify.test" style="color: var(--secondary);">Secure Partner Verification Link</a>.</p>
          </div>
        </div>`,
        'profile'
      )
    );
    return;
  }

  if (requestUrl.pathname === '/search') {
    const q = requestUrl.searchParams.get('q') || '';
    sendHtml(
      res,
      page(
        'Asset Search Results',
        `<div class="card">
          <h1>Search Results</h1>
          <p>Query parameters matched for: <strong>${q}</strong></p>
          <div style="background: #f8fafc; padding: 2rem; border-radius: 8px; border: 1px dashed var(--border); text-align: center;">
            <p style="margin: 0;">No matching records found in the primary registry for the specified criteria.</p>
          </div>
          <a href="/" style="display: inline-block; margin-top: 2rem; color: var(--secondary); text-decoration: none;">&larr; Return to Dashboard</a>
        </div>`,
        'search'
      )
    );
    return;
  }

  if (requestUrl.pathname === '/go') {
    const next = requestUrl.searchParams.get('next') || '/';
    // Intentional open redirect for benchmark purposes
    res.writeHead(302, {
      Location: next,
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end(`Establishing connection to: ${next}`);
    return;
  }

  res.writeHead(404);
  res.end('Resource not found');
});

server.listen(PORT, () => {
  console.log(`Global Connect Portal running at http://localhost:${PORT}`);
});
