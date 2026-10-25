const SIDEBAR_TEMPLATE_URL = "../component/sidebar.html";
const SIDEBAR_STORAGE_KEY = "openquiz-sidebar-collapsed";

function readCollapsedPreference() {
  try {
    const value = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (value === null) {
      return null;
    }
    return value === "true";
  } catch (error) {
    return null;
  }
}

function writeCollapsedPreference(collapsed) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  } catch (error) {
    // Sidebar vẫn hoạt động nếu trình duyệt không cho lưu tùy chọn.
  }
}

export async function initSidebar(options) {
  const mount = options.mount;
  const lessons = options.lessons;
  const activePage = options.activePage || "study";
  if (!mount) {
    throw new Error("Không tìm thấy vị trí hiển thị thanh điều hướng.");
  }
  const response = await fetch(SIDEBAR_TEMPLATE_URL);
  if (!response.ok) {
    throw new Error("Không thể tải thanh điều hướng: " + response.status);
  }
  mount.innerHTML = await response.text();

  const shell = mount.closest(".oq-app-shell");
  if (!shell) {
    throw new Error("Không tìm thấy khung trang.");
  }
  const sidebar = mount.querySelector("[data-sidebar]");
  const toggle = mount.querySelector("[data-sidebar-toggle]");
  const lessonListToggle = mount.querySelector("[data-lesson-list-toggle]");
  const lessonList = mount.querySelector("[data-sidebar-lessons]");
  const studyGroup = mount.querySelector("[data-study-group]");
  const quizLink = mount.querySelector("[data-sidebar-quiz]");
  const statisticsLink = mount.querySelector("[data-sidebar-statistics]");
  const backdrop = shell.querySelector("[data-sidebar-backdrop]");
  const mobileOpenButton = shell.querySelector("[data-mobile-sidebar-open]");
  if (!sidebar || !toggle || !lessonListToggle || !lessonList || !studyGroup ||
      !quizLink || !statisticsLink || !backdrop || !mobileOpenButton) {
    throw new Error("Thanh điều hướng thiếu thành phần cần thiết.");
  }

  const mobileQuery = window.matchMedia("(max-width: 47.999rem)");
  const compactQuery = window.matchMedia("(max-width: 64rem)");
  let currentLessonId = options.activeLessonId;
  let drawerOpen = false;
  let lastDrawerTrigger = null;
  let savedCollapsed = readCollapsedPreference();
  let collapsed = compactQuery.matches;
  if (savedCollapsed !== null) {
    collapsed = savedCollapsed;
  }

  studyGroup.classList.toggle("is-active", activePage === "study");
  quizLink.classList.toggle("is-active", activePage === "quiz");
  statisticsLink.classList.toggle("is-active", activePage === "statistics");
  if (activePage === "study") {
    lessonListToggle.setAttribute("aria-current", "page");
  } else if (activePage === "quiz") {
    quizLink.setAttribute("aria-current", "page");
  } else if (activePage === "statistics") {
    statisticsLink.setAttribute("aria-current", "page");
  }

  function updateActiveLesson(lessonId) {
    currentLessonId = lessonId;
    const buttons = lessonList.querySelectorAll("[data-lesson-id]");
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      const active = activePage === "study" && button.dataset.lessonId === currentLessonId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    }
  }

  function handleLessonClick(event) {
    const lessonId = event.currentTarget.dataset.lessonId;
    updateActiveLesson(lessonId);
    if (options.onLessonChange) {
      options.onLessonChange(lessonId);
    }
    closeDrawer(false);
  }

  function renderLessons() {
    lessonList.replaceChildren();
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      const item = document.createElement("li");
      const button = document.createElement("button");
      const marker = document.createElement("span");
      const label = document.createElement("span");
      button.type = "button";
      button.className = "oq-sidebar__lesson";
      button.dataset.lessonId = lesson.id;
      button.title = "Bài " + lesson.order + " · " + lesson.title;
      marker.className = "oq-sidebar__lesson-marker";
      marker.setAttribute("aria-hidden", "true");
      label.className = "oq-sidebar__lesson-label";
      label.textContent = button.title;
      button.append(marker, label);
      button.addEventListener("click", handleLessonClick);
      item.append(button);
      lessonList.append(item);
    }
    updateActiveLesson(currentLessonId);
  }

  function setCollapsed(nextCollapsed) {
    collapsed = nextCollapsed;
    shell.dataset.sidebarCollapsed = String(collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    if (collapsed) {
      toggle.setAttribute("aria-label", "Mở rộng thanh điều hướng");
    } else {
      toggle.setAttribute("aria-label", "Thu gọn thanh điều hướng");
    }
  }

  function openDrawer(trigger) {
    if (!mobileQuery.matches) {
      return;
    }
    drawerOpen = true;
    lastDrawerTrigger = trigger || mobileOpenButton;
    shell.dataset.sidebarOpen = "true";
    backdrop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    mobileOpenButton.setAttribute("aria-expanded", "true");
    document.body.classList.add("oq-drawer-open");
    toggle.focus();
  }

  function closeDrawer(restoreFocus) {
    if (!drawerOpen) {
      return;
    }
    drawerOpen = false;
    shell.dataset.sidebarOpen = "false";
    backdrop.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    mobileOpenButton.setAttribute("aria-expanded", "false");
    document.body.classList.remove("oq-drawer-open");
    if (restoreFocus && lastDrawerTrigger) {
      lastDrawerTrigger.focus();
    }
  }

  function syncResponsiveMode() {
    if (mobileQuery.matches) {
      shell.dataset.sidebarOpen = String(drawerOpen);
      backdrop.hidden = !drawerOpen;
      mobileOpenButton.setAttribute("aria-expanded", String(drawerOpen));
      toggle.setAttribute("aria-expanded", String(drawerOpen));
    } else {
      closeDrawer(false);
      if (savedCollapsed === null) {
        collapsed = compactQuery.matches;
      }
      setCollapsed(collapsed);
    }
  }

  function handleToggle() {
    if (mobileQuery.matches) {
      if (drawerOpen) {
        closeDrawer(true);
      } else {
        openDrawer(toggle);
      }
    } else {
      setCollapsed(!collapsed);
      savedCollapsed = collapsed;
      writeCollapsedPreference(collapsed);
    }
  }

  function handleMobileOpen() {
    openDrawer(mobileOpenButton);
  }

  function handleBackdropClick() {
    closeDrawer(true);
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape") {
      closeDrawer(true);
    }
  }

  function handleLessonListToggle() {
    const expanded = lessonListToggle.getAttribute("aria-expanded") === "true";
    lessonListToggle.setAttribute("aria-expanded", String(!expanded));
    lessonList.hidden = expanded;
  }

  function destroy() {
    closeDrawer(false);
    toggle.removeEventListener("click", handleToggle);
    mobileOpenButton.removeEventListener("click", handleMobileOpen);
    backdrop.removeEventListener("click", handleBackdropClick);
    lessonListToggle.removeEventListener("click", handleLessonListToggle);
    const buttons = lessonList.querySelectorAll("[data-lesson-id]");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].removeEventListener("click", handleLessonClick);
    }
    document.removeEventListener("keydown", handleDocumentKeydown);
    mobileQuery.removeEventListener("change", syncResponsiveMode);
    compactQuery.removeEventListener("change", syncResponsiveMode);
  }

  toggle.addEventListener("click", handleToggle);
  mobileOpenButton.addEventListener("click", handleMobileOpen);
  backdrop.addEventListener("click", handleBackdropClick);
  lessonListToggle.addEventListener("click", handleLessonListToggle);
  document.addEventListener("keydown", handleDocumentKeydown);
  mobileQuery.addEventListener("change", syncResponsiveMode);
  compactQuery.addEventListener("change", syncResponsiveMode);
  renderLessons();
  setCollapsed(collapsed);
  syncResponsiveMode();
  return {
    updateActiveLesson: updateActiveLesson,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    destroy: destroy,
  };
}
