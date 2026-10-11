(function createOpenQuizUtilities(windowObject) {
  "use strict";

  const documentObject = windowObject.document;

  function query(selector, scope) {
    return (scope || documentObject).querySelector(selector);
  }

  function queryAll(selector, scope) {
    return Array.from((scope || documentObject).querySelectorAll(selector));
  }

  function listen(target, eventName, handler, options) {
    if (target) target.addEventListener(eventName, handler, options);
  }

  function readStorage(key, fallbackValue) {
    try {
      return windowObject.localStorage.getItem(key) || fallbackValue;
    } catch (error) {
      return fallbackValue;
    }
  }

  function writeStorage(key, value) {
    try {
      windowObject.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function getFocusable(container) {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    return queryAll(selector, container).filter((element) => {
      return !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true";
    });
  }

  async function copyText(value) {
    if (navigator.clipboard && windowObject.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = documentObject.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    documentObject.body.appendChild(textarea);
    textarea.select();
    documentObject.execCommand("copy");
    textarea.remove();
  }

  windowObject.OpenQuizUtils = Object.freeze({
    copyText,
    getFocusable,
    listen,
    query,
    queryAll,
    readStorage,
    writeStorage
  });
})(window);
