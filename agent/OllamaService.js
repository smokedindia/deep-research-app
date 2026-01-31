/**
 * Ollama Service - Interface for Ollama LLM API
 * Provides methods for generating completions, JSON responses, and connection management
 * Includes caching and retry logic for reliability
 */

const axios = require('axios');
const config = require('../config');

class OllamaService {
    /**
     * Create an OllamaService instance
     */
    constructor() {
        this.host = config.ollama.host;
        this.model = config.ollama.model;
        this.temperature = config.ollama.temperature;
        this.timeout = config.ollama.timeout;
        this.bearerToken = config.ollama.bearerToken;
        this.cache = new Map(); // Add response cache - Map maintains insertion order
        this.maxCacheSize = 100; // Limit cache size to prevent memory issues
    }

    /**
     * Generate cache key from prompt and options
     * @param {string} prompt - The prompt text
     * @param {Object} options - Generation options
     * @returns {string} Cache key
     */
    getCacheKey(prompt, options = {}) {
        return `${options.model || this.model}:${prompt}`;
    }

    /**
     * Get from cache and update access time (LRU)
     * @param {string} key - Cache key
     * @returns {string|undefined} Cached value or undefined
     */
    getFromCache(key) {
        if (!this.cache.has(key)) {
            return undefined;
        }
        // Move to end (most recently used) by deleting and re-adding
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    /**
     * Add to cache with LRU eviction
     * @param {string} key - Cache key
     * @param {string} value - Value to cache
     */
    addToCache(key, value) {
        // If at capacity, remove least recently used (first item)
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            console.log('[OllamaService] Cache full, evicted least recently used entry');
        }
        this.cache.set(key, value);
    }

    /**
     * Retry helper for network operations
     * @param {Function} operation - The async operation to retry
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} delay - Delay between retries in ms
     * @returns {Promise} Result of the operation
     */
    async retryOperation(operation, maxRetries = 3, delay = 1000) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.log(`[OllamaService] Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
                
                if (attempt < maxRetries) {
                    console.log(`[OllamaService] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    // Exponential backoff
                    delay *= 2;
                }
            }
        }
        throw lastError;
    }

    /**
     * Generate a completion from Ollama
     */
    async generateCompletion(prompt, options = {}) {
        // Check cache first with LRU
        const cacheKey = this.getCacheKey(prompt, options);
        const cachedValue = this.getFromCache(cacheKey);
        if (cachedValue) {
            console.log('[OllamaService] Cache HIT for prompt');
            return cachedValue;
        }

        return await this.retryOperation(async () => {
            const headers = {
                'Content-Type': 'application/json'
            };

            // Add bearer token if configured
            if (this.bearerToken) {
                headers['Authorization'] = `Bearer ${this.bearerToken}`;
            }

            const response = await axios.post(
                `${this.host}/api/generate`,
                {
                    model: options.model || this.model,
                    prompt: prompt,
                    temperature: options.temperature || this.temperature,
                    stream: false
                },
                {
                    timeout: this.timeout,
                    headers: headers
                }
            );

            const result = response.data.response;
            // Cache the response with LRU eviction
            this.addToCache(cacheKey, result);
            console.log(`[OllamaService] Cached response (cache size: ${this.cache.size})`);

            return result;
        }, 3, 1000).catch(error => {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Cannot connect to Ollama. Make sure Ollama is running (ollama serve)');
            }
            throw new Error(`Ollama error: ${error.message}`);
        });
    }

    /**
     * Generate a structured JSON response with better error handling
     * @param {string} prompt - The prompt requesting JSON output
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Parsed JSON response
     * @throws {Error} If response is not valid JSON
     */
    async generateJSON(prompt, options = {}) {
        const fullPrompt = `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. Do not include any text before or after the JSON object. Ensure all strings are properly quoted.`;
        const response = await this.generateCompletion(fullPrompt, options);

        try {
            // Clean up the response
            let cleanedResponse = response.trim();

            // Fix common JSON formatting issues
            // Remove markdown code blocks if present  
            cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');

            // Try to extract the first complete JSON object
            const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                let jsonStr = jsonMatch[0];

                // Fix common issues: replace -> with :
                jsonStr = jsonStr.replace(/->/g, ':');

                console.log('[OllamaService] Attempting to parse JSON:', jsonStr.substring(0, 200));
                return JSON.parse(jsonStr);
            }

            // Try parsing directly
            return JSON.parse(cleanedResponse);
        } catch (error) {
            console.error('[OllamaService] Failed to parse JSON response:', response.substring(0, 500));
            console.error('[OllamaService] Parse error:', error.message);
            throw new Error('Ollama did not return valid JSON');
        }
    }

    /**
     * Test connection to Ollama server
     * @returns {Promise<boolean>} True if connection successful
     */
    async testConnection() {
        try {
            console.log('[OllamaService] Testing connection to:', this.host);

            const headers = {};
            if (this.bearerToken) {
                headers['Authorization'] = `Bearer ${this.bearerToken}`;
            }

            const response = await axios.get(`${this.host}/api/tags`, {
                timeout: 5000,
                headers: headers
            });
            console.log('[OllamaService] Connection successful! Status:', response.status);
            return response.status === 200;
        } catch (error) {
            console.error('[OllamaService] Connection test FAILED');
            console.error('[OllamaService] Error message:', error.message);
            console.error('[OllamaService] Error code:', error.code);
            if (error.response) {
                console.error('[OllamaService] Response status:', error.response.status);
                console.error('[OllamaService] Response data:', error.response.data);
            }
            return false;
        }
    }

    /**
     * Get list of available models from Ollama
     * @returns {Promise<string[]>} Array of model names
     */
    async listModels() {
        try {
            const headers = {};
            if (this.bearerToken) {
                headers['Authorization'] = `Bearer ${this.bearerToken}`;
            }

            const response = await axios.get(`${this.host}/api/tags`, {
                headers: headers
            });
            return response.data.models.map(m => m.name);
        } catch (error) {
            throw new Error(`Failed to list models: ${error.message}`);
        }
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
        console.log('[OllamaService] Cache cleared');
    }
}

module.exports = OllamaService;
