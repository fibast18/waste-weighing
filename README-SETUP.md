# LANDFILL WASTE WEIGHING & MONITORING — v1.0.0

A responsive, installable GitHub Pages web app for smartphone, tablet, laptop and desktop. Created October 30, 2026.

## What is included

- `index.html` — main seven-screen app: Overview, New Entry, Logbook, Reports, AI Analytics, Fleet & Drivers, Settings
- `styles.css` — mobile-responsive styling and landscape print styles
- `app.js` — indexed local data storage, calculations, reporting, dashboard charts, analytics and synchronization logic
- `firebase-config.js` — **EDIT THIS** to connect *your* Firebase project
- `firestore.rules` — **PUBLISH THESE RULES** in the Firestore Rules editor (not used automatically by GitHub Pages)
- `sw.js` — offline app shell and runtime Firebase module caching
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — installable PWA
- `version.json` — published version check
- `.nojekyll` — GitHub Pages compatibility

## 1. Publish on GitHub Pages

1. Create a new GitHub repository such as `landfill-waste-weighing`.
2. Upload **all files from this ZIP** to the repository root (not the ZIP file itself). Keep each filename unchanged. The README and rules can remain in the repository.
3. Go to **Settings → Pages → Build and deployment → Deploy from a branch**; select `main` and `/ (root)`; Save.
4. Open `https://YOUR-USERNAME.github.io/landfill-waste-weighing/` while connected to the internet.
5. On iPhone in Safari: Share → Add to Home Screen. On Android or desktop Chrome: use Install app/Add to Home screen if offered.
6. The app **works without Firebase** in local-only mode, but records then stay on that device until you configure and sign in to cloud synchronization.

**Important offline constraint:** GitHub Pages cannot deliver its HTML/JS for the first time without internet. Every new phone/computer needs **one successful online app visit** to install/cache the shell. Afterward it can open and record weighings offline while browser storage remains intact. Sync is deferred until it is online again. Browser cache/storage eviction, private mode, and uninstalling can erase offline data; back up regularly.

## 2. Create Firebase project and connect

1. Open https://console.firebase.google.com/ and **Add project** (or use a separate existing project intended for this app).
2. Under Project settings → General → **Your apps**, register a **Web app**. Copy only the client-side `firebaseConfig` values to `firebase-config.js`:

```js
window.LANDFILL_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  appId: "..."
};
```

3. Firebase Console > Build > Authentication > Sign-in method > enable **Email/Password**.
4. Firebase Console > Build > Firestore Database > create a database in **production mode** and choose a region.
5. In Firestore > Rules, replace the editor contents with `firestore.rules` from this ZIP and **Publish**. Do not use wide-open test-mode rules.
6. Under Authentication > Users > Add user, create each operator with email/password. Copy the exact UID from the Users page.
7. In Firestore > Data, create a collection named `members`. Add a document where the **document ID equals the user's UID**. Use the fields `active` (boolean `true`) and `role` (string `admin`). Repeat for other operators with roles `encoder` or `viewer`.
8. Update `firebase-config.js` on GitHub Pages, open the deployed app and use **Settings > Sign in & sync**.
9. If Firebase Authentication requires an authorized domain, add the GitHub Pages host (such as `username.github.io`) in Authentication > Settings > Authorized domains.

You must configure Firebase separately. The ZIP contains no active Firebase project, user accounts, or passwords. A web app's Firebase config is public by design; **never upload service account secrets, private keys, or passwords**. Firestore rules, not obscuring the config, protect the shared data.

## 3. Synchronization and access rules

- Every new weighing is immediately saved to **IndexedDB on that device**. Authorized signed-in users upload pending changes and receive changes from other devices through Firestore when online.
- Auth approval is **not automatic**. Each person requires an Authentication user plus a `members/UID` document with `active: true` and `role: admin`, `encoder`, or `viewer`.
- Admin and encoder accounts can submit weighing records and edit truck/driver directories. Viewer accounts have **read-only cloud access**. Access approval documents can only be managed from the Firebase Console.
- Every weighing is an **immutable event**. A correction creates a new event referencing the previous version; voiding creates a void event. The original history remains. A simultaneous correction on two offline devices can create conflicting branches. Analytics flags the situation, and dashboard totals choose the latest event by the devices' timestamps until it is resolved. **Do not use conflicted totals as official records without reconciling the branches.**
- Truck and driver master details can have *last-write-wins* conflicts when edited simultaneously. Coordinate such changes between users.
- Local records added before Firebase configuration or while signed out will be queued for a later authorized encoder/admin upload. Imported records are attributed to the eventual uploading Firebase user.
- Revoking a member prevents future authorized access but **does not remotely erase cached data on an untrusted device**. Use trusted devices, strong passwords and appropriate internal privacy controls.
- Firestore can incur costs beyond applicable free quotas. Monitor usage in Firebase Console. Cloud connectivity is required for synchronization but not for offline local records.

## 4. Daily operations

1. In **Fleet & Drivers**, add each truck code and its standard tare (empty truck weight). Add drivers by name. Disable retired truck codes and former drivers rather than deleting their history.
2. In **New Entry**, select date/time, truck code, driver and Bio or Non-Bio classification. Enter actual tare and gross (`truck + waste`) scale readings.
3. The app calculates `net waste = gross - tare`. Example: `7400 - 5200 = 2200 kg`. A gross reading below tare is rejected. The truck's configured tare is only a default; staff can enter a different actual measured tare.
4. **Overview** shows daily, current week (Monday–Sunday), current month, custom range and all-time totals, with kg per class, load count, daily chart and by-truck breakdown.
5. **Logbook** supports searching and audit-preserving corrections/voids. **Reports** reproduces the daily landfill ledger, including separate Bio and Non-Bio gross and net columns, a total row, CSV exports and print-to-PDF.
6. **AI Analytics** is a free, built-in **rules-based** advisor; it reports category composition, busiest truck, peak day, load averages, tare deviations and potential duplicate loads. It does not modify user data or connect to a paid AI provider.
7. In **Settings**, export JSON backups regularly, especially before app updates or clearing browser cache. Import merges new IDs without overwriting existing ones. Review the pending-sync count after returning online.

**Source sheet warning:** Some waste net values shown in the example image are inconsistent with its gross and empty-truck readings. The app deliberately recomputes net weight and does not reproduce inconsistent source subtotals.

## 5. Troubleshooting & limitations

- **Firebase not configured:** Set all four real fields in `firebase-config.js`, enable Email/Password authentication, publish rules, and create an approved membership document.
- **Cloud says not approved:** Verify exact UID document ID, `active` as a Boolean and role exactly `admin`, `encoder`, or `viewer`.
- **Unsynced changes:** Check online connectivity, valid cloud sign-in, encoder/admin role and cloud error text. **Do not clear browser storage while records remain pending.**
- **Data lost after browser cleanup:** Local data is tied to one browser profile and can be deleted by storage eviction, private mode, cache clearing, uninstalling or device loss. Restore a backup or sync from Firestore if previously uploaded.
- **New GitHub version not appearing:** After Pages publishes, Settings > Check for app updates and reload. App shell updates occur once reconnected.
- **Monthly report:** Adjust date range and select a truck. For browser PDF export, select Print > Save as PDF; landscape format is included in print CSS.
- **Time zone:** Default dates and times are based on **Asia/Manila**. Recorded time is as entered; operators must verify scale date/time and their device clock.
- **First-time offline use:** A never-opened GitHub website cannot launch without internet. After a successful online first visit, the PWA can be used offline as long as browser storage stays intact.

**Production caution:** Before adopting the system as an official landfill registry, verify a real two-device sync, offline queuing/reconnection, security rules, corrections, backup restoration and report calculations. Establish a formal audit/backup policy appropriate for government records.
