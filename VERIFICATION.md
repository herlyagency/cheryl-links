# Verification — October 10, 2026

- Production build: passed.
- Automated tests: 12 passed, 0 failed.
- PostgreSQL schema/RLS, publication isolation, owner restrictions, unsafe styles/URLs, schedules: passed in PGlite with mocked Supabase Auth/Storage schemas.
- Collector limits, invalid/tampered sessions, destination validation, duplicate page suppression, and Turnstile hostname verification: passed with local service mocks.
- Public page and admin: inspected at 390 px and 1440 px widths; no horizontal overflow observed.
- Browser demo: save draft left the public name unchanged; publish updated it. Original sample name restored afterward.
- QR PNG: generated successfully with the QRCode library. Native browser download completion could not be confirmed by the in-app automation download event.
- Sharing asset: included 1200 × 630 PNG with static Open Graph tags.

## Requires external setup / remains unverified

Actual Supabase Auth, hosted storage, live Turnstile/Edge Function deployment, Cron retention, GitHub Actions hosting, DNS, HTTPS, real-device in-app browsers, and production Lighthouse. No accounts or DNS records were changed. Country attribution is unknown pending a trusted provider. Replace sample profile/link information before publishing.

## Live Supabase migrations — October 10, 2026

Applied through the signed-in Supabase SQL Editor to project `xsvtainakcubyoqlrmcy` (cherylxxw link): 001_site, 002_analytics, 003_retention, 004_seed, and 005_function_permissions. Site/analytics/seed transactions reported success; pg_cron returned job ID 1.

Verified five RLS-protected application tables, one seeded private draft, zero published rows, and one active retention job. Anonymous analytics SELECT/INSERT denied. Both anon and authenticated EXECUTE on take_budget denied; service_role EXECUTE allowed. The live Supabase defaults included direct function grants not modeled by the initial mock; migrations now explicitly revoke them and local tests reproduce those defaults.

Owner allowlist remains empty; assigning the existing Auth account is a separate access-authorization step. Frontend project URL/publishable key and collector secrets still require configuration. No production website has been published.
