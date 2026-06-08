## Deploying to Netlify via GitHub Actions

This repository includes a GitHub Actions workflow at `.github/workflows/deploy-netlify.yml` that builds the Expo web bundle and deploys it to Netlify on pushes to `main`.

Setup steps (one-time):

1. Create a Netlify site (or get an existing Site ID):
   - In Netlify dashboard create a new site (you can use "Deploy manually" → drag & drop later) and copy the Site ID from Site settings → General → Site information.

2. Create a Netlify personal access token:
   - Go to https://app.netlify.com/user/applications#personal-access-tokens and create a token. Copy it.

3. Add GitHub repository secrets:
   - In your GitHub repo settings → Secrets → Actions add two secrets:
     - `NETLIFY_AUTH_TOKEN` = (the personal access token)
     - `NETLIFY_SITE_ID` = (your Netlify site ID)

4. Push to `main` (or change the workflow branch) — GitHub Actions will run, build the web bundle, and deploy to Netlify.

Notes:
- If your repo's default branch is not `main`, edit `.github/workflows/deploy-netlify.yml` accordingly.
- The workflow uses `npx expo export:web`, which requires the `expo` dependency present in `frontend/package.json`.
- You can test locally by running in the `frontend` folder:
```bash
npx expo export:web --output-dir web-build
npx netlify-cli deploy --dir=web-build --prod --site=YOUR_SITE_ID
```
