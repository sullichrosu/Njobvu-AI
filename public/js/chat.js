/**
 * Njobvu AI Floating Chat Component Logic
 */
(function () {
    let conversationHistory = [];
    let activeModel = "llama3";
    let isConnected = false;
    let isWaitingForResponse = false;

    // Helper to format timestamp
    function getFormattedTime() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Escape HTML to prevent XSS
    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Applies inline-level Markdown (inline code, bold, italic) to a single already-escaped line/cell.
    function renderInline(str) {
        let out = str;
        out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        return out;
    }

    function isTableRowLine(line) {
        return /^\s*\|.*\|\s*$/.test(line);
    }

    function isTableSeparatorLine(line) {
        return /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line);
    }

    function splitTableRow(line) {
        const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
        return trimmed.split("|").map(function (cell) { return cell.trim(); });
    }

    // Renders a Markdown report (headers, tables, lists, bold/italic/code) into safe HTML.
    // A flat regex pass can't express these block-level structures (a heading is a whole line, a
    // table spans several), so the text is walked line by line, grouping headings/tables/lists into
    // their own blocks and applying inline formatting within each.
    function renderMarkdown(text) {
        if (!text) return "";

        // Pull fenced code blocks out first so nothing inside them is touched by other rules, then
        // put escaped/highlighted versions back in once the rest of the text has been escaped.
        const codeBlocks = [];
        const withPlaceholders = text.replace(/```(?:[a-zA-Z0-9_-]*\n)?([\s\S]*?)```/g, function (match, code) {
            codeBlocks.push(code.replace(/\n$/, ""));
            return "\nCODEBLOCKMARKER" + (codeBlocks.length - 1) + "\n";
        });

        const escaped = escapeHtml(withPlaceholders);
        const lines = escaped.split(/\r\n|\r|\n/);

        const htmlParts = [];
        let listItems = [];
        let listTag = null;

        function flushList() {
            if (listItems.length) {
                htmlParts.push("<" + listTag + ">" + listItems.join("") + "</" + listTag + ">");
                listItems = [];
                listTag = null;
            }
        }

        function flushTable(rows) {
            if (rows.length < 2 || !isTableSeparatorLine(rows[1])) return false;
            const headerCells = splitTableRow(rows[0]);
            const bodyRows = rows.slice(2).map(splitTableRow);
            let html = "<table><thead><tr>";
            html += headerCells.map(function (c) { return "<th>" + renderInline(c) + "</th>"; }).join("");
            html += "</tr></thead><tbody>";
            bodyRows.forEach(function (row) {
                html += "<tr>" + row.map(function (c) { return "<td>" + renderInline(c) + "</td>"; }).join("") + "</tr>";
            });
            html += "</tbody></table>";
            htmlParts.push(html);
            return true;
        }

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];

            // Fenced code block placeholder.
            const codeMatch = line.trim().match(/^CODEBLOCKMARKER(\d+)$/);
            if (codeMatch) {
                flushList();
                htmlParts.push("<pre><code>" + escapeHtml(codeBlocks[parseInt(codeMatch[1], 10)]) + "</code></pre>");
                i++;
                continue;
            }

            // Table: a run of consecutive "| ... |" lines starting with a header + separator row.
            if (isTableRowLine(line)) {
                const tableLines = [line];
                let j = i + 1;
                while (j < lines.length && isTableRowLine(lines[j])) {
                    tableLines.push(lines[j]);
                    j++;
                }
                flushList();
                if (flushTable(tableLines)) {
                    i = j;
                    continue;
                }
                // Not a real table (no separator row) — fall through and render as plain lines.
            }

            // ATX headings: # through ######
            const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                flushList();
                const level = headingMatch[1].length;
                htmlParts.push("<h" + level + ">" + renderInline(headingMatch[2]) + "</h" + level + ">");
                i++;
                continue;
            }

            // Unordered / ordered list items.
            const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
            const olMatch = !ulMatch && line.match(/^\s*\d+\.\s+(.*)$/);
            if (ulMatch || olMatch) {
                const tag = ulMatch ? "ul" : "ol";
                if (listTag && listTag !== tag) flushList();
                listTag = tag;
                listItems.push("<li>" + renderInline((ulMatch || olMatch)[1]) + "</li>");
                i++;
                continue;
            }
            flushList();

            if (line.trim() === "") {
                i++;
                continue;
            }

            htmlParts.push("<p>" + renderInline(line) + "</p>");
            i++;
        }
        flushList();

        return htmlParts.join("");
    }

    document.addEventListener("DOMContentLoaded", function () {
        const launcher = document.getElementById("njobvu-chat-launcher");
        const windowEl = document.getElementById("njobvu-chat-window");
        const closeBtn = document.getElementById("njobvu-chat-close-btn");
        const configToggleBtn = document.getElementById("njobvu-chat-config-toggle");
        const configDrawer = document.getElementById("njobvu-chat-config-drawer");
        const messagesContainer = document.getElementById("njobvu-chat-messages");
        const textarea = document.getElementById("njobvu-chat-input");
        const sendBtn = document.getElementById("njobvu-chat-send-btn");
        const statusDot = document.getElementById("njobvu-chat-status-dot");
        const statusText = document.getElementById("njobvu-chat-status-text");

        const configUrlInput = document.getElementById("njobvu-config-url");
        const configModelSelect = document.getElementById("njobvu-config-model");
        const configRoleSelect = document.getElementById("njobvu-config-role");
        const configSaveBtn = document.getElementById("njobvu-config-save-btn");

        if (!launcher || !windowEl) return;

        // Toggle chat window open/closed
        launcher.addEventListener("click", function () {
            windowEl.classList.toggle("active");
            if (windowEl.classList.contains("active")) {
                textarea.focus();
                loadConfiguration();
            }
        });

        closeBtn.addEventListener("click", function () {
            windowEl.classList.remove("active");
        });

        // Toggle configuration drawer
        configToggleBtn.addEventListener("click", function () {
            configDrawer.classList.toggle("active");
        });

        // Load configuration and model list
        async function loadConfiguration() {
            try {
                const [configRes, modelsRes] = await Promise.all([
                    fetch("/api/chat/config").then(r => r.json()).catch(() => ({})),
                    fetch("/api/chat/models").then(r => r.json()).catch(() => ({}))
                ]);

                if (configRes.success && configRes.config) {
                    if (configUrlInput) configUrlInput.value = configRes.config.ollama_url || "http://localhost:11434";
                    if (configRoleSelect) configRoleSelect.value = configRes.config.chat_required_role || "user";
                    activeModel = configRes.config.ollama_default_model || "llama3";
                }

                if (modelsRes.success) {
                    isConnected = modelsRes.connected;
                    if (statusDot) {
                        statusDot.className = `njobvu-chat-status-dot ${isConnected ? 'online' : 'offline'}`;
                    }
                    if (statusText) {
                        statusText.innerText = isConnected ? `Connected (${activeModel})` : `Ollama Offline`;
                    }

                    if (configModelSelect && modelsRes.models) {
                        configModelSelect.innerHTML = modelsRes.models
                            .map(m => `<option value="${m}" ${m === activeModel ? 'selected' : ''}>${m}</option>`)
                            .join("");
                    }
                }
            } catch (err) {
                console.warn("[Njobvu Chat] Failed to load chat configuration", err);
            }
        }

        // Save updated configuration
        if (configSaveBtn) {
            configSaveBtn.addEventListener("click", async function () {
                const ollama_url = configUrlInput ? configUrlInput.value.trim() : "";
                const ollama_default_model = configModelSelect ? configModelSelect.value : "llama3";
                const chat_required_role = configRoleSelect ? configRoleSelect.value : "user";

                try {
                    const res = await fetch("/api/chat/config", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ollama_url, ollama_default_model, chat_required_role })
                    });
                    const data = await res.json();
                    if (data.success) {
                        activeModel = ollama_default_model;
                        configDrawer.classList.remove("active");
                        loadConfiguration();
                    } else {
                        alert(data.error || "Failed to update configuration.");
                    }
                } catch (err) {
                    alert("Error saving configuration: " + err.message);
                }
            });
        }

        // Auto resize input textarea
        textarea.addEventListener("input", function () {
            this.style.height = "auto";
            this.style.height = Math.min(this.scrollHeight, 100) + "px";
            sendBtn.disabled = !this.value.trim() || isWaitingForResponse;
        });

        textarea.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendBtn.addEventListener("click", sendMessage);

        // Quick Action Chips Event Delegation
        messagesContainer.addEventListener("click", function (e) {
            const chip = e.target.closest(".njobvu-quick-chip");
            if (chip) {
                const promptText = chip.getAttribute("data-prompt");
                const intent = chip.getAttribute("data-intent");
                const runId = chip.getAttribute("data-run-id");
                const runType = chip.getAttribute("data-run-type");

                if (promptText) {
                    textarea.value = promptText;
                    sendMessage({ intent, runId, runType });
                }
            }
        });

        // Append a message bubble to UI
        function appendMessage(role, content, time = getFormattedTime()) {
            const msgDiv = document.createElement("div");
            msgDiv.className = `njobvu-msg ${role}`;

            const bubbleDiv = document.createElement("div");
            bubbleDiv.className = "njobvu-msg-bubble";
            bubbleDiv.innerHTML = renderMarkdown(content);

            const timeDiv = document.createElement("div");
            timeDiv.className = "njobvu-msg-time";
            timeDiv.innerText = time;

            msgDiv.appendChild(bubbleDiv);
            msgDiv.appendChild(timeDiv);

            messagesContainer.appendChild(msgDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Display typing indicator
        function showTypingIndicator() {
            const typingDiv = document.createElement("div");
            typingDiv.id = "njobvu-typing-indicator-el";
            typingDiv.className = "njobvu-msg assistant";
            typingDiv.innerHTML = `
                <div class="njobvu-typing-indicator">
                    <div class="njobvu-typing-dot"></div>
                    <div class="njobvu-typing-dot"></div>
                    <div class="njobvu-typing-dot"></div>
                </div>
            `;
            messagesContainer.appendChild(typingDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function removeTypingIndicator() {
            const typingDiv = document.getElementById("njobvu-typing-indicator-el");
            if (typingDiv) typingDiv.remove();
        }

        // Show alert message in chat container
        function showAlert(alertText) {
            const alertDiv = document.createElement("div");
            alertDiv.className = "njobvu-chat-alert";
            alertDiv.innerText = alertText;
            messagesContainer.appendChild(alertDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Main Send Message handler
        async function sendMessage(extraParams = {}) {
            const userText = textarea.value.trim();
            if (!userText || isWaitingForResponse) return;

            textarea.value = "";
            textarea.style.height = "auto";
            sendBtn.disabled = true;
            isWaitingForResponse = true;

            appendMessage("user", userText);
            conversationHistory.push({ role: "user", content: userText });

            showTypingIndicator();

            // Extract active project name from URL params, hidden inputs, or window state
            const urlParams = new URLSearchParams(window.location.search);
            const projectName = extraParams.projectName ||
                                urlParams.get("PName") ||
                                urlParams.get("projectName") ||
                                urlParams.get("Pname") ||
                                (document.querySelector('input[name="PName"]')?.value) ||
                                (document.getElementById('PName')?.value) ||
                                (document.getElementById('pname-display')?.innerText?.trim()) ||
                                window.currentProject ||
                                null;

            try {
                const response = await fetch("/api/chat", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        messages: conversationHistory,
                        model: activeModel,
                        projectName: projectName,
                        ...extraParams
                    })
                });

                removeTypingIndicator();
                const data = await response.json();

                if (response.ok && data.success) {
                    const replyObj = data.message || { role: "assistant", content: data.response };
                    appendMessage("assistant", replyObj.content);
                    conversationHistory.push(replyObj);
                } else if (response.status === 403) {
                    showAlert(`⛔ Role Gating Warning: ${data.error || 'Access denied by system role restrictions.'}`);
                } else if (response.status === 401) {
                    showAlert(`🔒 Authentication Required: Please log in to continue.`);
                } else if (response.status === 502) {
                    showAlert(`⚠️ Ollama Endpoint Error: ${data.error || 'Ollama service is unreachable.'}`);
                } else {
                    showAlert(`Error: ${data.error || 'An unexpected error occurred.'}`);
                }
            } catch (err) {
                removeTypingIndicator();
                showAlert(`Network Error: Could not reach backend chat API (${err.message}).`);
            } finally {
                isWaitingForResponse = false;
                sendBtn.disabled = false;
            }
        }
    });
})();
