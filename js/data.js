const MOCK_DATA_URL = "../mockData/mockdata.json";
const USER_STATE_KEY = "openquiz-user-state";

// Đọc dữ liệu dùng chung cho các trang học, kiểm tra và thống kê.
export async function loadDatabase() {
  const response = await fetch(MOCK_DATA_URL);
  if (!response.ok) {
    throw new Error("Không thể tải dữ liệu: " + response.status);
  }

  const database = await response.json();
  if (!Array.isArray(database.courses) ||
      !Array.isArray(database.lessons) ||
      !Array.isArray(database.flashcards) ||
      !Array.isArray(database.quizzes) ||
      !Array.isArray(database.questions) ||
      !isObject(database.initialUserState)) {
    throw new Error("Dữ liệu không đúng cấu trúc yêu cầu.");
  }
  prepareDatabaseIndex(database);
  return database;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function copyData(value) {
  return JSON.parse(JSON.stringify(value));
}

// Dữ liệu JSON không thay đổi trong một lần mở trang: lập bảng tra cứu một lần.
let indexedDatabase = null;
let databaseIndex = null;

function createIdIndex(items) {
  const index = {};
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!getIndexedItem(index, item.id)) {
      index[item.id] = item;
    }
  }
  return index;
}

function getIndexedItem(index, id) {
  const item = index[id];
  if (item && item.id === id) {
    return item;
  }
  return null;
}

function createIdFlags(ids) {
  const flags = {};
  for (let i = 0; i < ids.length; i++) {
    flags[ids[i]] = true;
  }
  return flags;
}

function prepareDatabaseIndex(database) {
  if (indexedDatabase === database) {
    return databaseIndex;
  }
  databaseIndex = {
    courses: createIdIndex(database.courses),
    lessons: createIdIndex(database.lessons),
    quizzes: createIdIndex(database.quizzes),
    flashcards: createIdIndex(database.flashcards),
    questions: createIdIndex(database.questions),
    quizSignatures: {},
  };
  indexedDatabase = database;
  return databaseIndex;
}

export function getCourseById(database, courseId) {
  const index = prepareDatabaseIndex(database);
  return getIndexedItem(index.courses, courseId);
}

export function getLessonById(database, lessonId) {
  const index = prepareDatabaseIndex(database);
  return getIndexedItem(index.lessons, lessonId);
}

export function getQuizById(database, quizId) {
  const index = prepareDatabaseIndex(database);
  return getIndexedItem(index.quizzes, quizId);
}

export function getQuizForLesson(database, lesson) {
  if (!lesson) {
    return null;
  }
  return getQuizById(database, lesson.quizId);
}

export function getLessonProgress(state, lessonId) {
  for (let i = 0; i < state.lessonProgress.length; i++) {
    if (state.lessonProgress[i].lessonId === lessonId) {
      return state.lessonProgress[i];
    }
  }
  return null;
}

export function getCourseLessons(database, course) {
  const lessons = [];
  const lessonOrder = {};
  for (let i = 0; i < course.lessonIds.length; i++) {
    lessonOrder[course.lessonIds[i]] = i;
  }
  for (let i = 0; i < database.lessons.length; i++) {
    const lesson = database.lessons[i];
    if (lesson.courseId === course.id) {
      lessons.push(lesson);
      if (!Number.isInteger(lessonOrder[lesson.id])) {
        lessonOrder[lesson.id] = lesson.order;
      }
    }
  }
  lessons.sort(function (first, second) {
    return lessonOrder[first.id] - lessonOrder[second.id];
  });
  return lessons;
}

export function getLessonCards(database, lesson) {
  const index = prepareDatabaseIndex(database);
  const cards = [];
  for (let i = 0; i < lesson.flashcardIds.length; i++) {
    const card = getIndexedItem(index.flashcards, lesson.flashcardIds[i]);
    if (card) {
      cards.push(card);
    }
  }
  return cards;
}

export function getQuizQuestions(database, quiz) {
  const index = prepareDatabaseIndex(database);
  const questions = [];
  for (let i = 0; i < quiz.questionIds.length; i++) {
    const question = getIndexedItem(index.questions, quiz.questionIds[i]);
    if (question) {
      questions.push(question);
    }
  }
  return questions;
}

export function getLatestQuizAttempt(state, quizId) {
  for (let i = state.quizAttempts.length - 1; i >= 0; i--) {
    if (state.quizAttempts[i].quizId === quizId) {
      return state.quizAttempts[i];
    }
  }
  return null;
}

// "Đã học" là đã tự đánh giá; "đã nhớ" chỉ tính các thẻ đánh dấu đã nhớ.
export function getStudyMetrics(database, lesson, progress) {
  const cards = getLessonCards(database, lesson);
  let knownIds = [];
  let reviewIds = [];
  if (progress) {
    knownIds = progress.knownFlashcardIds;
    reviewIds = progress.reviewFlashcardIds;
  }

  const knownFlags = createIdFlags(knownIds);
  const reviewFlags = createIdFlags(reviewIds);
  let knownCount = 0;
  let reviewCount = 0;
  for (let i = 0; i < cards.length; i++) {
    if (knownFlags[cards[i].id] === true) {
      knownCount++;
    } else if (reviewFlags[cards[i].id] === true) {
      reviewCount++;
    }
  }

  const studiedCount = knownCount + reviewCount;
  let studiedPercentage = 0;
  let knownPercentage = 0;
  if (cards.length > 0) {
    studiedPercentage = Math.round(studiedCount / cards.length * 100);
    knownPercentage = Math.round(knownCount / cards.length * 100);
  }

  return {
    total: cards.length,
    knownCount: knownCount,
    reviewCount: reviewCount,
    studiedCount: studiedCount,
    studiedPercentage: studiedPercentage,
    knownPercentage: knownPercentage,
    allStudied: cards.length > 0 && studiedCount === cards.length,
    allKnown: cards.length > 0 && knownCount === cards.length,
  };
}

function getValidCardIds(ids, cards) {
  const result = [];
  if (!Array.isArray(ids)) {
    return result;
  }
  const validCards = createIdIndex(cards);
  const addedIds = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (getIndexedItem(validCards, id) && addedIds[id] !== true) {
      result.push(id);
      addedIds[id] = true;
    }
  }
  return result;
}

function normalizeProgress(progress, database, lesson) {
  const cards = getLessonCards(database, lesson);
  progress.knownFlashcardIds = getValidCardIds(progress.knownFlashcardIds, cards);
  const reviewIds = getValidCardIds(progress.reviewFlashcardIds, cards);
  progress.reviewFlashcardIds = [];
  for (let i = 0; i < reviewIds.length; i++) {
    if (!progress.knownFlashcardIds.includes(reviewIds[i])) {
      progress.reviewFlashcardIds.push(reviewIds[i]);
    }
  }

  const metrics = getStudyMetrics(database, lesson, progress);
  progress.status = "not_started";
  if (metrics.allStudied) {
    progress.status = "completed";
  } else if (metrics.studiedCount > 0) {
    progress.status = "in_progress";
  }

  if (!metrics.allKnown) {
    progress.masteredAt = null;
  } else if (!progress.masteredAt) {
    progress.masteredAt = progress.completedAt || null;
  }
  if (!metrics.allStudied) {
    progress.completedAt = null;
  }

  if (!Number.isInteger(progress.currentFlashcardIndex)) {
    progress.currentFlashcardIndex = 0;
  }
  if (progress.currentFlashcardIndex >= cards.length) {
    progress.currentFlashcardIndex = cards.length - 1;
  }
  if (progress.currentFlashcardIndex < 0) {
    progress.currentFlashcardIndex = 0;
  }
}

// Giữ tiến độ cũ và loại bỏ các mục hỏng hoặc thẻ đã bị xóa.
export function normalizeUserState(value, database) {
  if (!isObject(value) || !Array.isArray(value.lessonProgress) ||
      !Array.isArray(value.quizAttempts) || !Array.isArray(value.activities)) {
    throw new Error("Tiến độ đã lưu không đúng định dạng.");
  }

  const state = copyData(value);
  state.schemaVersion = 2;
  const savedProgress = state.lessonProgress;
  state.lessonProgress = [];
  for (let i = 0; i < savedProgress.length; i++) {
    const progress = savedProgress[i];
    if (!isObject(progress)) {
      continue;
    }
    const lesson = getLessonById(database, progress.lessonId);
    if (lesson) {
      normalizeProgress(progress, database, lesson);
      state.lessonProgress.push(progress);
    }
  }

  const savedAttempts = state.quizAttempts;
  state.quizAttempts = [];
  for (let i = 0; i < savedAttempts.length; i++) {
    if (isObject(savedAttempts[i])) {
      state.quizAttempts.push(savedAttempts[i]);
    }
  }
  const savedActivities = state.activities;
  state.activities = [];
  for (let i = 0; i < savedActivities.length; i++) {
    if (isObject(savedActivities[i])) {
      state.activities.push(savedActivities[i]);
    }
  }
  const savedDrafts = state.quizDrafts;
  state.quizDrafts = [];
  if (Array.isArray(savedDrafts)) {
    for (let i = 0; i < savedDrafts.length; i++) {
      const draft = savedDrafts[i];
      if (isObject(draft) && typeof draft.quizId === "string" && Array.isArray(draft.answers)) {
        state.quizDrafts.push(draft);
      }
    }
  }
  return state;
}

export function readUserState(database) {
  let state = database.initialUserState;
  let warning = "";
  let stored = null;
  try {
    stored = localStorage.getItem(USER_STATE_KEY);
  } catch (error) {
    warning = "Không thể đọc bộ nhớ cục bộ. Tiến độ và bài làm chỉ được giữ trong trang hiện tại.";
  }

  try {
    if (stored !== null) {
      state = JSON.parse(stored);
    }
    state = normalizeUserState(state, database);
  } catch (error) {
    warning = "Tiến độ đã lưu không đúng định dạng. Đang sử dụng dữ liệu mặc định.";
    state = normalizeUserState(database.initialUserState, database);
  }
  return { state: state, warning: warning };
}

// Trả thông báo lỗi để trang hiển thị khi không thể lưu.
export function writeUserState(state) {
  try {
    localStorage.setItem(USER_STATE_KEY, JSON.stringify(state));
    return "";
  } catch (error) {
    return "Không thể lưu vào bộ nhớ cục bộ. Thay đổi mới chỉ được giữ trong trang hiện tại.";
  }
}

export function getSelectedOptionId(answers, questionId) {
  for (let i = 0; i < answers.length; i++) {
    if (answers[i].questionId === questionId) {
      return answers[i].selectedOptionId;
    }
  }
  return null;
}

export function copyAnswers(answers) {
  const result = [];
  for (let i = 0; i < answers.length; i++) {
    result.push({
      questionId: answers[i].questionId,
      selectedOptionId: answers[i].selectedOptionId,
    });
  }
  return result;
}

export function saveAnswer(answers, questionId, optionId) {
  for (let i = 0; i < answers.length; i++) {
    if (answers[i].questionId === questionId) {
      if (answers[i].selectedOptionId === optionId) {
        return false;
      }
      answers[i].selectedOptionId = optionId;
      return true;
    }
  }
  answers.push({ questionId: questionId, selectedOptionId: optionId });
  return true;
}

// Nội dung quiz thay đổi thì bản nháp cũ không còn phù hợp.
export function quizSignature(quiz, questions) {
  return JSON.stringify([quiz.passingPercentage, questions]);
}

function isValidDraftAnswer(answer, questionsById) {
  if (!isObject(answer)) {
    return false;
  }
  const question = getIndexedItem(questionsById, answer.questionId);
  if (!question) {
    return false;
  }
  for (let i = 0; i < question.options.length; i++) {
    if (question.options[i].id === answer.selectedOptionId) {
      return true;
    }
  }
  return false;
}

export function getQuizSignature(database, quiz) {
  const index = prepareDatabaseIndex(database);
  if (typeof index.quizSignatures[quiz.id] !== "string") {
    index.quizSignatures[quiz.id] = quizSignature(quiz, getQuizQuestions(database, quiz));
  }
  return index.quizSignatures[quiz.id];
}

export function getQuizDraft(state, quiz, questions, signature) {
  let draft = null;
  for (let i = 0; i < state.quizDrafts.length; i++) {
    if (state.quizDrafts[i].quizId === quiz.id) {
      draft = state.quizDrafts[i];
      break;
    }
  }
  if (signature === undefined) {
    signature = quizSignature(quiz, questions);
  }
  if (!draft || draft.signature !== signature) {
    return null;
  }

  const questionsById = createIdIndex(questions);
  const answers = [];
  for (let i = 0; i < draft.answers.length; i++) {
    const answer = draft.answers[i];
    if (isValidDraftAnswer(answer, questionsById)) {
      saveAnswer(answers, answer.questionId, answer.selectedOptionId);
    }
  }

  let currentIndex = draft.currentIndex;
  if (!Number.isInteger(currentIndex) || currentIndex < 0) {
    currentIndex = 0;
  }
  if (currentIndex >= questions.length) {
    currentIndex = Math.max(0, questions.length - 1);
  }
  let startedAt = draft.startedAt;
  if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > Date.now()) {
    startedAt = Date.now();
  }
  return { answers: answers, currentIndex: currentIndex, startedAt: startedAt };
}

export function removeQuizDraft(state, quizId) {
  for (let i = state.quizDrafts.length - 1; i >= 0; i--) {
    if (state.quizDrafts[i].quizId === quizId) {
      state.quizDrafts.splice(i, 1);
    }
  }
}

function answersAreEqual(first, second) {
  if (first.length !== second.length) {
    return false;
  }
  for (let i = 0; i < first.length; i++) {
    if (first[i].questionId !== second[i].questionId ||
        first[i].selectedOptionId !== second[i].selectedOptionId) {
      return false;
    }
  }
  return true;
}

export function setQuizDraft(state, quizId, signature, answers, currentIndex, startedAt) {
  let draft = null;
  for (let i = 0; i < state.quizDrafts.length; i++) {
    if (state.quizDrafts[i].quizId === quizId) {
      draft = state.quizDrafts[i];
      break;
    }
  }
  if (draft && draft.signature === signature && draft.currentIndex === currentIndex &&
      draft.startedAt === startedAt && answersAreEqual(draft.answers, answers)) {
    return false;
  }
  if (!draft) {
    draft = { quizId: quizId };
    state.quizDrafts.push(draft);
  }
  draft.signature = signature;
  draft.currentIndex = currentIndex;
  draft.startedAt = startedAt;
  draft.answers = copyAnswers(answers);
  return true;
}
