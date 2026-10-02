export const V3_MOBILE_MIGRATION_DESIGN_VERSION = '2026-09-07-draft-6' as const;

export const V3_PRODUCTION_SQLITE_MIGRATION_AUTHORIZED = false as const;
export const V3_ACTIVE_ENDPOINT_SWITCH_AUTHORIZED = false as const;
export const V3_V2_RESULT_CARRYOVER_AUTHORIZED = false as const;

export const V3_PENDING_BACKEND_CONTRACT_DECISIONS = [
  'Resolve answer-sheet version, page, and region UUIDs to central IDs during upload.',
  'Finalize scan-page multipart upload and attachment-type handling.',
  'Finalize verification, rubric-score, and authoritative scoring response DTOs.',
  'Confirm whether class-assignment schedules are included in the Mobile download.',
] as const;

export interface V3MobileMigrationPhase {
  phase: string;
  purpose: string;
  mutatesProductionState: boolean;
  authorizedNow: boolean;
  prerequisites: readonly string[];
}

// This is a reviewable gate sequence, not an executable migration.
export const V3_MOBILE_MIGRATION_PLAN: readonly V3MobileMigrationPhase[] = [
  {
    phase: 'validate_isolated_schema',
    purpose:
      'Execute the draft statements only against a disposable or in-memory SQLite database.',
    mutatesProductionState: false,
    authorizedNow: true,
    prerequisites: ['V3 read DTO and fixture parser tests pass'],
  },
  {
    phase: 'backup_v2_database',
    purpose:
      'Create and verify a recoverable copy of the current V2 SQLite database before any migration attempt.',
    mutatesProductionState: false,
    authorizedNow: false,
    prerequisites: ['Explicit owner migration approval'],
  },
  {
    phase: 'create_parallel_v3_database',
    purpose:
      'Create a separate AssessmentStorageV3.db only when the isolated diagnostics screen is explicitly opened.',
    mutatesProductionState: false,
    authorizedNow: true,
    prerequisites: [
      'Final Mobile SQLite data dictionary and ERD approval',
      'No production V1/V2 database replacement',
    ],
  },
  {
    phase: 'read_parallel_v3_diagnostics',
    purpose:
      'Read only the current complete V3 snapshot and report local manifest readiness.',
    mutatesProductionState: false,
    authorizedNow: true,
    prerequisites: ['Parallel V3 database initialization succeeds'],
  },
  {
    phase: 'refresh_parallel_v3_snapshot',
    purpose:
      'Authenticate explicitly from V3 diagnostics, then validate and commit one teacher-owned full snapshot and its manifests to AssessmentStorageV3.db.',
    mutatesProductionState: false,
    authorizedNow: true,
    prerequisites: [
      'Implemented V3 authentication client with in-memory token handling',
      'Explicit user action from the isolated diagnostics screen',
      'Reference-data and download API compatibility tests',
      'No production V1/V2 database replacement',
    ],
  },
  {
    phase: 'carry_forward_v2_offline_results',
    purpose:
      'Map eligible unsynced V2 evidence to exact V3 assignment, manifest, page, and question identities.',
    mutatesProductionState: true,
    authorizedNow: false,
    prerequisites: [
      'Implemented scan-page upload persistence',
      'Approved idempotent upload DTO',
      'Approved UUID-to-central-ID resolution rules',
      'Approved attachment and verification DTO values',
      'Deterministic V2 test-to-test-assignment mapping',
      'Deterministic V2 scan-to-manifest-page mapping',
    ],
  },
  {
    phase: 'switch_active_mobile_runtime',
    purpose:
      'Point production startup and screens to V3 only after rollback and device validation pass.',
    mutatesProductionState: true,
    authorizedNow: false,
    prerequisites: [
      'V3 Assessment Creation implemented and approved',
      'Dynamic manifest and PDF generation validated',
      'POST /api/v3/mobile/scan-pages persistence implemented',
      'Upload persistence and retry tests',
      'Physical template validation for every activated layout',
      'Offline interruption and recovery tests',
      'Explicit production cutover approval',
    ],
  },
];
