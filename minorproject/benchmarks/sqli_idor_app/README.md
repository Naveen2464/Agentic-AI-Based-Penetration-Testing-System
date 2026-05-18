# Nexus Inventory Management Portal

A Node.js based stock management system built with Express and MySQL. This portal is designed for personnel to manage inventory and view employee profiles.

## Features
- **User Authentication**: Secure access for authorized personnel.
- **Inventory Search**: Real-time filtering of warehouse assets.
- **Employee Profiles**: Internal management of personnel data.

## Deployment Guide

1. **Environment Setup**:
   ```bash
   npm install
   ```

2. **Database Configuration**:
   - Configure the `.env` file with your MySQL credentials.
   - The application handles table initialization and data seeding on the first run.

3. **Launch**:
   ```bash
   npm start
   ```
   The portal will be accessible at `http://localhost:4003`.

---

## Educational Use Case

This application is specifically developed for **Security Awareness Training** and demonstrates common implementation errors:

1. **Authentication Logic**: Explore the login mechanism to understand the importance of query parameterization.
2. **Resource Filtering**: Analyze the search functionality for input validation best practices.
3. **Data Access Control**: Evaluate how the system handles direct object references in the profile management section.

*Note: For internal use and training purposes only. Do not deploy in production environments.*
