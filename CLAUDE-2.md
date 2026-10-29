# AutoMod AI — Project Brief for Claude Code

Read this file at the start of every session. It exists because context gets
compacted/lost across long sessions — this is the durable source of truth for
what we're building, why, and what's already been decided. If something here
conflicts with an instruction earlier in a compacted conversation, **this file
wins.**

## What AutoMod AI is

An AI-powered car modification and visualization platform. A user uploads a
photo of their car, gets AI-recommended modifications (paint, wraps, wheels,
body kits), and sees a photorealistic AI-generated preview before committing
money to a real shop. Long-term vision: a real product used by car mod shops
and enthusiasts, potentially scaling into a startup. Status (2026-10-20):
the landing page, the authenticated dashboard, AND the AI engine are all
built and integrated — the engine (`inference/`) identifies the car/angle
from photos and renders masked InstructPix2Pix edit previews in the
dashboard Studio, and the rule-based Upgrade Advisor (with free-text input)
is live. See "AI engine" at the bottom of this file for the current state.

## Brand direction

Premium automotive brand feel — think how Porsche, McLaren, or a well-funded
car-culture startup would present itself. NOT a generic SaaS template, NOT
gamer/neon UI, NOT cartoonish. Reference: landonorris.com (Lando Norris's
official F1 site) for cinematic scroll storytelling and kinetic typography —
but note their stack is Webflow-based (Taxi.js, jQuery) which does NOT apply
to us; only their GSAP + ScrollTrigger + Lenis approach transfers directly.

**Theme: light-dominant (~80% light, ~20% dark).** This was a deliberate,
hard-won decision after real problems with a dark-theme approach — do not
revert to full-dark without discussing it first. The two intentional dark
sections are the Hero (bold typography needs dark to pop) and the Power/engine
section (dark, moody, warm-lit — mechanical content reads better dramatic).
Everything else is light/white/gray, matching the car's studio photography
background so images composite cleanly with **zero chroma-key or matting
needed** — this is why light was chosen over dark, not just taste.

**Accent color:** the site currently reads as too monochrome (black/white/gray
+ only the car's yellow paint). Pull a warm amber/gold accent (already used
successfully on the "POWER" eyebrow label) through consistently: all section
eyebrow labels, small divider lines before labels, button/link hover/focus
states, scroll progress indicator if present. Keep it as one small consistent
signature accent — not a full recolor.

## Landing page — current section structure (no pricing/tier cards)

1. **Hero — dark.** "AUTOMOD AI" wordmark → "Build it in your head." headline
   → subtext → "Start your build" CTA → car teaser image below.
2. **360° Studio / Reveal — light.** The scroll-scrubbed image-sequence
   showcase. Canvas-based frame playback driven by GSAP ScrollTrigger + Lenis.
   Choreography: front view → rotate left toward rear → engine cover opens →
   continue rotating toward a mid-right side profile → doors and frunk open
   together. Source: a Higgsfield-generated video of a 2023 Porsche 911 GT3
   RS in Racing Yellow, extracted to `public/frames-v2/` (241 frames). This
   replaces the earlier Google Flow footage. **No matting/chroma-key logic
   needed or wanted** — frames composite directly onto the light background.
   The mid-scroll captions that used to narrate each beat were removed (they
   sat under the fixed nav bar and got clipped) — the section now stays
   silent through the rotation and reveals a closing line at the very end,
   once the sequence settles on its final frame.
3. **How It Works — light.** New section, not in the original brief. Explains
   the (not-yet-built) AI flow — upload, analyze, generate preview, compare —
   with illustrated step mockups. Framing stays forward-looking; nothing here
   implies the AI features are live.
4. **Categories intro — light.** New section, not in the original brief. A
   short intro banner ahead of Finish/Stance/Power framing them as "here's
   what AutoMod handles" rather than three disconnected panels.
5. **Finish — light,** two-column: text left, image right. Paint/wrap/chrome.
6. **Stance — light,** two-column, mirrored (image left, text right this
   time) for rhythm. Aero and ride height.
7. **Power — dark,** two-column, warm accent lighting. Engine and exhaust.
8. **Closing CTA — light,** simple, centered, trimmed so it doesn't just
   repeat the hero's headline/subtext — plus a **dark footer** below it (logo,
   quick links, copyright), which didn't exist in the original brief either.

**Explicitly dropped:** a "Starter Builds" pricing/tier card section
(Track/Street/Show Pack with prices) was cut entirely — don't reintroduce
pricing cards.

## Tech stack decisions (what to use, what to skip, and why)

- **GSAP + ScrollTrigger** — scroll-scrubbed frame sequence playback. In use.
- **Lenis** — smooth/inertia scrolling, single source of truth that GSAP and
  Framer Motion both read scroll position from. Don't let multiple scroll
  listeners run independently.
- **Framer Motion** — scroll-gated text overlay crossfades between sequence
  beats, and button/CTA hover interactions (custom-built spring-physics
  animation, premium/understated — not bouncy or flashy).
- **Rive — explicitly skipped for now.** No `.riv` files have been authored;
  Claude Code cannot generate them. Don't wire up `@rive-app/react-canvas`
  until the user provides actual exported `.riv` files. Framer Motion's
  `HoverButton` primitive is the current button interaction, and that's fine.
- **React Three Fiber / Three.js — not on the landing page currently.**
  `CarScene.tsx` and the old McLaren GLB exist on disk, disconnected,
  uncommitted. There was back-and-forth on whether the hero should be a live
  R3F 3D model — this was reversed once the light-theme decision made the
  frame-sequence approach viable again without matting problems. R3F is
  reserved for a genuine future use case (e.g. an interactive wheel/rim
  selector in a later product configurator flow), not the marketing landing
  page. Don't re-introduce it here without explicit direction.
- **No pricing/e-commerce integration** — out of scope for the landing page.

## Asset pipeline notes

- Source photography/video: AI-generated via Higgsfield, using Nano Banana
  Pro for stills and Higgsfield video generation for the rotation sequence.
  Subject: 2023 Porsche 911 GT3 RS, Racing Yellow, consistent light gray-white
  studio background and lighting across all assets.
- Static images for Finish/Stance/Power sections should be pulled from the
  same consistent asset set (best frame per angle: front/¾, rear-¾, engine-
  bay-open) rather than mixing sources, to keep visual consistency.
- Do not reintroduce the old Google Flow-generated Porsche footage as final
  source material — it was a placeholder, superseded by the Higgsfield set.

## Auth & dashboard (dashboard v1 — functionally complete)

- **Auth: Supabase**, via `lib/supabase/` (browser client, server client,
  admin/service-role client for server-only privileged operations, and
  session-refresh in `proxy.ts` — Next.js 16 renamed `middleware.ts` to
  `proxy.ts`, see the Next.js version warning in `AGENTS.md`). Chosen over
  Clerk+Neon+Prisma for a single-vendor setup (auth + Postgres + file storage
  together) — matters for the AI engine, which will need somewhere to
  read/write uploaded car photos and generated previews.
- **Scope for v1: car owners only.** Shop/B2B accounts stay future scope per
  the long-term vision above — not built now.
- **A real, connected Supabase project** — `.env.local` has live keys
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`). `isSupabaseConfigured`
  still gates every auth call so the app degrades gracefully if those keys
  are ever missing, rather than crashing.
- **Database schema — built and migrated**, as real version-controlled files
  in `supabase/migrations/`, not one-off SQL run through the dashboard:
  `profiles`, `cars`, and `builds` tables plus the `car-photos` Storage
  bucket, all with Row Level Security (a user can only read/write their own
  rows/files, enforced at the DB level, not just app logic). Pushed via the
  Supabase CLI over the **pooler** connection
  (`aws-0-ap-southeast-1.pooler.supabase.com:6543`) — the direct
  `db.<ref>.supabase.co` host is IPv6-only and unreachable from here, so any
  future scripted DB work needs the pooler too. RLS was verified empirically
  with real cross-user tests (two accounts, confirmed one can't see/edit/
  delete the other's rows or files), not just read off the policy
  definitions. `builds` stays schema-only/empty until the AI engine
  (separate Sem 7 phase) can actually generate something.
- **`/login` and `/register`** — deliberately not the homepage's light
  dot-grid card, and not a split-screen hero-photo layout either (tried,
  dropped — it just reused the homepage's own car photography). Researched
  Linear/Vercel/Framer's actual auth pages first: they converge on a single
  glass-morphism card centered on a dark, atmospheric background rather than
  a split screen. Built that pattern with our own flavor — a technical
  "blueprint" grid + amber glow, not car photography. The back-to-home link
  lives inside the card itself, not pinned to a page corner. Full client-side
  validation (email format, password-strength checklist, confirm-password
  match) runs before Supabase is ever called.
- **`/dashboard`** — a real sidebar shell (`DashboardSidebar`, fixed on
  desktop, horizontal scroll bar on mobile) with four working routes, auth
  checked once in `app/dashboard/layout.tsx` rather than per page:
  - **Overview** — kept intentionally minimal (welcome message); can grow
    into a real summary once there's more than one data source to summarize.
  - **My Cars** — the one fully functional CRUD feature: add a car (make/
    model/year + photo upload to the `car-photos` bucket), list the user's
    own cars with a signed-URL photo per card, delete with an inline
    confirm step. Verified against the live project: real upload+insert,
    cross-user isolation at both the DB and Storage layers, and delete
    confirmed to remove both the DB row and the storage object (checked
    with the service-role key, which bypasses RLS, so the check is
    authoritative).
  - **My Builds** — lists the AI-generated before/after previews saved from
    the Studio (the engine exists now; see "AI engine" below).
  - **Settings** — profile view/edit (name + email; email is read-only, no
    password-change flow — kept out of v1 scope on purpose) and delete
    account. Editing name writes to both `auth.users` metadata and the
    `profiles` row, since both are read elsewhere in the app. Account
    deletion goes through a server Route Handler
    (`app/api/account/delete/`) using the admin client: it explicitly
    removes the user's storage files first (storage objects aren't covered
    by the `cars`/`builds` cascade — deleting the auth user alone would
    silently orphan every photo), then deletes the auth user, which cascades
    to `profiles`/`cars`/`builds` via the existing FK constraints. Verified
    end to end: created a test user with a real car+photo, deleted the
    account through the actual UI, then confirmed directly against the data
    layer that the auth user, profile, car row, and storage object were all
    genuinely gone (not just hidden from that user's session).

## AI Training Data & Scraper Pipeline

- **Reddit was excluded as a data source** — their Responsible Builder Policy
  explicitly prohibits using Reddit data to train ML/AI models without express
  written approval, which isn't realistically obtainable here.
- **Shop portfolio scraping is now the sole scraping source.** The scraper
  targets public "Our Work", portfolio, and gallery pages across curated car
  wrap, styling, detailing, and custom body shops, with strict `robots.txt`
  compliance, polite request throttling with jitter, perceptual deduplication
  (`pHash` / `dHash`), and structured pair metadata tracking.
- **Hard treatment filters & framing heuristics:**
  - Auto-exclude any project whose title, URL, or caption indicates PPF (Paint
    Protection Film), clear bra, ceramic coating, or machine polish as the
    primary treatment, since transparent coatings create visually imperceptible
    before/after changes that are useless for model training.
  - Image selection strongly favors full-car and full-panel angles (landscape
    framing, front/rear/side 3/4 profiles) over tight macro crops (calipers,
    badges, door handles, tire tread).
- **Automated Claude Vision Validation Gate:**
  - Every candidate pair is evaluated using Claude's multimodal vision model across 4 strict criteria:
    (1) same vehicle verification, (2) clean "before" view (no tools, hands, in-progress vinyl, or micro-crops),
    (3) clean "after" view (finished presentation shot, not workshop lift/process), and (4) clearly visible modification.
  - Pairs failing the automated vision check are auto-rejected with structured reasons recorded in metadata,
    allowing human review in `review.html` to focus exclusively on verified high-quality candidates.

## Working agreement

- This is a Sem 7 college project with a real chance of becoming a startup —
  build it with that seriousness.
- **Dashboard v1 is functionally complete** — see "Auth & dashboard" above.
  The AI engine is built and integrated (Studio previews, saved Builds,
  identification, Upgrade Advisor — see "AI engine" below). Remaining work
  is quality/reach: better angle detection for coupes, a live demo
  deployment (the engine needs a GPU or Apple Silicon machine), and polish.
- When something in this file conflicts with what's actually in the repo
  (e.g. a section says "light theme" but the live build is dark), flag the
  mismatch explicitly rather than silently picking one — this file should be
  the source of truth going forward, but call out drift so it can be fixed.

## AI engine (Sem 7 Deep Learning deliverable): status as of 2026-10-28

- **Two engines in Studio:** **Fast** (default, InstructPix2Pix, ~1–2 min,
  keeps the photo exact via panel masking) and **Detailed**
  (Qwen-Image-Edit-2511 q4 via mflux/MLX + Lightning LoRA 0.5, 8 steps,
  guidance 2.5, 768 long side, ~3.5–4 min). Selector next to Generate;
  Detailed options come from locked prompts in `inference/qwen/prompts.json`
  (spoilers lip/ducktail/GT wing, side skirts, front lip, rear diffuser,
  bronze wheels, carbon hood, matte-black wrap, provisional bumper finishes).
  `lib/mods.ts` has an `engines` field + `visibleOptions(engine)` +
  `canCompareEngines` / Compare UI in Studio.
- **Number plate:** Prompt suffix alone is not enough. Shipped fix is
  post-process paste-back (`inference/qwen/plate.py`: trunk-guided classical
  detect + feathered original pixels; YOLO plate when the class fires).
  Crops: `~/qwen_test/plate_crops/`. Bumper sheets for review:
  `~/qwen_test/sheets_bumper/` (provisional B/seed11 — not locked).
- **Memory rule (hard):** Fast and Detailed must **never** run at the same
  time (Qwen peaks ~31 GB on this 48 GB Mac). Shared
  `inference/job_queue.py` lock + single worker. Detailed is always a
  **short-lived subprocess** (`inference/qwen/runner.py`): load → edit →
  LAB colour-match + edit-region blend + plate restore → exit. 15 min
  timeout; queued jobs wait. `edit_jobs` table + `builds.engine` column
  (`supabase/migrations/20261028120000_edit_jobs_and_engine.sql`).
- **Enable Detailed:** `uv tool install mflux`; q4 weights under
  `~/.cache/huggingface/hub/models--mflux-community--qwen-image-edit-2511-mflux-q4`.
  `GET /engines` / Studio disable the selector when missing. No extra process
  in `start.sh`; `stop.sh` kills leftover runner/mflux processes.
- **Data (Fast LoRA era):** 63 teacher/student pairs in
  `dataset/synthetic-pairs/chatgpt/`; 50 accepted, 35/15 split. Disclose
  teacher/student in the report; licence checks still open.
- **Fast model:** InstructPix2Pix + rank-4 LoRA v2 (hood/spoiler only;
  paint/wrap/wheels use base). Masked via YOLO11 panels + `composite()` —
  see `inference/README.md`. Fast spoiler still renders as a lip; Detailed
  can add a real GT wing / body parts.
- **Integration:** Fast stays sync `POST /edit` via
  `app/api/builds/generate`. Detailed: `POST /api/jobs` → poll
  `GET /api/jobs/[id]` every 3s; on done, upload + `builds` row with
  `engine`. My Builds shows a Fast/Detailed badge. Studio progress shows
  queued/running + elapsed timer (~4 min note).
- **Multi-photo + angle detection, identification chat, Upgrade Advisor** —
  unchanged from earlier; Advisor is rule-based (`lib/advisor/`), Vitest
  covered (`npm test`).
- **How to start:** `npm run start:all` (`scripts/start.sh`) — engine
  `:8001` + `npm run dev`, waits for `/health` ready, prints whether
  Detailed is available. `scripts/stop.sh` frees 8001/3000 and Qwen
  runners. Always `inference/.venv/bin/python` for the Fast server.
- **Known limitations:** coupe angle detection; white-to-black wrap edge
  row; Fast spoiler = lip; Detailed ~4 min and needs mflux + cache; only
  one job at a time.
- **Demo cars:** Toyota Corolla Altis primary (`inference/demo_final/`);
  white Hyundai Verna secondary. Screenshots list:
  `docs/screenshots/README.md`. Obsolete files in `_archive/`.
- **Open:** padding bars, licence check, live demo host (needs Apple
  Silicon / GPU).
