Below are **copy/paste commands** to query SQLite history DB (the one created by `storage.ts`). Assuming the DB path is the default:

* `data/history.db` (from `HISTORY_DB_PATH`)

If yours is different, please replace `data/history.db` accordingly.

---

## 0) Open the DB

```bash
sqlite3 data/history.db
```

Inside the SQLite prompt, you can run the SQL snippets below.

Tip: enable nicer output:

```sql
.headers on
.mode column
.width 36 20 20 10 10 18
```

Exit with:

```sql
.quit
```

---

## 1) Discover tables and schema

### List tables

```sql
.tables
```

### Show schema for everything

```sql
.schema
```

### Show schema for a specific table

```sql
.schema runs
.schema student_messages
.schema teacher_messages
```

### Show columns (alternative)

```sql
PRAGMA table_info(runs);
PRAGMA table_info(student_messages);
PRAGMA table_info(teacher_messages);
```

---

## 2) Runs: see what happened over time

### Last 20 runs (newest first)

```sql
SELECT
  id,
  started_at,
  completed_at,
  status,
  student_count,
  valid_student_count
FROM runs
ORDER BY started_at DESC
LIMIT 20;
```

### Runs that did NOT complete cleanly

```sql
SELECT id, started_at, status
FROM runs
WHERE status <> 'completed'
ORDER BY started_at DESC;
```

### Get the most recent run id

```sql
SELECT id
FROM runs
ORDER BY started_at DESC
LIMIT 1;
```

---

## 3) Student messages (per-student outcomes)

### Last 30 student message rows

```sql
SELECT
  created_at,
  run_id,
  student_id,
  status,
  used_fallback,
  email_subject,
  email_path
FROM student_messages
ORDER BY created_at DESC
LIMIT 30;
```

### Show all student results for a specific run

Replace `RUN_ID_HERE`:

```sql
SELECT
  student_id,
  status,
  used_fallback,
  email_subject,
  email_path,
  error
FROM student_messages
WHERE run_id = 'RUN_ID_HERE'
ORDER BY created_at ASC;
```

### Only failures for a run

```sql
SELECT
  student_id,
  status,
  error
FROM student_messages
WHERE run_id = 'RUN_ID_HERE'
  AND status <> 'sent'
ORDER BY created_at ASC;
```

### Students that triggered fallbacks (for a run)

```sql
SELECT
  student_id,
  email_subject,
  email_path
FROM student_messages
WHERE run_id = 'RUN_ID_HERE'
  AND used_fallback = 1
ORDER BY created_at ASC;
```

### All rows for one student across time

Replace `STUDENT_ID_HERE`:

```sql
SELECT
  created_at,
  run_id,
  status,
  used_fallback,
  email_subject,
  email_path,
  error
FROM student_messages
WHERE student_id = 'STUDENT_ID_HERE'
ORDER BY created_at DESC;
```

---

## 4) Teacher messages (class summary)

### Last 20 teacher messages

```sql
SELECT
  created_at,
  run_id,
  status,
  used_fallback,
  email_subject,
  email_path,
  error
FROM teacher_messages
ORDER BY created_at DESC
LIMIT 20;
```

### Teacher message for a specific run

```sql
SELECT
  status,
  used_fallback,
  email_subject,
  email_path,
  error
FROM teacher_messages
WHERE run_id = 'RUN_ID_HERE'
LIMIT 1;
```

---

## 5) Inspect stored JSON blobs (analysis/insights)

### View a student’s stored analysis JSON for a run

```sql
SELECT analysis_json
FROM student_messages
WHERE run_id = 'RUN_ID_HERE'
  AND student_id = 'STUDENT_ID_HERE'
LIMIT 1;
```

### View a student’s stored insights JSON for a run

```sql
SELECT insights_json
FROM student_messages
WHERE run_id = 'RUN_ID_HERE'
  AND student_id = 'STUDENT_ID_HERE'
LIMIT 1;
```

### View teacher summary JSON + insights JSON for a run

```sql
SELECT summary_json, insights_json
FROM teacher_messages
WHERE run_id = 'RUN_ID_HERE'
LIMIT 1;
```

---

## 6) Useful joins (run context + messages)

### Student messages joined with run status/time

```sql
SELECT
  r.started_at,
  r.status AS run_status,
  sm.student_id,
  sm.status AS student_status,
  sm.used_fallback,
  sm.email_subject
FROM student_messages sm
JOIN runs r ON r.id = sm.run_id
ORDER BY r.started_at DESC, sm.created_at ASC
LIMIT 100;
```

### Count outcomes per run

```sql
SELECT
  run_id,
  SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent,
  SUM(CASE WHEN status<>'sent' THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN used_fallback=1 THEN 1 ELSE 0 END) AS fallback_used
FROM student_messages
GROUP BY run_id
ORDER BY run_id DESC
LIMIT 20;
```

---

## 7) Quick stats

### How often fallback is used (overall)

```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN used_fallback=1 THEN 1 ELSE 0 END) AS fallback_count
FROM student_messages;
```

### Failure rate (overall)

```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN status<>'sent' THEN 1 ELSE 0 END) AS failed_count
FROM student_messages;
```

---

## 8) Export query results to CSV (very handy)

From inside `sqlite3`:

```sql
.headers on
.mode csv
.once student_messages.csv
SELECT created_at, run_id, student_id, status, used_fallback, email_subject, email_path, error
FROM student_messages
ORDER BY created_at DESC;
.once
.mode column
```

This writes `student_messages.csv` in your current directory.

---

## 9) One-liners without entering sqlite prompt

Example: last 10 runs:

```bash
sqlite3 -header -column data/history.db \
"SELECT id, started_at, status, student_count, valid_student_count FROM runs ORDER BY started_at DESC LIMIT 10;"
```

Example: failures for latest run (two-step):

```bash
RUN_ID="$(sqlite3 data/history.db "SELECT id FROM runs ORDER BY started_at DESC LIMIT 1;")"
sqlite3 -header -column data/history.db \
"SELECT student_id, status, error FROM student_messages WHERE run_id='$RUN_ID' AND status<>'sent' ORDER BY created_at ASC;"
```

---

