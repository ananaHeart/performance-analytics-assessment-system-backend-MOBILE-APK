// src/database/schema.js

export const TABLES = {
  users: `CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    password TEXT,
    first_name TEXT,
    last_name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT
  );`,

  classes: `CREATE TABLE IF NOT EXISTS classes (
    class_id INTEGER PRIMARY KEY,
    teacher_id INTEGER,
    subject_id INTEGER,
    subject_name TEXT,
    section_id INTEGER,
    section_name TEXT,
    grade_level_id INTEGER,
    grade_level_name TEXT,
    academic_year_id INTEGER,
    academic_year TEXT
  );`,

  students: `CREATE TABLE IF NOT EXISTS students (
    student_id INTEGER PRIMARY KEY,
    student_lrn TEXT,
    first_name TEXT,
    last_name TEXT,
    gender TEXT,
    section_id INTEGER,
    section_name TEXT,
    grade_level_id INTEGER,
    grade_level_name TEXT,
    academic_year_id INTEGER,
    academic_year TEXT
  );`,

  student_enrollments: `CREATE TABLE IF NOT EXISTS student_enrollments (
    enrollment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    section_id INTEGER,
    section_name TEXT,
    grade_level_id INTEGER,
    grade_level_name TEXT,
    academic_year_id INTEGER,
    academic_year TEXT,
    UNIQUE(student_id, section_id, grade_level_id, academic_year_id)
  );`,

  tests: `CREATE TABLE IF NOT EXISTS tests (
    test_id INTEGER PRIMARY KEY,
    class_id INTEGER,
    test_name TEXT,
    test_type TEXT,
    test_date TEXT,
    grading_period_id INTEGER,
    test_status TEXT
  );`,

  test_parts: `CREATE TABLE IF NOT EXISTS test_parts (
    test_part_id INTEGER PRIMARY KEY,
    test_id INTEGER,
    competency_id INTEGER,
    competency_name TEXT,
    part_order TEXT,
    part_type TEXT,
    number_of_items INTEGER,
    points_per_item INTEGER,
    answer_key TEXT
  );`,

  competencies: `CREATE TABLE IF NOT EXISTS competencies (
    competency_id INTEGER PRIMARY KEY,
    grade_level_id INTEGER,
    subject_id INTEGER,
    competency_name TEXT
  );`,

  test_results: `CREATE TABLE IF NOT EXISTS test_results (
    test_result_id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_result_id TEXT UNIQUE,
    test_id INTEGER,
    student_id INTEGER,
    total_score INTEGER DEFAULT 0,
    raw_answers TEXT,
    is_synced INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
  );`,

  item_responses: `CREATE TABLE IF NOT EXISTS item_responses (
    response_id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_response_id TEXT UNIQUE,
    local_result_id TEXT,
    test_part_id INTEGER,
    item_number INTEGER,
    is_correct INTEGER DEFAULT 0,
    is_synced INTEGER DEFAULT 0,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    UNIQUE(local_result_id, test_part_id, item_number)
  );`,

  class_sync_metadata: `CREATE TABLE IF NOT EXISTS class_sync_metadata (
    class_id INTEGER PRIMARY KEY,
    teacher_id INTEGER,
    last_synced_at TEXT
  );`,

  session_metadata: `CREATE TABLE IF NOT EXISTS session_metadata (
    session_id INTEGER PRIMARY KEY CHECK (session_id = 1),
    active_user_id INTEGER,
    last_login TEXT
  );`,
};
