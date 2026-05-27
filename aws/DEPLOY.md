# Delivery Tracker — AWS Deployment Guide

## Overview

The application runs fully on AWS:
- **Frontend:** AWS Amplify (React/Vite SPA, auto-deploys from `main`)
- **Backend:** AWS Lambda + API Gateway HTTP API v2 (10 Lambda functions)
- **Auth:** AWS Cognito (PKCE, MS Entra SSO)
- **Database:** Aurora PostgreSQL
- **Storage:** S3
- **Email:** Resend

---

## Part A: Deploy the Frontend (AWS Amplify)

### Step 1 — Create the Amplify App

1. Go to **AWS Console → AWS Amplify**
2. Click **"Create new app"**
3. Choose **"Deploy from GitHub"** → Authorize GitHub → Select repo `delivery-tracker`, branch `main`
4. Amplify auto-detects `amplify.yml` at the repo root — confirm settings:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
5. Click **"Next"** → **"Save and deploy"**

### Step 2 — Set Environment Variables in Amplify

In Amplify Console → your app → **"Environment variables"**, add:

| Variable | Value |
|---|---|
| `VITE_COGNITO_USER_POOL_ID` | e.g. `us-east-2_XXXXXXXXX` |
| `VITE_COGNITO_CLIENT_ID` | your Cognito app client ID |
| `VITE_COGNITO_DOMAIN` | e.g. `https://your-pool.auth.us-east-2.amazoncognito.com` |
| `VITE_AWS_REGION` | `us-east-2` |
| `VITE_API_BASE_URL` | *(set after Part B)* |

After setting env vars, trigger a **"Redeploy"** so they take effect.

### Step 3 — Configure SPA Routing

In Amplify Console → your app → **"Rewrites and redirects"**, add:

| Source | Target | Type |
|---|---|---|
| `/<*>` | `/index.html` | `200 (Rewrite)` |

### Step 4 — Note your Amplify URL

Your app will be at: `https://main.XXXXXXXX.amplifyapp.com`

---

## Part B: Deploy the Lambda API (AWS SAM)

### Prerequisites

Use **AWS CloudShell** (no local setup needed):
1. Click the **CloudShell** icon in the AWS Console top nav
2. CloudShell has AWS CLI + SAM CLI pre-installed

### Step 1 — Clone the repo in CloudShell

```bash
git clone https://github.com/your-org/delivery-tracker.git
cd delivery-tracker
npm ci
```

### Step 2 — Build the Lambda functions

```bash
cd aws
sam build --template template.yaml
```

### Step 3 — Deploy

```bash
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name delivery-tracker-api \
  --capabilities CAPABILITY_IAM \
  --region us-east-2 \
  --parameter-overrides \
    OpenAIKey="YOUR_OPENAI_KEY" \
    ResendApiKey="re_YOUR_RESEND_KEY" \
    AppUrl="https://main.XXXXXXXX.amplifyapp.com" \
    NotificationSecret="$(openssl rand -hex 32)"
```

> **NotificationSecret**: generate a strong random value with `openssl rand -hex 32`.
> Never use the default placeholder.

### Step 4 — Get the API Gateway URL

After deploy completes:
```
Outputs:
  ApiGatewayUrl  =  https://XXXXXXXXXX.execute-api.us-east-2.amazonaws.com
```

### Step 5 — Update Amplify with the API URL

In Amplify Console → Environment variables:
- Set `VITE_API_BASE_URL` = the API Gateway URL (no trailing slash)

Trigger another **Redeploy** in Amplify.

---

## Part C: Verify the Deployment

Test these in order:

1. **Login** — navigate to your Amplify URL, log in with Cognito credentials
2. **Forgot password** — test password reset email flow
3. **Create project** — create a test project
4. **AI chat** — open AI Insights tab, send a message
5. **Template analysis** — upload a template file and analyze
6. **Email notification** — update a project status with notifications enabled

---

## Current Stack

| Layer | Technology |
|---|---|
| Frontend | AWS Amplify (GitHub auto-deploy) |
| API | AWS Lambda + API Gateway HTTP v2 (us-east-2) |
| Database | Aurora PostgreSQL |
| Auth | AWS Cognito (PKCE, MS Entra SSO) |
| Storage | AWS S3 |
| Email | Resend |
