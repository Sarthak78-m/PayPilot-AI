# PayPilot AI — Backend Services & API

Backend service layer for PayPilot AI, providing RESTful API route handlers, Supabase database & authentication integrations, Gemini AI intelligence, and PayPal sandbox payments.

## Architecture

* **Framework:** Next.js App Router (Route Handlers) running on port `5000`
* **Database & Auth:** Supabase PostgreSQL with `@supabase/ssr` cookie-based session handling
* **AI Engine:** Google Gemini API via `@google/generative-ai`
* **Payments:** PayPal REST SDK client integration

## Directory Structure

```
backend/
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── health/
│   │       │   └── route.js          # GET /api/health (Database connectivity & health)
│   │       └── auth/
│   │           ├── login/route.js    # POST /api/auth/login
│   │           ├── register/route.js # POST /api/auth/register
│   │           ├── logout/route.js   # POST /api/auth/logout
│   │           └── me/route.js       # GET /api/auth/me
│   ├── lib/
│   │   ├── auth/                     # Session guard & input validation
│   │   ├── gemini/                   # Gemini client integration
│   │   ├── paypal/                   # PayPal client config
│   │   └── supabase/                 # Supabase server & auth client factories
│   └── proxy.js                      # SSR cookie session middleware
├── .env.example
├── jsconfig.json
├── next.config.mjs
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check verifying Supabase connection |
| `POST` | `/api/auth/register` | Register new account with validation & Supabase Auth |
| `POST` | `/api/auth/login` | Authenticate user credentials and establish session |
| `POST` | `/api/auth/logout` | Terminate session and clear auth cookies |
| `GET` | `/api/auth/me` | Fetch active user session and profile data |

## Getting Started

1. Copy `.env.example` to `.env.local` and fill in credentials:
   ```bash
   cp .env.example .env.local
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server (runs on port 5000):
   ```bash
   npm run dev
   ```
