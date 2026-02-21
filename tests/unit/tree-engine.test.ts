import { describe, it, expect } from "vitest";
import {
  getNextQuestion,
  validateQuestionFlow,
  estimateRemainingQuestions,
} from "@/lib/conversation/tree-engine";
import type { QuestionFlow } from "@/types/conversation";

const validFlow: QuestionFlow = {
  rootQuestionId: "q1",
  questions: [
    {
      id: "q1",
      text: "Does your company process invoices?",
      answers: [
        { id: "a1-yes", text: "Yes", nextQuestionId: "q2" },
        { id: "a1-no", text: "No", classification: "NA" },
      ],
    },
    {
      id: "q2",
      text: "Do you use 3-way matching?",
      answers: [
        { id: "a2-yes", text: "Yes, exactly as SAP describes", classification: "FIT" },
        { id: "a2-partial", text: "Partially, with some differences", nextQuestionId: "q3" },
        { id: "a2-no", text: "No, we have a different process", classification: "GAP" },
      ],
    },
    {
      id: "q3",
      text: "Can the differences be handled by SAP configuration?",
      answers: [
        { id: "a3-yes", text: "Yes", classification: "CONFIGURE" },
        { id: "a3-no", text: "No", classification: "GAP" },
      ],
    },
  ],
};

describe("getNextQuestion (Phase 22)", () => {
  it("returns the next question when answer has nextQuestionId", () => {
    const result = getNextQuestion(validFlow, "q1", "a1-yes", "step-1");
    expect(result.nextQuestion).toBeDefined();
    expect(result.nextQuestion?.id).toBe("q2");
    expect(result.classification).toBeUndefined();
  });

  it("returns classification for terminal answer", () => {
    const result = getNextQuestion(validFlow, "q1", "a1-no", "step-1");
    expect(result.classification).toBe("NA");
    expect(result.nextQuestion).toBeUndefined();
  });

  it("returns classification at deeper level", () => {
    const result = getNextQuestion(validFlow, "q2", "a2-yes", "step-1");
    expect(result.classification).toBe("FIT");
  });

  it("returns GAP classification", () => {
    const result = getNextQuestion(validFlow, "q2", "a2-no", "step-1");
    expect(result.classification).toBe("GAP");
  });

  it("returns CONFIGURE classification", () => {
    const result = getNextQuestion(validFlow, "q3", "a3-yes", "step-1");
    expect(result.classification).toBe("CONFIGURE");
  });

  it("returns empty result for unknown question", () => {
    const result = getNextQuestion(validFlow, "q99", "a1-yes", "step-1");
    expect(result.nextQuestion).toBeUndefined();
    expect(result.classification).toBeUndefined();
  });

  it("returns empty result for unknown answer", () => {
    const result = getNextQuestion(validFlow, "q1", "a99", "step-1");
    expect(result.nextQuestion).toBeUndefined();
    expect(result.classification).toBeUndefined();
  });
});

describe("validateQuestionFlow (Phase 22)", () => {
  it("validates a valid flow", () => {
    const result = validateQuestionFlow(validFlow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing root question", () => {
    const flow: QuestionFlow = {
      rootQuestionId: "missing",
      questions: [
        {
          id: "q1",
          text: "Question 1",
          answers: [{ id: "a1", text: "Answer", classification: "FIT" }],
        },
      ],
    };
    const result = validateQuestionFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Root question"))).toBe(true);
  });

  it("detects dangling references", () => {
    const flow: QuestionFlow = {
      rootQuestionId: "q1",
      questions: [
        {
          id: "q1",
          text: "Question 1",
          answers: [{ id: "a1", text: "Answer", nextQuestionId: "q99" }],
        },
      ],
    };
    const result = validateQuestionFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-existent"))).toBe(true);
  });

  it("detects leaf answers without classification", () => {
    const flow: QuestionFlow = {
      rootQuestionId: "q1",
      questions: [
        {
          id: "q1",
          text: "Question 1",
          answers: [{ id: "a1", text: "Answer" }],
        },
      ],
    };
    const result = validateQuestionFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("leaf"))).toBe(true);
  });

  it("detects cycles", () => {
    const flow: QuestionFlow = {
      rootQuestionId: "q1",
      questions: [
        {
          id: "q1",
          text: "Question 1",
          answers: [{ id: "a1", text: "Answer", nextQuestionId: "q2" }],
        },
        {
          id: "q2",
          text: "Question 2",
          answers: [{ id: "a2", text: "Answer", nextQuestionId: "q1" }],
        },
      ],
    };
    const result = validateQuestionFlow(flow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("accepts single-question flow with terminal answers", () => {
    const flow: QuestionFlow = {
      rootQuestionId: "q1",
      questions: [
        {
          id: "q1",
          text: "Is this relevant?",
          answers: [
            { id: "a1", text: "Yes", classification: "FIT" },
            { id: "a2", text: "No", classification: "NA" },
          ],
        },
      ],
    };
    const result = validateQuestionFlow(flow);
    expect(result.valid).toBe(true);
  });
});

describe("estimateRemainingQuestions (Phase 22)", () => {
  it("estimates full depth from root with no answered questions", () => {
    const remaining = estimateRemainingQuestions(validFlow, []);
    // Max path: q1 -> q2 -> q3 = 3 questions deep
    expect(remaining).toBe(3);
  });

  it("estimates fewer remaining when questions are answered", () => {
    const remaining = estimateRemainingQuestions(validFlow, ["q1"]);
    // q1 answered, max path from q1 is 0, but root is q1 so it counts as answered
    expect(remaining).toBe(0);
  });

  it("returns 0 for empty flow", () => {
    const flow: QuestionFlow = { rootQuestionId: "q1", questions: [] };
    const remaining = estimateRemainingQuestions(flow, []);
    expect(remaining).toBe(0);
  });

  it("handles partial progress", () => {
    const remaining = estimateRemainingQuestions(validFlow, ["q1", "q2"]);
    expect(remaining).toBe(0);
  });
});
