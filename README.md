# ConvertAI Keepalive / Pinner

This repo keeps the Replit ConvertAI API warm by:
1. A scheduled GitHub Actions workflow (every 5 minutes with random jitter) hitting `/fast-health` and `/healthz`.
2. An optional Node.js script (`scripts/ping.js`) that:
   - Retries with exponential backoff
   - Detects 502 / network errors and reports them
   - Optionally calls `/warm` if warming seems needed
3. (Optional) A Cloudflare Worker Cron (secondary external pinger) for redundancy.

> NOTE: Use the canonical Replit domain: `https://<repl-name>.<user>.repl.co`
> Do **not** rely on the ephemeral long “pike” domain.

---

## Quick Start (GitHub Actions Only)

1. Create a new public or private repository.
2. Copy all files from this repo structure.
3. In **Settings → Secrets and variables → Actions → New repository secret**, add:

   - `API_URL` = `https://yourrepl.youruser.repl.co`
   - (Optional) `WARM_ENDPOINT` = `/warm` (Defaults used if omitted)

4. Commit & push. Actions will start on schedule.

---

## Node Ping Script Behavior

`scripts/ping.js` sequence:
1. GET `${API_URL}/fast-health`
2. GET `${API_URL}/healthz`
3. If `warmed=false && warming=false`, optionally POST `/warm`
4. Logs timings & statuses
5. Retries up to configurable max on 502 / ENOTFOUND

Exit code is non-zero only if **all** attempts fail. Workflow ignores a single failure (so it won’t spam you unless persistent).

---

## Optional Cloudflare Worker Cron

If you have Cloudflare Workers:
1. Install Wrangler (`npm i -g wrangler`)
2. Edit `cloudflare/wrangler.toml` with your own Worker name.
3. Deploy: `cd cloudflare && wrangler deploy`
4. The cron (*/10) will auto-ping.

---

## Badges (Optional)

Add shields badges for monitoring:

```
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/<OWNER>/<REPO>/convertai-keepalive.yml?label=keepalive)
```

---

## Tuning

| Variable | Default | Purpose |
|----------|---------|---------|
| API_URL (secret/env) | required | Base URL to ping |
| WARM_ENDPOINT | /warm | Additional warm call |
| PING_TIMEOUT_MS | 8000 | Per-request timeout |
| MAX_RETRIES | 3 | Retries for failed health pings |
| RETRY_BASE_DELAY_MS | 1500 | Backoff base (exponential) |
| ENABLE_WARM_AFTER_UNWARMED | true | Calls /warm if healthz says not warmed |

---

## Adding Another Endpoint

If you add new conversions, the ping script doesn’t need changes. It only keeps the container alive by touching lightweight endpoints.

---

## FAQ

**Q: Replit still sleeps occasionally.**  
A: Free-tier Replit may still hibernate. Combine GitHub Actions + Cloudflare Worker for higher “hit frequency” or move the API to Render/Fly.io for true always-on.

**Q: Why do I still see CORS errors on first request?**  
A: They are usually *false CORS* due to a 502 from a sleeping instance. After the keepalive infrastructure runs consistently, first-request failures diminish.

**Q: Should I reduce LibreOffice warm time?**  
Yes—already shortened. If conversions still slow, consider hosting only the UI on Replit and the converter on Render, or using an external conversion API.

---

© 2025 SL_MGx
