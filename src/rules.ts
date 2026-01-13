// Import types we need
import type { TeacherPreferences } from "./types.ts";
import type { Logger } from "./logger.ts";

/**
 * Sanitize and validate an array of strings
 * 
 * This helper function ensures that:
 * 1. The value is actually an array
 * 2. All items are strings
 * 3. Strings are trimmed and non-empty
 * 
 * Returns undefined if invalid or empty after cleaning
 */
function sanitizeStringArray(value: unknown): string[] | undefined {
  // Type guard: is it an array at all?
  if (!Array.isArray(value)) return undefined;
  
  // Clean the array:
  const cleaned = value
    // Keep only string items (filter out numbers, objects, etc.)
    // The type predicate ": item is string" tells TypeScript
    // that after this filter, all items are definitely strings
    .filter((item): item is string => typeof item === "string")
    
    // Trim whitespace from each string
    .map((item) => item.trim())
    
    // Remove empty strings (Boolean is a concise way to filter truthy values)
    // Empty string is falsy, non-empty is truthy
    .filter(Boolean);
  
  // If nothing is left after cleaning, return undefined
  // Otherwise return the cleaned array
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Parse and validate the tone field
 * 
 * Tone must be one of three specific values: "warm", "neutral", or "direct"
 * Anything else is invalid
 */
function parseTone(value: unknown): TeacherPreferences["tone"] | undefined {
  // First check if it's a string at all
  if (typeof value !== "string") return undefined;
  
  // Check if it matches one of the allowed values
  // TypeScript's type narrowing understands this check
  if (value === "warm" || value === "neutral" || value === "direct") {
    return value;  // TypeScript knows this is the correct type
  }
  
  // Invalid tone value
  return undefined;
}

/**
 * Load teacher preference rules from a JSON file.
 * 
 * This function demonstrates several important patterns:
 * 1. Optional configuration (returns undefined if file doesn't exist)
 * 2. Validation (doesn't trust the JSON content)
 * 3. Graceful error handling (logs but doesn't crash)
 * 4. Type safety (ensures loaded data matches TypeScript types)
 * 
 * @param path - Path to the teacher rules JSON file (or undefined to skip)
 * @param logger - Logger for recording operations
 * @returns Validated TeacherPreferences or undefined
 */
export async function loadTeacherRules(
  path: string | undefined,  // Path can be undefined (optional configuration)
  logger: Logger,
): Promise<TeacherPreferences | undefined> {
  
  // STEP 1: Check if a path was even provided
  // If EMAIL_OUT_DIR or other optional config isn't set, path will be undefined
  if (!path) return undefined;

  try {
    // STEP 2: Read the file contents
    // readTextFile returns a Promise<string>
    // await pauses execution until the file is read
    const data = await Deno.readTextFile(path);
    
    // STEP 3: Parse the JSON
    // This could throw if JSON is malformed
    // We cast to Record since we don't know the structure yet
    const parsed = JSON.parse(data) as Record<string, unknown>;

    // STEP 4: Validate that it's an object (not an array, string, etc.)
    if (typeof parsed !== "object" || parsed === null) {
      logger.warn("Teacher rules file must be a JSON object", { path });
      return undefined;
    }

    // STEP 5: Extract and validate each field
    // We use our helper functions to sanitize the data
    const rules: TeacherPreferences = {
      // Each field is optional (can be undefined)
      // We sanitize the array fields to ensure they're valid
      classGoals: sanitizeStringArray(parsed.classGoals),
      focusAreas: sanitizeStringArray(parsed.focusAreas),
      preferredStrategies: sanitizeStringArray(parsed.preferredStrategies),
      
      // Validate the tone field
      tone: parseTone(parsed.tone),
      
      // Teacher notes can be any string
      // We check the type and trim it
      teacherNotes: typeof parsed.teacherNotes === "string" 
        ? parsed.teacherNotes.trim() 
        : undefined,
    };

    // STEP 6: Log success
    logger.info("Teacher rules loaded", { path });
    
    // Return the validated rules
    // Note: This object might have all fields as undefined, which is OK
    // The caller will handle that (by using defaults)
    return rules;
    
  } catch (error) {
    // Error handling for different failure cases
    
    // CASE 1: File doesn't exist (this is expected and OK)
    if (error instanceof Deno.errors.NotFound) {
      logger.warn("Teacher rules file not found", { path });
      return undefined;  // Not an error, just not configured
    }
    
    // CASE 2: Other errors (permissions, malformed JSON, etc.)
    logger.error("Failed to load teacher rules", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;  // Fail gracefully, use defaults
  }
}

// EXAMPLE TEACHER RULES FILE:
// 
// {
//   "classGoals": [
//     "Build a growth mindset",
//     "Master foundational skills before moving forward"
//   ],
//   "focusAreas": [
//     "Reading comprehension",
//     "Mathematical problem-solving"
//   ],
//   "preferredStrategies": [
//     "Use the Pomodoro technique for time management",
//     "Practice active recall with flashcards",
//     "Form study groups with peers"
//   ],
//   "tone": "warm",
//   "teacherNotes": "This class responds well to encouragement and specific examples."
// }
//
// HOW IT'S USED:
// The AI agent receives these preferences and incorporates them into prompts.
// For example, if tone is "warm", the AI will use more encouraging language.
// If preferredStrategies includes specific techniques, the AI will suggest those.
//
// This makes the system flexible without requiring code changes.