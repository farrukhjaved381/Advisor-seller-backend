# Seller-Advisor Backend

This is the NestJS backend for the Seller-Advisor Matching Platform. It handles user registration, profiles, matching logic, payments, and emails.

## Prerequisites
- Node.js v18+
- MongoDB (local or cloud)
- npm

## Setup
1. Clone the repo: `git clone <repo-url>`
2. Install dependencies: `npm install`
3. Create `.env` file (see .env.example for template)
4. Run locally: `npm run start:dev`
5. Access API docs: http://localhost:3000/docs
6. Run tests: `npm test`

## Project Structure
- `src/`: Source code
  - `app.module.ts`: Root module
  - `main.ts`: Entry point
- `.env`: Environment variables

## Deployment
- For production, set NODE_ENV=production and deploy to a host (e.g., Vercel, AWS).
- CI/CD via GitHub Actions (setup in later phases).

Updated: Phase 1 - Project Setup Complete.