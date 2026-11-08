# Verification results — v1.2.2

Static tests passed on 6 Nov 2026:
- Node.js syntax checks: `app.js`, `sw.js`, `firebase-config.js`
- All `$('<DOM-id>')` targets exist in HTML
- Version metadata, service-worker cache and app label all `1.2.2`
- Original IndexedDB database name remains unchanged and schema upgrade adds `requests` store
- Configured Firebase project, three supplied app icons and v1.1.2 duplicate-review code retained
- Role-based private Firestore rules included; no public `allow read: if true`
- JSON report compatibility and immutable weighing event design preserved by inspection

**Not verified in this build environment:** browser-driven smoke test, first-time Firebase sign-in, Firestore Rules compilation / emulator, two-device sync and role enforcement against a live Firebase project. Chromium's local/file navigation is blocked by the test environment's administrator policy. Follow `TEST-CHECKLIST.md` on actual devices before production rollout.

## v1.2.2 new checks
Static checks cover isolated secondary Firebase Authentication user creation, role string alignment (`admin`, `encoder`, `viewer`), in-app permissions/editor, bundle version consistency, retained Firebase config, and ZIP integrity. Live Firebase authentication and operational role enforcement require deployment tests.

### 8 November 2026 checks
- PASS: `node --check` on `app.js` and `sw.js`.
- PASS: every directly referenced `$(id)` in JavaScript exists in the HTML.
- PASS: mock Firebase account-creation success created a `members/{uid}` role and retained the current Admin sign-in.
- PASS: mock Firebase write failure automatically attempted to delete the newly created Authentication account.
- PASS: mock user edit updated role and active status; the only accepted role codes are `admin`, `encoder`, and `viewer`.
- PASS: supplied Firebase configuration for `waste-weighing-2f9a2` and three app icons retained unchanged.
- NOT VERIFIED: Live Firebase project, account email delivery, production Firestore rules enforcement, and real two-device offline synchronization. The Chromium test browser blocked even localhost by administrator policy; no live UI navigation test could run.

## v1.2.2 regression repair
- Restored three duplicate-review helpers omitted from 1.2.1.
- Verified JavaScript parse, version consistency, original Firebase config/rules hash, ZIP integrity and duplicate detection scenarios.
- Run a browser smoke test after deployment to confirm Firebase login in your actual project.
