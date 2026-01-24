const axios = require('axios');
const config = require('../config');

class OllamaService {
    constructor() {
        this.host = config.ollama.host;
        this.model = config.ollama.model;
        this.temperature = config.ollama.temperature;
        this.timeout = config.ollama.timeout;
        this.bearerToken = config.ollama.bearerToken;
        this.cache = new Map(); // Add response cache
    }

    /**
     * Generate cache key from prompt
     */
    getCacheKey(prompt, options = {}) {
        return `${options.model || this.model}:${prompt}`;
    }

    /**
     * Generate a completion from Ollama
     */
    async generateCompletion(prompt, options = {}) {
        // Check cache first
        const cacheKey = this.getCacheKey(prompt, options);
        if (this.cache.has(cacheKey)) {
            console.log('[OllamaService] Cache HIT for prompt');
            return this.cache.get(cacheKey);
        }

        try {
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
            // Cache the response
            this.cache.set(cacheKey, result);
            console.log(`[OllamaService] Cached response (cache size: ${this.cache.size})`);

            return result;
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Cannot connect to Ollama. Make sure Ollama is running (ollama serve)');
            }
            throw new Error(`Ollama error: ${error.message}`);
        }
    }

    /**
     * Generate a structured JSON response with better error handling
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
     * Test connection to Ollama
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
     * Get list of available models
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
