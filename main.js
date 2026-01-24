const { app, BrowserWindow, BrowserView, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ResearchAgent = require('./agent/ResearchAgent');
const config = require('./config');

let mainWindow;
let browserView;
let researchAgent;

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: config.browser.width,
        height: config.browser.height + config.ui.controlPanelHeight,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        title: 'Deep Research Agent'
    });

    // Load the control panel UI
    mainWindow.loadFile('ui/index.html');

    // Create BrowserView for web content (but don't attach it initially)
    browserView = new BrowserView({
        webPreferences: {
            contextIsolation: true,
            javascript: true,
            images: true,
            webSecurity: true
        }
    });

    // Don't attach the BrowserView initially - it would block the control panel UI
    // We'll add it when research starts

    // Update bounds when window is resized
    mainWindow.on('resize', () => {
        if (mainWindow.getBrowserView() === browserView) {
            updateBrowserViewBounds();
        }
    });

    // Initialize browser controller
    const browserController = {
        navigate: async (url) => {
            return new Promise((resolve, reject) => {
                browserView.webContents.loadURL(url).then(resolve).catch(reject);

                // Set timeout
                const timeout = setTimeout(() => {
                    reject(new Error('Navigation timeout'));
                }, config.research.pageTimeout);

                browserView.webContents.once('did-finish-load', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        },

        extractContent: async () => {
            try {
                const result = await browserView.webContents.executeJavaScript(`
          (function() {
            // Remove scripts, styles, and other non-content elements
            const clonedDoc = document.cloneNode(true);
            const scripts = clonedDoc.querySelectorAll('script, style, noscript, iframe');
            scripts.forEach(el => el.remove());
            
            // Get text content from body
            const body = clonedDoc.body;
            if (!body) return '';
            
            return body.innerText || body.textContent || '';
          })();
        `);
                return result;
            } catch (error) {
                console.error('Failed to extract content:', error);
                return '';
            }
        },

        extractLinks: async () => {
            try {
                const result = await browserView.webContents.executeJavaScript(`
          (function() {
            // Extract actual organic search results from Google
            const searchResults = new Set();
            
            // Target main search result links (the blue titles in Google search)
            const selectors = [
              'div.yuRUbf > a',           // Modern Google layout - main result link
              'h3 > a[href]',              // Title links
              'div.g a[ping]',             // Tracked result links
              'a[data-ved][href^="http"]', // Links with tracking
            ];
            
            selectors.forEach(selector => {
              document.querySelectorAll(selector).forEach(a => {
                const href = a.href;
                if (href && href.startsWith('http')) {
                  try {
                    const url = new URL(href);
                    // Exclude Google's own pages
                    if (!url.hostname.includes('google')) {
                      searchResults.add(href);
                    }
                  } catch (e) {
                    // Invalid URL, skip
                  }
                }
              });
            });
            
            return Array.from(searchResults).slice(0, 15);
          })();
        `);
                console.log(`[BrowserController] Extracted ${result.length} organic search result links`);
                return result;
            } catch (error) {
                console.error('Failed to extract links:', error);
                return [];
            }
        },

        scrollPage: async () => {
            try {
                await browserView.webContents.executeJavaScript(`
          window.scrollTo({
            top: document.body.scrollHeight / 2,
            behavior: 'smooth'
          });
        `);
            } catch (error) {
                console.error('Failed to scroll:', error);
            }
        },

        getCurrentUrl: () => {
            return browserView.webContents.getURL();
        },

        clickElement: async (selector) => {
            try {
                const result = await browserView.webContents.executeJavaScript(`
          (function() {
            const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (element) {
              element.click();
              return true;
            }
            return false;
          })();
        `);
                return result;
            } catch (error) {
                console.error('Failed to click element:', error);
                return false;
            }
        },

        clickLinkByText: async (text) => {
            try {
                const result = await browserView.webContents.executeJavaScript(`
          (function() {
            const links = Array.from(document.querySelectorAll('a'));
            const link = links.find(a => a.textContent.toLowerCase().includes('${text.toLowerCase().replace(/'/g, "\\'")}'));
            if (link) {
              link.click();
              return true;
            }
            return false;
          })();
        `);
                return result;
            } catch (error) {
                console.error('Failed to click link:', error);
                return false;
            }
        },

        extractClickableElements: async () => {
            try {
                const result = await browserView.webContents.executeJavaScript(`
          (function() {
            const clickables = [];
            
            // Get all links with meaningful text
            document.querySelectorAll('a[href]').forEach(a => {
              const text = a.textContent.trim();
              const href = a.href;
              
              // Only include links with text and valid URLs
              if (text && text.length > 3 && text.length < 200 && href && href.startsWith('http')) {
                // Skip navigation/footer links
                const isNav = a.closest('nav, footer, header, .nav, .menu, .footer, .sidebar');
                if (!isNav) {
                  clickables.push({
                    text: text,
                    url: href,
                    type: 'link'
                  });
                }
              }
            });
            
            // Limit to 20 most relevant-looking links
            return clickables.slice(0, 20);
          })();
        `);
                console.log(`[BrowserController] Found ${result.length} clickable elements on page`);
                return result;
            } catch (error) {
                console.error('Failed to extract clickable elements:', error);
                return [];
            }
        }
    };

    // Initialize research agent
    researchAgent = new ResearchAgent(browserController, (status) => {
        // Send status updates to renderer
        mainWindow.webContents.send('status-update', status);
        mainWindow.webContents.send('activity-log', {
            message: status.message,
            type: status.type,
            timestamp: status.timestamp
        });
    });

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
}

function updateBrowserViewBounds() {
    const { width, height } = mainWindow.getBounds();
    const controlPanelWidth = 500; // Match the CSS width
    browserView.setBounds({
        x: 0,
        y: 0,
        width: width - controlPanelWidth,
        height: height
    });
}

// IPC Handlers
// IPC Handlers
ipcMain.on('start-research', async (event, data) => {
    // Handle both string (legacy) and object (new) format
    const query = typeof data === 'string' ? data : data.query;
    const customInstructions = typeof data === 'object' ? (data.customInstructions || '') : '';

    if (!query || query.trim() === '') {
        event.sender.send('error', { message: 'Please enter a research query' });
        return;
    }

    try {
        // Show the browser view when research starts
        mainWindow.setBrowserView(browserView);
        updateBrowserViewBounds();

        const report = await researchAgent.startResearch(query, customInstructions);

        if (!report.cancelled) {
            event.sender.send('research-complete', report);
        }
    } catch (error) {
        event.sender.send('error', { message: error.message });
    } finally {
        // Keep the browser view visible so you can see the last page
        // Uncomment the line below if you want to hide it after research
        // mainWindow.setBrowserView(null);
    }
});

ipcMain.on('stop-research', () => {
    if (researchAgent) {
        researchAgent.stop();
    }
});

ipcMain.on('export-report', async (event, content) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Research Report',
        defaultPath: `research-report-${Date.now()}.md`,
        filters: [
            { name: 'Markdown Files', extensions: ['md'] },
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (filePath) {
        try {
            fs.writeFileSync(filePath, content, 'utf8');
            event.sender.send('status-update', {
                message: `Report saved to ${filePath}`,
                type: 'success'
            });
        } catch (error) {
            event.sender.send('error', { message: `Failed to save report: ${error.message}` });
        }
    }
});

// App lifecycle
app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
