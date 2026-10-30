"use strict";
(() => {
  // <define:__DEV_WEBSITE_ORIGINS__>
  var define_DEV_WEBSITE_ORIGINS_default = [];

  // src/shared/constants.ts
  var PROTOCOL_VERSION = 1;
  var PRODUCTION_WEBSITE_ORIGIN = "https://prajwalkedari.tech";
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

  // src/shared/validation.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  // src/shared/protocol.ts
  var WEB_CHANNEL = "resumemate-web";
  function isBridgeEnvelope(value, direction) {
    return isRecord(value) && value.channel === WEB_CHANNEL && value.v === PROTOCOL_VERSION && value.direction === direction && isRecord(value.message);
  }
  var MAX_EVENT_TEXT_CHARS = LIMITS.maxOutputChars * 2;

  // src/content/resumemate.ts
  function postToPage(message) {
    window.postMessage(
      { channel: WEB_CHANNEL, v: PROTOCOL_VERSION, direction: "to-page", message },
      window.location.origin
    );
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (!isBridgeEnvelope(event.data, "to-extension")) return;
    const inbound = event.data.message;
    chrome.runtime.sendMessage({ type: "WEB_INBOUND", message: inbound }).then((reply) => {
      if (reply && typeof reply === "object") postToPage(reply);
    }).catch(() => {
      const requestId = typeof inbound.requestId === "string" ? inbound.requestId : null;
      postToPage({
        type: "ERROR",
        requestId,
        code: "INTERNAL_ERROR",
        message: "The ResumeMate Assistant extension is not responding. Check that it is installed and enabled, then reload this page."
      });
    });
  });
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (typeof message === "object" && message !== null && message.type === "WEB_OUTBOUND") {
      postToPage(message.message);
    }
    return false;
  });
})();
