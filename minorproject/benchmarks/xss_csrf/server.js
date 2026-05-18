const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const port = 8080;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser('secret-key'));
app.use(express.static(path.join(__dirname, 'public')));

let profile = {
  name: 'Admin',
  email: 'admin@atlas-workspace.test',
  role: 'Workspace Owner',
  company: 'Atlas Creative Group',
};

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Atlas Workspace</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark">A</span>
      <span>Atlas Workspace</span>
    </a>
    <nav>
      <a href="/">Profile</a>
      <a href="/search?q=reports">Search</a>
      <a href="/search?q=team">Team</a>
    </nav>
    <div class="account-pill">${profile.name}</div>
  </header>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

app.get('/search', (req, res) => {
  const query = req.query.q || '';
  res.send(
    page(
      'Search',
      `<section class="page-heading">
        <p class="eyebrow">Workspace search</p>
        <h1>Search results</h1>
        <p>Find documents, messages, and workspace resources from one place.</p>
      </section>
      <section class="search-shell">
        <form class="search-form" action="/search" method="GET">
          <div class="field">
            <label for="q">Search query</label>
            <input id="q" type="text" name="q" value="${query}" placeholder="Try reports, invoices, or team">
          </div>
          <button type="submit">Search</button>
        </form>
        <article class="card result-card">
          <span class="label">Current query</span>
          <h2>${query || 'All workspace items'}</h2>
          <p class="muted">Showing the most relevant workspace matches.</p>
        </article>
        <div class="result-list">
          <article>
            <h3>Quarterly planning notes</h3>
            <p class="muted">Project notes and next steps for the operations team.</p>
          </article>
          <article>
            <h3>Client onboarding checklist</h3>
            <p class="muted">Shared checklist for new customer workspace setup.</p>
          </article>
        </div>
      </section>`
    )
  );
});

app.get('/', (req, res) => {
  res.send(
    page(
      'Profile',
      `<section class="hero">
        <div>
          <p class="eyebrow">Workspace profile</p>
          <h1>Welcome back, ${profile.name}.</h1>
          <p>Keep your workspace identity, contact details, and team preferences up to date.</p>
          <div class="hero-actions">
            <a class="button" href="#profile-settings">Update Profile</a>
            <a class="button secondary" href="/search?q=reports">Search Workspace</a>
          </div>
        </div>
        <aside class="profile-card">
          <span>Signed in as</span>
          <strong>${profile.name}</strong>
          <small>${profile.role}</small>
        </aside>
      </section>

      <section class="grid">
        <article class="card">
          <p class="eyebrow">Account details</p>
          <h2>Profile summary</h2>
          <div class="details">
            <div class="detail-row">
              <span class="muted">Name</span>
              <strong>${profile.name}</strong>
            </div>
            <div class="detail-row">
              <span class="muted">Email</span>
              <strong>${profile.email}</strong>
            </div>
            <div class="detail-row">
              <span class="muted">Company</span>
              <strong>${profile.company}</strong>
            </div>
          </div>
        </article>

        <article id="profile-settings" class="card">
          <p class="eyebrow">Settings</p>
          <h2>Edit profile</h2>
          <form action="/update-profile" method="POST">
            <div class="field">
              <label for="name">Name</label>
              <input id="name" type="text" name="name" value="${profile.name}">
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="text" name="email" value="${profile.email}">
            </div>
            <button type="submit">Save Changes</button>
          </form>
        </article>
      </section>`
    )
  );
});

app.post('/update-profile', (req, res) => {
  profile.name = req.body.name;
  profile.email = req.body.email;
  res.send(
    page(
      'Profile Updated',
      `<section class="page-heading">
        <p class="eyebrow">Profile saved</p>
        <h1>Your changes have been saved.</h1>
        <p>The updated profile information is now visible across your workspace.</p>
      </section>
      <div class="notice">
        <strong>Profile updated successfully.</strong>
        <a class="button" href="/">Return to Profile</a>
      </div>`
    )
  );
});

app.listen(port, () => {
  console.log(`Atlas Workspace benchmark app listening at http://localhost:${port}`);
});
