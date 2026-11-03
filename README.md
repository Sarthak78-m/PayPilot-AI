# PayPilot AI

> AI-Powered Smart Invoicing & Payment Collection Assistant for freelancers and small businesses.

PayPilot AI simplifies billing, automates payment reminders with conversational intelligence, and connects seamlessly to Supabase and PayPal.

---

## Repository Structure

The project is structured into dedicated **Frontend** and **Backend** workspaces:

```
PayPilot-AI/
├── backend/                  # Next.js API service, Auth, Supabase, Gemini AI, PayPal
│   ├── src/
│   │   ├── app/api/          # RESTful Route Handlers (/api/health, /api/auth/*)
│   │   ├── lib/              # Database, AI, Auth & Payment integrations
│   │   └── proxy.js          # SSR session middleware
│   ├── .env.example
│   ├── package.json
│   └── README.md             # Backend setup & API documentation
│
├── frontend/                 # Next.js Client & Soft-Shadow Neumorphic UI
│   ├── src/
│   │   ├── app/              # App router pages & Neumorphic Design System showcase
│   │   └── components/ui/    # Reusable Neumorphic UI component library
│   ├── public/               # Static assets & icons
│   ├── package.json
│   └── README.md             # Frontend setup & Design System guide
│
├── .env.example              # Global environment variables template
├── .gitignore
├── package.json              # Root workspace coordinator scripts
└── README.md
```

---

## Quick Start

### 1. Configure Environment Variables

```bash
cp backend/.env.example backend/.env.local
```

Fill in your configuration:
* `NEXT_PUBLIC_SUPABASE_URL`
* `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
* `SUPABASE_SECRET_KEY`
* `GEMINI_API_KEY`
* `PAYPAL_CLIENT_ID`
* `PAYPAL_CLIENT_SECRET`

### 2. Run the Services

You can run both services via root scripts or directly within each directory:

#### Run from root:
```bash
# Start Backend (port 5000)
npm run dev:backend

# Start Frontend (port 3000)
npm run dev:frontend
```

#### Run individually:
```bash
# Backend (port 5000)
cd backend
npm install
npm run dev

# Frontend (port 3000)
cd frontend
npm install
npm run dev
```

* **Frontend:** [http://localhost:3000](http://localhost:3000)
* **Design System Showcase:** [http://localhost:3000/design-system](http://localhost:3000/design-system)
* **Backend Health Check:** [http://localhost:5000/api/health](http://localhost:5000/api/health)
