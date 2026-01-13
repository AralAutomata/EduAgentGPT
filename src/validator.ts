// Import types we need for validation
import type { Grade, PerformanceTrend, Student } from "./types.ts";

// ValidationResult is a generic type that represents either success or failure
// T is a type parameter - it can be any type (Student, Grade, etc.)
// This is called a "discriminated union" - you check the 'ok' field to know which case
type ValidationResult<T> = 
  | { ok: true; value: T }          // Success: contains validated data
  | { ok: false; errors: string[] }; // Failure: contains error messages

// Regex pattern to validate email addresses
// Breakdown: [^@\s]+ = one or more non-@ and non-whitespace characters
//            @       = literal @ symbol
//            [^@\s]+ = one or more non-@ and non-whitespace characters
//            \.      = literal dot
//            [^@\s]+ = one or more non-@ and non-whitespace characters
// This is a simplified pattern - real email validation is much more complex
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Type guard function to check if a value is a plain object (not array, not null)
// "value is Record<string, unknown>" is a type predicate
// If this returns true, TypeScript knows value is Record<string, unknown>
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" &&  // Must be an object
         value !== null &&              // But not null (which is typeof "object")
         !Array.isArray(value);         // And not an array (which is also typeof "object")
}

// Type guard to check if value is a non-empty string
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" &&      // Must be a string type
         value.trim().length > 0;          // And not just whitespace
}

// Type guard to check if value is a valid finite number
// (excludes NaN, Infinity, -Infinity)
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" &&      // Must be a number type
         Number.isFinite(value);           // And not NaN or Infinity
}

// Check if a number is within a specific range (inclusive)
function inRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) &&     // Must be a valid number
         value >= min &&               // Greater than or equal to min
         value <= max;                 // Less than or equal to max
}

// Parse and validate performance trend string
// Returns the value if valid, undefined if invalid
function parseTrend(value: unknown): PerformanceTrend | undefined {
  // First check if it's a string at all
  if (typeof value !== "string") return undefined;
  
  // Check if it matches one of the allowed values
  // TypeScript's type narrowing understands this check
  if (value === "improving" || value === "stable" || value === "declining") {
    return value;  // TypeScript knows this is PerformanceTrend now
  }
  
  return undefined;  // Invalid trend value
}

// Validate that a string is a parseable date
function isValidDate(value: unknown): value is string {
  // Must be a non-empty string
  if (!isNonEmptyString(value)) return false;
  
  // Try to parse it as a date
  // Date.parse() returns NaN if invalid
  // !Number.isNaN(X) means "X is NOT NaN" which means "parsing succeeded"
  return !Number.isNaN(Date.parse(value));
}

// Validate a single grade object
// index parameter is for error messages (e.g., "grades[0]", "grades[1]")
function validateGrade(value: unknown, index: number): ValidationResult<Grade> {
  const errors: string[] = [];  // Accumulate all errors found
  
  // First check: is it even an object?
  if (!isRecord(value)) {
    return { ok: false, errors: [`grades[${index}] must be an object`] };
  }

  // Extract fields from the object
  // We don't know if these fields exist or what type they are yet
  const subject = value.subject;
  const score = value.score;
  
  // Validate and normalize subject (trim whitespace, provide default)
  const subjectValue = isNonEmptyString(subject) ? subject.trim() : "";
  
  // Validate and normalize score (ensure it's a number, provide default)
  const scoreValue = isFiniteNumber(score) ? score : 0;

  // Check subject validity
  if (!isNonEmptyString(subject)) {
    errors.push(`grades[${index}].subject must be a non-empty string`);
  }
  
  // Check score validity (must be 0-100 range)
  if (!inRange(score, 0, 100)) {
    errors.push(`grades[${index}].score must be a number between 0 and 100`);
  }

  // If we found any errors, return them
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Success! Return the validated and normalized Grade object
  return {
    ok: true,
    value: {
      subject: subjectValue,
      score: scoreValue,
    },
  };
}

/**
 * Validate raw student data and return a typed Student or detailed errors.
 * This is the main validation function for individual student objects.
 */
export function validateStudent(value: unknown, index: number): ValidationResult<Student> {
  const errors: string[] = [];  // Collect all validation errors
  
  // First: check if the value is even an object
  if (!isRecord(value)) {
    // Early return if it's not an object at all
    return { ok: false, errors: [`students[${index}] must be an object`] };
  }

  // Extract all fields from the object
  // TypeScript doesn't know if these fields exist or their types yet
  const id = value.id;
  const name = value.name;
  const email = value.email;
  const grades = value.grades;
  const participationScore = value.participationScore;
  const assignmentCompletionRate = value.assignmentCompletionRate;
  const teacherNotes = value.teacherNotes;
  const performanceTrend = parseTrend(value.performanceTrend);  // Uses helper function
  const lastAssessmentDate = value.lastAssessmentDate;
  
  // Normalize each field (trim strings, ensure types, provide defaults)
  const idValue = isNonEmptyString(id) ? id.trim() : "";
  const nameValue = isNonEmptyString(name) ? name.trim() : "";
  const emailValue = isNonEmptyString(email) ? email.trim() : "";
  const participationValue = isFiniteNumber(participationScore) ? participationScore : 0;
  const completionValue = isFiniteNumber(assignmentCompletionRate) ? assignmentCompletionRate : 0;
  const notesValue = typeof teacherNotes === "string" ? teacherNotes : "";
  const trendValue = performanceTrend as PerformanceTrend;  // Cast (we validate below)
  const lastAssessmentValue = isValidDate(lastAssessmentDate) ? lastAssessmentDate : "";

  // Validate id field
  if (!isNonEmptyString(id)) {
    errors.push("id must be a non-empty string");
  }
  
  // Validate name field
  if (!isNonEmptyString(name)) {
    errors.push("name must be a non-empty string");
  }
  
  // Validate email field (must be non-empty AND match pattern)
  if (!isNonEmptyString(email) || !EMAIL_PATTERN.test(email)) {
    errors.push("email must be a valid address");
  }

  // Validate grades array
  const validatedGrades: Grade[] = [];  // Will hold successfully validated grades
  
  // Check if grades exists and is a non-empty array
  if (!Array.isArray(grades) || grades.length === 0) {
    errors.push("grades must be a non-empty array");
  } else {
    // grades is valid, now validate each individual grade
    grades.forEach((grade, gradeIndex) => {
      const result = validateGrade(grade, gradeIndex);  // Use helper function
      
      if (result.ok) {
        // This grade is valid, add it to our validated array
        validatedGrades.push(result.value);
      } else {
        // This grade failed validation, add its errors to our error list
        errors.push(...result.errors);  // Spread operator unpacks the array
      }
    });
  }

  // Validate participationScore (must be 1-10)
  if (!inRange(participationScore, 1, 10)) {
    errors.push("participationScore must be a number between 1 and 10");
  }
  
  // Validate assignmentCompletionRate (must be 0-100)
  if (!inRange(assignmentCompletionRate, 0, 100)) {
    errors.push("assignmentCompletionRate must be a number between 0 and 100");
  }
  
  // Validate teacherNotes (just check type, can be empty string)
  if (typeof teacherNotes !== "string") {
    errors.push("teacherNotes must be a string");
  }
  
  // Validate performanceTrend (parseTrend returns undefined if invalid)
  if (!performanceTrend) {
    errors.push("performanceTrend must be improving, stable, or declining");
  }
  
  // Validate lastAssessmentDate (must be parseable date string)
  if (!isValidDate(lastAssessmentDate)) {
    errors.push("lastAssessmentDate must be a valid date string");
  }

  // If ANY validation failed, return all collected errors
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Success! All validation passed
  // Return a properly typed Student object with all normalized values
  return {
    ok: true,
    value: {
      id: idValue,
      name: nameValue,
      email: emailValue,
      grades: validatedGrades,
      participationScore: participationValue,
      assignmentCompletionRate: completionValue,
      teacherNotes: notesValue,
      performanceTrend: trendValue,
      lastAssessmentDate: lastAssessmentValue,
    },
  };
}

/**
 * Validate a JSON payload that should be a list of students.
 * This is the entry point for validating the entire students.json file.
 */
export function validateStudents(data: unknown): { valid: Student[]; errors: string[] } {
  const errors: string[] = [];  // Collect all errors
  const valid: Student[] = [];  // Collect all valid students

  // First check: is data even an array?
  if (!Array.isArray(data)) {
    return {
      valid,  // Empty array (no valid students)
      errors: ["students.json must be an array of student objects"],
    };
  }

  // data is an array, now validate each item
  data.forEach((value, index) => {
    // Validate this student
    const result = validateStudent(value, index);
    
    if (result.ok) {
      // Student is valid, add to valid array
      valid.push(result.value);
    } else {
      // Student failed validation
      // Prefix each error with the array index for clarity
      result.errors.forEach((error) => {
        errors.push(`students[${index}]: ${error}`);
      });
    }
  });

  // Return both valid students and all errors
  // This allows the app to:
  // 1. Process valid students even if some are invalid
  // 2. Log/report all validation issues
  return { valid, errors };
}