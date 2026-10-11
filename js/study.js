import { initSidebar } from "./sidebar.js";

const MOCK_DATA_URL = new URL("../mockData/mockdata.json", import.meta.url);
const USER_STATE_KEY = "openquiz-user-state";
const THEME_KEY = "oq-theme";

const elements = {
  workspace: document.querySelector("[data-study-workspace]"),
  error: document.querySelector("[data-study-error]"),
  storageWarning: document.querySelector("[data-storage-warning]"),
  sidebarMount: document.querySelector("[data-sidebar-mount]"),
  themeToggle: document.querySelector("[data-theme-toggle]"),
  courseTitle: document.querySelector("[data-course-title]"),
  lessonOrder: document.querySelector("[data-lesson-order]"),
  lessonTitle: document.querySelector("[data-lesson-title]"),
  cardPosition: document.querySelector("[data-card-position]"),
  cardTotal: document.querySelector("[data-card-total]"),
  progress: document.querySelector("[data-study-progress]"),
  progressFill: document.querySelector("[data-study-progress-fill]"),
  studyCard: document.querySelector("[data-study-card]"),
  flipButton: document.querySelector("[data-card-flip]"),
  cardFront: document.querySelector("[data-card-front]"),
  cardBack: document.querySelector("[data-card-back]"),
  question: document.querySelector("[data-card-question]"),
  definition: document.querySelector("[data-card-definition]"),
  example: document.querySelector("[data-card-example]"),
  previous: document.querySelector("[data-card-previous]"),
  next: document.querySelector("[data-card-next]"),
  ratingButtons: [...document.querySelectorAll("[data-card-rating]")],
  resultDialog: document.querySelector("[data-result-dialog]"),
  resultClose: document.querySelector("[data-result-close]"),
  resultKnown: document.querySelector("[data-result-known]"),
  resultTotal: document.querySelector("[data-result-total]"),
  resultPercentage: document.querySelector("[data-result-percentage]"),
  resultMessage: document.querySelector("[data-result-message]"),
  restart: document.querySelector("[data-study-restart]"),
  continueQuiz: document.querySelector("[data-continue-quiz]"),
};

let database = null;
let userState = null;
let currentCourse = null;
let currentLesson = null;
let currentCards = [];
let currentProgress = null;
let sidebarController = null;
let isFlipped = false;
let isTransitioning = false;
let canPersistState = true;
let lastModalTrigger = null;

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function isValidState(value) {
  return (
    value &&
    typeof value === "object" &&
    Array.isArray(value.lessonProgress) &&
    Array.isArray(value.quizAttempts) &&
    Array.isArray(value.activities)
  );
}

function readUserState(seed) {
  try {
    const stored = localStorage.getItem(USER_STATE_KEY);
    if (!stored) {
      return clone(seed);
    }

    const parsed = JSON.parse(stored);
    return isValidState(parsed) ? parsed : clone(seed);
  } catch {
    canPersistState = false;
    return clone(seed);
  }
}

function saveUserState() {
  if (!canPersistState) {
    elements.storageWarning.hidden = false;
    return;
  }

  try {
    localStorage.setItem(USER_STATE_KEY, JSON.stringify(userState));
  } catch {
    canPersistState = false;
    elements.storageWarning.hidden = false;
  }
}

function readTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    return savedTheme === "dark" || savedTheme === "light" ? savedTheme : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
  elements.themeToggle.setAttribute(
    "aria-label",
    isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối",
  );
}

function initTheme() {
  applyTheme(readTheme());
  elements.themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      return;
    }
  });
}

async function loadDatabase() {
  const response = await fetch(MOCK_DATA_URL);
  if (!response.ok) {
    throw new Error(`Không thể tải mock data: ${response.status}`);
  }

  const data = await response.json();
  if (
    !Array.isArray(data.courses) ||
    !Array.isArray(data.lessons) ||
    !Array.isArray(data.flashcards) ||
    !data.initialUserState
  ) {
    throw new Error("Mock data không đúng cấu trúc yêu cầu.");
  }

  return data;
}

function getRequestedLessonId() {
  return new URLSearchParams(window.location.search).get("lesson");
}

function findLesson(lessonId) {
  return database.lessons.find((lesson) => lesson.id === lessonId);
}

function getOrCreateProgress(lessonId) {
  let progress = userState.lessonProgress.find((item) => item.lessonId === lessonId);

  if (!progress) {
    progress = {
      lessonId,
      status: "not_started",
      currentFlashcardIndex: 0,
      knownFlashcardIds: [],
      reviewFlashcardIds: [],
      completedAt: null,
    };
    userState.lessonProgress.push(progress);
  }

  progress.knownFlashcardIds = Array.isArray(progress.knownFlashcardIds)
    ? progress.knownFlashcardIds
    : [];
  progress.reviewFlashcardIds = Array.isArray(progress.reviewFlashcardIds)
    ? progress.reviewFlashcardIds
    : [];

  return progress;
}

function setError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.workspace.hidden = true;
}

function clearError() {
  elements.error.hidden = true;
  elements.workspace.hidden = false;
}

function setFlipped(nextFlipped) {
  isFlipped = Boolean(nextFlipped);
  elements.studyCard.dataset.flipped = String(isFlipped);
  elements.flipButton.setAttribute("aria-pressed", String(isFlipped));
  elements.flipButton.setAttribute(
    "aria-label",
    isFlipped ? "Lật thẻ để xem câu hỏi" : "Lật thẻ để xem định nghĩa",
  );
  elements.cardFront.setAttribute("aria-hidden", String(isFlipped));
  elements.cardBack.setAttribute("aria-hidden", String(!isFlipped));
}

function updateRatingButtons(cardId) {
  const isKnown = currentProgress.knownFlashcardIds.includes(cardId);
  const isReview = currentProgress.reviewFlashcardIds.includes(cardId);

  elements.ratingButtons.forEach((button) => {
    const selected =
      (button.dataset.cardRating === "known" && isKnown) ||
      (button.dataset.cardRating === "review" && isReview);
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-selected", selected);
    button.disabled = isTransitioning;
  });
}

function renderCard() {
  const total = currentCards.length;
  const index = Math.min(Math.max(Number(currentProgress.currentFlashcardIndex) || 0, 0), total - 1);
  const card = currentCards[index];

  currentProgress.currentFlashcardIndex = index;
  elements.question.textContent = card.front;
  elements.definition.textContent = card.back;
  elements.example.textContent = card.example ? `Ví dụ: ${card.example}` : "";
  elements.cardPosition.textContent = String(index + 1);
  elements.cardTotal.textContent = String(total);
  elements.progress.setAttribute("aria-valuemin", "1");
  elements.progress.setAttribute("aria-valuemax", String(total));
  elements.progress.setAttribute("aria-valuenow", String(index + 1));
  elements.progressFill.style.width = `${((index + 1) / total) * 100}%`;
  elements.previous.disabled = index === 0 || isTransitioning;
  elements.next.disabled = index === total - 1 || isTransitioning;
  setFlipped(false);
  updateRatingButtons(card.id);
}

function renderLesson() {
  currentCourse = database.courses.find((course) => course.id === currentLesson.courseId);
  currentCards = currentLesson.flashcardIds
    .map((cardId) => database.flashcards.find((card) => card.id === cardId))
    .filter(Boolean);

  if (!currentCourse || currentCards.length === 0) {
    throw new Error("Bài học không có dữ liệu flashcard hợp lệ.");
  }

  currentProgress = getOrCreateProgress(currentLesson.id);
  currentProgress.currentFlashcardIndex = Math.min(
    Math.max(Number(currentProgress.currentFlashcardIndex) || 0, 0),
    currentCards.length - 1,
  );

  if (currentProgress.status === "not_started") {
    currentProgress.status = "in_progress";
  }

  userState.activeCourseId = currentCourse.id;
  userState.activeLessonId = currentLesson.id;
  elements.courseTitle.textContent = currentCourse.title;
  elements.lessonOrder.textContent = `Bài ${currentLesson.order}`;
  elements.lessonTitle.textContent = currentLesson.title;
  elements.continueQuiz.href = `./quiz.html?lesson=${encodeURIComponent(currentLesson.id)}`;
  document.title = `${currentLesson.title} | OpenQuiz`;
  clearError();
  renderCard();
  saveUserState();
}

function updateUrl(lessonId, { replace = false } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set("lesson", lessonId);
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

function selectLesson(lessonId, { updateHistory = true } = {}) {
  const lesson = findLesson(lessonId);
  if (!lesson) {
    setError("Không tìm thấy bài học được yêu cầu.");
    return;
  }

  currentLesson = lesson;
  isTransitioning = false;
  try {
    renderLesson();
    sidebarController?.updateActiveLesson(lessonId);
    if (updateHistory) {
      updateUrl(lessonId);
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : "Không thể hiển thị bài học.");
  }
}

function goToCard(index) {
  if (isTransitioning || index < 0 || index >= currentCards.length) {
    return;
  }

  currentProgress.currentFlashcardIndex = index;
  saveUserState();
  renderCard();
}

function isCardRated(cardId) {
  return (
    currentProgress.knownFlashcardIds.includes(cardId) ||
    currentProgress.reviewFlashcardIds.includes(cardId)
  );
}

function addCompletionActivity() {
  userState.activities.push({
    id: `activity-${Date.now()}`,
    type: "lesson_completed",
    lessonId: currentLesson.id,
    createdAt: currentProgress.completedAt,
  });
}

function completeLessonIfReady() {
  const allRated = currentCards.every((card) => isCardRated(card.id));
  if (!allRated) {
    return false;
  }

  if (currentProgress.status !== "completed") {
    currentProgress.status = "completed";
    currentProgress.completedAt = new Date().toISOString();
    addCompletionActivity();
  }

  return true;
}

function showResult(trigger) {
  const knownCount = currentProgress.knownFlashcardIds.filter((cardId) =>
    currentCards.some((card) => card.id === cardId),
  ).length;
  const percentage = Math.round((knownCount / currentCards.length) * 100);

  elements.resultKnown.textContent = String(knownCount);
  elements.resultTotal.textContent = String(currentCards.length);
  elements.resultPercentage.textContent = `${percentage}%`;
  elements.resultMessage.textContent =
    percentage === 100
      ? "Tuyệt vời! Bạn đã ghi nhớ toàn bộ thẻ trong bài học này."
      : `Bạn còn ${currentCards.length - knownCount} thẻ nên ôn lại trước khi làm bài kiểm tra.`;
  lastModalTrigger = trigger instanceof HTMLElement ? trigger : elements.flipButton;

  if (typeof elements.resultDialog.showModal === "function") {
    elements.resultDialog.showModal();
    window.requestAnimationFrame(() => elements.resultClose.focus());
  } else {
    elements.resultDialog.setAttribute("open", "");
  }
}

function closeResult() {
  if (typeof elements.resultDialog.close === "function" && elements.resultDialog.open) {
    elements.resultDialog.close();
  } else {
    elements.resultDialog.removeAttribute("open");
  }
}

function rateCurrentCard(rating, trigger) {
  if (isTransitioning) {
    return;
  }

  const index = currentProgress.currentFlashcardIndex;
  const card = currentCards[index];
  currentProgress.knownFlashcardIds = currentProgress.knownFlashcardIds.filter(
    (cardId) => cardId !== card.id,
  );
  currentProgress.reviewFlashcardIds = currentProgress.reviewFlashcardIds.filter(
    (cardId) => cardId !== card.id,
  );

  if (rating === "known") {
    currentProgress.knownFlashcardIds.push(card.id);
  } else {
    currentProgress.reviewFlashcardIds.push(card.id);
  }

  const completed = completeLessonIfReady();
  saveUserState();
  updateRatingButtons(card.id);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const delay = reduceMotion ? 0 : 220;
  isTransitioning = true;
  updateRatingButtons(card.id);

  window.setTimeout(() => {
    isTransitioning = false;
    if (completed) {
      renderCard();
      showResult(trigger);
      return;
    }

    if (index < currentCards.length - 1) {
      goToCard(index + 1);
      return;
    }

    const firstUnratedIndex = currentCards.findIndex((item) => !isCardRated(item.id));
    goToCard(firstUnratedIndex >= 0 ? firstUnratedIndex : index);
  }, delay);
}

function restartLesson() {
  currentProgress.status = "in_progress";
  currentProgress.currentFlashcardIndex = 0;
  currentProgress.knownFlashcardIds = [];
  currentProgress.reviewFlashcardIds = [];
  currentProgress.completedAt = null;
  isTransitioning = false;
  saveUserState();
  closeResult();
  renderCard();
  window.requestAnimationFrame(() => elements.flipButton.focus());
}

function bindStudyEvents() {
  elements.flipButton.addEventListener("click", () => setFlipped(!isFlipped));
  elements.previous.addEventListener("click", () =>
    goToCard(currentProgress.currentFlashcardIndex - 1),
  );
  elements.next.addEventListener("click", () =>
    goToCard(currentProgress.currentFlashcardIndex + 1),
  );
  elements.ratingButtons.forEach((button) => {
    button.addEventListener("click", () => rateCurrentCard(button.dataset.cardRating, button));
  });
  elements.resultClose.addEventListener("click", closeResult);
  elements.restart.addEventListener("click", restartLesson);
  elements.resultDialog.addEventListener("click", (event) => {
    if (event.target === elements.resultDialog) {
      closeResult();
    }
  });
  elements.resultDialog.addEventListener("close", () => {
    lastModalTrigger?.focus();
  });
  window.addEventListener("popstate", () => {
    const requestedLesson = findLesson(getRequestedLessonId());
    if (requestedLesson) {
      selectLesson(requestedLesson.id, { updateHistory: false });
    }
  });
}

async function init() {
  initTheme();
  elements.workspace.setAttribute("aria-busy", "true");

  try {
    database = await loadDatabase();
    userState = readUserState(database.initialUserState);
    elements.storageWarning.hidden = canPersistState;

    const requestedLessonId = getRequestedLessonId();
    currentLesson =
      findLesson(requestedLessonId) ||
      findLesson(userState.activeLessonId) ||
      database.lessons[0];

    if (!currentLesson) {
      throw new Error("Không có bài học nào trong mock data.");
    }

    const courseLessons = database.lessons.filter(
      (lesson) => lesson.courseId === currentLesson.courseId,
    );

    renderLesson();
    updateUrl(currentLesson.id, { replace: true });
    bindStudyEvents();

    try {
      sidebarController = await initSidebar({
        mount: elements.sidebarMount,
        lessons: courseLessons,
        activeLessonId: currentLesson.id,
        activePage: "study",
        onLessonChange: (lessonId) => selectLesson(lessonId),
      });
    } catch (sidebarError) {
      elements.storageWarning.textContent =
        sidebarError instanceof Error
          ? sidebarError.message
          : "Không thể tải thanh điều hướng.";
      elements.storageWarning.hidden = false;
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : "Không thể khởi tạo trang Study.");
  } finally {
    elements.workspace.removeAttribute("aria-busy");
  }
}

init();
