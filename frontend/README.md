# PayPilot AI — Frontend Client & Neumorphic Design System

Frontend application and soft-shadow neumorphic UI component library for PayPilot AI.

## Highlights

* **Framework:** Next.js App Router (React 19, Tailwind CSS v4)
* **Design Philosophy:** Soft-shadow Neumorphic UI design system with dual light/dark embossed effects, smooth transitions, and accessible interactions.
* **API Proxy:** Configured to automatically proxy `/api/*` requests to the backend server (default: `http://localhost:5000`).

## Directory Structure

```
frontend/
├── public/                     # Static assets (logos, icons)
├── src/
│   ├── app/
│   │   ├── design-system/      # Interactive Neumorphic Component Showcase
│   │   │   └── page.js
│   │   ├── favicon.ico
│   │   ├── globals.css         # Neumorphic tokens, shadows, CSS theme
│   │   ├── layout.js           # Root layout
│   │   └── page.js             # Homepage
│   └── components/
│       └── ui/                 # 13 Reusable Neumorphic Components
│           ├── badge.js
│           ├── button.js
│           ├── card.js
│           ├── checkbox.js
│           ├── divider.js
│           ├── empty-state.js
│           ├── index.js
│           ├── input.js
│           ├── modal.js
│           ├── select.js
│           ├── skeleton.js
│           ├── textarea.js
│           └── tooltip.js
├── eslint.config.mjs
├── jsconfig.json
├── next.config.mjs
└── package.json
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run development server (runs on port 3000):
   ```bash
   npm run dev
   ```
3. Visit the Neumorphic Design System at [http://localhost:3000/design-system](http://localhost:3000/design-system).
