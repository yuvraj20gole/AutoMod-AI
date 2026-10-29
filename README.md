# AutoMod AI

AI-powered car modification previews (Fast + Detailed engines) and a local Upgrade Advisor chat.

## Getting Started

```bash
npm install
npm run start:all   # inference :8001 + Next.js :3000
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test            # Vitest (advisor, mods, …)
```

## Studio engines & builds

- **Fast** vs **Detailed** in Studio — Detailed options include locked aero/body
  parts plus paint/wrap/wheels/hood (parity with Fast). New Detailed ports show
  an **Experimental** tag; prompts live in `inference/qwen/prompts.json`.
- **My Builds** — delete a build (confirm step); removes the row and storage
  images for the signed-in user only (RLS).

## Upgrade Advisor (local Ollama chat)

The dashboard Upgrade Advisor uses a **local 3B instruct model via Ollama** for:

1. **Intent extraction** — free-text → structured JSON (`goal`, `budget`, …)
2. **Short explanations** — rephrase the **rule engine** output only

Parts, prices, compatibility and installer links come **only** from
`lib/advisor/data.ts` + `recommend.ts`. The LLM never invents prices or shops;
a post-check discards explanations that mention unknown amounts/parts.

| Env | Default |
|---|---|
| `OLLAMA_URL` | `http://localhost:11434` |
| `OLLAMA_MODEL` | first available 3B instruct (prefers `qwen2.5:3b-instruct`) |

```bash
# if no 3B model is installed:
ollama pull qwen2.5:3b-instruct
ollama serve
```

If Ollama is down, slower than 20s, errors, or a **Detailed** edit job is
`queued`/`running` for the user, the advisor silently uses **Basic mode**
(rule parser + templated copy) and shows that in the status line. The page
never breaks.

### Standalone Advisor section

The sidebar has an **Advisor** entry (`/dashboard/advisor`) between My Builds
and Settings. Its hub (`components/advisor/AdvisorHub.tsx`) offers:

1. **Chat about one of my cars** — pick a car card; the chat opens with that car.
2. **Add a new car and chat** — opens the Add car flow, then redirects to
   `/dashboard/advisor?carId=<new id>` (`AddCarButton` `redirectTo` prop).
3. **Just chat in general** — no car; the advisor asks which car you drive and
   identifies Creta/Verna/City/Corolla Altis from your text, otherwise gives
   generic guidance ("General guidance, not specific to your car").

"Change car" returns to the hub; the chat is only reset when a *different*
car (or mode) is chosen. `/dashboard/cars/[id]/advisor` now redirects to
`/dashboard/advisor?carId=<id>`. In the API, `car` is optional and the response
includes `car`, `carResolution` (`selected | identified | generic`) and
`carNoteBanner`.

### Memory safety (Detailed vs chat)

Detailed Qwen edits peak ~31 GB. Ollama chat calls use `keep_alive: 60s` so
weights are not held forever. While a Detailed job is active, chat is forced
to Basic mode so the 3B model does not compete for RAM. See `CLAUDE-2.md`
and `inference/README.md`.

API: `POST /api/advisor/chat` (auth required) — SSE stream of `meta` → `token*` → `done`.

## Learn More

- Project brief: [`CLAUDE-2.md`](./CLAUDE-2.md)
- Inference engines: [`inference/README.md`](./inference/README.md)
- Next.js docs: https://nextjs.org/docs
