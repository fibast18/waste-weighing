# Git-based CI/CD for Landfill Waste Weighing

Repository: https://github.com/fibast18/waste-weighing
Production site: https://waste.mysomis.com
Firebase project: waste-weighing-2f9a2

## What changed

The repository now contains `.github/workflows/deploy.yml`. It:
1. Runs on every commit pushed to `main`, and can also be started manually.
2. Checks JavaScript syntax; verifies all needed app files, versions, Firebase project and CNAME.
3. **Only if validation passes**, builds a clean public website artifact and publishes it to GitHub Pages.
4. Runs verification only (no publication) on pull requests to `main`.

No package installation, GitHub ZIP upload, Cloudflare token, Firebase secret, or manual Pages file transfer is required.

## ONE-TIME activation (performed in GitHub UI)

1. Open https://github.com/fibast18/waste-weighing/settings/pages .
2. Under **Build and deployment > Source**, change **Deploy from a branch** to **GitHub Actions**.
3. Do not select a generated GitHub template. This repository already has `.github/workflows/deploy.yml`.
4. Go to https://github.com/fibast18/waste-weighing/actions .
5. Select **Landfill Weighing CI/CD** from the left, select **Run workflow**, select `main`, then run it. A commit pushed to `main` will also run it automatically.
6. Open the run and make sure **Validate app** and **Publish GitHub Pages** both succeed (green check marks).
7. Confirm https://waste.mysomis.com still loads, login works, and the site remains HTTPS.

Before switching Pages to GitHub Actions, the new deployment job might fail because Pages is still using branch publication. The existing branch-published site remains in place until you switch and successfully deploy.

## Future updates

- Make code changes in GitHub or through a connected development tool that commits to this repository. You do **not** need to upload replacement ZIP files.
- For a new version, update `version.json`, `app.js`, `index.html`, `sw.js`, `manifest.webmanifest` consistently; the checks will fail if they disagree.
- Commit changes to `main`. The GitHub Actions workflow will check and publish automatically.
- For safer changes, use a separate branch and pull request, check the green CI status, then merge into `main`.
- If a run fails, open GitHub > **Actions > Landfill Weighing CI/CD** to read the failing step and fix it before trying again.
- To undo a bad code change, revert the corresponding commit (or restore a prior version through a new commit), then the same workflow redeploys it.

## Preserved

- The application and current version, including the Audit Trail and roles, are unchanged by this CI/CD setup.
- `CNAME` is included in the deployed site: `waste.mysomis.com`.
- `firebase-config.js`, icons, service worker and all runtime app assets are included.
- Firestore data, users, Firebase security rules and current browser IndexedDB data are untouched.
- `firestore.rules` is **not** published by the GitHub Pages website workflow. If you modify rules, publish them separately through Firebase Console after reviewing permissions.
- Only public site files are put into the Pages artifact. Documentation, `firestore.rules` and `.github` are not included in the deployed artifact.

## Important offline and security notes

- Before changing site versions or clearing app storage, export a backup of weighing records and verify pending sync is zero.
- Do not clear browser storage or uninstall a PWA with unsynced weighings.
- Frontend file validation does not replace browser testing or Firebase authentication and sync tests.
- Never commit Firebase Admin service account keys, private API tokens, or passwords into this repository.
- A Git commit is required for changes to reach the live website. CI/CD automates **validation and deployment**, not the act of writing the next code change.
