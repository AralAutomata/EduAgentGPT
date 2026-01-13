import { validateStudents } from "../src/validator.ts";
import { assertEquals, assert } from "jsr:@std/assert@0.224.0";

Deno.test("validateStudents filters invalid records", () => {
  // Arrange: Build a mixed dataset with one valid student and one invalid student.
  // This ensures validation both accepts good data and rejects malformed fields.
  const data = [
    {
      id: "S1",
      name: "Valid Student",
      email: "valid@example.com",
      grades: [
        { subject: "Math", score: 88 },
      ],
      participationScore: 7,
      assignmentCompletionRate: 92,
      teacherNotes: "Doing well.",
      performanceTrend: "improving",
      lastAssessmentDate: "2024-09-01",
    },
    {
      // Intentionally invalid values:
      // - empty id
      // - malformed email
      // - empty grades
      // - out-of-range scores
      // - wrong type for teacherNotes
      // - unsupported performanceTrend
      // - invalid date string
      id: "",
      name: "Invalid Student",
      email: "not-an-email",
      grades: [],
      participationScore: 11,
      assignmentCompletionRate: -5,
      teacherNotes: 42,
      performanceTrend: "unknown",
      lastAssessmentDate: "bad-date",
    },
  ];

  // Act: Validate and split the data into valid records + errors.
  const result = validateStudents(data);

  // Assert: Exactly one student survives validation, and errors are reported.
  assertEquals(result.valid.length, 1);
  assert(result.errors.length > 0);
});
