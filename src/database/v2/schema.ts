export const V2_SCHEMA_VERSION = 1;

export const V2_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_versions (
    schema_version_id INTEGER PRIMARY KEY CHECK (schema_version_id = 1),
    version_number INTEGER NOT NULL,
    applied_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    school_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS classes (
    class_id INTEGER PRIMARY KEY,
    academic_year_id INTEGER NOT NULL,
    year_name TEXT NOT NULL,
    grade_level_id INTEGER NOT NULL,
    grade_level_name TEXT NOT NULL,
    section_id INTEGER NOT NULL,
    section_name TEXT NOT NULL,
    status TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS class_assignments (
    class_assignment_id INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    academic_year_id INTEGER NOT NULL,
    year_name TEXT NOT NULL,
    grade_level_id INTEGER NOT NULL,
    grade_level_name TEXT NOT NULL,
    section_id INTEGER NOT NULL,
    section_name TEXT NOT NULL,
    subject_id INTEGER NOT NULL,
    subject_name TEXT NOT NULL,
    assignment_role TEXT NOT NULL,
    assignment_status TEXT NOT NULL,
    FOREIGN KEY (class_id) REFERENCES classes (class_id),
    FOREIGN KEY (user_id) REFERENCES users (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS students (
    student_id INTEGER PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_lrn TEXT NOT NULL,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    suffix TEXT,
    status TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS class_lists (
    class_list_id INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    UNIQUE (class_id, student_id),
    FOREIGN KEY (class_id) REFERENCES classes (class_id),
    FOREIGN KEY (student_id) REFERENCES students (student_id)
  )`,

  `CREATE TABLE IF NOT EXISTS tests (
    test_id INTEGER PRIMARY KEY,
    class_assignment_id INTEGER NOT NULL,
    term_period_id INTEGER NOT NULL,
    term_name TEXT NOT NULL,
    test_name TEXT NOT NULL,
    test_type TEXT NOT NULL,
    test_date TEXT NOT NULL,
    instructions TEXT,
    total_items INTEGER NOT NULL CHECK (total_items >= 0),
    status TEXT NOT NULL,
    FOREIGN KEY (class_assignment_id) REFERENCES class_assignments (class_assignment_id)
  )`,

  `CREATE TABLE IF NOT EXISTS test_parts (
    test_part_id INTEGER PRIMARY KEY,
    test_id INTEGER NOT NULL,
    part_order INTEGER NOT NULL,
    part_name TEXT NOT NULL,
    part_type TEXT NOT NULL,
    number_of_items INTEGER NOT NULL CHECK (number_of_items > 0),
    points_per_item REAL NOT NULL CHECK (points_per_item > 0),
    UNIQUE (test_id, part_order),
    FOREIGN KEY (test_id) REFERENCES tests (test_id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS questions (
    question_id INTEGER PRIMARY KEY,
    test_part_id INTEGER NOT NULL,
    item_number INTEGER NOT NULL CHECK (item_number > 0),
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    option_e TEXT,
    UNIQUE (test_part_id, item_number),
    FOREIGN KEY (test_part_id) REFERENCES test_parts (test_part_id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS answer_keys (
    question_id INTEGER PRIMARY KEY,
    correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D', 'E')),
    FOREIGN KEY (question_id) REFERENCES questions (question_id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS skills (
    skill_id INTEGER PRIMARY KEY,
    competency_id INTEGER NOT NULL,
    competency_name TEXT NOT NULL,
    root_tag_id INTEGER NOT NULL,
    root_tag_name TEXT NOT NULL,
    term_period_id INTEGER NOT NULL,
    grade_level_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS question_mappings (
    question_id INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    PRIMARY KEY (question_id, skill_id),
    FOREIGN KEY (question_id) REFERENCES questions (question_id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills (skill_id)
  )`,

  `CREATE TABLE IF NOT EXISTS download_snapshots (
    download_snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_version TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    downloaded_at TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS scan_sessions (
    scan_session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_uuid TEXT NOT NULL UNIQUE,
    test_id INTEGER NOT NULL,
    class_list_id INTEGER NOT NULL,
    scanned_by_user_id INTEGER NOT NULL,
    verified_by_user_id INTEGER,
    device_identifier TEXT,
    template_version TEXT NOT NULL,
    scanner_version TEXT NOT NULL,
    image_hash TEXT,
    image_uri TEXT,
    scan_status TEXT NOT NULL CHECK (
      scan_status IN ('captured', 'processing', 'needs_verification', 'verified', 'failed')
    ),
    scanned_at TEXT NOT NULL,
    verified_at TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0 CHECK (is_synced IN (0, 1)),
    sync_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempt_count >= 0),
    last_sync_error TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (test_id) REFERENCES tests (test_id),
    FOREIGN KEY (class_list_id) REFERENCES class_lists (class_list_id),
    FOREIGN KEY (scanned_by_user_id) REFERENCES users (user_id),
    FOREIGN KEY (verified_by_user_id) REFERENCES users (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS omr_detections (
    omr_detection_id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_session_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    detected_option TEXT CHECK (
      detected_option IS NULL OR detected_option IN ('A', 'B', 'C', 'D', 'E')
    ),
    confidence_score REAL NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    detection_status TEXT NOT NULL CHECK (
      detection_status IN ('detected', 'blank', 'multiple_marks', 'uncertain')
    ),
    verification_status TEXT NOT NULL CHECK (
      verification_status IN ('pending', 'confirmed', 'corrected')
    ),
    raw_mark TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (scan_session_id, question_id),
    FOREIGN KEY (scan_session_id) REFERENCES scan_sessions (scan_session_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions (question_id)
  )`,

  `CREATE TABLE IF NOT EXISTS test_results (
    test_result_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_test_result_id INTEGER,
    result_uuid TEXT NOT NULL UNIQUE,
    test_id INTEGER NOT NULL,
    class_list_id INTEGER NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
    result_status TEXT NOT NULL CHECK (result_status IN ('draft', 'verified')),
    checked_at TEXT,
    provisional_total_score REAL,
    provisional_max_score REAL,
    provisional_items_evaluated INTEGER,
    sync_action TEXT NOT NULL DEFAULT 'create' CHECK (sync_action IN ('create', 'update')),
    is_synced INTEGER NOT NULL DEFAULT 0 CHECK (is_synced IN (0, 1)),
    sync_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempt_count >= 0),
    last_sync_error TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (test_id, class_list_id, attempt_number),
    FOREIGN KEY (test_id) REFERENCES tests (test_id),
    FOREIGN KEY (class_list_id) REFERENCES class_lists (class_list_id)
  )`,

  `CREATE TABLE IF NOT EXISTS test_result_scans (
    test_result_scan_id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_result_id INTEGER NOT NULL,
    scan_session_id INTEGER NOT NULL UNIQUE,
    link_status TEXT NOT NULL CHECK (link_status IN ('selected', 'superseded', 'rejected')),
    decided_by_user_id INTEGER NOT NULL,
    decision_reason TEXT,
    linked_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (test_result_id, scan_session_id),
    FOREIGN KEY (test_result_id) REFERENCES test_results (test_result_id) ON DELETE CASCADE,
    FOREIGN KEY (scan_session_id) REFERENCES scan_sessions (scan_session_id),
    FOREIGN KEY (decided_by_user_id) REFERENCES users (user_id)
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS uk_test_result_scans_one_selected
   ON test_result_scans (test_result_id)
   WHERE link_status = 'selected'`,

  `CREATE TABLE IF NOT EXISTS student_answers (
    student_answer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_result_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    verified_by_user_id INTEGER NOT NULL,
    answer_uuid TEXT NOT NULL UNIQUE,
    capture_source TEXT NOT NULL CHECK (
      capture_source IN ('omr', 'teacher_correction', 'manual')
    ),
    verified_at TEXT NOT NULL,
    selected_option TEXT CHECK (
      selected_option IS NULL OR selected_option IN ('A', 'B', 'C', 'D', 'E')
    ),
    answer_status TEXT NOT NULL CHECK (
      answer_status IN ('answered', 'blank', 'multiple', 'invalid')
    ),
    correction_reason TEXT,
    provisional_is_correct INTEGER CHECK (provisional_is_correct IS NULL OR provisional_is_correct IN (0, 1)),
    provisional_points_earned REAL CHECK (
      provisional_points_earned IS NULL OR provisional_points_earned >= 0
    ),
    is_synced INTEGER NOT NULL DEFAULT 0 CHECK (is_synced IN (0, 1)),
    sync_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempt_count >= 0),
    last_sync_error TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (test_result_id, question_id),
    FOREIGN KEY (test_result_id) REFERENCES test_results (test_result_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions (question_id),
    FOREIGN KEY (verified_by_user_id) REFERENCES users (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS sync_batches (
    sync_batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_uuid TEXT NOT NULL UNIQUE,
    test_id INTEGER NOT NULL,
    device_identifier TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    sync_status TEXT NOT NULL CHECK (
      sync_status IN ('pending', 'in_progress', 'partial_success', 'success', 'failed')
    ),
    sync_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempt_count >= 0),
    last_sync_error TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (test_id) REFERENCES tests (test_id)
  )`,

  `CREATE TABLE IF NOT EXISTS sync_result_items (
    sync_result_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_batch_id INTEGER NOT NULL,
    result_uuid TEXT NOT NULL,
    sync_action TEXT NOT NULL CHECK (sync_action IN ('create', 'update')),
    sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'success', 'failed', 'skipped')),
    central_sync_item_id INTEGER,
    central_test_result_id INTEGER,
    central_scan_session_id INTEGER,
    error_code TEXT,
    error_message TEXT,
    synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (sync_batch_id, result_uuid),
    FOREIGN KEY (sync_batch_id) REFERENCES sync_batches (sync_batch_id) ON DELETE CASCADE,
    FOREIGN KEY (result_uuid) REFERENCES test_results (result_uuid)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_class_assignments_user_status
   ON class_assignments (user_id, assignment_status)`,
  `CREATE INDEX IF NOT EXISTS idx_class_lists_student ON class_lists (student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tests_assignment_status
   ON tests (class_assignment_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_part_item
   ON questions (test_part_id, item_number)`,
  `CREATE INDEX IF NOT EXISTS idx_scan_sessions_test_student
   ON scan_sessions (test_id, class_list_id, scan_status)`,
  `CREATE INDEX IF NOT EXISTS idx_test_results_sync
   ON test_results (test_id, is_synced, result_status)`,
  `CREATE INDEX IF NOT EXISTS idx_student_answers_result
   ON student_answers (test_result_id, is_synced)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_result_items_status
   ON sync_result_items (sync_batch_id, sync_status)`,
] as const;
