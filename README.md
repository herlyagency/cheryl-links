# Cheryl’s little corner of the internet

A mobile-first, single-owner link-in-bio platform for **cherylxxw.com**. React + Vite + Tailwind CSS, GitHub Pages, Supabase Auth/Postgres/Storage/Edge Functions, Lucide icons. The public page loads separately from the admin dashboard; QR generation is lazy-loaded. Lightweight SVG charts avoid a chart-library dependency.

## Try it locally

Requirements: Node 24 and pnpm 11.25.0 (or Corepack with the version in package.json).

```sh
pnpm install
pnpm dev
```

Open the printed localhost URL. Visit `/admin` to use the **local demo**. Without environment configuration, demo drafts and published settings persist only in that browser. No login is claimed, and analytics remain empty. Unconfigured production builds show a setup message; the deployment workflow rejects missing Supabase variables.

```sh
pnpm test
pnpm build
pnpm preview
```

The source uses realistic sample copy, platform homepages, a monogram avatar, and `hello@example.com`. Replace every sample destination and the email address before publishing. No actual accounts or profile photograph were supplied.

## Architecture

- Public visitors fetch `get_public_site()` through the Supabase REST API. They cannot directly read configuration tables.
- `/admin` uses password authentication plus a **server-side owner UUID allowlist**. Signing in with any other account grants no owner access. There is no signup interface.
- `site_drafts` and `site_published` each hold one validated JSON document with `profile`, `theme`, ordered `links`, and ordered `socials`. For a bounded single-user site, this is simpler than synchronized profile/link/theme tables. SQL validates document size, link count, UUIDs, URLs, styles, and schedules. Publishing atomically copies the entire draft. Draft saves never leak to visitors.
- Hidden, future, and expired links are removed server-side by the public RPC. Every new visit sees published changes; an already open page refreshes configuration every 60 seconds and checks schedules locally every 30 seconds.
- Uploaded images live in a public Storage bucket. Only the owner can upload, list, or delete. Do not upload private images. PNG/JPEG/WebP only, 3 MB limit; the editor decodes uploads and caps dimensions at 4096 px. Remove unused files from the Storage dashboard when needed.
- Analytics go through a public Edge Function that validates Cloudflare Turnstile, signs a short-lived session, validates event IDs and active destinations, limits requests, and inserts with the server-only service role. No public insert policy or public collector RPC exists.
- Raw IPs are not saved. A server-keyed hash rotated daily is used only in two-day limiter buckets. Referrers are hostname-only. Country is **unknown**, because GitHub Pages does not provide trusted geographic data to this collector. Never infer it from language/timezone or accept an arbitrary country from a visitor. If geography is essential, add a trusted proxy/provider and validate its server-side country header, or use Cloudflare Web Analytics separately.

## 1. Configure Supabase

1. Create a free Supabase project. Keep its database password and service-role/secret keys private.
2. In **Authentication → Users**, create the one owner account with an email and strong password; ensure it is confirmed. Copy that user’s UUID.
3. In Auth settings, **disable new user signups**. The app never calls signup, but this disables the public signup API as well.
4. Set the Auth Site URL to `https://cherylxxw.com` and allow `https://cherylxxw.com/admin/` as a redirect. Add localhost only if developing against this project. The implemented login uses email/password, not magic-link emails.
5. Run the SQL files in `supabase/migrations` in numbered order using SQL Editor. Enable the **Cron** integration before `003_retention.sql`. Run each migration once. Cron deletes events older than 90 days and limiter buckets older than two days. Check Cron run status; retention is not active until this succeeds.
6. Set the allowlisted owner (replace the placeholder):

```sql
insert into public.site_owner(user_id)
values ('YOUR-OWNER-UUID'::uuid);
```

There can be only one owner row. To deliberately change ownership later, use SQL Editor rather than exposing owner management to the browser.

7. Copy `.env.example` to `.env`. Add the project URL and **publishable key** (the older anon key also works). These are designed to be public and rely on RLS. Never use a service-role or secret key in any `VITE_` variable.
8. Restart the dev server. Visit `/admin`, sign in, replace the sample content, **Save draft**, review the preview, then **Publish changes**. The seeded draft starts unpublished. The public page displays an unavailable/setup message until the first publication.
9. Confirm anonymous reads and writes with the verification checklist below. Keep RLS enabled.

## 2. Configure optional analytics

Leave `VITE_ANALYTICS_ENABLED=false` until setup and privacy review are complete. Link management works without analytics.

1. Create a free Cloudflare **Turnstile** widget in Managed mode. Add `cherylxxw.com` and `www.cherylxxw.com`. Cloudflare does not need to host your website or DNS for this widget.
2. Set `VITE_TURNSTILE_SITE_KEY` in `.env` and repository variables. This key is public. The visitor explicitly opts in before the widget or collector is loaded. GPC and Do Not Track suppress collection.
3. Use Supabase’s Edge Functions deployment workflow or CLI to deploy `supabase/functions/collect`. With the CLI, link your project from this repository, set secrets, then:

```sh
supabase functions deploy collect --no-verify-jwt
```

`verify_jwt=false` is intentional for this public endpoint. **Turnstile and HMAC session verification are implemented inside it.** It is not the admin authentication mechanism.

Set these function secrets through the Supabase dashboard/secret manager (keep them out of Git and frontend code):

| Secret                     | Value                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| `TURNSTILE_SECRET_KEY`     | Turnstile widget secret                                                  |
| `ANALYTICS_SIGNING_SECRET` | At least 32 random characters, preferably 32 random bytes encoded as hex |
| `ALLOWED_ORIGINS`          | `https://cherylxxw.com,https://www.cherylxxw.com`                        |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. For local verification, use a separate test project, the documented Turnstile test keys, and explicitly allowed localhost origins; never deploy test keys to production.

4. Set `VITE_ANALYTICS_ENABLED=true` and rebuild. Allow analytics on the public page, complete Turnstile if it asks, visit a tagged URL, click a link, and check `/admin → Analytics`.
5. Use tagged social links such as `https://cherylxxw.com/?utm_source=instagram&utm_medium=bio`. UTM source wins over the referral hostname; missing attribution is `Direct / unknown`.

### Reliability and abuse limits

- Click collection uses `fetch(..., { keepalive: true })` without blocking navigation; failures never prevent opening a link. Beacon is not required because the small keepalive request carries a JSON body and works with the cross-origin CORS endpoint.
- Each event has a UUID; duplicate inserts are ignored. One page view is accepted per signed session. Refreshing the page creates a fresh session and legitimately counts another page load. Session lifetime is 30 minutes; a tab kept open longer stops collecting until reloaded. Failed requests are not repeatedly retried, so traffic can be undercounted.
- Limits: **6,000 collector requests/day globally**, **1,000 new sessions/day globally**, 120 requests/minute per daily IP hash, 30 sessions/hour per hash, 60 events/minute per visitor. Edit `handler.ts` only after comparing actual usage against the free plan.
- Verify how your deployed gateway supplies `x-forwarded-for` before treating that IP-derived limit as authoritative. The widget verification, signed sessions, destination validation, and global database counters work independently of header trust. CORS alone is not authentication.
- Turnstile filters common automated traffic, but neither it nor any public endpoint guarantees perfect bot exclusion. Attackers can consume Edge Function invocation quotas even when rejected. This stack is appropriate for normal personal traffic, not guaranteed DDoS immunity. If abused, disable analytics and keep links working, then add provider-level controls or use Cloudflare Web Analytics as the simpler alternative. The latter is separate aggregate reporting and does not supply this dashboard’s full source → destination event dataset.
- Unique visitors and repeat visitors are **estimates** based on a consented browser ID. Cleared storage, multiple devices, denied consent, ad blockers, and in-app restrictions affect counts. Returning visitors means IDs seen before the selected range within the 90-day retention window.
- Source → destination shows outbound interest, not confirmed downstream purchases. CTR is clicks/page views and can exceed 100%. The dashboard reports at most 20,000 events per selected range and displays an explicit truncation warning; choose a shorter range for full exports.
- Withdrawal clears the browser visitor ID and stops further tracking. Historical anonymous events expire through retention. No precise GPS, raw IP, or full referral URLs are saved. Add any privacy notice your actual deployment requires.

## 3. Deploy to GitHub Pages

1. Create a GitHub repository and upload **the contents of this folder**, including `.github`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`. Do not upload `.env`, `node_modules`, or `dist`. For no-cost GitHub Pages with GitHub Free, use a public repository; all source in it is public.
2. Under **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_TURNSTILE_SITE_KEY` if collecting analytics
   - `VITE_ANALYTICS_ENABLED` = `true` or `false`
3. Under **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` or run **Actions → Deploy to GitHub Pages → Run workflow**. Tests must pass before the build/deployment proceeds.
5. In Pages settings, enter **cherylxxw.com** as the custom domain. The workflow cannot set your account/domain configuration itself.
6. The build emits `admin/index.html` so `/admin` redirects to `/admin/` and works when opened directly on Pages. Root asset URLs assume the custom domain or a root user-site repository. A repository subpath such as `username.github.io/repository/` needs a different Vite base and routing setup; use the custom domain for this project.

The custom domain is also recorded in `public/CNAME` for clarity; with the Actions artifact workflow, **Pages settings are authoritative**.

## 4. Connect cherylxxw.com safely

First verify ownership in **GitHub account Settings → Pages → Add a domain**. GitHub gives an exact TXT name/value, typically `_github-pages-challenge-YOURUSERNAME.cherylxxw.com`. Add that record at your registrar and complete verification. Keep the verification TXT record.

Add/change **only website address records**:

| Type  | Host/name | Value                            |
| ----- | --------- | -------------------------------- |
| A     | `@`       | `185.199.108.153`                |
| A     | `@`       | `185.199.109.153`                |
| A     | `@`       | `185.199.110.153`                |
| A     | `@`       | `185.199.111.153`                |
| CNAME | `www`     | `YOUR-GITHUB-USERNAME.github.io` |

Use your actual GitHub user/organization hostname, without the repository name or `https://`. If using Cloudflare DNS, start with DNS-only while GitHub checks the domain and provisions HTTPS. Remove conflicting **website** A/AAAA/parking records only after comparing your existing zone. IPv6 is optional; add GitHub’s documented AAAA values if needed rather than leaving an unrelated website AAAA record.

**Do not remove or change MX, SPF, DKIM, DMARC, or other email verification records.** No DNS records have been changed by this project.

After GitHub’s DNS check passes, enable **Enforce HTTPS** under Pages. Propagation and certificate provisioning can take time. Visit both `https://cherylxxw.com` and `https://www.cherylxxw.com`; Pages should redirect the secondary hostname to the configured canonical domain.

Troubleshooting:

- DNS check failing: compare all apex A records, any AAAA records, and `www` CNAME; remove only stale website targets. Do not use a wildcard record or a registrar URL-forwarding/parking service for the website.
- HTTPS pending: wait for propagation, recheck the custom domain, and check restrictive CAA rules. GitHub documents `letsencrypt.org` as necessary when CAA records exist.
- Blank app: check Actions succeeded, public environment variables are set, Supabase is active, migrations ran, and a draft was published.
- `/admin` missing: deploy the generated `dist` artifact using the provided workflow; ensure `dist/admin/index.html` exists.
- Signed-in account denied: its Auth UUID must exactly match `site_owner.user_id`; an email address alone does not authorize it.
- No analytics: tracking must be enabled, consent allowed, GPC/DNT absent, widget hostnames correct, function secrets configured, and collector deployed. Check network status and Supabase function logs without logging request bodies, tokens, IPs, or credentials.

## SEO and sharing

`index.html` contains static title, description, canonical, Open Graph, Twitter preview, favicon, and an included 1200×630 PNG sharing image. Social crawlers can read these without running React. Changing profile information in the dashboard does **not** regenerate these tags; edit `index.html` and `public/social-preview.png`, then redeploy when the sharing identity changes. Ordinary links/themes do not require a deployment. For fully dynamic crawler content, move to an SSR/static-generation host; GitHub Pages cannot execute a server.

The PNG and SVG monogram are editable sample assets, not a claimed photograph. All public destinations use safe URL schemes and external links use `noopener noreferrer`. The layout includes touch targets, keyboard focus outlines, reduced-motion support, safe-area spacing, and semantic HTML. Custom colors can reduce contrast: check any custom theme before publishing.

## Costs and free-tier trade-offs

The app needs GitHub Pages, Supabase, and (only for analytics) Cloudflare Turnstile. Domain registration/renewal remains your existing registrar cost. No paid Supabase custom API domain is required.

Checked against official documentation on October 10, 2026: Supabase’s free allowance includes a 500 MB database and 500,000 Edge Function invocations; inactive free projects can pause after seven days. These are allowances, not an uptime or cost guarantee. The app fails gracefully when the database/collector is unavailable; the collector failure never blocks outbound navigation from an already loaded page. Images, event indexes, and quota attacks can exhaust allowances. Monitor your actual usage and current provider terms; do not auto-upgrade to a paid plan to solve normal setup errors.

References:

- [GitHub custom-domain and DNS documentation](https://docs.github.com/github/working-with-github-pages/managing-a-custom-domain-for-your-github-pages-site)
- [Supabase free-plan billing allowances](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase free-project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase Edge Function rate limiting](https://supabase.com/docs/guides/functions/examples/rate-limiting)
- [Turnstile setup and server validation](https://developers.cloudflare.com/turnstile/get-started/)

## Verification and maintenance

Automated `pnpm test` covers unsafe URLs, scheduling boundaries, attribution, CSV formula injection, signed-session tampering/expiry, event validation, collector rejection/limits/destinations, and PostgreSQL RLS/publish behavior using PGlite. Storage/Auth schemas are mocked for local SQL tests; these are not a substitute for real Supabase verification. The edge handler is transpiled and exercised locally; Supabase deployment and real Turnstile verification require your accounts.

Before making the domain public:

- Check public page and admin at phone/tablet/desktop widths; check iPhone Safari, Android Chrome, Instagram/TikTok in-app browsers with your real destinations.
- In an incognito window, public reads should work and `/admin` should show login. Direct draft/analytics table requests and public event inserts should be denied.
- Sign in as an unrelated account: it should be rejected by both the UI and owner-protected database operations. Disable registration after creating the owner.
- Save an edit: public page must stay unchanged. Publish it: refresh public page and verify it changed. Test reordering, hidden links, future/expired schedules, upload limits, and keyboard controls.
- Visit a UTM-tagged URL, allow analytics, click a link, then verify source → destination, CSV contents, and rejected forged/duplicate events. Confirm Cron retention is actually running.
- Verify the HTTPS certificate, canonical hostname, static sharing preview, image sizes, and Lighthouse in your production environment. No Lighthouse score or real-device compatibility result is claimed before those checks.

Export site settings from **Share & tools** and analytics CSV from **Analytics**. Keep backups of SQL/source and public content. Check Supabase activity, Cron results, bucket size, and event storage periodically. Rotate collector secrets only through the secret manager; old signed sessions then stop working until refresh. Keep your dependency lockfile and review provider/library updates before deploying them.


## Appearance and link thumbnails

Selecting a mood applies its colors, typography and layout to the draft and live preview. Custom link styles are cleared by default so cards follow the mood; turn on **Keep custom link styles** to preserve them. Content, visibility, schedules and thumbnails remain unchanged. Save the draft or publish to persist the appearance.

YouTube video URLs automatically use a video thumbnail, including watch, youtu.be, Shorts, live and embed URLs. A manual thumbnail takes priority. Featured cards display the image at a larger size. Failed images fall back to the platform icon or decorative artwork. Channel and playlist URLs do not identify an individual video. Instagram profiles/posts use a manual upload or image URL; automatic Instagram metadata retrieval is not implemented.

## Optional legacy follower sync and Open Graph setup

The current interface uses manual follower counts (see below). These server integrations remain available for a future return to automatic syncing.

1. Run `supabase/migrations/006_followers.sql` once in the Supabase SQL Editor. It adds the private follower cache, public aggregate RPC, and validates the new look/motion settings while allowing older drafts.
2. Deploy both owner-protected functions from the repository:
   ```sh
   supabase functions deploy link-preview --project-ref xsvtainakcubyoqlrmcy --no-verify-jwt
   supabase functions deploy sync-followers --project-ref xsvtainakcubyoqlrmcy --no-verify-jwt
   ```
   They validate the Supabase owner JWT themselves. The follower endpoint also accepts the separate scheduled-sync secret; the preview endpoint does not.
3. Set `FOLLOWER_ACCOUNTS_JSON` in **Supabase → Edge Functions → Secrets**. Its value is an array, with one entry per authorized account (up to 10). Multiple Instagram accounts can be included. Example with placeholders:
   ```json
   [
     {"platform":"youtube","id":"YOUR_CHANNEL_ID","token":"YOUR_YOUTUBE_DATA_API_KEY","label":"YouTube"},
     {"platform":"instagram","id":"YOUR_PROFESSIONAL_IG_USER_ID","token":"YOUR_FACEBOOK_GRAPH_ACCESS_TOKEN","label":"Instagram"},
     {"platform":"tiktok","id":"YOUR_OPEN_ID","token":"YOUR_AUTHORIZED_ACCESS_TOKEN","label":"TikTok"}
   ]
   ```
   Only include accounts whose credentials are ready. YouTube uses the Data API channel statistics; its subscriber count is rounded by YouTube. Instagram uses a professional account and Facebook Graph API v24.0 `followers_count`, with an appropriately authorized account token. TikTok requires the user's approved `user.info.stats` scope. Personal Instagram profiles and arbitrary public TikTok handles cannot be synced by this implementation. This PR does not create developer apps, request platform approvals, implement OAuth connection screens, or refresh expiring access tokens. Renew expiring tokens in Supabase secrets. Do not paste API credentials in GitHub code or frontend variables.
4. Generate a separate secret with `openssl rand -hex 32`. Set **the same value** as `FOLLOWER_SYNC_SECRET` in Supabase Edge Function secrets and GitHub **Actions → Secrets**. The legacy `Sync follower counts` workflow supports manual runs only. Without this secret it skips collection. Its results are separate from the manually entered totals currently shown on the site.
5. The current interface does not invoke automatic syncing or display its cached total. The legacy GitHub workflow can be run manually if credentials are configured; it no longer has a daily schedule.

WithRose, Vimeo, Instagram, and TikTok use direct Open Graph extraction with validated redirects, a timeout, and a 256 KB HTML cap. Other public web links use the metadata service described below. YouTube video thumbnails also work directly. Manual images take priority; changing the destination clears only previously fetched previews. Login-walled or bot-blocked pages can return no image. Public visitors load saved images, not the preview endpoint.

New looks: Neon Night, Rose Paper, Ocean Glass, Bold Studio. Entrance animations are optional and disabled for visitors with reduced-motion preferences. Existing themes default to Classic/Still. Mood selection clears custom card styles unless **Keep custom link styles** is enabled.

API references: [YouTube channel statistics](https://developers.google.com/youtube/v3/docs/channels), [TikTok User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/), [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/).

### Default rich link previews
Every public HTTP/HTTPS link requests a rich preview automatically in the link editor, preserving custom thumbnails and existing copy. Non-featured links with images display a large preview image. Email links and pages without usable metadata retain their icon. Trusted publishers are fetched directly; other sites use Microlink's metadata API (https://microlink.io/docs/api/getting-started/overview). The free endpoint is limited to 25 requests/day, and sends the destination URL to Microlink. Results are saved with the draft, so public visitors do not trigger metadata requests. Preview errors retain a manual image option.

## Manual follower counts (current mode)
In Admin → My links → Social icons, click Add icon. Enter the platform, account URL, and current follower/subscriber count (0 for email or other links without followers). Existing icons have editable follower fields. The combined total appears beneath the public icons and updates in the draft preview immediately; save and publish to update the live page. Only visible icons contribute. Missing counts are excluded, and zero is a valid count. Migration 007 validates counts in saved configurations. No API credentials are needed in this mode. The previous sync workflow is now manual-only; automatic account syncing is dormant.

## Social platform picker
Supports Instagram, YouTube, TikTok, X/Twitter, Kick, Threads, Bluesky, Facebook, LinkedIn, Discord, Telegram, Reddit, Spotify, Patreon, Pinterest, Snapchat, Twitch, Email, Support, and Website. New platforms work in both social icons and link-card icons, including manual follower counts. Migration 008 permits their saved platform identifiers. Brand SVG paths are bundled from [Simple Icons 16.0.0](https://github.com/simple-icons/simple-icons/tree/16.0.0) (CC0); no external icon requests are needed.
