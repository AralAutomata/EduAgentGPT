import { analyzeStudent } from "../src/analyzer.ts";
import type { Student } from "../src/types.ts";
import { assertEquals } from "jsr:@std/assert@0.224.0";

Deno.test("analyzeStudent computes averages and risk level", () => {
  // Arrange: Build a student with varied scores and weak engagement so the
  // risk logic should classify them as high risk.
  const student: Student = {
    id: "S100",
    name: "Test Student",
    email: "test@example.com",
    grades: [
      { subject: "Math", score: 90 },
      { subject: "English", score: 70 },
    ],
    participationScore: 5,
    assignmentCompletionRate: 60,
    teacherNotes: "Needs confidence in class.",
    performanceTrend: "declining",
    lastAssessmentDate: "2024-09-01",
  };

  // Act: Run deterministic analysis calculations.
  const analysis = analyzeStudent(student);

  // Assert: Verify the math and derived fields.
  // Average is (90 + 70) / 2 = 80; the highest/lowest subjects should align
  // with those scores; and the risk level should be high based on thresholds.
  assertEquals(analysis.metrics.averageScore, 80);
  assertEquals(analysis.metrics.highestSubjects[0].subject, "Math");
  assertEquals(analysis.metrics.lowestSubjects[0].subject, "English");
  assertEquals(analysis.riskLevel, "high");
});
