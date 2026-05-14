/**
 * eSIM Pricing Fetcher Service - Render.com Ready
 * Fixed ERR_HTTP_HEADERS_SENT issue
 */

const https = require('https');
const http = require('http');

/**
 * Safe JSON response helper
 */
function sendJson(res, statusCode, payload) {
  if (res.headersSent) return;

  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  res.end(JSON.stringify(payload, null, 2));
}

/**
 * Safe HTML response helper
 */
function sendHtml(res, statusCode, html) {
  if (res.headersSent) return;

  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  res.end(html);
}

/**
 * OPTIONS helper
 */
function sendOptions(res) {
  if (res.headersSent) return;

  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  res.end();
}

/**
 * HTTPS GET helper
 */
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
      },
      timeout: 10000,
    };

    const req = https.get(options, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        if (
          response.statusCode >= 200 &&
          response.statusCode < 300
        ) {
          resolve({
            data,
            statusCode: response.statusCode,
          });
          return;
        }

        reject(
          new Error(
            `HTTP ${response.statusCode}: ${data.substring(0, 200)}`
          )
        );
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });

    req.on('error', reject);
  });
}

/**
 * Helpers
 */
function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toNumber(value, fallback = 0) {
  if (!value) return fallback;

  const match = String(value).match(/(\d+(?:\.\d+)?)/);

  return match ? Number.parseFloat(match[1]) : fallback;
}

function parseJsonMaybe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizePlan(plan) {
  return {
    provider: plan.provider,
    name: plan.name,
    data: plan.data,
    dataGb: plan.dataGb,
    validity: plan.validity,
    validityDays: plan.validityDays,
    price: plan.price,
    priceUsd: plan.priceUsd,
    currency: plan.currency || 'USD',
    countries: plan.countries || [],
    url: plan.url,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Airalo
 */
async function fetchAiraloPricing(countryCode) {
  try {
    const code = String(countryCode || 'US').toUpperCase();

    console.log(`[Airalo] Fetching ${code}`);

    const endpoint =
      `https://www.airalo.com/api/v2/packages?country=${code}`;

    const response = await httpsGet(endpoint);

    const json = parseJsonMaybe(response.data);

    if (!json) return [];

    const packages = Array.isArray(json.data)
      ? json.data
      : [];

    return packages.map((pkg) =>
      normalizePlan({
        provider: 'Airalo',
        name: pkg.title || pkg.name || 'Plan',
        data: `${pkg.data || 0} GB`,
        dataGb: toNumber(pkg.data),
        validity: `${pkg.validity || 0} Days`,
        validityDays: toNumber(pkg.validity),
        price: `$${pkg.price || 0}`,
        priceUsd: toNumber(pkg.price),
        countries: [code],
        url: `https://www.airalo.com/${code.toLowerCase()}-esim`,
      })
    );
  } catch (error) {
    console.error('[Airalo]', error.message);
    return [];
  }
}

/**
 * Holafly
 */
async function fetchHolaflyPricing(country) {
  try {
    const slug = slugify(country);

    console.log(`[Holafly] Fetching ${country}`);

    const endpoint =
      `https://esim.holafly.com/api/destinations/${slug}`;

    const response = await httpsGet(endpoint);

    const json = parseJsonMaybe(response.data);

    if (!json) return [];

    const plans = Array.isArray(json.plans)
      ? json.plans
      : [];

    return plans.map((plan) =>
      normalizePlan({
        provider: 'Holafly',
        name: plan.name || 'Plan',
        data: plan.data || 'Unlimited',
        dataGb:
          String(plan.data).toLowerCase() === 'unlimited'
            ? 999
            : toNumber(plan.data),
        validity: `${plan.days || 0} Days`,
        validityDays: toNumber(plan.days),
        price: `$${plan.price || 0}`,
        priceUsd: toNumber(plan.price),
        countries: [country],
        url: `https://esim.holafly.com/${slug}-esim/`,
      })
    );
  } catch (error) {
    console.error('[Holafly]', error.message);
    return [];
  }
}

/**
 * Saily
 */
async function fetchSailyPricing(countryCode) {
  try {
    const code = String(countryCode || 'US').toUpperCase();

    console.log(`[Saily] Fetching ${code}`);

    const endpoint =
      `https://api.saily.com/v1/products?country=${code}`;

    const response = await httpsGet(endpoint);

    const json = parseJsonMaybe(response.data);

    if (!json) return [];

    const products = Array.isArray(json.products)
      ? json.products
      : [];

    return products.map((product) =>
      normalizePlan({
        provider: 'Saily',
        name: product.name || 'Plan',
        data: `${product.data || 0} GB`,
        dataGb: toNumber(product.data),
        validity: `${product.days || 0} Days`,
        validityDays: toNumber(product.days),
        price: `$${product.price || 0}`,
        priceUsd: toNumber(product.price),
        countries: [code],
        url: `https://saily.com/esim-${code.toLowerCase()}/`,
      })
    );
  } catch (error) {
    console.error('[Saily]', error.message);
    return [];
  }
}

/**
 * Aggregate pricing
 */
async function fetchAllPricing(country, countryCode) {
  console.log(`Fetching ${country} (${countryCode})`);

  const [airalo, holafly, saily] =
    await Promise.all([
      fetchAiraloPricing(countryCode),
      fetchHolaflyPricing(country),
      fetchSailyPricing(countryCode),
    ]);

  const allPlans = [
    ...airalo,
    ...holafly,
    ...saily,
  ].sort((a, b) => a.priceUsd - b.priceUsd);

  return {
    country,
    countryCode,
    timestamp: new Date().toISOString(),
    providers: {
      airalo,
      holafly,
      saily,
    },
    allPlans,
    totalPlans: allPlans.length,
  };
}

/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendOptions(res);
      return;
    }

    const url = new URL(
      req.url,
      `http://${req.headers.host}`
    );

    /**
     * API
     */
    if (url.pathname === '/api/pricing') {
      const country =
        url.searchParams.get('country') ||
        'United States';

      const countryCode =
        url.searchParams.get('code') || 'US';

      try {
        const pricing = await fetchAllPricing(
          country,
          countryCode
        );

        sendJson(res, 200, pricing);
        return;
      } catch (error) {
        console.error(error);
        sendJson(res, 500, {
          error: error.message,
        });
        return;
      }
    }

    /**
     * Health
     */
    if (url.pathname === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.1',
      });

      return;
    }

    /**
     * Homepage
     */
    if (url.pathname === '/') {
      sendHtml(
        res,
        200,
        `
        <!doctype html>
        <html>
          <head>
            <title>TernRoam Pricing API</title>
          </head>

          <body style="font-family:sans-serif;padding:40px;">
            <h1>🌍 TernRoam Pricing API</h1>

            <p>API is running.</p>

            <h2>Endpoints</h2>

            <ul>
              <li>
                <a href="/health">
                  /health
                </a>
              </li>

              <li>
                <a href="/api/pricing?country=Japan&code=JP">
                  /api/pricing?country=Japan&code=JP
                </a>
              </li>
            </ul>
          </body>
        </html>
        `
      );

      return;
    }

    /**
     * 404
     */
    sendJson(res, 404, {
      error: 'Not found',
    });

  } catch (error) {
    console.error('Unhandled server error:', error);

    sendJson(res, 500, {
      error: 'Internal server error',
      detail: error.message,
    });
  }
});

/**
 * Start server
 */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `🚀 eSIM Pricing Fetcher running on port ${PORT}`
  );

  console.log(
    `📍 Health: http://localhost:${PORT}/health`
  );

  console.log(
    `📊 Example: http://localhost:${PORT}/api/pricing?country=Japan&code=JP`
  );
});

module.exports = {
  fetchAiraloPricing,
  fetchHolaflyPricing,
  fetchSailyPricing,
  fetchAllPricing,
};
