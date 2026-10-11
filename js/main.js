(function initializeOpenQuiz(windowObject) {
  "use strict";

  const documentObject = windowObject.document;
  const utils = windowObject.OpenQuizUtils;
  const reducedMotion = windowObject.matchMedia("(prefers-reduced-motion: reduce)");
  let activeModalTrigger = null;

  function syncThemeControls(theme) {
    utils.queryAll("[data-theme-toggle]").forEach((button) => {
      const nextTheme = theme === "dark" ? "light" : "dark";
      button.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
      button.setAttribute("title", `Switch to ${nextTheme} theme`);
    });

    const metaTheme = utils.query('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#0f0f10" : "#ffffff");
  }

  function setTheme(theme, persist) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    documentObject.documentElement.dataset.theme = safeTheme;
    syncThemeControls(safeTheme);
    if (persist) utils.writeStorage("oq-theme", safeTheme);
  }

  function initTheme() {
    setTheme(utils.readStorage("oq-theme", "light"), false);
    utils.queryAll("[data-theme-toggle]").forEach((button) => {
      utils.listen(button, "click", () => {
        const current = documentObject.documentElement.dataset.theme;
        setTheme(current === "dark" ? "light" : "dark", true);
      });
    });
  }

  function initNavigation() {
    const menu = utils.query("[data-mobile-menu]");
    const toggle = utils.query("[data-menu-toggle]");

    if (menu && toggle) {
      const closeMenu = () => {
        menu.dataset.open = "false";
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation");
        documentObject.body.classList.remove("is-menu-open");
      };

      utils.listen(toggle, "click", () => {
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        menu.dataset.open = String(!isOpen);
        toggle.setAttribute("aria-expanded", String(!isOpen));
        toggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
        documentObject.body.classList.toggle("is-menu-open", !isOpen);
      });

      utils.queryAll("a", menu).forEach((link) => utils.listen(link, "click", closeMenu));
      utils.listen(windowObject, "resize", () => {
        if (windowObject.innerWidth >= 1024) closeMenu();
      });
    }

    const observedSections = utils.queryAll("main section[id]");
    const navLinks = utils.queryAll(".oq-nav__link[href^='#']");
    if ("IntersectionObserver" in windowObject && observedSections.length && navLinks.length) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          navLinks.forEach((link) => {
            const active = link.getAttribute("href") === `#${entry.target.id}`;
            if (active) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
          });
        });
      }, { rootMargin: "-35% 0px -58%", threshold: 0 });

      observedSections.forEach((section) => observer.observe(section));
    }
  }

  function activateTab(tabsRoot, nextTab) {
    const tabs = utils.queryAll('[role="tab"]', tabsRoot);
    tabs.forEach((tab) => {
      const selected = tab === nextTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = utils.query(`#${tab.getAttribute("aria-controls")}`, tabsRoot);
      if (panel) panel.hidden = !selected;
    });
    nextTab.focus();
  }

  function initTabs() {
    utils.queryAll("[data-tabs]").forEach((tabsRoot) => {
      const tabs = utils.queryAll('[role="tab"]', tabsRoot);
      tabs.forEach((tab, index) => {
        utils.listen(tab, "click", () => activateTab(tabsRoot, tab));
        utils.listen(tab, "keydown", (event) => {
          let nextIndex = index;
          if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
          if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
          if (event.key === "Home") nextIndex = 0;
          if (event.key === "End") nextIndex = tabs.length - 1;
          if (nextIndex !== index) {
            event.preventDefault();
            activateTab(tabsRoot, tabs[nextIndex]);
          }
        });
      });
    });
  }

  function closeModal(dialog) {
    if (!dialog || !dialog.open) return;
    dialog.close();
    documentObject.body.classList.remove("has-modal-open");
    if (activeModalTrigger) activeModalTrigger.focus();
    activeModalTrigger = null;
  }

  function initModals() {
    utils.queryAll("[data-modal-open]").forEach((button) => {
      utils.listen(button, "click", () => {
        const dialog = documentObject.getElementById(button.dataset.modalOpen);
        if (!dialog || typeof dialog.showModal !== "function") return;
        activeModalTrigger = button;
        dialog.showModal();
        documentObject.body.classList.add("has-modal-open");
        const firstFocusable = utils.getFocusable(dialog)[0];
        if (firstFocusable) firstFocusable.focus();
      });
    });

    utils.queryAll("dialog.oq-modal").forEach((dialog) => {
      utils.queryAll("[data-modal-close]", dialog).forEach((button) => {
        utils.listen(button, "click", () => closeModal(dialog));
      });

      utils.listen(dialog, "click", (event) => {
        if (event.target === dialog) closeModal(dialog);
      });

      utils.listen(dialog, "cancel", (event) => {
        event.preventDefault();
        closeModal(dialog);
      });

      utils.listen(dialog, "keydown", (event) => {
        if (event.key !== "Tab") return;
        const focusable = utils.getFocusable(dialog);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && documentObject.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && documentObject.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });

      const confirm = utils.query("[data-modal-confirm]", dialog);
      if (confirm) {
        utils.listen(confirm, "click", () => {
          confirm.textContent = "Published";
          confirm.disabled = true;
          windowObject.setTimeout(() => closeModal(dialog), 550);
        });
      }
    });
  }

  function initAccordions() {
    utils.queryAll("[data-accordion]").forEach((root) => {
      const items = utils.queryAll(".pattern-accordion__item", root);
      items.forEach((item, index) => {
        utils.listen(item, "click", () => {
          items.forEach((candidate) => candidate.setAttribute("aria-expanded", String(candidate === item)));
        });
        utils.listen(item, "keydown", (event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
          items[(index + direction + items.length) % items.length].focus();
        });
      });
    });
  }

  function initDemoControls() {
    utils.queryAll(".mini-answer").forEach((answer) => {
      utils.listen(answer, "click", () => {
        const group = answer.parentElement;
        utils.queryAll(".mini-answer", group).forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === answer)));
      });
    });

    const previewSwitch = utils.query("[data-preview-switch]");
    const preview = utils.query("[data-preview-window]");
    if (previewSwitch && preview) {
      utils.listen(previewSwitch, "change", () => {
        if (previewSwitch.checked) preview.dataset.theme = "dark";
        else preview.removeAttribute("data-theme");
      });
    }

    const copyButton = utils.query("[data-copy-code]");
    const code = utils.query("#component-code");
    if (copyButton && code) {
      utils.listen(copyButton, "click", async () => {
        const originalLabel = copyButton.textContent;
        try {
          await utils.copyText(code.textContent.trim());
          copyButton.textContent = "Copied";
        } catch (error) {
          copyButton.textContent = "Copy failed";
        }
        windowObject.setTimeout(() => { copyButton.textContent = originalLabel; }, 1500);
      });
    }
  }

  function initMotion() {
    if (reducedMotion.matches || !windowObject.gsap || !windowObject.ScrollTrigger) return;
    const gsap = windowObject.gsap;
    gsap.registerPlugin(windowObject.ScrollTrigger);

    gsap.from(".hero__title, .hero__copy, .hero__actions", {
      y: 34,
      opacity: 0,
      duration: 1.05,
      stagger: 0.12,
      ease: "power3.out"
    });

    gsap.utils.toArray("[data-float]").forEach((item, index) => {
      gsap.to(item, {
        y: index % 2 === 0 ? -16 : 14,
        duration: 2.6 + index * 0.35,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
      });
    });

    gsap.utils.toArray("[data-image-reveal]").forEach((card) => {
      gsap.fromTo(card, { scale: 0.86, opacity: 0.28 }, {
        scale: 1,
        opacity: 1,
        ease: "none",
        scrollTrigger: { trigger: card, start: "top 92%", end: "center 58%", scrub: true }
      });
      gsap.to(card, {
        opacity: 0.3,
        ease: "none",
        scrollTrigger: { trigger: card, start: "bottom 28%", end: "bottom top", scrub: true }
      });
    });

    gsap.utils.toArray(".stack-card").forEach((card, index, cards) => {
      if (index === cards.length - 1) return;
      gsap.to(card, {
        scale: 0.92 + index * 0.025,
        filter: "brightness(0.72)",
        ease: "none",
        scrollTrigger: {
          trigger: cards[index + 1],
          start: "top 78%",
          end: "top 20%",
          scrub: true
        }
      });
    });
  }

  function start() {
    if (!utils) return;
    initTheme();
    initNavigation();
    initTabs();
    initModals();
    initAccordions();
    initDemoControls();
    initMotion();
  }

  if (documentObject.readyState === "loading") {
    documentObject.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(window);
