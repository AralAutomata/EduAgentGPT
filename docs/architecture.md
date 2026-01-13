┌───────────────────────────────────────────────────────────────────────────────┐
│                           Runtime / Entry (main.ts)                            │
│                                                                               │
│  ┌───────────────┐   ┌─────────────────┐   ┌───────────────────────────────┐  │
│  │  .env / Env   │   │ Teacher Rules   │   │     History Database          │  │
│  │ (dotenv.load) │   │ (rules.ts)      │   │   (storage.ts + SQLite)       │  │
│  └───────┬───────┘   └────────┬────────┘   └───────────────┬───────────────┘  │
│          │                     │                            │                  │
│          ▼                     ▼                            ▼                  │
│   ┌───────────────┐     ┌───────────────┐            ┌─────────────────────┐  │
│   │ AppConfig      │     │ TeacherPrefs  │            │  HistoryStore       │  │
│   │ (types.ts)     │     │ (types.ts)    │            │  - runs             │  │
│   └───────┬───────┘     └───────┬───────┘            │  - student_messages │  │
│           │                     │                    │  - teacher_messages │  │
│           │                     │                    └─────────┬───────────┘  │
│           │                     │                              │              │
│           ▼                     ▼                              │              │
│   ┌──────────────────────────────────────────────────────┐     │              │
│   │ Scheduler (main.ts)                                   │     │              │
│   │  - Deno.cron(name, cronExpr, scheduleRun)             │     │              │
│   │  - OR setInterval(scheduleRun, intervalMs)            │     │              │
│   └───────────────────────────────┬───────────────────────┘     │              │
│                                   │                             │              │
└───────────────────────────────────┼─────────────────────────────┼──────────────┘
                                    │                             │
                                    ▼                             │
                      ┌──────────────────────────────┐            │
                      │        runOnce() (main.ts)    │            │
                      │  - runId, timestamps          │            │
                      │  - startRun(status=running)   │────────────┘
                      └───────────────┬──────────────┘
                                      │
                                      ▼
     ┌─────────────────────────────────────────────────────────────────────┐
     │                         Input / Validation                           │
     │                                                                     │
     │  ┌──────────────────────┐         ┌──────────────────────────────┐  │
     │  │ students.json         │         │ validateStudents()           │  │
     │  │ (file)                │         │ (validator.ts)               │  │
     │  └─────────┬────────────┘         │ - validateStudent()           │  │
     │            │                      │ - validateGrade()             │  │
     │            ▼                      │ - errors[] + valid[]          │  │
     │   ┌──────────────────┐           └───────────┬───────────────────┘  │
     │   │ JSON.parse ->     │                       │                      │
     │   │ unknown           │                       │                      │
     │   └─────────┬────────┘                       │                      │
     │             │                                ▼                      │
     │             │                     ┌──────────────────────────┐     │
     │             └────────────────────▶│ Student[] (typed + clean) │     │
     │                                   └───────────┬──────────────┘     │
     └────────────────────────────────────────────────┼─────────────────────┘
                                                      │
                                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                        Per-Student Processing Loop                             │
│                                                                               │
│  FOR each Student                                                             │
│                                                                               │
│  ┌──────────────────────┐                                                    │
│  │ analyzeStudent()      │                                                    │
│  │ (analyzer.ts)         │                                                    │
│  │ - avg score           │                                                    │
│  │ - top/bottom subjects │                                                    │
│  │ - needsAttention flag │                                                    │
│  │ - riskLevel           │                                                    │
│  │ - strengths/areas     │                                                    │
│  └───────────┬──────────┘                                                    │
│              │ returns StudentAnalysis                                        │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ AI Agent (agent.ts)                                                     │  │
│  │  - ChatOpenAI(model config)                                             │  │
│  │  - studentPrompt + teacherRulesJson                                     │  │
│  │  - chain.invoke({analysisJson, teacherRulesJson})                       │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              │ raw LLM output (string, untrusted)                             │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ parseStudentInsights() (insights.ts)                                     │  │
│  │  - extractJsonObject()                                                   │  │
│  │  - JSON.parse                                                           │  │
│  │  - validate fields + array sizes                                         │  │
│  │  - clamp text lengths                                                    │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              │ ok?                                                           │
│     ┌────────┴───────────┐                                                  │
│     │                    │                                                  │
│     ▼                    ▼                                                  │
│  Insights OK        Insights Invalid                                         │
│  (StudentInsights)  -> buildFallbackStudentInsights() (insights.ts)          │
│                           (deterministic safe insights)                      │
│     │                    │                                                  │
│     └────────┬───────────┘                                                  │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ renderStudentMessage() (insights.ts)                                     │  │
│  │  - format bullets and sections                                           │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ buildStudentEmail() (email.ts)                                           │  │
│  │  - EmailContent {to, from, subject, text, html}                          │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ sendEmail() (email.ts)                                                   │  │
│  │  - log local send                                                        │  │
│  │  - optionally write .txt to EMAIL_OUT_DIR                                │  │
│  │  - return filePath?                                                      │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ recordStudentMessage() (storage.ts)                                      │  │
│  │  - INSERT student_messages                                               │  │
│  │  - store analysis_json + insights_json                                   │  │
│  │  - store status, error, used_fallback, email_subject, email_path         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  Failure routes:                                                              │
│   - analysis throw -> status="analysis_failed"                                │
│   - LLM/render/send/DB throw -> status="insights_failed"                      │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          Teacher Summary (per run)                             │
│                                                                               │
│  ┌──────────────────────────────┐                                            │
│  │ buildTeacherSummary()         │                                            │
│  │ (analyzer.ts)                 │                                            │
│  │  - classAverage               │                                            │
│  │  - topStudents                │                                            │
│  │  - attentionNeeded             │                                            │
│  │  - notes                      │                                            │
│  └──────────────┬───────────────┘                                            │
│                 ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ AI Agent (agent.ts)                                                     │  │
│  │  - teacherPrompt + teacherRulesJson                                     │  │
│  │  - chain.invoke({summaryJson, teacherRulesJson})                         │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              ▼ raw LLM output (string)                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ parseTeacherInsights() (insights.ts)                                     │  │
│  │  - extractJsonObject, JSON.parse                                         │  │
│  │  - validate classOverview, strengths, nextSteps, attentionNeeded[]       │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              │ ok?                                                           │
│     ┌────────┴───────────┐                                                  │
│     │                    │                                                  │
│     ▼                    ▼                                                  │
│  Insights OK        Insights Invalid                                         │
│  (TeacherInsights)  -> buildFallbackTeacherInsights() (insights.ts)          │
│     │                    │                                                  │
│     └────────┬───────────┘                                                  │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ renderTeacherMessage() (insights.ts)                                     │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ buildTeacherEmail() (email.ts)                                           │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ sendEmail() (email.ts) -> filePath?                                      │  │
│  └───────────┬────────────────────────────────────────────────────────────┘  │
│              ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ recordTeacherMessage() (storage.ts)                                      │  │
│  │  - INSERT teacher_messages                                               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  runOnce ends -> finishRun(runId, "completed")                                │
└───────────────────────────────────────────────────────────────────────────────┘
