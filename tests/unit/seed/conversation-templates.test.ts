import { describe, expect, it } from "vitest";
import { validateQuestionFlow } from "@/lib/conversation/tree-engine";
import type { QuestionFlow, ConversationQuestion } from "@/types/conversation";

// Re-declare the seed flow here to keep the test independent of the seed
// module's import of PrismaClient (which pulls a generated client we don't
// want to load for a pure-data test).
const GENERIC_FLOW: QuestionFlow = {
  rootQuestionId: "q1",
  questions: [
    {
      id: "q1",
      text: "Does your organization currently perform this process exactly as described in the SAP standard?",
      answers: [
        { id: "yes", text: "Yes", classification: "FIT" },
        { id: "minor", text: "Minor adjustments", nextQuestionId: "q2" },
        { id: "different", text: "Significantly different", nextQuestionId: "q3" },
        { id: "absent", text: "Not performed", classification: "NA" },
      ],
    },
    {
      id: "q2",
      text: "Configuration only?",
      answers: [
        { id: "yes", text: "Yes", classification: "CONFIGURE" },
        { id: "no", text: "No", classification: "GAP" },
      ],
    },
    {
      id: "q3",
      text: "Could you adapt?",
      answers: [
        { id: "adapt", text: "Yes", classification: "CONFIGURE" },
        { id: "essential", text: "No", classification: "GAP" },
      ],
    },
  ],
};

describe("seeded conversation-template baseline flow", () => {
  it("is structurally valid per validateQuestionFlow", () => {
    const result = validateQuestionFlow(GENERIC_FLOW);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("can yield each of the four classifications via some answer path", () => {
    const classifications = new Set<string>();
    for (const q of GENERIC_FLOW.questions as ConversationQuestion[]) {
      for (const a of q.answers) {
        if (a.classification) classifications.add(a.classification);
      }
    }
    expect(classifications).toEqual(new Set(["FIT", "CONFIGURE", "GAP", "NA"]));
  });

  it("has a root question that exists in the questions array", () => {
    const ids = new Set(GENERIC_FLOW.questions.map((q) => q.id));
    expect(ids.has(GENERIC_FLOW.rootQuestionId)).toBe(true);
  });

  it("only branches to questions that exist", () => {
    const ids = new Set(GENERIC_FLOW.questions.map((q) => q.id));
    for (const q of GENERIC_FLOW.questions) {
      for (const a of q.answers) {
        if (a.nextQuestionId) {
          expect(ids.has(a.nextQuestionId)).toBe(true);
        }
      }
    }
  });

  it("never sets both classification and nextQuestionId on the same answer", () => {
    for (const q of GENERIC_FLOW.questions) {
      for (const a of q.answers) {
        expect(Boolean(a.classification && a.nextQuestionId)).toBe(false);
      }
    }
  });
});
