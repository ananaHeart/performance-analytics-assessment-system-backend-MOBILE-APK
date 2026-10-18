# Marka mobile redesign v1.2: implementation report

For the designer session (docs workspace). Written 2026-10-18 by the mobile session after implementing `MARKA_MOBILE_REDESIGN_SPEC.md`.

## APK for the "Get the app" page (`appRelease.js`)

- File: `D:\ThesisProjects\MobileAssessmentApp\output\apk\Marka-2026-10-18-v1.2.apk`
- Size: **34,431,935 bytes** (about 32.8 MB; Windows shows 33,625 KB).
- `versionName "1.2"`, `versionCode 3`.
- Signed with the same debug keystore as earlier builds (cert SHA-256 `fac61745…`), so it installs over older Marka builds and keeps saved results.
- Points at the cloud server.
- Heart should replace the Google Drive file with **Manage versions → Upload new version**, so the website link stays the same.

## What logout does to unsent results

Unsent saved results **stay on the phone**:
- Logout only signs out and clears the stored login token.
- Saved results live in the phone's database. Only "Discard saved scan?" deletes them, and a fresh download doesn't touch them.

The confirm dialog is therefore:
- title "Log out?"
- message "Your saved results stay on this phone."
- buttons "Cancel" (secondary) and "Log out" (primary, not danger)

## What changed

Branch `redesign/app-ui`, not pushed:

| Commit | Contents |
|---|---|
| `8fc4b48` | Heart's uncommitted work, saved first |
| `40a9069` | The redesign |
| `8b70db0` | Scan speed and the scanning animation |

Built as specified:
- `src/theme/tokens.ts` with the web's light colors.
- 19 shared components in `src/components/ui/`.
- Every live screen rebuilt on them.
- Marka dialogs replace every `Alert.alert`, with the same titles, messages and buttons.

Proper-app parts:
- pull to refresh, the offline banner, empty states and skeletons
- a "{x} of {y} checked" progress bar
- a status badge on each class card: Synced / Unsynced / No Records, worked out from the results saved on the phone
- the Profile tab: avatar, Help links, About with "Version 1.2", the Log out confirm
- a native launch screen, a white status bar, light only

Removed: the dead bell button and "Forgot Password?".

Extras Heart asked for on 2026-10-18:
1. **Scanning animation.** While a photo is checked, a dark screen shows the photo with green corner brackets and a sweeping scan line. The title is "Reading the answer sheet" and the subtitle is "Finding the corner markers and the QR code, then checking each answer." It adds about 6 KB and no new library.
2. **Faster checking.** Measured on Heart's Honor phone with the same 12 MP photo, 3 runs each:

   | | Before | After |
   |---|---|---|
   | Checking time | 3.10–3.31 s (avg 3.24 s) | 1.00–1.10 s (avg 1.05 s) |

   That's about 3× faster, with the same detected answers and the same preliminary score (5/31). The slow part was QR reading: a slow OpenCV fallback ran before the fast decoder that actually succeeds.

Also fixed: every app start briefly flashed the login form while the saved login restored. The app now shows the Marka mark and "Loading..." instead.

## Labels (spec 0.4)

All kept word for word. Small differences the user guide might mention:
- The button is now "Log out" (was "Logout").
- The header X on the sign-in screen is labeled "Close".
- The Classes empty state: "No downloaded classes yet" / "Pull down to refresh while you're online." with a "Refresh" button.
- Class cards show the subject as the title, with grade and section underneath.
- In Review & Verify, "Accept and Save Result", "Discard All and Rescan" and "Next Student ›" sit in a bottom bar. Accept stays visible but disabled until every written item is scored, with the hint "Score every written-response item above before sending - N remaining." Before, the button was hidden.
- "Send All Saved Results (N)" is a full-width button above the student list.
- "Teacher accounts only" and "Account not active yet" are Marka-style dialogs with the same text.

## Left as literals, and why

- **70 hex colors remain in `App.tsx`**, all in the old V1/V2 checking view that teachers never reach: 8 in its layout and 62 in its styles.
- **The other dead files are unchanged** (spec 0.5): `CheckingGrid`, `OmrScannerModal`, `DashboardHeader`, `StudentList`, `src/prototypes`.
- **`MarkaMark.tsx` keeps `#00B316`.** Every other live screen has zero hex colors.
- **Profile → Synchronization** (the upload screen) is restyled, but it only appears for old V1/V2 accounts. Current teachers can't reach it.

## Please check

1. **Website URL.** The spec gives `https://performance-analytic-assessment-system.onrender.com` (no "s") for `#guide` and `#privacy`.
   - The web repo only mentions `performance-analytics-assessment-system.onrender.com` (with "s"), and that is the API server (`VITE_API_URL`).
   - The app uses the spec's URL, set in `src/config/appInfo.ts`.
   - Please confirm the public site's address. A fix is one line plus a rebuild.
2. **Screenshots.** "After" only, in `docs/redesign/screenshots/`: 13 PNGs at 1264×2736.
   - They cover: launch screen, login, classes, assessment list, the assessment screen (with and without a student selected), the scanning animation, Review & Verify, the "Discard this scan?" dialog, Synchronization, Profile (two parts) and the "Log out?" dialog.
   - There is no "before" set. v1.2 was already installed over the old app on Heart's phone, and going back would mean uninstalling and wiping saved data.
   - The Profile shots show Heart's real name and personal email, and the class screens show the test roster's names. They are not committed to git. Ask Heart before publishing them.
   - No screenshots show saved or official rows. Heart's test class has no saved results, and none were saved for the screenshots.
3. **Not done on the phone:**
   - The largest-system-font check, because it would change Heart's phone settings. Layouts use `minHeight` and wrapping text, but this hasn't been seen at large font sizes.
   - A TalkBack run. Every icon button has a label, and the screen dumps confirm the content descriptions.

## Checks

- TypeScript compiles.
- Jest: 137 tests pass. The only failures are the two `App.test.tsx` suites (native SQLite under Jest), which already failed before this work.
- ESLint: 13 errors and 14 warnings, down from 15 and 14 before.
