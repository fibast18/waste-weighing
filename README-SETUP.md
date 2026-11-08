# LANDFILL WASTE WEIGHING & MONITORING — v1.2.2
## In-App User Management Edition | GitHub Pages + Firebase | 8 November 2026

This is a cumulative upgrade from **v1.2.0**, retaining all v1.1.2 improvements. It preserves the seven main app features: Overview, New Entry, Logbook with clickable duplicate review, Reports/CSV/print PDF, built-in AI Analytics, Fleet & Drivers, Settings and JSON backups. It adds Firebase Authentication, approval records for three roles, an Admin-only Users & Roles page, and an Admin-only Void Requests page.

**Important:** This ZIP is a release candidate needing live Firebase account-creation and Security Rules tests. Do not publish the new Rules before backing up records and creating your first Admin. Deployment does not happen automatically when you upload the ZIP.

## 1. Included files (all are required)

- `index.html` and `styles.css` — responsive application, sign-in, dashboard, roles, approvals
- `app.js` — all existing features, local IndexedDB, Firestore sync, auth and role-aware screens
- `firebase-config.js` — **your configured project** `waste-weighing-2f9a2` (not a secret)
- `firestore.rules` — **NEW PRIVATE RBAC RULES**; publish manually in Firebase Console
- `sw.js` — offline shell and Firebase module cache, version `v1.2.2`
- `manifest.webmanifest` and `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — supplied icons
- `version.json`, `.nojekyll`, `README-SETUP.md`, `TEST-CHECKLIST.md`

### Role permissions

| Capability | Admin | Viewer | Encoder |
| --- | --- | --- | --- |
| View Dashboard, Logbook, AI Analytics, Reports | Yes | Yes | Yes |
| Print or export CSV reports | Yes | Yes | Yes |
| Add weighings | Yes | No | Yes |
| Correct weighings | Any | No | Own (created under their Auth UID) |
| Void weighing | Direct; retains original | No | Request Admin approval |
| Manage trucks and drivers | Yes | No | No |
| Create users, edit roles, deactivate and send password resets | Yes | No | No |
| Approve/reject void requests | Yes | No | No |
| Import/export full JSON backups | Yes | No | No |

**Important historical limitation:** Weighings created in public v1.1.x have a device ID in `createdBy`, not an Auth UID. The Admin can correct these; Encoders cannot claim them as their own. A previously unsynced v1.1.x event requires an Admin account to upload after cutover. Export backups before migration.

## 2. Safest upgrade sequence (follow in order)

1. **Pause data entry during migration.** Open v1.1.2 while online on each active device. Check **Settings** and ensure `0 pending` cloud uploads or retain full JSON backups from devices with pending records. Export a JSON backup of the shared data and any extra offline records. Keep files somewhere safe.
2. Open [Firebase Console](https://console.firebase.google.com/) and choose project `waste-weighing-2f9a2`. Go to **Build → Authentication → Sign-in method**, enable **Email/Password**. Do NOT enable Anonymous.
3. In **Authentication → Users → Add user**, create an account for the first Admin with a strong password. Copy its **User UID** (not the email address).
4. In **Firestore Database → Data**, create (or open) the collection `members`. Create a document whose **document ID is exactly the Admin's Authentication UID**. Add these fields with **correct types**:

   | Field | Type | Example |
   | --- | --- | --- |
   | `uid` | string | Exact Authentication UID |
   | `email` | string | Admin's real login email |
   | `name` | string | Administrator name |
   | `role` | string | `admin` |
   | `active` | boolean | `true` |
   | `createdAt` | number | `1793923200000` (example milliseconds) |
   | `updatedAt` | number | `1793923200000` (example milliseconds) |

   If `members` already exists from the old private v1.0.0, **review and bring the first Admin document into this full schema** in Firebase Console. UID must match exactly. The Admin cannot create its own membership through the website.
5. On GitHub, **upload all files from this ZIP (extracted) to the existing repository root**. Keep the same GitHub Pages URL. Wait for the GitHub Pages deployment to finish, then open the page online and verify the sign-in screen says v1.2.2 in its published files (`version.json`).
6. In **Firestore Database → Rules**, replace the old *public* rules with the `firestore.rules` in this ZIP and press **Publish**. This is essential: an app login screen alone does not secure Firebase records. Any old v1.1.x open tabs will stop syncing when the private rules are published.
7. Visit your new GitHub Pages URL, sign in with the Admin account. Verify dashboard entries and trucks appear, access the **Users & Roles** page, and test a non-Admin account.
8. Once the first Admin is signed in, open **Users & Roles → Create a new user**. Enter full name, email, `admin`/`encoder`/`viewer`, and a temporary password (at least 12 characters), then **Create user & assign role**. This creates the Firebase Authentication account using a separate in-memory Firebase app, retaining the current Admin session, then creates its Firestore `members/{UID}` role. Use **Edit** to change roles or disable access and **Reset password** to request an email reset. No Firebase Console steps are needed for subsequent normal user creation.
9. On phones, open online once and sign in to cache the shell/modules. On an already installed iOS Home Screen app, check its version and **do not uninstall or clear website data** while entries are pending sync. Older icon display can be due to iOS icon cache.

### Access configuration

- Role codes are exactly `admin`, `viewer`, and `encoder` (lowercase, no spaces).
- All three roles require an active member document under `/members/{auth.uid}`.
- A member with `active:false`, missing member record or unrecognized role is denied cloud access.
- Admin writes changes in `members` but **cannot demote or deactivate their own account from the UI**.
- Cloud data and membership are enforced by Firestore rules, not merely by hiding controls.
- Firebase email/password sessions remain remembered on trusted devices until sign-out.

## 3. Offline operation and limitations

- **First visit and first sign-in need internet.** GitHub Pages cannot open for the first time with no network.
- Thereafter, a previously signed-in session can use the app offline, if the service worker and Firebase auth modules are cached, browser storage is retained, and a previous online membership verification on this device is no more than **7 days** old.
- Encoders can create weighings, correct their own weighings, and queue void requests while offline. The Admin can work on ordinary weighing records offline; **Admin role changes and void request decisions require internet**. All writes are checked again by Firebase rules upon upload.
- If access is revoked while a device is offline, it may still display its cached local data until it reconnects. Revocation prevents **future server-authorized access**, not physical erasure of cached records. This is **not** a security boundary against people who control a device or developer tools.
- The app stores local data in the **existing IndexedDB database `landfill-waste-weighing-v1`**, upgraded from IDB schema 1 to 2 by adding a `requests` store. Existing entries/trucks/drivers/outbox records are preserved.
- In this release Firestore's own SDK uses an **in-memory** cache. Offline app records remain in IndexedDB and queue for sync. Browser local storage is **not encrypted**. Use trustworthy devices; do not share a device account between untrusted personnel.
- Browser cache eviction, private browsing, uninstall or clearing site data can remove offline changes. Export backups before risky device/app changes. If online upload has not succeeded, do not assume the cloud has your entry.

## 4. How daily operations work

- **Admin:** adds trucks/drivers (Fleet & Drivers), grants roles (Users & Roles), examines Analytics and duplicate-review Logbook, directly corrects/voids weighings, and approves/rejects Encoder void requests from Void Requests.
- **Viewer:** can review data, view AI analytics, print/CSV reports; does not see or use data-modifying pages.
- **Encoder:** chooses truck+driver and weighs the delivery; net waste automatically computes `gross − tare`. Can correct only weighings created under their signed-in Auth UID and request voids for questionable tickets. Requests are reviewed online by Admin. Every correction or void appends an audit event; originals are never overwritten or deleted.
- The built-in AI Analytics is **rules-based statistics**, not a paid generative AI service. The clickable duplicate-review workflow from v1.1.2 remains.
- **Importing backups is Admin-only.** On a new device, existing cloud records should download when its authenticated Admin/Viewer/Encoder signs in.

## 5. Firebase security and common problems

- If a user sees **Not approved**, check both their Authentication UID and `members/{UID}` document: exact role spelling, Boolean `active:true`, schema.
- If cloud says **Permission denied**, publish the new `firestore.rules` and ensure you signed in as a valid active member.
- If older public app shows **Sync issue** after cutover, update to v1.2.2. Do not republish the public rules to fix it.
- **Existing local unsynced legacy entries** have `createdBy` set to a device ID from the old public release. **Sign in as an Admin on that original device** to upload, or export that device's JSON and import using an Admin device. Non-Admin upload of legacy entries is refused.
- Membership security-rule `get()` lookups may count as Firestore reads; monitor quota/use in Firebase. Free-tier limits apply.
- This package is **not a Cloudflare Worker integration**. It stays on GitHub Pages with Firebase. You can link to it from the existing Cloudflare website; a custom domain or protected Cloudflare-hosted version is a separate deployment.
- If GitHub Pages still shows an old version, use Settings → Check for updates, refresh while online, and verify `version.json`. Do **not** clear offline data while unsynced.

## 6. Limitations and rollout tests

No Firebase project was changed and no live Auth accounts or Rules were created by this ZIP. **The first Admin and new rules need one-time setup in Firebase Console; later user creation is performed inside the app.** The bundle has only client-side code and Firestore rules, not a secure server or a master password. The exact code/static checks do not prove production authorization — test all roles in Firebase Rules Playground/Emulator and on two real devices before treating the system as an official record source. See `TEST-CHECKLIST.md`.

**Developed by Engr. Rico J. Pono**


## v1.2.2 — Add users directly inside the app

**One-time bootstrap only:** create the initial Admin Authentication account and `members/{UID}` document in Firebase Console as described above. After that, Admin uses **Users & Roles** in the app to create additional Admin, Encoder, and Viewer login accounts. Firebase remains the underlying authentication/database service; you no longer need to visit its console for ordinary user creation.

**Technical method:** the website creates new Firebase Authentication email/password accounts in an isolated, in-memory *secondary Firebase app* so the logged-in Admin is not signed out. The primary Admin Firestore session then grants that account's exact UID a validated role. If assigning the role fails, the app attempts to delete the newly created login as a rollback. If rollback fails, the resulting account has no permitted cloud access; a project owner must reconcile the orphaned account. All account operations require a network connection.

**Security limitations:** Firebase's client-side email/password signup API can also be called by someone outside this app. The Firestore rules prevent unapproved accounts from reading or writing operational data, but this client-side approach does **not prevent outside attempts to create unapproved Authentication accounts** and can lead to signup abuse or quota pressure. To completely restrict account *creation* to Admins, use a server-side provisioning API (e.g., Cloudflare Worker with tightly protected Google credentials). Never put Firebase service-account private keys in GitHub or this ZIP.

**Migration from v1.2.0:** old role code `management_viewer` is replaced with the exact required `viewer`. If any existing membership documents have `management_viewer`, the first Admin must change them to `viewer` after publishing the updated v1.2.2 rules. Existing `admin`/`encoder` roles remain unchanged. Admins should perform a complete synced backup before updating. Do not overwrite or delete existing `entries`, `drivers`, `trucks`, or IndexedDB data.

**Deactivation:** `active:false` prevents future Firestore access but doesn't delete Authentication accounts, forcibly revoke already-issued tokens, or wipe offline local data. Use trusted devices and a separate security response process when access must be revoked urgently.


## v1.2.2 startup repair (Nov 8, 2026)

Fixed the `Can't find variable: findPossibleDuplicates` error on Safari during pre-login startup. All three duplicate review functions are restored from the previously working v1.1.2 release. Without them, the initial local data rendering failed before Firebase authentication could load, producing the misleading `Firebase not initialized` message. The app also now reports startup issues separately from IndexedDB-storage failures. Firebase config and RBAC rules are byte-identical to v1.2.1; no new Firebase rules need publishing solely for this repair. The same IndexedDB database name and stores are preserved.

### Deploy

1. **Do not delete browsing data, the site, or the app** if local entries may be unsynced.
2. Upload all v1.2.2 files to the same GitHub Pages repository root, replacing the old version.
3. Visit the existing GitHub Pages URL while online; refresh/reload and check for version **v1.2.2**. If caching delays the update, append `?app-update=1.2.2` to the URL and reload.
4. Try the Admin email/password login. If it still fails, check Firebase Authentication Email/Password sign-in, Auth Authorized domains, and the Admin `members/{uid}` document.
5. Publish the included private firestore.rules if they have not already been published. Verify three-role access.

No changes were made to your remote Firebase data or user accounts by generating this ZIP. The live Firebase login must still be checked on your deployed site.
