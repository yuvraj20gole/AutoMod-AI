# Deploy AutoMod AI (showcase) on Vercel

The hosted site is a **showcase**: landing, login, My Cars, My Builds (saved before/after), and Advisor in **Basic** mode. The Fast/Detailed edit engines (FastAPI `:8001`) and Ollama stay on your Mac and are **not** reachable from Vercel.

## Import on Vercel

1. Push this repo to GitHub/GitLab/Bitbucket (or import from the local folder).
2. In [Vercel](https://vercel.com): **Add New… → Project** → import the repo.
3. Framework preset: **Next.js**. Build command `npm run build`, output default. Install `npm install`.
4. Set **Node.js 20.x** (Project Settings → General → Node.js Version). The app uses Next.js 16, which needs Node 20+.
5. Add environment variables (table below) → Deploy.
6. Do **not** set `INFERENCE_URL` or `OLLAMA_URL` on Vercel. Leaving them unset is what keeps Studio read-only and Advisor in Basic mode.

## Environment variables

No real secrets belong in git. Set these in the Vercel project → Settings → Environment Variables (Production + Preview as needed).

| Name | Required | Secret? | Placeholder / notes |
|------|----------|---------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | No | `https://your-project-ref.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | No | Supabase **anon** / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (account delete) | **Yes** | Supabase **service_role** key — server only; never `NEXT_PUBLIC_` |
| `INFERENCE_URL` | No (local only) | No | Local Mac: `http://127.0.0.1:8001`. **Omit on Vercel.** |
| `INFERENCE_API_KEY` | No | **Yes** if used | Optional shared key with the local FastAPI server. **Omit on Vercel.** |
| `OLLAMA_URL` | No (local only) | No | Local Mac: `http://localhost:11434`. **Omit on Vercel.** |
| `OLLAMA_MODEL` | No | No | e.g. `qwen2.5:3b-instruct`. Only useful with a reachable Ollama. |

Dataset / Colab pipeline vars (`KAGGLE_*`, InstructPix2Pix overrides) are **not** needed for the web showcase.

## Supabase Auth URLs

In Supabase → **Authentication → URL Configuration**, set:

| Setting | Value |
|---------|--------|
| **Site URL** | `https://YOUR_PROJECT.vercel.app` (or your custom domain) |
| **Redirect URLs** | `https://YOUR_PROJECT.vercel.app/**` and `https://YOUR_PROJECT.vercel.app/auth/callback` |

Also keep local redirects if you still develop on the Mac:

- `http://localhost:3000/**`
- `http://localhost:3000/auth/callback`

### Email / OAuth

- **Email magic link / confirm**: confirm emails use Site URL + redirect allow-list above.
- **Google OAuth** (if enabled): in Google Cloud Console, add authorized redirect URI  
  `https://<project-ref>.supabase.co/auth/v1/callback`  
  (unchanged — Supabase is the OAuth client). In Supabase providers, ensure Google is enabled with the same client ID/secret you use locally.
- Preview deployments: either add each `*.vercel.app` preview URL to Redirect URLs, or use a wildcard pattern Supabase allows for your project.

## Engines are local-only

| Capability on Vercel | Behaviour |
|----------------------|-----------|
| Studio **Generate** | Disabled; message: *Editing engines run locally. Saved builds are still available.* |
| My Builds | Works — shows saved before/after from Supabase Storage |
| My Cars | Works — add cars manually (photo auto-detect needs the local engine) |
| Advisor | **Basic mode** (curated rule engine). No Ollama → no Local AI, no error toast |
| Fast `/edit` & Detailed jobs | Not available; API returns the offline message if called |

Run edits and Local Advisor on your Mac with `npm run start:all` and Ollama as documented in `README.md`.

## After deploy — smoke check

- `/` landing loads  
- Login / register / OAuth round-trip to `/dashboard`  
- My Cars list + add car (manual make/model)  
- My Builds shows existing builds with sliders  
- Advisor answers e.g. “more power under 50k” in Basic mode  
- Studio generate button is disabled with the local-engines message  
