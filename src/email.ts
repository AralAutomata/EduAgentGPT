// Import the join function from Deno's standard library for path manipulation
// join() safely combines path segments: join("data", "emails") → "data/emails"
import { join } from "@std/path";

// Import the types we need
import type { AppConfig, Student } from "./types.ts";
import type { Logger } from "./logger.ts";

/**
 * EmailContent represents a complete email ready to be sent
 * This interface defines what information an email needs
 */
export interface EmailContent {
  to: string;       // Recipient email address, e.g., "student@school.edu"
  subject: string;  // Email subject line
  text: string;     // Plain text version of email body (for email clients that don't support HTML)
  html: string;     // HTML version of email body (for rich formatting)
}

// Why both text and html? 
// Some email clients (especially accessibility tools) prefer plain text
// Most modern clients prefer HTML for formatting
// Best practice is to provide both

/**
 * Build an email for a student with their personalized insights
 * 
 * Takes:
 * - student: The student's data (for name and email)
 * - insights: The AI-generated message text (already formatted by renderStudentMessage)
 * 
 * Returns: Complete EmailContent ready to send
 */
export function buildStudentEmail(student: Student, insights: string): EmailContent {
  // Build a personalized subject line
  // Template literal (backticks) allows embedding variables with ${}
  const subject = `Your learning update and next steps, ${student.name}`;
  
  // Remove any leading/trailing whitespace from insights
  // This ensures clean formatting even if the insights have extra newlines
  const trimmedInsights = insights.trim();
  
  // Build the plain text version of the email
  // We use an array of lines and join them with newline characters
  // This is cleaner than concatenating strings with + or template literals
  const text = [
    `Hi ${student.name},`,          // Personalized greeting
    "",                              // Blank line for spacing
    "Here is a supportive summary of your recent progress, plus a few next steps:",
    "",
    trimmedInsights,                 // The main content (strengths, strategies, etc.)
    "",
    "You can do this. Pick one focus to try this week and build from there.",
    "Your Educational Assistant",    // Signature
  ].join("\n");  // Join all lines with newline characters
  
  // Build the HTML version of the email
  // We wrap everything in paragraph tags for proper HTML structure
  // .replace(/\n/g, "<br />") converts newlines to HTML line breaks
  // The "g" flag means "global" - replace ALL newlines, not just the first
  const html = `
    <p>Hi ${student.name},</p>
    <p>Here is a supportive summary of your recent progress, plus a few next steps:</p>
    <p>${trimmedInsights.replace(/\n/g, "<br />")}</p>
    <p>You can do this. Pick one focus to try this week and build from there.<br />Your Educational Assistant</p>
  `;

  // Return the complete email object
  return {
    to: student.email,  // Where to send it
    subject,            // Subject line
    text,               // Plain text version
    html,               // HTML version
  };
}

/**
 * Build an email for the teacher with the class summary
 * 
 * Similar to buildStudentEmail but simpler (no personalization needed)
 */
export function buildTeacherEmail(teacherEmail: string, summary: string): EmailContent {
  const subject = "Class performance summary";
  
  // Simple text format for teacher
  const text = `Hello,\n\n${summary}\n\nBest,\nEducational Assistant`;
  
  // HTML version (convert newlines to <br /> tags)
  const html = `
    <p>Hello,</p>
    <p>${summary.replace(/\n/g, "<br />")}</p>
    <p>Best,<br />Educational Assistant</p>
  `;

  return {
    to: teacherEmail,
    subject,
    text,
    html,
  };
}

/**
 * Simulate email delivery locally by logging and optionally writing to disk.
 * 
 * In a production system, this function would call an email API like:
 * - Resend.send()
 * - SendGrid.send()
 * - AWS SES.sendEmail()
 * 
 * But for development and testing, we save emails as text files.
 * This lets you review the content before sending real emails.
 * 
 * Benefits of local file approach:
 * 1. No accidental emails to real students during development
 * 2. Easy to review what would be sent
 * 3. No API costs during testing
 * 4. Can version control example outputs
 */
export async function sendEmail(
  config: AppConfig,    // Application configuration
  email: EmailContent,  // The email to send
  logger: Logger,       // For logging operations
): Promise<string | null> {  // Returns path where email was saved, or null if not saved
  
  // ALWAYS log that we generated an email
  // This creates an audit trail even if file writing fails
  logger.info("Local email generated", { to: email.to, subject: email.subject });
  
  // Log the full content at debug level (only shows if LOG_LEVEL=debug)
  // We don't want to spam logs in production, but during development this is helpful
  logger.debug("Local email content", { text: email.text });

  // Check if we should save to disk
  // If EMAIL_OUT_DIR is not set, we just log and return
  if (!config.emailOutDir) {
    return null;  // Not saving to disk
  }

  // STEP 1: Create a safe filename from the recipient email
  // Email addresses can contain characters that aren't safe in filenames
  // like @ : / etc., so we replace them with underscores
  // Example: "student@school.edu" becomes "student_school_edu"
  const safeRecipient = email.to.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Regex breakdown:
  // [^...] means "NOT any of these characters"
  // a-zA-Z0-9._- means letters, numbers, dots, underscores, hyphens
  // g flag means "global" - replace all occurrences
  
  // STEP 2: Create a timestamp for the filename
  // We use ISO format and replace colons and dots to make it filesystem-safe
  // Example: "2026-01-07T10:30:45.123Z" becomes "2026-01-07T10-30-45-123Z"
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  
  // STEP 3: Build the email file content
  // We format it like a real email with headers
  const output = [
    `From: ${config.emailFrom}`,   // Who it's from
    `To: ${email.to}`,              // Who it's to
    `Subject: ${email.subject}`,    // Subject line
    "",                              // Blank line separates headers from body
    email.text,                      // Email body (plain text version)
    "",                              // Trailing blank line
  ].join("\n");

  // STEP 4: Try to save the file
  try {
    // First, ensure the output directory exists
    // recursive: true means "create parent directories if needed"
    // Like mkdir -p in Unix
    await Deno.mkdir(config.emailOutDir, { recursive: true });
    
    // Write the email to a unique file
    // We use a helper function to handle race conditions
    const path = await writeUniqueEmailFile(
      config.emailOutDir,
      `${timestamp}-${safeRecipient}`,  // Base filename
      output                             // Content to write
    );
    
    // Log success with the file path
    logger.info("Local email saved", { path });
    return path;  // Return the path for the caller to track
    
  } catch (error) {
    // If anything goes wrong, log the error but don't crash
    // The email generation still happened (we logged it above)
    // We just couldn't save it to disk
    logger.error("Failed to save local email", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;  // Couldn't save to disk
}

/**
 * Write a file with a unique name to avoid collisions
 * 
 * Why we need this:
 * If two emails are generated at EXACTLY the same millisecond,
 * they'd have the same timestamp. This could cause file overwrites
 * or race conditions.
 * 
 * Solution: Add a random UUID to make each filename unique
 * 
 * This function tries up to 5 times to create a unique file.
 * If it still fails after 5 attempts, something is seriously wrong.
 */
async function writeUniqueEmailFile(
  dir: string,        // Directory to write to
  baseName: string,   // Base filename (timestamp-recipient)
  contents: string    // Content to write
): Promise<string> {  // Returns the full path where file was written
  
  // Create a TextEncoder to convert string to bytes
  // Deno's file API works with Uint8Array (bytes), not strings
  const encoder = new TextEncoder();

  // Try up to 5 times to create a unique file
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Generate a random UUID (Universally Unique Identifier)
    // Example: "550e8400-e29b-41d4-a716-446655440000"
    // The crypto.randomUUID() method generates a v4 UUID
    // Collision probability is astronomically low (1 in 5.3 × 10^36)
    const uniqueSuffix = crypto.randomUUID();
    
    // Build the complete filename
    // Example: "2026-01-07T10-30-45-123Z-student_school_edu-550e8400-e29b-41d4-a716-446655440000.txt"
    const fileName = `${baseName}-${uniqueSuffix}.txt`;
    
    // Build the full path
    // join() safely combines path segments with proper separators
    const path = join(dir, fileName);

    try {
      // Try to open the file for writing
      // createNew: true means "fail if file already exists"
      // This prevents overwriting existing files
      const file = await Deno.open(path, { write: true, createNew: true });
      
      try {
        // Convert string to bytes and write to file
        await file.write(encoder.encode(contents));
        
      } finally {
        // ALWAYS close the file, even if write fails
        // This prevents file descriptor leaks
        // "finally" blocks run whether try succeeds or fails
        file.close();
      }
      
      // Success! Return the path
      return path;
      
    } catch (error) {
      // Check if the error is specifically "file already exists"
      if (error instanceof Deno.errors.AlreadyExists) {
        // This is expected occasionally (race condition)
        // Just try again with a new UUID
        continue;
      }
      
      // Any other error is unexpected (permissions, disk full, etc.)
      // Re-throw it so the caller can handle it
      throw error;
    }
  }

  // If we tried 5 times and still couldn't create a unique file,
  // something is very wrong (maybe the filesystem is broken?)
  throw new Error("Failed to create a unique email file");
}

// DESIGN PATTERN: Resilient File Writing
//
// This file demonstrates several important patterns:
//
// 1. DEFENSIVE PROGRAMMING: Check if directory exists before writing
// 2. UNIQUE IDENTIFIERS: Use UUIDs to prevent collisions
// 3. ATOMIC OPERATIONS: createNew flag ensures we don't overwrite
// 4. RESOURCE CLEANUP: Always close files in finally blocks
// 5. GRACEFUL DEGRADATION: Log errors but don't crash the app
// 6. AUDIT TRAIL: Log both success and failure
//
// These patterns make your code production-ready and debuggable.