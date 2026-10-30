// <define:__DEV_WEBSITE_ORIGINS__>
var define_DEV_WEBSITE_ORIGINS_default = [];

// src/shared/constants.ts
var PRODUCTION_WEBSITE_ORIGIN = "https://resumemate.prajwalkedari.tech";
var devOrigins = typeof define_DEV_WEBSITE_ORIGINS_default === "undefined" ? [] : define_DEV_WEBSITE_ORIGINS_default;
var WEBSITE_ORIGINS = [PRODUCTION_WEBSITE_ORIGIN, ...devOrigins];
var LIMITS = {
  minResumeChars: 40,
  maxResumeChars: 2e4,
  maxJobChars: 1e4,
  maxInstructionChars: 1e3,
  maxPromptChars: 6e4,
  maxOutputChars: 6e4
};
var STORAGE_KEYS = {
  activeRequest: "resumemate.activeRequest",
  draft: "resumemate.draft"
};

// src/shared/state.ts
var STATUS_LABELS = {
  "awaiting-send-approval": "Awaiting confirmation",
  inserting: "Inserting prompt into Gemini",
  "awaiting-submit-confirmation": "Awaiting submission confirmation",
  submitting: "Submitting prompt",
  "waiting-for-gemini": "Waiting for Gemini",
  "gemini-responding": "Gemini is responding",
  "response-ready": "Response ready",
  "timed-out": "Timed out",
  "extraction-failed": "Extraction failed",
  cancelled: "Cancelled",
  "gemini-unavailable": "Gemini unavailable",
  returned: "Sent to ResumeMate",
  error: "Error"
};

// src/shared/types.ts
var TASKS = ["improve", "tailor", "generate", "latex", "review", "extract"];
var TASK_LABELS = {
  improve: "Improve an existing resume",
  tailor: "Tailor to a job description",
  generate: "Generate resume content",
  latex: "Generate LaTeX resume source",
  review: "Review resume quality",
  extract: "Extract and structure resume information"
};
var TEMPLATES = ["none", "chronological", "functional", "one-page"];
var TEMPLATE_LABELS = {
  none: "No specific template",
  chronological: "Chronological",
  functional: "Skills-first (functional)",
  "one-page": "One page"
};
var OUTPUT_FORMATS = ["markdown", "plain-text", "latex"];
var OUTPUT_FORMAT_LABELS = {
  markdown: "Markdown",
  "plain-text": "Plain text",
  latex: "LaTeX source"
};

// src/popup/components/dom.ts
function $(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id} in popup markup.`);
  return element;
}
function setHidden(element, hidden) {
  element.hidden = hidden;
}
function setText(element, text) {
  element.textContent = text;
}
function populateSelect(select, options, labels) {
  select.replaceChildren(
    ...options.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labels[value];
      return option;
    })
  );
}
function showNotice(kind, text) {
  const element = $("notice");
  element.className = `notice ${kind}`;
  setText(element, text);
  setHidden(element, text.length === 0);
}

// src/popup/main.ts
var PROGRESS_STATUSES = /* @__PURE__ */ new Set([
  "inserting",
  "awaiting-submit-confirmation",
  "submitting",
  "waiting-for-gemini",
  "gemini-responding",
  "timed-out",
  "extraction-failed",
  "gemini-unavailable",
  "error"
]);
var state = { active: null, geminiTabOpen: false, websiteTabOpen: false };
var reviewLoadedFor = null;
var transferReviewFor = null;
var draftTimer;
async function send(command) {
  try {
    const reply = await chrome.runtime.sendMessage(command);
    if (!reply) return { ok: false, error: "The extension did not reply. Reload it from chrome://extensions." };
    if (reply.state) {
      state = reply.state;
      render();
    }
    return reply;
  } catch {
    return {
      ok: false,
      error: "ResumeMate Assistant could not reach its background process. Reload the extension from chrome://extensions."
    };
  }
}
async function act(command, successText) {
  const reply = await send(command);
  if (!reply.ok) {
    showNotice("error", reply.error ?? "That action failed.");
  } else if (successText) {
    showNotice("ok", successText);
  } else {
    showNotice("ok", "");
  }
}
function formElements() {
  return {
    task: $("task"),
    template: $("template"),
    outputFormat: $("output-format"),
    resumeText: $("resume-text"),
    jobDescription: $("job-description"),
    customInstructions: $("custom-instructions")
  };
}
function readForm() {
  const f = formElements();
  return {
    task: f.task.value,
    template: f.template.value,
    outputFormat: f.outputFormat.value,
    resumeText: f.resumeText.value,
    jobDescription: f.jobDescription.value,
    customInstructions: f.customInstructions.value
  };
}
function writeForm(draft) {
  const f = formElements();
  if (draft.task && TASKS.includes(draft.task)) f.task.value = draft.task;
  if (draft.template && TEMPLATES.includes(draft.template)) f.template.value = draft.template;
  if (draft.outputFormat && OUTPUT_FORMATS.includes(draft.outputFormat)) {
    f.outputFormat.value = draft.outputFormat;
  }
  f.resumeText.value = draft.resumeText ?? "";
  f.jobDescription.value = draft.jobDescription ?? "";
  f.customInstructions.value = draft.customInstructions ?? "";
  updateCounters();
}
function updateCounters() {
  const f = formElements();
  setText($("resume-count"), `${f.resumeText.value.length} / ${LIMITS.maxResumeChars} characters`);
  setText($("job-count"), `${f.jobDescription.value.length} / ${LIMITS.maxJobChars} characters`);
}
function scheduleDraftSave() {
  updateCounters();
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    void chrome.storage.session.set({ [STORAGE_KEYS.draft]: readForm() });
  }, 400);
}
async function restoreDraft() {
  const data = await chrome.storage.session.get(STORAGE_KEYS.draft);
  const draft = data[STORAGE_KEYS.draft];
  if (typeof draft === "object" && draft !== null) writeForm(draft);
  updateCounters();
}
async function clearDraft() {
  await chrome.storage.session.remove(STORAGE_KEYS.draft);
  writeForm({});
}
function setPill(id, open, openText, closedText) {
  const pill = $(id);
  pill.className = open ? "pill ok" : "pill";
  setText(pill, open ? openText : closedText);
}
function show(id, visible) {
  setHidden($(id), !visible);
}
function render() {
  setPill("pill-website", state.websiteTabOpen, "ResumeMate tab open", "No ResumeMate tab");
  setPill("pill-gemini", state.geminiTabOpen, "Gemini tab open", "No Gemini tab");
  const active = state.active;
  show("view-form", active === null);
  show("btn-clear", true);
  setHidden($("source-banner"), active === null);
  if (active === null) {
    reviewLoadedFor = null;
    show("view-review", false);
    show("view-progress", false);
    show("view-output", false);
    show("view-final", false);
    return;
  }
  const sourceText = active.source.kind === "website" ? `Requested by ResumeMate at ${active.source.origin}.` : "Started from this popup (standalone mode).";
  setText($("source-banner"), sourceText);
  const status = active.status;
  show("view-review", status === "awaiting-send-approval");
  show("view-progress", PROGRESS_STATUSES.has(status));
  show("view-output", status === "response-ready");
  show("view-final", status === "returned" || status === "cancelled");
  if (status === "awaiting-send-approval") renderReview(active);
  if (PROGRESS_STATUSES.has(status)) renderProgress(active);
  if (status === "response-ready") renderOutput(active);
  if (status === "returned" || status === "cancelled") renderFinal(active);
}
function renderReview(active) {
  setText($("review-task"), TASK_LABELS[active.task]);
  setText($("review-resume"), `${active.resumeChars.toLocaleString()} characters`);
  setText($("review-job"), active.jobChars > 0 ? `${active.jobChars.toLocaleString()} characters` : "None");
  if (reviewLoadedFor !== active.requestId) {
    $("prompt-editor").value = active.prompt;
    reviewLoadedFor = active.requestId;
  }
  updatePromptCount();
}
function updatePromptCount() {
  const length = $("prompt-editor").value.length;
  setText($("prompt-count"), `${length.toLocaleString()} / ${LIMITS.maxPromptChars.toLocaleString()} characters`);
}
function renderProgress(active) {
  setText($("progress-title"), STATUS_LABELS[active.status]);
  setText($("progress-message"), active.message);
  const status = active.status;
  show("btn-confirm-submit", status === "awaiting-submit-confirmation");
  show("btn-retry-insert", status === "gemini-unavailable");
  show("btn-open-gemini", status === "awaiting-submit-confirmation" || status === "gemini-unavailable" || status === "timed-out");
  show("btn-copy-prompt-manual", status === "gemini-unavailable");
  show("btn-retry-extract-progress", status === "timed-out" || status === "extraction-failed");
}
function renderOutput(active) {
  const output = active.output;
  if (!output) return;
  $("output-text").value = output.text;
  const warnings = $("output-warnings");
  warnings.replaceChildren(
    ...output.warnings.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      return item;
    })
  );
  setHidden(warnings, output.warnings.length === 0);
  show("btn-copy-latex", output.isLatex);
  if (transferReviewFor !== active.requestId) {
    transferReviewFor = active.requestId;
    $("confirm-transfer").checked = false;
  }
  updateTransferState();
  setText(
    $("transfer-target"),
    active.source.kind === "website" ? "Returns to the ResumeMate tab that asked for it, as a draft." : "Sends to the open ResumeMate tab as a draft. Keep that tab open."
  );
}
function updateTransferState() {
  $("btn-transfer").disabled = !$("confirm-transfer").checked;
}
function renderFinal(active) {
  setText($("final-title"), active.status === "returned" ? "Sent to ResumeMate" : "Request cancelled");
  setText($("final-message"), active.message);
}
async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showNotice("ok", `${label} copied.`);
  } catch {
    showNotice("error", "Copy failed. Select the text and copy it manually.");
  }
}
function currentRequestId() {
  return state.active?.requestId ?? null;
}
function bindActions() {
  const form = $("request-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = readForm();
    void act({ type: "POPUP_PREPARE", input }, "Prompt prepared. Review it before anything is sent.");
  });
  for (const id of ["resume-text", "job-description", "custom-instructions", "task", "template", "output-format"]) {
    $(id).addEventListener("input", scheduleDraftSave);
    $(id).addEventListener("change", scheduleDraftSave);
  }
  $("prompt-editor").addEventListener("input", updatePromptCount);
  $("btn-send-gemini").addEventListener("click", () => {
    const id = currentRequestId();
    if (!id) return;
    const prompt = $("prompt-editor").value;
    void act({ type: "POPUP_APPROVE_SEND", requestId: id, prompt }, "Prompt inserted. Check it in the Gemini tab.");
  });
  $("btn-copy-prompt").addEventListener("click", () => {
    void copyText($("prompt-editor").value, "Prompt");
  });
  $("btn-copy-prompt-manual").addEventListener("click", () => {
    if (state.active) void copyText(state.active.prompt, "Prompt");
  });
  $("btn-cancel-review").addEventListener("click", () => {
    const id = currentRequestId();
    if (id) void act({ type: "POPUP_CANCEL", requestId: id }, "Request cancelled. Nothing was sent to Gemini.");
  });
  $("btn-cancel-progress").addEventListener("click", () => {
    const id = currentRequestId();
    if (id) void act({ type: "POPUP_CANCEL", requestId: id }, "Request cancelled.");
  });
  $("btn-confirm-submit").addEventListener("click", () => {
    const id = currentRequestId();
    if (id) void act({ type: "POPUP_CONFIRM_SUBMIT", requestId: id }, "Submitting in Gemini. Waiting for the response.");
  });
  $("btn-retry-insert").addEventListener("click", () => {
    const id = currentRequestId();
    if (id) void act({ type: "POPUP_RETRY_INSERT", requestId: id });
  });
  $("btn-open-gemini").addEventListener("click", () => {
    void act({ type: "POPUP_OPEN_GEMINI" }, "Gemini opened in a tab.");
  });
  $("btn-retry-extract-progress").addEventListener("click", () => {
    const id = currentRequestId();
    if (id) void act({ type: "POPUP_RETRY_EXTRACT", requestId: id });
  });
  $("btn-copy-response").addEventListener("click", () => {
    if (state.active?.output) void copyText(state.active.output.text, "Response");
  });
  $("btn-copy-latex").addEventListener("click", () => {
    const output = state.active?.output;
    if (output) void copyText(output.latexSource ?? output.text, "LaTeX source");
  });
  $("btn-retry-extract").addEventListener("click", () => {
    const id = currentRequestId();
    if (id) void act({ type: "POPUP_RETRY_EXTRACT", requestId: id });
  });
  $("confirm-transfer").addEventListener("change", updateTransferState);
  $("btn-transfer").addEventListener("click", () => {
    const id = currentRequestId();
    const confirmed = $("confirm-transfer").checked;
    if (id) void act({ type: "POPUP_TRANSFER", requestId: id, confirmed }, "Sent to ResumeMate as a draft.");
  });
  $("btn-discard").addEventListener("click", () => {
    void act({ type: "POPUP_CLEAR" }, "Response discarded.").then(clearDraft);
  });
  $("btn-new-request").addEventListener("click", () => {
    void act({ type: "POPUP_CLEAR" }).then(clearDraft);
  });
  $("btn-clear").addEventListener("click", () => {
    void act({ type: "POPUP_CLEAR" }, "Cleared the current input and output.").then(clearDraft);
  });
}
function populateOptions() {
  populateSelect($("task"), TASKS, TASK_LABELS);
  populateSelect($("template"), TEMPLATES, TEMPLATE_LABELS);
  populateSelect($("output-format"), OUTPUT_FORMATS, OUTPUT_FORMAT_LABELS);
}
async function init() {
  populateOptions();
  bindActions();
  await restoreDraft();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "session" && STORAGE_KEYS.activeRequest in changes) {
      void send({ type: "POPUP_GET_STATE" });
    }
  });
  await send({ type: "POPUP_GET_STATE" });
}
void init();
