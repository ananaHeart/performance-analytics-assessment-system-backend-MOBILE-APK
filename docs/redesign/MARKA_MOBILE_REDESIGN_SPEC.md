# Marka Android app redesign

Approved by Heart on 2026-10-18 with: "GO. Use the updated mobile plan: no dark mode, add the proper-app parts, hide the dead buttons, bump the version to 1.2, and save my uncommitted work first."

Written by the designer session in the docs workspace; MOBILE: SCANNER PART 2 implements it. The goals:
- make the app match the redesigned web dashboard: gray page, white bordered cards, dark green buttons, bright green accents
- make it feel like one complete app

**Light mode only. There's no dark mode on mobile.**

## 0. Before you start

1. **Save Heart's work first.** Heart approved this.
   - `git branch --show-current` printed nothing on 2026-10-18, so HEAD may be detached. Check that first.
   - Create the branch `redesign/app-ui` from the current HEAD.
   - Commit today's uncommitted work as one commit before any restyling, for example "Save status pop-up, pinned score and written-only sync fix". That's `V3StatusToast.tsx`, the `V3ObjectiveWorkflowModal.tsx` changes, `dynamicObjectiveSyncService.ts` and the two new tests.
   - Leave `output/`, `tmp/`, the metro logs and the stray `"sessment workflow"` file untracked.
   - Don't push.
2. **Don't change:**
   - scanning or OMR (`SMART-DYNAMIC-ANSWER-SHEET`), offline storage, sync, or any scoring logic
   - `applicationId com.mobileassessmentapp`, the AppRegistry name, or signing (keep the debug keystore so updates install over the old app)
   - the Marka mark (`MarkaMark.tsx` keeps `#00B316`), the launcher icon, and `assets/launcher-logo.png`
   - Don't add Mark-as-Absent. Absent students stay "Not checked".
3. **No new npm or native libraries.** Everything below uses React Native built-ins (`RefreshControl`, `Modal`, `Animated`, `Linking`, `StatusBar`, `ActivityIndicator`) plus the existing lucide-react-native and safe-area-context.
4. **Keep these labels word for word.** The website's user guide quotes them:
   - "Classes", "Synchronization", "Profile"
   - "Email or Username", "Password", "Login", "Verify"
   - "Select test student", "Open Camera", "Choose Photo", "Scan page 1 of 2"
   - "Review & Verify", "Objective answers", "Written-response evidence"
   - "Accept and Save Result", "Discard All and Rescan", "Next Student"
   - "Send Saved Result to Backend", "Send All Saved Results", "Edit Scores", "Discard & Rescan"
   - "Not checked", "Teacher accounts only", "Account not active yet"
   - and the detector's error messages

   If a label has to change, tell the designer session so the website can be updated.
5. **Skip the dead code:** the V1/V2 checking view, `CheckingGrid.tsx`, `OmrScannerModal.tsx`, `DashboardHeader.tsx`, `StudentList.tsx`, and `src/prototypes/`.
6. **Don't install** anything on Heart's phone without asking. Build the APK only at the end, with the low-memory Gradle flags.

## 1. Theme file: `src/theme/tokens.ts`

One exported `theme` object. Screens must import from it. When you're done, no hex values should remain in live screens outside this file and `MarkaMark.tsx`.

### Colors (same values as the web's light mode)

| Name | Value | Use |
|---|---|---|
| `bg` | `#f1f5f9` | Screen background |
| `surface` | `#ffffff` | Cards, headers, tab bar, footers, inputs |
| `surfaceMuted` | `#f8fafc` | Inner sections, table-like headers |
| `surfaceSunken` | `#f1f5f9` | Pressed rows, disabled buttons, skeleton blocks |
| `border` | `#e2e8f0` | Cards and rows |
| `borderStrong` | `#cbd5e1` | Inputs and secondary buttons |
| `text` | `#0f172a` | All primary text (replaces `#17261B`, `#111827`) |
| `textSecondary` | `#334155` | Labels, dialog messages |
| `muted` | `#5b6b80` | Subtitles, "Not checked", inactive tab |
| `faint` | `#94a3b8` | Disabled text and decorative icons only |
| `placeholder` | `#64748b` | Input placeholders |
| `brand` | `#83e841` | Accents only: active-tab bar, card strip, selected-row strip. Never put text on it in light mode. |
| `primary` | `#2f7d16` | Buttons (white text, 5.2:1), links, "Official" scores, green text |
| `primaryPressed` | `#276912` | |
| `primarySoft` | `#f3fee8` | Selected rows, the success banner, the avatar circle |
| `primaryBorder` | `#c9f7a8` | |
| `onPrimary` | `#ffffff` | |
| `danger` | `#dc2626` | Destructive filled buttons (white text, 4.8:1) |
| `dangerPressed` | `#b91c1c` | |
| `logo` | `#00B316` | The Marka mark only |

### Status colors

| Status | soft / bg / border / text | Use |
|---|---|---|
| success | `#f0fdf4` / `#dcfce7` / `#bbf7d0` / `#2f7d16` | "Synced", notices |
| warning | `#fffbeb` / `#ffedd5` / `#fed7aa` / `#c2410c` | "Unsynced", hints, "Answer sheet not ready", Blank |
| danger | `#fef2f2` / `#fee2e2` / `#fecaca` / `#b91c1c` | Errors, Multiple marks |
| info | `#eff6ff` / `#dbeafe` / `#bfdbfe` / `#1d4ed8` | The page-count banner, offline notice |
| neutral | `#f8fafc` / `#f1f5f9` / `#e2e8f0` / `#475569` | "No Records" |
| saved | `#f0fdfa` / `#ccfbf1` / `#99f6e4` / `#0f766e` | "Saved: … · Preliminary" (replaces teal `#0D9488`) |

### Other tokens
- **Spacing:** 4, 8, 12, 16, 20, 24, 32. Screen side padding is always 16.
- **Radius:** `control` 8 (buttons, inputs, pills that aren't round), `card` 8, `dialog` 12, `pill` 999.
- **Type (system Roboto, no `fontFamily`):**

  | Name | Size / line height / weight | Use |
  |---|---|---|
  | `display` | 24 / 30 / 700 | Main tab titles, login "Marka" |
  | `title` | 20 / 26 / 600 | Screen header titles |
  | `cardTitle` | 16 / 22 / 600 | |
  | `body` | 14 / 20 / 400 | |
  | `bodyStrong` | 14 / 20 / 500 | Names, row titles |
  | `label` | 12 / 16 / 500 | Field labels, badges, tab labels |
  | `caption` | 12 / 16 / 400 | |
  | `score` | 22 / 28 / 700 | |

  Use no weight above 700, and remove every `'800'` and `'900'`. Minimum size 12.
- **Elevation:** cards and rows 0 (use the 1px border instead). Sticky footer 8, top pop-up 6, dialogs 12.
- **Touch targets:** every pressable is at least 48×48dp, using `hitSlop` where the visible shape is smaller.
- **Large fonts:** use `minHeight` instead of fixed `height` on rows, inputs, pills and the tab bar, so text can grow with the system font size. Don't set `allowFontScaling={false}`.

## 2. Shared components: `src/components/ui/`

Every screen is rebuilt from these. Each has `accessibilityRole`, and icon-only controls have an `accessibilityLabel`.

| Component | Spec |
|---|---|
| `Button` | Variants: `primary` (primary fill, white text), `secondary` (surface, borderStrong, text color), `danger` (danger fill, white text), `dangerOutline` (surface, danger border, danger text), `link` (no fill, primary text). Min height 48, radius 8, paddingH 16, label 14/600, optional leading lucide icon 18. Pressed state uses the pressed color. `loading` shows a spinner and keeps the label. Disabled: surfaceSunken fill, faint text, 1px border, no elevation (matches the web). Optional `fullWidth`. |
| `IconButton` | 48×48, icon 22, color text. Pressed: surfaceSunken circle. `accessibilityLabel` is required. |
| `Card` | surface, 1px border, radius 8, padding 16. Optional `accent` adds a 4px brand strip on the left edge (the card clips it to its radius). |
| `ListRow` | Min height 64, padding 12×16, title `bodyStrong`, subtitle `caption` (muted or a status color), optional left icon and right accessory (chevron or check). `selected`: primarySoft fill, primaryBorder border, 3px brand left strip. |
| `Badge` | Variants: success, warning, danger, info, neutral, saved. Uses the status bg and text colors, `label` type, paddingH 10, min height 24, radius pill. Wraps rather than clips. |
| `Banner` | Variants: info, success, warning, danger. Status soft fill, 1px status border, radius 8, padding 12, lucide icon 18, optional title (`bodyStrong`), message (`body`) and an optional `Button` action. |
| `ScreenHeader` | White with a bottom border. Min height 56, or 64 with a subtitle. Left: an optional back (ChevronLeft) or close (X) `IconButton`. Title (`title`, up to 2 lines), subtitle (`caption`, muted). Right: an actions slot and an optional busy spinner. Used on every pushed screen and modal. |
| `TabHeader` | For the three main tabs: a large `display` title with a `caption` subtitle, and a right actions slot. |
| `TabBar` | White with a top border. Each tab is at least 64 tall plus the safe-area bottom inset. Icon 22, label `label`. Active tab: primary icon and label, plus a 3px brand bar at the top edge of the tab. Inactive: muted. Labels stay "Classes", "Synchronization", "Profile". |
| `TextField` | Label (`label`, textSecondary) above. Input min height 48, white, 1px borderStrong, radius 8. Focus: 2px primary border. Placeholder color `placeholder`. Error text in danger text 12. Password fields get an eye `IconButton` (48). |
| `SearchField` | A `TextField` without a label, with a leading search icon and a clear (X) `IconButton` when it has text. Min height 48. |
| `EmptyState` | A 56 circle (surfaceMuted) with a muted icon 28, then title (`cardTitle`), message (`body`, muted, centered) and an optional secondary `Button`. |
| `LoadingState` | `ActivityIndicator` (primary) plus a muted message. For lists, use `SkeletonRow`: three surfaceSunken bars in a `ListRow` shape with a gentle opacity pulse (`Animated`). |
| `ProgressBar` | 8 tall, radius pill, track `border` color, fill primary. The label above it, for example "12 of 25 checked", is `caption` muted. |
| `Avatar` | Initials in a 56 circle, primarySoft fill, primary text 20/600. |
| `StickyFooter` | surface, top border, elevation 8, padding 12×16 plus the safe-area bottom. Optional hint line (`caption`, warning text). Buttons in a row, each `flex: 1`. |
| `Toast` | Generalize `V3StatusToast.tsx`. Variants: notice (success colors, closes itself after 4s), error (danger colors, stays), info. Its buttons are `Button`s at 48 tall: "Try again" (danger) and "Dismiss" (secondary). Wrap it in a small `ToastProvider` at the app root, so any screen can show one. |
| `ConfirmDialog` | A transparent `Modal` with fade, backdrop `rgba(15, 23, 42, 0.5)`, and a surface card (radius 12, padding 20, max width 400, 24 margin). Title 18/600, message `body` textSecondary, and buttons right-aligned in a row (they stack when the text is large). Cancel is `secondary`, confirm is `primary`, or `danger` when it deletes. The Android back button cancels. |
| `InfoDialog` | The same as `ConfirmDialog` with one "OK" button. |

## 3. Proper-app parts

1. **Launch screen (native, no library):**
   - Add a launch theme: white `android:windowBackground` with the existing green mark centered, using `drawable/launch_screen.xml` (a layer-list of white plus `ic_launcher_foreground`).
   - Add `values-v31/styles.xml` with `android:windowSplashScreenBackground` white and `android:windowSplashScreenAnimatedIcon` set to the launcher foreground.
   - In `MainActivity`, switch to the normal app theme before `super.onCreate`.
   - The status bar is white with dark icons.
2. **Status bar:** use `StatusBar` with `barStyle="dark-content"` and a white background on screens with a white header, so it isn't fixed to `#F5F6FA`.
3. **Pull to refresh:** add `RefreshControl` (colors `[primary]`) on the Classes list and the assessment list. It calls the same function as the refresh button. On failure, show a toast.
4. **Connection notice:**
   - Restyle the existing "Connecting to the server…" notice as a warning `Banner`, and keep its text.
   - When a download or refresh fails because of the network, show an info `Banner` on Classes: "You're offline. You can keep checking saved assessments and send results when you're back online." Hide it after the next successful request.
   - No NetInfo library.
5. **Empty states** (keep existing text where it exists):
   - **Classes:** title "No downloaded classes yet", message "Pull down to refresh while you're online.", button "Refresh".
   - **Assessment list:** "No assessments yet" / "Activated assessments for this class appear here. Pull down to refresh."
   - **Student search:** "No student matches "{query}"" with a "Clear search" button.
   - **Synchronization:** "Nothing to sync yet" / "Results you save on this phone appear here until you send them."
6. **Loading:** restyle `LoginLoading.tsx` with the mark, a spinner and its existing text. Lists show `SkeletonRow`s on first load.
7. **Dialogs:** replace `Alert.alert` with the new dialogs, keeping every title, message and button label exactly as it is.
   - `ConfirmDialog`: "Discard this scan?" (Keep Reviewing / Discard as danger), "Discard saved scan?", "Discard your changes?", and the new "Log out?".
   - `InfoDialog`: Teacher accounts only, Account not active yet, Session Expired, Login Required, Sync Status, Checking Complete.
   - Keep any existing side effects, such as clearing the login form after "Teacher accounts only".
8. **Progress:** on the assessment screen, show a `ProgressBar` above the student list from the existing "x/y checked" numbers. Label it "{x} of {y} checked".
9. **Profile tab:**
   - **Top:** `Avatar` with initials from the teacher's name, the name (`title`), email (`body`, muted), and a "Teacher" `Badge` (neutral). Only show data the app already has from login, with no new API calls.
   - **Account card:** the existing Account Details, restyled as `ListRow`s.
   - **Help card** (each row has a lucide icon and an external-link icon):
     - "User guide" opens `https://performance-analytic-assessment-system.onrender.com/#guide`
     - "Privacy notice" opens `.../#privacy`
     - "Contact us" opens `mailto:smartassessment.notifications@gmail.com`
     - Use `Linking.openURL`. Put the base URL in `src/config/appInfo.ts`.
   - **About card:** "Marka for Android", "Version {APP_VERSION}", and "A capstone project of Holy Trinity College of General Santos City".
   - **Log out:** a `dangerOutline` full-width `Button` that opens the `ConfirmDialog` "Log out?". **First check what logout does to unsent saved results.** If they stay on the phone, the message is "Your saved results stay on this phone." with a `primary` confirm. If logout deletes them, say so clearly ("Results you haven't sent will be deleted from this phone.") and make the confirm `danger`. Tell the designer session which one it is.
   - The Profile → Synchronization upload screen is restyled with `ScreenHeader` and the shared components.
10. **Dead buttons:** remove the bell `IconButton` on Classes and the "Forgot Password?" link on Login. Leave no empty space where they were.
11. **Version:**
    - In `android/app/build.gradle`, set `versionCode 3` and `versionName "1.2"`.
    - In `src/config/appInfo.ts`, set `APP_VERSION = '1.2'`.
    - Add a Jest test that reads `build.gradle` and fails if `versionName` doesn't match `APP_VERSION`.

## 4. Screen by screen

- **Login:**
  - White screen. The mark (size 40) sits in a 72 primarySoft circle.
  - "Marka" in `display`, then the subtitle in `body`, muted.
  - The "Email or Username" and "Password" `TextField`s, and a `primary` full-width "Login" `Button`.
  - The teachers-only line in `caption`, muted, centered.
  - No "Forgot Password?".
- **Classes tab:**
  - `TabHeader` with "Classes" and its subtitle. The right side has only a refresh `IconButton`.
  - The offline `Banner` when needed.
  - Class `Card`s, white instead of `#EFF1F3`: class name (`cardTitle`), grade and section (`caption`, muted), and a status `Badge` ("Synced" success, "Unsynced" warning, "No Records" neutral).
  - Pull to refresh, the empty state, and skeletons.
- **Assessment list:**
  - `ScreenHeader` with back and the class name.
  - Assessment `Card`s with `accent` (brand strip, replacing the `#84CC16` strip), the test name, and "Date" and "Total Items" as `caption` rows.
- **Assessment screen:**
  - `ScreenHeader` (close X, test name, "Grade - Section · Assignment #N"), then the `ProgressBar`.
  - A `Banner`/`Card` with "Send All Saved Results (N)" when there are saved results.
  - `SearchField`, then the student `ListRow`s. Status line colors: "Not checked" muted, "Saved: … · Preliminary a/b (partial)" in saved text, "Official a/b" in primary with a CircleCheck icon. Selected rows use `selected`.
  - The `StickyFooter` with its hint line and buttons: "Open Camera" (primary), "Choose Photo" (secondary), or "Send Saved Result to Backend" (primary), "Edit Scores" (secondary), "Discard & Rescan" (dangerOutline).
- **Review & Verify:**
  - `ScreenHeader` with the student name, and the pinned score as a `Badge` (success) on the right.
  - The preliminary score `Banner` (success, value in `score`, primary).
  - "Scanned answer sheet" `Card` with the photo.
  - "Objective answers (read-only)" `Card`: a row per item. Option pills are at least 48 tall. The detected answer is filled primary with white text; the others are secondary. Blank uses the warning `Badge` and Multiple the danger `Badge`.
  - "Written-response evidence" `Card`s: the image, then "Right" and "Wrong" as a pair of `Button`s, each 48 tall. When selected, Right is `primary` and Wrong is `dangerOutline` with a danger fill tint. Rubric −/+ use `IconButton`s at 48.
  - Footer: "Accept and Save Result" (primary), "Discard All and Rescan" (dangerOutline), "Next Student ›" (secondary).
- **Edit Saved Scores:** the same components as Review & Verify.
- **Synchronization tab:** `TabHeader`, Sync Overview as small stat `Card`s (count `score`, label `caption`), and Student Scores as `ListRow`s with `Badge`s.
- **Two-step login ("Verify your identity") and "Unable to sign in":** `ScreenHeader`, a `TextField` for the 6-digit code, and a primary "Verify" `Button`.

## 5. Check before handing back

1. TypeScript compiles. Jest passes (the existing tests, the two new ones, and the version test). ESLint stays at or below today's baseline.
2. No hex values in live screens outside `src/theme/tokens.ts` and `MarkaMark.tsx`. Report the grep count.
3. **With Heart's OK**, preview on Heart's phone through Metro, or on an emulator if one fits in memory:
   - every live screen and dialog
   - the system font size at its largest on Login, Classes, the assessment screen and Review & Verify: nothing clipped or overlapping
   - TalkBack reads every icon button
   - all buttons are easy to tap
4. Screenshots with `adb exec-out screencap -p`, before and after, of: Login, Classes, the assessment list, the assessment screen (with saved and official rows), Review & Verify, a ConfirmDialog, the Synchronization tab, Profile, and the launch screen. Save them in `docs/redesign/screenshots/`.
5. Build the release APK the same way as before, with the same debug keystore and the low-memory flags. Name it `Marka-2026-10-18-v1.2.apk`, and report its exact size.
   - Tell Heart to replace the Google Drive file with **Manage versions → Upload new version**, so the website link stays the same.
   - The designer session will update the website's `appRelease.js` (size and version).
6. Send the designer session a report: what changed, what logout does with unsent results, anything left as a literal and why, and anything you weren't sure about.
