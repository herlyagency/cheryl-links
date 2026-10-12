# Connect @Cherylxxw for automatic Live now

This connection only reads your YouTube channel/broadcasts. It cannot start streams or upload videos. Visitors do not need a Google account. The channel is pinned to `UCyw6EaI4Z6ey_OrFrVtpczA` (`https://www.youtube.com/@Cherylxxw`).

1. Open [Google Cloud Console](https://console.cloud.google.com/), select or create a project for Cheryl Links.
2. Go to **APIs & Services → Library**, search **YouTube Data API v3**, and click **Enable**.
3. Open **Google Auth Platform → Branding** and configure the app name (Cheryl Links), support email, and developer contact. Under **Audience**, choose the type appropriate for your account. If using an External app in Testing, add the Google account that owns @Cherylxxw as a test user. Under **Data Access**, add `https://www.googleapis.com/auth/youtube.readonly`.
4. Open **Google Auth Platform → Clients → Create client**, choose **Web application**, and name it Cheryl Links. Add this exact **Authorized redirect URI**:

   ```text
   https://xsvtainakcubyoqlrmcy.supabase.co/functions/v1/youtube-connect
   ```

5. Create the client and securely save its client ID and client secret. Do not put the secret in GitHub, website code, or chat.
6. Open [Supabase project settings](https://supabase.com/dashboard/project/xsvtainakcubyoqlrmcy/functions/secrets), **Edge Functions → Secrets**, and add:

   - `YOUTUBE_CLIENT_ID`: the client ID from Google.
   - `YOUTUBE_CLIENT_SECRET`: the client secret from Google.

7. Merge the Live now PR and wait for GitHub Pages deployment. Open **cherylxxw.com/admin → Live now → Refresh status → Connect YouTube**. Sign in with the account that owns the channel, choose the correct channel/Brand Account if prompted, and approve the read-only request yourself.
8. You should return to the admin page with a connection message. Choose **Automatic**, then **Save draft / Publish changes**. The connection works even if the mode field was previously absent, because Automatic is the default.
9. When a **public** stream is running, the profile gets a LIVE badge and a watch-live card appears above the links. Public status is checked on demand, shared across visitors, and cached for three minutes; open pages refresh once per minute. The card disappears after the stream ends or the status can no longer be verified. No background job is required.

## Testing and maintaining the connection

An External OAuth app in **Testing** can have its refresh token expire after seven days when using the YouTube scope. For persistent use, follow Google's publishing/verification requirements for your app; use **Reconnect YouTube** if authorization expires. Personal-use verification exemptions may apply, but Publishing status and verification are separate settings. See [Google's OAuth guidance](https://developers.google.com/identity/protocols/oauth2).

**Force live** is a manual override, with a YouTube video URL or `https://www.youtube.com/@Cherylxxw/live`. It stays on until you change the mode; it does not verify that a stream is running. **Off** hides the badge/card. Save and publish changes to either override.

**Disconnect** removes the stored channel authorization and attempts to revoke it at Google. Force live remains a separate published display override; choose Off and publish if you want that hidden too.

Errors and stale responses are hidden rather than shown as a verified live stream. Private/unlisted, testing, and scheduled broadcasts are not shown. Live-card clicks use a reserved destination ID and appear as **Watch Cheryl live** in Analytics.

## Deployment

Migration 013 and the two functions are already deployed for this project. On another installation, apply that migration and deploy:

```sh
supabase functions deploy youtube-connect --project-ref xsvtainakcubyoqlrmcy --no-verify-jwt
supabase functions deploy live-status --project-ref xsvtainakcubyoqlrmcy --no-verify-jwt
```

Refresh tokens, OAuth nonces, and cache rows are private tables with no anonymous/owner direct read access. Owner-authenticated endpoints manage the connection; the OAuth callback consumes a one-use, ten-minute state and verifies channel ownership before storing a token. A database lease prevents concurrent visitors from causing duplicate YouTube requests. No client secrets or refresh tokens are returned to the browser.

Official references: [YouTube active-broadcast API](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/list), [Google web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server).
