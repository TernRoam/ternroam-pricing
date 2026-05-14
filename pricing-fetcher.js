/**
 * eSIM Pricing Fetcher Service - Improved Version
 * Fetches real-time pricing from Airalo, Holafly, and Saily
 */

const https = require('https');
const http = require('http');

// Helper function to make HTTPS requests with better error handling
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        ...headers
      },
      timeout: 10000 // 10 second timeout
    };

    const req = https.get(options, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ data, statusCode: res.statusCode });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', reject);
  });
}

// Airalo API - Updated with correct endpoint
async function fetchAiraloPricing(countryCode) {
  try {
    console.log(`[Airalo] Fetching pricing for ${countryCode}...`);
    
    // Try multiple possible endpoints
    const endpoints = [
      `https://www.airalo.com/api/v2/packages?type=country&country=${countryCode}`,
      `https://www.airalo.com/api/v2/packages?filter[country_code]=${countryCode}`,
      `https://api.airalo.com/v2/packages?country_code=${countryCode}`
    ];

    let lastError = null;
    
    for (const url of endpoints) {
      try {
        const response = await httpsGet(url, {
          'Accept': 'application/json',
          'Referer': 'https://www.airalo.com/'
        });
        
        const data = JSON.parse(response.data);
        const plans = [];
        
        // Handle different response structures
        const packages = data.data || data.packages || data;
        
        if (Array.isArray(packages)) {
          packages.forEach(pkg => {
            const dataAmount = pkg.data || pkg.amount || 0;
            const validity = pkg.validity || pkg.duration || pkg.days || 0;
            const price = pkg.price || pkg.cost || 0;
            
            plans.push({
              provider: 'Airalo',
              name: pkg.title || pkg.name || `${dataAmount}GB - ${validity} Days`,
              data: `${dataAmount} GB`,
              dataGb: parseFloat(dataAmount),
              validity: `${validity} Days`,
              validityDays: parseInt(validity),
              price: `$${price}`,
              priceUsd: parseFloat(price),
              currency: 'USD',
              countries: [countryCode],
              url: `https://www.airalo.com/${countryCode.toLowerCase()}-esim`,
              lastUpdated: new Date().toISOString()
            });
          });
        }
        
        if (plans.length > 0) {
          console.log(`[Airalo] ✓ Found ${plans.length} plans`);
          return plans;
        }
      } catch (err) {
        lastError = err;
        continue; // Try next endpoint
      }
    }
    
    console.log(`[Airalo] ✗ No plans found. Last error: ${lastError?.message}`);
    return [];
    
  } catch (error) {
    console.error('[Airalo] Error:', error.message);
    return [];
  }
}

// Holafly - Updated with correct endpoint
async function fetchHolaflyPricing(country) {
  try {
    console.log(`[Holafly] Fetching pricing for ${country}...`);
    
    const countrySlug = country.toLowerCase().replace(/\s+/g, '-');
    
    // Try multiple possible endpoints
    const endpoints = [
      `https://esim.holafly.com/api/destinations/${countrySlug}`,
      `https://api.holafly.com/v1/destinations/${countrySlug}/plans`,
      `https://esim-api.holafly.com/api/v1/destinations/${countrySlug}`
    ];

    let lastError = null;
    
    for (const url of endpoints) {
      try {
        const response = await httpsGet(url, {
          'Accept': 'application/json',
          'Origin': 'https://esim.holafly.com',
          'Referer': `https://esim.holafly.com/${countrySlug}/`
        });
        
        const data = JSON.parse(response.data);
        const plans = [];
        
        // Handle different response structures
        const plansList = data.plans || data.data?.plans || data.products || [];
        
        if (Array.isArray(plansList)) {
          plansList.forEach(plan => {
            const days = plan.days || plan.duration || plan.validity || 0;
            const dataAmount = plan.data || plan.data_amount || 'Unlimited';
            const price = plan.price || plan.cost || 0;
            
            plans.push({
              provider: 'Holafly',
              name: plan.name || `${days} Days ${dataAmount}`,
              data: dataAmount,
              dataGb: dataAmount === 'Unlimited' ? 999 : parseFloat(dataAmount),
              validity: `${days} Days`,
              validityDays: parseInt(days),
              price: `$${price}`,
              priceUsd: parseFloat(price),
              currency: plan.currency || 'USD',
              countries: [country],
              url: `https://esim.holafly.com/${countrySlug}/`,
              lastUpdated: new Date().toISOString()
            });
          });
        }
        
        if (plans.length > 0) {
          console.log(`[Holafly] ✓ Found ${plans.length} plans`);
          return plans;
        }
      } catch (err) {
        lastError = err;
        continue;
      }
    }
    
    console.log(`[Holafly] ✗ No plans found. Last error: ${lastError?.message}`);
    return [];
    
  } catch (error) {
    console.error('[Holafly] Error:', error.message);
    return [];
  }
}

// Saily - Updated with correct endpoint
async function fetchSailyPricing(countryCode) {
  try {
    console.log(`[Saily] Fetching pricing for ${countryCode}...`);
    
    // Try multiple possible endpoints
    const endpoints = [
      `https://api.saily.com/v1/products?country=${countryCode.toUpperCase()}`,
      `https://api.saily.com/v1/public/products?country=${countryCode.toUpperCase()}`,
      `https://saily.com/api/v1/products?destination=${countryCode.toLowerCase()}`
    ];

    let lastError = null;
    
    for (const url of endpoints) {
      try {
        const response = await httpsGet(url, {
          'Accept': 'application/json',
          'Referer': 'https://saily.com/'
        });
        
        const data = JSON.parse(response.data);
        const plans = [];
        
        // Handle different response structures
        const products = data.products || data.data || data;
        
        if (Array.isArray(products)) {
          products.forEach(product => {
            const dataAmount = product.data_amount || product.data || product.gb || 0;
            const days = product.duration_days || product.days || product.validity || 0;
            const price = product.price || product.cost || 0;
            
            plans.push({
              provider: 'Saily',
              name: product.title || product.name || `${dataAmount}GB - ${days} Days`,
              data: `${dataAmount} GB`,
              dataGb: parseFloat(dataAmount),
              validity: `${days} Days`,
              validityDays: parseInt(days),
              price: `$${price}`,
              priceUsd: parseFloat(price),
              currency: product.currency || 'USD',
              countries: [countryCode],
              url: `https://saily.com/destinations/${countryCode.toLowerCase()}`,
              lastUpdated: new Date().toISOString()
            });
          });
        }
        
        if (plans.length > 0) {
          console.log(`[Saily] ✓ Found ${plans.length} plans`);
          return plans;
        }
      } catch (err) {
        lastError = err;
        continue;
      }
    }
    
    console.log(`[Saily] ✗ No plans found. Last error: ${lastError?.message}`);
    return [];
    
  } catch (error) {
    console.error('[Saily] Error:', error.message);
    return [];
  }
}

async function fetchAllPricing(country, countryCode) {
  console.log(`\n=== Fetching pricing for ${country} (${countryCode}) ===`);
  
  const results = {
    country,
    countryCode,
    providers: {},
    timestamp: new Date().toISOString()
  };

  // Fetch from all providers in parallel
  const [airalo, holafly, saily] = await Promise.all([
    fetchAiraloPricing(countryCode),
    fetchHolaflyPricing(country),
    fetchSailyPricing(countryCode)
  ]);

  results.providers.airalo = airalo;
  results.providers.holafly = holafly;
  results.providers.saily = saily;
  results.allPlans = [...airalo, ...holafly, ...saily];
  results.totalPlans = results.allPlans.length;

  console.log(`=== Total: ${results.totalPlans} plans ===\n`);
  
  return results;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (url.pathname === '/api/pricing') {
    const country = url.searchParams.get('country') || 'United States';
    const countryCode = url.searchParams.get('code') || 'US';

    try {
      const pricing = await fetchAllPricing(country, countryCode);
      res.writeHead(200);
      res.end(JSON.stringify(pricing, null, 2));
    } catch (error) {
      console.error('API Error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  } else if (url.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '2.0'
    }));
  } else if (url.pathname === '/') {
    res.writeHead(200);
    res.setHeader('Content-Type', 'text/html');
    res.end(`
      <html>
        <head><title>TernRoam Pricing API</title></head>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>🌍 TernRoam Pricing API</h1>
          <p>API is running!</p>
          <h2>Endpoints:</h2>
          <ul>
            <li><a href="/health">/health</a> - Health check</li>
            <li><a href="/api/pricing?country=Japan&code=JP">/api/pricing?country=Japan&code=JP</a> - Get pricing</li>
          </ul>
        </body>
      </html>
    `);
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 eSIM Pricing Fetcher v2.0 running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Example: http://localhost:${PORT}/api/pricing?country=Japan&code=JP\n`);
});

module.exports = { fetchAiraloPricing, fetchHolaflyPricing, fetchSailyPricing, fetchAllPricing };
