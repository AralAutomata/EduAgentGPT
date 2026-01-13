// This file defines the "shape" of all data structures used throughout the app
// Think of it as a blueprint or contract that ensures type safety

// PerformanceTrend is a "string literal union type"
// This means the value MUST be one of these three exact strings, nothing else
export type PerformanceTrend = "improving" | "stable" | "declining";
// Example: let trend: PerformanceTrend = "improving"; ✓ Valid
//          let trend: PerformanceTrend = "bad"; ✗ Type error!

// Interface defines the structure of a Grade object
export interface Grade {
  subject: string;  // e.g., "Mathematics", "Science"
  score: number;    // Must be a number, typically 0-100 (validation happens elsewhere)
}

// Student is the core data structure for a single student
export interface Student {
  id: string;       // Unique identifier, e.g., "S001"
  name: string;     // Full name, e.g., "Emma Rodriguez"
  email: string;    // Contact email for sending reports
  
  grades: Grade[];  // Array of Grade objects (see above)
                    // Example: [{subject: "Math", score: 95}, {subject: "Science", score: 82}]
  
  participationScore: number;       // 1-10 scale rating of class engagement
  assignmentCompletionRate: number; // Percentage 0-100 of completed assignments
  teacherNotes: string;             // Free-text observations from teacher
  
  performanceTrend: PerformanceTrend; // Uses the union type defined above
  lastAssessmentDate: string;         // ISO date string, e.g., "2026-01-07T10:30:00Z"
}

// StudentMetrics are CALCULATED values derived from Student data
// This separates raw data (Student) from computed analytics (StudentMetrics)
export interface StudentMetrics {
  averageScore: number;           // Mean of all grade scores
  highestSubjects: Grade[];       // Top-performing subjects (usually top 2)
  lowestSubjects: Grade[];        // Weakest subjects (usually bottom 2)
  participationScore: number;     // Copy from Student (for convenience in analysis)
  assignmentCompletionRate: number; // Copy from Student
  needsAttention: boolean;        // Flag: true if student requires intervention
}

// RiskLevel categorizes how much support a student needs
export type RiskLevel = "low" | "medium" | "high";

// StudentAnalysis combines original student data with computed analysis
// This is what the analyzer.ts produces for each student
export interface StudentAnalysis {
  student: Student;               // The original student object
  metrics: StudentMetrics;        // Calculated metrics
  strengths: string[];            // Array of positive observations, e.g., ["Strong math skills"]
  improvementAreas: string[];     // Array of areas to focus on, e.g., ["Science needs work"]
  riskLevel: RiskLevel;           // Overall risk assessment
}

// TeacherSummary is aggregated data about the entire class
// Built from analyzing all students together
export interface TeacherSummary {
  classAverage: number;        // Mean grade across all students
  topStudents: string[];       // Names of highest performers (usually top 3)
  attentionNeeded: string[];   // Names of students flagged for attention
  notes: string[];             // Observations about class trends
}

// TeacherPreferences allows customization of AI-generated insights
// This lets teachers influence the tone and content of feedback
export interface TeacherPreferences {
  classGoals?: string[];          // Optional: What should students aim for?
                                  // "?" means this field can be undefined
  focusAreas?: string[];          // Optional: Priority topics to emphasize
  preferredStrategies?: string[]; // Optional: Specific interventions teacher likes
  
  tone?: "warm" | "neutral" | "direct"; // Optional: Communication style
                                        // Another string literal union
  teacherNotes?: string;          // Optional: Additional context for AI
}

// StudentInsights is the AI-generated, human-friendly feedback for students
// This is what OpenAI returns (after parsing and validation)
export interface StudentInsights {
  positiveObservation: string;  // Opening encouraging statement
  strengths: string[];          // 1-3 specific strengths
  improvementAreas: string[];   // 1-2 areas to work on
  strategies: string[];         // 2-3 actionable recommendations
  nextStepGoal: string;         // One clear goal for next week
  encouragement: string;        // Closing motivational message
}

// TeacherInsights is the AI-generated summary for the teacher
export interface TeacherInsights {
  classOverview: string;        // High-level summary of class performance
  strengths: string[];          // 1-4 positive class-wide observations
  
  attentionNeeded: Array<{      // Array of objects (not just names)
    name: string;               // Student name
    reason: string;             // Why they need attention
  }>;
  
  nextSteps: string[];          // 2-4 recommended actions for teacher
}

// AppConfig holds all application configuration
// Loaded from environment variables at startup
export interface AppConfig {
  // OpenAI API settings
  openAiApiKey: string;         // Required: API key for authentication
  openAiModel: string;          // Model to use, e.g., "gpt-4"
  openAiBaseUrl?: string;       // Optional: Custom API endpoint (for proxies)
  
  // Email settings
  emailFrom: string;            // "From" address in emails
  teacherEmail: string;         // Where to send teacher summaries
  emailOutDir?: string;         // Optional: Directory to save emails locally
  
  // Storage settings
  historyDbPath: string;        // Path to SQLite database file
  teacherRulesPath?: string;    // Optional: Path to teacher preferences JSON
  teacherRules?: TeacherPreferences; // Loaded preferences (populated at runtime)
  
  // Scheduling settings
  scheduleCron?: string;        // Optional: Cron expression, e.g., "0 9 * * *"
  scheduleIntervalMin: number;  // Interval in minutes (used if no cron)
  studentsJsonPath: string;     // Path to students data file
  
  // Logging
  logLevel: LogLevel;           // Controls verbosity of logs
}

// LogLevel controls what gets logged to console
export type LogLevel = "debug" | "info" | "warn" | "error";
// debug = everything (very verbose)
// info = normal operations
// warn = concerning but not fatal
// error = failures that need attention