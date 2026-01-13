// Import the Database class from Deno's SQLite library
// This provides a TypeScript wrapper around SQLite operations
import { Database } from "@db/sqlite";

// Import dirname to get the directory part of a path
// Example: dirname("/data/history.db") returns "/data"
import { dirname } from "@std/path";

// Import types we need
import type { Logger } from "./logger.ts";
import type { StudentAnalysis, StudentInsights, TeacherInsights, TeacherSummary } from "./types.ts";

/**
 * RunStats represents the metadata for a single analysis cycle
 * Each time your scheduler triggers, it creates a new "run"
 */
export interface RunStats {
  runId: string;            // Unique identifier for this run (UUID)
  startedAt: string;        // When the run started (ISO timestamp)
  studentCount: number;     // Total students in the JSON file
  validStudentCount: number; // Students that passed validation
}

/**
 * Simple SQLite-backed store for run history and generated messages.
 * 
 * This class encapsulates all database operations, providing a clean API
 * for the rest of the application. This is called the "Repository Pattern"
 * in software architecture.
 * 
 * Benefits of this approach:
 * 1. The rest of the code doesn't need to know SQL
 * 2. Easy to test (can mock the HistoryStore)
 * 3. Easy to change databases later (just rewrite this class)
 * 4. Centralized error handling for database operations
 */
export class HistoryStore {
  // Private fields (# prefix means truly private, not accessible outside class)
  #db: Database;      // The SQLite database connection
  #logger: Logger;    // Logger for database operations

  /**
   * Constructor initializes the database
   * 
   * @param path - Path to the SQLite database file, e.g., "data/history.db"
   * @param logger - Logger instance for recording operations
   */
  constructor(path: string, logger: Logger) {
    this.#logger = logger;
    
    // STEP 1: Ensure the directory exists
    // If path is "data/history.db", we need to ensure "data" directory exists
    const dir = dirname(path);
    
    // Check if it's a meaningful directory (not current directory)
    if (dir && dir !== ".") {
      // Create the directory (and any parents) synchronously
      // recursive: true is like mkdir -p
      Deno.mkdirSync(dir, { recursive: true });
    }
    
    // STEP 2: Open/create the SQLite database
    // If the file doesn't exist, SQLite will create it
    // If it exists, SQLite will open it
    this.#db = new Database(path);
    
    // STEP 3: Initialize the database schema (create tables if they don't exist)
    this.#init();
  }

  /**
   * Initialize the database schema
   * 
   * This method creates the tables if they don't exist.
   * "CREATE TABLE IF NOT EXISTS" is idempotent - safe to call multiple times.
   * 
   * This runs every time the app starts, ensuring the schema is correct.
   */
  #init() {
    // TABLE 1: runs
    // Stores metadata about each analysis cycle
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,              -- Unique run identifier (UUID)
        started_at TEXT NOT NULL,         -- ISO timestamp when run started
        completed_at TEXT,                -- ISO timestamp when run completed (NULL if still running)
        student_count INTEGER NOT NULL,   -- Total students in JSON file
        valid_student_count INTEGER NOT NULL, -- Students that passed validation
        status TEXT NOT NULL              -- "running", "completed", "failed", etc.
      );
    `);
    // Why TEXT for timestamps? SQLite doesn't have a native date type.
    // Storing ISO strings like "2026-01-07T10:30:45.123Z" works well
    // and is human-readable in the database.

    // TABLE 2: student_messages
    // Stores each email/insight generated for students
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS student_messages (
        id TEXT PRIMARY KEY,              -- Unique message ID (UUID)
        run_id TEXT NOT NULL,             -- Which run generated this (foreign key to runs.id)
        student_id TEXT NOT NULL,         -- Which student this is for
        analysis_json TEXT,               -- StudentAnalysis as JSON (NULL if analysis failed)
        insights_json TEXT,               -- StudentInsights as JSON (NULL if insights failed)
        email_subject TEXT,               -- Email subject line
        email_path TEXT,                  -- Where the email file was saved
        status TEXT NOT NULL,             -- "sent", "analysis_failed", "insights_failed", etc.
        error TEXT,                       -- Error message if something failed (NULL if success)
        used_fallback INTEGER NOT NULL,   -- 1 if we used fallback, 0 if AI-generated
        created_at TEXT NOT NULL          -- When this message was created
      );
    `);
    // Why store JSON in TEXT fields? SQLite has limited types.
    // Storing JSON as text is common and works well.
    // SQLite even has JSON functions to query inside JSON fields.

    // TABLE 3: teacher_messages
    // Stores each summary generated for teachers
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS teacher_messages (
        id TEXT PRIMARY KEY,              -- Unique message ID (UUID)
        run_id TEXT NOT NULL,             -- Which run generated this
        summary_json TEXT NOT NULL,       -- TeacherSummary as JSON
        insights_json TEXT,               -- TeacherInsights as JSON (NULL if failed)
        email_subject TEXT,               -- Email subject line
        email_path TEXT,                  -- Where the email file was saved
        status TEXT NOT NULL,             -- "sent", "summary_failed", etc.
        error TEXT,                       -- Error message if something failed
        used_fallback INTEGER NOT NULL,   -- 1 if we used fallback, 0 if AI-generated
        created_at TEXT NOT NULL          -- When this message was created
      );
    `);
  }

  /**
   * Record that a new analysis run has started
   * 
   * This creates a new row in the runs table with status "running"
   * Later, we'll call finishRun() to update the status
   */
  startRun(stats: RunStats) {
    try {
      // Insert a new row into the runs table
      this.#db.exec(
        // SQL query with ? placeholders for parameters
        // Placeholders prevent SQL injection attacks
        `INSERT INTO runs (id, started_at, student_count, valid_student_count, status)
         VALUES (?, ?, ?, ?, ?)`,
        // Array of values to fill in the ? placeholders
        // Values are provided in order
        [
          stats.runId,              // id
          stats.startedAt,          // started_at
          stats.studentCount,       // student_count
          stats.validStudentCount,  // valid_student_count
          "running",                // status (starts as "running")
        ],
      );
    } catch (error) {
      // If database insert fails, log the error but don't crash
      // The run will continue even if we can't record it
      this.#logger.error("Failed to record run start", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Mark a run as finished with a final status
   * 
   * This updates the runs table row, setting completed_at and final status
   * 
   * @param runId - The UUID of the run to finish
   * @param status - Final status: "completed", "no_valid_students", "no_successful_analyses", etc.
   */
  finishRun(runId: string, status: string) {
    // Get current timestamp
    const completedAt = new Date().toISOString();
    
    try {
      // Update the existing row
      this.#db.exec(
        `UPDATE runs SET completed_at = ?, status = ? WHERE id = ?`,
        [completedAt, status, runId],
      );
    } catch (error) {
      this.#logger.error("Failed to record run completion", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record a message (email) that was generated for a student
   * 
   * This stores the complete record of what was sent to the student,
   * including the analysis, insights, and any errors that occurred.
   * 
   * This creates an audit trail - you can later review exactly what
   * was sent to each student and when.
   */
  recordStudentMessage(params: {
    runId: string;                    // Which run this belongs to
    studentId: string;                // Which student this is for
    analysis?: StudentAnalysis;       // The calculated analysis (optional if analysis failed)
    insights?: StudentInsights;       // The AI-generated insights (optional if insights failed)
    emailSubject?: string;            // Email subject line
    emailPath?: string | null;        // Where the email was saved
    status: string;                   // "sent", "analysis_failed", "insights_failed"
    error?: string;                   // Error message if something failed
    usedFallback: boolean;            // Did we use fallback logic?
  }) {
    // Get current timestamp
    const createdAt = new Date().toISOString();
    
    try {
      // Insert a new row
      this.#db.exec(
        `INSERT INTO student_messages
          (id, run_id, student_id, analysis_json, insights_json, email_subject, email_path, status, error, used_fallback, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),  // Generate a unique ID for this message
          params.runId,
          params.studentId,
          
          // Convert objects to JSON strings (or NULL if not provided)
          // The ?? operator is "nullish coalescing" - use right side if left is null/undefined
          params.analysis ? JSON.stringify(params.analysis) : null,
          params.insights ? JSON.stringify(params.insights) : null,
          
          params.emailSubject ?? null,  // Use null if undefined
          params.emailPath ?? null,
          params.status,
          params.error ?? null,
          
          // Convert boolean to integer (SQLite doesn't have a boolean type)
          params.usedFallback ? 1 : 0,
          
          createdAt,
        ],
      );
    } catch (error) {
      // Log error but don't crash
      this.#logger.error("Failed to record student message", {
        studentId: params.studentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record a summary that was generated for the teacher
   * 
   * Similar to recordStudentMessage but for teacher summaries
   */
  recordTeacherMessage(params: {
    runId: string;
    summary: TeacherSummary;          // Always provided (not optional)
    insights?: TeacherInsights;
    emailSubject?: string;
    emailPath?: string | null;
    status: string;
    error?: string;
    usedFallback: boolean;
  }) {
    const createdAt = new Date().toISOString();
    
    try {
      this.#db.exec(
        `INSERT INTO teacher_messages
          (id, run_id, summary_json, insights_json, email_subject, email_path, status, error, used_fallback, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          params.runId,
          JSON.stringify(params.summary),  // Summary is always present
          params.insights ? JSON.stringify(params.insights) : null,
          params.emailSubject ?? null,
          params.emailPath ?? null,
          params.status,
          params.error ?? null,
          params.usedFallback ? 1 : 0,
          createdAt,
        ],
      );
    } catch (error) {
      this.#logger.error("Failed to record teacher message", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close the database connection
   * 
   * This should be called when the app shuts down (though it's not critical
   * since SQLite handles crashes gracefully)
   */
  close() {
    try {
      this.#db.close();
    } catch (error) {
      // Even closing can fail (though it's rare)
      this.#logger.warn("Failed to close history database", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// WHY USE A DATABASE?
//
// You might wonder: "Why not just append to a log file?"
//
// Benefits of SQLite:
// 1. STRUCTURED DATA: Can query "show me all messages where usedFallback=1"
// 2. REFERENTIAL INTEGRITY: Can join runs with messages
// 3. ATOMIC TRANSACTIONS: Multiple writes succeed or fail together
// 4. CONCURRENT ACCESS: Multiple processes can read simultaneously
// 5. BUILT-IN TOOLS: Can use sqlite3 CLI to inspect data
// 6. INDEXING: Can add indexes for fast queries later
// 7. MIGRATION SUPPORT: Can alter schema with ALTER TABLE commands
//
// SQLite is essentially a more powerful, queryable log file.