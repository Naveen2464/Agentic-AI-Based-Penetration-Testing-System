require('dotenv').config();
const mysql = require('mysql2/promise');

async function seed() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        console.log('Successfully connected.');

        // 1. Create Tables
        console.log('Ensuring tables exist...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                role VARCHAR(50) DEFAULT 'user',
                secret_note TEXT
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(10, 2)
            )
        `);

        // 2. Clear existing data (optional, but good for a clean seed)
        console.log('Cleaning existing data...');
        await connection.query('DELETE FROM users');
        await connection.query('DELETE FROM products');

        // 3. Insert Users
        console.log('Inserting sample users...');
        const users = [
            ['admin', 'admin123', 'admin@nexus-logistics.com', 'admin', 'MASTER_KEY: CTF{SQLi_Master_2026}'],
            ['alice_smith', 'alice123', 'a.smith@nexus-logistics.com', 'user', 'Personal Folder Pass: Summer2024!'],
            ['bob_hr', 'bob123', 'hr_bob@nexus-logistics.com', 'user', 'Employee review for Alice is pending.'],
            ['charlie_dev', 'dev_pass', 'charlie@nexus-logistics.com', 'user', 'Development server IP: 192.168.1.45']
        ];

        for (const user of users) {
            await connection.query(
                'INSERT INTO users (username, password, email, role, secret_note) VALUES (?, ?, ?, ?, ?)',
                user
            );
        }

        // 4. Insert Products
        console.log('Inserting sample products...');
        const products = [
            ['Precision Laser Level', 'Industrial grade self-leveling laser for construction.', 299.99],
            ['Safety Harness (XL)', 'Full-body safety harness with shock-absorbing lanyard.', 145.50],
            ['Heavy-Duty Pallet Jack', 'Manual hydraulic pallet jack, 5500 lb capacity.', 420.00],
            ['Digital Multimeter', 'Professional grade true-RMS digital multimeter.', 89.00],
            ['Worker First Aid Kit', 'Comprehensive OSHA-compliant first aid station.', 65.00]
        ];

        for (const product of products) {
            await connection.query(
                'INSERT INTO products (name, description, price) VALUES (?, ?, ?)',
                product
            );
        }

        console.log('Seeding completed successfully!');
    } catch (err) {
        console.error('Error during seeding:', err.message);
        if (err.message.includes('Access denied')) {
            console.error('HINT: Check if your DB_PASSWORD in .env is correct.');
        }
    } finally {
        if (connection) await connection.end();
    }
}

seed();
