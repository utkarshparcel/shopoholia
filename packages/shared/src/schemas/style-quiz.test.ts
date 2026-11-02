import { describe, expect, it } from "vitest";
import { STYLE_QUIZ_QUESTIONS, StyleQuizQuestionSchema } from "./style-quiz.js";

describe("STYLE_QUIZ_QUESTIONS", () => {
  it("parses, with unique option ids per question", () => {
    for (const question of STYLE_QUIZ_QUESTIONS) {
      StyleQuizQuestionSchema.parse(question);
      const ids = question.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("never repeats a word on both sides of an '&' label", () => {
    for (const question of STYLE_QUIZ_QUESTIONS) {
      for (const { label } of question.options) {
        const [left, right] = label.split(" & ");
        if (right === undefined) continue;
        expect(right.toLowerCase(), label).not.toBe(left!.toLowerCase());
      }
    }
  });

  it("keeps the cropped fit option's id and tags", () => {
    const fit = STYLE_QUIZ_QUESTIONS.find((q) => q.id === "fit")!;
    expect(fit.options.find((o) => o.id === "cropped")).toEqual({
      id: "cropped",
      label: "Cropped & boxy",
      tags: ["cropped"],
    });
  });
});
