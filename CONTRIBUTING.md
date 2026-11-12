# Contributing to RepairDesk

Thanks for considering a contribution. RepairDesk is a small, local-first repair-shop tool maintained by IFTIKHAR. Please keep changes aligned with the existing static, vanilla-module architecture and describe user-visible changes and privacy implications clearly.

## Before you start

- Read the [README](README.md) for supported features, storage behavior, and limitations.
- For bug reports, include browser/OS, steps to reproduce, expected behavior, and actual behavior. Do not include real customer names, phone numbers, IMEIs, backups, or screenshots containing customer data. Use synthetic examples.
- For larger changes, open an issue or discussion first so the scope and data-model implications can be agreed before implementation.

## Development setup

The app has no build or bundling step. To run it locally, start a static server in the repository root:

```sh
python3 -m http.server 8000
```

Visit <http://localhost:8000>. Use a modern browser. `localhost` provides the secure-context behavior needed for the PIN derivation and service worker. For testing from another device, use HTTPS.

For the automated checks, use Node.js 20 or later. Dependencies used by the runtime are checked in under `vendor/`; installing npm packages is not required for the documented scripts.

## Checks before submitting

Run both commands from the repository root:

```sh
npm run check
npm test
```

- `npm run check` runs `node --check` on `src/app.mjs`, `src/core.mjs`, `src/store.mjs`, and `tests/core.test.mjs`.
- `npm test` runs `node --test`. The current automated suite focuses on pure functions in `src/core.mjs`: job/status and amount validation, collected-cash date rules, expense and inventory validation, JSON backup validation, jobs CSV round trips/rejection, and synthetic demo records.

These commands are instructions for validating a change, not a claim that checks have been run on every checkout. GitHub Actions is configured to run both on pushes and pull requests to `main`.

### Browser smoke checks

Automated core tests do not exercise the full browser interface, IndexedDB, service worker, or print dialogs. For changes that affect those areas, manually check the relevant flows using a disposable browser profile and synthetic data:

1. Load through `localhost` or HTTPS, set a PIN, lock/unlock, and verify the UI's five-minute inactivity lock behavior if that behavior changed.
2. Create/edit a synthetic job; check search and each of the five statuses. For delivery accounting, enter an advance, later mark a job Delivered with a final balance, and check that only entered cash is included on the correct dates.
3. Add and remove a synthetic expense; add/edit/adjust a part and check its low-stock threshold behavior.
4. Preview and print a receipt, verifying optional phone/IMEI redaction and that the estimate is not represented as a collected balance.
5. Review a WhatsApp message and verify it only opens a prefilled chat after explicit user action; never send messages as part of a test.
6. Export/import JSON and jobs CSV with disposable records; verify confirmation, validation/rejection, replacement scope, and retention of the current PIN.
7. After an online load, check cached static assets offline if service-worker behavior changed. Do not treat browser cache as a data backup.

Do not use production/customer data for development or tests.

## Design and implementation notes

- Keep business rules that can be tested without a DOM in `src/core.mjs`; add or update pure Node tests in `tests/core.test.mjs` for validation, data conversions, dates, and totals.
- Keep browser UI and event flows in `src/app.mjs`, persistence in `src/store.mjs`, and offline shell caching in `sw.js`. Avoid introducing a framework, external runtime request, telemetry, or remote data dependency without discussion and an explicit privacy/security review.
- Preserve the local-only data model and make destructive import/replace behavior explicit and confirmed.
- Treat customer names, phone numbers, IMEIs, device details, exports, and backups as sensitive. Escape user-provided text in generated markup; avoid logging records or including them in error reports.
- Do not describe the PIN as encryption, a security boundary, or brute-force resistant. It is a local UI convenience lock; records and exports remain plaintext.
- Cash totals must reflect only entered advances on job creation and separately entered balances when Delivered, with the documented event dates. Estimates are not receipts. Do not present the dashboard as compliant accounting or tax software.
- Maintain the bundled license notices when modifying/updating vendored Dexie or Chart.js files. Do not replace them with remote CDN dependencies.

## Pull requests

A focused pull request should explain the problem, the change, and how it was checked. Include relevant test updates, note any data-model or backup-format impact, and call out browser-only behavior that needs manual QA. Never include real customer data in fixtures, screenshots, logs, or commits.

By submitting a contribution, you agree it may be distributed under the project's MIT License, as stated in [`LICENSE`](LICENSE).