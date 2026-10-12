import React, { useEffect, useState } from "react";
import { youtubeConnection } from "./api";
import { youtubeLiveStatus } from "./public-api";
import { CHANNEL_URL } from "../supabase/functions/_shared/youtube-live.js";
export default function LiveControls({ site, setSite, notify }) {
  const [connection, setConnection] = useState(null),
    [status, setStatus] = useState(null),
    [busy, setBusy] = useState(false);
  const profile = (values) =>
    setSite((site) => ({ ...site, profile: { ...site.profile, ...values } }));
  async function refresh() {
    setBusy(true);
    try {
      const [connection, status] = await Promise.all([
        youtubeConnection(),
        youtubeLiveStatus(),
      ]);
      setConnection(connection);
      setStatus(status);
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  const outcome = new URLSearchParams(location.search).get("youtube");
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Live now on YouTube</h2>
          <p>Give visitors a one-tap way to watch @Cherylxxw.</p>
        </div>
      </div>
      {outcome && (
        <div className="notice" role="status">
          {outcome === "connected"
            ? "YouTube connected. Automatic detection is ready."
            : outcome === "wrong-channel"
              ? "That account does not own @Cherylxxw. Connect the correct channel or Brand Account."
              : "Connection was not completed. Try connecting again."}
        </div>
      )}
      <section className="panel">
        <h3>Display mode</h3>
        <label className="field">
          <span>Live now mode</span>
          <select
            value={site.profile.liveMode || "auto"}
            onChange={(e) =>
              profile({
                liveMode: e.target.value,
                ...(e.target.value === "manual" && !site.profile.liveUrl
                  ? { liveUrl: `${CHANNEL_URL}/live` }
                  : {}),
              })
            }
          >
            <option value="auto">Automatic</option>
            <option value="manual">Force live</option>
            <option value="off">Off</option>
          </select>
        </label>
        {site.profile.liveMode === "manual" && (
          <>
            <label className="field">
              <span>YouTube stream URL</span>
              <input
                type="url"
                value={site.profile.liveUrl || ""}
                onChange={(e) => profile({ liveUrl: e.target.value })}
              />
            </label>
            <p className="small muted">
              Force live stays on until you change this mode. Use it only while
              streaming.
            </p>
          </>
        )}
        <p className="muted small">
          Automatic shows a LIVE badge around your profile and a watch-live card
          above your links when a public broadcast is verified. Save and publish
          to change the public display. Off hides both.
        </p>
      </section>
      <section className="panel">
        <h3>YouTube connection</h3>
        <p>
          <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer">
            youtube.com/@Cherylxxw
          </a>
        </p>
        <p className="small muted">
          Read-only permission checks your broadcasts. It cannot upload videos
          or start a stream. Visitors do not sign in.
        </p>
        <p role="status">
          {connection?.connected
            ? "Channel connected"
            : connection
              ? "Channel not connected"
              : "Checking connection…"}{" "}
          ·{" "}
          {status?.status === "live"
            ? "Public stream is live"
            : status?.status === "offline"
              ? "No public stream is live"
              : status?.status === "setup_required"
                ? "Automatic detection needs setup"
                : status?.status === "unknown"
                  ? "Live status could not be verified"
                  : "Checking live status…"}
        </p>
        {status?.checkedAt && (
          <p className="small muted">
            Last check: {new Date(status.checkedAt).toLocaleString()}
          </p>
        )}
        <div className="analytics-actions">
          <button className="button" disabled={busy} onClick={refresh}>
            Refresh status
          </button>
          <button
            className="primary"
            disabled={busy || !connection?.configured}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await youtubeConnection("connect");
                location.assign(result.url);
              } catch (error) {
                notify(error.message, true);
                setBusy(false);
              }
            }}
          >
            {connection?.connected ? "Reconnect YouTube" : "Connect YouTube"}
          </button>
          {connection?.connected && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await youtubeConnection("disconnect");
                  await refresh();
                  notify("YouTube disconnected");
                } catch (error) {
                  notify(error.message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Disconnect
            </button>
          )}
        </div>
        <p className="small muted">
          Checks are shared across visitors and cached for three minutes. Open
          pages refresh once a minute. API errors hide the live badge rather
          than guessing.
        </p>
        {!connection?.configured && connection && (
          <details open>
            <summary>One-time Google setup</summary>
            <ol>
              <li>In Google Cloud, enable YouTube Data API v3.</li>
              <li>
                Configure Google Auth Platform for your own channel account. For
                an external app in Testing, add that account as a test user; its
                authorization may expire after seven days.
              </li>
              <li>
                Create an OAuth client of type Web application. Add this exact
                authorized redirect URI:{" "}
                <code className="live-callback">{connection.callback}</code>
              </li>
              <li>
                In Supabase → Edge Functions → Secrets, add{" "}
                <code>YOUTUBE_CLIENT_ID</code> and{" "}
                <code>YOUTUBE_CLIENT_SECRET</code>. Keep the secret out of
                GitHub variables and website code.
              </li>
              <li>
                Refresh status here, then choose Connect YouTube and authorize
                the @Cherylxxw channel.
              </li>
            </ol>
          </details>
        )}
      </section>
    </>
  );
}
