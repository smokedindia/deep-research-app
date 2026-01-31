#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const PuppeteerBrowserController = require('./agent/PuppeteerBrowserController');
const ResearchAgent = require('./agent/ResearchAgent');

// Colors for terminal output (simple fallback if chalk not available)
let chalk;
try {
    chalk = require('chalk');
} catch (e) {
    // Fallback without colors
    chalk = {
        green: (s) => s,
        blue: (s) => s,
        yellow: (s) => s,
        red: (s) => s,
        gray: (s) => s,
        bold: (s) => s,
        cyan: (s) => s
    };
}

console.log(chalk.bold.cyan('\n🔬 Deep Research Agent - External Browser Edition\n'));

/**
 * Status callback for research agent
 */
function statusCallback(status) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;

    switch (status.type) {
        case 'error':
            console.log(chalk.red(`${prefix} ❌ ${status.message}`));
            break;
        case 'warning':
            console.log(chalk.yellow(`${prefix} ⚠️  ${status.message}`));
            break;
        case 'success':
            console.log(chalk.green(`${prefix} ✅ ${status.message}`));
            break;
        default:
            console.log(chalk.blue(`${prefix} 🔍 ${status.message}`));
    }
}

/**
 * Save report to file
 */
function saveReport(report) {
    const timestamp = Date.now();
    const filename = `research-report-${timestamp}.md`;
    const filepath = path.join(process.cwd(), filename);

    fs.writeFileSync(filepath, report.content, 'utf8');
    console.log(chalk.green(`\n✅ Report saved to: ${chalk.bold(filename)}`));

    return filepath;
}

/**
 * Display report summary
 */
function displayReportSummary(report) {
    console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold.cyan('📊 RESEARCH COMPLETE'));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    console.log(chalk.bold('Query: ') + chalk.cyan(report.query));
    console.log(chalk.bold('Sources: ') + chalk.green(report.sourcesCount));
    console.log(chalk.bold('Timestamp: ') + chalk.gray(new Date(report.timestamp).toLocaleString()));

    console.log(chalk.bold('\n📄 Report Preview:\n'));

    // Show first 500 characters of report
    const preview = report.content.substring(0, 500);
    console.log(chalk.gray(preview));
    if (report.content.length > 500) {
        console.log(chalk.gray('...'));
    }

    console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
}

/**
 * Prompt user for research query
 */
function promptForQuery() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(chalk.bold.cyan('🔍 Enter your research query: '), (query) => {
            rl.close();
            resolve(query);
        });
    });
}

/**
 * Prompt for custom instructions (optional)
 */
function promptForInstructions() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log(chalk.gray('(Optional) Enter custom instructions, or press Enter to skip'));
        rl.question(chalk.bold.cyan('📝 Custom instructions: '), (instructions) => {
            rl.close();
            resolve(instructions || '');
        });
    });
}

/**
 * Validate and sanitize research query
 * @param {string} query - The raw query string
 * @returns {string} Sanitized query
 */
function validateQuery(query) {
    if (!query || typeof query !== 'string') {
        throw new Error('Query must be a non-empty string');
    }

    const sanitized = query.trim();
    
    if (sanitized.length === 0) {
        throw new Error('Query cannot be empty');
    }
    
    if (sanitized.length > 500) {
        throw new Error('Query is too long (max 500 characters)');
    }
    
    // Remove potentially dangerous characters while keeping the query readable
    const cleaned = sanitized.replace(/[<>]/g, '');
    
    return cleaned;
}

/**
 * Main function
 */
async function main() {
    let browserController = null;
    let researchAgent = null;

    try {
        // Get query from command line or prompt
        let query = process.argv.slice(2).join(' ');

        if (!query || query.trim() === '') {
            query = await promptForQuery();
        }

        // Validate and sanitize query
        try {
            query = validateQuery(query);
        } catch (validationError) {
            console.log(chalk.red(`❌ Invalid query: ${validationError.message}`));
            process.exit(1);
        }

        console.log(chalk.bold.green(`\n✅ Query: "${query}"\n`));

        // Optional: prompt for custom instructions
        // For now, we'll skip this to keep it simple
        const customInstructions = '';

        // Initialize browser controller
        console.log(chalk.bold.cyan('🚀 Initializing browser automation...\n'));
        browserController = new PuppeteerBrowserController();
        await browserController.launch();

        // Initialize research agent
        researchAgent = new ResearchAgent(browserController, statusCallback);

        console.log(chalk.bold.cyan('🔬 Starting research...\n'));
        console.log(chalk.gray('Note: You can watch the browser window for real-time progress!\n'));

        // Start research
        const report = await researchAgent.startResearch(query, customInstructions);

        if (report.cancelled) {
            console.log(chalk.yellow('\n⚠️  Research was cancelled.'));
        } else {
            // Display summary
            displayReportSummary(report);

            // Save report
            saveReport(report);
        }

    } catch (error) {
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
        console.error(chalk.gray(error.stack));
        process.exit(1);
    } finally {
        // Clean up
        if (browserController) {
            console.log(chalk.gray('\n🧹 Cleaning up...'));
            await browserController.close();
        }

        console.log(chalk.bold.green('\n👋 Goodbye!\n'));
        process.exit(0);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\n⚠️  Interrupted by user. Shutting down...'));
    process.exit(0);
});

// Run main
main();
