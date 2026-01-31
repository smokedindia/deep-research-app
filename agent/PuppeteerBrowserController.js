const puppeteer = require('puppeteer');
const config = require('../config');

/**
 * Browser controller using Puppeteer for visible, physical browser automation
 */
class PuppeteerBrowserController {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    /**
     * Launch the browser instance
     */
    async launch() {
        console.log('[BrowserController] Launching visible Chrome/Chromium browser...');

        this.browser = await puppeteer.launch({
            headless: config.puppeteer.headless,
            slowMo: config.puppeteer.slowMo,
            defaultViewport: config.puppeteer.defaultViewport,
            args: config.puppeteer.args
        });

        this.page = await this.browser.newPage();

        // Set user agent
        await this.page.setUserAgent(config.puppeteer.userAgent);

        // Set viewport
        await this.page.setViewport(config.puppeteer.defaultViewport);

        console.log('[BrowserController] Browser launched successfully');
    }

    /**
     * Navigate to a URL with physical search interaction for Google searches
     * @param {string} url - The URL to navigate to
     * @param {number} retries - Number of retries for navigation (default: 2)
     */
    async navigate(url, retries = 2) {
        if (!this.page) {
            throw new Error('Browser not initialized. Call launch() first.');
        }

        console.log(`[BrowserController] Navigating to: ${url}`);

        let lastError;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                // Check if this is a Google search URL
                if (url.includes('google.com/search?q=')) {
                    // Extract the search query from the URL
                    const searchQuery = decodeURIComponent(url.split('?q=')[1]);

                    console.log(`[BrowserController] Performing physical search with mouse/keyboard for: "${searchQuery.substring(0, 60)}..."`);

                    // First, navigate to Google homepage
                    await this.page.goto('https://www.google.com', {
                        waitUntil: 'networkidle2',
                        timeout: config.research.pageTimeout
                    });

                    await this.wait(1000);

                    // Find the search box and click it with mouse
                    const searchBox = await this.page.$('textarea[name="q"], input[name="q"]');

                    if (searchBox) {
                        // Get the bounding box for mouse movement
                        const box = await searchBox.boundingBox();

                        if (box) {
                            console.log('[BrowserController] Moving mouse to search box...');
                            // Move mouse to search box (visible cursor movement)
                            await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
                                steps: 10 // Smooth mouse movement in 10 steps
                            });

                            // Click the search box
                            console.log('[BrowserController] Clicking search box...');
                            await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                            await this.wait(500);
                        }

                        // Type the search query with keyboard (instant typing)
                        console.log('[BrowserController] Typing search query with keyboard...');
                        await this.page.keyboard.type(searchQuery); // No delay for instant typing

                        await this.wait(500);

                        // Press Enter to submit search
                        console.log('[BrowserController] Pressing Enter to search...');
                        await this.page.keyboard.press('Enter');

                        // Wait for search results to load
                        await this.page.waitForNavigation({
                            waitUntil: 'networkidle2',
                            timeout: config.research.pageTimeout
                        });

                        console.log('[BrowserController] Search results loaded!');
                    } else {
                        // Fallback to direct navigation if search box not found
                        console.log('[BrowserController] Search box not found, using direct navigation');
                        await this.page.goto(url, {
                            waitUntil: 'networkidle2',
                            timeout: config.research.pageTimeout
                        });
                    }
                } else {
                    // For non-search URLs, navigate directly
                    await this.page.goto(url, {
                        waitUntil: 'networkidle2',
                        timeout: config.research.pageTimeout
                    });
                }

                // Small delay to ensure page is fully rendered
                await this.wait(1000);
                
                // Navigation successful
                return;
            } catch (error) {
                lastError = error;
                console.error(`[BrowserController] Navigation attempt ${attempt}/${retries} failed: ${error.message}`);
                
                if (attempt < retries) {
                    console.log(`[BrowserController] Retrying navigation...`);
                    await this.wait(2000);
                } else {
                    console.error(`[BrowserController] All navigation attempts failed`);
                    throw error;
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Extract text content from the current page
     * @returns {Promise<string>} The page text content
     */
    async extractContent() {
        if (!this.page) {
            throw new Error('Browser not initialized.');
        }

        try {
            const content = await this.page.evaluate(() => {
                // Remove scripts, styles, and other non-content elements
                const clonedDoc = document.cloneNode(true);
                const scripts = clonedDoc.querySelectorAll('script, style, noscript, iframe');
                scripts.forEach(el => el.remove());

                // Get text content from body
                const body = clonedDoc.body;
                if (!body) return '';

                return body.innerText || body.textContent || '';
            });

            console.log(`[BrowserController] Extracted ${content.length} characters of content`);
            return content;
        } catch (error) {
            console.error('[BrowserController] Failed to extract content:', error.message);
            // Return empty string instead of throwing to allow graceful continuation
            return '';
        }
    }

    /**
     * Extract links from the current page (search results)
     * @returns {Promise<string[]>} Array of URLs
     */
    async extractLinks() {
        if (!this.page) {
            throw new Error('Browser not initialized.');
        }

        try {
            const links = await this.page.evaluate(() => {
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
            });

            console.log(`[BrowserController] Extracted ${links.length} organic search result links`);
            return links;
        } catch (error) {
            console.error('[BrowserController] Failed to extract links:', error.message);
            // Return empty array instead of throwing to allow graceful continuation
            return [];
        }
    }

    /**
     * Scroll the page smoothly using mouse wheel
     */
    async scrollPage() {
        if (!this.page) {
            throw new Error('Browser not initialized.');
        }

        try {
            // Scroll using mouse wheel for more realistic interaction
            await this.page.evaluate(() => {
                window.scrollTo({
                    top: document.body.scrollHeight / 2,
                    behavior: 'smooth'
                });
            });

            // Wait for scroll animation
            await this.wait(500);
        } catch (error) {
            console.error('[BrowserController] Failed to scroll:', error.message);
        }
    }

    /**
     * Get the current URL
     * @returns {string} Current page URL
     */
    getCurrentUrl() {
        if (!this.page) {
            return '';
        }
        return this.page.url();
    }

    /**
     * Click an element by selector using physical mouse click
     * @param {string} selector - CSS selector
     * @returns {Promise<boolean>} True if successful
     */
    async clickElement(selector) {
        if (!this.page) {
            throw new Error('Browser not initialized.');
        }

        try {
            const element = await this.page.$(selector);
            if (element) {
                const box = await element.boundingBox();
                if (box) {
                    // Move mouse and click physically
                    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
                    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    await this.wait(1000);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error(`[BrowserController] Failed to click element: ${error.message}`);
            return false;
        }
    }

    /**
     * Click a link by its text content using physical mouse
     * @param {string} text - Text to search for in links
     * @returns {Promise<boolean>} True if successful
     */
    async clickLinkByText(text) {
        if (!this.page) {
            throw new Error('Browser not initialized.');
        }

        try {
            // Find link element by text
            const linkHandle = await this.page.evaluateHandle((searchText) => {
                const links = Array.from(document.querySelectorAll('a'));
                return links.find(a => a.textContent.toLowerCase().includes(searchText.toLowerCase()));
            }, text);

            if (linkHandle) {
                const box = await linkHandle.asElement().boundingBox();
                if (box) {
                    // Move mouse and click physically
                    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
                    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    await this.wait(1000);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error(`[BrowserController] Failed to click link: ${error.message}`);
            return false;
        }
    }

    /**
     * Extract clickable elements from the current page
     * @returns {Promise<Array>} Array of clickable elements with text and URL
     */
    async extractClickableElements() {
        if (!this.page) {
            throw new Error('Browser not initialized.');
        }

        try {
            const clickables = await this.page.evaluate(() => {
                const elements = [];

                // Get all links with meaningful text
                document.querySelectorAll('a[href]').forEach(a => {
                    const text = a.textContent.trim();
                    const href = a.href;

                    // Only include links with text and valid URLs
                    if (text && text.length > 3 && text.length < 200 && href && href.startsWith('http')) {
                        // Skip navigation/footer links
                        const isNav = a.closest('nav, footer, header, .nav, .menu, .footer, .sidebar');
                        if (!isNav) {
                            elements.push({
                                text: text,
                                url: href,
                                type: 'link'
                            });
                        }
                    }
                });

                // Limit to 20 most relevant-looking links
                return elements.slice(0, 20);
            });

            console.log(`[BrowserController] Found ${clickables.length} clickable elements on page`);
            return clickables;
        } catch (error) {
            console.error('[BrowserController] Failed to extract clickable elements:', error.message);
            return [];
        }
    }

    /**
     * Close the browser
     */
    async close() {
        if (this.browser) {
            console.log('[BrowserController] Closing browser...');
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    /**
     * Handle CAPTCHA challenges (e.g., "I'm not a robot")
     */
    async handleCaptcha() {
        try {
            console.log('[BrowserController] Checking for CAPTCHA...');

            // Wait a bit for CAPTCHA to appear
            await this.wait(2000);

            // Check for reCAPTCHA iframe
            const frames = this.page.frames();
            const recaptchaFrame = frames.find(frame =>
                frame.url().includes('google.com/recaptcha') ||
                frame.url().includes('recaptcha/api2/anchor')
            );

            if (recaptchaFrame) {
                console.log('[BrowserController] reCAPTCHA detected! Attempting to click checkbox...');

                try {
                    // Try to click the reCAPTCHA checkbox within the iframe
                    const checkbox = await recaptchaFrame.$('.recaptcha-checkbox-border, #recaptcha-anchor');

                    if (checkbox) {
                        const box = await checkbox.boundingBox();

                        if (box) {
                            // Calculate position relative to main page
                            // Move mouse and click
                            console.log('[BrowserController] Found reCAPTCHA checkbox, clicking...');
                            await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
                            await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

                            // Wait for CAPTCHA to process
                            console.log('[BrowserController] Waiting for CAPTCHA verification...');
                            await this.wait(3000);

                            console.log('[BrowserController] CAPTCHA clicked successfully!');
                            return true;
                        }
                    }
                } catch (frameError) {
                    console.log('[BrowserController] Could not interact with reCAPTCHA iframe:', frameError.message);
                }
            }

            // Also check for other CAPTCHA elements in main page
            const captchaSelectors = [
                'iframe[src*="recaptcha"]',
                '#recaptcha',
                '.g-recaptcha',
                '[data-sitekey]'
            ];

            for (const selector of captchaSelectors) {
                const element = await this.page.$(selector);
                if (element) {
                    console.log(`[BrowserController] CAPTCHA element found: ${selector}`);
                    console.log('[BrowserController] Note: Complex CAPTCHAs may require manual solving');
                    return false;
                }
            }

            console.log('[BrowserController] No CAPTCHA detected');
            return false;

        } catch (error) {
            console.log('[BrowserController] CAPTCHA check failed:', error.message);
            return false;
        }
    }

    /**
     * Wait helper
     * @param {number} ms - Milliseconds to wait
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = PuppeteerBrowserController;
