import { load } from "@std/dotenv";
// ^ Loads environment variables from a .env file into Deno.env.
//   This is optional: if you don't have a .env file, your code still works
//   (you handle the NotFound case later).

import { analyzeStudent, buildTeacherSummary } from "./analyzer.ts";
// ^ analyzeStudent(student) -> deterministic metrics/risk/strengths/weaknesses.
// ^ buildTeacherSummary(analyses) -> class-level summary for teacher.

import { createAgent } from "./agent.ts";
// ^ createAgent(...) builds your LangChain/OpenAI wrapper that generates JSON insights.

import { buildStudentEmail, buildTeacherEmail, sendEmail } from "./email.ts";
// ^ buildStudentEmail/buildTeacherEmail take content and create an Email object.
// ^ sendEmail in your MVP writes/prints emails locally (simulation) and returns a file path.

import { createLogger } from "./logger.ts";
// ^ tiny logger with log levels: debug/info/warn/error.

import {
  buildFallbackStudentInsights,
  buildFallbackTeacherInsights,
  parseStudentInsights,
  parseTeacherInsights,
  renderStudentMessage,
  renderTeacherMessage,
} from "./insights.ts";
// ^ This file is the "safety layer":
//   - parseStudentInsights/parseTeacherInsights validates the LLM JSON.
//   - renderStudentMessage/renderTeacherMessage turns structured insights into readable text.
//   - buildFallback... produces deterministic insights if the LLM output is invalid.

import { loadTeacherRules } from "./rules.ts";
// ^ Optionally loads teacher preferences ("tone", "focusAreas", etc.) from a JSON file.

import { HistoryStore } from "./storage.ts";
// ^ SQLite history store. Records runs + per-student messages + teacher summary.

import { validateStudents } from "./validator.ts";
// ^ Validates and sanitizes parsed JSON before any analysis happens.

import type { AppConfig, Student } from "./types.ts";
// ^ Types only (compile-time). No runtime cost.
// ^ AppConfig is the shape of your config object.
// ^ Student is the shape of each student record.


async function loadConfig(): Promise<AppConfig> {
  // ^ This function collects all runtime configuration in one place.
  //   It's a good habit: other code can assume config is present and typed.
  //   It also concentrates default values so they are easy to audit and adjust.

  try {
    await load({ export: true, allowEmptyValues: true });
    // ^ load() reads .env if present.
    //   export: true -> writes variables into Deno.env so the rest of the app can read them.
    //   allowEmptyValues: true -> doesn't crash if a key exists with empty string.
  } catch (error) {
    // ^ If there's no .env file, std/dotenv will throw NotFound.
    //   You do NOT want that to crash the app.
    if (!(error instanceof Deno.errors.NotFound)) {
      // ^ For any other error type (permission, parsing, etc.), rethrow because it's real.
      throw error;
    }
  }

  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  // ^ You require the OpenAI API key. If missing, the program should fail early (clear error).
  //   Without it, the agent cannot call the LLM at all.

  const openAiModel = Deno.env.get("OPENAI_MODEL") ?? "gpt-4";
  // ^ Model name is optional; default is gpt-4.
  //   This is passed into the LangChain ChatOpenAI wrapper.

  const openAiBaseUrl = Deno.env.get("OPENAI_BASE_URL") ?? undefined;
  // ^ Optional override for OpenAI base URL (useful for proxies or compatible endpoints).

  const emailFrom = Deno.env.get("EMAIL_FROM") ?? "Edu Assistant <noreply@local>";
  // ^ "From" header used when building emails.

  const teacherEmail = Deno.env.get("TEACHER_EMAIL") ?? "teacher@example.com";
  // ^ Teacher recipient (default is placeholder).

  const emailOutDir = Deno.env.get("EMAIL_OUT_DIR") ?? undefined;
  // ^ If set, sendEmail will write email files to this directory.
  //   If not set, email delivery is still simulated via logs only.

  const historyDbPath = Deno.env.get("HISTORY_DB_PATH") ?? "data/history.db";
  // ^ Where SQLite database lives.

  const teacherRulesPath = Deno.env.get("TEACHER_RULES_PATH") ?? undefined;
  // ^ Optional JSON file path for teacher preferences.

  const studentsJsonPath = Deno.env.get("STUDENTS_JSON_PATH") ?? "students.json";
  // ^ Where students.json is read from.

  const scheduleCron = Deno.env.get("SCHEDULE_CRON") ?? undefined;
  // ^ If provided, you'll use Deno.cron to schedule runs.
  //   Cron takes precedence over interval-based scheduling.

  const scheduleIntervalMin = parseNumber(Deno.env.get("SCHEDULE_INTERVAL_MIN"), 30);
  // ^ If cron isn't provided, fall back to interval minutes.
  //   parseNumber ensures a positive number; otherwise uses fallback 30.

  const logLevel = (Deno.env.get("LOG_LEVEL") ?? "info") as AppConfig["logLevel"];
  // ^ Logger level is a string; you cast it to match your LogLevel union.
  //   (Note: casting doesn't validate; it trusts input. Your logger is still safe, but
  //    if logLevel is unknown it might behave unexpectedly—could be improved later.)

  return {
    // ^ Return an object that matches AppConfig interface.
    //   This object is passed to all runtime components (agent, storage, email).
    openAiApiKey,
    openAiModel,
    openAiBaseUrl,
    emailFrom,
    teacherEmail,
    emailOutDir,
    historyDbPath,
    teacherRulesPath,
    scheduleCron,
    scheduleIntervalMin,
    studentsJsonPath,
    logLevel,
  };
}


function requireEnv(key: string): string {
  // ^ Utility to enforce that an environment variable exists.
  //   This keeps configuration failures loud and early instead of silent.

  const value = Deno.env.get(key);
  // ^ Reads from environment.

  if (!value) {
    // ^ If missing or empty, fail fast. This prevents confusing runtime errors later.
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}


function parseNumber(value: string | undefined, fallback: number): number {
  // ^ Safe parsing helper for numeric env vars.
  //   Used for interval scheduling to avoid NaN or zero values.

  if (!value) return fallback;
  // ^ If value is undefined/empty string, use fallback.

  const parsed = Number(value);
  // ^ Convert string to number.

  if (Number.isNaN(parsed) || parsed <= 0) {
    // ^ Reject NaN and non-positive numbers, return fallback.
    return fallback;
  }

  return parsed;
}


async function loadStudents(
  path: string,
  logger: ReturnType<typeof createLogger>,
): Promise<{ students: Student[]; totalCount: number }> {
  // ^ Reads and validates students.json.
  //   Returns:
  //   - students: ONLY valid records
  //   - totalCount: how many were in the original file (valid + invalid)
  //   This split lets you process good data while still reporting issues.

  try {
    const data = await Deno.readTextFile(path);
    // ^ Read file as text.

    const parsed = JSON.parse(data) as unknown;
    // ^ Parse JSON into unknown: we don't trust the shape yet.

    const { valid, errors } = validateStudents(parsed);
    // ^ validateStudents checks every record and returns:
    //   - valid: Student[]
    //   - errors: list of human-friendly messages about what's wrong

    const totalCount = Array.isArray(parsed) ? parsed.length : 0;
    // ^ If parsed isn't an array, totalCount becomes 0.

    if (errors.length > 0) {
      // ^ You don't crash on bad data. You warn and continue with valid records.
      logger.warn("Student data validation issues", { count: errors.length });
      errors.forEach((error) => logger.warn("Validation error", { error }));
    }

    return { students: valid, totalCount };
  } catch (error) {
    // ^ Any file/JSON parse error ends up here.
    logger.error("Failed to load student data", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}


/**
 * Run a single analysis + email cycle.
 */
async function runOnce(config: AppConfig, store: HistoryStore) {
  // ^ This is the “one scheduled job execution”.
  //   It:
  //   - loads students
  //   - analyzes them
  //   - asks LLM for insights
  //   - sends emails
  //   - stores results in SQLite
  //   - sends teacher summary

  const logger = createLogger(config.logLevel);
  logger.info("Starting analysis cycle");

  const runId = crypto.randomUUID();
  // ^ Unique id for this run so DB records can group messages by run.
  //   Also useful for correlating logs and debugging a specific cycle.

  const startedAt = new Date().toISOString();
  // ^ For audit/history.
  //   Stored in the runs table and used to order runs over time.

  const { students, totalCount } = await loadStudents(config.studentsJsonPath, logger);
  logger.info("Loaded student data", { count: students.length });

  store.startRun({
    // ^ Store a run record in DB.
    runId,
    startedAt,
    studentCount: totalCount,
    validStudentCount: students.length,
  });

  if (students.length === 0) {
    // ^ If everything was invalid, stop early.
    logger.warn("No valid students available for analysis");
    store.finishRun(runId, "no_valid_students");
    return;
  }

  const agent = createAgent(config, logger, config.teacherRules);
  // ^ Builds your LangChain/OpenAI prompt pipeline.
  //   teacherRules are injected so the AI aligns with teacher preferences.
  //   The agent is created once per run and reused for all students.

  const analyses: ReturnType<typeof analyzeStudent>[] = [];
  // ^ We'll collect analyses that succeeded.
  //   This is important because teacher summary only makes sense if at least one analysis succeeded.
  //   It also avoids repeating analysis work when building the teacher summary.

  for (const student of students) {
    // ^ Process students one by one.
    //   (Later you could parallelize, but sequential is simpler + safer for API limits.)
    //   Sequential processing also makes logs easier to trace per student.

    let analysis: ReturnType<typeof analyzeStudent>;
    try {
      analysis = analyzeStudent(student);
      // ^ Deterministic calculation: averages, weak subjects, risk, etc.
      analyses.push(analysis);
    } catch (error) {
      // ^ If analysis fails, you record it and continue to next student.
      logger.error("Failed to analyze student", {
        studentId: student.id,
        error: error instanceof Error ? error.message : String(error),
      });

      store.recordStudentMessage({
        // ^ Persist failure in DB for debugging.
        runId,
        studentId: student.id,
        status: "analysis_failed",
        error: error instanceof Error ? error.message : String(error),
        usedFallback: false,
      });

      continue;
    }

    try {
      const rawInsights = await agent.generateStudentInsights(analysis);
      // ^ This calls the LLM and returns a string.
      //   You EXPECT it to be JSON, but you do not blindly trust it.

      const parsed = parseStudentInsights(rawInsights);
      // ^ parseStudentInsights returns an object like:
      //   { ok: true, value: StudentInsights } OR { ok: false, errors: string[] }

      const usedFallback = !parsed.ok;

      if (!parsed.ok) {
        // ^ If the LLM returned invalid JSON or wrong shape, log it and fall back.
        logger.warn("Student insights JSON invalid; using fallback", {
          studentId: analysis.student.id,
          errors: parsed.errors,
        });
      }

      const insights = parsed.ok
        ? parsed.value
        : buildFallbackStudentInsights(analysis, config.teacherRules);
      // ^ Either use the AI output (validated) or a deterministic fallback.

      const message = renderStudentMessage(insights);
      // ^ Turn structured insights into a friendly email text.

      const email = buildStudentEmail(analysis.student, message);
      // ^ Wrap message into an Email object: to, subject, body, html version, etc.

      const emailPath = await sendEmail(config, email, logger);
      // ^ In your MVP: prints + optionally writes to disk and returns path.
      //   The path is stored for audit/debug even if the email is not truly sent.

      store.recordStudentMessage({
        // ^ Save everything so you have an audit trail.
        runId,
        studentId: analysis.student.id,
        analysis,
        insights,
        emailSubject: email.subject,
        emailPath,
        status: "sent",
        usedFallback,
      });
    } catch (error) {
      // ^ This catches errors from:
      //   - calling the LLM
      //   - parsing/validating insights
      //   - rendering email
      //   - writing/sending email
      logger.error("Failed to process student", {
        studentId: analysis.student.id,
        error: error instanceof Error ? error.message : String(error),
      });

      store.recordStudentMessage({
        runId,
        studentId: analysis.student.id,
        analysis,
        status: "insights_failed",
        error: error instanceof Error ? error.message : String(error),
        usedFallback: false,
      });
    }
  }

  if (analyses.length === 0) {
    // ^ If all students failed analysis, no teacher summary.
    logger.warn("No successful analyses; skipping teacher summary");
    store.finishRun(runId, "no_successful_analyses");
    return;
  }

  try {
    const teacherSummary = buildTeacherSummary(analyses);
    // ^ Deterministic “class snapshot” compiled from analyses.

    const rawSummary = await agent.generateTeacherSummary(teacherSummary);
    // ^ LLM generates TeacherInsights JSON.

    const parsed = parseTeacherInsights(rawSummary);
    // ^ Validate the JSON output shape.

    const usedFallback = !parsed.ok;

    if (!parsed.ok) {
      logger.warn("Teacher summary JSON invalid; using fallback", { errors: parsed.errors });
    }

    const insights = parsed.ok
      ? parsed.value
      : buildFallbackTeacherInsights(teacherSummary, config.teacherRules);
    // ^ Use validated AI output or fallback.

    const message = renderTeacherMessage(insights);
    // ^ Convert structured teacher insights into readable message.

    const teacherEmail = buildTeacherEmail(config.teacherEmail, message);
    // ^ Wrap message into teacher email object.
    //   This uses a generic subject and a teacher-specific recipient.

    const emailPath = await sendEmail(config, teacherEmail, logger);
    // ^ Write teacher email simulation output.

    store.recordTeacherMessage({
      // ^ Persist for history/audit.
      runId,
      summary: teacherSummary,
      insights,
      emailSubject: teacherEmail.subject,
      emailPath,
      status: "sent",
      usedFallback,
    });
  } catch (error) {
    // ^ If teacher summary fails, you still record that failure.
    logger.error("Failed to send teacher summary", {
      error: error instanceof Error ? error.message : String(error),
    });

    store.recordTeacherMessage({
      runId,
      summary: buildTeacherSummary(analyses),
      status: "summary_failed",
      error: error instanceof Error ? error.message : String(error),
      usedFallback: false,
    });
  }

  store.finishRun(runId, "completed");
  // ^ Mark run completed in DB.
  //   This is the final state for a successful end-to-end cycle.

  logger.info("Analysis cycle completed");
}


async function main() {
  // ^ Entry function that loads config, initializes storage, sets up scheduler.
  //   Runs once at startup and then relies on scheduling to repeat.

  const config = await loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info("Local email simulation enabled");
  // ^ This message is a hint that you're not sending real emails yet.

  config.teacherRules = await loadTeacherRules(config.teacherRulesPath, logger);
  // ^ Optional: adds teacher preferences into config so they’re available everywhere.
  //   This is kept on config so both the agent and fallback builders can use it.

  const store = new HistoryStore(config.historyDbPath, logger);
  // ^ Opens SQLite DB and ensures tables exist.

  const scheduleRun = () => {
    // ^ Wrap runOnce so it can be passed to cron/interval safely.
    //   Captures config/store once and reuses them for each scheduled run.
    runOnce(config, store).catch((error) => {
      // ^ Prevent an unhandled promise rejection from killing the scheduler.
      logger.error("Scheduled run failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  logger.info("Starting scheduler");
  scheduleRun();
  // ^ Run immediately at startup, so you don’t have to wait for the first interval.

  if (config.scheduleCron) {
    Deno.cron("student-analysis", config.scheduleCron, scheduleRun);
    // ^ If you provide a cron string, Deno schedules the callback.
    //   The first argument is a name label.
    //   In this mode, interval scheduling is disabled.

    logger.info("Cron schedule configured", { cron: config.scheduleCron });
  } else {
    const intervalMs = config.scheduleIntervalMin * 60 * 1000;
    // ^ Convert minutes to milliseconds.
    //   This keeps configuration in human-friendly minutes.

    setInterval(scheduleRun, intervalMs);
    // ^ Run repeatedly every N minutes.

    logger.info("Interval schedule configured", { minutes: config.scheduleIntervalMin });
  }
}


if (import.meta.main) {
  // ^ This means: “only run main() if this file is executed directly”
  //   (and not imported as a module by another file).
  //   This keeps tests or other modules from auto-starting the scheduler.

  main().catch((error) => {
    // ^ Top-level fatal error handler.
    console.error("Fatal error", error);
  });
}
