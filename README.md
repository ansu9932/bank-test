# 🏦 Alister Bank — Production Digital Banking Application

> A complete, production-ready digital banking platform built with Node.js, Express, MySQL, and React. Designed for deployment on Hostinger VPS.

![Alister Bank](https://img.shields.io/badge/Alister%20Bank-v1.0.0-c8102e?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat-square)
![React](https://img.shields.io/badge/React-18-blue?style=flat-square)
![MySQL](https://img.shields.io/badge/MySQL-8.0-orange?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

---

## ✨ Features

### 🔐 Security
- JWT authentication with session management
- bcrypt password + PIN hashing
- Rate limiting (auth, OTP, transfer)
- Helmet.js security headers
- CSRF protection, XSS sanitization
- IP tracking, login alerts via email
- Account lockout after 5 failed attempts
- Device fingerprinting

### 🏦 Banking
- Multi-step KYC account opening
- Automated 3-step KYC workflow (cron jobs)
- NEFT / RTGS / IMPS / Internal transfers
- Security PIN for every transfer
- Daily transfer limits
- PDF bank statement generator
- Beneficiary management
- Transaction reference numbers
- Scheduled transfers
- Account freeze/unfreeze

### 👤 User Features
- Complete banking dashboard (Revolut-style dark UI)
- Red gradient account card with balance masking
- Spending analytics with charts
- Notification center
- Support ticket system
- Debit card & cheque book requests
- Profile management

### 🎥 Video KYC
- Browser-based camera recording
- Secure expiring links (5 min)
- Automated workflow with cron jobs

### ⚙️ Admin Panel
- KYC approval/rejection
- Manual credit/debit
- Account freeze/unfreeze
- Fraud detection flags
- Audit logs
- Transaction monitoring
- Support ticket management
- Analytics dashboard

### 📧 Email System (7 templates)
- OTP verification
- KYC under review
- Video KYC invitation
- Account approved + setup link
- Login alerts
- Transfer alerts
- Password reset

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8.0+
- PM2 (for production)

### 1. Clone & Configure

```bash
# Backend setup
cd backend
cp .env.example .env
# Edit .env with your database and SMTP settings

# Install dependencies
npm install
```

### 2. Database Setup

```bash
# Create MySQL database
mysql -u root -p
CREATE DATABASE alister_bank CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Run seed (creates tables + demo data)
npm run seed
```

### 3. Start Backend

```bash
# Development
npm run dev

# Production
pm2 start ../ecosystem.config.js --env production
```

### 4. Frontend Setup

```bash
cd frontend
npm install

# Development
npm run dev

# Production build
npm run build
```

---

## 📁 Project Structure

```
bank-2.0/
├── backend/
│   ├── config/           # Database config
│   ├── controllers/      # Auth, Account, Transaction, Admin
│   ├── jobs/             # KYC workflow cron jobs
│   ├── middleware/        # Auth, Security, Upload, Audit
│   ├── models/           # 14 Sequelize models
│   ├── routes/           # REST API routes
│   ├── services/         # Email service (7 templates)
│   ├── uploads/          # Secure document storage
│   ├── utils/            # Helpers, Logger, Seeder
│   └── server.js         # Express app entry
│
├── frontend/
│   └── src/
│       ├── components/   # AccountCard, Sidebar, Topbar, Layouts
│       ├── pages/
│       │   ├── auth/     # Login, Forgot/Reset Password
│       │   ├── account-opening/  # 5-step KYC form, Video KYC, Setup
│       │   ├── dashboard/        # Home, Transactions, Transfer, Analytics...
│       │   └── admin/            # Dashboard, Users, Transactions, Audit
│       ├── store/        # Redux slices (auth, account, transaction, ui, notification)
│       ├── services/     # Axios API client
│       └── styles/       # Tailwind globals
│
├── ecosystem.config.js   # PM2 config
├── nginx.conf            # Nginx reverse proxy
└── README.md
```

---

## 🌐 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/auth/me` | Get current user |
| POST | `/api/auth/send-otp` | Send OTP to email |
| POST | `/api/auth/verify-otp` | Verify OTP |
| POST | `/api/auth/setup-account` | Complete account setup |
| POST | `/api/auth/forgot-password` | Request reset link |
| POST | `/api/auth/reset-password` | Reset password |
| POST | `/api/auth/change-password` | Change password |

### Account
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/account/open` | Submit KYC application |
| GET  | `/api/account/verify-video-kyc/:token` | Verify video KYC link |
| POST | `/api/account/submit-video-kyc` | Submit video recording |
| GET  | `/api/account/details` | Get account details |
| PUT  | `/api/account/profile` | Update profile |
| POST | `/api/account/request-card` | Request debit card/cheque book |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/transactions` | Get transactions (paginated, filtered) |
| POST | `/api/transactions/transfer` | Initiate transfer |
| GET  | `/api/transactions/download-statement` | PDF statement |
| GET/POST/DELETE | `/api/transactions/beneficiaries` | Manage beneficiaries |
| GET/PUT | `/api/transactions/notifications` | Notifications |
| POST/GET | `/api/transactions/support-tickets` | Support tickets |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Admin login |
| GET  | `/api/admin/dashboard` | Stats & analytics |
| GET  | `/api/admin/users` | List users |
| GET  | `/api/admin/users/:id` | User details |
| POST | `/api/admin/users/:id/approve-kyc` | Approve KYC |
| POST | `/api/admin/users/:id/reject-kyc` | Reject KYC |
| POST | `/api/admin/users/:id/freeze` | Freeze/unfreeze |
| POST | `/api/admin/users/:id/manual-transaction` | Credit/debit |
| GET  | `/api/admin/transactions` | All transactions |
| POST | `/api/admin/transactions/:id/flag` | Flag transaction |
| GET  | `/api/admin/audit-logs` | Audit trail |
| GET/PUT | `/api/admin/tickets` | Support tickets |

---

## 🔑 Demo Credentials

| Role | Username | Password | PIN |
|------|----------|----------|-----|
| User 1 | `arjun_sharma` | `Demo@1234` | `1234` |
| User 2 | `priya_nair` | `Demo@1234` | `1234` |
| Admin | `admin@alisterbank.com` | `Admin@1234` | — |

---

## 🚢 Deployment (Hostinger VPS)

```bash
# 1. Upload project to /var/www/alister-bank

# 2. Install dependencies
cd /var/www/alister-bank/backend && npm install --production
cd /var/www/alister-bank/frontend && npm install && npm run build

# 3. Configure .env
cp backend/.env.example backend/.env
# Fill in DB, SMTP, JWT secrets

# 4. Seed database
cd backend && npm run seed

# 5. Start with PM2
pm2 start /var/www/alister-bank/ecosystem.config.js --env production
pm2 save
pm2 startup

# 6. Configure Nginx
cp nginx.conf /etc/nginx/sites-available/alisterbank
ln -s /etc/nginx/sites-available/alisterbank /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 7. SSL (Let's Encrypt)
certbot --nginx -d alisterbank.com -d www.alisterbank.com
```

---

## 🗄️ Database Models

14 Sequelize models:
`User` · `Account` · `Transaction` · `Beneficiary` · `OTP` · `KYCDocument` · `Session` · `Notification` · `AuditLog` · `AdminUser` · `SecureLink` · `TransferRequest` · `SupportTicket` · `CardRequest`

---

## 🛡️ Security Architecture

- **Transport**: HTTPS/TLS 1.3 (Nginx)
- **Authentication**: JWT + DB session validation
- **Passwords**: bcrypt (12 rounds)
- **OTP**: SHA-256 hashed, 5-minute expiry
- **Secure links**: Crypto random tokens, 5-min expiry
- **Rate limiting**: Auth (10/15min), OTP (5/10min), Transfer (5/min)
- **Headers**: Helmet.js (CSP, HSTS, X-Frame-Options)
- **Input**: XSS sanitization, SQL injection protection (Sequelize ORM)

---

## 📊 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + Tailwind CSS + Framer Motion |
| State | Redux Toolkit |
| Charts | Recharts |
| Backend | Node.js + Express.js |
| Database | MySQL 8 + Sequelize ORM |
| Auth | JWT + bcrypt |
| Email | Nodemailer (SMTP) |
| PDF | PDFKit |
| Upload | Multer |
| Process | PM2 |
| Proxy | Nginx |

---

*© 2024 Alister Bank. SWIFT: ALSTINBB · Built with ❤️*
