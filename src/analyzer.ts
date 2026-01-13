// Import only the types we need (not the entire types.ts file)
import type { Student, StudentAnalysis, StudentMetrics, TeacherSummary } from "./types.ts";

/**
 * Calculate the average (mean) of an array of numbers
 * Example: average([80, 90, 100]) = 90
 */
function average(scores: number[]): number {
  // Edge case: empty array would cause division by zero
  if (scores.length === 0) return 0;
  
  // reduce() is an array method that accumulates a value
  // acc = accumulator (running total), score = current item
  // 0 is the initial value of acc
  const sum = scores.reduce((acc, score) => acc + score, 0);
  
  // Divide sum by count to get average
  // Math.round(...* 100) / 100 rounds to 2 decimal places
  // Example: 85.666666 becomes 85.67
  return Math.round((sum / scores.length) * 100) / 100;
}

/**
 * Get the top N items from an array based on a scoring function
 * Generic function: T can be any type
 * Example: topN(grades, 2, g => g.score) gets 2 highest-scoring grades
 */
function topN<T>(items: T[], n: number, score: (item: T) => number): T[] {
  return [...items]  // Create a copy (don't mutate original array)
    .sort((a, b) => score(b) - score(a))  // Sort descending (high scores first)
    //               ↑ b - a creates descending order
    //               If we used a - b, it would be ascending
    .slice(0, n);  // Take first n items
}

/**
 * Get the bottom N items from an array based on a scoring function
 * Example: bottomN(grades, 2, g => g.score) gets 2 lowest-scoring grades
 */
function bottomN<T>(items: T[], n: number, score: (item: T) => number): T[] {
  return [...items]  // Create a copy
    .sort((a, b) => score(a) - score(b))  // Sort ascending (low scores first)
    //               ↑ a - b creates ascending order
    .slice(0, n);  // Take first n items
}

/**
 * Determine risk level based on metrics and trend
 * Returns "high", "medium", or "low"
 * 
 * Logic: If ANY red flag is present, risk is high
 */
function determineRisk(
  metrics: StudentMetrics, 
  trend: Student["performanceTrend"]  // "improving" | "stable" | "declining"
): StudentAnalysis["riskLevel"] {  // Return type: "high" | "medium" | "low"
  
  // HIGH RISK: Any of these conditions triggers immediate concern
  if (
    metrics.averageScore < 70 ||           // Failing grade average
    metrics.participationScore <= 4 ||     // Very low engagement (40% or less)
    metrics.assignmentCompletionRate < 70 || // Missing 30%+ of assignments
    trend === "declining"                   // Performance getting worse
  ) {
    return "high";  // Student needs urgent attention
  }
  
  // MEDIUM RISK: Concerning but not critical
  if (
    metrics.averageScore < 80 ||           // Below B average
    metrics.participationScore <= 6 ||     // Moderate engagement (60% or less)
    metrics.assignmentCompletionRate < 85  // Missing 15%+ of assignments
  ) {
    return "medium";  // Student could use support
  }
  
  // LOW RISK: Student is doing well
  return "low";
}

/**
 * Analyze a student record into structured performance insights.
 * This is the main function that transforms raw data into actionable analysis.
 */
export function analyzeStudent(student: Student): StudentAnalysis {
  // STEP 1: Calculate average grade across all subjects
  // .map(grade => grade.score) extracts just the scores: [95, 82, 88, ...]
  const averageScore = average(student.grades.map((grade) => grade.score));
  
  // STEP 2: Identify strongest subjects (top 2)
  // The arrow function (grade) => grade.score tells topN to sort by score
  const highestSubjects = topN(student.grades, 2, (grade) => grade.score);
  
  // STEP 3: Identify weakest subjects (bottom 2)
  const lowestSubjects = bottomN(student.grades, 2, (grade) => grade.score);

  // STEP 4: Build metrics object
  const metrics: StudentMetrics = {
    averageScore,
    highestSubjects,
    lowestSubjects,
    participationScore: student.participationScore,  // Copy from input
    assignmentCompletionRate: student.assignmentCompletionRate,  // Copy from input
    
    // needsAttention is a boolean flag set if ANY of these are true:
    needsAttention: 
      averageScore < 75 ||                      // Below C average
      student.assignmentCompletionRate < 80 ||  // Missing 20%+ assignments
      student.performanceTrend === "declining", // Getting worse
  };

  // STEP 5: Build strengths array (positive observations)
  const strengths: string[] = [];
  
  // Add strength if average is B+ or better
  if (averageScore >= 85) strengths.push("Strong overall academic performance");
  
  // Add strength if participation is high (80%+)
  if (student.participationScore >= 8) strengths.push("Consistent class participation");
  
  // Add strength if completing 90%+ of assignments
  if (student.assignmentCompletionRate >= 90) strengths.push("High assignment completion rate");
  
  // Add strength if performance is improving
  if (student.performanceTrend === "improving") strengths.push("Recent performance trend is improving");

  // STEP 6: Build improvement areas array (areas of concern)
  const improvementAreas: string[] = [];
  
  // Flag if average is below C
  if (averageScore < 75) improvementAreas.push("Overall grade average needs improvement");
  
  // Flag if participation is 60% or less
  if (student.participationScore <= 6) improvementAreas.push("Increase class participation");
  
  // Flag if missing 15%+ of assignments
  if (student.assignmentCompletionRate < 85) improvementAreas.push("Improve assignment completion rate");
  
  // Flag if performance is declining
  if (student.performanceTrend === "declining") improvementAreas.push("Address recent performance decline");
  
  // Flag specific weak subjects
  if (lowestSubjects.length > 0) {
    // .map() extracts subject names: ["Math", "Science"]
    // .join(", ") creates: "Math, Science"
    const subjects = lowestSubjects.map((grade) => grade.subject).join(", ");
    improvementAreas.push(`Focus on weaker subjects: ${subjects}`);
  }

  // STEP 7: Calculate overall risk level
  const riskLevel = determineRisk(metrics, student.performanceTrend);

  // STEP 8: Return complete analysis object
  return {
    student,           // Original student data
    metrics,           // Calculated metrics
    strengths,         // Positive observations
    improvementAreas,  // Areas needing work
    riskLevel,         // Overall risk assessment
  };
}

/**
 * Build a summary of teacher's entire class from individual student analyses
 * This aggregates data across all students to give the teacher a "big picture" view
 */
export function buildTeacherSummary(analyses: StudentAnalysis[]): TeacherSummary {
  // STEP 1: Calculate class-wide average
  // .map(analysis => analysis.metrics.averageScore) extracts each student's average
  // Then average() function calculates mean of those averages
  const classAverage = average(analyses.map((analysis) => analysis.metrics.averageScore));
  
  // STEP 2: Sort students by grade (highest first)
  // [...analyses] creates a copy so we don't mutate the original array
  const sortedByAverage = [...analyses].sort(
    // Compare function: b - a sorts descending (highest first)
    (a, b) => b.metrics.averageScore - a.metrics.averageScore,
  );

  // STEP 3: Get names of top 3 students
  // .slice(0, 3) takes first 3 items from sorted array
  // .map(analysis => analysis.student.name) extracts just the names
  const topStudents = sortedByAverage.slice(0, 3).map((analysis) => analysis.student.name);
  
  // STEP 4: Get names of students needing attention
  const attentionNeeded = analyses
    // .filter() keeps only items where the condition is true
    .filter((analysis) => 
      analysis.metrics.needsAttention ||  // Flagged for attention
      analysis.riskLevel === "high"       // Or high risk
    )
    // .map() extracts just the names
    .map((analysis) => analysis.student.name);

  // STEP 5: Build observation notes about class trends
  const notes: string[] = [];
  
  // Count how many students are declining
  // .filter() keeps declining students, .length counts them
  const declining = analyses.filter(
    (analysis) => analysis.student.performanceTrend === "declining"
  ).length;
  
  // Add note if any students are declining
  if (declining > 0) notes.push(`${declining} student(s) show a declining trend.`);
  
  // Count students with strong completion rates (90%+)
  const strongCompletion = analyses.filter(
    (analysis) => analysis.metrics.assignmentCompletionRate >= 90
  ).length;
  
  // Add note if students have strong completion
  if (strongCompletion > 0) notes.push(`${strongCompletion} student(s) have 90%+ assignment completion.`);

  // STEP 6: Return complete teacher summary
  return {
    classAverage,      // Mean grade across all students
    topStudents,       // Names of top 3 performers
    attentionNeeded,   // Names of students flagged for attention
    notes,             // Observations about class trends
  };
}