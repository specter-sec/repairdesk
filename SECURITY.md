# Security policy

## Scope

RepairDesk is a static, client-side app. Its intended data boundary is one browser profile on one device. There is no RepairDesk account, server-side database, synchronization service, telemetry, or remote API in the application. The GitHub Pages site serves app files; job, expense, inventory, and settings records are stored by the browser in IndexedDB.

This policy documents the current design and its limits. It does not promise that the app is suitable for every sensitivity or regulatory context.

## Threat model and limitations

The app's PIN gate is a convenience measure against casual viewing while the page is locked—not a security boundary against a person who can access the same device/profile. The PIN must be 4–12 digits. RepairDesk derives a PBKDF2-HMAC-SHA-256 verifier using a randomly generated 16-byte salt and 310,000 iterations, and stores the verifier, salt, and iteration count in local browser storage. The PIN itself is not stored. This design does **not** encrypt records, encrypt backups, protect an unlocked device, or establish a claim of brute-force resistance. The UI also locks after five minutes of inactivity, which is only a convenience lock.

IndexedDB records are plaintext to anyone able to inspect the browser profile or use developer tools with access to the page's origin. Browser profiles, device backups, malware, shared-device access, and browser extensions with sufficient permissions are outside the app's protection. No remote service holds a second copy of records for recovery.

**GitHub Pages origin sharing:** project sites under `specter-sec.github.io` share an origin. Another script running under that same origin can potentially access this app's IndexedDB; URL paths are not database isolation. For real customer records, prefer a dedicated HTTPS origin or a dedicated local browser profile and do not run untrusted same-origin apps.

The app's service worker caches static app files, not a synchronized data backup. Browser storage can be cleared by the user, lost with a profile/device, or removed under browser storage management and eviction. A successful online first visit is needed to fetch the app shell and install its cache; offline operation cannot restore missing files or data.

JSON and CSV exports are unencrypted files. They can include customer identifiers and repair details; JSON includes jobs, expenses, parts, and non-PIN settings, while CSV includes job fields only. Store, transfer, print, and delete exports with the same care as the source records. The receipt redaction option can mask phone and IMEI on the printed preview, but does not redact the underlying job or exports; review each receipt before sharing.

## Safe use

- Use a device and browser profile you control; lock the device itself when unattended.
- Do not enter data you are not authorized to store. Customer names, phone numbers, IMEIs, device information, and fault descriptions are sensitive personal or device data.
- Keep periodic backups outside the browser profile and in a location protected according to your needs. Backups are plaintext; avoid untrusted shared folders and messaging them casually.
- Before importing, verify the file and save a backup of current records. JSON replaces jobs, expenses, parts, and included non-PIN preferences; CSV replaces jobs only. Both flows validate and require confirmation, but replacement is destructive. The current browser's PIN is retained.
- Use a supported modern browser over HTTPS, or `localhost` for local development, so browser cryptography and service-worker behavior are available.
- Do not treat the app's totals or receipts as tax, accounting, statutory recordkeeping, or invoice compliance features.

## Reporting a suspected vulnerability

Please report suspected security issues privately to the maintainer through the contact route available from the [GitHub repository](https://github.com/specter-sec/repairdesk), rather than posting exploit details publicly before maintainers can assess them. Include affected version/commit, browser/OS, reproduction steps using synthetic data, impact, and any suggested mitigation. Do not attach real customer records, PINs, or backups. Please allow time for triage and a fix before public disclosure. No dedicated security response SLA is currently stated.

## Dependency and release hygiene

Runtime dependencies are bundled locally: Dexie 4.0.11 (Apache-2.0) and Chart.js 4.4.8 (MIT). Keep their license notices in `vendor/`, review upstream security advisories before updating, and run the documented checks in [`CONTRIBUTING.md`](CONTRIBUTING.md). Updates should be pinned and reviewed rather than loaded from a third-party CDN. The repository's GitHub Actions workflow runs syntax checks and tests before deploying the static site; that is not a security audit or a guarantee that every browser/runtime risk has been eliminated.
