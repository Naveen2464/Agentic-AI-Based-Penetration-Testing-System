require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4003;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database connection pool
let pool;

async function initDb() {
    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'sql12.freesqldatabase.com',
            user: process.env.DB_USER || 'sql12827282',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'sql12827282',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        
        const conn = await pool.getConnection();
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                role VARCHAR(50) DEFAULT 'user',
                secret_note TEXT
            )
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(10, 2)
            )
        `);
        
        const [users] = await conn.query('SELECT COUNT(*) as count FROM users');
        if (users[0].count === 0) {
            await conn.query("INSERT INTO users (username, password, email, role, secret_note) VALUES ('admin', 'admin123', 'admin@example.com', 'admin', 'The flag is CTF{SQLi_Master}')");
            await conn.query("INSERT INTO users (username, password, email, role, secret_note) VALUES ('alice', 'alice123', 'alice@example.com', 'user', 'Internal project code: XP-900')");
            await conn.query("INSERT INTO users (username, password, email, role, secret_note) VALUES ('bob', 'bob123', 'bob@example.com', 'user', 'Shift schedule: Monday to Friday, 9AM-5PM')");
        }
        
        const [products] = await conn.query('SELECT COUNT(*) as count FROM products');
        if (products[0].count === 0) {
            await conn.query("INSERT INTO products (name, description, price) VALUES ('Industrial Drill', 'Heavy duty industrial drill', 450.00)");
            await conn.query("INSERT INTO products (name, description, price) VALUES ('Safety Gear Set', 'Complete helmet and vest set', 85.00)");
            await conn.query("INSERT INTO products (name, description, price) VALUES ('Tool Box', 'Large metal tool organizer', 120.00)");
        }

        conn.release();
    } catch (err) {
        console.error('Database connection error');
    }
}

const header = `
    <nav class="navbar">
        <div class="nav-container">
            <a href="/" class="nav-logo">Nexus Inventory</a>
            <div class="nav-links">
                <a href="/">Home</a>
                <a href="/search">Inventory</a>
                <a href="/profile?id=2">My Profile</a>
            </div>
        </div>
    </nav>
`;

const layout = (title, content) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} | Nexus Inventory</title>
        <link rel="stylesheet" href="/style.css">
    </head>
    <body>
        ${header}
        <main class="container">
            ${content}
        </main>
        <footer class="footer">
            <p>&copy; 2026 Nexus Inventory Management Systems. All rights reserved.</p>
        </footer>
    </body>
    </html>
`;

// Routes

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    
    try {
        const [rows] = await pool.query(query);
        if (rows.length > 0) {
            const user = rows[0];
            res.send(layout('Dashboard', `
                <div class="card">
                    <h1>Welcome Back, ${user.username}</h1>
                    <p class="role-badge">${user.role.toUpperCase()}</p>
                    <p>Access Level: Standard Enterprise</p>
                    <div class="action-buttons">
                        <a href="/profile?id=${user.id}" class="btn">Manage Profile</a>
                        <a href="/search" class="btn secondary">Browse Inventory</a>
                    </div>
                </div>
            `));
        } else {
            res.status(401).send(layout('Error', `
                <div class="card error">
                    <h1>Authentication Failed</h1>
                    <p>The credentials provided do not match our records.</p>
                    <a href="/" class="btn">Try Again</a>
                </div>
            `));
        }
    } catch (err) {
        res.status(500).send(layout('System Error', `
            <div class="card error">
                <h1>Database Connection Error</h1>
                <p>An internal error occurred while processing your request.</p>
            </div>
        `));
    }
});

app.get('/profile', async (req, res) => {
    const userId = req.query.id;
    const query = `SELECT id, username, email, role, secret_note FROM users WHERE id = ?`;
    
    try {
        const [rows] = await pool.query(query, [userId]);
        if (rows.length > 0) {
            const user = rows[0];
            res.send(layout('User Profile', `
                <div class="card">
                    <h1>Personnel Profile</h1>
                    <div class="profile-info">
                        <div class="info-group">
                            <label>Employee ID</label>
                            <span>#00${user.id}</span>
                        </div>
                        <div class="info-group">
                            <label>Username</label>
                            <span>${user.username}</span>
                        </div>
                        <div class="info-group">
                            <label>Contact Email</label>
                            <span>${user.email}</span>
                        </div>
                        <div class="info-group">
                            <label>Organizational Role</label>
                            <span class="role-text">${user.role}</span>
                        </div>
                        <div class="info-group">
                            <label>Internal Reference Note</label>
                            <div class="note-box">${user.secret_note}</div>
                        </div>
                    </div>
                </div>
            `));
        } else {
            res.status(404).send(layout('Not Found', `<h1>Record Not Found</h1>`));
        }
    } catch (err) {
        res.status(500).send(layout('Error', `<h1>Internal Server Error</h1>`));
    }
});

app.get('/search', async (req, res) => {
    const searchTerm = req.query.q || '';
    const query = `SELECT * FROM products WHERE name LIKE '%${searchTerm}%'`;
    
    try {
        const [rows] = await pool.query(query);
        let resultsHtml = rows.map(p => `
            <div class="product-card">
                <h3>${p.name}</h3>
                <p class="price">$${p.price}</p>
                <p class="desc">${p.description}</p>
            </div>
        `).join('');
        
        res.send(layout('Inventory Search', `
            <div class="search-header">
                <h1>Stock Inventory</h1>
                <form action="/search" method="GET" class="search-form">
                    <input type="text" name="q" value="${searchTerm}" placeholder="Enter product name...">
                    <button type="submit">Filter Results</button>
                </form>
            </div>
            <div class="product-grid">
                ${resultsHtml || '<p>No matching assets found in the database.</p>'}
            </div>
        `));
    } catch (err) {
        res.status(500).send(layout('Search Error', `<h1>Unable to retrieve inventory data</h1>`));
    }
});

app.get('/', (req, res) => {
    res.send(layout('Login', `
        <div class="login-wrapper">
            <div class="card login-card">
                <h1>Nexus Inventory Access</h1>
                <p>Authorized Personnel Only</p>
                <form action="/login" method="POST">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" name="username" required>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" name="password" required>
                    </div>
                    <button type="submit" class="btn-block">Sign In</button>
                </form>
            </div>
        </div>
    `));
});

initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Nexus Portal running at http://localhost:${PORT}`);
    });
});
