# MeshReality API

Clear, scalable backend for MeshReality. Built with **Node 20+**, **TypeScript 5**, **Express 4**, **Prisma 6**, and **Supabase** auth.

## Structure

```
src/
├── config/          # Env, Supabase client
├── lib/             # Prisma client
├── types/           # Shared types, API response helpers
├── errors/          # AppError, error codes
├── middleware/      # Auth, subscription, CORS, error handler
├── services/        # Business logic (auth, user, model, subscription, comment, job)
├── routes/          # HTTP handlers + Zod validation
├── app.ts           # Express app factory
└── server.ts        # Server start, shutdown
```

## Setup

1. **Node 20+**
2. Copy `.env.example` to `.env` and set:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL` (Supabase Postgres)
   - `CORS_ORIGIN` (comma-separated)
3. Install and generate:

   ```bash
   npm install
   npm run prisma:generate
   npm run prisma:migrate
   ```

   **Windows:** If `prisma generate` fails with `EBUSY` (file locked), close other terminals and IDEs, then run `npm run prisma:generate` again, or use a global Prisma: `npm i -g prisma@6` and run `prisma generate` from the project folder.

   **P1001 (Can't reach database):** (1) Use **Session mode** connection string (port 6543) from Supabase → Settings → Database. (2) Add `?sslmode=require&connect_timeout=30` to the end of `DATABASE_URL`. (3) If it still fails (e.g. firewall/VPN blocking outbound DB ports), create the tables from your browser: open **Supabase Dashboard → SQL Editor**, paste and run the contents of **`prisma/init-supabase.sql`**. Then you can run the app without `prisma migrate`; run `prisma migrate dev` later from a network that can reach Supabase.

4. Run:

   ```bash
   npm run dev
   ```

## API

- **Auth:** `POST /api/auth/login`, `POST /api/auth/firebase-login` (body: `access_token` or `token`); `GET/PUT /api/auth/me` (Bearer).
- **Models:** `GET/POST /api/models`, `GET/PUT/DELETE /api/models/:id`, `GET /api/models/community`, `GET /api/models/user/:userId`, `POST /api/models/generate`, `GET /api/models/jobs/:jobId`.
- **Subscriptions:** `GET /api/subscriptions/me`, `POST /api/subscriptions`, `PUT /api/subscriptions/usage`, `POST /api/subscriptions/cancel`.
- **Comments:** `GET /api/comments/model/:modelId`, `POST /api/comments/model/:modelId`, `PUT/DELETE /api/comments/:id`.

Responses: `{ data: T }` or `{ error: { code, message } }`. Dev mock user: `Authorization: Bearer mock-id-token`.

## Google OAuth – fix "redirect_uri_mismatch" (Error 400)

Sign-in uses **Supabase** for Google OAuth. Google must allow Supabase’s callback URL.

1. **Get your Supabase callback URL**  
   From `SUPABASE_URL` (e.g. `https://abcdefghij.supabase.co`), the redirect URI is:
   ```text
   https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback
   ```
   So if `SUPABASE_URL` is `https://xyzcompany.supabase.co`, use:
   ```text
   https://xyzcompany.supabase.co/auth/v1/callback
   ```

2. **Add it in Google Cloud Console**  
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.  
   - Open the **OAuth 2.0 Client ID** used by Supabase (Web application or the one linked in Supabase Auth providers).  
   - Under **Authorized redirect URIs**, add:
     ```text
     https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback
     ```  
   - Under **Authorized JavaScript origins**, add your app origins (e.g. `http://localhost:3000`, `https://yourdomain.com`).  
   - Save.

3. **Supabase Dashboard**  
   In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **URL Configuration**, ensure **Redirect URLs** includes your frontend callback (e.g. `http://localhost:3000/auth/callback` for local dev). That’s where Supabase sends the user after Google sign-in, not the URI you add in Google.

After adding the Supabase callback URL in Google and saving, try “Sign in with Google” again.

## Stack

- **Runtime:** Node 20+, ESM
- **API:** Express 4, Zod validation
- **DB:** Prisma 6, PostgreSQL (Supabase)
- **Auth:** Supabase Auth (service role)
