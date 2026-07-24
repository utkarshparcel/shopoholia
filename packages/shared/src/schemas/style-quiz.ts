import { z } from "zod";

export const StyleQuizQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      tags: z.array(z.string()).optional(),
    }),
  ),
});

export const StyleQuizQuestionsResponseSchema = z.object({
  questions: z.array(StyleQuizQuestionSchema),
});

export const StyleQuizSubmitBodySchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      optionId: z.string(),
    }),
  ),
});

export const StyleQuizSubmitResponseSchema = z.object({
  saved: z.literal(true),
  profileTags: z.array(z.string()),
});

export type StyleQuizQuestion = z.infer<typeof StyleQuizQuestionSchema>;
export type StyleQuizQuestionsResponse = z.infer<typeof StyleQuizQuestionsResponseSchema>;
export type StyleQuizSubmitBody = z.infer<typeof StyleQuizSubmitBodySchema>;
export type StyleQuizSubmitResponse = z.infer<typeof StyleQuizSubmitResponseSchema>;

export const STYLE_QUIZ_QUESTIONS: StyleQuizQuestion[] = [
  {
    id: "vibe",
    question: "What's your everyday vibe?",
    options: [
      { id: "casual", label: "Casual & comfy", tags: ["casual", "streetwear", "tees"] },
      { id: "chic", label: "Clean & chic", tags: ["minimal", "formal", "dresses"] },
      { id: "bold", label: "Bold & expressive", tags: ["statement", "prints", "oversized"] },
      { id: "classic", label: "Timeless & classic", tags: ["classic", "ethnic", "kurtas"] },
    ],
  },
  {
    id: "palette",
    question: "Which color palette do you reach for?",
    options: [
      { id: "neutrals", label: "Neutrals — black, white, beige", tags: ["neutral"] },
      { id: "earth", label: "Earth tones — brown, olive, rust", tags: ["earth"] },
      { id: "pastel", label: "Pastels — soft pink, mint, lavender", tags: ["pastel"] },
      { id: "vivid", label: "Vivid — red, cobalt, emerald", tags: ["vivid"] },
    ],
  },
  {
    id: "budget",
    question: "What's your typical spend per item?",
    options: [
      { id: "u1000", label: "Under ₹1,000", tags: ["budget"] },
      { id: "1to3k", label: "₹1,000 — ₹3,000", tags: ["mid"] },
      { id: "3to7k", label: "₹3,000 — ₹7,000", tags: ["premium"] },
      { id: "p7k", label: "₹7,000+", tags: ["luxury"] },
    ],
  },
  {
    id: "occasion",
    question: "What do you shop for most?",
    options: [
      { id: "work", label: "Work / office", tags: ["formal", "office"] },
      { id: "casual", label: "Everyday casual", tags: ["casual", "daily"] },
      { id: "party", label: "Parties & nights out", tags: ["party", "cocktail"] },
      { id: "festive", label: "Festive & ethnic", tags: ["ethnic", "festive"] },
    ],
  },
  {
    id: "fit",
    question: "Your go-to fit preference?",
    options: [
      { id: "slim", label: "Slim & tailored", tags: ["slim", "fitted"] },
      { id: "regular", label: "Regular & relaxed", tags: ["regular"] },
      { id: "oversized", label: "Oversized & baggy", tags: ["oversized"] },
      { id: "cropped", label: "Cropped & cropped", tags: ["cropped"] },
    ],
  },
];
