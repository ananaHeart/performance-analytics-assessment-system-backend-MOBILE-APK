export const V3_DRAFT_DATABASE_NAME = 'AssessmentStorageV3.db' as const;
export const V3_DRAFT_SCHEMA_VERSION = 5 as const;
export const V3_CENTRAL_BASELINE_DATE = '2026-09-07' as const;
export const V3_CENTRAL_BASELINE_MIGRATION =
  'V3_014_academic_calendar_and_class_schedules' as const;
export const V3_CENTRAL_BASELINE_TABLE_COUNT = 67 as const;
export const V3_CENTRAL_BASELINE_FOREIGN_KEY_COUNT = 163 as const;
export const V3_CENTRAL_BASELINE_CHECK_COUNT = 87 as const;
export const V3_CENTRAL_BASELINE_UNIQUE_COUNT = 99 as const;

export const V3_DRAFT_SHARED_TABLES = [
  'users',
  'classes',
  'class_assignments',
  'class_assignment_schedules',
  'students',
  'class_lists',
  'term_periods',
  'question_types',
  'paper_sizes',
  'omr_templates',
  'omr_template_regions',
  'tests',
  'test_assignments',
  'test_parts',
  'questions',
  'question_options',
  'skills',
  'part_skill_mappings',
  'answer_sheet_versions',
  'answer_sheet_pages',
  'answer_sheet_regions',
  'answer_sheet_region_options',
] as const;

export const V3_DRAFT_MOBILE_ONLY_TABLES = [
  'schema_versions',
  'reference_data_state',
  'download_snapshots',
  'download_snapshot_entities',
  'download_snapshot_rows',
  'test_results',
  'scan_sessions',
  'scan_pages',
  'omr_detections',
  'scan_verifications',
  'test_result_scans',
  'student_answers',
  'answer_attachments',
  'answer_verifications',
  'answer_rubric_scores',
  'syncs',
  'sync_items',
  'objective_outbox',
  'dynamic_objective_outbox',
  'answer_sheet_manifest_cache',
  'evaluation_reference_cache',
] as const;

export const V3_DRAFT_TABLES = [
  ...V3_DRAFT_SHARED_TABLES,
  ...V3_DRAFT_MOBILE_ONLY_TABLES,
] as const;

// Isolated V3 SQL. Active production startup does not import or execute this array.
export const V3_DRAFT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS schema_versions (
    schema_version_id INTEGER PRIMARY KEY CHECK (schema_version_id = 1),
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    contract_version TEXT NOT NULL CHECK (contract_version = '3.0'),
    applied_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS reference_data_state (
    reference_data_state_id INTEGER PRIMARY KEY CHECK (reference_data_state_id = 1),
    contract_version TEXT NOT NULL CHECK (contract_version = '3.0'),
    server_time TEXT NOT NULL,
    download_mode TEXT NOT NULL CHECK (download_mode = 'full_snapshot'),
    payload_hash TEXT NOT NULL CHECK (
      length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^0-9a-f]*'
    ),
    statuses_json TEXT NOT NULL,
    sync_policy_json TEXT NOT NULL,
    refreshed_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    school_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role = 'teacher'),
    status TEXT NOT NULL,
    UNIQUE (school_id, email)
  )`,

  `CREATE TABLE IF NOT EXISTS classes (
    class_id INTEGER PRIMARY KEY,
    academic_year_id INTEGER NOT NULL,
    academic_year_name TEXT NOT NULL,
    grade_level_id INTEGER NOT NULL,
    grade_level_name TEXT NOT NULL,
    section_id INTEGER NOT NULL,
    section_name TEXT NOT NULL,
    status TEXT,
    UNIQUE (academic_year_id, grade_level_id, section_id)
  )`,

  `CREATE TABLE IF NOT EXISTS class_assignments (
    class_assignment_id INTEGER PRIMARY KEY,
    class_id INTEGER NOT NULL,
    teacher_user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    subject_code TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    assignment_role TEXT NOT NULL,
    assignment_status TEXT NOT NULL,
    FOREIGN KEY (class_id) REFERENCES classes (class_id),
    FOREIGN KEY (teacher_user_id) REFERENCES users (user_id),
    UNIQUE (class_id, teacher_user_id, subject_id)
  )`,

  `CREATE TABLE IF NOT EXISTS class_assignment_schedules (
    class_assignment_schedule_id INTEGER PRIMARY KEY,
    schedule_uuid TEXT NOT NULL UNIQUE CHECK (length(schedule_uuid) = 36),
    class_assignment_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    timezone_name TEXT NOT NULL DEFAULT 'Asia/Manila',
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    schedule_status TEXT NOT NULL CHECK (schedule_status IN ('active', 'archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (class_assignment_id) REFERENCES class_assignments (class_assignment_id),
    CHECK (end_time > start_time),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
  )`,

  `CREATE TABLE IF NOT EXISTS students (
    student_id INTEGER PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_lrn TEXT NOT NULL,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    suffix TEXT,
    gender TEXT,
    status TEXT NOT NULL,
    UNIQUE (school_id, student_lrn)
  )`,

  `CREATE TABLE IF NOT EXISTS class_lists (
    class_list_id INTEGER PRIMARY KEY,
    membership_uuid TEXT NOT NULL UNIQUE CHECK (length(membership_uuid) = 36),
    class_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    enrollment_status TEXT NOT NULL,
    enrollment_source TEXT NOT NULL,
    enrolled_at TEXT NOT NULL,
    FOREIGN KEY (class_id) REFERENCES classes (class_id),
    FOREIGN KEY (student_id) REFERENCES students (student_id),
    UNIQUE (class_id, student_id)
  )`,

  `CREATE TABLE IF NOT EXISTS term_periods (
    term_period_id INTEGER PRIMARY KEY,
    academic_year_id INTEGER NOT NULL,
    term_name TEXT NOT NULL,
    term_order INTEGER NOT NULL CHECK (term_order > 0),
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    status TEXT NOT NULL,
    CHECK (end_at >= start_at),
    UNIQUE (academic_year_id, term_order)
  )`,

  `CREATE TABLE IF NOT EXISTS question_types (
    question_type_id INTEGER PRIMARY KEY,
    question_type_code TEXT NOT NULL UNIQUE CHECK (
      question_type_code IN (
        'multiple_choice', 'true_false', 'identification', 'enumeration', 'essay'
      )
    ),
    question_type_name TEXT NOT NULL,
    capture_mode TEXT NOT NULL CHECK (capture_mode IN ('omr', 'ocr', 'hybrid', 'manual')),
    scoring_mode TEXT NOT NULL CHECK (scoring_mode IN ('automatic', 'hybrid', 'manual')),
    supports_omr INTEGER NOT NULL CHECK (supports_omr IN (0, 1)),
    supports_ocr INTEGER NOT NULL CHECK (supports_ocr IN (0, 1)),
    supports_multiple_response INTEGER NOT NULL CHECK (supports_multiple_response IN (0, 1)),
    requires_attachment INTEGER NOT NULL CHECK (requires_attachment IN (0, 1)),
    requires_teacher_verification INTEGER NOT NULL CHECK (requires_teacher_verification IN (0, 1)),
    allows_teacher_answer_edit INTEGER NOT NULL CHECK (allows_teacher_answer_edit IN (0, 1))
  )`,

  `CREATE TABLE IF NOT EXISTS paper_sizes (
    paper_size_id INTEGER PRIMARY KEY,
    paper_size_code TEXT NOT NULL UNIQUE CHECK (
      paper_size_code IN ('A4', 'US_LETTER', 'US_LEGAL')
    ),
    paper_size_name TEXT NOT NULL,
    width_points REAL NOT NULL CHECK (width_points > 0),
    height_points REAL NOT NULL CHECK (height_points > 0),
    operationally_supported INTEGER NOT NULL CHECK (operationally_supported IN (0, 1))
  )`,

  `CREATE TABLE IF NOT EXISTS omr_templates (
    omr_template_id INTEGER PRIMARY KEY,
    template_code TEXT NOT NULL UNIQUE,
    template_name TEXT NOT NULL,
    template_version TEXT NOT NULL,
    question_type_code TEXT,
    paper_size_code TEXT NOT NULL,
    orientation TEXT NOT NULL CHECK (orientation IN ('portrait', 'landscape')),
    minimum_item_count INTEGER CHECK (minimum_item_count IS NULL OR minimum_item_count > 0),
    maximum_item_count INTEGER CHECK (maximum_item_count IS NULL OR maximum_item_count > 0),
    option_count INTEGER CHECK (option_count IS NULL OR option_count > 0),
    qr_payload_version INTEGER NOT NULL CHECK (qr_payload_version > 0),
    minimum_scanner_version TEXT NOT NULL,
    coordinate_origin TEXT NOT NULL,
    required_print_scale_percent REAL NOT NULL CHECK (required_print_scale_percent > 0),
    geometry_hash TEXT NOT NULL CHECK (
      length(geometry_hash) = 64 AND geometry_hash NOT GLOB '*[^0-9a-f]*'
    ),
    physically_validated INTEGER NOT NULL CHECK (physically_validated IN (0, 1)),
    FOREIGN KEY (question_type_code) REFERENCES question_types (question_type_code),
    FOREIGN KEY (paper_size_code) REFERENCES paper_sizes (paper_size_code),
    CHECK (
      minimum_item_count IS NULL OR maximum_item_count IS NULL OR
      maximum_item_count >= minimum_item_count
    )
  )`,

  `CREATE TABLE IF NOT EXISTS omr_template_regions (
    region_uuid TEXT PRIMARY KEY CHECK (length(region_uuid) = 36),
    omr_template_id INTEGER NOT NULL,
    region_code TEXT NOT NULL,
    region_order INTEGER NOT NULL CHECK (region_order > 0),
    region_type TEXT NOT NULL,
    question_type_code TEXT,
    layout_variant TEXT,
    response_region_size TEXT,
    x_points REAL NOT NULL,
    y_points REAL NOT NULL,
    width_points REAL NOT NULL CHECK (width_points > 0),
    height_points REAL NOT NULL CHECK (height_points > 0),
    geometry_json TEXT,
    geometry_hash TEXT NOT NULL CHECK (
      length(geometry_hash) = 64 AND geometry_hash NOT GLOB '*[^0-9a-f]*'
    ),
    is_required INTEGER NOT NULL CHECK (is_required IN (0, 1)),
    FOREIGN KEY (omr_template_id) REFERENCES omr_templates (omr_template_id) ON DELETE CASCADE,
    FOREIGN KEY (question_type_code) REFERENCES question_types (question_type_code),
    UNIQUE (omr_template_id, region_code),
    UNIQUE (omr_template_id, region_order)
  )`,

  `CREATE TABLE IF NOT EXISTS tests (
    test_id INTEGER PRIMARY KEY,
    test_uuid TEXT NOT NULL UNIQUE CHECK (length(test_uuid) = 36),
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    term_period_id INTEGER NOT NULL,
    test_name TEXT NOT NULL,
    test_type TEXT NOT NULL,
    instructions TEXT,
    total_items INTEGER NOT NULL CHECK (total_items > 0),
    status TEXT NOT NULL,
    FOREIGN KEY (term_period_id) REFERENCES term_periods (term_period_id)
  )`,

  `CREATE TABLE IF NOT EXISTS test_assignments (
    test_assignment_id INTEGER PRIMARY KEY,
    assignment_uuid TEXT NOT NULL UNIQUE CHECK (length(assignment_uuid) = 36),
    test_id INTEGER NOT NULL,
    class_assignment_id INTEGER NOT NULL,
    open_at TEXT,
    close_at TEXT,
    assignment_status TEXT NOT NULL CHECK (
      assignment_status IN ('planned', 'open', 'closed', 'archived')
    ),
    allow_late_capture INTEGER NOT NULL CHECK (allow_late_capture IN (0, 1)),
    capture_allowed_now INTEGER NOT NULL CHECK (capture_allowed_now IN (0, 1)),
    capture_availability TEXT NOT NULL CHECK (
      capture_availability IN (
        'planned', 'scheduled', 'open', 'closed', 'late_allowed', 'archived'
      )
    ),
    FOREIGN KEY (test_id) REFERENCES tests (test_id),
    FOREIGN KEY (class_assignment_id) REFERENCES class_assignments (class_assignment_id),
    CHECK (open_at IS NULL OR close_at IS NULL OR close_at >= open_at),
    UNIQUE (test_assignment_id, assignment_uuid),
    UNIQUE (test_id, class_assignment_id)
  )`,

  `CREATE TABLE IF NOT EXISTS test_parts (
    test_part_id INTEGER PRIMARY KEY,
    test_id INTEGER NOT NULL,
    part_order INTEGER NOT NULL CHECK (part_order > 0),
    part_name TEXT NOT NULL,
    question_type_id INTEGER NOT NULL,
    number_of_items INTEGER NOT NULL CHECK (number_of_items > 0),
    points_per_item REAL NOT NULL CHECK (points_per_item >= 0),
    instructions TEXT,
    FOREIGN KEY (test_id) REFERENCES tests (test_id) ON DELETE CASCADE,
    FOREIGN KEY (question_type_id) REFERENCES question_types (question_type_id),
    UNIQUE (test_id, part_order)
  )`,

  `CREATE TABLE IF NOT EXISTS questions (
    question_id INTEGER PRIMARY KEY,
    question_uuid TEXT NOT NULL UNIQUE CHECK (length(question_uuid) = 36),
    test_part_id INTEGER NOT NULL,
    question_type_id INTEGER NOT NULL,
    item_number INTEGER NOT NULL CHECK (item_number > 0),
    global_item_number INTEGER NOT NULL CHECK (global_item_number > 0),
    question_text TEXT NOT NULL,
    maximum_points REAL NOT NULL CHECK (maximum_points >= 0),
    rubric_id INTEGER,
    response_instructions TEXT,
    answer_order_required INTEGER NOT NULL CHECK (answer_order_required IN (0, 1)),
    maximum_response_length INTEGER CHECK (
      maximum_response_length IS NULL OR maximum_response_length > 0
    ),
    expected_response_count INTEGER CHECK (
      expected_response_count IS NULL OR expected_response_count > 0
    ),
    response_region_size TEXT,
    force_page_break_before INTEGER NOT NULL CHECK (force_page_break_before IN (0, 1)),
    FOREIGN KEY (test_part_id) REFERENCES test_parts (test_part_id) ON DELETE CASCADE,
    FOREIGN KEY (question_type_id) REFERENCES question_types (question_type_id),
    UNIQUE (question_id, question_uuid),
    UNIQUE (test_part_id, item_number)
  )`,

  `CREATE TABLE IF NOT EXISTS question_options (
    question_option_id INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL,
    option_key TEXT NOT NULL,
    option_text TEXT NOT NULL,
    option_order INTEGER NOT NULL CHECK (option_order > 0),
    FOREIGN KEY (question_id) REFERENCES questions (question_id) ON DELETE CASCADE,
    UNIQUE (question_id, option_key),
    UNIQUE (question_id, option_order)
  )`,

  `CREATE TABLE IF NOT EXISTS skills (
    skill_id INTEGER PRIMARY KEY,
    competency_id INTEGER NOT NULL,
    competency_name TEXT NOT NULL,
    root_tag_id INTEGER NOT NULL,
    root_tag_name TEXT NOT NULL,
    term_period_id INTEGER NOT NULL,
    grade_level_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    FOREIGN KEY (term_period_id) REFERENCES term_periods (term_period_id)
  )`,

  `CREATE TABLE IF NOT EXISTS part_skill_mappings (
    part_skill_mapping_id INTEGER PRIMARY KEY,
    test_part_id INTEGER NOT NULL,
    skill_id INTEGER NOT NULL,
    start_item_number INTEGER NOT NULL CHECK (start_item_number > 0),
    end_item_number INTEGER NOT NULL CHECK (end_item_number >= start_item_number),
    item_count INTEGER NOT NULL CHECK (item_count > 0),
    FOREIGN KEY (test_part_id) REFERENCES test_parts (test_part_id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills (skill_id),
    CHECK (item_count = end_item_number - start_item_number + 1),
    UNIQUE (test_part_id, skill_id, start_item_number, end_item_number)
  )`,

  `CREATE TABLE IF NOT EXISTS answer_sheet_versions (
    answer_sheet_version_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_answer_sheet_version_id INTEGER UNIQUE,
    answer_sheet_uuid TEXT NOT NULL UNIQUE CHECK (length(answer_sheet_uuid) = 36),
    test_assignment_id INTEGER NOT NULL,
    assignment_uuid TEXT NOT NULL,
    paper_size_id INTEGER NOT NULL,
    generation_number INTEGER NOT NULL CHECK (generation_number > 0),
    test_version_number INTEGER NOT NULL CHECK (test_version_number > 0),
    total_questions INTEGER NOT NULL CHECK (total_questions >= 5),
    total_pages INTEGER NOT NULL CHECK (total_pages > 0),
    manifest_version INTEGER NOT NULL CHECK (manifest_version > 0),
    manifest_hash TEXT NOT NULL CHECK (
      length(manifest_hash) = 64 AND manifest_hash NOT GLOB '*[^0-9a-f]*'
    ),
    required_scanner_version TEXT NOT NULL,
    generation_status TEXT NOT NULL DEFAULT 'ready' CHECK (
      generation_status IN ('generating', 'ready', 'retired', 'failed')
    ),
    generated_at TEXT NOT NULL,
    FOREIGN KEY (test_assignment_id, assignment_uuid)
      REFERENCES test_assignments (test_assignment_id, assignment_uuid),
    FOREIGN KEY (paper_size_id) REFERENCES paper_sizes (paper_size_id),
    UNIQUE (test_assignment_id, paper_size_id, generation_number)
  )`,

  `CREATE TABLE IF NOT EXISTS answer_sheet_pages (
    answer_sheet_page_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_answer_sheet_page_id INTEGER UNIQUE,
    page_uuid TEXT NOT NULL UNIQUE CHECK (length(page_uuid) = 36),
    answer_sheet_version_id INTEGER NOT NULL,
    omr_template_id INTEGER NOT NULL,
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    total_pages INTEGER NOT NULL CHECK (total_pages > 0),
    template_version TEXT NOT NULL,
    page_geometry_hash TEXT NOT NULL CHECK (
      length(page_geometry_hash) = 64 AND page_geometry_hash NOT GLOB '*[^0-9a-f]*'
    ),
    qr_payload_version INTEGER NOT NULL CHECK (qr_payload_version > 0),
    qr_payload TEXT NOT NULL,
    qr_payload_hash TEXT NOT NULL CHECK (
      length(qr_payload_hash) = 64 AND qr_payload_hash NOT GLOB '*[^0-9a-f]*'
    ),
    qr_error_correction TEXT NOT NULL,
    coordinate_unit TEXT NOT NULL,
    coordinate_origin TEXT NOT NULL,
    coordinate_width REAL NOT NULL CHECK (coordinate_width > 0),
    coordinate_height REAL NOT NULL CHECK (coordinate_height > 0),
    page_status TEXT NOT NULL DEFAULT 'ready' CHECK (page_status IN ('ready', 'retired')),
    FOREIGN KEY (answer_sheet_version_id) REFERENCES answer_sheet_versions (answer_sheet_version_id) ON DELETE CASCADE,
    FOREIGN KEY (omr_template_id) REFERENCES omr_templates (omr_template_id),
    UNIQUE (answer_sheet_version_id, page_number)
  )`,

  `CREATE TABLE IF NOT EXISTS answer_sheet_regions (
    answer_sheet_region_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_answer_sheet_region_id INTEGER UNIQUE,
    region_uuid TEXT NOT NULL UNIQUE CHECK (length(region_uuid) = 36),
    answer_sheet_version_id INTEGER NOT NULL,
    answer_sheet_page_id INTEGER NOT NULL,
    template_region_code TEXT NOT NULL,
    question_id INTEGER NOT NULL,
    question_uuid TEXT NOT NULL,
    test_part_id INTEGER NOT NULL,
    global_item_number INTEGER NOT NULL CHECK (global_item_number > 0),
    part_item_number INTEGER NOT NULL CHECK (part_item_number > 0),
    region_sequence INTEGER NOT NULL DEFAULT 1 CHECK (region_sequence > 0),
    question_type_code TEXT NOT NULL,
    region_type TEXT NOT NULL CHECK (region_type IN ('objective_bubbles', 'written_response')),
    response_region_size TEXT,
    expected_response_count_snapshot INTEGER CHECK (
      expected_response_count_snapshot IS NULL OR expected_response_count_snapshot > 0
    ),
    response_line_count INTEGER CHECK (response_line_count IS NULL OR response_line_count > 0),
    x_points REAL NOT NULL,
    y_points REAL NOT NULL,
    width_points REAL NOT NULL CHECK (width_points > 0),
    height_points REAL NOT NULL CHECK (height_points > 0),
    geometry_json TEXT,
    geometry_hash TEXT NOT NULL CHECK (
      length(geometry_hash) = 64 AND geometry_hash NOT GLOB '*[^0-9a-f]*'
    ),
    FOREIGN KEY (answer_sheet_version_id) REFERENCES answer_sheet_versions (answer_sheet_version_id) ON DELETE CASCADE,
    FOREIGN KEY (answer_sheet_page_id) REFERENCES answer_sheet_pages (answer_sheet_page_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id, question_uuid)
      REFERENCES questions (question_id, question_uuid),
    FOREIGN KEY (test_part_id) REFERENCES test_parts (test_part_id),
    FOREIGN KEY (question_type_code) REFERENCES question_types (question_type_code),
    UNIQUE (answer_sheet_page_id, template_region_code),
    UNIQUE (answer_sheet_version_id, question_id, region_sequence)
  )`,

  `CREATE TABLE IF NOT EXISTS answer_sheet_region_options (
    answer_sheet_region_option_id INTEGER PRIMARY KEY AUTOINCREMENT,
    answer_sheet_region_id INTEGER NOT NULL,
    option_key TEXT NOT NULL,
    stored_value TEXT NOT NULL,
    center_x REAL NOT NULL,
    center_y REAL NOT NULL,
    FOREIGN KEY (answer_sheet_region_id) REFERENCES answer_sheet_regions (answer_sheet_region_id) ON DELETE CASCADE,
    UNIQUE (answer_sheet_region_id, option_key),
    UNIQUE (answer_sheet_region_id, stored_value)
  )`,

  `CREATE TABLE IF NOT EXISTS download_snapshots (
    download_snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_uuid TEXT NOT NULL UNIQUE CHECK (length(snapshot_uuid) = 36),
    contract_version TEXT NOT NULL CHECK (contract_version = '3.0'),
    snapshot_mode TEXT NOT NULL CHECK (snapshot_mode = 'full_snapshot'),
    payload_hash TEXT NOT NULL CHECK (
      length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^0-9a-f]*'
    ),
    snapshot_status TEXT NOT NULL CHECK (
      snapshot_status IN ('downloading', 'complete', 'failed', 'superseded')
    ),
    generated_at TEXT NOT NULL,
    downloaded_at TEXT NOT NULL,
    committed_at TEXT,
    expires_at TEXT,
    last_error TEXT,
    teacher_user_id INTEGER NOT NULL,
    FOREIGN KEY (teacher_user_id) REFERENCES users (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS download_snapshot_entities (
    download_snapshot_entity_id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_snapshot_id INTEGER NOT NULL,
    entity_name TEXT NOT NULL,
    row_count INTEGER NOT NULL CHECK (row_count >= 0),
    payload_hash TEXT NOT NULL CHECK (
      length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^0-9a-f]*'
    ),
    FOREIGN KEY (download_snapshot_id) REFERENCES download_snapshots (download_snapshot_id) ON DELETE CASCADE,
    UNIQUE (download_snapshot_id, entity_name)
  )`,

  `CREATE TABLE IF NOT EXISTS download_snapshot_rows (
    download_snapshot_row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    download_snapshot_id INTEGER NOT NULL,
    entity_name TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    FOREIGN KEY (download_snapshot_id) REFERENCES download_snapshots (download_snapshot_id) ON DELETE CASCADE,
    UNIQUE (download_snapshot_id, entity_name, entity_key)
  )`,

  `CREATE TABLE IF NOT EXISTS test_results (
    test_result_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_test_result_id INTEGER,
    result_uuid TEXT NOT NULL UNIQUE CHECK (length(result_uuid) = 36),
    test_assignment_id INTEGER NOT NULL,
    class_list_id INTEGER NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
    result_status TEXT NOT NULL CHECK (
      result_status IN ('draft', 'pending_verification', 'finalized', 'superseded')
    ),
    submitted_at TEXT,
    verification_completed_at TEXT,
    checked_at TEXT,
    provisional_total_score REAL CHECK (provisional_total_score IS NULL OR provisional_total_score >= 0),
    provisional_max_score REAL CHECK (provisional_max_score IS NULL OR provisional_max_score >= 0),
    provisional_items_evaluated INTEGER CHECK (
      provisional_items_evaluated IS NULL OR provisional_items_evaluated >= 0
    ),
    server_total_score REAL CHECK (server_total_score IS NULL OR server_total_score >= 0),
    server_max_score REAL CHECK (server_max_score IS NULL OR server_max_score >= 0),
    server_items_evaluated INTEGER CHECK (
      server_items_evaluated IS NULL OR server_items_evaluated >= 0
    ),
    server_percentage_snapshot REAL CHECK (
      server_percentage_snapshot IS NULL OR
      (server_percentage_snapshot >= 0 AND server_percentage_snapshot <= 100)
    ),
    server_performance_rule_set_id INTEGER,
    server_performance_status TEXT,
    server_score_version INTEGER CHECK (
      server_score_version IS NULL OR server_score_version > 0
    ),
    server_scored_at TEXT,
    server_finalized_at TEXT,
    sync_action TEXT NOT NULL DEFAULT 'upsert' CHECK (sync_action = 'upsert'),
    is_synced INTEGER NOT NULL DEFAULT 0 CHECK (is_synced IN (0, 1)),
    sync_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempt_count >= 0),
    last_sync_error TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (test_assignment_id) REFERENCES test_assignments (test_assignment_id),
    FOREIGN KEY (class_list_id) REFERENCES class_lists (class_list_id),
    CHECK (
      provisional_total_score IS NULL OR provisional_max_score IS NULL OR
      provisional_total_score <= provisional_max_score
    ),
    CHECK (
      server_total_score IS NULL OR server_max_score IS NULL OR
      server_total_score <= server_max_score
    ),
    UNIQUE (test_assignment_id, class_list_id, attempt_number)
  )`,

  `CREATE TABLE IF NOT EXISTS scan_sessions (
    scan_session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_scan_session_id INTEGER UNIQUE,
    scan_uuid TEXT NOT NULL UNIQUE CHECK (length(scan_uuid) = 36),
    answer_sheet_version_id INTEGER,
    omr_template_id INTEGER,
    test_assignment_id INTEGER NOT NULL,
    class_list_id INTEGER NOT NULL,
    expected_page_count INTEGER NOT NULL DEFAULT 1 CHECK (expected_page_count > 0),
    captured_page_count INTEGER NOT NULL DEFAULT 0 CHECK (captured_page_count >= 0),
    scanned_by_user_id INTEGER NOT NULL,
    device_identifier TEXT NOT NULL,
    template_version TEXT,
    scanner_version TEXT NOT NULL,
    image_sha256 TEXT CHECK (
      image_sha256 IS NULL OR
      (length(image_sha256) = 64 AND image_sha256 NOT GLOB '*[^0-9a-f]*')
    ),
    supersedes_scan_session_id INTEGER UNIQUE,
    scan_status TEXT NOT NULL CHECK (
      scan_status IN (
        'captured', 'processing', 'needs_verification', 'accepted',
        'rescan_requested', 'rejected', 'superseded', 'failed'
      )
    ),
    failure_code TEXT,
    failure_detail TEXT,
    scanned_at TEXT NOT NULL,
    verified_at TEXT,
    is_synced INTEGER NOT NULL DEFAULT 0 CHECK (is_synced IN (0, 1)),
    sync_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempt_count >= 0),
    last_sync_error TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (answer_sheet_version_id) REFERENCES answer_sheet_versions (answer_sheet_version_id),
    FOREIGN KEY (omr_template_id) REFERENCES omr_templates (omr_template_id),
    FOREIGN KEY (test_assignment_id) REFERENCES test_assignments (test_assignment_id),
    FOREIGN KEY (class_list_id) REFERENCES class_lists (class_list_id),
    FOREIGN KEY (scanned_by_user_id) REFERENCES users (user_id),
    FOREIGN KEY (supersedes_scan_session_id) REFERENCES scan_sessions (scan_session_id),
    CHECK (captured_page_count <= expected_page_count)
  )`,

  `CREATE TABLE IF NOT EXISTS scan_pages (
    scan_page_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_scan_page_id INTEGER UNIQUE,
    scan_page_uuid TEXT NOT NULL UNIQUE CHECK (length(scan_page_uuid) = 36),
    scan_session_id INTEGER NOT NULL,
    answer_sheet_page_id INTEGER NOT NULL,
    omr_template_id INTEGER NOT NULL,
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    capture_number INTEGER NOT NULL DEFAULT 1 CHECK (capture_number > 0),
    scanner_version TEXT NOT NULL,
    qr_payload TEXT NOT NULL,
    image_uri TEXT NOT NULL,
    image_sha256 TEXT NOT NULL CHECK (
      length(image_sha256) = 64 AND image_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
    qr_payload_hash TEXT NOT NULL CHECK (
      length(qr_payload_hash) = 64 AND qr_payload_hash NOT GLOB '*[^0-9a-f]*'
    ),
    captured_rotation_degrees INTEGER NOT NULL DEFAULT 0 CHECK (
      captured_rotation_degrees >= 0 AND captured_rotation_degrees < 360
    ),
    page_status TEXT NOT NULL CHECK (
      page_status IN (
        'captured', 'processing', 'needs_verification', 'accepted',
        'rescan_requested', 'rejected', 'superseded', 'failed'
      )
    ),
    failure_code TEXT,
    failure_detail TEXT,
    supersedes_scan_page_id INTEGER UNIQUE,
    captured_at TEXT NOT NULL,
    is_synced INTEGER NOT NULL DEFAULT 0 CHECK (is_synced IN (0, 1)),
    sync_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempt_count >= 0),
    last_sync_error TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (scan_session_id) REFERENCES scan_sessions (scan_session_id) ON DELETE CASCADE,
    FOREIGN KEY (answer_sheet_page_id) REFERENCES answer_sheet_pages (answer_sheet_page_id),
    FOREIGN KEY (omr_template_id) REFERENCES omr_templates (omr_template_id),
    FOREIGN KEY (supersedes_scan_page_id) REFERENCES scan_pages (scan_page_id),
    UNIQUE (scan_session_id, page_number, capture_number)
  )`,

  `CREATE TABLE IF NOT EXISTS omr_detections (
    omr_detection_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_omr_detection_id INTEGER UNIQUE,
    detection_uuid TEXT NOT NULL UNIQUE CHECK (length(detection_uuid) = 36),
    scan_session_id INTEGER NOT NULL,
    scan_page_id INTEGER NOT NULL,
    answer_sheet_region_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    detected_option TEXT,
    confidence_score REAL NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    detection_status TEXT NOT NULL CHECK (
      detection_status IN ('detected', 'blank', 'multiple_marks', 'uncertain')
    ),
    raw_mark_json TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (scan_session_id) REFERENCES scan_sessions (scan_session_id) ON DELETE CASCADE,
    FOREIGN KEY (scan_page_id) REFERENCES scan_pages (scan_page_id) ON DELETE CASCADE,
    FOREIGN KEY (answer_sheet_region_id) REFERENCES answer_sheet_regions (answer_sheet_region_id),
    FOREIGN KEY (question_id) REFERENCES questions (question_id),
    UNIQUE (scan_page_id, answer_sheet_region_id)
  )`,

  `CREATE TABLE IF NOT EXISTS scan_verifications (
    scan_verification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_scan_verification_id INTEGER UNIQUE,
    verification_uuid TEXT NOT NULL UNIQUE CHECK (length(verification_uuid) = 36),
    scan_session_id INTEGER NOT NULL,
    scan_page_id INTEGER,
    verified_by_user_id INTEGER NOT NULL,
    verification_action TEXT NOT NULL CHECK (
      verification_action IN ('accepted', 'rescan_requested', 'rejected', 'superseded')
    ),
    reason_code TEXT,
    reason_detail TEXT,
    decided_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (scan_session_id) REFERENCES scan_sessions (scan_session_id) ON DELETE CASCADE,
    FOREIGN KEY (scan_page_id) REFERENCES scan_pages (scan_page_id),
    FOREIGN KEY (verified_by_user_id) REFERENCES users (user_id)
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
    FOREIGN KEY (test_result_id) REFERENCES test_results (test_result_id) ON DELETE CASCADE,
    FOREIGN KEY (scan_session_id) REFERENCES scan_sessions (scan_session_id),
    FOREIGN KEY (decided_by_user_id) REFERENCES users (user_id),
    UNIQUE (test_result_id, scan_session_id)
  )`,

  `CREATE TABLE IF NOT EXISTS student_answers (
    student_answer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_student_answer_id INTEGER,
    answer_uuid TEXT NOT NULL UNIQUE CHECK (length(answer_uuid) = 36),
    test_result_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    source_omr_detection_id INTEGER,
    selected_question_option_id INTEGER,
    capture_source TEXT NOT NULL CHECK (capture_source IN ('omr', 'ocr', 'manual')),
    objective_value TEXT,
    response_text TEXT,
    answer_status TEXT NOT NULL CHECK (
      answer_status IN ('answered', 'blank', 'multiple', 'uncertain', 'invalid', 'pending_manual')
    ),
    evaluation_status TEXT NOT NULL CHECK (
      evaluation_status IN (
        'pending_verification', 'needs_manual_scoring', 'scored', 'finalized'
      )
    ),
    provisional_points_earned REAL CHECK (
      provisional_points_earned IS NULL OR provisional_points_earned >= 0
    ),
    server_is_correct INTEGER CHECK (server_is_correct IS NULL OR server_is_correct IN (0, 1)),
    server_points_earned REAL CHECK (server_points_earned IS NULL OR server_points_earned >= 0),
    server_teacher_feedback TEXT,
    verified_by_user_id INTEGER,
    verified_at TEXT,
    finalized_at TEXT,
    reopened_at TEXT,
    server_score_version INTEGER CHECK (
      server_score_version IS NULL OR server_score_version > 0
    ),
    is_synced INTEGER NOT NULL DEFAULT 0 CHECK (is_synced IN (0, 1)),
    sync_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (sync_attempt_count >= 0),
    last_sync_error TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (test_result_id) REFERENCES test_results (test_result_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions (question_id),
    FOREIGN KEY (source_omr_detection_id) REFERENCES omr_detections (omr_detection_id),
    FOREIGN KEY (selected_question_option_id) REFERENCES question_options (question_option_id),
    FOREIGN KEY (verified_by_user_id) REFERENCES users (user_id),
    UNIQUE (test_result_id, question_id),
    CHECK (objective_value IS NULL OR response_text IS NULL)
  )`,

  `CREATE TABLE IF NOT EXISTS answer_attachments (
    answer_attachment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_answer_attachment_id INTEGER UNIQUE,
    attachment_uuid TEXT NOT NULL UNIQUE CHECK (length(attachment_uuid) = 36),
    student_answer_id INTEGER,
    scan_session_id INTEGER,
    scan_page_id INTEGER,
    answer_sheet_region_id INTEGER,
    source_answer_attachment_id INTEGER,
    attachment_type TEXT NOT NULL CHECK (
      attachment_type IN (
        'full_sheet', 'page_image', 'original_page', 'normalized_page',
        'answer_crop', 'teacher_evidence'
      )
    ),
    mime_type TEXT NOT NULL,
    image_uri TEXT NOT NULL,
    file_size_bytes INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
    content_hash TEXT NOT NULL CHECK (
      length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'
    ),
    crop_coordinates_json TEXT,
    captured_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (student_answer_id) REFERENCES student_answers (student_answer_id) ON DELETE CASCADE,
    FOREIGN KEY (scan_session_id) REFERENCES scan_sessions (scan_session_id),
    FOREIGN KEY (scan_page_id) REFERENCES scan_pages (scan_page_id),
    FOREIGN KEY (answer_sheet_region_id) REFERENCES answer_sheet_regions (answer_sheet_region_id),
    FOREIGN KEY (source_answer_attachment_id) REFERENCES answer_attachments (answer_attachment_id),
    CHECK (
      student_answer_id IS NOT NULL OR scan_session_id IS NOT NULL OR scan_page_id IS NOT NULL
    )
  )`,

  `CREATE TABLE IF NOT EXISTS answer_verifications (
    answer_verification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_answer_verification_id INTEGER UNIQUE,
    verification_uuid TEXT NOT NULL UNIQUE CHECK (length(verification_uuid) = 36),
    student_answer_id INTEGER NOT NULL,
    verified_by_user_id INTEGER NOT NULL,
    verification_action TEXT NOT NULL CHECK (
      verification_action IN (
        'transcribed', 'ocr_confirmed', 'ocr_corrected',
        'manual_scored', 'reopened', 'finalized'
      )
    ),
    previous_answer_status TEXT,
    previous_answer_value TEXT,
    new_answer_status TEXT NOT NULL,
    new_answer_value TEXT,
    previous_points REAL CHECK (previous_points IS NULL OR previous_points >= 0),
    new_points REAL NOT NULL CHECK (new_points >= 0),
    reason_code TEXT,
    reason_detail TEXT,
    evidence_attachment_id INTEGER,
    verified_at TEXT NOT NULL,
    FOREIGN KEY (student_answer_id) REFERENCES student_answers (student_answer_id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by_user_id) REFERENCES users (user_id),
    FOREIGN KEY (evidence_attachment_id) REFERENCES answer_attachments (answer_attachment_id)
  )`,

  `CREATE TABLE IF NOT EXISTS answer_rubric_scores (
    answer_rubric_score_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_answer_rubric_score_id INTEGER UNIQUE,
    student_answer_id INTEGER NOT NULL,
    rubric_criterion_id INTEGER NOT NULL,
    answer_verification_id INTEGER,
    scored_by_user_id INTEGER NOT NULL,
    score_version INTEGER NOT NULL DEFAULT 1 CHECK (score_version > 0),
    points_awarded REAL NOT NULL CHECK (points_awarded >= 0),
    maximum_points_snapshot REAL CHECK (maximum_points_snapshot IS NULL OR maximum_points_snapshot >= 0),
    criterion_feedback TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (student_answer_id) REFERENCES student_answers (student_answer_id) ON DELETE CASCADE,
    FOREIGN KEY (answer_verification_id) REFERENCES answer_verifications (answer_verification_id),
    FOREIGN KEY (scored_by_user_id) REFERENCES users (user_id),
    CHECK (
      maximum_points_snapshot IS NULL OR points_awarded <= maximum_points_snapshot
    ),
    UNIQUE (student_answer_id, rubric_criterion_id, score_version)
  )`,

  `CREATE TABLE IF NOT EXISTS syncs (
    sync_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_sync_id INTEGER UNIQUE,
    sync_uuid TEXT NOT NULL UNIQUE CHECK (length(sync_uuid) = 36),
    user_id INTEGER NOT NULL,
    test_assignment_id INTEGER,
    device_identifier TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('download', 'upload')),
    sync_status TEXT NOT NULL CHECK (
      sync_status IN ('pending', 'in_progress', 'partial_success', 'success', 'failed')
    ),
    payload_hash TEXT CHECK (
      payload_hash IS NULL OR
      (length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^0-9a-f]*')
    ),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    last_retry_at TEXT,
    request_item_count INTEGER NOT NULL DEFAULT 0 CHECK (request_item_count >= 0),
    idempotency_version INTEGER NOT NULL DEFAULT 1 CHECK (idempotency_version > 0),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (user_id),
    FOREIGN KEY (test_assignment_id) REFERENCES test_assignments (test_assignment_id)
  )`,

  `CREATE TABLE IF NOT EXISTS sync_items (
    sync_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_sync_item_id INTEGER UNIQUE,
    sync_id INTEGER NOT NULL,
    result_uuid TEXT NOT NULL,
    sync_action TEXT NOT NULL CHECK (sync_action = 'upsert'),
    sync_status TEXT NOT NULL CHECK (
      sync_status IN ('pending', 'success', 'failed', 'skipped')
    ),
    central_test_result_id INTEGER,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_attempt_at TEXT,
    processed_at TEXT,
    error_code TEXT,
    error_message TEXT,
    synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (sync_id) REFERENCES syncs (sync_id) ON DELETE CASCADE,
    FOREIGN KEY (result_uuid) REFERENCES test_results (result_uuid),
    UNIQUE (sync_id, result_uuid)
  )`,

  `CREATE TABLE IF NOT EXISTS objective_outbox (
    objective_outbox_id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_uuid TEXT NOT NULL UNIQUE CHECK (length(result_uuid) = 36),
    test_assignment_id INTEGER NOT NULL,
    test_id INTEGER NOT NULL,
    assignment_uuid TEXT NOT NULL CHECK (length(assignment_uuid) = 36),
    class_list_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    scan_uuid TEXT NOT NULL UNIQUE CHECK (length(scan_uuid) = 36),
    scan_page_uuid TEXT NOT NULL UNIQUE CHECK (length(scan_page_uuid) = 36),
    scan_sync_uuid TEXT NOT NULL UNIQUE CHECK (length(scan_sync_uuid) = 36),
    detection_sync_uuid TEXT NOT NULL UNIQUE CHECK (length(detection_sync_uuid) = 36),
    detection_operation_uuid TEXT NOT NULL UNIQUE CHECK (length(detection_operation_uuid) = 36),
    verification_sync_uuid TEXT NOT NULL UNIQUE CHECK (length(verification_sync_uuid) = 36),
    verification_operation_uuid TEXT NOT NULL UNIQUE CHECK (length(verification_operation_uuid) = 36),
    page_verification_uuid TEXT NOT NULL UNIQUE CHECK (length(page_verification_uuid) = 36),
    answer_sheet_uuid TEXT NOT NULL CHECK (length(answer_sheet_uuid) = 36),
    page_uuid TEXT NOT NULL CHECK (length(page_uuid) = 36),
    qr_payload_hash TEXT NOT NULL CHECK (length(qr_payload_hash) = 64),
    image_uri TEXT NOT NULL,
    image_hash TEXT NOT NULL CHECK (length(image_hash) = 64),
    scanner_version TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    detections_json TEXT NOT NULL,
    stage TEXT NOT NULL CHECK (stage IN (
      'queued', 'scan_uploaded', 'detections_uploaded', 'verified', 'finalized', 'failed'
    )),
    expected_revision INTEGER,
    central_test_result_id INTEGER,
    official_score_json TEXT,
    analytics_json TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (test_assignment_id, class_list_id)
  )`,

  // Dynamic (mixed-question-type) counterpart of objective_outbox: one row per
  // (test assignment, student), but multi-page-aware (pages_json is an array,
  // not a single scan_page_uuid) and carrying both objective detections and
  // written-response answers/decisions in one place. Written answers are stored
  // here from the moment they're scored on-device even though the backend
  // verification-batch contract does not yet accept a written evaluation kind -
  // syncV3DynamicObjectiveResult() skips submitting them until it does.
  `CREATE TABLE IF NOT EXISTS dynamic_objective_outbox (
    dynamic_objective_outbox_id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_uuid TEXT NOT NULL UNIQUE CHECK (length(result_uuid) = 36),
    test_assignment_id INTEGER NOT NULL,
    test_id INTEGER NOT NULL,
    assignment_uuid TEXT NOT NULL CHECK (length(assignment_uuid) = 36),
    class_list_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    scan_uuid TEXT NOT NULL UNIQUE CHECK (length(scan_uuid) = 36),
    scan_sync_uuid TEXT NOT NULL UNIQUE CHECK (length(scan_sync_uuid) = 36),
    verification_sync_uuid TEXT NOT NULL UNIQUE CHECK (length(verification_sync_uuid) = 36),
    verification_operation_uuid TEXT NOT NULL UNIQUE CHECK (length(verification_operation_uuid) = 36),
    -- Separate from verification_sync_uuid/verification_operation_uuid above:
    -- the objective (3.0) and written (3.1) verification batches both POST to
    -- /api/v3/mobile/verification-batches, and the backend's idempotency check
    -- rejects a second, differently-shaped request replayed under an
    -- already-registered operationUuid. Nullable because the column-add
    -- migration in database.ts (for installs that created this table before
    -- this column existed) can't add a NOT NULL/UNIQUE column; every row
    -- written by this app's own code always populates both at queue time.
    written_verification_sync_uuid TEXT,
    written_verification_operation_uuid TEXT,
    answer_sheet_uuid TEXT NOT NULL CHECK (length(answer_sheet_uuid) = 36),
    pages_json TEXT NOT NULL,
    objective_detections_json TEXT NOT NULL,
    written_answers_json TEXT NOT NULL,
    stage TEXT NOT NULL CHECK (stage IN (
      'queued', 'pages_uploaded', 'detections_uploaded', 'verified', 'finalized', 'failed'
    )),
    expected_revision INTEGER,
    central_test_result_id INTEGER,
    official_score_json TEXT,
    analytics_json TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (test_assignment_id, class_list_id)
  )`,

  // The exact manifest JSON for each answer-sheet version, so a scan can start
  // with no connection. A manifest never changes for a given answer_sheet_uuid
  // while that version is ready (regenerating creates a new uuid), so a cached
  // copy is never stale.
  `CREATE TABLE IF NOT EXISTS answer_sheet_manifest_cache (
    answer_sheet_uuid TEXT PRIMARY KEY CHECK (length(answer_sheet_uuid) = 36),
    manifest_json TEXT NOT NULL,
    cached_at TEXT NOT NULL
  )`,

  // Last-fetched evaluation reference per assignment: per-question points,
  // rubrics, and answer keys. Used only to render scoring UI and a
  // display-only preliminary score offline - every upload still re-fetches a
  // fresh reference. When is_encrypted = 1, reference_json is Android Keystore
  // ciphertext; when 0, answer keys have been stripped out before storing.
  `CREATE TABLE IF NOT EXISTS evaluation_reference_cache (
    assignment_uuid TEXT PRIMARY KEY CHECK (length(assignment_uuid) = 36),
    reference_json TEXT NOT NULL,
    is_encrypted INTEGER NOT NULL CHECK (is_encrypted IN (0, 1)),
    cached_at TEXT NOT NULL
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS uk_test_result_scans_one_selected
   ON test_result_scans (test_result_id)
   WHERE link_status = 'selected'`,
  `CREATE INDEX IF NOT EXISTS idx_class_assignments_teacher_status
   ON class_assignments (teacher_user_id, assignment_status)`,
  `CREATE INDEX IF NOT EXISTS idx_class_assignment_schedules_lookup
   ON class_assignment_schedules (
     class_assignment_id, schedule_status, day_of_week, effective_from, effective_to
   )`,
  `CREATE INDEX IF NOT EXISTS idx_class_lists_student ON class_lists (student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_test_assignments_class_status
   ON test_assignments (class_assignment_id, assignment_status)`,
  `CREATE INDEX IF NOT EXISTS idx_test_parts_test_order ON test_parts (test_id, part_order)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_part_item
   ON questions (test_part_id, item_number)`,
  `CREATE INDEX IF NOT EXISTS idx_answer_sheet_versions_assignment
   ON answer_sheet_versions (test_assignment_id, paper_size_id, generation_number)`,
  `CREATE INDEX IF NOT EXISTS idx_answer_sheet_pages_version
   ON answer_sheet_pages (answer_sheet_version_id, page_number)`,
  `CREATE INDEX IF NOT EXISTS idx_answer_sheet_regions_page
   ON answer_sheet_regions (answer_sheet_page_id, global_item_number)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uk_download_snapshots_one_complete
   ON download_snapshots ((1))
   WHERE snapshot_status = 'complete'`,
  `CREATE INDEX IF NOT EXISTS idx_download_snapshot_rows_lookup
   ON download_snapshot_rows (entity_name, entity_key, download_snapshot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_test_results_unsynced
   ON test_results (test_assignment_id, is_synced, result_status)`,
  `CREATE INDEX IF NOT EXISTS idx_scan_sessions_assignment
   ON scan_sessions (test_assignment_id, class_list_id, scan_status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uk_scan_pages_one_current_page
   ON scan_pages (scan_session_id, page_number)
   WHERE page_status NOT IN ('rejected', 'superseded', 'failed')`,
  `CREATE INDEX IF NOT EXISTS idx_scan_pages_unsynced
   ON scan_pages (scan_session_id, is_synced)`,
  `CREATE INDEX IF NOT EXISTS idx_omr_detections_scan_page
   ON omr_detections (scan_page_id, detection_status)`,
  `CREATE INDEX IF NOT EXISTS idx_student_answers_result
   ON student_answers (test_result_id, evaluation_status)`,
  `CREATE INDEX IF NOT EXISTS idx_answer_verifications_answer
   ON answer_verifications (student_answer_id, verified_at)`,
  `CREATE INDEX IF NOT EXISTS idx_answer_rubric_scores_answer
   ON answer_rubric_scores (student_answer_id, score_version)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_items_status
   ON sync_items (sync_id, sync_status)`,

  `CREATE TRIGGER IF NOT EXISTS trg_scan_pages_evidence_immutable
   BEFORE UPDATE OF answer_sheet_page_id, omr_template_id, page_number,
     capture_number, scanner_version, qr_payload, qr_payload_hash, image_uri,
     image_sha256, captured_rotation_degrees, captured_at
   ON scan_pages
   BEGIN
     SELECT RAISE(ABORT, 'scan page evidence is immutable');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_omr_detections_evidence_immutable
   BEFORE UPDATE OF scan_session_id, scan_page_id, answer_sheet_region_id,
     question_id, detected_option,
     confidence_score, detection_status, raw_mark_json, detected_at
   ON omr_detections
   BEGIN
     SELECT RAISE(ABORT, 'OMR detection evidence is immutable');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_objective_answer_value_immutable
   BEFORE UPDATE OF objective_value
   ON student_answers
   WHEN OLD.capture_source = 'omr' AND NEW.objective_value IS NOT OLD.objective_value
   BEGIN
     SELECT RAISE(ABORT, 'objective OMR answer value is immutable');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_objective_answer_manual_verification_blocked
   BEFORE INSERT ON answer_verifications
   WHEN EXISTS (
     SELECT 1
       FROM student_answers answer
       JOIN questions question ON question.question_id = answer.question_id
       JOIN question_types type ON type.question_type_id = question.question_type_id
      WHERE answer.student_answer_id = NEW.student_answer_id
        AND type.question_type_code IN ('multiple_choice', 'true_false')
   )
   BEGIN
     SELECT RAISE(ABORT, 'objective answers use scan verification, not manual answer editing');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_answer_attachments_evidence_immutable
   BEFORE UPDATE OF student_answer_id, scan_session_id, scan_page_id,
     answer_sheet_region_id, source_answer_attachment_id, attachment_type,
     mime_type, image_uri, file_size_bytes, content_hash,
     crop_coordinates_json, captured_at, created_at
   ON answer_attachments
   BEGIN
     SELECT RAISE(ABORT, 'answer attachment evidence is immutable');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_answer_verifications_content_immutable
   BEFORE UPDATE OF student_answer_id, verified_by_user_id, verification_action,
     previous_answer_status, previous_answer_value, new_answer_status,
     new_answer_value, previous_points, new_points, reason_code, reason_detail,
     evidence_attachment_id, verified_at
   ON answer_verifications
   BEGIN
     SELECT RAISE(ABORT, 'answer verification content is append-only');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_answer_rubric_scores_content_immutable
   BEFORE UPDATE ON answer_rubric_scores
   BEGIN
     SELECT RAISE(ABORT, 'rubric score history is append-only');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_scan_pages_delete_blocked
   BEFORE DELETE ON scan_pages
   BEGIN
     SELECT RAISE(ABORT, 'scan page evidence cannot be deleted');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_omr_detections_delete_blocked
   BEFORE DELETE ON omr_detections
   BEGIN
     SELECT RAISE(ABORT, 'OMR detection evidence cannot be deleted');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_answer_attachments_delete_blocked
   BEFORE DELETE ON answer_attachments
   BEGIN
     SELECT RAISE(ABORT, 'answer attachment evidence cannot be deleted');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_answer_verifications_delete_blocked
   BEFORE DELETE ON answer_verifications
   BEGIN
     SELECT RAISE(ABORT, 'answer verification history cannot be deleted');
   END`,

  `CREATE TRIGGER IF NOT EXISTS trg_answer_rubric_scores_delete_blocked
   BEFORE DELETE ON answer_rubric_scores
   BEGIN
     SELECT RAISE(ABORT, 'rubric score history cannot be deleted');
   END`,
] as const;
