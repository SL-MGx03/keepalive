const https = require('https');
const http = require('http');
const { URL } = require('url');

const {
  API_URL,
  WARM_ENDPOINT = '/warm',
  PING_TIMEOUT_MS = '8000',
  MAX_RETRIES = '3',
  RETRY_BASE_DELAY_MS = '1500',
  ENABLE_WARM_AFTER_UNWARMED = 'true',
} = process.env;

if (!API_URL) {
  console.error('[FATAL] API_URL env/secret not set.');
  process.exit(1);
}

const numeric = v => Number.parseInt(String(v), 10);
const timeoutMs = numeric(PING_TIMEOUT_MS);
const maxRetries = numeric(MAX_RETRIES);
const retryBase = numeric(RETRY_BASE_DELAY_MS);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: {
        'User-Agent': 'ConvertAI-keepalive/1.0',
        'Accept': 'application/json,text/plain,*/*',
        ...(opts.method === 'POST' ? { 'Content-Length': 0 } : {})
      },
      timeout: timeoutMs,
    }, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (!data.trim()) {
          return resolve({ status: res.statusCode, json: null, raw: '' });
        }
        try {
          const j = JSON.parse(data);
          resolve({ status: res.statusCode, json: j, raw: data });
        } catch {
          resolve({ status: res.statusCode, json: null, raw: data });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Timeout'));
    });

    req.on('error', err => {
      reject(err);
    });

    if (opts.method === 'POST') req.end();
    else req.end();
  });
}

async function pingWithRetry(path, label) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const url = API_URL.replace(/\/+$/, '') + path;
    try {
      const start = Date.now();
      const { status, json, raw } = await fetchJson(url);
      const ms = Date.now() - start;
      console.log(`[PING][${label}] ${url} -> ${status} in ${ms}ms`);
      if (json) {
        console.log(`[PING][${label}] JSON: ${JSON.stringify(json)}`);
      } else if (raw) {
        console.log(`[PING][${label}] RAW: ${raw.slice(0,120)}${raw.length>120?'...':''}`);
      }
      if (status >= 500) {
        throw new Error(`Server ${status}`);
      }
      return { status, json };
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`[PING][${label}] Failed after ${attempt + 1} attempts:`, err.message);
        return null;
      }
      const delay = retryBase * Math.pow(2, attempt);
      console.warn(`[PING][${label}] Attempt ${attempt + 1} failed (${err.message}). Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  return null;
}

async function main() {
  console.log('--- ConvertAI Keepalive Ping Script ---');
  console.log('API_URL:', API_URL);
  console.log('WARM_ENDPOINT:', WARM_ENDPOINT);
  console.log('Timeout (ms):', timeoutMs);
  console.log('Max Retries:', maxRetries);

  // 1. fast-health
  const fast = await pingWithRetry('/fast-health', 'fast-health');
  // 2. healthz
  const health = await pingWithRetry('/healthz', 'healthz');

  let warmed = false;
  if (health && health.json) {
    warmed = !!health.json.warmed;
    if (!warmed && ENABLE_WARM_AFTER_UNWARMED === 'true') {
      console.log('[INFO] Service not warmed → sending warm request...');
      await pingWithRetry(WARM_ENDPOINT, 'warm');
      // Optionally re-check
      await sleep(1500);
      await pingWithRetry('/healthz', 'healthz-after-warm');
    }
  }

  // Summaries
  if (!fast && !health) {
    console.error('[SUMMARY] All pings failed.');
    // exit 0 so monitor doesn’t mark repo build failing constantly
    process.exit(0);
  } else {
    console.log('[SUMMARY] Fast health success?', !!fast);
    console.log('[SUMMARY] Health success?', !!health);
    console.log('[SUMMARY] Warmed (initial)?', warmed);
    process.exit(0);
  }
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(0);
});
