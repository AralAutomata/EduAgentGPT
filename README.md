# AI Educational Assistant Agent

## Overview

This is a demo build as a MVP workshop of an automated system for analyzing student performance data and generating personalized learning insights using OpenAI language models. Processes student grades, participation metrics, and assignment completion rates to produce individualized feedback and class summaries at scheduled intervals. Please go to the /docs directory for system architecture and design diagrams and database query commands.

## Requirements

- Deno 1.40 or higher
- OpenAI API key (GPT-4 or GPT-3.5-turbo access)
- Filesystem permissions for database and file operations

## Installation

```bash
# Clone repository
git clone <repository-url>
cd ai-education-agent

# Configure environment
cp .env.example .env
# Edit .env with your OpenAI API key and settings
```

## Configuration

Required environment variables in `.env`:

- `OPENAI_API_KEY` - OpenAI API authentication key

Optional configuration:

- `OPENAI_MODEL` - Model selection (default: gpt-4)
- `EMAIL_OUT_DIR` - Directory for email file output
- `STUDENTS_JSON_PATH` - Student data file path (default: students.json)
- `TEACHER_RULES_PATH` - Teacher preferences file path
- `SCHEDULE_CRON` - Cron expression for scheduling
- `SCHEDULE_INTERVAL_MIN` - Interval in minutes (default: 30)
- `LOG_LEVEL` - Logging verbosity: debug, info, warn, error

## Student Data Format

JSON array with required fields per student:

```json
{
  "id": "S001",
  "name": "Student Name",
  "email": "student@example.com",
  "grades": [{"subject": "Math", "score": 85}],
  "participationScore": 7,
  "assignmentCompletionRate": 90,
  "teacherNotes": "Notes",
  "performanceTrend": "improving",
  "lastAssessmentDate": "2024-09-01"
}
```

## Execution

```bash
deno task start
```

System executes initial analysis immediately, then runs on configured schedule. Terminate with Control-C.

## Output

Student emails contain positive observations, strengths, improvement areas, actionable strategies, goals, and encouragement. Teacher summaries include class statistics, strengths, students requiring attention, and recommended actions.

All output saved as text files in configured directory. Complete audit trail maintained in SQLite database at `data/history.db`.

## Project Structure

The codebase follows a modular architecture where each component handles a distinct responsibility within the analysis pipeline. The `src/types.ts` file serves as the central type registry, defining all interfaces and type unions used throughout the system including Student, StudentAnalysis, TeacherSummary, and configuration structures. This centralized approach ensures type consistency across modules and provides a single source of truth for data contracts.

The `src/validator.ts` module implements comprehensive input validation at the system boundary. It verifies data types, validates value ranges, checks email format compliance, ensures required fields are present, and filters invalid records while preserving valid ones. Validation errors are collected and logged but do not halt processing of valid data, demonstrating the system's resilient design.

Performance analysis logic resides in `src/analyzer.ts` as pure computational functions with no external dependencies. The module calculates grade averages, identifies highest and lowest performing subjects, evaluates participation patterns and assignment completion rates, determines risk levels based on multiple factors, and generates structured strengths and improvement areas. This isolation from input/output operations ensures predictable behavior and facilitates unit testing.

The `src/agent.ts` module encapsulates all LangChain integration for communicating with OpenAI models. It creates configured ChatOpenAI instances with appropriate parameters, defines prompt templates that structure requests for student and teacher insights, formats analysis data and teacher preferences into prompts, invokes the language model through LangChain's pipeline abstraction, and returns raw responses for validation. This abstraction layer shields the rest of the application from OpenAI API implementation details.

Response processing occurs in `src/insights.ts` which implements defensive parsing of AI-generated content. The module extracts JSON objects from potentially verbose AI responses, validates all required fields and their types, enforces content length constraints, provides deterministic fallback logic when AI responses fail validation, and renders structured insights into human-readable text format. The fallback system uses rule-based logic to ensure students receive meaningful feedback even when AI services are unavailable or produce invalid output.

Email generation is handled by `src/email.ts` which creates formatted messages for students and teachers. The module builds email content with both plain text and HTML versions, applies personalized formatting based on recipient type, simulates email delivery by saving to local files during development, and provides a clean interface for future integration with production email services.

The `src/storage.ts` module implements the persistence layer using SQLite. It initializes database schema on first run, records complete metadata for each analysis cycle, stores student messages with full context including analysis data and generated insights, maintains teacher summaries with class-wide statistics, and provides methods for querying historical data. The audit trail supports debugging, analytics, and compliance requirements.

Teacher preference management in `src/rules.ts` loads optional configuration from JSON files. The module reads and parses teacher preference files, validates and sanitizes preference data, provides sensible defaults when preferences are not specified, and makes preferences available to the AI agent for insight generation customization.

Structured logging functionality in `src/logger.ts` provides consistent operation tracking across the system. The module implements standard log levels from debug through error, formats messages with timestamps and metadata, filters output based on configured verbosity, and routes messages to appropriate output streams based on severity.

The `src/main.ts` orchestration module coordinates all components to execute the complete analysis workflow. It loads configuration from environment variables and validates required settings, initializes the database connection and AI agent, executes analysis cycles that process all students sequentially, implements error handling at multiple levels to prevent cascading failures, manages scheduling through either cron expressions or simple intervals, and provides graceful shutdown handling to ensure data integrity.

The `tests/` directory contains unit tests organized to mirror the source structure. Test files include `analyzer_test.ts` for verifying calculation accuracy, `insights_test.ts` for validating parsing logic with both valid and malformed inputs, and `validator_test.ts` for confirming data filtering behavior. Each test uses Deno's built-in testing framework with assertion functions from the standard library.

## Testing

```bash
deno test
```

## LangChain Integration

The system leverages LangChain as an abstraction layer for interacting with large language models, specifically providing a structured interface to OpenAI's chat completion API. LangChain's ChatOpenAI class encapsulates the complexity of API authentication, request formatting, and response handling, allowing the application to focus on prompt engineering and response processing rather than HTTP client implementation.

The integration utilizes LangChain's prompt template system to construct consistent, well-structured requests to the language model. Prompt templates separate the static instruction text from dynamic data, enabling the same prompt structure to be reused across all students while injecting individualized performance data for each request. The system defines separate prompt templates for student insights and teacher summaries, each optimized for its specific output requirements.

LangChain's pipeline composition through the pipe operator creates a clean flow from prompt template through model invocation to response retrieval. This functional approach makes the data flow explicit and reduces boilerplate code that would otherwise be needed to manage the request-response cycle. The abstraction also positions the codebase to potentially support alternative language model providers in the future by swapping the ChatOpenAI instance with a different LangChain-compatible model class.

The prompt engineering strategy instructs the language model to return structured JSON rather than free-form text. This approach enables programmatic validation of responses and ensures consistency in the output format. The prompts explicitly specify required fields, expected data types, array length constraints, and content guidelines such as avoiding raw scores or negative language. By defining clear contracts for AI responses, the system can validate outputs deterministically and trigger fallback logic when responses deviate from specifications.

## Defensive Programming Approach

The architecture embodies defensive programming principles throughout its design, operating under the assumption that external systems are unreliable and data sources are potentially malformed. This philosophy manifests in multiple layers of protection that prevent individual failures from cascading into system-wide outages.

Input validation serves as the first line of defense, scrutinizing all external data before it enters the processing pipeline. The validator module checks every field in student records for type correctness, value range compliance, and logical consistency. Invalid records are filtered out and logged with detailed error messages, but valid records continue through the system unimpeded. This approach prevents malformed data from causing runtime exceptions in downstream components while maintaining visibility into data quality issues.

Error handling follows a consistent pattern where operations that might fail are wrapped in try-catch blocks with appropriate recovery strategies. Database operations log errors but do not crash the application, allowing subsequent analysis cycles to proceed even if recording one cycle's results fails. AI API calls that time out or return errors trigger fallback logic rather than propagating exceptions upward. Email generation failures are logged with full context but do not prevent teacher summary generation. This isolation of failures ensures that problems in one component or with one student do not compromise the entire batch operation.

The fallback logic for AI response processing represents another defensive strategy. When the language model produces invalid JSON, omits required fields, or generates content exceeding length constraints, the system does not simply fail. Instead, it activates rule-based insight generation that applies educational best practices to the same performance analysis data. Students whose AI-generated insights fail validation still receive meaningful, personalized feedback derived from the analytical calculations. This fallback mechanism transforms what would be a system failure into a graceful degradation of service quality.

Validation occurs at multiple system boundaries to create defense in depth. Student data is validated at file load time before processing begins. AI responses are validated immediately after retrieval before any attempt to render them into email content. Configuration values are validated at application startup to fail fast if critical settings are missing or malformed. Each validation layer operates independently, providing redundant protection against different failure modes.

The database audit trail contributes to defensive operation by creating comprehensive logs of all system activity. Every analysis cycle records its start time, completion status, student count, and any errors encountered. Every generated insight is stored with metadata indicating whether AI generation succeeded or fallback logic was employed. This detailed tracking supports post-incident analysis when problems do occur, enabling rapid identification of root causes and affected students.

Resource management practices ensure proper cleanup even when operations fail. Database connections are encapsulated in classes with explicit close methods. File handles are released in finally blocks that execute regardless of whether exceptions occur. The scheduler wraps analysis cycles in error handlers that log failures but keep the scheduling system running. These patterns prevent resource leaks and zombie processes that could accumulate over extended operation periods.

The separation of pure computational logic from input/output operations represents another defensive design choice. The analysis engine performs only mathematical calculations with no file access, network calls, or database queries. This isolation means the core analytical logic cannot fail due to external system problems, and its behavior remains predictable and testable regardless of the operational environment. The determinism of pure functions simplifies debugging and increases confidence in correctness.

## Production Deployment

Ideas to further implement production deployment are; using more secure API key storage, configuring real email service integration, establishing database backup procedures, setting up monitoring and alerting, applying proper access controls, and ensuring compliance with student data privacy regulations and policies.
