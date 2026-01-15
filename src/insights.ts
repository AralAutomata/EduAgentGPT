// Import type definitions we need
import type { 
  StudentAnalysis, 
  StudentInsights, 
  TeacherInsights, 
  TeacherSummary, 
  TeacherPreferences 
} from "./types.ts";

// Define a generic type for validation results (same pattern as validator.ts)
// This lets us return either success with data or failure with errors
type ValidationResult<T> = 
  | { ok: true; value: T }          // Success case
  | { ok: false; errors: string[] }; // Failure case

/**
 * Safely extract a string from unknown data, with length limit
 * Returns undefined if invalid
 * 
 * This is defensive programming - we can't trust the AI to always return
 * the right type or reasonable length strings
 */
function safeString(value: unknown, maxLen = 240): string | undefined {
  // First check: is it even a string?
  if (typeof value !== "string") return undefined;
  
  // Remove leading/trailing whitespace
  const trimmed = value.trim();
  
  // Check if it's empty after trimming
  if (!trimmed) return undefined;
  
  // If it's too long, truncate it
  // This prevents the AI from writing essays when we want short insights
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/**
 * Validate and normalize an array of strings
 * Ensures we have between min and max items, all valid strings
 * 
 * Example: We want 1-3 strengths, not zero strengths or fifty strengths
 */
function normalizeStringArray(
  value: unknown,      // The value to validate
  min: number,         // Minimum required items
  max: number,         // Maximum allowed items
  label: string        // Field name for error messages
): ValidationResult<string[]> {
  // First check: is it even an array?
  if (!Array.isArray(value)) {
    return { ok: false, errors: [`${label} must be an array`] };
  }

  // Clean the array:
  const cleaned = value
    // 1. Convert each item to a safe string (returns string or undefined)
    .map((item) => safeString(item, 180))
    // 2. Filter out undefined values (Boolean is a type guard here)
    // Boolean(undefined) = false, Boolean(string) = true
    .filter((item): item is string => Boolean(item));

  // Check if we have enough items after cleaning
  if (cleaned.length < min) {
    return { 
      ok: false, 
      errors: [`${label} must include at least ${min} item(s)`] 
    };
  }

  // Return success with the cleaned array, truncated to max length
  // .slice(0, max) takes first max items
  return { ok: true, value: cleaned.slice(0, max) };
}

/**
 * Extract a JSON object from text that might have extra content
 * 
 * Why we need this: The AI sometimes returns:
 * "Here's the JSON you asked for:\n{\n  \"field\": \"value\"\n}\nLet me know if you need changes!"
 * 
 * We need to extract just the {...} part
 */
function extractJsonObject(text: string): string | null {
  // Find the first opening brace
  const start = text.indexOf("{");
  
  // Find the last closing brace
  // We use lastIndexOf because we want the final closing brace
  const end = text.lastIndexOf("}");
  
  // Check if we found both braces and they're in the right order
  if (start === -1 || end === -1 || end <= start) return null;
  
  // Extract the substring from start to end (inclusive of end)
  // slice(start, end + 1) includes the character at position end
  return text.slice(start, end + 1);
}

/**
 * Parse and validate student insights JSON returned by the LLM.
 * 
 * This function is crucial because:
 * 1. The AI might return invalid JSON
 * 2. The AI might forget required fields
 * 3. The AI might return wrong types
 * 4. The AI might write way too much text
 * 
 * We validate EVERYTHING before trusting it
 */
export function parseStudentInsights(raw: string): ValidationResult<StudentInsights> {
  // STEP 1: Try to extract JSON from the raw text
  const jsonCandidate = extractJsonObject(raw);
  
  // If we couldn't find a JSON object, fail immediately
  if (!jsonCandidate) {
    return { ok: false, errors: ["No JSON object found in response"] };
  }

  // STEP 2: Try to parse the JSON
  let parsed: unknown;  // We don't know what type this will be yet
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    // JSON.parse throws an error if the JSON is malformed
    // We catch it and return a friendly error message
    return { ok: false, errors: ["Invalid JSON in response"] };
  }

  // STEP 3: Check if parsed result is an object
  // JSON.parse could return a number, string, array, etc.
  // We specifically need an object with fields
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, errors: ["Response JSON must be an object"] };
  }

  // STEP 4: Cast to Record so we can access properties
  // Record<string, unknown> means "object with string keys and unknown values"
  const record = parsed as Record<string, unknown>;
  
  // STEP 5: Extract and validate each required field
  // We use safeString to validate and normalize each string field
  const positiveObservation = safeString(record.positiveObservation, 220);
  const nextStepGoal = safeString(record.nextStepGoal, 200);
  const encouragement = safeString(record.encouragement, 200);

  // Validate the array fields using our helper function
  // This returns ValidationResult<string[]> for each
  const strengthsResult = normalizeStringArray(record.strengths, 1, 3, "strengths");
  const improvementResult = normalizeStringArray(record.improvementAreas, 1, 2, "improvementAreas");
  const strategiesResult = normalizeStringArray(record.strategies, 2, 3, "strategies");

  // STEP 6: Collect all validation errors
  const errors: string[] = [];

  if (!strengthsResult.ok || !improvementResult.ok || !strategiesResult.ok) {
    return { ok: false, errors: ["Invalid student insights payload"] };
  }
  
  // Check each string field
  if (!positiveObservation) errors.push("positiveObservation must be a non-empty string");
  if (!nextStepGoal) errors.push("nextStepGoal must be a non-empty string");
  if (!encouragement) errors.push("encouragement must be a non-empty string");
  
  // Check array field results
  // If the validation failed, add those errors to our list
  if (!strengthsResult.ok) errors.push(...strengthsResult.errors);
  if (!improvementResult.ok) errors.push(...improvementResult.errors);
  if (!strategiesResult.ok) errors.push(...strategiesResult.errors);

  // STEP 7: If any validation failed, return all errors
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // STEP 8: Success! All validation passed
  // We can safely assert the types now (using "as string")
  // because we've verified they're valid
  return {
    ok: true,
    value: {
      positiveObservation: positiveObservation as string,
      strengths: strengthsResult.value,
      improvementAreas: improvementResult.value,
      strategies: strategiesResult.value,
      nextStepGoal: nextStepGoal as string,
      encouragement: encouragement as string,
    },
  };
}

/**
 * Parse and validate teacher summary JSON returned by the LLM.
 * Similar to parseStudentInsights but for teacher-facing data
 */
export function parseTeacherInsights(raw: string): ValidationResult<TeacherInsights> {
  // STEP 1: Extract JSON from raw text (same as student insights)
  const jsonCandidate = extractJsonObject(raw);
  if (!jsonCandidate) {
    return { ok: false, errors: ["No JSON object found in response"] };
  }

  // STEP 2: Parse the JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return { ok: false, errors: ["Invalid JSON in response"] };
  }

  // STEP 3: Validate it's an object
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, errors: ["Response JSON must be an object"] };
  }

  // STEP 4: Cast to Record for property access
  const record = parsed as Record<string, unknown>;
  
  // STEP 5: Validate simple string and array fields
  const classOverview = safeString(record.classOverview, 240);
  const strengthsResult = normalizeStringArray(record.strengths, 1, 4, "strengths");
  const nextStepsResult = normalizeStringArray(record.nextSteps, 2, 4, "nextSteps");

  // STEP 6: Validate the attentionNeeded array (more complex)
  // This is an array of OBJECTS, not strings, so we need custom validation
  const attentionRaw = record.attentionNeeded;
  const attentionNeeded: Array<{ name: string; reason: string }> = [];
  const attentionErrors: string[] = [];
  
  // First check: is it an array?
  if (!Array.isArray(attentionRaw)) {
    attentionErrors.push("attentionNeeded must be an array");
  } else {
    // It's an array, now validate each item
    attentionRaw.forEach((item, index) => {
      // Each item should be an object
      if (typeof item !== "object" || item === null) {
        attentionErrors.push(`attentionNeeded[${index}] must be an object`);
        return;  // Skip to next item
      }
      
      // Cast to Record to access properties
      const entry = item as Record<string, unknown>;
      
      // Extract and validate the name and reason fields
      const name = safeString(entry.name, 80);
      const reason = safeString(entry.reason, 160);
      
      // Both must be present
      if (!name || !reason) {
        attentionErrors.push(`attentionNeeded[${index}] must include name and reason`);
        return;  // Skip to next item
      }
      
      // Valid entry, add it to our clean array
      attentionNeeded.push({ name, reason });
    });
  }

  // STEP 7: Collect all errors
  const errors: string[] = [];
  if (!classOverview) errors.push("classOverview must be a non-empty string");
  if (!strengthsResult.ok) errors.push(...strengthsResult.errors);
  if (!nextStepsResult.ok) errors.push(...nextStepsResult.errors);
  if (attentionErrors.length > 0) errors.push(...attentionErrors);

  // STEP 8: Return result
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (!strengthsResult.ok || !nextStepsResult.ok) {
    return { ok: false, errors: ["Invalid teacher insights payload"] };
  }

  // Success!
  return {
    ok: true,
    value: {
      classOverview: classOverview as string,
      strengths: strengthsResult.value,
      attentionNeeded,  // Already typed correctly
      nextSteps: nextStepsResult.value,
    },
  };
}

/**
 * Render structured student insights into a plain-text message.
 * 
 * This takes the validated JSON structure and converts it to
 * a nicely formatted text email body
 */
export function renderStudentMessage(insights: StudentInsights): string {
  // Build the message as an array of lines
  // Using an array makes it easy to conditionally add/remove sections
  return [
    // Opening statement
    insights.positiveObservation,
    "",  // Blank line for spacing
    
    // Strengths section
    "Strengths:",
    // .map() converts each strength into a bullet point
    // ... spreads the array so each item becomes a separate line
    ...insights.strengths.map((item) => `- ${item}`),
    "",
    
    // Focus areas section
    "Focus areas:",
    ...insights.improvementAreas.map((item) => `- ${item}`),
    "",
    
    // Strategies section
    "Try this:",
    ...insights.strategies.map((item) => `- ${item}`),
    "",
    
    // Next step goal
    `Next step goal: ${insights.nextStepGoal}`,
    "",
    
    // Closing encouragement
    insights.encouragement,
  ].join("\n");  // Join all lines with newline characters
}

/**
 * Render structured teacher insights into a plain-text summary.
 */
export function renderTeacherMessage(insights: TeacherInsights): string {
  // Handle the attention list specially
  // If there are students needing attention, list them with reasons
  // If not, show a positive message
  const attentionLines = insights.attentionNeeded.length > 0
    ? insights.attentionNeeded.map((item) => `- ${item.name}: ${item.reason}`)
    : ["- No students flagged for immediate attention."];

  return [
    insights.classOverview,
    "",
    "Class strengths:",
    ...insights.strengths.map((item) => `- ${item}`),
    "",
    "Students needing attention:",
    ...attentionLines,  // Variable content based on whether list is empty
    "",
    "Next steps (next week):",
    ...insights.nextSteps.map((item) => `- ${item}`),
  ].join("\n");
}

/**
 * Generate a deterministic fallback student insight payload.
 * 
 * This is used when the AI returns invalid JSON or fails completely.
 * Instead of showing the student nothing, we use simple rules to
 * generate basic but helpful feedback.
 * 
 * Think of this as your "safety net" - if the AI falls off the tightrope,
 * this catches it and provides a reasonable alternative.
 */
export function buildFallbackStudentInsights(
  analysis: StudentAnalysis,        // The calculated analysis
  preferences?: TeacherPreferences  // Optional teacher preferences
): StudentInsights {
  // STEP 1: Build strengths array
  // If we calculated some strengths, use those
  // Otherwise, use a generic encouraging statement
  const strengths = analysis.strengths.length > 0
    ? analysis.strengths
    : ["You're making steady progress across your classes."];
  
  // STEP 2: Build improvement areas
  // Use calculated improvement areas, limited to 2
  // If none, provide a generic suggestion
  const improvementAreas = analysis.improvementAreas.length > 0
    ? analysis.improvementAreas.slice(0, 2)  // Take first 2 only
    : ["Keep building consistency with assignments and review routines."];

  // STEP 3: Build strategies based on specific metrics
  // This is rule-based logic - if metric X is low, suggest strategy Y
  const strategies: string[] = [];
  
  // Low assignment completion? Suggest deadline management
  if (analysis.metrics.assignmentCompletionRate < 85) {
    strategies.push("Use a checklist and finish assignments 24 hours before the deadline.");
  }
  
  // Low participation? Suggest engagement technique
  if (analysis.metrics.participationScore <= 6) {
    strategies.push("Prepare one question or comment before class and share it.");
  }
  
  // Low grades? Suggest study routine
  if (analysis.metrics.averageScore < 75) {
    strategies.push("Set a 20-minute daily review block and summarize notes in your own words.");
  }
  
  // Weak subjects? Suggest targeted practice
  if (analysis.metrics.lowestSubjects.length > 0) {
    // Extract subject names and join them with commas
    const subjects = analysis.metrics.lowestSubjects.map((grade) => grade.subject).join(", ");
    strategies.push(`Spend extra practice time on ${subjects} with short, focused sessions.`);
  }

  // STEP 4: Add teacher's preferred strategies if available
  // This personalizes the fallback based on what the teacher likes
  const preferred = preferences?.preferredStrategies?.filter((item) => item.trim()) ?? [];
  preferred.forEach((item) => {
    // Only add if we haven't hit our limit of 3
    if (strategies.length < 3) strategies.push(item);
  });

  // STEP 5: Ensure we have at least 2 strategies
  // If we're still short, add a generic one
  while (strategies.length < 2) {
    strategies.push("Ask for quick feedback from your teacher on one recent assignment.");
  }

  // STEP 6: Build the goal
  // Use teacher's class goal if available, otherwise use generic
  // .trim() removes whitespace, || provides fallback if empty
  const goal = preferences?.classGoals?.[0]?.trim() ||
    "Choose one focus area and practice it three times this week.";

  // STEP 7: Return complete StudentInsights object
  return {
    positiveObservation: strengths[0],     // Use first strength as opening
    strengths: strengths.slice(0, 3),       // Limit to 3 strengths
    improvementAreas,                       // Already limited to 2
    strategies: strategies.slice(0, 3),     // Limit to 3 strategies
    nextStepGoal: goal,                     // The goal for next week
    encouragement: "Small steps add up—keep going, and reach out if you need support.",
  };
}

/**
 * Generate a deterministic fallback teacher insight payload.
 * 
 * Similar concept to student fallback, but for teacher summaries.
 * Provides basic but useful information when AI fails.
 */
export function buildFallbackTeacherInsights(
  summary: TeacherSummary,          // The aggregated class data
  preferences?: TeacherPreferences  // Optional teacher preferences
): TeacherInsights {
  // STEP 1: Build strengths array
  // If we have top students, highlight them
  // Otherwise, give a generic positive statement
  const strengths = summary.topStudents.length > 0
    ? [`Top performers this cycle: ${summary.topStudents.join(", ")}.`]
    : ["Several students are maintaining steady performance."];

  // STEP 2: Build attention needed list
  // Convert simple name array into array of objects with reasons
  // Since this is fallback, we use a generic reason
  const attentionNeeded = summary.attentionNeeded.map((name) => ({
    name,
    reason: "Flagged for additional check-ins based on recent trends.",
  }));

  // STEP 3: Build next steps
  const nextSteps: string[] = [];
  
  // Add teacher's preferred strategies if available
  const preferred = preferences?.preferredStrategies ?? [];
  preferred.forEach((item) => {
    if (nextSteps.length < 2) nextSteps.push(item);
  });
  
  // If we don't have 2 steps yet, add generic ones
  if (nextSteps.length < 2) {
    nextSteps.push("Plan one small-group session for students needing support.");
    nextSteps.push("Highlight one success story to reinforce growth mindset.");
  }

  // STEP 4: Return complete TeacherInsights object
  return {
    // Build class overview with the calculated average
    // .toFixed(1) rounds to 1 decimal place: 84.666... becomes "84.7"
    classOverview: `Class average is ${summary.classAverage.toFixed(1)}. Overall trends are stable with a few students needing additional attention.`,
    
    strengths,
    attentionNeeded,
    nextSteps: nextSteps.slice(0, 4),  // Limit to 4 steps
  };
}

// WHY FALLBACKS ARE IMPORTANT:
//
// AI models can fail in many ways:
// 1. API is down or times out
// 2. Model returns malformed JSON
// 3. Model forgets required fields
// 4. Model's response doesn't pass validation
//
// Without fallbacks, your app would crash or send empty emails.
// With fallbacks, you always provide SOME value to users.
//
// The fallbacks aren't as good as AI-generated insights,
// but they're deterministic, reliable, and still helpful.
