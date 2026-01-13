┌────────────────────┐    ┌───────────────────┐    ┌──────────────────────┐
│ Input & Validation │    │ Deterministic     │    │ AI / Agent Layer     │
│                    │    │ Analysis          │    │                      │
│ validator.ts       │    │ analyzer.ts       │    │ agent.ts             │
│ - validateStudents │    │ - analyzeStudent  │    │ - prompts            │
│ - clean data       │    │ - class summary   │    │ - ChatOpenAI invoke   │
└─────────┬──────────┘    └─────────┬─────────┘    └─────────┬────────────┘
          │                         │                         │
          ▼                         ▼                         ▼
      Student[]                StudentAnalysis             raw string
          └──────────────────────────┬──────────────────────────┘
                                     ▼
                          ┌──────────────────────┐
                          │ Output Reliability   │
                          │ insights.ts          │
                          │ - extract JSON       │
                          │ - parse + validate   │
                          │ - fallback           │
                          │ - render messages    │
                          └─────────┬────────────┘
                                    ▼
                          message string (ready)
                                    ▼
          ┌─────────────────────────┴─────────────────────────┐
          │                                                   │
┌──────────────────────┐                            ┌──────────────────────┐
│ Email I/O (simulated) │                            │ Persistence (audit)  │
│ email.ts              │                            │ storage.ts           │
│ - build email objects │                            │ - runs table         │
│ - write email files   │                            │ - student_messages   │
└──────────────────────┘                            │ - teacher_messages   │
                                                    └──────────────────────┘
