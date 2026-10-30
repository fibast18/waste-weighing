# Landfill Waste Weighing & Monitoring — v1.1.1 (PUBLIC ACCESS — VERSION & CACHE FIX)
Release date: October 30, 2026. Cumulative update based on v1.1.1; your existing IndexedDB data and backup format remain compatible.

## Summary
- GitHub Pages hosts the website; Firebase Firestore `waste-weighing-2f9a2` syncs the shared data.
- PUBLIC access: no email, no password, no admin/encoder/viewer roles, no membership approvals, and no Firebase Authentication setup required.
- Anyone with the link can open and enter weighings. **In practice, Firestore data is public even without knowing the GitHub link**, because the Firebase web configuration is public by design.
- On every device, app data is first stored in IndexedDB; pending records upload when online.
- All seven tabs, corrections/void event history, reports, AI statistical analytics, CSV and JSON export/import remain available.
- New official icons from the user are included for PWA installation.

## Setup: GitHub Pages
1. Back up existing data in the old app: **Settings → Download complete JSON backup**. Do not clear browser storage or uninstall while there are pending unsynced records.
2. Extract this ZIP. Upload **all files inside the ZIP** to the root of your existing GitHub Pages repository, replacing the old versions. Do not upload the ZIP alone. Preserve the original repository URL and folder to retain offline data on existing devices.
3. The ZIP already includes your supplied `firebase-config.js`; **do not replace it with placeholder config**. It specifies project `waste-weighing-2f9a2`.
4. Verify GitHub repository → Settings → Pages → Deploy from a branch → `main` / `/ (root)`.
5. In each browser, open the GitHub Pages URL while online. Refresh to fetch v1.1.1 if the prior service worker is still controlling it. Check the displayed version.

## CRITICAL: publish the NEW public Firestore rules
GitHub Pages cannot publish Firestore security rules automatically. In the [Firebase Console](https://console.firebase.google.com/), open project **waste-weighing-2f9a2** → **Firestore Database** → **Rules**. Paste the FULL content of the included `firestore.rules`, then click **Publish**. This replaces the old `members`/role rules and allows public reads and validated writes to three shared collections (`entries`, `trucks`, `drivers`).

If you skip publishing these rules, the app will still open and save locally but cloud syncing will fail with **permission-denied**. No Firebase Authentication users, email sign-in, or `members` documents are necessary.

## PUBLIC DATABASE WARNING — read before deployment
These Firestore rules intentionally permit unauthenticated internet users to read weighing records and create new validated weighing events. Anyone can also update truck and driver directory records. Rules validate field shapes, arithmetic and allowed operations, and prevent editing/deleting past weighing events. **They DO NOT prevent fake data, spam, mass creation, quota exhaustion, directory vandalism, or discovery of your database.** A shared URL is not access control. Driver names and all weighing figures are public. Firebase may charge above free quotas. Use this edition only if you accept these risks, have consent/authorization to make records public, and can monitor the Firebase Console. For actual government operational records, consider proper authentication with role controls rather than public writing.

## How to use
1. **Fleet & Drivers:** register truck codes and default empty truck weights, plus drivers. These synchronize across devices when online.
2. **New Entry:** choose date, time, truck, driver and Bio/Non-Bio. Enter actual empty truck weight and truck+trash gross weight; the app calculates `net kg = gross kg - tare kg`.
3. **Overview:** select Today, Week, Month, Custom, or All.
4. **Logbook:** search/correct/void records. History is retained append-only; corrections produce new records.
5. **Reports:** select filters; print or export CSV. **AI Analytics** gives built-in rules-based trends without API payments.
6. **Settings:** review pending count, click **Sync now**, check updates, export/import backups.

## Offline behavior and data safety
- A device must have opened the hosted site once **while online** to cache the PWA. A never-visited GitHub Pages URL cannot launch for the first time without an internet connection.
- The app keeps its original IndexedDB database name `landfill-waste-weighing-v1`, so existing records are retained when updated at the same URL / origin. Devices with a different URL/protocol/browser profile cannot automatically share their old offline data until synced or imported.
- Pending changes are stored locally and uploaded on reconnect; check the sync status. Clearing app data, private mode, device loss, or browser eviction can destroy unsynced records. Export JSON regularly.
- Working online with multiple operators can produce simultaneous corrections or fleet updates; review data quality flags. Offline conflict resolution is not guaranteed.

## Contents
- `index.html` (main app), `styles.css`, `app.js` (v1.1.1)
- `firebase-config.js` (your real supplied Firebase project config)
- `firestore.rules` (NEW public rules for this release — publish manually)
- `sw.js` (v1.1.1 offline shell)
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (your uploaded icons)
- `version.json` (check updates), `.nojekyll`, this README

## Testing before use
1. On Phone A online, add truck, driver, and one 5,200 kg tare / 7,400 kg gross Non-Bio load; verify 2,200 kg net.
2. On Laptop B, open link and verify the truck, driver and 2,200 kg load appear with **no login**.
3. Set Phone A offline and add a second load. Return online and confirm pending count clears and Laptop B sees the new entry.
4. Verify correction, void event history, monthly totals, CSV and JSON backup/restore.
5. Confirm correct Firebase rules are published and monitor unexpected public writes.

Release notes: v1.1.1 removes the prior Firebase sign-in and role checks, uses the existing supplied project config and updated icons, and preserves v1.0.0 features. It is NOT a secure private app.


## v1.1.1 fixes

- **App version:** The Settings > System information label now matches the sidebar, footer, JavaScript, service-worker cache and `version.json`. All display labels read from the JS version source once loaded.
- **Mixed-version startup fix:** Every app update uses new versioned `app.js`, `styles.css`, and `firebase-config.js` asset URLs to prevent the previous service worker from combining v1.0.0 JavaScript with v1.1.x HTML. The old `loginForm` startup error was due to an outdated script running against the no-login public version.
- **Logo fit:** The supplied truck-and-scale logo is constrained to its sidebar icon box, rather than overlapping navigation text. Home-screen icons remain unchanged.
- **App updates:** Check Updates requests a new service worker before reloading to a version-tagged URL.
- **No Firebase setup change:** Your provided Firebase config and public Firestore rules are included unchanged. If they are already correctly published for v1.1.0, no need to republish them.

### Updating installed phones and computers

1. **Back up** local records in Settings before doing a major update, especially if any records are pending sync.
2. Replace **all** original files in the GitHub repository root with the v1.1.1 package (do not upload the ZIP itself); wait for Pages to deploy.
3. While online, visit the normal GitHub Pages URL and refresh. If the old screen remains, open the URL with `?app-update=1.1.1` once (example: `https://your-name.github.io/your-repo/?app-update=1.1.1`).
4. Verify **v1.1.1** in sidebar, footer, and Settings. Your existing IndexedDB database name is preserved. Do not uninstall or clear website data if there are pending offline records.
5. Test New Entry and Settings > Sync now on two devices with non-sensitive test data.

Note: Source-code static checks and local browser checks do not verify Firebase Console's published rules or live cross-device synchronization.
