# Deployment acceptance checklist — v1.2.1

**Before migration**
- [ ] Every device exports a JSON backup; document any unsynced entries.
- [ ] Create first Firebase Authentication user and `members/{UID}` admin document in Firebase Console.
- [ ] Upload all app files to GitHub Pages, then publish **PRIVATE** `firestore.rules`.

**Role testing (with separate test accounts)**
- [ ] Nonmember signed-in user is denied Firestore reads and writes.
- [ ] Unauthenticated reader is denied Firestore reads and writes, even with direct SDK calls.
- [ ] Admin can manage fleet and membership; cannot demote/deactivate their own account from UI.
- [ ] Viewer can view dashboard/AI/logbook/reports, export CSV/print PDF, but cannot create/update/delete in Firestore or open entry/fleet/users/requests tabs.
- [ ] Encoder can save new entry; `createdBy` is their Auth UID, and correction of their own record creates a new event.
- [ ] Encoder cannot correct another person's record (test direct forged Firestore SDK call too).
- [ ] Encoder's void request appears to Admin; original weighing remains active until approval.
- [ ] Admin approves a request: one new void event exists and request marked approved. Admin rejects a different request: no void event created.
- [ ] Admin direct void retains original audit event.
- [ ] Firestore refuses update/delete of any existing weighing event.
- [ ] Firestore refuses non-Admin truck/driver/member updates even from modified JavaScript.
- [ ] A disabled member loses cloud access after reconnecting.

**Offline and sync**
- [ ] On previously activated signed-in Encoder device, disconnect network; save a load, see pending count, reconnect and verify exactly one cloud record.
- [ ] Log out with pending changes; sign back in as original Encoder; verify pending work is retained and syncs.
- [ ] Compare totals/duplicates across two devices after syncing.
- [ ] Backup/restore from v1.1.2 retains all records; old `createdBy` device-ID events can be migrated with an Admin only.
- [ ] iOS/Android home screen opens after online first launch; check `sw.js` cache version `v1.2.1`.

**Warnings**
- A manually modified local role cache can mislead *offline UI* but must never pass server Firestore rules.
- Browser IndexedDB is not encrypted. Do not use shared kiosk accounts for sensitive records without device controls.
- Firebase Rules deploy is manual. **Do not treat a screenshot of hidden buttons as a security test.**

- [ ] As Admin, create a second account from **Users & Roles** (name, email, temporary password, viewer role) and verify the Admin session remains signed in.
- [ ] Verify the newly created Auth account can sign in as Viewer but cannot encode or edit cloud data.
- [ ] Create an Encoder from the app and verify weighing upload.
- [ ] Create a second Admin from the app and verify role-management access.
- [ ] Edit a user role and deactivate/reactivate it. Confirm database access is denied for inactive users.
- [ ] Request a password reset from **Users & Roles** and check email delivery.
- [ ] Check that the app displays ONLY `admin`, `encoder`, and `viewer` roles.
- [ ] Verify old `management_viewer` memberships are migrated to `viewer` after rules publication.
- [ ] Ensure failed membership-creation attempts leave no authorized account; review orphan cleanup status.
