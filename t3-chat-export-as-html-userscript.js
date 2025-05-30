// ==UserScript==
// @name         T3 Chat Export
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Export Chat As HTML
// @match        https://t3.chat/*
// @match        https://beta.t3.chat/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  const SELECTORS = {
    chatLog: 'div[role="log"][aria-label="Chat messages"]',
    buttonsContainer: '.fixed.right-2.top-2.z-20.max-sm\\:hidden .flex.flex-row.items-center'
  };
  const CSS_CLASSES = {
    downloadBtn: 't3-download-btn',
    animatedContainer: 't3-download-animated-container'
  };

  // --- Add Download Button with Animation ---
  function injectStyles() {
    if (document.getElementById('t3-download-btn-css')) return;
    const style = document.createElement('style');
    style.id = 't3-download-btn-css';
    style.textContent = `
      .${CSS_CLASSES.animatedContainer} {
        display: inline-block;
        overflow: hidden;
        width: 0;
        opacity: 0;
        transition:
          width 0.5s cubic-bezier(.77,0,.18,1),
          opacity 0.4s cubic-bezier(.77,0,.18,1);
        vertical-align: middle;
      }
      .${CSS_CLASSES.animatedContainer}.show {
        width: 44px; /* 2rem + padding */
        opacity: 1;
        transition:
          width 0.5s cubic-bezier(.77,0,.18,1),
          opacity 0.4s cubic-bezier(.77,0,.18,1);
      }
      .${CSS_CLASSES.downloadBtn} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        white-space: nowrap;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        font-weight: 500;
        border: none;
        background: transparent;
        cursor: pointer;
        opacity: 0.7;
        color: hsl(var(--muted-foreground));
        width: 2rem;
        height: 2rem;
        position: relative;
        box-shadow: 0 2px 8px 0 rgba(0,0,0,0.08);
        transform: translateY(20px) scale(0.9);
        transition:
          background 0.2s,
          color 0.2s,
          opacity 0.2s,
          box-shadow 0.2s,
          transform 0.5s cubic-bezier(.77,0,.18,1);
      }
      .${CSS_CLASSES.animatedContainer}.show .${CSS_CLASSES.downloadBtn} {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .${CSS_CLASSES.downloadBtn}:hover {
        background: hsl(var(--muted) / 0.4);
        color: hsl(var(--foreground));
        opacity: 1;
        box-shadow: 0 4px 16px 0 rgba(59,130,246,0.15);
      }
      .${CSS_CLASSES.downloadBtn} svg {
        pointer-events: none;
        width: 1rem;
        height: 1rem;
        flex-shrink: 0;
      }
      .${CSS_CLASSES.downloadBtn}.loading svg {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  function createDownloadButton() {
    if (document.querySelector(`.${CSS_CLASSES.downloadBtn}`)) return;
    const buttonsContainer = document.querySelector(SELECTORS.buttonsContainer);
    if (!buttonsContainer) {
      setTimeout(createDownloadButton, 1000);
      return;
    }

    // Create animated container
    let animatedContainer = document.createElement('span');
    animatedContainer.className = CSS_CLASSES.animatedContainer;

    // Create the button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = CSS_CLASSES.downloadBtn;
    downloadBtn.title = 'Download complete conversation';
    downloadBtn.setAttribute('aria-label', 'Download complete conversation');
    downloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download size-4">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7,10 12,15 17,10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    `;
    downloadBtn.addEventListener('click', generateExport);

    animatedContainer.appendChild(downloadBtn);

    // Insert as the first child for best placement
    buttonsContainer.insertBefore(animatedContainer, buttonsContainer.firstChild);

    // Animate in after a short delay
    setTimeout(() => {
      animatedContainer.classList.add('show');
    }, 100);

    // Optionally, you can add a tooltip or ripple effect for extra polish
  }

  // --- Faithful Export (same as before) ---
  function extractAllMessages() {
    const chatLog = document.querySelector(SELECTORS.chatLog);
    if (!chatLog) throw new Error('Chat content not found');
    const messages = [];
    const messageElements = chatLog.querySelectorAll('[data-message-id]');
    messageElements.forEach((messageEl, index) => {
      const isUser = messageEl.querySelector('[aria-label="Your message"]');
      const contentEl = messageEl.querySelector('.prose') || messageEl;
      let content = contentEl.cloneNode(true);
      content.querySelectorAll('button, [role="button"], .sr-only, .opacity-0').forEach(el => {
        if (!el.closest('pre, code')) el.remove();
      });
      messages.push({
        id: messageEl.getAttribute('data-message-id'),
        sender: isUser ? 'user' : 'assistant',
        content: content.innerHTML,
        rawText: contentEl.textContent || '',
        timestamp: new Date().toISOString(),
        index: index
      });
    });
    return messages;
  }

  function generateConversationTitle(messages) {
    if (messages.length === 0) return 'T3 Chat Conversation';
    const firstUserMessage = messages.find(m => m.sender === 'user');
    if (firstUserMessage) {
      let title = firstUserMessage.rawText.slice(0, 50).trim();
      if (firstUserMessage.rawText.length > 50) title += '...';
      return title || 'T3 Chat Conversation';
    }
    return 'T3 Chat Conversation';
  }

  function processCodeBlocks(content, messageId) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = content;
    wrapper.querySelectorAll('pre code').forEach((codeEl, index) => {
      const codeId = `code-${messageId}-${index}`;
      codeEl.parentElement.setAttribute('id', codeId);
      const header = document.createElement('div');
      header.className = 'code-header';
      header.innerHTML = `
        <button class="code-copy-btn" onclick="copyCode('${codeId}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
          </svg>
          Copy
        </button>
      `;
      codeEl.parentElement.parentElement.insertBefore(header, codeEl.parentElement);
    });
    return wrapper.innerHTML;
  }

  function generateExport() {
    const downloadBtn = document.querySelector(`.${CSS_CLASSES.downloadBtn}`);
    if (!downloadBtn) return;
    try {
      downloadBtn.classList.add('loading');
      downloadBtn.title = 'Generating export...';
      const messages = extractAllMessages();
      const conversationTitle = generateConversationTitle(messages);
      const exportDate = new Date();
      let messagesHTML = '';
      messages.forEach((message, index) => {
        const processedContent = processCodeBlocks(message.content, message.id);
        messagesHTML += `
          <div class="message-container ${message.sender}-message" data-message-index="${index}">
            <div class="message-header">
              <div class="message-sender">
                <span class="sender-label">${message.sender === 'user' ? 'You' : 'Assistant'}</span>
                <span class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</span>
              </div>
              <button class="message-copy-btn" onclick="copyMessage(${index})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                </svg>
                Copy
              </button>
            </div>
            <div class="message-content" id="message-content-${index}">
              ${processedContent}
            </div>
          </div>
        `;
      });

      const prismCSS = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css';
      const prismJS = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js';
      const prismLangs = [
        'clike', 'markup', 'python', 'javascript', 'typescript', 'java', 'cpp', 'c', 'csharp', 'go', 'rust', 'php', 'ruby', 'swift', 'kotlin',
        'css', 'scss', 'less', 'json', 'yaml', 'markdown', 'bash', 'shell', 'sql', 'r', 'perl', 'dart', 'scala', 'matlab', 'xml'
      ].map(lang => `<script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${lang}.min.js"></script>`).join('\n');

      const htmlContent = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${conversationTitle} - T3 Chat Export</title>
    <link rel="stylesheet" href="${prismCSS}">
    <style>
        :root {
            --bg-primary: #0c0c0c;
            --bg-secondary: #1a1a1a;
            --bg-tertiary: #2a2a2a;
            --text-primary: #ffffff;
            --text-secondary: #a0a0a0;
            --text-muted: #6b7280;
            --border: #333333;
            --accent: #3b82f6;
            --accent-hover: #2563eb;
            --user-bg: #1e3a8a;
            --assistant-bg: #1f2937;
            --success: #10b981;
            --code-bg: #111827;
            --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            overflow-x: hidden;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            min-height: 100vh;
        }
        .header {
            text-align: center;
            padding: 3rem 2rem;
            border-bottom: 2px solid var(--border);
            margin: 0 -2rem 3rem -2rem;
            background: linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));
            border-radius: 1rem;
        }
        .title {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .subtitle {
            color: var(--text-secondary);
            font-size: 1.1rem;
            margin-bottom: 1rem;
        }
        .export-info {
            color: var(--text-muted);
            font-size: 0.9rem;
            display: flex;
            justify-content: center;
            gap: 2rem;
            flex-wrap: wrap;
        }
        .message-container {
            margin-bottom: 2rem;
            border-radius: 1rem;
            overflow: hidden;
            box-shadow: var(--shadow);
            transition: transform 0.2s ease;
        }
        .message-container:hover { transform: translateY(-2px); }
        .user-message { background: var(--user-bg); margin-left: 2rem; }
        .assistant-message { background: var(--assistant-bg); margin-right: 2rem; }
        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid var(--border);
        }
        .message-sender {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .sender-label {
            font-weight: 600;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .message-time { color: var(--text-muted); font-size: 0.8rem; }
        .message-copy-btn, .code-copy-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text-secondary);
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 0.8rem;
            transition: all 0.2s ease;
        }
        .message-copy-btn:hover, .code-copy-btn:hover {
            background: var(--accent);
            color: white;
            border-color: var(--accent);
        }
        .message-content { padding: 1.5rem; font-size: 1rem; line-height: 1.7; }
        .message-content p { margin-bottom: 1rem; }
        .message-content ul, .message-content ol { margin: 1rem 0; padding-left: 2rem; }
        .message-content li { margin-bottom: 0.5rem; }
        .enhanced-code-block {
            margin: 1.5rem 0;
            border-radius: 0.75rem;
            overflow: hidden;
            background: var(--code-bg);
            border: 1px solid var(--border);
        }
        .code-header {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            padding: 0.75rem 1rem;
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid var(--border);
        }
        .code-content {
            margin: 0 !important;
            padding: 1rem !important;
            background: var(--code-bg) !important;
            border: none !important;
            border-radius: 0 !important;
            font-size: 0.9rem;
            line-height: 1.5;
            overflow-x: auto;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        }
        .code-content code {
            background: transparent !important;
            padding: 0 !important;
            border: none !important;
            border-radius: 0 !important;
        }
        .copy-success {
            background: var(--success) !important;
            color: white !important;
            border-color: var(--success) !important;
        }
        .stats {
            display: flex;
            justify-content: center;
            gap: 2rem;
            margin-top: 3rem;
            padding: 2rem;
            background: var(--bg-secondary);
            border-radius: 1rem;
            flex-wrap: wrap;
        }
        .stat-item { text-align: center; }
        .stat-number { font-size: 2rem; font-weight: 700; color: var(--accent); }
        .stat-label { color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.25rem; }
        @media (max-width: 768px) {
            .container { padding: 1rem; }
            .title { font-size: 2rem; }
            .user-message { margin-left: 0; }
            .assistant-message { margin-right: 0; }
            .export-info { flex-direction: column; gap: 0.5rem; }
            .stats { gap: 1rem; }
            .message-header { flex-direction: column; gap: 1rem; align-items: flex-start; }
        }
        @media print {
            body { background: white; color: black; }
            .message-copy-btn, .code-copy-btn { display: none; }
            .container { max-width: none; margin: 0; padding: 1rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">${conversationTitle}</h1>
            <p class="subtitle">T3 Chat Conversation Export</p>
            <div class="export-info">
                <span>📅 ${exportDate.toLocaleDateString()}</span>
                <span>🕒 ${exportDate.toLocaleTimeString()}</span>
                <span>💬 ${messages.length} messages</span>
            </div>
        </div>
        <div class="messages">
            ${messagesHTML}
        </div>
        <div class="stats">
            <div class="stat-item">
                <div class="stat-number">${messages.length}</div>
                <div class="stat-label">Total Messages</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${messages.filter(m => m.sender === 'user').length}</div>
                <div class="stat-label">Your Messages</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${messages.filter(m => m.sender === 'assistant').length}</div>
                <div class="stat-label">Assistant Replies</div>
            </div>
        </div>
    </div>
    <script>
        function copyMessage(index) {
            const content = document.getElementById('message-content-' + index);
            const text = content.textContent;
            navigator.clipboard.writeText(text).then(function() {
                const btn = content.parentElement.querySelector('.message-copy-btn');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"></path></svg> Copied!';
                btn.classList.add('copy-success');
                setTimeout(function() {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('copy-success');
                }, 2000);
            });
        }
        function copyCode(codeId) {
            const codeElement = document.getElementById(codeId);
            const text = codeElement.textContent;
            navigator.clipboard.writeText(text).then(function() {
                const btn = codeElement.parentElement.querySelector('.code-copy-btn');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"></path></svg> Copied!';
                btn.classList.add('copy-success');
                setTimeout(function() {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('copy-success');
                }, 2000);
            });
        }
        document.addEventListener('DOMContentLoaded', function() {
            if (window.Prism) Prism.highlightAll();
        });
    </script>
    <script src="${prismJS}"></script>
    ${prismLangs}
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanTitle = conversationTitle.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
      a.download = `${cleanTitle}-t3-chat-export.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating export:', error);
      alert('Failed to generate export. Please check console for details.');
    } finally {
      downloadBtn.classList.remove('loading');
      downloadBtn.title = 'Download complete conversation';
    }
  }

  function init() {
    injectStyles();
    setTimeout(createDownloadButton, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
