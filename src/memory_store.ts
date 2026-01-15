import { join } from "@std/path";
import type { Student, StudentInsights, TeacherInsights } from "./types.ts";
import type { Logger } from "./logger.ts";

// Compact event record used to track recent memory updates.
export interface MemoryEntry {
  date: string;
  note: string;
}

// Per-student memory persisted as JSON under memory/students/{id}.json.
export interface StudentMemory {
  studentId: string;
  summary: string;
  strengths: string[];
  improvementAreas: string[];
  goals: string[];
  lastUpdated: string;
  history: MemoryEntry[];
}

// Class-level memory persisted as memory/teacher.json.
export interface TeacherMemory {
  summary: string;
  classGoals: string[];
  focusAreas: string[];
  lastUpdated: string;
  history: MemoryEntry[];
}

// Defaults guarantee a stable shape even if memory files are missing.
const DEFAULT_STUDENT_MEMORY: StudentMemory = {
  studentId: "",
  summary: "",
  strengths: [],
  improvementAreas: [],
  goals: [],
  lastUpdated: "",
  history: [],
};

// Defaults guarantee a stable shape for the teacher memory file.
const DEFAULT_TEACHER_MEMORY: TeacherMemory = {
  summary: "",
  classGoals: [],
  focusAreas: [],
  lastUpdated: "",
  history: [],
};

/**
 * Load a student's memory JSON file, or return a default memory object.
 */
export async function loadStudentMemory(
  memoryDir: string,
  studentId: string,
  logger: Logger,
): Promise<StudentMemory> {
  // File path is deterministic by studentId so memory is stable across runs.
  const path = studentMemoryPath(memoryDir, studentId);
  try {
    // Parse existing memory file if present.
    const data = await Deno.readTextFile(path);
    const parsed = JSON.parse(data) as StudentMemory;
    // Merge with defaults to guard against missing fields in older files.
    return { ...DEFAULT_STUDENT_MEMORY, ...parsed, studentId };
  } catch (error) {
    // Missing file just means the student has no prior memory.
    if (error instanceof Deno.errors.NotFound) {
      return { ...DEFAULT_STUDENT_MEMORY, studentId };
    }
    logger.warn("Failed to load student memory", {
      studentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...DEFAULT_STUDENT_MEMORY, studentId };
  }
}

/**
 * Persist a student's memory JSON file.
 */
export async function saveStudentMemory(
  memoryDir: string,
  memory: StudentMemory,
  logger: Logger,
): Promise<void> {
  try {
    // Ensure the student memory folder exists before writing the file.
    await Deno.mkdir(join(memoryDir, "students"), { recursive: true });
    // File name is derived from studentId for easy lookup.
    const path = studentMemoryPath(memoryDir, memory.studentId);
    await Deno.writeTextFile(path, JSON.stringify(memory, null, 2));
  } catch (error) {
    logger.warn("Failed to save student memory", {
      studentId: memory.studentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Load teacher memory JSON file, or return a default memory object.
 */
export async function loadTeacherMemory(
  memoryDir: string,
  logger: Logger,
): Promise<TeacherMemory> {
  // Teacher memory is stored in a single file per class.
  const path = teacherMemoryPath(memoryDir);
  try {
    // Parse existing memory file if present.
    const data = await Deno.readTextFile(path);
    const parsed = JSON.parse(data) as TeacherMemory;
    // Merge with defaults to ensure required keys always exist.
    return { ...DEFAULT_TEACHER_MEMORY, ...parsed };
  } catch (error) {
    // Missing file just means no prior class memory.
    if (error instanceof Deno.errors.NotFound) {
      return { ...DEFAULT_TEACHER_MEMORY };
    }
    logger.warn("Failed to load teacher memory", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...DEFAULT_TEACHER_MEMORY };
  }
}

/**
 * Persist teacher memory JSON file.
 */
export async function saveTeacherMemory(
  memoryDir: string,
  memory: TeacherMemory,
  logger: Logger,
): Promise<void> {
  try {
    // Ensure the memory directory exists before writing the file.
    await Deno.mkdir(memoryDir, { recursive: true });
    // Teacher memory uses a single, stable file path.
    const path = teacherMemoryPath(memoryDir);
    await Deno.writeTextFile(path, JSON.stringify(memory, null, 2));
  } catch (error) {
    logger.warn("Failed to save teacher memory", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Create an updated student memory object using current insights.
 */
export function updateStudentMemory(
  previous: StudentMemory,
  student: Student,
  insights: StudentInsights,
  historyLimit: number,
): StudentMemory {
  // Summary is compact by design to keep memory size stable.
  const now = new Date().toISOString();
  // Keep the summary short so it can be injected into prompts.
  const summary = [
    insights.positiveObservation,
    `Goal: ${insights.nextStepGoal}`,
  ].join(" ");

  // History tracks a short rolling log of key focus areas and goals.
  const historyEntry: MemoryEntry = {
    date: now,
    note: `Focus: ${insights.improvementAreas.join("; ")} | Goal: ${insights.nextStepGoal}`,
  };

  return {
    studentId: student.id,
    summary,
    // Keep only a small, de-duplicated set of strengths for prompt context.
    strengths: uniqueList([insights.positiveObservation, ...insights.strengths], 3),
    // Focus areas should remain short and specific.
    improvementAreas: uniqueList(insights.improvementAreas, 3),
    // Keep recent goals so the agent can reference continuity over time.
    goals: uniqueList([insights.nextStepGoal, ...previous.goals], 3),
    lastUpdated: now,
    // Cap the history list to a fixed number of entries.
    history: trimHistory([historyEntry, ...previous.history], historyLimit),
  };
}

/**
 * Create an updated teacher memory object using current insights.
 */
export function updateTeacherMemory(
  previous: TeacherMemory,
  insights: TeacherInsights,
  historyLimit: number,
): TeacherMemory {
  const now = new Date().toISOString();
  // Class summary is the primary memory item for teachers.
  const summary = insights.classOverview;
  const historyEntry: MemoryEntry = {
    date: now,
    note: `Next steps: ${insights.nextSteps.join("; ")}`,
  };

  return {
    summary,
    // Retain teacher-provided goals and focus areas for stable guidance.
    classGoals: uniqueList(previous.classGoals, 4),
    focusAreas: uniqueList(previous.focusAreas, 4),
    lastUpdated: now,
    // Keep a compact log of class-level changes.
    history: trimHistory([historyEntry, ...previous.history], historyLimit),
  };
}

export function studentMemoryPath(memoryDir: string, studentId: string): string {
  // One JSON file per student keeps memory readable and easy to reset.
  return join(memoryDir, "students", `${studentId}.json`);
}

export function teacherMemoryPath(memoryDir: string): string {
  return join(memoryDir, "teacher.json");
}

function uniqueList(items: string[], max: number): string[] {
  // Deduplicate while preserving order; cap list size for compact prompts.
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of cleaned) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

function trimHistory(entries: MemoryEntry[], limit: number): MemoryEntry[] {
  // Keep only the most recent entries to avoid unbounded growth.
  if (limit <= 0) return [];
  return entries.slice(0, limit);
}
