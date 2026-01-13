┌─────────────────────────────────────────────────────────┐
│  SCHEDULER (main.ts)                                     │
│  "Wake up every 30 minutes and analyze students"        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  DATA LOADER (validator.ts)                             │
│  "Read students.json and check if data is valid"        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  ANALYZER (analyzer.ts)                                 │
│  "Calculate grades, find strengths/weaknesses"          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  AI AGENT (agent.ts + LangChain)                        │
│  "Turn numbers into human advice via OpenAI"            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  INSIGHTS PARSER (insights.ts)                          │
│  "Extract and validate AI's JSON response"              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  EMAIL GENERATOR (email.ts)                             │
│  "Create personalized emails for each student/teacher"  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  STORAGE (storage.ts)                                   │
│  "Save everything to SQLite database for history"       │
└─────────────────────────────────────────────────────────┘