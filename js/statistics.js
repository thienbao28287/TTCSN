import { initSidebar } from "./sidebar.js";

const MOCK_DATA_URL = new URL("../mockData/mockdata.json", import.meta.url);
const USER_STATE_KEY = "openquiz-user-state";

const elements = {
  sidebarMount: document.querySelector("[data-sidebar-mount]"),
  storageWarning: document.querySelector("[data-storage-warning]"),
  error: document.querySelector("[data-statistics-error]"),
  workspace: document.querySelector("[data-statistics-workspace]"),
  courseTitle: document.querySelector("[data-course-title]"),
  courseHeading: document.querySelector("[data-course-heading]"),
  progressList: document.querySelector("[data-lesson-progress-list]"),
  progressEmpty: document.querySelector("[data-progress-empty]"),
  courseProgress: document.querySelector("[data-course-progress]"),
  coursePercentage: document.querySelector("[data-course-percentage]"),
  courseCompleted: document.querySelector("[data-course-completed]"),
  courseRemaining: document.querySelector("[data-course-remaining]"),
  continueLearning: document.querySelector("[data-continue-learning]"),
  activityList: document.querySelector("[data-activity-list]"),
  activityEmpty: document.querySelector("[data-activity-empty]"),
};

let database = null;
let userState = null;
let activeCourse = null;
let courseLessons = [];
let stateWarning = "";

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
    if (!isValidState(parsed)) {
      stateWarning = "Tiến độ đã lưu không đúng định dạng. Dashboard đang sử dụng dữ liệu mặc định.";
      return clone(seed);
    }

    return parsed;
  } catch {
    stateWarning = "Không thể đọc tiến độ đã lưu. Dashboard đang sử dụng dữ liệu mặc định.";
    return clone(seed);
  }
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
    !Array.isArray(data.quizzes) ||
    !Array.isArray(data.questions) ||
    !data.initialUserState
  ) {
    throw new Error("Mock data không đúng cấu trúc yêu cầu.");
  }

  return data;
}

function resolveCourse() {
  activeCourse =
    database.courses.find((course) => course.id === userState.activeCourseId) ||
    database.courses[0];

  if (!activeCourse) {
    throw new Error("Không có khóa học nào để thống kê.");
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

function findProgress(lessonId) {
  return userState.lessonProgress.find((progress) => progress.lessonId === lessonId) || null;
}

function findQuiz(lesson) {
  return lesson.quizId
    ? database.quizzes.find((quiz) => quiz.id === lesson.quizId) || null
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

function getLessonStudyPercentage(lesson) {
  const cards = lesson.flashcardIds.filter((cardId) =>
    database.flashcards.some((card) => card.id === cardId),
  );
  const progress = findProgress(lesson.id);

  if (progress?.status === "completed") {
    return 100;
  }

  if (!progress || cards.length === 0) {
    return 0;
  }

  const evaluatedIds = new Set([
    ...(Array.isArray(progress.knownFlashcardIds) ? progress.knownFlashcardIds : []),
    ...(Array.isArray(progress.reviewFlashcardIds) ? progress.reviewFlashcardIds : []),
  ]);
  const evaluatedCount = cards.filter((cardId) => evaluatedIds.has(cardId)).length;
  return Math.round((evaluatedCount / cards.length) * 100);
}

function getCourseMetrics() {
  const completedLessons = courseLessons.filter(
    (lesson) => findProgress(lesson.id)?.status === "completed",
  );

  return {
    completedLessons: completedLessons.length,
    totalLessons: courseLessons.length,
  };
}

function createProgressBar(label, value, type, emptyLabel = "") {
  const row = document.createElement("div");
  const name = document.createElement("span");
  const track = document.createElement("div");
  const fill = document.createElement("span");
  const result = document.createElement("strong");

  row.className = "oq-progress-row";
  name.className = "oq-progress-row__label";
  name.textContent = label;
  track.className = "oq-progress-row__track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", label);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");

  if (value === null) {
    row.classList.add("is-empty");
    track.setAttribute("aria-valuetext", emptyLabel);
    fill.className = `oq-progress-row__fill is-${type}`;
    fill.style.setProperty("--oq-progress-value", "0%");
    result.textContent = emptyLabel;
  } else {
    const normalizedValue = Math.min(100, Math.max(0, Math.round(value)));
    track.setAttribute("aria-valuenow", String(normalizedValue));
    fill.className = `oq-progress-row__fill is-${type}`;
    fill.style.setProperty("--oq-progress-value", `${normalizedValue}%`);
    result.textContent = `${normalizedValue}%`;
  }

  track.append(fill);
  row.append(name, track, result);
  return row;
}

function renderLessonProgress() {
  const fragment = document.createDocumentFragment();

  courseLessons.forEach((lesson, index) => {
    const item = document.createElement("article");
    const heading = document.createElement("div");
    const order = document.createElement("span");
    const title = document.createElement("h3");
    const bars = document.createElement("div");
    const quiz = findQuiz(lesson);
    const latestAttempt = quiz ? getLatestAttempt(quiz.id) : null;

    item.className = "oq-lesson-progress__item";
    heading.className = "oq-lesson-progress__identity";
    order.textContent = String(index + 1).padStart(2, "0");
    title.textContent = lesson.title;
    heading.append(order, title);

    bars.className = "oq-lesson-progress__bars";
    bars.append(
      createProgressBar("Học thẻ", getLessonStudyPercentage(lesson), "study"),
      createProgressBar(
        "Quiz",
        latestAttempt ? Number(latestAttempt.percentage || 0) : null,
        latestAttempt?.passed ? "quiz" : "review",
        quiz ? "Chưa làm" : "Chưa có quiz",
      ),
    );

    item.append(heading, bars);
    fragment.append(item);
  });

  elements.progressList.replaceChildren(fragment);
  elements.progressEmpty.hidden = courseLessons.length > 0;
}

function getContinueLesson() {
  const requested = courseLessons.find((lesson) => lesson.id === userState.activeLessonId);
  if (requested) {
    return requested;
  }

  return (
    courseLessons.find((lesson) => findProgress(lesson.id)?.status !== "completed") ||
    courseLessons[0] ||
    null
  );
}

function renderCourseOverview(metrics) {
  const percentage = metrics.totalLessons
    ? Math.round((metrics.completedLessons / metrics.totalLessons) * 100)
    : 0;
  const continueLesson = getContinueLesson();

  elements.courseProgress.style.setProperty("--oq-course-angle", `${percentage * 3.6}deg`);
  elements.courseProgress.setAttribute("aria-valuenow", String(percentage));
  elements.coursePercentage.textContent = `${percentage}%`;
  elements.courseCompleted.textContent = String(metrics.completedLessons);
  elements.courseRemaining.textContent = String(
    Math.max(metrics.totalLessons - metrics.completedLessons, 0),
  );

  if (continueLesson) {
    elements.continueLearning.href = `./study.html?lesson=${encodeURIComponent(continueLesson.id)}`;
    elements.continueLearning.hidden = false;
  } else {
    elements.continueLearning.hidden = true;
  }
}

function findLessonForActivity(activity) {
  if (activity.lessonId) {
    return courseLessons.find((lesson) => lesson.id === activity.lessonId) || null;
  }

  if (activity.quizId) {
    const quiz = database.quizzes.find((candidate) => candidate.id === activity.quizId);
    return quiz ? courseLessons.find((lesson) => lesson.id === quiz.lessonId) || null : null;
  }

  return null;
}

function findAttemptForActivity(activity) {
  if (activity.attemptId) {
    return userState.quizAttempts.find((attempt) => attempt.id === activity.attemptId) || null;
  }

  return activity.quizId ? getLatestAttempt(activity.quizId) : null;
}

function formatActivityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatActivityDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không có thời gian";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getActivityCopy(activity, lesson) {
  if (activity.type === "lesson_completed") {
    return { title: "Hoàn thành học thẻ", tone: "success" };
  }

  if (activity.type === "quiz_completed") {
    const attempt = findAttemptForActivity(activity);
    const percentage = attempt ? Math.round(Number(attempt.percentage || 0)) : null;
    return {
      title: percentage === null ? "Hoàn thành quiz" : `${attempt.passed ? "Đạt" : "Hoàn thành"} quiz với ${percentage}%`,
      tone: attempt?.passed ? "quiz" : "review",
    };
  }

  if (activity.type === "lesson_started") {
    return { title: "Bắt đầu học thẻ", tone: "info" };
  }

  return { title: "Cập nhật hoạt động học tập", tone: "info" };
}

function createActivityItem(activity) {
  const lesson = findLessonForActivity(activity);
  const copy = getActivityCopy(activity, lesson);
  const item = document.createElement("li");
  const marker = document.createElement("span");
  const content = document.createElement(lesson ? "a" : "div");
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const time = document.createElement("time");

  item.className = "oq-activity-list__item";
  marker.className = `oq-activity-list__marker is-${copy.tone}`;
  marker.setAttribute("aria-hidden", "true");
  content.className = "oq-activity-list__content";
  title.textContent = copy.title;
  detail.textContent = lesson ? `Bài: ${lesson.title}` : "Hoạt động trong khóa học";

  if (lesson && activity.type === "quiz_completed") {
    content.href = `./quiz.html?lesson=${encodeURIComponent(lesson.id)}`;
  } else if (lesson) {
    content.href = `./study.html?lesson=${encodeURIComponent(lesson.id)}`;
  }

  time.dateTime = activity.createdAt || "";
  time.textContent = formatActivityTime(activity.createdAt);
  time.title = formatActivityDateTime(activity.createdAt);

  content.append(title, detail);
  item.append(marker, content, time);
  return item;
}

function renderActivities() {
  const courseLessonIds = new Set(courseLessons.map((lesson) => lesson.id));
  const courseQuizIds = new Set(courseLessons.map((lesson) => lesson.quizId).filter(Boolean));
  const activities = userState.activities
    .filter(
      (activity) =>
        courseLessonIds.has(activity.lessonId) || courseQuizIds.has(activity.quizId),
    )
    .sort((first, second) => {
      const firstTime = new Date(first.createdAt).getTime() || 0;
      const secondTime = new Date(second.createdAt).getTime() || 0;
      return secondTime - firstTime;
    })
    .slice(0, 5);

  elements.activityList.replaceChildren(...activities.map(createActivityItem));
  elements.activityEmpty.hidden = activities.length > 0;
}

function renderDashboard() {
  const metrics = getCourseMetrics();
  elements.courseTitle.textContent = activeCourse.title;
  elements.courseHeading.textContent = activeCourse.title;
  renderLessonProgress();
  renderCourseOverview(metrics);
  renderActivities();
  document.title = `Thống kê ${activeCourse.title} | OpenQuiz`;
  elements.workspace.hidden = false;
  window.requestAnimationFrame(() => elements.workspace.classList.add("is-ready"));
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.workspace.hidden = true;
}

async function init() {
  try {
    database = await loadDatabase();
    userState = readUserState(database.initialUserState);
    resolveCourse();

    if (stateWarning) {
      elements.storageWarning.textContent = stateWarning;
      elements.storageWarning.hidden = false;
    }

    await initSidebar({
      mount: elements.sidebarMount,
      lessons: courseLessons,
      activeLessonId: null,
      activePage: "statistics",
      onLessonChange: (lessonId) => {
        window.location.href = `./study.html?lesson=${encodeURIComponent(lessonId)}`;
      },
    });

    renderDashboard();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Không thể tải dữ liệu thống kê.");
  }
}

init();
