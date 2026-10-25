const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const database = JSON.parse(fs.readFileSync(path.join(root, "mockData/mockdata.json"), "utf8"));
const source = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const copy = (value) => JSON.parse(JSON.stringify(value));

test("migrate old completion flags without confusing studied with known", async () => {
  const { normalizeUserState, getStudyMetrics } = await modulePromise;
  const seed = copy(database.initialUserState);
  seed.lessonProgress[0].knownFlashcardIds = ["card-class-01", "card-class-01", "removed"];
  seed.lessonProgress[0].reviewFlashcardIds = ["card-class-02", "card-class-01", "removed"];
  const state = normalizeUserState(seed, database);
  const progress = state.lessonProgress[0];
  assert.deepEqual(progress.knownFlashcardIds, ["card-class-01"]);
  assert.deepEqual(progress.reviewFlashcardIds, ["card-class-02"]);
  assert.equal(progress.status, "completed");
  assert.equal(progress.masteredAt, null);
  assert.equal(getStudyMetrics(database, database.lessons[0], progress).knownPercentage, 50);
  progress.reviewFlashcardIds = [];
  const migrated = normalizeUserState(state, database);
  assert.equal(migrated.lessonProgress[0].status, "in_progress");
  assert.equal(migrated.lessonProgress[0].completedAt, null);
});

test("drafts retain independent answers, question position, and start time", async () => {
  const { normalizeUserState, setQuizDraft, getQuizDraft, removeQuizDraft, quizSignature } = await modulePromise;
  const state = normalizeUserState(database.initialUserState, database);
  for (const quiz of database.quizzes) {
    const questions = quiz.questionIds.map((id) => database.questions.find((question) => question.id === id));
    const startedAt = Date.now() - 12000;
    const answers = [{ questionId: questions[0].id, selectedOptionId: questions[0].correctOptionId }];
    setQuizDraft(state, quiz.id, quizSignature(quiz, questions), answers, questions.length - 1, startedAt);
    const restored = getQuizDraft(state, quiz, questions);
    assert.equal(restored.answers[0].selectedOptionId, questions[0].correctOptionId);
    assert.equal(restored.currentIndex, questions.length - 1);
    assert.equal(restored.startedAt, startedAt);
    const changedQuestions = copy(questions);
    changedQuestions[0].content += " updated";
    assert.equal(getQuizDraft(state, quiz, changedQuestions), null);
  }
  assert.equal(state.quizDrafts.length, 2);
  removeQuizDraft(state, database.quizzes[0].id);
  assert.equal(state.quizDrafts.length, 1);
  assert.equal(state.quizDrafts[0].quizId, database.quizzes[1].id);
});

test("malformed draft entries cannot restore invalid answers or positions", async () => {
  const { normalizeUserState, setQuizDraft, getQuizDraft, quizSignature } = await modulePromise;
  const state = normalizeUserState(database.initialUserState, database);
  const quiz = database.quizzes[0];
  const questions = quiz.questionIds.map((id) => database.questions.find((question) => question.id === id));
  setQuizDraft(state, quiz.id, quizSignature(quiz, questions), [], 0, Date.now());
  Object.assign(state.quizDrafts[0], { answers: [null, {}, { questionId: questions[0].id, selectedOptionId: "removed" }], currentIndex: -99, startedAt: "bad" });
  const restored = getQuizDraft(state, quiz, questions);
  assert.equal(restored.answers.length, 0);
  assert.equal(restored.currentIndex, 0);
  assert.ok(Number.isFinite(restored.startedAt));
});

test("invalid JSON recovers and can save; blocked storage reports persistence failure", async (t) => {
  const { readUserState, writeUserState } = await modulePromise;
  t.after(() => { delete global.localStorage; });
  let stored = "{broken";
  global.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  const saved = readUserState(database);
  assert.match(saved.warning, /không đúng định dạng/);
  assert.equal(writeUserState(saved.state), "");
  assert.equal(JSON.parse(stored).schemaVersion, 2);
  global.localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  const blocked = readUserState(database);
  assert.match(blocked.warning, /Không thể đọc/);
  assert.match(writeUserState(blocked.state), /Không thể lưu/);
  assert.equal(blocked.state.lessonProgress.length, 2);
  global.localStorage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  const full = readUserState(database);
  assert.equal(full.warning, "");
  assert.match(writeUserState(full.state), /Không thể lưu/);
});

test("ID lookups preserve requested order and avoid scanning all cards on repeated reads", async () => {
  const { getLessonCards, getQuizQuestions, getLessonById } = await modulePromise;
  const fixture = copy(database);
  let idReads = 0;
  for (let i = 0; i < 1000; i++) {
    const id = "extra-card-" + i;
    const card = { front: "Extra card" };
    Object.defineProperty(card, "id", { enumerable: true, get() { idReads++; return id; } });
    fixture.flashcards.push(card);
  }
  const lesson = copy(fixture.lessons[0]);
  lesson.flashcardIds = ["extra-card-999", "missing", "card-class-01"];
  assert.deepEqual(getLessonCards(fixture, lesson).map((card) => card.id), ["extra-card-999", "card-class-01"]);
  idReads = 0;
  for (let i = 0; i < 100; i++) getLessonCards(fixture, lesson);
  assert.ok(idReads < 1000, "repeated lookups should not rescan the entire card collection");
  assert.equal(getLessonById(fixture, "toString"), null);
  const quiz = copy(fixture.quizzes[1]);
  quiz.questionIds = [quiz.questionIds[2], "missing", quiz.questionIds[0]];
  assert.deepEqual(getQuizQuestions(fixture, quiz).map((question) => question.id), ["question-method-03", "question-method-01"]);
  const otherDatabase = copy(database);
  otherDatabase.lessons[0].title = "Changed course data";
  assert.equal(getLessonById(otherDatabase, "lesson-class").title, "Changed course data");
});

test("draft signatures are reused and identical drafts report no change", async () => {
  const { normalizeUserState, getQuizSignature, getQuizQuestions, getQuizDraft, setQuizDraft } = await modulePromise;
  const fixture = copy(database);
  const quiz = fixture.quizzes[1];
  const question = fixture.questions.find((item) => item.id === quiz.questionIds[0]);
  const content = question.content;
  let contentReads = 0;
  Object.defineProperty(question, "content", { enumerable: true, get() { contentReads++; return content; } });
  const signature = getQuizSignature(fixture, quiz);
  const firstReadCount = contentReads;
  const questions = getQuizQuestions(fixture, quiz);
  const state = normalizeUserState(fixture.initialUserState, fixture);
  const answers = [{ questionId: question.id, selectedOptionId: question.correctOptionId }];
  const startedAt = Date.now();
  assert.equal(setQuizDraft(state, quiz.id, signature, answers, 0, startedAt), true);
  for (let i = 0; i < 10; i++) {
    assert.equal(getQuizSignature(fixture, quiz), signature);
    assert.equal(setQuizDraft(state, quiz.id, signature, answers, 0, startedAt), false);
    assert.equal(getQuizDraft(state, quiz, questions, signature).answers.length, 1);
  }
  assert.equal(contentReads, firstReadCount, "saving drafts should not serialize questions again");
  assert.equal(setQuizDraft(state, quiz.id, signature, answers, 1, startedAt), true);
  answers[0].selectedOptionId = question.options[0].id;
  assert.notEqual(state.quizDrafts[0].answers[0].selectedOptionId, answers[0].selectedOptionId);
});
