"use strict";
(() => {
  // <define:__DEV_WEBSITE_ORIGINS__>
  var define_DEV_WEBSITE_ORIGINS_default = [];

  // src/shared/constants.ts
  var PRODUCTION_WEBSITE_ORIGIN = "https://prajwalkedari.tech";
  var devOrigins = typeof define_DEV_WEBSITE_ORIGINS_default === "undefined" ? [] : define_DEV_WEBSITE_ORIGINS_default;
  var WEBSITE_ORIGINS = [PRODUCTION_WEBSITE_ORIGIN, ...devOrigins];
  var TIMEOUTS = {
    tabLoadMs: 2e4,
    geminiReadyMs: 2e4,
    submitConfirmMs: 1e4,
    responseStartMs: 6e4,
    responseTotalMs: 3e5,
    responseStableMs: 3e3,
    emptyResponseMs: 15e3,
    pollIntervalMs: 500,
    messageMs: 15e3
  };

  // src/shared/response.ts
  function normalizeExtractedText(text) {
    return text.replace(/\r\n?/g, "\n").replace(/[\u200B\u200C\u200D\uFEFF]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  var ResponseStabilityTracker = class {
    constructor(stableMs) {
      this.stableMs = stableMs;
    }
    stableMs;
    lastText = null;
    lastChangeAt = 0;
    observe(snapshot) {
      if (snapshot.generating || snapshot.text !== this.lastText) {
        this.lastText = snapshot.text;
        this.lastChangeAt = snapshot.now;
        return false;
      }
      if (snapshot.text.trim().length === 0) return false;
      return snapshot.now - this.lastChangeAt >= this.stableMs;
    }
  };
  function selectNewResponseIndex(baselineKey, keys) {
    if (keys.length === 0) return -1;
    const last = keys.length - 1;
    if (baselineKey === null) return last;
    return keys[last] === baselineKey ? -1 : last;
  }

  // src/content/gemini-selectors.ts
  var GEMINI_SELECTORS = {
    composer: [
      "rich-textarea .ql-editor[contenteditable='true']",
      "rich-textarea [contenteditable='true']",
      "div[contenteditable='true'][role='textbox']",
      "textarea[aria-label]"
    ],
    sendButton: [
      "button[aria-label='Send message']",
      "button.send-button",
      "button[aria-label*='Send' i]"
    ],
    stopButton: [
      "button[aria-label='Stop response']",
      "button[aria-label*='Stop' i]"
    ],
    responseGroups: [
      "model-response",
      "message-content",
      "[data-message-author-role='model']"
    ],
    signInLinks: [
      "a[href*='accounts.google.com/ServiceLogin']",
      "a[href*='accounts.google.com/signin']"
    ],
    skipInText: ["button", "mat-icon", "svg", "style", "script", "noscript"]
  };

  // src/content/gemini.ts
  var current = null;
  var elementKeys = /* @__PURE__ */ new WeakMap();
  var nextKey = 1;
  function keyFor(element) {
    const existing = elementKeys.get(element);
    if (existing !== void 0) return existing;
    const key = nextKey++;
    elementKeys.set(element, key);
    return key;
  }
  function isVisible(element) {
    return element.getClientRects().length > 0;
  }
  function firstMatch(selectors) {
    for (const selector of selectors) {
      const found = Array.from(document.querySelectorAll(selector)).find(isVisible);
      if (found) return found;
    }
    return null;
  }
  function findComposer() {
    return firstMatch(GEMINI_SELECTORS.composer);
  }
  function findSendButton() {
    const button = firstMatch(GEMINI_SELECTORS.sendButton);
    return button instanceof HTMLButtonElement ? button : null;
  }
  function isGenerating() {
    return firstMatch(GEMINI_SELECTORS.stopButton) !== null;
  }
  function hasSignInLink() {
    return GEMINI_SELECTORS.signInLinks.some((selector) => document.querySelector(selector) !== null);
  }
  function responseElements() {
    for (const selector of GEMINI_SELECTORS.responseGroups) {
      const found = Array.from(document.querySelectorAll(selector));
      if (found.length > 0) return found;
    }
    return [];
  }
  function composerText(composer) {
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) return composer.value;
    return composer.textContent ?? "";
  }
  function squash(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function insertionVerified(composer, prompt) {
    const actual = squash(composerText(composer));
    const expected = squash(prompt);
    if (expected.length === 0) return false;
    const head = expected.slice(0, 60);
    const tail = expected.slice(-60);
    return actual.includes(head) && actual.includes(tail);
  }
  function insertPrompt(prompt) {
    const composer = findComposer();
    if (!composer) {
      return failure(
        "COMPOSER_NOT_FOUND",
        "Could not find the Gemini message box. Make sure you are signed in and the page has finished loading. You can also copy the prompt and paste it yourself."
      );
    }
    if (composerText(composer).trim().length > 0) {
      return failure(
        "COMPOSER_NOT_EMPTY",
        "The Gemini message box already contains text. Clear it and press Retry, so your draft is not overwritten."
      );
    }
    composer.focus();
    if (composer instanceof HTMLTextAreaElement) {
      composer.value = prompt;
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      document.execCommand("insertText", false, prompt);
      if (!insertionVerified(composer, prompt)) {
        composer.textContent = prompt;
        composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
      }
    }
    if (!insertionVerified(composer, prompt)) {
      return failure(
        "INSERT_NOT_VERIFIED",
        "The prompt was written, but ResumeMate could not confirm it in the message box. Check the Gemini tab before continuing, or paste the prompt yourself."
      );
    }
    return { ok: true };
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function submitPrompt(requestId) {
    if (current && !current.done) {
      return failure("BUSY", "Gemini is still handling a previous request in this tab.");
    }
    const composer = findComposer();
    if (!composer) {
      return failure("COMPOSER_NOT_FOUND", "Could not find the Gemini message box to submit from.");
    }
    if (composerText(composer).trim().length === 0) {
      return failure("SUBMIT_NOT_CONFIRMED", "The Gemini message box is empty, so there is nothing to submit.");
    }
    const sendButton = findSendButton();
    if (!sendButton || sendButton.disabled || sendButton.getAttribute("aria-disabled") === "true") {
      return failure(
        "SUBMIT_NOT_CONFIRMED",
        "The Gemini send button is not available. Check the prompt in the Gemini tab before submitting it manually."
      );
    }
    const before = responseElements();
    const baselineKey = before.length > 0 ? keyFor(before[before.length - 1]) : null;
    sendButton.click();
    const deadline = Date.now() + TIMEOUTS.submitConfirmMs;
    while (Date.now() < deadline) {
      await sleep(250);
      const nowComposer = findComposer();
      const cleared = !nowComposer || composerText(nowComposer).trim().length === 0;
      const responses = responseElements();
      const newResponse = selectNewResponseIndex(baselineKey, responses.map(keyFor)) !== -1;
      if (cleared || isGenerating() || newResponse) {
        startWatching({ requestId, baselineKey });
        return { ok: true };
      }
    }
    return failure(
      "SUBMIT_NOT_CONFIRMED",
      "ResumeMate clicked send but could not confirm that Gemini accepted the prompt. Check the Gemini tab before doing anything else. Do not assume it was sent."
    );
  }
  function startWatching(params) {
    const operation = {
      requestId: params.requestId,
      baselineKey: params.baselineKey,
      cancelled: false,
      done: false,
      tracker: new ResponseStabilityTracker(TIMEOUTS.responseStableMs)
    };
    current = operation;
    void watch(operation);
  }
  function emit(requestId, event) {
    void chrome.runtime.sendMessage({ type: "GEMINI_EVENT", requestId, event }).catch(() => void 0);
  }
  function extractText(element) {
    return normalizeExtractedText(renderNode(element, 0));
  }
  function renderNode(node, depth) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element)) return "";
    const tag = node.tagName.toLowerCase();
    if (GEMINI_SELECTORS.skipInText.includes(tag)) return "";
    if (node.classList.contains("katex")) {
      const annotation = node.querySelector("annotation[encoding='application/x-tex']");
      const tex = annotation?.textContent ?? "";
      const display = node.closest(".katex-display") !== null;
      return display ? `
$$${tex}$$
` : `$${tex}$`;
    }
    const children = () => Array.from(node.childNodes).map((child) => renderNode(child, depth)).join("");
    switch (tag) {
      case "pre": {
        const code = node.querySelector("code");
        const language = /language-([\w+-]+)/.exec(code?.className ?? "")?.[1] ?? "";
        const body = (code ?? node).textContent ?? "";
        return `
\`\`\`${language}
${body.replace(/\n$/, "")}
\`\`\`
`;
      }
      case "code":
        return `\`${node.textContent ?? ""}\``;
      case "br":
        return "\n";
      case "li": {
        const parentTag = node.parentElement?.tagName.toLowerCase();
        const index = node.parentElement ? Array.from(node.parentElement.children).indexOf(node) + 1 : 1;
        const marker = parentTag === "ol" ? `${index}. ` : "- ";
        return `${marker}${children().trim()}
`;
      }
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = Number(tag.charAt(1));
        return `
${"#".repeat(level)} ${children().trim()}
`;
      }
      case "tr": {
        const cells = Array.from(node.children).map((cell) => (cell.textContent ?? "").trim());
        return `${cells.join(" | ")}
`;
      }
      case "p":
      case "div":
      case "section":
      case "article":
      case "blockquote":
      case "ul":
      case "ol":
      case "table":
        return `
${children()}
`;
      default:
        return children();
    }
  }
  async function watch(operation) {
    const started = Date.now();
    let announcedResponding = false;
    let emptySince = null;
    const finish = (event) => {
      operation.done = true;
      if (current === operation) current = null;
      emit(operation.requestId, event);
    };
    const fail = (code, message) => finish({ kind: "failed", code, message });
    while (true) {
      if (operation.cancelled) return fail("CANCELLED", "Stopped because the request was cancelled.");
      const elapsed = Date.now() - started;
      if (elapsed > TIMEOUTS.responseTotalMs) {
        return fail("RESPONSE_TIMEOUT", "Gemini did not finish within the time limit. Retry extraction once it finishes, or copy the response manually.");
      }
      const elements = responseElements();
      const index = selectNewResponseIndex(operation.baselineKey, elements.map(keyFor));
      const generating = isGenerating();
      if (index === -1) {
        if (!generating && elapsed > TIMEOUTS.responseStartMs) {
          return fail("RESPONSE_TIMEOUT", "Gemini did not start a new response in time. Check the Gemini tab.");
        }
        await sleep(TIMEOUTS.pollIntervalMs);
        continue;
      }
      if (!announcedResponding) {
        announcedResponding = true;
        emit(operation.requestId, { kind: "status", status: "gemini-responding" });
      }
      const element = elements[index];
      const text = extractText(element);
      if (text.trim().length === 0) {
        if (generating) {
          emptySince = null;
        } else {
          emptySince ??= Date.now();
          if (Date.now() - emptySince >= TIMEOUTS.emptyResponseMs) {
            return fail("EMPTY_RESPONSE", "Gemini finished without any visible text. Check the Gemini tab, then try Retry Extraction.");
          }
        }
        await sleep(TIMEOUTS.pollIntervalMs);
        continue;
      }
      emptySince = null;
      if (operation.tracker.observe({ text, generating, now: Date.now() })) {
        operation.done = true;
        if (current === operation) current = null;
        emit(operation.requestId, { kind: "result", text });
        return;
      }
      await sleep(TIMEOUTS.pollIntervalMs);
    }
  }
  async function retryExtraction(requestId) {
    if (!current || current.requestId !== requestId) {
      return failure("STALE_REQUEST", "This Gemini tab is no longer tracking that request.");
    }
    if (!current.done) {
      return failure("BUSY", "ResumeMate is already waiting for this response.");
    }
    const restarted = {
      requestId,
      baselineKey: current.baselineKey,
      cancelled: false,
      done: false,
      tracker: new ResponseStabilityTracker(TIMEOUTS.responseStableMs)
    };
    current = restarted;
    void watch(restarted);
    return { ok: true };
  }
  function cancelOperation(requestId) {
    if (!current || current.requestId !== requestId) {
      return failure("STALE_REQUEST", "This Gemini tab is not tracking that request.");
    }
    current.cancelled = true;
    return { ok: true };
  }
  function failure(code, message) {
    return { ok: false, code, message };
  }
  function ping() {
    return {
      ok: true,
      signedIn: !hasSignInLink(),
      composerFound: findComposer() !== null
    };
  }
  async function handleCommand(command) {
    switch (command.type) {
      case "GEMINI_PING":
        return ping();
      case "GEMINI_INSERT":
        return insertPrompt(command.prompt);
      case "GEMINI_SUBMIT":
        return submitPrompt(command.requestId);
      case "GEMINI_CANCEL":
        return cancelOperation(command.requestId);
      case "GEMINI_RETRY_EXTRACT":
        return retryExtraction(command.requestId);
    }
  }
  function isCommand(value) {
    if (typeof value !== "object" || value === null) return false;
    const type = value.type;
    return typeof type === "string" && type.startsWith("GEMINI_") && type !== "GEMINI_EVENT";
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.tab !== void 0 || !isCommand(message)) return false;
    if (message.type === "GEMINI_INSERT" && typeof message.prompt !== "string") return false;
    void handleCommand(message).then((result) => sendResponse(result));
    return true;
  });
})();
