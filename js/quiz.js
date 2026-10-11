import { initSidebar } from "./sidebar.js";

const MOCK_DATA_URL = new URL("../mockData/mockdata.json", import.meta.url);
const USER_STATE_KEY = "openquiz-user-state";
const THEME_KEY = "oq-theme";

const elements = {
  library: document.querySelector("[data-quiz-library]"),
  libraryGrid: document.querySelector("[data-quiz-library-grid]"),
  libraryCount: document.querySelector("[data-library-count]"),
  workspace: document.querySelector("[data-quiz-workspace]"),
  error: document.querySelector("[data-quiz-error]"),
  storageWarning: document.querySelector("[data-storage-warning]"),
  sidebarMount: document.querySelector("[data-sidebar-mount]"),
  themeToggle: document.querySelector("[data-theme-toggle]"),
  courseTitle: document.querySelector("[data-course-title]"),
  lessonOrder: document.querySelector("[data-lesson-order]"),
  title: document.querySelector("[data-quiz-title]"),
  position: document.querySelector("[data-question-position]"),
  total: document.querySelector("[data-question-total]"),
  answeredCount: document.querySelector("[data-answered-count]"),
  progress: document.querySelector("[data-quiz-progress]"),
  progressFill: document.querySelector("[data-quiz-progress-fill]"),
  questionContent: document.querySelector("[data-question-content]"),
  questionLabel: document.querySelector("[data-question-label]"),
  options: document.querySelector("[data-quiz-options]"),
  feedback: document.querySelector("[data-quiz-feedback]"),
  feedbackTitle: document.querySelector("[data-feedback-title]"),
  feedbackText: document.querySelector("[data-feedback-text]"),
  previous: document.querySelector("[data-question-previous]"),
  next: document.querySelector("[data-question-next]"),
  nextLabel: document.querySelector("[data-next-label]"),
  exit: document.querySelector("[data-quiz-exit]"),
  resultDialog: document.querySelector("[data-result-dialog]"),
  resultClose: document.querySelector("[data-result-close]"),
  resultEyebrow: document.querySelector("[data-result-eyebrow]"),
  resultTitle: document.querySelector("[data-result-title]"),
  resultMessage: document.querySelector("[data-result-message]"),
  resultCorrect: document.querySelector("[data-result-correct]"),
  resultTotal: document.querySelector("[data-result-total]"),
  resultPercentage: document.querySelector("[data-result-percentage]"),
  restart: document.querySelector("[data-quiz-restart]"),
  review: document.querySelector("[data-review-answers]"),
};

let database = null;
let userState = null;
let activeCourse = null;
let courseLessons = [];
let currentLesson = null;
let currentQuiz = null;
let currentQuestions = [];
let currentIndex = 0;
let answers = new Map();
let submitted = false;
let startedAt = Date.now();
let sidebarController = null;
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
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" || saved === "light" ? saved : "light";
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
    !Array.isArray(data.quizzes) ||
    !Array.isArray(data.questions) ||
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

function findQuiz(lesson) {
  return lesson?.quizId
    ? database.quizzes.find((quiz) => quiz.id === lesson.quizId)
    : null;
}

function getLatestAttempt(quizId) {
  for (let index = userState.quizAttempts.length - 1; index >= 0; index -= 1) {
    if (userState.quizAttempts[index].quizId === quizId) {
      return userState.quizAttempts[index];
    }
  }

  return null;
}

function resolveActiveCourse() {
  activeCourse =
    database.courses.find((course) => course.id === userState.activeCourseId) ||
    database.courses[0];

  if (!activeCourse) {
    throw new Error("Không có khóa học nào trong mock data.");
  }

  const lessonOrder = new Map(activeCourse.lessonIds.map((lessonId, index) => [lessonId, index]));
  courseLessons = database.lessons
    .filter((lesson) => lesson.courseId === activeCourse.id)
    .sort(
      (first, second) =>
        (lessonOrder.get(first.id) ?? first.order) -
        (lessonOrder.get(second.id) ?? second.order),
    );
}

function setFatalError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.library.hidden = true;
  elements.workspace.hidden = true;
  elements.exit.hidden = true;
}

function setNotice(message = "") {
  elements.error.textContent = message;
  elements.error.hidden = !message;
}

function updateUrl(lessonId, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (lessonId) {
    url.searchParams.set("lesson", lessonId);
  } else {
    url.searchParams.delete("lesson");
  }
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

function setFeedback({ title = "", text = "", type = "info", hidden = false } = {}) {
  elements.feedback.hidden = hidden;
  elements.feedback.classList.toggle("oq-quiz-feedback--success", type === "success");
  elements.feedback.classList.toggle("oq-quiz-feedback--error", type === "error");
  elements.feedbackTitle.textContent = title;
  elements.feedbackText.textContent = text;
}

function createLibraryCard(lesson) {
  const quiz = findQuiz(lesson);
  const latestAttempt = quiz ? getLatestAttempt(quiz.id) : null;
  const card = document.createElement(quiz ? "a" : "article");
  const top = document.createElement("div");
  const identity = document.createElement("div");
  const icon = document.createElement("span");
  const lessonLabel = document.createElement("span");
  const status = document.createElement("span");
  const title = document.createElement("h2");
  const description = document.createElement("p");
  const meta = document.createElement("div");
  const questionCount = document.createElement("span");
  const passScore = document.createElement("span");
  const footer = document.createElement("div");
  const score = document.createElement("span");
  const action = document.createElement("span");
  const arrow = document.createElement("span");

  card.className = "oq-quiz-lesson-card";
  card.dataset.lessonId = lesson.id;
  top.className = "oq-quiz-lesson-card__top";
  identity.className = "oq-quiz-lesson-card__identity";
  icon.className = "oq-quiz-lesson-card__icon";
  icon.innerHTML = '<span class="oq-icon oq-icon--quiz" aria-hidden="true"></span>';
  lessonLabel.className = "oq-quiz-lesson-card__lesson";
  lessonLabel.textContent = `Bài ${lesson.order}`;
  status.className = "oq-quiz-lesson-card__status";
  title.textContent = lesson.title;
  description.className = "oq-quiz-lesson-card__description";
  description.textContent = lesson.description;
  meta.className = "oq-quiz-lesson-card__meta";
  footer.className = "oq-quiz-lesson-card__footer";
  score.className = "oq-quiz-lesson-card__score";
  action.className = "oq-quiz-lesson-card__action";
  arrow.className = "oq-icon oq-icon--arrow";
  arrow.setAttribute("aria-hidden", "true");

  identity.append(icon, lessonLabel);
  top.append(identity, status);

  if (!quiz) {
    card.classList.add("is-disabled");
    card.setAttribute("aria-disabled", "true");
    status.textContent = "Chưa có bài kiểm tra";
    status.classList.add("is-unavailable");
    questionCount.textContent = "0 câu hỏi";
    passScore.textContent = "Chưa có điểm đạt";
    score.textContent = "Chưa khả dụng";
    action.textContent = "Sắp ra mắt";
  } else {
    card.href = `./quiz.html?lesson=${encodeURIComponent(lesson.id)}`;
    card.setAttribute("aria-label", `${latestAttempt ? "Làm lại" : "Bắt đầu"} ${quiz.title}`);
    questionCount.textContent = `${quiz.questionIds.length} câu hỏi`;
    passScore.textContent = `Đạt từ ${quiz.passingPercentage}%`;

    if (!latestAttempt) {
      status.textContent = "Chưa làm";
      status.classList.add("is-new");
      score.textContent = "Chưa có kết quả";
      action.textContent = "Bắt đầu";
    } else if (latestAttempt.passed) {
      status.textContent = "Đã hoàn thành";
      status.classList.add("is-complete");
      score.textContent = `${latestAttempt.percentage}% gần nhất`;
      action.textContent = "Làm lại";
    } else {
      status.textContent = "Chưa đạt";
      status.classList.add("is-failed");
      score.textContent = `${latestAttempt.percentage}% gần nhất`;
      action.textContent = "Làm lại";
    }

    action.append(arrow);
    card.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) {
        return;
      }

      event.preventDefault();
      showQuizDetail(lesson.id, { updateHistory: true });
    });
  }

  meta.append(questionCount, passScore);
  footer.append(score, action);
  card.append(top, title, description, meta, footer);
  return card;
}

function renderQuizLibraryCards() {
  const fragment = document.createDocumentFragment();
  courseLessons.forEach((lesson) => fragment.append(createLibraryCard(lesson)));
  elements.libraryGrid.replaceChildren(fragment);
  elements.libraryCount.textContent = String(courseLessons.length);
}

function closeResult() {
  if (typeof elements.resultDialog.close === "function" && elements.resultDialog.open) {
    elements.resultDialog.close();
  } else {
    elements.resultDialog.removeAttribute("open");
  }
}

function showQuizLibrary({ updateHistory = false, replace = false, notice = "" } = {}) {
  currentLesson = null;
  currentQuiz = null;
  currentQuestions = [];
  currentIndex = 0;
  answers = new Map();
  submitted = false;
  closeResult();

  elements.workspace.hidden = true;
  elements.library.hidden = false;
  elements.exit.hidden = true;
  elements.courseTitle.textContent = activeCourse.title;
  elements.lessonOrder.textContent = "Kiểm tra";
  document.title = `Kiểm tra ${activeCourse.title} | OpenQuiz`;
  setNotice(notice);
  renderQuizLibraryCards();
  sidebarController?.updateActiveLesson(null);

  if (updateHistory) {
    updateUrl(null, { replace });
  }
}

function createOption(option, question) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  const marker = document.createElement("span");
  const content = document.createElement("span");
  const selectedOptionId = answers.get(question.id);

  label.className = "oq-quiz-option";
  input.className = "oq-sr-only";
  input.type = "radio";
  input.name = `question-${question.id}`;
  input.value = option.id;
  input.checked = selectedOptionId === option.id;
  input.disabled = submitted;
  input.dataset.optionId = option.id;

  marker.className = "oq-quiz-option__marker";
  marker.textContent = option.label;
  marker.setAttribute("aria-hidden", "true");
  content.className = "oq-quiz-option__content";
  content.textContent = option.content;

  if (input.checked) {
    label.classList.add("is-selected");
  }

  if (submitted && option.id === question.correctOptionId) {
    label.classList.add("is-correct");
  }

  if (submitted && input.checked && option.id !== question.correctOptionId) {
    label.classList.add("is-incorrect");
  }

  input.addEventListener("change", () => {
    answers.set(question.id, option.id);
    setFeedback({ hidden: true });
    renderQuestion();
  });

  label.append(input, marker, content);
  return label;
}

function renderQuestion() {
  const question = currentQuestions[currentIndex];
  const total = currentQuestions.length;
  const isLastQuestion = currentIndex === total - 1;

  elements.position.textContent = String(currentIndex + 1);
  elements.total.textContent = String(total);
  elements.answeredCount.textContent = String(answers.size);
  elements.questionLabel.textContent = `Câu ${currentIndex + 1}`;
  elements.questionContent.textContent = question.content;
  elements.progress.setAttribute("aria-valuemax", String(total));
  elements.progress.setAttribute("aria-valuenow", String(currentIndex + 1));
  elements.progressFill.style.width = `${((currentIndex + 1) / total) * 100}%`;
  elements.previous.disabled = currentIndex === 0;
  elements.nextLabel.textContent = isLastQuestion
    ? submitted
      ? "Xem kết quả"
      : "Nộp bài"
    : "Câu tiếp theo";

  const fragment = document.createDocumentFragment();
  question.options.forEach((option) => fragment.append(createOption(option, question)));
  elements.options.replaceChildren(fragment);

  if (submitted) {
    const selectedOptionId = answers.get(question.id);
    const isCorrect = selectedOptionId === question.correctOptionId;
    setFeedback({
      title: isCorrect ? "Chính xác" : "Chưa chính xác",
      text: question.explanation,
      type: isCorrect ? "success" : "error",
    });
  } else {
    setFeedback({ hidden: true });
  }
}

function prepareQuizDetail(lesson) {
  currentLesson = lesson;
  currentQuiz = findQuiz(lesson);

  if (!currentQuiz) {
    throw new Error("Bài học chưa có bài kiểm tra.");
  }

  currentQuestions = currentQuiz.questionIds
    .map((questionId) => database.questions.find((question) => question.id === questionId))
    .filter(Boolean);

  if (currentQuestions.length === 0) {
    throw new Error("Bài kiểm tra chưa có câu hỏi.");
  }

  currentIndex = 0;
  answers = new Map();
  submitted = false;
  startedAt = Date.now();
  userState.activeCourseId = lesson.courseId;
  userState.activeLessonId = lesson.id;

  elements.courseTitle.textContent = activeCourse.title;
  elements.lessonOrder.textContent = `Bài ${lesson.order}`;
  elements.title.textContent = currentQuiz.title;
  elements.progress.setAttribute("aria-valuemin", "1");
  elements.library.hidden = true;
  elements.workspace.hidden = false;
  elements.exit.hidden = false;
  document.title = `${currentQuiz.title} | OpenQuiz`;
  setNotice();
  renderQuestion();
  saveUserState();
}

function showQuizDetail(lessonId, { updateHistory = false, replace = false } = {}) {
  const lesson = findLesson(lessonId);
  if (!lesson || lesson.courseId !== activeCourse.id) {
    showQuizLibrary({
      updateHistory: true,
      replace: true,
      notice: "Không tìm thấy bài kiểm tra được yêu cầu. Hãy chọn một bài trong danh sách.",
    });
    return;
  }

  try {
    prepareQuizDetail(lesson);
    if (updateHistory) {
      updateUrl(lesson.id, { replace });
    }
  } catch (error) {
    showQuizLibrary({
      updateHistory: true,
      replace: true,
      notice: error instanceof Error ? error.message : "Không thể mở bài kiểm tra.",
    });
  }
}

function goToQuestion(index) {
  if (index < 0 || index >= currentQuestions.length) {
    return;
  }

  currentIndex = index;
  renderQuestion();
  window.requestAnimationFrame(() => elements.questionContent.focus());
}

function showResult(correctCount, percentage, trigger) {
  const passed = percentage >= currentQuiz.passingPercentage;
  elements.resultEyebrow.textContent = passed ? "Đã vượt qua" : "Cần ôn tập thêm";
  elements.resultTitle.textContent = passed
    ? "Bạn đã hoàn thành xuất sắc"
    : "Bạn đã hoàn thành bài kiểm tra";
  elements.resultMessage.textContent = passed
    ? `Bạn đạt yêu cầu ${currentQuiz.passingPercentage}% của bài học này.`
    : `Bạn cần đạt tối thiểu ${currentQuiz.passingPercentage}%. Hãy xem lại đáp án và thử lại.`;
  elements.resultCorrect.textContent = String(correctCount);
  elements.resultTotal.textContent = String(currentQuestions.length);
  elements.resultPercentage.textContent = `${percentage}%`;
  lastModalTrigger = trigger instanceof HTMLElement ? trigger : elements.next;

  if (typeof elements.resultDialog.showModal === "function") {
    elements.resultDialog.showModal();
    window.requestAnimationFrame(() => elements.resultClose.focus());
  } else {
    elements.resultDialog.setAttribute("open", "");
  }
}

function submitQuiz(trigger) {
  if (submitted) {
    const latestAttempt = getLatestAttempt(currentQuiz.id);
    if (latestAttempt) {
      showResult(latestAttempt.correctCount, latestAttempt.percentage, trigger);
    }
    return;
  }

  const unansweredIndex = currentQuestions.findIndex((question) => !answers.has(question.id));
  if (unansweredIndex >= 0) {
    currentIndex = unansweredIndex;
    renderQuestion();
    setFeedback({
      title: "Chưa thể nộp bài",
      text: `Bạn còn ${currentQuestions.length - answers.size} câu chưa trả lời.`,
      type: "error",
    });
    elements.options.querySelector("input")?.focus();
    return;
  }

  const correctCount = currentQuestions.filter(
    (question) => answers.get(question.id) === question.correctOptionId,
  ).length;
  const percentage = Math.round((correctCount / currentQuestions.length) * 100);
  const completedAt = new Date().toISOString();
  const attemptId = `attempt-${Date.now()}`;
  const attempt = {
    id: attemptId,
    quizId: currentQuiz.id,
    answers: currentQuestions.map((question) => ({
      questionId: question.id,
      selectedOptionId: answers.get(question.id),
    })),
    correctCount,
    totalQuestions: currentQuestions.length,
    percentage,
    passed: percentage >= currentQuiz.passingPercentage,
    durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    completedAt,
  };

  userState.quizAttempts.push(attempt);
  userState.activities.push({
    id: `activity-${Date.now()}`,
    type: "quiz_completed",
    quizId: currentQuiz.id,
    attemptId,
    createdAt: completedAt,
  });
  submitted = true;
  saveUserState();
  renderQuestion();
  showResult(correctCount, percentage, trigger);
}

function restartQuiz() {
  answers = new Map();
  currentIndex = 0;
  submitted = false;
  startedAt = Date.now();
  closeResult();
  renderQuestion();
  window.requestAnimationFrame(() => elements.options.querySelector("input")?.focus());
}

function reviewAnswers() {
  closeResult();
  currentIndex = 0;
  renderQuestion();
  window.requestAnimationFrame(() => elements.previous.focus());
}

function renderCurrentRoute() {
  const lessonId = getRequestedLessonId();
  if (!lessonId) {
    showQuizLibrary();
    return;
  }

  const lesson = findLesson(lessonId);
  if (!lesson || lesson.courseId !== activeCourse.id) {
    showQuizLibrary({
      updateHistory: true,
      replace: true,
      notice: "Không tìm thấy bài kiểm tra được yêu cầu. Hãy chọn một bài trong danh sách.",
    });
    return;
  }

  showQuizDetail(lessonId);
}

function bindEvents() {
  elements.previous.addEventListener("click", () => goToQuestion(currentIndex - 1));
  elements.next.addEventListener("click", () => {
    if (currentIndex < currentQuestions.length - 1) {
      goToQuestion(currentIndex + 1);
      return;
    }

    submitQuiz(elements.next);
  });
  elements.exit.addEventListener("click", () => showQuizLibrary({ updateHistory: true }));
  elements.resultClose.addEventListener("click", closeResult);
  elements.restart.addEventListener("click", restartQuiz);
  elements.review.addEventListener("click", reviewAnswers);
  elements.resultDialog.addEventListener("click", (event) => {
    if (event.target === elements.resultDialog) {
      closeResult();
    }
  });
  elements.resultDialog.addEventListener("close", () => lastModalTrigger?.focus());
  window.addEventListener("popstate", renderCurrentRoute);
}

async function init() {
  initTheme();
  elements.library.setAttribute("aria-busy", "true");
  elements.workspace.setAttribute("aria-busy", "true");

  try {
    database = await loadDatabase();
    userState = readUserState(database.initialUserState);
    elements.storageWarning.hidden = canPersistState;
    resolveActiveCourse();
    bindEvents();
    renderCurrentRoute();

    try {
      sidebarController = await initSidebar({
        mount: elements.sidebarMount,
        lessons: courseLessons,
        activeLessonId: null,
        activePage: "quiz",
        onLessonChange: (lessonId) => {
          window.location.href = `./study.html?lesson=${encodeURIComponent(lessonId)}`;
        },
      });
    } catch (sidebarError) {
      elements.storageWarning.textContent =
        sidebarError instanceof Error
          ? sidebarError.message
          : "Không thể tải thanh điều hướng.";
      elements.storageWarning.hidden = false;
    }
  } catch (error) {
    setFatalError(error instanceof Error ? error.message : "Không thể khởi tạo trang Quiz.");
  } finally {
    elements.library.removeAttribute("aria-busy");
    elements.workspace.removeAttribute("aria-busy");
  }
}

init();
