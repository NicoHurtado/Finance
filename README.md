# ☕ Coffee

**Coffee** is a personal finance manager built as an installable PWA. Track your
spending, income, accounts and savings goals from your phone, tablet or desktop —
with a fast, mobile-first interface and a numeric keypad designed for logging
transactions in seconds.

The UI is in Spanish and amounts are handled in Colombian pesos (COP).

## Features

- **Quick transaction entry** — Add expenses and income through a full-screen
  numeric keypad. Pick a category and account, add an optional note, and confirm.
- **Accounts** — Manage multiple account types: debit, credit cards, fixed income
  and investments. Credit cards support credit limit, statement and due dates,
  APR and card network.
- **Categories** — Organize expenses and income into customizable categories with
  icons and colors.
- **Savings goals** — Set targets with optional deadlines and track your progress.
- **Dashboard** — See net worth, key metrics and recent activity at a glance.
- **Analysis** — Visualize your finances with net worth composition, savings
  runway, spending heatmap, recurring subscriptions, category comparisons and
  expense breakdowns.
- **History** — Browse, filter and edit past transactions.
- **PWA** — Installable on mobile and desktop, with offline-friendly UX and a
  home-screen shortcut for quick transaction entry.
- **Secure auth** — Email/password accounts with JWT stored in an httpOnly cookie.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS + [shadcn/ui](https://ui.shadcn.com)
- MongoDB
- Zustand (state), Recharts (charts), Zod (validation), `jose` (JWT)

## Getting started

```bash
npm install
npm run dev
```

Create a `.env.local` file with your MongoDB connection string and JWT secret:

```bash
MONGODB_URI=...
JWT_SECRET=...
```

Then open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev        # start the dev server
npm run build      # production build
npm run start      # run the production build
npm run lint       # lint
npm run typecheck  # type-check
```
