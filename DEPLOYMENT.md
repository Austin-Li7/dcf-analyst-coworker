# Deployment Guide

This project is a Next.js app inside a subdirectory. Deploy `dcf-cfp-module/`, not the repository root.

## Recommended: Vercel

1. Go to https://vercel.com/new
2. Import the GitHub repository:
   `Austin-Li7/dcf-analyst-coworker`
3. In project configuration, set:
   - Framework Preset: `Next.js`
   - Root Directory: `dcf-cfp-module`
   - Install Command: `npm install`
   - Build Command: `npm run build`
4. Add environment variables:
   - `SEC_USER_AGENT`: required for reliable SEC requests. Use a value like `Your Name your.email@example.com`.
   - `ANTHROPIC_API_KEY`: optional, if you want server-side Claude calls.
   - `GEMINI_API_KEY`: optional, if you want server-side Gemini calls.
   - `OPENAI_API_KEY`: optional, if you want server-side OpenAI calls.
5. Click Deploy.

After the first deployment, every push to GitHub `main` will trigger a new deployment automatically.

## Important Notes

- The app can run without server-side LLM keys if users enter Claude, Gemini, or OpenAI keys in the browser settings UI.
- SEC bootstrap requests are more reliable when `SEC_USER_AGENT` is set.
- This is an investor research coworker prototype, not financial advice.

## Local Verification Before Deploy

```bash
cd dcf-cfp-module
npm test
npm run lint
npm run build
```
