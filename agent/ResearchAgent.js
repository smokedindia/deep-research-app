const OllamaService = require('./OllamaService');
const config = require('../config');

class ResearchAgent {
    constructor(browserController, statusCallback) {
        this.ollama = new OllamaService();
        this.browser = browserController;
        this.statusCallback = statusCallback;
        this.isRunning = false;
        this.visitedUrls = new Set();
        this.collectedInfo = [];
        // NEW: Global memory to track what we know to prevent redundancy
        this.knowledgeSummary = "";
    }

    /**
     * Start the research process
     * @param {string} query - The research query
     * @param {string} customInstructions - Optional custom instructions
     * @returns {Promise<object>} Research report
     */
    async startResearch(query, customInstructions = '') {
        this.isRunning = true;
        this.visitedUrls.clear();
        this.collectedInfo = [];
        this.query = query;
        this.customInstructions = customInstructions;
        this.startTime = Date.now();

        try {
            this.updateStatus('Initializing research agent...');

            // Test Ollama connection
            const connected = await this.ollama.testConnection();
            if (!connected) {
                throw new Error('Cannot connect to Ollama. Please ensure Ollama is running (ollama serve)');
            }

            // NEW: Enrich the query to ensure comprehensive research
            this.updateStatus('Enriching research query...');
            const researchDirective = await this.enrichQuery(query);
            console.log(`[Agent] Enriched directive: ${researchDirective}`);

            this.updateStatus('Planning research strategy...');
            const plan = await this.planResearch(researchDirective);
            console.log(`[Agent] Research plan:`, plan);

            this.updateStatus(`Executing research plan with ${plan.searches.length} search queries...`);

            // Execute searches with timeout protection
            for (let i = 0; i < plan.searches.length && this.isRunning; i++) {
                // Check if we've exceeded max research time
                if (Date.now() - this.startTime > config.research.maxResearchTime) {
                    console.log('[Agent] Maximum research time exceeded, finishing early');
                    this.updateStatus('Research time limit reached, generating report with collected data...', 'warning');
                    break;
                }

                try {
                    const searchQuery = plan.searches[i];
                    // Pass the full directive as context
                    await this.performSearch(searchQuery, 0, researchDirective);
                } catch (searchError) {
                    console.error(`[Agent] Search execution failed for "${plan.searches[i]}":`, searchError.message);
                    this.updateStatus(`Search failed: ${searchError.message}. Continuing...`, 'warning');
                    // Continue to next search query
                }
            }

            if (!this.isRunning) {
                return { cancelled: true };
            }

            this.updateStatus('Synthesizing findings into report...');
            const report = await this.generateReport();

            this.updateStatus('Research complete!');
            return report;

        } catch (error) {
            // Only fail completely if we have NO data at all
            if (this.collectedInfo.length > 0) {
                console.error('[Agent] Research hit error but has data. Generating partial report:', error.message);
                this.updateStatus(`Error encountered: ${error.message}. Generating partial report...`, 'warning');
                return await this.generateReport();
            }

            this.updateStatus(`Error: ${error.message}`, 'error');
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Stop the research process
     */
    stop() {
        this.isRunning = false;
        this.updateStatus('Research stopped by user');
    }

    /**
     * NEW: Enrich the user query into a detailed research directive
     */
    async enrichQuery(query) {
        const customContext = this.customInstructions ? `\nUsers custom instructions: ${this.customInstructions}` : '';
        const prompt = `You are a Senior Research Director. A user has provided a research query. Your job is to expand this into a comprehensive "Research Directive".
        
User Query: "${query}"
${customContext}

Think about:
1. What are the underlying questions?
2. What key terminology should be included?
3. What potential pitfalls or "local minima" (getting stuck on one aspect) should be avoided?

Output a single paragraph comprehensively describing what the research agent should look for. Start with "Investigate..."`;

        try {
            const enrichment = await this.ollama.generateCompletion(prompt);
            return enrichment.trim() || query;
        } catch (error) {
            console.warn('Failed to enrich query:', error.message);
            return query;
        }
    }

    /**
     * Plan the research strategy using Ollama
     */
    async planResearch(directive) {
        const customContext = this.customInstructions ? `\nAdhere to these custom instructions: ${this.customInstructions}` : '';
        const prompt = `You are a research planning assistant. Given a research directive, break it down into 3-4 specific, distinct search queries that will help gather comprehensive information and cover different angles.

Research Directive: "${directive}"
${customContext}

Create a research plan. Respond with JSON in this exact format:
{
  "searches": ["search query 1", "search query 2", "search query 3"]
}`;

        try {
            const plan = await this.ollama.generateJSON(prompt);
            return plan;
        } catch (error) {
            // Fallback to simple plan
            console.warn('Failed to get plan from Ollama, using fallback:', error.message);
            return { searches: [directive] };
        }
    }

    /**
     * Perform a search and explore results
     */
    /**
     * Perform a search and explore results
     */
    async performSearch(searchQuery, depth, context) {
        if (!this.isRunning || depth >= config.research.maxDepth) {
            return;
        }

        try {
            this.updateStatus(`Searching: "${searchQuery}" (depth ${depth})...`);

            // Navigate to search engine
            const searchUrl = config.research.searchEngine + encodeURIComponent(searchQuery);

            // Try-catch specific to navigation to handle the -3 ERR_ABORTED gracefully
            try {
                // Ensure any previous navigation is hard-stopped before starting new one
                if (this.browser.stopNode) await this.browser.stopNode();
                await this.browser.navigate(searchUrl);
                await this.wait(3000); // Wait for page to load
            } catch (navError) {
                console.warn(`[Agent] Search navigation failed (${navError.message}), retrying once...`);
                await this.wait(2000);
                await this.browser.navigate(searchUrl);
                await this.wait(3000);
            }

            // Extract page content
            this.updateStatus('Analyzing search results...');
            let pageContent = '';
            try {
                pageContent = await this.browser.extractContent();
            } catch (contentError) {
                console.warn('[Agent] Could not extract search results:', contentError.message);
                return;
            }

            // Get links from search results
            let links = [];
            try {
                links = await this.browser.extractLinks();
            } catch (linkError) {
                console.warn('[Agent] Could not extract links:', linkError.message);
                return;
            }

            console.log(`[Agent] Extracted ${links.length} total links from search page`);

            // Filter out already visited, problematic sites, and irrelevant links
            const newLinks = links
                .filter(url => !this.visitedUrls.has(url))
                .filter(url => {
                    // Exclude Google's own pages
                    const isGooglePage = url.includes('/search') ||
                        url.includes('google.com/preferences') ||
                        url.includes('google.com/intl') ||
                        url.includes('google.com/about') ||
                        url.includes('google.co.kr/intl') ||
                        url.includes('google.co/intl') ||
                        url.includes('accounts.google') ||
                        url.includes('policies.google') ||
                        url.includes('support.google') ||
                        url.includes('maps.google');

                    // Exclude problematic sites that can crash Electron
                    const isProblematicSite = url.includes('youtube.com') ||
                        url.includes('youtu.be') ||
                        url.includes('vimeo.com') ||
                        url.includes('tiktok.com') ||
                        url.includes('facebook.com') ||
                        url.includes('instagram.com') ||
                        url.includes('twitter.com') ||
                        url.includes('x.com') ||
                        url.includes('/share?') ||
                        url.includes('linkedin.com/share');

                    return !isGooglePage && !isProblematicSite;
                });

            console.log(`[Agent] Filtered to ${newLinks.length} new/relevant links`);
            if (newLinks.length > 0) {
                console.log(`[Agent] Sample links:`, newLinks.slice(0, 5));
            }

            // Ask Ollama which links are most relevant
            if (newLinks.length > 0 && this.isRunning) {
                this.updateStatus(`Selecting most relevant links from ${newLinks.length} candidates...`);
                const relevantLinks = await this.selectRelevantLinks(newLinks, searchQuery);
                console.log(`[Agent] Ollama selected ${relevantLinks.length} relevant links:`, relevantLinks);

                // Visit relevant links
                for (const link of relevantLinks) {
                    if (!this.isRunning) break;
                    await this.visitPage(link, context || searchQuery, depth);
                }
            } else {
                console.log(`[Agent] No new links to explore for query: ${searchQuery}`);
            }
        } catch (error) {
            console.error(`[Agent] Error during search for "${searchQuery}":`, error.message);
            // Don't throw, just log and return so the next search can proceed
        }
    }

    /**
     * Use Ollama to select most relevant links
     */
    async selectRelevantLinks(links, query) {
        const customContext = this.customInstructions ? `\nAdhere to these custom instructions: ${this.customInstructions}` : '';

        // Inject Memory to prevent redundancy
        const memoryContext = this.knowledgeSummary ? `\nWe already know the following (DO NOT select links that duplicate this): "${this.knowledgeSummary.substring(0, 500)}..."` : '';

        const prompt = `Given this search query: "${query}"
${customContext}
${memoryContext}

Which of these links are most relevant? Select up to 3 most relevant links that offer NEW information.

Links:
${links.slice(0, 10).map((link, i) => `${i + 1}. ${link}`).join('\n')}

Respond with JSON containing the selected URLs. IMPORTANT: Only select URLs from the list above:
{
  "selectedUrls": ["url1", "url2", "url3"]
}`;

        try {
            const result = await this.ollama.generateJSON(prompt);
            console.log('[Agent] Ollama link selection result:', result);
            if (result.selectedUrls && result.selectedUrls.length > 0) {
                // Filter out any hallucinated URLs that aren't in the original list
                const validUrls = result.selectedUrls.filter(url => links.includes(url));
                if (validUrls.length > 0) {
                    return validUrls;
                }
            }
            // Fallback if Ollama returns empty or invalid URLs
            console.warn('[Agent] Ollama returned invalid selection, using first 3');
            return links.slice(0, 3);
        } catch (error) {
            console.warn('Failed to select links, using first 3:', error.message);
            return links.slice(0, 3);
        }
    }

    /**
     * Visit a page by clicking on its link physically (instead of direct navigation)
     */
    async visitPage(url, context, depth) {
        if (this.visitedUrls.has(url) || !this.isRunning) {
            return;
        }

        this.updateStatus(`Visiting: ${url.substring(0, 60)}...`);
        this.visitedUrls.add(url);

        try {
            // Try to find and click the link on the current page
            let navigated = false;

            try {
                console.log(`[Agent] Attempting to find and click link: ${url}`);

                // Find the link element by href and click it physically
                const linkClicked = await this.browser.page.evaluate((targetUrl) => {
                    const links = Array.from(document.querySelectorAll('a[href]'));
                    const matchingLink = links.find(a => a.href === targetUrl);
                    if (matchingLink) {
                        // Scroll link into view
                        matchingLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        return true;
                    }
                    return false;
                }, url);

                if (linkClicked) {
                    await this.wait(500);

                    // Now find and physically click the link with mouse
                    const linkElement = await this.browser.page.evaluateHandle((targetUrl) => {
                        const links = Array.from(document.querySelectorAll('a[href]'));
                        return links.find(a => a.href === targetUrl);
                    }, url);

                    if (linkElement) {
                        const box = await linkElement.asElement().boundingBox();
                        if (box) {
                            console.log(`[Agent] Clicking link at position (${box.x}, ${box.y})`);
                            // Move mouse and click physically
                            await this.browser.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
                            await this.browser.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

                            // Wait for navigation after click
                            await this.browser.page.waitForNavigation({
                                waitUntil: 'networkidle2',
                                timeout: config.research.pageTimeout
                            }).catch(() => {
                                console.log('[Agent] Navigation after click timed out, continuing anyway');
                            });

                            navigated = true;
                        }
                    }
                }
            } catch (clickError) {
                console.log(`[Agent] Could not click link (${clickError.message}), falling back to direct navigation`);
            }

            // Fallback: if clicking failed, navigate directly
            if (!navigated) {
                console.log(`[Agent] Using direct navigation to: ${url}`);
                await this.browser.navigate(url);
            }

            await this.wait(3000);

            // Scroll to load dynamic content
            await this.browser.scrollPage();
            await this.wait(config.research.scrollDelay);

            // Extract content
            const content = await this.browser.extractContent();

            if (content && content.length > 100) {
                // Ask Ollama to extract relevant information
                const info = await this.extractRelevantInfo(content, context);

                if (info && info.length > 0) {
                    this.collectedInfo.push({
                        url,
                        context,
                        depth,
                        information: info,
                        timestamp: new Date().toISOString()
                    });

                    this.updateStatus(`Extracted information from ${url.substring(0, 40)}...`);
                    console.log(`[Agent] Successfully extracted info from ${url}`);

                    // NEW: Update Global Knowledge Memory with what we just learned
                    await this.updateKnowledgeMemory(info);
                }

                // **NEW FEATURE**: Explore clickable elements on the page if depth allows
                if (depth < config.research.maxDepth - 1 && this.isRunning && this.browser.extractClickableElements) {
                    await this.explorePageLinks(url, context, depth);
                }
            }

        } catch (error) {
            console.error(`Failed to visit ${url}:`, error.message);
            this.updateStatus(`Failed to load ${url.substring(0, 40)}...`);
        }
    }

    /**
     * NEW: Explore clickable links within a page
     */
    async explorePageLinks(currentUrl, context, depth) {
        try {
            this.updateStatus('Checking for informative links on page...');
            const clickables = await this.browser.extractClickableElements();

            if (clickables && clickables.length > 0) {
                console.log(`[Agent] Found ${clickables.length} clickable elements on ${currentUrl}`);

                // Filter out already visited URLs (and problematic sites)
                const newClickables = clickables.filter(c => {
                    if (this.visitedUrls.has(c.url)) return false;
                    const isProblematic = c.url.includes('twitter.com') ||
                        c.url.includes('x.com') ||
                        c.url.includes('facebook.com') ||
                        c.url.includes('/share?') ||
                        c.url.includes('linkedin.com/share');
                    return !isProblematic;
                });

                if (newClickables.length > 0) {
                    // Ask Ollama which links to follow
                    const linksToFollow = await this.selectInformativeLinks(newClickables, context);

                    if (linksToFollow && linksToFollow.length > 0) {
                        console.log(`[Agent] Will explore ${linksToFollow.length} informative links from page`);

                        // Visit selected links (limit to 2 per page to avoid rabbit holes)
                        for (const linkInfo of linksToFollow.slice(0, 2)) {
                            if (!this.isRunning) break;
                            this.updateStatus(`Following link: "${linkInfo.text.substring(0, 40)}..."...`);
                            await this.visitPage(linkInfo.url, context, depth + 1);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to explore page links:', error.message);
        }
    }

    /**
     * Use Ollama to select informative links from clickable elements
     */
    async selectInformativeLinks(clickables, query) {
        const customContext = this.customInstructions ? `\nAdhere to these custom instructions: ${this.customInstructions}` : '';

        // Inject Memory to prevent redundancy
        const memoryContext = this.knowledgeSummary ? `\nWe already know: "${this.knowledgeSummary.substring(0, 300)}..."` : '';

        const prompt = `Given our research goal: "${query}"
${customContext}
${memoryContext}

Which of these links on the current page seem informative and will provide NEW information (avoiding what we already know)? Select up to 2 most relevant ones.

Links:
${clickables.slice(0, 10).map((c, i) => `${i + 1}. "${c.text}" -> ${c.url}`).join('\n')}

Respond with JSON containing the link texts and URLs:
{
  "selectedLinks": [
    {"text": "link text", "url": "https://..."},
    {"text": "another link", "url": "https://..."}
  ]
}`;

        try {
            const result = await this.ollama.generateJSON(prompt);
            if (result.selectedLinks && result.selectedLinks.length > 0) {
                return result.selectedLinks;
            }
            return [];
        } catch (error) {
            console.warn('Failed to select informative links:', error.message);
            return [];
        }
    }

    /**
     * Extract relevant information from page content using Ollama
     */
    async extractRelevantInfo(content, context) {
        // Truncate content to avoid overwhelming the LLM
        const truncatedContent = content.substring(0, 4000);
        const customContext = this.customInstructions ? `\nAdhere to these custom instructions: ${this.customInstructions}` : '';

        const prompt = `Extract key information relevant to this research query: "${context}"
${customContext}

Page Content:
${truncatedContent}

Extract 2-3 key facts, insights, or pieces of information that are relevant to the research query. Be concise and factual.

Respond with just the extracted information as plain text, one insight per line.`;

        try {
            const response = await this.ollama.generateCompletion(prompt);
            return response.trim();
        } catch (error) {
            console.warn('Failed to extract info:', error.message);
            return '';
        }
    }

    /**
     * NEW: Update global knowledge memory to prevent redundancy
     */
    async updateKnowledgeMemory(newInfo) {
        try {
            const prompt = `You are updating a 'Knowledge Memory' for a research agent.
Current Memory:
"${this.knowledgeSummary}"

New Information Just Found:
"${newInfo}"

Task: Merge the new information into the current memory. Keep it concise (max 500 words).
- If the new information duplicates what we already know, ignore it.
- If it adds new details, integrate them.
- Maintain a summary style.

Respond ONLY with the updated memory text.`;

            const updatedMemory = await this.ollama.generateCompletion(prompt);
            this.knowledgeSummary = updatedMemory.trim();
            console.log(`[Agent] Updated knowledge memory (length: ${this.knowledgeSummary.length} chars)`);
        } catch (error) {
            console.warn('Failed to update knowledge memory:', error.message);
        }
    }

    /**
     * Generate final research report
     */
    async generateReport() {
        console.log(`[Agent] Generating report with ${this.collectedInfo.length} sources`);

        const customContext = this.customInstructions ? `\nAdhere to these custom instructions: ${this.customInstructions}` : '';
        const prompt = `You are a research report writer. Based on the collected information below, write a comprehensive research report about: "${this.query}"
${customContext}

Collected Information:
${this.collectedInfo.map((item, i) => `
Source [${i + 1}]: ${item.url}
Context: ${item.context}
Information: ${item.information}
`).join('\n---\n')}

Write a well-structured report in Markdown format with:
1. A clear title
2. Executive summary
3. Main findings organized by topic
4. Sources/References section

IMPORTANT: You MUST strictly cite your sources. Every distinct claim or fact must have an inline citation like [1], [2] corresponding to the Source number provided above. Do not output generic composition without specific source attribution.

Make it comprehensive but concise. Use proper Markdown formatting.`;

        try {
            const reportContent = await this.ollama.generateCompletion(prompt);

            return {
                query: this.query,
                timestamp: new Date().toISOString(),
                sourcesCount: this.collectedInfo.length,
                content: reportContent,
                sources: this.collectedInfo.map(item => ({
                    url: item.url,
                    context: item.context
                }))
            };
        } catch (error) {
            // Fallback report
            return {
                query: this.query,
                timestamp: new Date().toISOString(),
                sourcesCount: this.collectedInfo.length,
                content: this.generateFallbackReport(),
                sources: this.collectedInfo.map(item => ({
                    url: item.url,
                    context: item.context
                }))
            };
        }
    }

    /**
     * Generate a simple fallback report if Ollama fails
     */
    generateFallbackReport() {
        let report = `# Research Report: ${this.query}\n\n`;
        report += `Generated: ${new Date().toLocaleString()}\n\n`;
        report += `## Summary\n\nCollected information from ${this.collectedInfo.length} sources.\n\n`;
        report += `## Findings\n\n`;

        this.collectedInfo.forEach((item, i) => {
            report += `### Source ${i + 1}\n`;
            report += `**URL:** ${item.url}\n\n`;
            report += `**Information:**\n${item.information}\n\n`;
        });

        report += `## Sources\n\n`;
        this.collectedInfo.forEach((item, i) => {
            report += `${i + 1}. [${item.url}](${item.url})\n`;
        });

        return report;
    }

    /**
     * Update status
     */
    updateStatus(message, type = 'info') {
        console.log(`[Agent] ${message}`);
        if (this.statusCallback) {
            this.statusCallback({ message, type, timestamp: new Date().toISOString() });
        }
    }

    /**
     * Wait helper
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ResearchAgent;
