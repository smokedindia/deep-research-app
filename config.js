module.exports = {
  ollama: {
    host: 'http://158.179.163.136', // Use 127.0.0.1 instead of localhost to force IPv4
    model: 'gpt-oss:latest',
    temperature: 0.7,
    timeout: 120000, // 2 minutes
    bearerToken: process.env.OLLAMA_BEARER_TOKEN || '' // Optional bearer token for authentication
  },

  research: {
    maxDepth: 3, // How many levels deep to explore
    maxPagesPerLevel: 3, // How many pages to visit per level
    pageTimeout: 30000, // 30 seconds per page
    scrollDelay: 2000, // Wait 2s after scrolling to let content load
    searchEngine: 'https://www.google.com/search?q='
  },

  puppeteer: {
    headless: false, // Show visible browser window
    // slowMo: 100, // Slow down by 100ms to make actions visible
    defaultViewport: {
      width: 1200,
      height: 800
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
};
