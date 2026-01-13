import {
  parseStudentInsights,
  parseTeacherInsights,
  renderStudentMessage,
} from "../src/insights.ts";
import { assertEquals, assert } from "jsr:@std/assert@0.224.0";

Deno.test("parseStudentInsights accepts valid JSON", () => {
  // Arrange: Provide a complete JSON payload that matches the required schema.
  const raw = `
    {
      "positiveObservation": "You showed steady effort this week.",
      "strengths": ["Consistent participation"],
      "improvementAreas": ["Assignment organization"],
      "strategies": ["Use a checklist", "Review notes for 15 minutes nightly"],
      "nextStepGoal": "Complete all assignments on time this week.",
      "encouragement": "Small steps add up."
    }
  `;

  // Act: Parse and validate the LLM-style output.
  const result = parseStudentInsights(raw);

  // Assert: Parsing succeeds and the rendered message includes expected sections.
  assert(result.ok);
  if (result.ok) {
    const message = renderStudentMessage(result.value);
    assert(message.includes("Strengths:"));
  }
});

Deno.test("parseStudentInsights rejects invalid JSON", () => {
  // Arrange: Missing required fields makes this payload invalid.
  const raw = `{ "positiveObservation": "Good job" }`;
  // Act: Attempt to parse the incomplete JSON.
  const result = parseStudentInsights(raw);
  // Assert: Validation must fail because required fields are absent.
  assertEquals(result.ok, false);
});

Deno.test("parseTeacherInsights accepts valid JSON", () => {
  // Arrange: Provide the minimum valid teacher schema with all required fields.
  const raw = `
    {
      "classOverview": "The class is steady overall.",
      "strengths": ["Strong engagement in discussions"],
      "attentionNeeded": [
        { "name": "Alex", "reason": "Declining trend in assignments" }
      ],
      "nextSteps": ["Short daily review", "Peer support pairs"]
    }
  `;

  // Act: Parse the JSON.
  const result = parseTeacherInsights(raw);

  // Assert: Parsing succeeds and returns a typed insights object.
  assert(result.ok);
});
