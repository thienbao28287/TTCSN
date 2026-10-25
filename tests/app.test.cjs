const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const database = JSON.parse(fs.readFileSync(path.join(root, "mockData/mockdata.json"), "utf8"));
const key = "openquiz-user-state";
let server, browser, base;

before(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, `.${decodeURIComponent(new URL(req.url, "http://localhost").pathname)}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, content) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader("Content-Type", ({ ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
      res.end(content);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function setup(t) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  t.after(() => assert.deepEqual(errors, [], "no runtime or missing asset errors"));
  return page;
}
const state = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const goto = async (page, route, selector) => {
  await page.goto(base + route);
  await page.locator(selector).waitFor({ state: "visible" });
};
const clickRating = async (page, rating) => {
  await page.locator(`[data-card-rating="${rating}"]`).click();
  await page.waitForFunction(() => !document.querySelector('[data-card-rating="known"]').disabled);
};

test("quiz resumes after reload and exit, keeps other drafts, submits once and restarts cleanly", async (t) => {
  const page = await setup(t);
  await goto(page, "/page/quiz.html?lesson=lesson-method", "[data-quiz-workspace]");
  await page.locator('[data-option-id="option-method-01-b"]').check({ force: true });
  await page.locator("[data-question-next]").click();
  await page.reload();
  await page.locator("[data-draft-notice]").waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-question-position]").innerText(), "2");
  assert.equal(await page.locator("[data-answered-count]").innerText(), "1");
  await page.locator("[data-question-previous]").click();
  assert.equal(await page.locator("input:checked").inputValue(), "option-method-01-b");
  await page.locator("[data-quiz-exit]").click();
  assert.match(await page.locator('[data-quiz-library] [data-lesson-id="lesson-method"]').innerText(), /Tiếp tục bài làm/);
  await page.locator('[data-quiz-library] [data-lesson-id="lesson-class"]').click();
  await page.locator('[data-option-id="option-class-01-a"]').check({ force: true });
  await goto(page, "/page/quiz.html?lesson=lesson-method", "[data-quiz-workspace]");
  await page.locator("[data-question-next]").click();
  await page.locator('[data-option-id="option-method-02-a"]').check({ force: true });
  await page.locator("[data-question-next]").click();
  // Submission redirects to the unanswered question without discarding other answers.
  await page.locator("[data-question-next]").click();
  assert.match(await page.locator("[data-feedback-title]").innerText(), /Chưa thể nộp/);
  await page.locator('[data-option-id="option-method-03-c"]').check({ force: true });
  await page.locator("[data-question-next]").click();
  await page.locator("[data-result-dialog]").waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-result-percentage]").innerText(), "100%");
  let saved = await state(page);
  assert.equal(saved.quizAttempts.length, 2);
  assert.deepEqual(saved.quizDrafts.map((draft) => draft.quizId), ["quiz-class"]);
  await page.locator("[data-review-answers]").click();
  await page.locator("[data-question-next]").click();
  await page.locator("[data-question-next]").click();
  await page.locator("[data-question-next]").click();
  assert.equal((await state(page)).quizAttempts.length, 2);
  await page.locator("[data-quiz-restart]").click();
  assert.equal(await page.locator("[data-answered-count]").innerText(), "0");
  assert.equal((await state(page)).quizDrafts.length, 2);
  await page.locator('[data-option-id="option-method-01-b"]').check({ force: true });
  await page.locator("[data-quiz-start-over]").click();
  await page.reload();
  await page.locator("[data-quiz-workspace]").waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-answered-count]").innerText(), "0");
  assert.equal(await page.locator("[data-question-position]").innerText(), "1");
});

test("study and review preserve known cards and distinguish coverage from mastery", async (t) => {
  const page = await setup(t);
  await goto(page, "/page/study.html?lesson=lesson-method", "[data-study-workspace]");
  await clickRating(page, "review");
  await clickRating(page, "known");
  await clickRating(page, "review");
  await page.locator("[data-result-dialog]").waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-result-percentage]").innerText(), "33%");
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.locator("[data-result-dialog]").evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth), true);
  await page.screenshot({ path: path.join(os.tmpdir(), "openquiz-review-result-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 900 });
  let saved = await state(page);
  assert.equal(saved.lessonProgress[1].status, "completed");
  assert.equal(saved.lessonProgress[1].masteredAt, null);
  await goto(page, "/page/statistics.html", "[data-statistics-workspace]");
  const lesson = page.locator(".oq-lesson-progress__item").nth(1);
  assert.deepEqual(await lesson.locator(".oq-progress-row strong").allInnerTexts(), ["100%", "33%", "67%", "Chưa làm"]);
  assert.equal(await page.locator("[data-course-percentage]").innerText(), "50%");
  await lesson.getByRole("link", { name: "Ôn 2 thẻ chưa nhớ" }).click();
  await page.locator('[data-card-rating="known"]').waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-card-total]").innerText(), "2");
  await page.reload();
  await page.locator('[data-card-rating="known"]').waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-card-total]").innerText(), "2");
  await clickRating(page, "known");
  assert.equal(await page.locator("[data-result-dialog]").isVisible(), false);
  assert.match(await page.locator("[data-card-question]").innerText(), /Giá trị trả về/);
  await clickRating(page, "review");
  await page.locator("[data-result-dialog]").waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-result-percentage]").innerText(), "67%");
  await page.locator("[data-result-review]").click();
  assert.equal(await page.locator("[data-card-total]").innerText(), "1");
  await clickRating(page, "known");
  await page.locator("[data-result-dialog]").waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-result-percentage]").innerText(), "100%");
  assert.equal(await page.locator("[data-result-review]").isDisabled(), true);
  saved = await state(page);
  assert.equal(saved.lessonProgress[1].knownFlashcardIds.length, 3);
  assert.equal(saved.lessonProgress[1].reviewFlashcardIds.length, 0);
  assert.ok(saved.lessonProgress[1].masteredAt);
  await page.locator("[data-study-restart]").click();
  assert.equal(await page.locator("[data-card-total]").innerText(), "3");
  assert.equal((await state(page)).lessonProgress[1].knownFlashcardIds.length, 0);
  assert.deepEqual((await state(page)).lessonProgress[0].knownFlashcardIds, database.initialUserState.lessonProgress[0].knownFlashcardIds);
});

test("corrupt and unavailable storage keep pages usable and display warnings", async (t) => {
  const page = await setup(t);
  await page.addInitScript((key) => localStorage.setItem(key, "{bad"), key);
  await goto(page, "/page/quiz.html?lesson=lesson-method", "[data-quiz-workspace]");
  assert.match(await page.locator("[data-storage-warning]").innerText(), /không đúng định dạng/);
  const blocked = await page.context().newPage();
  await blocked.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    Storage.prototype.setItem = () => { throw new Error("blocked"); };
  });
  await goto(blocked, "/page/study.html?lesson=lesson-method", "[data-study-workspace]");
  await blocked.locator("[data-card-question]").waitFor({ state: "visible" });
  assert.match(await blocked.locator("[data-storage-warning]").innerText(), /trang hiện tại/);
  await clickRating(blocked, "review");
  assert.equal(await blocked.locator("[data-card-position]").innerText(), "2");
});

test("changed pages fit desktop and phone widths without missing fonts", async (t) => {
  const page = await setup(t);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, selector] of [["study", "[data-card-question]"], ["quiz", "[data-quiz-workspace]"], ["statistics", "[data-statistics-workspace]"]]) {
      await goto(page, `/page/${name}.html?lesson=lesson-method`, selector);
      await page.locator("[data-sidebar]").waitFor({ state: "attached" });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${name} at ${width}px`);
      if (name === "study" || name === "statistics") {
        await page.screenshot({ path: path.join(os.tmpdir(), `openquiz-${name}-${width}.png`), fullPage: true });
      }
    }
  }
});

test("sidebar keeps desktop preference and supports mobile open, Escape and lesson selection", async (t) => {
  const page = await setup(t);
  await goto(page, "/page/study.html?lesson=lesson-method", "[data-card-question]");
  await page.locator("[data-sidebar-toggle]").waitFor({ state: "visible" });
  await page.locator("[data-sidebar-toggle]").click();
  assert.equal(await page.locator(".oq-app-shell").getAttribute("data-sidebar-collapsed"), "true");
  await page.reload();
  await page.locator("[data-sidebar-toggle]").waitFor({ state: "visible" });
  assert.equal(await page.locator(".oq-app-shell").getAttribute("data-sidebar-collapsed"), "true");
  await page.locator("[data-sidebar-toggle]").click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator("[data-mobile-sidebar-open]").click();
  assert.equal(await page.locator(".oq-app-shell").getAttribute("data-sidebar-open"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".oq-app-shell").getAttribute("data-sidebar-open"), "false");
  await page.locator("[data-mobile-sidebar-open]").click();
  await page.locator('[data-sidebar] [data-lesson-id="lesson-class"]').click();
  assert.match(await page.locator("[data-lesson-title]").innerText(), /Lớp và đối tượng/);
  assert.equal(await page.locator(".oq-app-shell").getAttribute("data-sidebar-open"), "false");
  await page.setViewportSize({ width: 1366, height: 900 });
  assert.equal(await page.locator(".oq-app-shell").getAttribute("data-sidebar-collapsed"), "false");
});

test("changing an answer preserves radio elements, keyboard focus and skips unchanged draft writes", async (t) => {
  const page = await setup(t);
  await goto(page, "/page/quiz.html?lesson=lesson-method", "[data-quiz-workspace]");
  await page.evaluate(() => {
    window.originalOptions = Array.from(document.querySelectorAll("[data-quiz-options] input"));
    window.userStateWrites = 0;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "openquiz-user-state") window.userStateWrites++;
      return originalSetItem.call(this, key, value);
    };
  });
  const firstInput = page.locator("[data-quiz-options] input").nth(0);
  await firstInput.check({ force: true });
  await firstInput.dispatchEvent("change");
  assert.equal(await page.evaluate(() => window.userStateWrites), 1);
  await firstInput.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("[data-quiz-options] input:checked").inputValue(), "option-method-01-b");
  assert.equal(await page.evaluate(() => window.originalOptions.every((input, index) => input === document.querySelectorAll("[data-quiz-options] input")[index])), true);
  assert.equal(await page.evaluate(() => document.activeElement === window.originalOptions[1]), true);
  assert.equal(await page.evaluate(() => window.userStateWrites), 2);
  await page.locator("[data-quiz-exit]").click();
  assert.equal(await page.evaluate(() => window.userStateWrites), 2);
  await page.locator('[data-quiz-library] [data-lesson-id="lesson-method"]').click();
  assert.equal(await page.evaluate(() => window.userStateWrites), 2);
  await page.locator("[data-question-next]").click();
  assert.equal(await page.evaluate(() => window.userStateWrites), 3);
  await page.locator("[data-quiz-exit]").click();
  assert.equal(await page.evaluate(() => window.userStateWrites), 3);
});
