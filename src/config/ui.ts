/**
 * Setup UI HTML Templates
 *
 * HTML templates for the Neo4j connection setup page.
 */

import { SERVER_NAME, SERVER_VERSION } from './constants.js';

/**
 * CSS styles for the setup page
 */
const STYLES = `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 40px 20px;
    color: #333;
  }

  .container {
    max-width: 500px;
    margin: 0 auto;
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    overflow: hidden;
  }

  .header {
    background: #1a1a2e;
    color: white;
    padding: 30px;
    text-align: center;
  }

  .header h1 {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .header .version {
    font-size: 12px;
    opacity: 0.7;
  }

  .header .subtitle {
    font-size: 14px;
    opacity: 0.9;
    margin-top: 10px;
  }

  .content {
    padding: 30px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  label {
    display: block;
    font-weight: 600;
    margin-bottom: 8px;
    color: #444;
  }

  .label-hint {
    font-weight: normal;
    font-size: 12px;
    color: #888;
  }

  input[type="text"],
  input[type="password"],
  select {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  input.error {
    border-color: #e74c3c;
  }

  .checkbox-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .checkbox-group input[type="checkbox"] {
    width: 18px;
    height: 18px;
  }

  .checkbox-group label {
    margin-bottom: 0;
    font-weight: normal;
  }

  button {
    width: 100%;
    padding: 14px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .error-message {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-size: 14px;
    display: none;
  }

  .error-message.show {
    display: block;
  }

  .success-container {
    display: none;
  }

  .success-container.show {
    display: block;
  }

  .success-box {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .success-box h3 {
    margin-bottom: 10px;
  }

  .token-box {
    background: #1a1a2e;
    color: #10b981;
    padding: 16px;
    border-radius: 8px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
    word-break: break-all;
    margin: 16px 0;
    position: relative;
  }

  .token-box .copy-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: #374151;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    width: auto;
  }

  .token-box .copy-btn:hover {
    background: #4b5563;
    transform: none;
    box-shadow: none;
  }

  .instructions {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 20px;
    margin-top: 20px;
  }

  .instructions h4 {
    margin-bottom: 12px;
    color: #1e293b;
  }

  .instructions ol {
    margin-left: 20px;
    color: #475569;
  }

  .instructions li {
    margin-bottom: 8px;
  }

  .instructions code {
    background: #e2e8f0;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
  }

  .loading {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #ffffff;
    border-radius: 50%;
    border-top-color: transparent;
    animation: spin 0.8s linear infinite;
    margin-right: 8px;
    vertical-align: middle;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .footer {
    text-align: center;
    padding: 20px;
    color: #888;
    font-size: 12px;
    border-top: 1px solid #eee;
  }

  .footer a {
    color: #667eea;
    text-decoration: none;
  }
`;

/**
 * JavaScript for the setup page
 */
const SCRIPT = `
  const form = document.getElementById('setupForm');
  const errorBox = document.getElementById('errorBox');
  const successContainer = document.getElementById('successContainer');
  const formContainer = document.getElementById('formContainer');
  const submitBtn = document.getElementById('submitBtn');
  const tokenDisplay = document.getElementById('tokenDisplay');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset state
    errorBox.classList.remove('show');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span> Connecting...';

    const formData = {
      uri: document.getElementById('uri').value.trim(),
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value,
      database: document.getElementById('database').value.trim() || 'neo4j',
      readOnly: document.getElementById('readOnly').checked,
    };

    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Setup failed');
      }

      // Success! Show token and instructions
      tokenDisplay.textContent = result.token;
      formContainer.style.display = 'none';
      successContainer.classList.add('show');

    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Connect to Neo4j';
    }
  });

  function copyToken() {
    const token = tokenDisplay.textContent;
    navigator.clipboard.writeText(token).then(() => {
      const btn = document.querySelector('.copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 2000);
    });
  }

  function startOver() {
    formContainer.style.display = 'block';
    successContainer.classList.remove('show');
    form.reset();
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Connect to Neo4j';
  }
`;

/**
 * Generate the setup page HTML
 */
export function generateSetupPageHtml(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Setup - ${SERVER_NAME}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔗 Neo4j Connection Setup</h1>
      <div class="version">v${SERVER_VERSION}</div>
      <div class="subtitle">Connect your Neo4j Aura database to use with Claude</div>
    </div>

    <div class="content">
      <div id="formContainer">
        <div id="errorBox" class="error-message"></div>

        <form id="setupForm">
          <div class="form-group">
            <label for="uri">
              Neo4j URI
              <span class="label-hint">(e.g., neo4j+s://xxxx.databases.neo4j.io)</span>
            </label>
            <input
              type="text"
              id="uri"
              name="uri"
              placeholder="neo4j+s://xxxx.databases.neo4j.io"
              required
            />
          </div>

          <div class="form-group">
            <label for="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              placeholder="neo4j"
              value="neo4j"
              required
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="Your Neo4j password"
              required
            />
          </div>

          <div class="form-group">
            <label for="database">
              Database
              <span class="label-hint">(leave empty for default)</span>
            </label>
            <input
              type="text"
              id="database"
              name="database"
              placeholder="neo4j"
              value="neo4j"
            />
          </div>

          <div class="form-group">
            <div class="checkbox-group">
              <input type="checkbox" id="readOnly" name="readOnly" />
              <label for="readOnly">Read-only mode (disable write operations)</label>
            </div>
          </div>

          <button type="submit" id="submitBtn">Connect to Neo4j</button>
        </form>
      </div>

      <div id="successContainer" class="success-container">
        <div class="success-box">
          <h3>✅ Connection Successful!</h3>
          <p>Your Neo4j database has been connected. Use the token below to authenticate your requests.</p>
        </div>

        <label>Your Session Token:</label>
        <div class="token-box">
          <span id="tokenDisplay"></span>
          <button class="copy-btn" onclick="copyToken()">Copy</button>
        </div>

        <div class="instructions">
          <h4>How to use with Claude:</h4>
          <ol>
            <li>Copy the token above</li>
            <li>In Claude.ai, go to <strong>Settings → MCP Servers</strong></li>
            <li>Add this server URL with your token as the Authorization header</li>
            <li>Or include the token in requests as: <code>Authorization: Bearer YOUR_TOKEN</code></li>
          </ol>
        </div>

        <button onclick="startOver()" style="margin-top: 20px; background: #6b7280;">
          Configure Another Connection
        </button>
      </div>
    </div>

    <div class="footer">
      <p>
        ${SERVER_NAME} •
        <a href="https://github.com/neo4j-contrib/mcp-neo4j" target="_blank">Documentation</a>
      </p>
    </div>
  </div>

  <script>${SCRIPT}</script>
</body>
</html>
  `.trim();
}

/**
 * Generate a simple success response HTML
 */
export function generateSuccessHtml(token: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Setup Complete - ${SERVER_NAME}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Setup Complete</h1>
    </div>
    <div class="content">
      <div class="success-box">
        <h3>Connection Successful!</h3>
        <p>Your session token:</p>
      </div>
      <div class="token-box">
        <span id="tokenDisplay">${token}</span>
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${token}')">Copy</button>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate an error response HTML
 */
export function generateErrorHtml(message: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - ${SERVER_NAME}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: #dc2626;">
      <h1>❌ Setup Error</h1>
    </div>
    <div class="content">
      <div class="error-message show">
        ${message}
      </div>
      <button onclick="window.location.href='/setup'">Try Again</button>
    </div>
  </div>
</body>
</html>
  `.trim();
}
