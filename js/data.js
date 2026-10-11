(function exposeOpenQuizData(windowObject) {
  "use strict";

  const data = {
    system: {
      name: "OpenQuiz DS",
      version: "1.0.0",
      defaultTheme: "light",
      breakpoints: [375, 768, 1024, 1280, 1440]
    },
    courses: [
      { title: "Everyday English", topic: "Speaking and vocabulary", progress: 72, status: "Continue", accent: "#a7f3d0" },
      { title: "Grammar Lab", topic: "Tenses and sentence form", progress: 48, status: "Practice", accent: "#bfdbfe" },
      { title: "Listening Room", topic: "Short conversations", progress: 86, status: "Review", accent: "#e9d5ff" },
      { title: "Word Builder", topic: "High-frequency vocabulary", progress: 31, status: "Continue", accent: "#fde68a" }
    ],
    principles: [
      "Readable by default",
      "Semantic color",
      "Four-point rhythm",
      "Keyboard complete",
      "Motion with purpose",
      "Theme aware"
    ]
  };

  windowObject.OPENQUIZ_DATA = Object.freeze(data);
})(window);
