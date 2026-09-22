# Backend (AWS Lambda) — source mirror

This folder is a **version-controlled mirror** of the code currently deployed
to the `delivery-tracker-api` Lambda function.

## Important
- This folder is **not built or deployed by Amplify**. Amplify only builds
  the frontend (`src/` → `dist/`). This mirror exists purely so backend
  changes are diffable, reviewable, and versioned like the frontend already is.
- The **live source of truth remains the deployed Lambda package** until we
  set up a real CI/CD pipeline for it. Any change made here must still be
  packaged and deployed to Lambda via the AWS CLI — pushing to `main` does
  **not** auto-deploy this folder.
- `node_modules` is intentionally excluded — regenerate with `npm install`
  from `package.json` (to be added) if running/testing locally.

Last synced from live Lambda: 2026-09-22.
