# Mobile V2 Download Focused Slice: August 22, 2026

Document snapshot: August 22, 2026

Purpose: Record the bounded V2 download integration completed after the earlier
August 22 compatibility audit. This note does not claim V2 upload or end-to-end
OMR deployment.

## Status

SOURCE-IMPLEMENTED AND TYPE-CHECKED; RUNTIME NEEDS CONFIRMATION.

## Implemented Scope

- The current V1 teacher login remains the required working login path.
- After a successful V1 teacher login, mobile optionally requests a separate V2
  Bearer session through `POST /api/v2/auth/login` using the same credentials.
- Failure to establish the optional V2 session does not block V1 login or V1
  manual checking.
- The existing Download action still performs the V1 download.
- When a V2 access token is available, the same action also calls
  `GET /api/v2/sync/download` with `Authorization: Bearer <token>`.
- A successful V2 response is persisted through the existing isolated
  `saveV2DownloadPayload()` transaction into `AssessmentStorageV2.db`.
- The sync message reports separate V1 and V2 local counts. A V2 failure is
  reported as partial success after a successful V1 download.
- V2 access-token state is cleared during mobile logout.

## Explicitly Not Included

- No V1 SQLite schema or V1 sync payload was changed.
- No V2 SQLite schema migration was added.
- No OMR detector or teacher-review behavior was changed.
- No `POST /api/v2/sync/upload` implementation was added.
- No backend, TiDB, web dashboard, or scoring code was changed.
- No production deployment or device runtime result is claimed.

## Verification

- `tsc --noEmit`: passed on August 22, 2026.
- ESLint for `src/services/authService.ts` and
  `src/services/v2SyncService.ts`: passed.
- Full `App.tsx` ESLint remains blocked by 13 existing unused-variable errors
  outside this focused slice.
- Android build, live V2 login, live V2 download, and physical-device database
  inspection were not run in this slice.

## Evidence

- `src/services/authService.ts`: optional V2 teacher authentication and V2
  access-token response contract.
- `src/services/v2SyncService.ts`: authenticated V2 download request and local
  persistence call.
- `App.tsx`: parallel V2 session state, combined V1/V2 download action, partial
  status handling, and logout cleanup.
- `src/database/v2/downloadRepository.ts`: transactional V2 payload persistence
  and local count queries.

## Next Safe Step

Run the mobile app against a backend started with the V2 profile, log in using
an active teacher available to both current login flows, trigger Download, and
inspect the isolated V2 table counts. Keep V2 upload out of scope until this
download path is confirmed on the emulator or physical phone.
