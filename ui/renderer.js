// marked will be loaded from CDN in index.html

// DOM Elements
const queryInput = document.getElementById('queryInput');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const activityLog = document.getElementById('activityLog');
const reportContent = document.getElementById('reportContent');
const exportBtn = document.getElementById('exportBtn');
const tabs = document.querySelectorAll('.tab');
const tabPanes = document.querySelectorAll('.tab-pane');

// State
let isResearching = false;
let currentReport = null;

// Event Listeners
startBtn.addEventListener('click', startResearch);
stopBtn.addEventListener('click', stopResearch);
exportBtn.addEventListener('click', exportReport);

queryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !isResearching) {
        startResearch();
    }
});

// Tab switching
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        switchTab(targetTab);
    });
});

// IPC Listeners
window.electronAPI.onStatusUpdate((data) => {
    updateStatus(data.message, data.type);
});

window.electronAPI.onActivityLog((data) => {
    addLogEntry(data.message, data.type, data.timestamp);
});

window.electronAPI.onResearchComplete((data) => {
    handleResearchComplete(data);
});

window.electronAPI.onError((data) => {
    addLogEntry(`Error: ${data.message}`, 'error');
    setStatus('Error', 'error');
    setResearchingState(false);
});

// Functions
function startResearch() {
    const query = queryInput.value.trim();

    if (!query) {
        alert('Please enter a research query');
        return;
    }

    setResearchingState(true);
    clearActivityLog();
    addLogEntry(`Starting research for: "${query}"`, 'info');
    setStatus('Researching...', 'running');

    window.electronAPI.startResearch(query);
}

function stopResearch() {
    window.electronAPI.stopResearch();
    setStatus('Stopped', 'error');
    setResearchingState(false);
    addLogEntry('Research stopped by user', 'warning');
}

function setResearchingState(researching) {
    isResearching = researching;
    startBtn.disabled = researching;
    stopBtn.disabled = !researching;
    queryInput.disabled = researching;
}

function setStatus(text, type = 'info') {
    statusText.textContent = text;
    statusDot.className = 'status-dot';

    if (type === 'running') {
        statusDot.classList.add('running');
    } else if (type === 'error') {
        statusDot.classList.add('error');
    }
}

function updateStatus(message, type) {
    setStatus(message, type);
}

function addLogEntry(message, type = 'info', timestamp = null) {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;

    const time = timestamp ? new Date(timestamp) : new Date();
    const timeStr = time.toLocaleTimeString();

    entry.innerHTML = `
    <span class="log-time">${timeStr}</span>
    <span class="log-message">${escapeHtml(message)}</span>
  `;

    activityLog.appendChild(entry);
    activityLog.scrollTop = activityLog.scrollHeight;
}

function clearActivityLog() {
    activityLog.innerHTML = '';
}

function handleResearchComplete(data) {
    if (data.cancelled) {
        addLogEntry('Research was cancelled', 'warning');
        setResearchingState(false);
        return;
    }

    currentReport = data;
    setResearchingState(false);
    setStatus('Complete', 'info');
    addLogEntry(`Research complete! Found information from ${data.sourcesCount} sources`, 'success');

    // Render report
    renderReport(data);

    // Enable export button
    exportBtn.disabled = false;

    // Auto-switch to report tab
    switchTab('report');
}

function renderReport(data) {
    const html = marked.parse(data.content);

    reportContent.innerHTML = `
    <div class="markdown-content">
      ${html}
      <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border-color);">
      <h3>Metadata</h3>
      <p><strong>Query:</strong> ${escapeHtml(data.query)}</p>
      <p><strong>Generated:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
      <p><strong>Sources:</strong> ${data.sourcesCount}</p>
    </div>
  `;
}

function exportReport() {
    if (!currentReport) return;

    const content = `# ${currentReport.query}\n\n${currentReport.content}\n\n---\n\n**Generated:** ${new Date(currentReport.timestamp).toLocaleString()}\n**Sources:** ${currentReport.sourcesCount}\n\n## Sources\n\n${currentReport.sources.map((s, i) => `${i + 1}. ${s.url}`).join('\n')}`;

    window.electronAPI.exportReport(content);
}

function switchTab(tabName) {
    tabs.forEach(tab => {
        if (tab.getAttribute('data-tab') === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    tabPanes.forEach(pane => {
        if (pane.id === `${tabName}Tab`) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initial status
setStatus('Ready', 'info');
