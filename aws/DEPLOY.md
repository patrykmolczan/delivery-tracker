# Delivery Tracker — AWS Phase 1 Deployment Guide

## Overview

Phase 1 replaces **Vercel** with **AWS Amplify** (frontend) + **AWS Lambda + API Gateway** (backend).
Supabase remains the database and auth backend for now (Phase 2 migrates that to RDS + Cognito).

---

## Part A: Deploy the Frontend (AWS Amplify)

### Step 1 — Create the Amplify App

1. Go to **AWS Console → AWS Amplify**
2. Click **"Create new app"**
3. Choose **"Deploy from GitHub"** → Authorize GitHub → Select repo `delivery-tracker`, branch `main`
4. Amplify auto-detects the `amplify.yml` at the repo root — confirm settings:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
5. Click **"Next"** → **"Save and deploy"**

### Step 2 — Set Environment Variables in Amplify

In Amplify Console → your app → **"Environment variables"**, add:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://slgtojndmckisjdplhcs.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1...` (your anon key) |
| `VITE_OPENAI_API_KEY` | your OpenAI key |
| `VITE_API_BASE_URL` | *(leave blank for now — set after Part B)* |

After setting env vars, trigger a **"Redeploy"** so they take effect.

### Step 3 — Configure SPA Routing (critical — React Router needs this)

In Amplify Console → your app → **"Rewrites and redirects"**, add:

| Source | Target | Type |
|---|---|---|
| `/<*>` | `/index.html` | `200 (Rewrite)` |

This ensures React Router handles all routes instead of Amplify returning 404.

### Step 4 — Note your Amplify URL

Your app will be available at: `https://main.XXXXXXXX.amplifyapp.com`
(You'll use this as `AppUrl` in Part B and update `VITE_API_BASE_URL` after Part B.)

---

## Part B: Deploy the Lambda API (AWS SAM)

### Prerequisites

Use **AWS CloudShell** (available right in the AWS Console — no local setup needed):
1. In AWS Console, click the **CloudShell** icon (terminal icon in top nav bar)
2. CloudShell has AWS CLI + SAM CLI pre-installed

### Step 1 — Clone the repo in CloudShell

```bash
git clone https://github.com/patrykmolczan/delivery-tracker.git
cd delivery-tracker
npm ci
```

### Step 2 — Build the Lambda functions

```bash
cd aws
sam build --template template.yaml --use-container
```

> If `--use-container` fails (Docker not available in CloudShell), use:
> ```bash
> sam build --template template.yaml
> ```

### Step 3 — Deploy

```bash
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name delivery-tracker-api \
  --capabilities CAPABILITY_IAM \
  --region us-east-2 \
  --parameter-overrides \
    SupabaseUrl="https://slgtojndmckisjdplhcs.supabase.co" \
    SupabaseAnonKey="YOUR_ANON_KEY" \
    SupabaseServiceRoleKey="YOUR_SERVICE_ROLE_KEY" \
    OpenAIKey="YOUR_OPENAI_KEY" \
    ResendApiKey="re_cAqcX4wb_..." \
    AppUrl="https://main.XXXXXXXX.amplifyapp.com" \
    NotificationSecret="your-random-secret-string"
```

### Step 4 — Get the API Gateway URL

After deploy completes, the output shows:
```
Outputs:
  ApiGatewayUrl  =  https://XXXXXXXXXX.execute-api.us-east-2.amazonaws.com
```

Copy this URL.

### Step 5 — Update Amplify with the API URL

Back in Amplify Console → Environment variables:
- Set `VITE_API_BASE_URL` = the API Gateway URL from above (no trailing slash)

Trigger another **Redeploy** in Amplify.

---

## Part C: Verify the Deployment

Test these in order:

1. **Login** — navigate to your Amplify URL, log in with credentials
2. **Forgot password** — test password reset email flow
3. **Create project** — create a test project
4. **AI chat** — open AI Insights tab, send a message
5. **Template analysis** — upload a template file and analyze
6. **Email notification** — update a project status with notifications enabled

---

## Current State After Phase 1

| Layer | Where |
|---|---|
| Frontend | AWS Amplify (GitHub auto-deploy) |
| API / Serverless | AWS Lambda + API Gateway (us-east-2) |
| Database | Supabase PostgreSQL (unchanged) |
| Auth | Supabase Auth (unchanged) |
| Realtime | Supabase Realtime WebSocket (unchanged) |
| Email | Resend (unchanged) |
| Old Vercel deployment | Still running — safe fallback |

---

## Phase 2 (Next Steps)

- **Database:** Migrate Supabase PostgreSQL → Amazon RDS PostgreSQL using the pg_dump file
- **Auth:** Migrate Supabase Auth → Amazon Cognito (biggest lift — 3-5 days)
- **Realtime:** Supabase Realtime → API Gateway WebSocket API
- **Email:** Resend → Amazon SES
- **Storage:** Supabase Storage → Amazon S3
