# REHMAN PERFUME — Luxury Fragrance E-Commerce Platform

A production-ready, full-stack luxury e-commerce platform built for **Rehman Perfume**, featuring high-performance storefront browsing, real-time inventory management, Cloudinary media storage, Brevo transactional emails, and an administrative control panel.

---

## 🏛️ Architecture Overview

The repository is organized into three clean workspaces:

```
rehman/
├── frontend/     # Customer-facing storefront (React 18 + Vite + Tailwind CSS)
├── admin/        # Staff & management dashboard (React 18 + Vite + Tailwind CSS)
└── backend/      # Core API service (Node.js 20+ Express + MongoDB Atlas + Cloudinary)
```

| Service | Technology Stack | Production Role |
|---|---|---|
| **Storefront** (`frontend/`) | React 18, Vite 5, Tailwind CSS, Zustand | Customer shopping, cart, wishlist, live tracking, auth |
| **Admin Panel** (`admin/`) | React 18, Vite 5, Tailwind CSS, Zustand | Product listings, stock adjustments, order fulfillment, analytics |
| **Backend API** (`backend/`) | Express, Mongoose, Brevo, Cloudinary | Business logic, authentication, payments, transactional email |

---

## 🚀 Quick Start (Local Development)

### 1. Backend Service
```bash
cd backend
npm install
# Copy environment template and populate with your credentials
cp .env.example .env
npm run dev       # Boots API at http://localhost:8000
```

### 2. Storefront
```bash
cd frontend
npm install
npm run dev       # Boots Storefront at http://localhost:5173
```

### 3. Admin Panel
```bash
cd admin
npm install
npm run dev       # Boots Admin at http://localhost:5174
```

---

## 📦 Cloud & Production Integrations

- **Database**: MongoDB Atlas Replica Set (supports atomic transactions and sequential order IDs).
- **Media & File Storage**: Cloudinary (`STORAGE_DRIVER=cloudinary`) with automatic fallback to placeholder photography when no images are uploaded.
- **Transactional Emails**: Brevo API (password reset, verification codes, admin customer messaging).
- **Deployment**:
  - **Frontend & Admin**: Cloudflare Pages (includes SPA `_redirects` configuration).
  - **Backend**: Node.js runtime (Render, Railway, or VPS) with custom domain proxied via Cloudflare DNS.

---

## 🛡️ License & Credits

© 2026 Rehman Perfume. All rights reserved.
