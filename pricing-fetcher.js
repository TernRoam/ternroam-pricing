/**
 * eSIM Pricing Fetcher Service
 * Fetches real-time pricing from Airalo, Holafly, and Saily
 */

const https = require('https');
const http = require('http');

// Helper function to make HTTPS requests
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...headers
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`Status ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

// Airalo API - They have a public API for browsing packages
async function fetchAiraloPricing(countryCode) {
  try {
    // Airalo uses ISO country codes
    const url = `https://www.airalo.com/api/v2/packages?type=country&country_code=${countryCode}&limit=50`;
    const response = await httpsGet(url, {
      'Accept': 'application/json'
    });
    
    const data = JSON.parse(response);
    const plans = [];
    
    if (data.data && Array.isArray(data.data)) {
      data.data.forEach(pkg => {
        plans.push({
          provider: 'Airalo',
          name: pkg.title || pkg.slug,
          data: `${pkg.data} GB`,
          dataGb: parseFloat(pkg.data),
          validity: `${pkg.validity} Days`,
          validityDays: parseInt(pkg.validity),
          price: `$${pkg.price}`,
          priceUsd: parseFloat(pkg.price),
          currency: 'USD',
          countries: [countryCode],
          url: `https://www.airalo.com/esim/${pkg.slug}`,
          lastUpdated: new Date().toISOString()
        });
      });
    }
    
    return plans;
  } catch (error) {
    console.error('Airalo fetch error:', error.message);
    return [];
  }
}

// Holafly - Scrape their website or use their internal API
async function fetchHolaflyPricing(country) {
  try {
    // Holafly's API endpoint (discovered from their website)
    const countrySlug = country.toLowerCase().replace(/\s+/g, '-');
    const url = `https://esim-api.holafly.com/api/v1/destinations/${countrySlug}/plans`;
    
    const response = await httpsGet(url, {
      'Accept': 'application/json',
      'Origin': 'https://esim.holafly.com'
    });
    
    const data = JSON.parse(response);
    const plans = [];
    
    if (data.plans && Array.isArray(data.plans)) {
      data.plans.forEach(plan => {
        plans.push({
          provider: 'Holafly',
          name: plan.name || `${plan.days} Days Unlimited`,
          data: plan.data || 'Unlimited',
          dataGb: plan.data === 'Unlimited' ? 999 : parseFloat(plan.data),
          validity: `${plan.days} Days`,
          validityDays: parseInt(plan.days),
          price: `$${plan.price}`,
          priceUsd: parseFloat(plan.price),
          currency: plan.currency || 'USD',
          countries: [country],
          url: `https://esim.holafly.com/destinations/${countrySlug}`,
          lastUpdated: new Date().toISOString()
        });
      });
    }
    
    return plans;
  } catch (error) {
    console.error('Holafly fetch error:', error.message);
    return [];
  }
}

// Saily - Fetch from their API
async function fetchSailyPricing(countryCode) {
  try {
    // Saily API endpoint
    const url = `https://api.saily.com/v1/public/products?country=${countryCode}`;
    
    const response = await httpsGet(url, {
      'Accept': 'application/json'
    });
    
    const data = JSON.parse(response);
    const plans = [];
    
    if (data.products && Array.isArray(data.products)) {
      data.products.forEach(product => {
        plans.push({
          provider: 'Saily',
          name: product.title || `${product.data_amount}GB - ${product.duration_days} Days`,
          data: `${product.data_amount} GB`,
          dataGb: parseFloat(product.data_amount),
          validity: `${product.duration_days} Days`,
          validityDays: parseInt(product.duration_days),
          price: `$${product.price}`,
          priceUsd: parseFloat(product.price),
          currency: product.currency || 'USD',
          countries: [countryCode],
          url: `https://saily.com/destinations/${countryCode.toLowerCase()}`,
          lastUpdated: new Date().toISOString()
        });
      });
    }
    
    return plans;
  } catch (error) {
    console.error('Saily fetch error:', error.message);
    return [];
  }
}

// Main function to fetch all pricing
async function fetchAllPricing(country, countryCode) {
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
  
  // Combine all plans
  results.allPlans = [...airalo, ...holafly, ...saily];
  results.totalPlans = results.allPlans.length;

  return results;
}

// HTTP Server to serve the pricing API
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
      res.end(JSON.stringify(pricing));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  } else if (url.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`eSIM Pricing Fetcher running on port ${PORT}`);
  console.log(`Example: http://localhost:${PORT}/api/pricing?country=Japan&code=JP`);
});

// Export for testing
module.exports = { fetchAiraloPricing, fetchHolaflyPricing, fetchSailyPricing, fetchAllPricing };
