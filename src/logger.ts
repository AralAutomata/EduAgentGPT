// Import the LogLevel type we defined in types.ts
import type { LogLevel } from "./types.ts";

// LEVELS maps each log level to a numeric priority
// Higher numbers = more severe
// This allows comparison: is "warn" (30) more severe than "info" (20)? Yes!
const LEVELS: Record<LogLevel, number> = {
  debug: 10,  // Lowest priority - detailed debugging info
  info: 20,   // Normal operational messages
  warn: 30,   // Warning - something concerning but not broken
  error: 40,  // Highest priority - something is broken
};

// Logger class encapsulates all logging functionality
export class Logger {
  // Private field (# prefix) - can only be accessed inside this class
  // Stores the minimum level to log (everything below this is ignored)
  #level: LogLevel;

  // Constructor is called when you create a new Logger instance
  // Example: const logger = new Logger("info");
  constructor(level: LogLevel) {
    this.#level = level;  // Set the minimum log level
  }

  // Public method to log DEBUG level messages
  // meta is an optional object with additional context
  debug(message: string, meta?: Record<string, unknown>) {
    this.#log("debug", message, meta);  // Delegate to private #log method
  }

  // Public method to log INFO level messages
  info(message: string, meta?: Record<string, unknown>) {
    this.#log("info", message, meta);
  }

  // Public method to log WARN level messages
  warn(message: string, meta?: Record<string, unknown>) {
    this.#log("warn", message, meta);
  }

  // Public method to log ERROR level messages
  error(message: string, meta?: Record<string, unknown>) {
    this.#log("error", message, meta);
  }

  // Private method that does the actual logging work
  // All public methods call this
  #log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    // Check if this message should be logged
    // If the message level (e.g., debug=10) is less than minimum level (e.g., info=20)
    // then skip it (return early)
    if (LEVELS[level] < LEVELS[this.#level]) return;
    
    // Create ISO 8601 timestamp, e.g., "2026-01-07T10:30:45.123Z"
    const timestamp = new Date().toISOString();
    
    // If meta was provided, convert it to JSON string
    // Otherwise, use empty string
    const payload = meta ? ` ${JSON.stringify(meta)}` : "";
    
    // Construct the log line in format:
    // [2026-01-07T10:30:45.123Z] INFO Starting analysis {"count": 10}
    const line = `[${timestamp}] ${level.toUpperCase()} ${message}${payload}`;

    // Output to appropriate console method based on severity
    if (level === "error") {
      console.error(line);  // Errors go to stderr (red in many terminals)
    } else if (level === "warn") {
      console.warn(line);   // Warnings go to stderr (yellow in many terminals)
    } else {
      console.log(line);    // Info and debug go to stdout
    }
  }
}

// Factory function to create a Logger instance
// This is a convenience function - you could also use `new Logger(level)` directly
export function createLogger(level: LogLevel) {
  return new Logger(level);
}

// Usage example (not in the actual file):
// const logger = createLogger("info");
// logger.debug("Won't show");  // Skipped (debug < info)
// logger.info("Starting");     // ✓ Shows
// logger.warn("Problem!");     // ✓ Shows
// logger.error("Failed!");     // ✓ Shows (red text)