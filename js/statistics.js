import {
  loadDatabase, readUserState, getCourseById, getQuizForLesson, getQuizById,
  getCourseLessons, getStudyMetrics,
} from "./data.js";
import { initSidebar } from "./sidebar.js";

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
let lessonStatistics = [];
let statisticsByLessonId = {};
let attemptsById = {};
let latestAttemptsByQuizId = {};
let completedLessons = 0;

// Tính các số liệu một lần, dùng lại cho danh sách, tổng quan và nút tiếp tục.
function prepareStatistics() {
  lessonStatistics = [];
  statisticsByLessonId = {};
  attemptsById = {};
  latestAttemptsByQuizId = {};
  completedLessons = 0;
  const progressByLessonId = {};
  for (let i = 0; i < userState.lessonProgress.length; i++) {
    const progress = userState.lessonProgress[i];
    if (!progressByLessonId[progress.lessonId]) {
      progressByLessonId[progress.lessonId] = progress;
    }
  }
  for (let i = 0; i < userState.quizAttempts.length; i++) {
    const attempt = userState.quizAttempts[i];
    if (!attemptsById[attempt.id]) {
      attemptsById[attempt.id] = attempt;
    }
    latestAttemptsByQuizId[attempt.quizId] = attempt;
  }
  for (let i = 0; i < courseLessons.length; i++) {
    const lesson = courseLessons[i];
    const metrics = getStudyMetrics(database, lesson, progressByLessonId[lesson.id]);
    const quiz = getQuizForLesson(database, lesson);
    let attempt = null;
    if (quiz) {
      attempt = latestAttemptsByQuizId[quiz.id] || null;
    }
    const statistics = { lesson: lesson, metrics: metrics, quiz: quiz, attempt: attempt };
    lessonStatistics.push(statistics);
    statisticsByLessonId[lesson.id] = statistics;
    if (metrics.allKnown) {
      completedLessons++;
    }
  }
}

function createProgressBar(label, value, type, emptyLabel) {
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
  fill.className = "oq-progress-row__fill is-" + type;
  if (value === null) {
    row.classList.add("is-empty");
    track.setAttribute("aria-valuetext", emptyLabel);
    fill.style.setProperty("--oq-progress-value", "0%");
    result.textContent = emptyLabel;
  } else {
    const percentage = Math.min(100, Math.max(0, Math.round(value)));
    track.setAttribute("aria-valuenow", percentage);
    fill.style.setProperty("--oq-progress-value", percentage + "%");
    result.textContent = percentage + "%";
  }
  track.append(fill);
  row.append(name, track, result);
  return row;
}

function createLessonProgress(statistics, index) {
  const lesson = statistics.lesson;
  const metrics = statistics.metrics;
  const item = document.createElement("article");
  const heading = document.createElement("div");
  const order = document.createElement("span");
  const title = document.createElement("h3");
  const bars = document.createElement("div");
  item.className = "oq-lesson-progress__item";
  heading.className = "oq-lesson-progress__identity";
  order.textContent = index + 1;
  if (index < 9) {
    order.textContent = "0" + (index + 1);
  }
  title.textContent = lesson.title;
  heading.append(order, title);

  let reviewPercentage = 0;
  if (metrics.total > 0) {
    reviewPercentage = metrics.reviewCount / metrics.total * 100;
  }
  bars.className = "oq-lesson-progress__bars";
  bars.append(createProgressBar("Đã học", metrics.studiedPercentage, "study", ""));
  bars.append(createProgressBar("Đã nhớ", metrics.knownPercentage, "known", ""));
  bars.append(createProgressBar("Cần ôn", reviewPercentage, "review", ""));

  const quiz = statistics.quiz;
  const latestAttempt = statistics.attempt;
  let quizPercentage = null;
  let quizType = "review";
  let emptyLabel = "Chưa có quiz";
  if (quiz) {
    emptyLabel = "Chưa làm";
  }
  if (latestAttempt) {
    quizPercentage = Number(latestAttempt.percentage || 0);
    if (latestAttempt.passed) {
      quizType = "quiz";
    }
  }
  bars.append(createProgressBar("Quiz", quizPercentage, quizType, emptyLabel));

  const summary = document.createElement("p");
  summary.className = "oq-lesson-progress__summary";
  summary.textContent = "Đang học";
  if (metrics.allKnown) {
    summary.textContent = "Đã nhớ hết";
  } else if (metrics.allStudied) {
    summary.textContent = "Đã học hết · Cần ôn thêm";
  }
  bars.append(summary);
  if (metrics.reviewCount > 0) {
    const review = document.createElement("a");
    review.className = "oq-btn oq-btn--outline oq-btn--flat";
    review.href = "./study.html?lesson=" + encodeURIComponent(lesson.id) + "&mode=review";
    review.textContent = "Ôn " + metrics.reviewCount + " thẻ chưa nhớ";
    bars.append(review);
  }
  item.append(heading, bars);
  return item;
}

function renderLessonProgress() {
  elements.progressList.replaceChildren();
  for (let i = 0; i < courseLessons.length; i++) {
    elements.progressList.append(createLessonProgress(lessonStatistics[i], i));
  }
  elements.progressEmpty.hidden = courseLessons.length > 0;
}

function getContinueLesson() {
  let firstUnfinishedLesson = null;
  for (let i = 0; i < courseLessons.length; i++) {
    const statistics = lessonStatistics[i];
    const lesson = statistics.lesson;
    if (statistics.metrics.allKnown) {
      continue;
    }
    if (lesson.id === userState.activeLessonId) {
      return lesson;
    }
    if (!firstUnfinishedLesson) {
      firstUnfinishedLesson = lesson;
    }
  }
  if (firstUnfinishedLesson) {
    return firstUnfinishedLesson;
  }
  return courseLessons[0] || null;
}

function renderCourseOverview() {
  const completed = completedLessons;
  let percentage = 0;
  if (courseLessons.length > 0) {
    percentage = Math.round(completed / courseLessons.length * 100);
  }
  elements.courseProgress.style.setProperty("--oq-course-angle", percentage * 3.6 + "deg");
  elements.courseProgress.setAttribute("aria-valuenow", percentage);
  elements.coursePercentage.textContent = percentage + "%";
  elements.courseCompleted.textContent = completed;
  elements.courseRemaining.textContent = courseLessons.length - completed;
  const lesson = getContinueLesson();
  elements.continueLearning.hidden = !lesson;
  if (lesson) {
    elements.continueLearning.href = "./study.html?lesson=" + encodeURIComponent(lesson.id);
  }
}

function getActivityLesson(activity) {
  let lessonId = activity.lessonId;
  if (!lessonId && activity.quizId) {
    const quiz = getQuizById(database, activity.quizId);
    if (quiz) {
      lessonId = quiz.lessonId;
    }
  }
  const statistics = statisticsByLessonId[lessonId];
  if (statistics && statistics.lesson && statistics.lesson.id === lessonId) {
    return statistics.lesson;
  }
  return null;
}

function getActivityAttempt(activity) {
  if (activity.attemptId) {
    const attempt = attemptsById[activity.attemptId];
    if (attempt && attempt.id === activity.attemptId) {
      return attempt;
    }
    return null;
  }
  if (activity.quizId) {
    return latestAttemptsByQuizId[activity.quizId] || null;
  }
  return null;
}

function getActivityCopy(activity) {
  if (activity.type === "lesson_completed") {
    return { title: "Đã học hết bộ thẻ", tone: "success" };
  }
  if (activity.type === "lesson_mastered") {
    return { title: "Đã nhớ hết bộ thẻ", tone: "success" };
  }
  if (activity.type === "lesson_started") {
    return { title: "Bắt đầu học thẻ", tone: "info" };
  }
  if (activity.type === "quiz_completed") {
    const attempt = getActivityAttempt(activity);
    let title = "Hoàn thành quiz";
    let tone = "review";
    if (attempt) {
      const percentage = Math.round(Number(attempt.percentage || 0));
      title = "Hoàn thành quiz với " + percentage + "%";
      if (attempt.passed) {
        title = "Đạt quiz với " + percentage + "%";
        tone = "quiz";
      }
    }
    return { title: title, tone: tone };
  }
  return { title: "Cập nhật hoạt động học tập", tone: "info" };
}

function createActivityItem(activity, lesson) {
  const copy = getActivityCopy(activity);
  const item = document.createElement("li");
  const marker = document.createElement("span");
  const content = document.createElement("a");
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const time = document.createElement("time");
  item.className = "oq-activity-list__item";
  marker.className = "oq-activity-list__marker is-" + copy.tone;
  marker.setAttribute("aria-hidden", "true");
  content.className = "oq-activity-list__content";
  title.textContent = copy.title;
  detail.textContent = "Bài: " + lesson.title;
  content.href = "./study.html?lesson=" + encodeURIComponent(lesson.id);
  if (activity.type === "quiz_completed") {
    content.href = "./quiz.html?lesson=" + encodeURIComponent(lesson.id);
  }

  const date = new Date(activity.createdAt);
  time.dateTime = activity.createdAt || "";
  time.textContent = "—";
  time.title = "Không có thời gian";
  if (!Number.isNaN(date.getTime())) {
    time.textContent = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
    time.title = date.toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" });
  }
  content.append(title, detail);
  item.append(marker, content, time);
  return item;
}

function renderActivities() {
  const activities = [];
  for (let i = 0; i < userState.activities.length; i++) {
    const activity = userState.activities[i];
    const lesson = getActivityLesson(activity);
    if (lesson) {
      activities.push({
        activity: activity,
        lesson: lesson,
        time: new Date(activity.createdAt).getTime() || 0,
      });
    }
  }
  activities.sort(function (first, second) {
    return second.time - first.time;
  });
  elements.activityList.replaceChildren();
  for (let i = 0; i < activities.length && i < 5; i++) {
    const item = activities[i];
    elements.activityList.append(createActivityItem(item.activity, item.lesson));
  }
  elements.activityEmpty.hidden = activities.length > 0;
}

function renderDashboard() {
  elements.courseTitle.textContent = activeCourse.title;
  elements.courseHeading.textContent = activeCourse.title;
  renderLessonProgress();
  renderCourseOverview();
  renderActivities();
  document.title = "Thống kê " + activeCourse.title + " | OpenQuiz";
  elements.workspace.hidden = false;
  window.requestAnimationFrame(function () {
    elements.workspace.classList.add("is-ready");
  });
}

async function init() {
  try {
    database = await loadDatabase();
    const saved = readUserState(database);
    userState = saved.state;
    if (saved.warning) {
      elements.storageWarning.textContent = saved.warning;
      elements.storageWarning.hidden = false;
    }
    activeCourse = getCourseById(database, userState.activeCourseId);
    if (!activeCourse) {
      activeCourse = database.courses[0];
    }
    if (!activeCourse) {
      throw new Error("Không có khóa học nào để thống kê.");
    }
    courseLessons = getCourseLessons(database, activeCourse);
    prepareStatistics();
    await initSidebar({
      mount: elements.sidebarMount,
      lessons: courseLessons,
      activeLessonId: null,
      activePage: "statistics",
      onLessonChange: function (lessonId) {
        window.location.href = "./study.html?lesson=" + encodeURIComponent(lessonId);
      },
    });
    renderDashboard();
  } catch (error) {
    elements.error.textContent = error.message;
    elements.error.hidden = false;
    elements.workspace.hidden = true;
  }
}

init();
