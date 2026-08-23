<p align="center">
  <img src="public/brand/icon.png" alt="CivicLens logo" width="104" />
</p>

# CivicLens

**Watch together. Verify with evidence.**

CivicLens is an automatic-language, evidence-first fact-checking application for public YouTube videos and live streams, individual X, Instagram, Reddit, and TikTok posts, articles, and other public webpages. There is no language selector or allowlist: language is detected per transcript segment and claim, original wording is preserved, and retrieval expands into the source language, relevant official languages, and English.

## Demo

The walkthrough below was captured from the working local application. It shows the landing page, the persistent room created for the requested live stream, and a captions-enabled room with automatically detected English transcript timestamps.

<video src="public/demo/civiclens-walkthrough.mp4" controls poster="public/demo/civiclens-room.png" width="100%"></video>

[Watch or download the 16-second MP4 walkthrough](public/demo/civiclens-walkthrough.mp4)

| Automatic-language entry | Successful caption extraction |
| --- | --- |
| ![CivicLens landing page](public/demo/civiclens-home.jpg) | ![CivicLens automatic transcript room](public/demo/civiclens-transcript.jpg) |

### Requested live-stream test

Tested with [`youtube.com/live/Nq2wYlWFucg`](https://www.youtube.com/live/Nq2wYlWFucg?si=wruh8wl25mE3J4u_). CivicLens normalized it to `youtube:Nq2wYlWFucg`, created/reused the same database room, joined LiveKit with camera off, and started the automatic analysis pass.

![Requested YouTube live room](public/demo/civiclens-live-room.jpg)

For this specific source, YouTube reports that the owner disabled third-party embedding and public captions. CivicLens therefore shows the YouTube restriction, keeps an **Open source** action, reports incomplete transcript coverage, offers paste/upload fallback, and retries while the room is open. It does not fabricate a transcript. A second public YouTube source with captions verified 357 timestamped segments and automatic `en` detection.

## Implemented product

- One URL entry point and canonical IDs for YouTube, X, Instagram, Reddit, TikTok, articles, and generic public pages.
- Persistent YouTube rooms: the same video ID always resolves to the same room, whether the video is live or recorded.
- Host-controlled shared YouTube play/pause, anonymous LiveKit presence, voice, chat, moderation, and opt-in video. Camera is off on every join.
- Automatic caption/transcript checks when the room opens, two-minute visible-room refreshes, timestamped transcript layers, and live fact cards.
- Xpoz ingestion for X, Instagram, Reddit, and TikTok, with managed-extractor and paste/upload fallbacks.
- SSRF-safe fetching, safe redirects, MIME and size limits, article Readability extraction, one-level linked-page extraction, and visible coverage manifests.
- Multilingual structured claim extraction and evidence-constrained assessment through OpenRouter.
- Tavily, Google Fact Check, and official-source registries for Nepal, India, the US, the UK, and global institutions.
- Evidence strength, primary-source availability, citations, selection provenance, and explicit limitations—never a misleading “truth percentage.”
- Server-rendered landing and analysis pages with small client islands only where polling, media, and realtime interaction require them.
- PostgreSQL/Drizzle persistence for versioned runs, artifacts, transcripts, claims, evidence, fact checks, rooms, participants, and messages.
- Fixture-backed development mode for work before provider keys are configured.

## Local setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Leave `FIXTURE_MODE=true` for a clearly labeled provider-free UI demo. Set it to `false` to use live extraction, models, and evidence retrieval.

Run the release checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Environment and key security

Copy `.env.example`; do not commit `.env`. Every credential is read only by server modules and route handlers. No provider credential uses a `NEXT_PUBLIC_` prefix, and LiveKit clients receive short-lived room tokens rather than API secrets.

Required for a full production deployment:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled PostgreSQL URL for Vercel/serverless runtime requests |
| `DATABASE_URL_UNPOOLED` | Direct PostgreSQL URL used by Drizzle migrations |
| `APP_URL` | Canonical deployed origin, for example `https://civiclens.example` |
| `HOST_TOKEN_SECRET` | Random value of at least 32 characters for host capabilities |
| `OPENROUTER_API_KEY` | Claim extraction, vision, and evidence assessment |
| `TAVILY_API_KEY` | Official-domain and broader-web evidence search |
| `XPOZ_API_KEY` | X, Instagram, Reddit, and TikTok ingestion/search |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Presence, voice, opt-in video, chat, and playback data |
| `BLOB_READ_WRITE_TOKEN` | Temporary fallback uploads |

Recommended by feature:

- `GOOGLE_FACT_CHECK_API_KEY` adds prior professional fact-check reviews.
- `OPENAI_API_KEY` enables audio/video transcription when usable media is available.
- `MANAGED_EXTRACTOR_URL` and `MANAGED_EXTRACTOR_API_KEY` add compliant dynamic-page, platform-media, frame, and caption fallback coverage.
- `TRIGGER_WEBHOOK_URL` and `TRIGGER_SECRET_KEY` move long analyses to a managed worker.
- `SENTRY_DSN` enables production error reporting.

The verified OpenRouter defaults are `google/gemini-3.7-flash` and `google/gemini-3.1-pro-preview`. CivicLens also maps the original `google/gemini-*-latest` values to these current concrete IDs for backward compatibility. Generated output is validated with Zod on the server before it enters the evidence pipeline.

## Vercel deployment

1. Create a PostgreSQL database and copy its pooled URL to `DATABASE_URL` and direct URL to `DATABASE_URL_UNPOOLED`.
2. Add the variables from `.env.example` to the Vercel project. Set `FIXTURE_MODE=false` and set `APP_URL` to the final production domain.
3. Apply the checked-in migration from a trusted machine or CI environment:

   ```bash
   npm run db:migrate
   ```

4. Import the repository into Vercel or run `npx vercel`. The checked-in `vercel.json` enables Fluid Compute, and the analysis routes request a five-minute maximum duration.
5. For reliable long video runs, configure `TRIGGER_WEBHOOK_URL`; the signed job endpoint is `POST /api/jobs/analysis` with `Authorization: Bearer $TRIGGER_SECRET_KEY`.
6. Run one production smoke test per configured provider. Verify the result page shows original claims, localized assessments, citations, extraction coverage, provenance, and limitations.

Do not run database migrations automatically in every serverless function build. Keep the direct database URL restricted to deployment/CI and use the pooled URL at runtime.

## Source behavior and fallbacks

“Any site” means best-effort extraction from any public HTTP/HTTPS URL. Dedicated behavior is guaranteed only for direct supported post URLs, YouTube video/live URLs, and article-like pages. Profile/feed URLs, private or login-only content, deleted sources, robots restrictions, and paywall bypass are excluded.

YouTube public captions are best-effort. The official YouTube caption-download API requires authorization to edit the video, so arbitrary public videos use the managed extractor when configured and a public-caption adapter otherwise. If captions are disabled, the UI requests an upload/paste fallback and marks coverage partial.

Safety limits are 100,000 extracted characters, 12 images, 30 minutes or 250 MB for non-YouTube media, and 60 keyframes. Larger or inaccessible inputs are marked partial instead of complete.

## API surface

```text
POST /api/sources/resolve
POST /api/analyses
GET  /api/analyses/:id
POST /api/uploads/presign
POST /api/claims
POST /api/livekit/token
POST /api/rooms/:id/moderation
POST /api/jobs/analysis
```

`POST /api/analyses` returns `202`, an analysis ID, a shareable result URL, and the destination. YouTube destinations are canonical room URLs; other sources open the server-rendered shareable analysis page. Successful runs younger than 24 hours are reused unless `refresh: true` is requested.

## Trust boundaries

- Only public HTTP/HTTPS inputs are accepted. Localhost, private/link-local addresses, unsafe redirects, oversized downloads, and unsupported MIME types are blocked.
- Page, transcript, image, and social content is always untrusted data and cannot control tools or retrieval.
- CivicLens never bypasses authentication, privacy controls, robots restrictions, or paywalls.
- `SUPPORTED`, `CONTRADICTED`, and `MISLEADING` require selected evidence. Otherwise the result is `UNVERIFIED` or `INSUFFICIENT_EVIDENCE`.
- Missing provider access remains visible in the coverage manifest and limitations.
- Temporary copied media carries a 24-hour deletion deadline in persistence; production storage should enforce the matching lifecycle rule.
