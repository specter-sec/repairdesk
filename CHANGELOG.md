# Changelog

Notable changes to RepairDesk are recorded here. This file describes the documented implementation and is not a guarantee of a particular deployment date.

## 1.0.0 — Initial documented feature set

- Added a responsive, static repair-shop workspace branded for IFTIKHAR, with a local PIN gate and a five-minute inactivity lock.
- Added repair-job records, search/status filtering, editable workflow statuses, print receipt preview, optional phone/IMEI receipt redaction, and a user-reviewed WhatsApp handoff.
- Added dashboard cash and expense summaries, cash-flow charts, expense records, and parts counts with low-stock thresholds.
- Implemented collected-cash totals from entered advances at job creation and separately entered balances when a job is Delivered; estimates are not counted as collected revenue.
- Added PKR-default currency display with PKR, USD, GBP, EUR, and AED preferences; currency selection does not convert amounts.
- Added optional synthetic demo data, jobs-only CSV export/import, and validated JSON backup/restore for jobs, expenses, parts, and non-PIN settings. Imports require confirmation; the current browser's PIN is retained.
- Added a service worker to cache the static app shell and local vendor files for subsequent offline app loading.
- Bundled Dexie 4.0.11 (Apache-2.0) and Chart.js 4.4.8 (MIT), with their license notices.
- Added Node built-in pure-core tests and syntax-check scripts, and a GitHub Actions workflow to run them before Pages deployment.

## Not yet in this release

There is no cloud sync, multi-user account, server-side data storage, encrypted backup, payment processing, automatic WhatsApp sending, job-linked inventory deduction, or accounting/tax/invoice compliance functionality. Screenshots will be added after browser QA; none are claimed by this changelog.