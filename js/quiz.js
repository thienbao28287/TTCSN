import {
  loadDatabase, readUserState, writeUserState,
  getCourseById, getLessonById, getQuizForLesson, getCourseLessons,
  getQuizQuestions, getLatestQuizAttempt, getSelectedOptionId, saveAnswer, copyAnswers,
  getQuizDraft, setQuizDraft, removeQuizDraft, getQuizSignature,
} from "./data.js";
import { initSidebar } from "./sidebar.js";

const elements = {
  library: document.querySelector("[data-quiz-library]"),
  libraryGrid: document.querySelector("[data-quiz-library-grid]"),
  libraryCount: document.querySelector("[data-library-count]"),
  workspace: document.querySelector("[data-quiz-workspace]"),
  error: document.querySelector("[data-quiz-error]"),
  storageWarning: document.querySelector("[data-storage-warning]"),
  sidebarMount: document.querySelector("[data-sidebar-mount]"),
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
  draftNotice: document.querySelector("[data-draft-notice]"),
  startOver: document.querySelector("[data-quiz-start-over]"),
};

let database = null;
let userState = null;
let activeCourse = null;
let courseLessons = [];
let currentQuiz = null;
let currentQuestions = [];
let currentQuizSignature = "";
let currentIndex = 0;
let answers = [];
let submitted = false;
let startedAt = 0;
let sidebarController = null;
let lastModalTrigger = null;

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

function saveDraft() {
  if (!currentQuiz || submitted) {
    return false;
  }
  const changed = setQuizDraft(userState, currentQuiz.id, currentQuizSignature,
    answers, currentIndex, startedAt);
  if (changed) {
    saveProgress();
  }
  return changed;
}

function getRequestedLessonId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("lesson");
}

function updateUrl(lessonId, replace) {
  const url = new URL(window.location.href);
  if (lessonId) {
    url.searchParams.set("lesson", lessonId);
  } else {
    url.searchParams.delete("lesson");
  }
  if (replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
}

function showFatalError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.library.hidden = true;
  elements.workspace.hidden = true;
  elements.exit.hidden = true;
}

function showNotice(message) {
  elements.error.textContent = message;
  elements.error.hidden = !message;
}

function hideFeedback() {
  elements.feedback.hidden = true;
}

function showFeedback(title, text, type) {
  elements.feedback.hidden = false;
  elements.feedbackTitle.textContent = title;
  elements.feedbackText.textContent = text;
  elements.feedback.classList.toggle("oq-quiz-feedback--success", type === "success");
  elements.feedback.classList.toggle("oq-quiz-feedback--error", type === "error");
}

// Tạo một mục trong danh sách quiz, ưu tiên hiển thị bản nháp đang làm.
function getLibraryCardStatus(quiz) {
  if (!quiz) {
    return {
      label: "Chưa có bài kiểm tra",
      className: "is-unavailable",
      score: "Chưa khả dụng",
      action: "Sắp ra mắt",
    };
  }
  const signature = getQuizSignature(database, quiz);
  const draft = getQuizDraft(userState, quiz, getQuizQuestions(database, quiz), signature);
  if (draft) {
    return {
      label: "Đang làm",
      className: "is-new",
      score: draft.answers.length + "/" + quiz.questionIds.length + " câu đã trả lời",
      action: "Tiếp tục bài làm",
    };
  }
  const attempt = getLatestQuizAttempt(userState, quiz.id);
  if (!attempt) {
    return {
      label: "Chưa làm",
      className: "is-new",
      score: "Chưa có kết quả",
      action: "Bắt đầu",
    };
  }
  const status = {
    label: "Chưa đạt",
    className: "is-failed",
    score: attempt.percentage + "% gần nhất",
    action: "Làm lại",
  };
  if (attempt.passed) {
    status.label = "Đã hoàn thành";
    status.className = "is-complete";
  }
  return status;
}

function createLibraryCard(lesson) {
  const quiz = getQuizForLesson(database, lesson);
  const status = getLibraryCardStatus(quiz);
  let tagName = "article";
  if (quiz) {
    tagName = "a";
  }
  const card = document.createElement(tagName);
  card.className = "oq-quiz-lesson-card";
  card.dataset.lessonId = lesson.id;
  if (quiz) {
    card.href = "./quiz.html?lesson=" + encodeURIComponent(lesson.id);
    card.setAttribute("aria-label", status.action + " " + quiz.title);
  } else {
    card.classList.add("is-disabled");
    card.setAttribute("aria-disabled", "true");
  }
  appendLibraryCardContent(card, lesson, quiz, status);
  return card;
}

function appendLibraryCardContent(card, lesson, quiz, status) {
  const top = document.createElement("div");
  const lessonLabel = document.createElement("span");
  const statusLabel = document.createElement("span");
  const title = document.createElement("h2");
  const description = document.createElement("p");
  const meta = document.createElement("div");
  const questionCount = document.createElement("span");
  const passScore = document.createElement("span");
  const footer = document.createElement("div");
  const score = document.createElement("span");
  const action = document.createElement("span");
  top.className = "oq-quiz-lesson-card__top";
  lessonLabel.className = "oq-quiz-lesson-card__lesson";
  lessonLabel.textContent = "Bài " + lesson.order;
  statusLabel.className = "oq-quiz-lesson-card__status " + status.className;
  statusLabel.textContent = status.label;
  title.textContent = lesson.title;
  description.className = "oq-quiz-lesson-card__description";
  description.textContent = lesson.description;
  meta.className = "oq-quiz-lesson-card__meta";
  questionCount.textContent = "0 câu hỏi";
  passScore.textContent = "Chưa có điểm đạt";
  if (quiz) {
    questionCount.textContent = quiz.questionIds.length + " câu hỏi";
    passScore.textContent = "Đạt từ " + quiz.passingPercentage + "%";
  }
  footer.className = "oq-quiz-lesson-card__footer";
  score.className = "oq-quiz-lesson-card__score";
  score.textContent = status.score;
  action.className = "oq-quiz-lesson-card__action";
  action.textContent = status.action;
  top.append(lessonLabel, statusLabel);
  meta.append(questionCount, passScore);
  footer.append(score, action);
  card.append(top, title, description, meta, footer);
}

function handleLibraryClick(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const card = event.target.closest("a[data-lesson-id]");
  if (card) {
    event.preventDefault();
    openQuiz(card.dataset.lessonId, true);
  }
}

function renderLibrary() {
  elements.libraryGrid.replaceChildren();
  for (let i = 0; i < courseLessons.length; i++) {
    elements.libraryGrid.append(createLibraryCard(courseLessons[i]));
  }
  elements.libraryCount.textContent = courseLessons.length;
}

function closeResult() {
  if (elements.resultDialog.open) {
    elements.resultDialog.close();
  }
}

function showLibrary(updateHistory, message) {
  saveDraft();
  closeResult();
  currentQuiz = null;
  currentQuestions = [];
  currentIndex = 0;
  answers = [];
  submitted = false;
  elements.workspace.hidden = true;
  elements.library.hidden = false;
  elements.exit.hidden = true;
  elements.courseTitle.textContent = activeCourse.title;
  elements.lessonOrder.textContent = "Kiểm tra";
  document.title = "Kiểm tra " + activeCourse.title + " | OpenQuiz";
  showNotice(message || "");
  renderLibrary();
  if (sidebarController) {
    sidebarController.updateActiveLesson(null);
  }
  if (updateHistory) {
    updateUrl(null, false);
  }
}

function handleAnswerChange(event) {
  const input = event.target;
  if (submitted || input.type !== "radio") {
    return;
  }
  const question = currentQuestions[currentIndex];
  if (!saveAnswer(answers, question.id, input.value)) {
    return;
  }
  saveDraft();
  elements.answeredCount.textContent = answers.length;
  hideFeedback();
  const options = elements.options.querySelectorAll(".oq-quiz-option");
  for (let i = 0; i < options.length; i++) {
    const radio = options[i].querySelector("input");
    options[i].classList.toggle("is-selected", radio.checked);
  }
}

function createOption(option, question) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  const marker = document.createElement("span");
  const content = document.createElement("span");
  const selectedId = getSelectedOptionId(answers, question.id);
  label.className = "oq-quiz-option";
  input.className = "oq-sr-only";
  input.type = "radio";
  input.name = "question-" + question.id;
  input.value = option.id;
  input.checked = selectedId === option.id;
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
  label.append(input, marker, content);
  return label;
}

function renderQuestion() {
  const question = currentQuestions[currentIndex];
  const total = currentQuestions.length;
  const position = currentIndex + 1;
  elements.position.textContent = position;
  elements.total.textContent = total;
  elements.answeredCount.textContent = answers.length;
  elements.questionLabel.textContent = "Câu " + position;
  elements.questionContent.textContent = question.content;
  elements.progress.setAttribute("aria-valuemin", "1");
  elements.progress.setAttribute("aria-valuemax", total);
  elements.progress.setAttribute("aria-valuenow", position);
  elements.progressFill.style.width = position / total * 100 + "%";
  elements.previous.disabled = currentIndex === 0;
  elements.nextLabel.textContent = "Câu tiếp theo";
  if (currentIndex === total - 1) {
    if (submitted) {
      elements.nextLabel.textContent = "Xem kết quả";
    } else {
      elements.nextLabel.textContent = "Nộp bài";
    }
  }
  elements.options.replaceChildren();
  for (let i = 0; i < question.options.length; i++) {
    elements.options.append(createOption(question.options[i], question));
  }
  hideFeedback();
  if (submitted) {
    const selectedId = getSelectedOptionId(answers, question.id);
    if (selectedId === question.correctOptionId) {
      showFeedback("Chính xác", question.explanation, "success");
    } else {
      showFeedback("Chưa chính xác", question.explanation, "error");
    }
  }
}

function restoreQuiz(quiz, questions) {
  currentQuiz = quiz;
  currentQuestions = questions;
  currentQuizSignature = getQuizSignature(database, quiz);
  currentIndex = 0;
  answers = [];
  submitted = false;
  startedAt = Date.now();
  const draft = getQuizDraft(userState, quiz, questions, currentQuizSignature);
  elements.draftNotice.hidden = true;
  if (draft) {
    answers = draft.answers;
    currentIndex = draft.currentIndex;
    startedAt = draft.startedAt;
    elements.draftNotice.hidden = false;
    elements.draftNotice.textContent = "Đã khôi phục bài làm: " + answers.length + "/" +
      questions.length + " câu đã trả lời. Bạn có thể tiếp tục hoặc làm lại từ đầu.";
  }
}

function renderQuizHeader(lesson) {
  elements.courseTitle.textContent = activeCourse.title;
  elements.lessonOrder.textContent = "Bài " + lesson.order;
  elements.title.textContent = currentQuiz.title;
  elements.library.hidden = true;
  elements.workspace.hidden = false;
  elements.exit.hidden = false;
  document.title = currentQuiz.title + " | OpenQuiz";
  showNotice("");
}

function openQuiz(lessonId, updateHistory) {
  const lesson = getLessonById(database, lessonId);
  if (!lesson || lesson.courseId !== activeCourse.id) {
    showLibrary(false, "Không tìm thấy bài kiểm tra được yêu cầu. Hãy chọn một bài trong danh sách.");
    updateUrl(null, true);
    return;
  }
  const quiz = getQuizForLesson(database, lesson);
  if (!quiz) {
    showLibrary(false, "Bài học chưa có bài kiểm tra.");
    updateUrl(null, true);
    return;
  }
  const questions = getQuizQuestions(database, quiz);
  if (questions.length === 0) {
    showLibrary(false, "Bài kiểm tra chưa có câu hỏi.");
    updateUrl(null, true);
    return;
  }

  saveDraft();
  closeResult();
  restoreQuiz(quiz, questions);
  const activeLessonChanged = userState.activeLessonId !== lesson.id || userState.activeCourseId !== lesson.courseId;
  userState.activeCourseId = lesson.courseId;
  userState.activeLessonId = lesson.id;
  renderQuizHeader(lesson);
  renderQuestion();
  const draftChanged = saveDraft();
  if (activeLessonChanged && !draftChanged) {
    saveProgress();
  }
  if (updateHistory) {
    updateUrl(lesson.id, false);
  }
}

function goToQuestion(index) {
  if (index === currentIndex || index < 0 || index >= currentQuestions.length) {
    return;
  }
  currentIndex = index;
  saveDraft();
  renderQuestion();
  elements.questionContent.focus();
}

function showResult(attempt, trigger) {
  if (attempt.passed) {
    elements.resultEyebrow.textContent = "Đã vượt qua";
    elements.resultTitle.textContent = "Bạn đã hoàn thành xuất sắc";
    elements.resultMessage.textContent = "Bạn đạt yêu cầu " + currentQuiz.passingPercentage + "% của bài học này.";
  } else {
    elements.resultEyebrow.textContent = "Cần ôn tập thêm";
    elements.resultTitle.textContent = "Bạn đã hoàn thành bài kiểm tra";
    elements.resultMessage.textContent = "Bạn cần đạt tối thiểu " + currentQuiz.passingPercentage + "%. Hãy xem lại đáp án và thử lại.";
  }
  elements.resultCorrect.textContent = attempt.correctCount;
  elements.resultTotal.textContent = attempt.totalQuestions;
  elements.resultPercentage.textContent = attempt.percentage + "%";
  lastModalTrigger = trigger;
  elements.resultDialog.showModal();
  elements.resultClose.focus();
}

function findUnansweredQuestion() {
  for (let i = 0; i < currentQuestions.length; i++) {
    if (!getSelectedOptionId(answers, currentQuestions[i].id)) {
      return i;
    }
  }
  return -1;
}

function countCorrectAnswers() {
  let count = 0;
  for (let i = 0; i < currentQuestions.length; i++) {
    const question = currentQuestions[i];
    if (getSelectedOptionId(answers, question.id) === question.correctOptionId) {
      count++;
    }
  }
  return count;
}

function submitQuiz() {
  if (submitted) {
    const attempt = getLatestQuizAttempt(userState, currentQuiz.id);
    if (attempt) {
      showResult(attempt, elements.next);
    }
    return;
  }
  const unansweredIndex = findUnansweredQuestion();
  if (unansweredIndex !== -1) {
    goToQuestion(unansweredIndex);
    showFeedback("Chưa thể nộp bài", "Bạn còn " + (currentQuestions.length - answers.length) + " câu chưa trả lời.", "error");
    const input = elements.options.querySelector("input");
    if (input) {
      input.focus();
    }
    return;
  }

  const correctCount = countCorrectAnswers();
  const percentage = Math.round(correctCount / currentQuestions.length * 100);
  const completedAt = new Date().toISOString();
  const attempt = {
    id: "attempt-" + Date.now(),
    quizId: currentQuiz.id,
    answers: copyAnswers(answers),
    correctCount: correctCount,
    totalQuestions: currentQuestions.length,
    percentage: percentage,
    passed: percentage >= currentQuiz.passingPercentage,
    durationSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    completedAt: completedAt,
  };
  userState.quizAttempts.push(attempt);
  userState.activities.push({
    id: "activity-" + Date.now(),
    type: "quiz_completed",
    quizId: currentQuiz.id,
    attemptId: attempt.id,
    createdAt: completedAt,
  });
  submitted = true;
  removeQuizDraft(userState, currentQuiz.id);
  elements.draftNotice.hidden = true;
  saveProgress();
  renderQuestion();
  showResult(attempt, elements.next);
}

function restartQuiz() {
  answers = [];
  currentIndex = 0;
  submitted = false;
  startedAt = Date.now();
  elements.draftNotice.hidden = true;
  saveDraft();
  closeResult();
  renderQuestion();
  elements.questionContent.focus();
}

function renderCurrentRoute() {
  const lessonId = getRequestedLessonId();
  if (lessonId) {
    openQuiz(lessonId, false);
  } else {
    showLibrary(false, "");
  }
}

function bindEvents() {
  elements.libraryGrid.addEventListener("click", handleLibraryClick);
  elements.options.addEventListener("change", handleAnswerChange);
  elements.previous.addEventListener("click", function () {
    goToQuestion(currentIndex - 1);
  });
  elements.next.addEventListener("click", function () {
    if (currentIndex < currentQuestions.length - 1) {
      goToQuestion(currentIndex + 1);
    } else {
      submitQuiz();
    }
  });
  elements.exit.addEventListener("click", function () {
    showLibrary(true, "");
  });
  elements.resultClose.addEventListener("click", closeResult);
  elements.restart.addEventListener("click", restartQuiz);
  elements.startOver.addEventListener("click", restartQuiz);
  elements.review.addEventListener("click", function () {
    closeResult();
    currentIndex = 0;
    renderQuestion();
    elements.questionContent.focus();
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
  window.addEventListener("popstate", renderCurrentRoute);
}

async function init() {
  elements.library.setAttribute("aria-busy", "true");
  elements.workspace.setAttribute("aria-busy", "true");
  try {
    database = await loadDatabase();
    const saved = readUserState(database);
    userState = saved.state;
    showStorageWarning(saved.warning);
    activeCourse = getCourseById(database, userState.activeCourseId);
    if (!activeCourse) {
      activeCourse = database.courses[0];
    }
    if (!activeCourse) {
      throw new Error("Không có khóa học nào trong dữ liệu.");
    }
    courseLessons = getCourseLessons(database, activeCourse);
    bindEvents();
    renderCurrentRoute();
    try {
      sidebarController = await initSidebar({
        mount: elements.sidebarMount,
        lessons: courseLessons,
        activeLessonId: null,
        activePage: "quiz",
        onLessonChange: function (lessonId) {
          window.location.href = "./study.html?lesson=" + encodeURIComponent(lessonId);
        },
      });
    } catch (error) {
      showStorageWarning(error.message);
    }
  } catch (error) {
    showFatalError(error.message);
  } finally {
    elements.library.removeAttribute("aria-busy");
    elements.workspace.removeAttribute("aria-busy");
  }
}

init();
