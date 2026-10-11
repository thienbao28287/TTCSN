const SIDEBAR_TEMPLATE_URL = new URL("../component/sidebar.html", import.meta.url);
const SIDEBAR_STORAGE_KEY = "openquiz-sidebar-collapsed";

function readCollapsedPreference() {
  try {
    const value = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return value === null ? null : value === "true";
  } catch {
    return null;
  }
}

function writeCollapsedPreference(value) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value));
  } catch {
    return;
  }
}

export async function initSidebar({
  mount,
  lessons,
  activeLessonId,
  activePage = "study",
  onLessonChange = () => {},
}) {
  if (!(mount instanceof HTMLElement)) {
    throw new TypeError("Sidebar mount element is required.");
  }

  const response = await fetch(SIDEBAR_TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(`Không thể tải sidebar: ${response.status}`);
  }

  mount.innerHTML = await response.text();

  const shell = mount.closest(".oq-app-shell");
  const sidebar = mount.querySelector("[data-sidebar]");
  const toggle = mount.querySelector("[data-sidebar-toggle]");
  const lessonListToggle = mount.querySelector("[data-lesson-list-toggle]");
  const lessonList = mount.querySelector("[data-sidebar-lessons]");
  const studyGroup = mount.querySelector("[data-study-group]");
  const quizLink = mount.querySelector("[data-sidebar-quiz]");
  const statisticsLink = mount.querySelector("[data-sidebar-statistics]");
  const backdrop = shell?.querySelector("[data-sidebar-backdrop]");
  const mobileOpenButton = shell?.querySelector("[data-mobile-sidebar-open]");
  const mobileQuery = window.matchMedia("(max-width: 47.999rem)");
  const compactQuery = window.matchMedia("(max-width: 64rem)");

  if (!shell || !sidebar || !toggle || !lessonList || !backdrop) {
    throw new Error("Sidebar template is missing required elements.");
  }

  let currentLessonId = activeLessonId;
  let drawerOpen = false;
  let lastDrawerTrigger = null;
  const savedCollapsed = readCollapsedPreference();
  let collapsed = savedCollapsed ?? compactQuery.matches;

  studyGroup?.classList.toggle("is-active", activePage === "study");
  quizLink?.classList.toggle("is-active", activePage === "quiz");
  statisticsLink?.classList.toggle("is-active", activePage === "statistics");

  if (activePage === "study") {
    lessonListToggle?.setAttribute("aria-current", "page");
  } else {
    lessonListToggle?.removeAttribute("aria-current");
  }

  if (activePage === "quiz") {
    quizLink?.setAttribute("aria-current", "page");
  }

  if (activePage === "statistics") {
    statisticsLink?.setAttribute("aria-current", "page");
  }

  function syncLessonLinks() {
    lessonList.querySelectorAll("[data-lesson-id]").forEach((button) => {
      const isActive = button.dataset.lessonId === currentLessonId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
      if (isActive) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    const query = currentLessonId
      ? `?lesson=${encodeURIComponent(currentLessonId)}`
      : "";

    if (quizLink) {
      quizLink.href = `./quiz.html${query}`;
    }
  }

  function renderLessons() {
    const fragment = document.createDocumentFragment();

    lessons.forEach((lesson) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const marker = document.createElement("span");
      const label = document.createElement("span");

      button.type = "button";
      button.className = "oq-sidebar__lesson";
      button.dataset.lessonId = lesson.id;
      button.title = `Bài ${lesson.order} · ${lesson.title}`;
      button.setAttribute("aria-pressed", "false");

      marker.className = "oq-sidebar__lesson-marker";
      marker.setAttribute("aria-hidden", "true");
      label.className = "oq-sidebar__lesson-label";
      label.textContent = `Bài ${lesson.order} · ${lesson.title}`;

      button.append(marker, label);
      button.addEventListener("click", () => {
        currentLessonId = lesson.id;
        syncLessonLinks();
        onLessonChange(lesson.id);
        closeDrawer({ restoreFocus: false });
      });

      item.append(button);
      fragment.append(item);
    });

    lessonList.replaceChildren(fragment);
    syncLessonLinks();
  }

  function setCollapsed(nextCollapsed, { persist = true } = {}) {
    collapsed = Boolean(nextCollapsed);
    shell.dataset.sidebarCollapsed = String(collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng",
    );

    if (persist) {
      writeCollapsedPreference(collapsed);
    }
  }

  function openDrawer(trigger = mobileOpenButton) {
    if (!mobileQuery.matches) {
      return;
    }

    drawerOpen = true;
    lastDrawerTrigger = trigger;
    shell.dataset.sidebarOpen = "true";
    backdrop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    mobileOpenButton?.setAttribute("aria-expanded", "true");
    document.body.classList.add("oq-drawer-open");
    window.requestAnimationFrame(() => toggle.focus());
  }

  function closeDrawer({ restoreFocus = true } = {}) {
    if (!drawerOpen && shell.dataset.sidebarOpen !== "true") {
      return;
    }

    drawerOpen = false;
    shell.dataset.sidebarOpen = "false";
    backdrop.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    mobileOpenButton?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("oq-drawer-open");

    if (restoreFocus && lastDrawerTrigger instanceof HTMLElement) {
      lastDrawerTrigger.focus();
    }
  }

  function syncResponsiveMode() {
    if (mobileQuery.matches) {
      shell.dataset.sidebarOpen = String(drawerOpen);
      backdrop.hidden = !drawerOpen;
      mobileOpenButton?.setAttribute("aria-expanded", String(drawerOpen));
      toggle.setAttribute("aria-expanded", String(drawerOpen));
      return;
    }

    closeDrawer({ restoreFocus: false });
    if (savedCollapsed === null && compactQuery.matches) {
      setCollapsed(true, { persist: false });
    } else {
      setCollapsed(collapsed, { persist: false });
    }
  }

  function handleToggle() {
    if (mobileQuery.matches) {
      if (drawerOpen) {
        closeDrawer();
      } else {
        openDrawer(toggle);
      }
      return;
    }

    setCollapsed(!collapsed);
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape" && drawerOpen) {
      closeDrawer();
    }
  }

  toggle.addEventListener("click", handleToggle);
  mobileOpenButton?.addEventListener("click", () => openDrawer(mobileOpenButton));
  backdrop.addEventListener("click", () => closeDrawer());
  document.addEventListener("keydown", handleDocumentKeydown);
  mobileQuery.addEventListener("change", syncResponsiveMode);
  compactQuery.addEventListener("change", syncResponsiveMode);

  lessonListToggle?.addEventListener("click", () => {
    const isExpanded = lessonListToggle.getAttribute("aria-expanded") === "true";
    lessonListToggle.setAttribute("aria-expanded", String(!isExpanded));
    lessonList.hidden = isExpanded;
  });

  renderLessons();
  setCollapsed(collapsed, { persist: false });
  syncResponsiveMode();

  return {
    updateActiveLesson(lessonId) {
      currentLessonId = lessonId;
      syncLessonLinks();
    },
    openDrawer,
    closeDrawer,
    destroy() {
      document.removeEventListener("keydown", handleDocumentKeydown);
      mobileQuery.removeEventListener("change", syncResponsiveMode);
      compactQuery.removeEventListener("change", syncResponsiveMode);
    },
  };
}
