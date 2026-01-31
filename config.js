module.exports = {
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
    timeout: parseInt(process.env.OLLAMA_TIMEOUT || '120000', 10), // 2 minutes
    bearerToken: process.env.OLLAMA_BEARER_TOKEN || '' // Optional bearer token for authentication
  },

  research: {
    maxDepth: parseInt(process.env.RESEARCH_MAX_DEPTH || '3', 10), // How many levels deep to explore
    maxPagesPerLevel: parseInt(process.env.RESEARCH_MAX_PAGES || '3', 10), // How many pages to visit per level
    pageTimeout: parseInt(process.env.RESEARCH_PAGE_TIMEOUT || '30000', 10), // 30 seconds per page
    scrollDelay: parseInt(process.env.RESEARCH_SCROLL_DELAY || '2000', 10), // Wait 2s after scrolling to let content load
    searchEngine: process.env.RESEARCH_SEARCH_ENGINE || 'https://www.google.com/search?q=',
    maxResearchTime: parseInt(process.env.RESEARCH_MAX_TIME || '600000', 10) // 10 minutes max total research time
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
