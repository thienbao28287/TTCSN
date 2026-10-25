import {
  loadDatabase, readUserState, writeUserState,
  getCourseById, getLessonById, getLessonProgress,
  getCourseLessons, getLessonCards, getStudyMetrics,
} from "./data.js";
import { initSidebar } from "./sidebar.js";

const elements = {
  workspace: document.querySelector("[data-study-workspace]"),
  error: document.querySelector("[data-study-error]"),
  storageWarning: document.querySelector("[data-storage-warning]"),
  sidebarMount: document.querySelector("[data-sidebar-mount]"),
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
  ratingButtons: document.querySelectorAll("[data-card-rating]"),
  resultDialog: document.querySelector("[data-result-dialog]"),
  resultClose: document.querySelector("[data-result-close]"),
  resultKnown: document.querySelector("[data-result-known]"),
  resultTotal: document.querySelector("[data-result-total]"),
  resultPercentage: document.querySelector("[data-result-percentage]"),
  resultMessage: document.querySelector("[data-result-message]"),
  restart: document.querySelector("[data-study-restart]"),
  continueQuiz: document.querySelector("[data-continue-quiz]"),
  resultReview: document.querySelector("[data-result-review]"),
  resultTitle: document.querySelector("[data-result-title]"),
  resultEyebrow: document.querySelector("[data-result-eyebrow]"),
};

let database = null;
let userState = null;
let currentLesson = null;
let currentProgress = null;
let allCards = [];
let currentCards = [];
let currentIndex = 0;
let reviewMode = false;
let reviewedIds = [];
let sidebarController = null;
let isFlipped = false;
let isTransitioning = false;
let transitionTimer = null;
let lastModalTrigger = null;

// Lưu tiến độ và thông báo nếu trình duyệt không cho phép lưu.
function showStorageWarning(message) {
  if (message) {
    elements.storageWarning.textContent = message;
    elements.storageWarning.hidden = false;
  }
}

function saveProgress() {
  const warning = writeUserState(userState);
  showStorageWarning(warning);
}

function getRequestedLessonId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("lesson");
}

function getOrCreateProgress(lessonId) {
  let progress = getLessonProgress(userState, lessonId);
  if (!progress) {
    progress = {
      lessonId: lessonId,
      status: "not_started",
      currentFlashcardIndex: 0,
      knownFlashcardIds: [],
      reviewFlashcardIds: [],
      completedAt: null,
      masteredAt: null,
    };
    userState.lessonProgress.push(progress);
  }
  return progress;
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.workspace.hidden = true;
}

function setFlipped(flipped) {
  isFlipped = flipped;
  elements.studyCard.dataset.flipped = String(flipped);
  elements.flipButton.setAttribute("aria-pressed", String(flipped));
  elements.cardFront.setAttribute("aria-hidden", String(flipped));
  elements.cardBack.setAttribute("aria-hidden", String(!flipped));
  if (flipped) {
    elements.flipButton.setAttribute("aria-label", "Lật thẻ để xem câu hỏi");
  } else {
    elements.flipButton.setAttribute("aria-label", "Lật thẻ để xem định nghĩa");
  }
}

function updateRatingButtons(cardId) {
  for (let i = 0; i < elements.ratingButtons.length; i++) {
    const button = elements.ratingButtons[i];
    let selected = false;
    if (button.dataset.cardRating === "known") {
      selected = currentProgress.knownFlashcardIds.includes(cardId);
    } else {
      selected = currentProgress.reviewFlashcardIds.includes(cardId);
    }
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-selected", selected);
    button.disabled = isTransitioning;
  }
}

function renderCard() {
  if (currentIndex < 0) {
    currentIndex = 0;
  }
  if (currentIndex >= currentCards.length) {
    currentIndex = currentCards.length - 1;
  }
  if (!reviewMode) {
    currentProgress.currentFlashcardIndex = currentIndex;
  }

  const card = currentCards[currentIndex];
  const position = currentIndex + 1;
  elements.question.textContent = card.front;
  elements.definition.textContent = card.back;
  elements.example.textContent = "";
  if (card.example) {
    elements.example.textContent = "Ví dụ: " + card.example;
  }
  elements.cardPosition.textContent = position;
  elements.cardTotal.textContent = currentCards.length;
  elements.progress.setAttribute("aria-valuemin", "1");
  elements.progress.setAttribute("aria-valuemax", currentCards.length);
  elements.progress.setAttribute("aria-valuenow", position);
  elements.progressFill.style.width = position / currentCards.length * 100 + "%";
  elements.previous.disabled = currentIndex === 0 || isTransitioning;
  elements.next.disabled = currentIndex === currentCards.length - 1 || isTransitioning;
  setFlipped(false);
  updateRatingButtons(card.id);
}

function updateUrl(replace) {
  const url = new URL(window.location.href);
  url.searchParams.set("lesson", currentLesson.id);
  if (reviewMode) {
    url.searchParams.set("mode", "review");
  } else {
    url.searchParams.delete("mode");
  }
  if (replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
}

function closeResult() {
  if (elements.resultDialog.open) {
    elements.resultDialog.close();
  }
}

function setStudyMode(useReviewMode, updateHistory) {
  if (isTransitioning) {
    return;
  }

  currentCards = allCards;
  reviewMode = false;
  currentIndex = currentProgress.currentFlashcardIndex;
  reviewedIds = [];
  if (useReviewMode) {
    const reviewCards = [];
    for (let i = 0; i < allCards.length; i++) {
      if (currentProgress.reviewFlashcardIds.includes(allCards[i].id)) {
        reviewCards.push(allCards[i]);
      }
    }
    // Khi không còn thẻ cần ôn, hiển thị lại toàn bộ bộ thẻ.
    if (reviewCards.length > 0) {
      currentCards = reviewCards;
      reviewMode = true;
      currentIndex = 0;
    }
  }
  closeResult();
  renderCard();
  if (updateHistory) {
    updateUrl(true);
  }
  elements.flipButton.focus({ preventScroll: true });
}

function selectLesson(lessonId, updateHistory, useReviewMode) {
  const lesson = getLessonById(database, lessonId);
  if (!lesson) {
    showError("Không tìm thấy bài học được yêu cầu.");
    return;
  }

  window.clearTimeout(transitionTimer);
  isTransitioning = false;
  closeResult();
  currentLesson = lesson;
  const course = getCourseById(database, lesson.courseId);
  allCards = getLessonCards(database, lesson);
  if (!course || allCards.length === 0) {
    showError("Bài học không có dữ liệu flashcard hợp lệ.");
    return;
  }

  const previousProgress = getLessonProgress(userState, lesson.id);
  const progressChanged = !previousProgress || previousProgress.status === "not_started" ||
    userState.activeCourseId !== course.id || userState.activeLessonId !== lesson.id;
  currentProgress = getOrCreateProgress(lesson.id);
  const previousCardIndex = currentProgress.currentFlashcardIndex;
  if (currentProgress.status === "not_started") {
    currentProgress.status = "in_progress";
  }
  userState.activeCourseId = course.id;
  userState.activeLessonId = lesson.id;
  elements.courseTitle.textContent = course.title;
  elements.lessonOrder.textContent = "Bài " + lesson.order;
  elements.lessonTitle.textContent = lesson.title;
  elements.continueQuiz.href = "./quiz.html?lesson=" + encodeURIComponent(lesson.id);
  document.title = lesson.title + " | OpenQuiz";
  elements.error.hidden = true;
  elements.workspace.hidden = false;
  setStudyMode(useReviewMode, false);
  if (progressChanged || previousCardIndex !== currentProgress.currentFlashcardIndex) {
    saveProgress();
  }
  if (sidebarController) {
    sidebarController.updateActiveLesson(lesson.id);
  }
  if (updateHistory) {
    updateUrl(false);
  }
}

function goToCard(index) {
  if (isTransitioning || index === currentIndex || index < 0 || index >= currentCards.length) {
    return;
  }
  currentIndex = index;
  renderCard();
  if (!reviewMode) {
    saveProgress();
  }
}

function isCardRated(cardId) {
  return currentProgress.knownFlashcardIds.includes(cardId) ||
    currentProgress.reviewFlashcardIds.includes(cardId);
}

function addActivity(type, createdAt) {
  userState.activities.push({
    id: "activity-" + type + "-" + Date.now(),
    type: type,
    lessonId: currentLesson.id,
    createdAt: createdAt,
  });
}

function updateLessonCompletion() {
  const metrics = getStudyMetrics(database, currentLesson, currentProgress);
  if (metrics.allStudied && currentProgress.status !== "completed") {
    currentProgress.status = "completed";
    currentProgress.completedAt = new Date().toISOString();
    addActivity("lesson_completed", currentProgress.completedAt);
  }
  if (metrics.allKnown && !currentProgress.masteredAt) {
    currentProgress.masteredAt = new Date().toISOString();
    addActivity("lesson_mastered", currentProgress.masteredAt);
  } else if (!metrics.allKnown) {
    currentProgress.masteredAt = null;
  }

  if (!reviewMode) {
    return metrics.allStudied;
  }
  for (let i = 0; i < currentCards.length; i++) {
    if (!reviewedIds.includes(currentCards[i].id)) {
      return false;
    }
  }
  return true;
}

function showResult(trigger) {
  const metrics = getStudyMetrics(database, currentLesson, currentProgress);
  elements.resultEyebrow.textContent = "Đã học hết bộ thẻ";
  elements.resultTitle.textContent = "Bạn đã đi hết bộ thẻ";
  if (reviewMode) {
    elements.resultEyebrow.textContent = "Hoàn tất lượt ôn";
    elements.resultTitle.textContent = "Bạn đã ôn hết thẻ trong lượt này";
  }
  elements.resultMessage.textContent = "Đã học " + metrics.studiedCount + "/" + metrics.total +
    " thẻ. Còn " + metrics.reviewCount + " thẻ cần ôn";
  if (metrics.studiedCount < metrics.total) {
    elements.resultMessage.textContent += " và " + (metrics.total - metrics.studiedCount) + " thẻ chưa học";
  }
  elements.resultMessage.textContent += ".";
  if (metrics.allKnown) {
    elements.resultEyebrow.textContent = "Đã nhớ hết bộ thẻ";
    elements.resultTitle.textContent = "Bạn đã ghi nhớ toàn bộ thẻ";
    elements.resultMessage.textContent = "Tuyệt vời! Bạn đã ghi nhớ toàn bộ thẻ trong bài học này.";
  }
  elements.resultReview.disabled = metrics.reviewCount === 0;
  elements.resultKnown.textContent = metrics.knownCount;
  elements.resultTotal.textContent = metrics.total;
  elements.resultPercentage.textContent = metrics.knownPercentage + "%";
  lastModalTrigger = trigger;
  elements.resultDialog.showModal();
  elements.resultClose.focus();
}

function removeCardRating(ids, cardId) {
  const index = ids.indexOf(cardId);
  if (index !== -1) {
    ids.splice(index, 1);
  }
}

function rateCurrentCard(rating, trigger) {
  if (isTransitioning) {
    return;
  }
  const card = currentCards[currentIndex];
  removeCardRating(currentProgress.knownFlashcardIds, card.id);
  removeCardRating(currentProgress.reviewFlashcardIds, card.id);
  if (rating === "known") {
    currentProgress.knownFlashcardIds.push(card.id);
  } else {
    currentProgress.reviewFlashcardIds.push(card.id);
  }
  if (!reviewedIds.includes(card.id)) {
    reviewedIds.push(card.id);
  }
  const completed = updateLessonCompletion();
  saveProgress();

  isTransitioning = true;
  updateRatingButtons(card.id);
  elements.previous.disabled = true;
  elements.next.disabled = true;
  let delay = 220;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    delay = 0;
  }
  // Đợi hiệu ứng đánh giá kết thúc trước khi chuyển sang thẻ tiếp theo.
  transitionTimer = window.setTimeout(function () {
    isTransitioning = false;
    if (completed) {
      renderCard();
      showResult(trigger);
      return;
    }
    if (currentIndex < currentCards.length - 1) {
      goToCard(currentIndex + 1);
      return;
    }
    for (let i = 0; i < currentCards.length; i++) {
      let rated = isCardRated(currentCards[i].id);
      if (reviewMode) {
        rated = reviewedIds.includes(currentCards[i].id);
      }
      if (!rated) {
        goToCard(i);
        return;
      }
    }
    renderCard();
  }, delay);
}

function restartLesson() {
  window.clearTimeout(transitionTimer);
  isTransitioning = false;
  currentProgress.status = "in_progress";
  currentProgress.currentFlashcardIndex = 0;
  currentProgress.knownFlashcardIds = [];
  currentProgress.reviewFlashcardIds = [];
  currentProgress.completedAt = null;
  currentProgress.masteredAt = null;
  saveProgress();
  setStudyMode(false, true);
}

function bindStudyEvents() {
  elements.flipButton.addEventListener("click", function () {
    setFlipped(!isFlipped);
  });
  elements.previous.addEventListener("click", function () {
    goToCard(currentIndex - 1);
  });
  elements.next.addEventListener("click", function () {
    goToCard(currentIndex + 1);
  });
  for (let i = 0; i < elements.ratingButtons.length; i++) {
    const button = elements.ratingButtons[i];
    button.addEventListener("click", function () {
      rateCurrentCard(button.dataset.cardRating, button);
    });
  }
  elements.resultClose.addEventListener("click", closeResult);
  elements.restart.addEventListener("click", restartLesson);
  elements.resultReview.addEventListener("click", function () {
    setStudyMode(true, true);
  });
  elements.resultDialog.addEventListener("click", function (event) {
    if (event.target === elements.resultDialog) {
      closeResult();
    }
  });
  elements.resultDialog.addEventListener("close", function () {
    if (lastModalTrigger) {
      lastModalTrigger.focus();
    }
  });
  window.addEventListener("popstate", function () {
    const params = new URLSearchParams(window.location.search);
    selectLesson(params.get("lesson"), false, params.get("mode") === "review");
  });
}

async function init() {
  elements.workspace.setAttribute("aria-busy", "true");
  try {
    database = await loadDatabase();
    const saved = readUserState(database);
    userState = saved.state;
    showStorageWarning(saved.warning);
    let lesson = getLessonById(database, getRequestedLessonId());
    if (!lesson) {
      lesson = getLessonById(database, userState.activeLessonId);
    }
    if (!lesson) {
      lesson = database.lessons[0];
    }
    if (!lesson) {
      throw new Error("Không có bài học nào trong dữ liệu.");
    }
    const params = new URLSearchParams(window.location.search);
    selectLesson(lesson.id, false, params.get("mode") === "review");
    if (!currentProgress) {
      return;
    }
    updateUrl(true);
    bindStudyEvents();
    try {
      const course = getCourseById(database, lesson.courseId);
      sidebarController = await initSidebar({
        mount: elements.sidebarMount,
        lessons: getCourseLessons(database, course),
        activeLessonId: lesson.id,
        activePage: "study",
        onLessonChange: function (lessonId) {
          selectLesson(lessonId, true, false);
        },
      });
    } catch (error) {
      showStorageWarning(error.message);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    elements.workspace.removeAttribute("aria-busy");
  }
}

init();
