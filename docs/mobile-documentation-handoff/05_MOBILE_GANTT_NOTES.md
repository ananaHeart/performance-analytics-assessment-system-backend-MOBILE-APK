# Mobile Gantt Chart Notes

Document snapshot: August 22, 2026

Purpose: Supply mobile-only chronological activities to the documentation
manager. This is not the final combined Backend/Frontend/Mobile Gantt chart.

## Recommended Mobile Activity Rows

| Start | End | Activity | Status | Notes/evidence |
| --- | --- | --- | --- | --- |
| February 11, 2026 | February 11, 2026 | React Native project baseline | Completed baseline | Only dated Git commit in current checkout |
| Needs confirmation | May 27, 2026 | Initial teacher mobile checking and V1 SQLite/sync implementation | Completed by May 27; start Needs confirmation | Baseline mobile documentation exists by May 27 |
| June 15, 2026 | June 15, 2026 | Touch-based checking-screen refinement | Completed | Default-correct buttons, compact checking layout, test-part display |
| June 16, 2026 | June 16, 2026 | Student selection/search and navigation refinement | Completed | Student dropdown visibility fix; Classes/Analytics/Profile direction |
| June 16, 2026 | June 16, 2026 | Preliminary local analytics design | Completed direction; current implementation present | June worklog and current AnalyticsView.tsx |
| July 30, 2026 | July 30, 2026 | Cloud backend redeployment supporting mobile cloud preparation | Completed external dependency | User-reported backend milestone |
| July 31, 2026 | July 31, 2026 | Mobile SQLite/backend schema alignment review | Completed | Compared mobile schema with current backend SQL export |
| July 31, 2026 | July 31, 2026 | Grading-period compatibility and local demo-ID cleanup | Completed | schema.js/db.js and dated documentation |
| July 31, 2026 | July 31, 2026 | Result restore and repeat-sync consistency review | Completed previously; current regression needed | MOBILE_APP_DOCUMENTATION.md |
| August 1, 2026 | August 1, 2026 | Cloud-target Android app build preparation | Completed at that time | August 1 worklog and release APK record |
| August 1, 2026 | August 1, 2026 | Sync timestamp and weighted-score payload revision | Completed mobile-side | uploadedAt, maxScore, checkedAt, updatedAt |
| August 1, 2026 | August 1, 2026 | Test-part item mapping verification | Completed mobile-side | testPartId plus part-local itemNumber |
| August 1, 2026 | August 1, 2026 | Item-analysis display revision | Completed | Changed to correct-student counts such as 5/8 |
| Early August 2026 | Early August 2026 | Emulator/native SQLite troubleshooting | Worked on; Needs confirmation | Native loader, startup, and missing-table issues |
| Early August 2026 | Early August 2026 | Emulator-local and device-cloud API target behavior | Current source present; exact date Needs confirmation | src/config/api.ts |
| August 9, 2026 | August 9, 2026 | Fixed-template OMR prototype Test 01 | Prototype completed | Printed 10-item sheet, alignment, confidence, multiple mark |
| August 9, 2026 | August 9, 2026 | OMR scanner/template specification | Prototype documentation completed | A4 geometry, map, statuses, teacher verification |
| August 10, 2026 | August 10, 2026 | Physical QR-enabled MC clean-sheet validation | Prototype completed | 10/10 exact detection |
| August 10, 2026 | August 10, 2026 | Physical OMR verification-routing validation | Prototype completed | Multiple mark detected; unclear blanks withheld |
| August 10, 2026 | August 10, 2026 | QR fallback and four-marker alignment fixes | Prototype completed | Physical-test fixes |
| August 15, 2026 | August 15, 2026 | V1/V2/OMR architecture boundary documentation | Completed documentation | Explicit separation of deployed, prototype, and pending work |
| Approx. August 2026 | Ongoing | Isolated V2 SQLite design alignment | In Progress | Incomplete src/database/v2 scaffold; not integrated |
| August 17, 2026 | August 17, 2026 | Mobile Chapter IV/Gantt handoff package | Completed documentation | docs/mobile-documentation-handoff |
| August 18, 2026 | August 18, 2026 | Android-native MC OMR source integration | Partial integration | OpenCV detector, camera/gallery bridge, review UI, isolated V2 save guard; runtime Needs confirmation |
| August 22, 2026 | August 22, 2026 | V1/V2 connectivity and schema compatibility audit | Completed documentation audit | V1 connected; V2 schema aligned; V2 API wiring pending |
| After database/API freeze | TBD | V2 SQLite migration design approval | Planned | Do not assign a completed date |
| After database/API freeze | TBD | React Native OMR camera production validation | Planned | Source exists; build/device acceptance is pending |
| After camera validation | TBD | Teacher-verification and V2 offline-save acceptance | Planned | Source exists; downloaded V2 context and runtime test are pending |
| After V2 upload availability | TBD | Retry-safe V2 batch synchronization | Planned | Not implemented |
| After full integration | TBD | End-to-end OMR and analytics acceptance testing | Planned | Not implemented |

## Short Chronological List

1. February 11, 2026 - React Native project baseline.
2. By May 27, 2026 - V1 mobile checking/SQLite/sync documented as existing;
   original start date needs confirmation.
3. June 15-16, 2026 - checking UI, student search, navigation, and analytics
   direction revised.
4. July 30-31, 2026 - cloud/backend readiness and mobile SQLite alignment.
5. August 1, 2026 - cloud build preparation, weighted score/timestamp payload,
   item mapping, and item-analysis display revisions.
6. Early August 2026 - emulator and native SQLite troubleshooting; exact dates
   and permanent runtime status need confirmation.
7. August 9, 2026 - initial fixed-template OMR prototype test.
8. August 10, 2026 - physical MC clean/edge-case OMR validation and detector
   corrections.
9. August 15, 2026 - V1, OMR prototype, and pending V2 boundaries documented.
10. August 17, 2026 - mobile documentation handoff prepared.
11. August 18, 2026 - Android-native MC scanner, camera/gallery bridge,
    teacher-review UI, and isolated V2 save guard added in source.
12. August 22, 2026 - V1/V2 connectivity and schema compatibility audit;
    V1 remained connected while V2 network synchronization remained pending.
13. TBD - V2 download, validated phone scanning, upload, scoring, and production
    acceptance testing after database/API freeze.

## Gantt Interpretation Rules

- Do not show OMR as a completed mobile feature.
- Show August 9-10 OMR work as Prototype Validation.
- Show August 18 as Partial Mobile V2 Integration, not deployment.
- Show August 22 as Documentation/Compatibility Audit, not runtime completion.
- Do not assign final dates to V2 integration while the database/API contract
  remains unfrozen.
- Keep backend redeployment as an external dependency, not mobile coding work.
- Use Needs confirmation rather than inventing dates before May 27 or for
  incomplete early-August emulator work.
- Keep Identification and Enumeration OMR outside the initial implementation
  schedule unless the approved scope changes.

## Suggested Status Colors for the Final Combined Gantt

- Completed: green
- In Progress: blue
- Planned: gray
- Prototype only: orange
- Needs confirmation: yellow
- Not implemented/excluded: red or no activity bar
