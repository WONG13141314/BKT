# Math Monopoly — Adaptive Learning Serious Game

A web-based multiplayer Monopoly-inspired educational game for Primary School Mathematics, powered by Bayesian Knowledge Tracing (BKT).

## Tech Stack

| Layer          | Technology              |
| -------------- | ----------------------- |
| Frontend       | React, Vite, TypeScript |
| Backend        | Node.js, Express.js     |
| Database       | PostgreSQL              |
| ORM            | Prisma                  |
| Realtime       | Socket.IO               |
| Authentication | JWT                     |

## Getting Started

### Prerequisites

- Node.js >= 18
- PostgreSQL (or use Docker)
- npm >= 9

### Setup

```bash
# Install all dependencies (root, frontend, backend)
npm install

# Copy environment files
cp .env.example .env
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

# Start the database (if using Docker)
docker-compose up -d

# Run Prisma migrations
cd backend && npx prisma migrate dev

# Seed the database
npx prisma db seed

# Start development servers
cd .. && npm run dev
```

## Project Structure

```
math-monopoly/
├── frontend/    # React SPA (Vite + TypeScript)
├── backend/     # Express API + Socket.IO server
└── docs/        # Project documentation
```

## Architecture

- **Monorepo** — Frontend and backend in one repository
- **BKT Engine** — Isolated adaptive learning module (`backend/src/bkt/`)
- **Server-authoritative** — All game state managed server-side
- **Real-time** — Socket.IO for live multiplayer gameplay

## License

This project is part of a Final Year Project (FYP).
