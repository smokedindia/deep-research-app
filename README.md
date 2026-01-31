# Deep Research Agent - External Browser Edition

A CLI-based autonomous research assistant that uses **Puppeteer** to physically control an external browser and **Ollama** for intelligent decision-making. This app performs deep research by autonomously searching, navigating, and synthesizing information from multiple sources with **visible browser automation**.

## Features

- 🌐 **Physical Browser Control**: Uses Puppeteer to launch and control a real Chrome/Chromium window
- 👁️ **Visible Automation**: Watch the browser navigate, click links, and scroll in real-time
- 🤖 **Autonomous Research**: AI agent plans its own research strategy using local LLM
- 🔍 **Deep Search**: Recursively explores search results and linked pages
- 📊 **Information Extraction**: Intelligently extracts and synthesizes relevant information
- 📝 **Report Generation**: Creates comprehensive Markdown reports with sources
- 🎨 **CLI Interface**: Simple command-line interface with colored status updates

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Ollama** installed and running locally
   ```bash
   # Install Ollama (macOS)
   brew install ollama
   
   # Start Ollama server
   ollama serve
   
   # Pull a model (in a new terminal)
   ollama pull llama3.2:3b
   # or use another model like: ollama pull mistral
   ```

## Installation

1. Clone or navigate to this directory
2. Install dependencies (this will download Chromium automatically):
   ```bash
   npm install
   ```

## Configuration

Configuration can be done through either:
1. **Environment variables** (recommended) - Copy `.env.example` to `.env` and customize
2. **Direct editing** - Edit `config.js` to customize defaults

### Environment Variables

The following environment variables are supported:

**Ollama Settings:**
- `OLLAMA_HOST` - Ollama server host (default: `http://127.0.0.1:11434`)
- `OLLAMA_MODEL` - Model to use (default: `llama3.2:3b`)
- `OLLAMA_TEMPERATURE` - Temperature for generation (default: `0.7`)
- `OLLAMA_TIMEOUT` - Request timeout in ms (default: `120000`)
- `OLLAMA_BEARER_TOKEN` - Optional bearer token for authentication

**Research Parameters:**
- `RESEARCH_MAX_DEPTH` - How many levels deep to explore (default: `3`)
- `RESEARCH_MAX_PAGES` - How many pages to visit per level (default: `3`)
- `RESEARCH_PAGE_TIMEOUT` - Timeout per page in ms (default: `30000`)
- `RESEARCH_SCROLL_DELAY` - Wait time after scrolling in ms (default: `2000`)
- `RESEARCH_MAX_TIME` - Maximum total research time in ms (default: `600000`)
- `RESEARCH_SEARCH_ENGINE` - Search engine URL (default: `https://www.google.com/search?q=`)

### Configuration File

Edit `config.js` to customize default values for:

- **Ollama settings**: Change the model, temperature, host
- **Research parameters**: Adjust search depth, pages per level, timeouts
- **Puppeteer settings**: Modify slowMo speed, viewport size, headless mode

```javascript
// Example: Make automation faster (less visible)
puppeteer: {
  slowMo: 10,  // Reduce from 50ms to 10ms
  headless: false  // Keep visible
}
```

## Usage

### Interactive Mode

Simply run without arguments and follow the prompts:
```bash
npm start
```

### Command-Line Mode

Pass your query directly:
```bash
npm start "What are the latest developments in quantum computing?"
```

Or:
```bash
node cli.js "How does photosynthesis work?"
```

### What to Expect

1. **Browser Launch**: A Chrome/Chromium window will open (you can see it!)
2. **Progress Updates**: Colored status messages will appear in your terminal
3. **Visible Browsing**: Watch as the browser:
   - Searches Google
   - Clicks on relevant links
   - Scrolls through pages
   - Extracts information
4. **Report Generation**: When complete, a Markdown report is saved to your current directory

## How It Works

1. **Planning**: The agent uses Ollama to break down your query into specific search queries
2. **Browser Launch**: Puppeteer launches a visible Chrome/Chromium window
3. **Searching**: Navigates to a search engine and extracts relevant links
4. **Link Selection**: Uses AI to determine which links are most relevant
5. **Deep Exploration**: Visits selected pages, extracts content, and may go deeper based on findings
6. **Synthesis**: Collects all information and generates a comprehensive report using Ollama

## Example Queries

- "What are the latest developments in quantum computing?"
- "Compare React vs Vue for building web applications"
- "How does photosynthesis work and what are recent scientific discoveries?"
- "What are the best practices for building microservices architecture?"

## Architecture

```
├── cli.js                              # CLI entry point
├── config.js                           # Configuration
├── package.json                        # Dependencies
├── agent/
│   ├── OllamaService.js                # Ollama API wrapper
│   ├── ResearchAgent.js                # Autonomous research agent
│   └── PuppeteerBrowserController.js   # Puppeteer browser automation
└── ui/                                 # (Legacy Electron UI - no longer used)
```

## Troubleshooting

### "Cannot connect to Ollama"
- Ensure Ollama is running: `ollama serve`
- Check if the model is installed: `ollama list`
- Verify the Ollama host in `config.js` (default: `http://127.0.0.1:11434`)

### Research is slow
- Try a faster model (e.g., `mistral` instead of `llama3.2:3b`)
- Reduce `maxDepth` or `maxPagesPerLevel` in `config.js`
- Increase timeout values if pages are timing out
- Reduce `slowMo` in Puppeteer config for faster automation

### Browser doesn't launch
- Check if Chrome/Chromium was installed with Puppeteer
- Try running: `npx puppeteer browsers install chrome`
- Check terminal for error messages

### Browser is too fast to see
- Increase `slowMo` value in `config.js` (try 200-500ms)
- Reduce `maxPagesPerLevel` to visit fewer pages

## Development

Enable verbose logging:
```bash
DEBUG=puppeteer:* node cli.js "your query"
```

Run in headless mode (no visible browser):
```javascript
// In config.js
puppeteer: {
  headless: true  // Change to true
}
```

## Migration from Electron

This version replaces the Electron-based GUI with a CLI interface and Puppeteer browser automation. Key changes:

- ❌ Removed: Electron dependency, embedded BrowserView
- ✅ Added: Puppeteer (with bundled Chromium), CLI interface
- 🔄 Changed: Browser is now external and visible, not embedded

## License

MIT

## Credits

Built with:
- [Puppeteer](https://pptr.dev/)
- [Ollama](https://ollama.ai/)
- [marked](https://marked.js.org/)
- [axios](https://axios-http.com/)
- [chalk](https://www.npmjs.com/package/chalk)
