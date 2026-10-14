import DiscountBadge from "./DiscountBadge";
import { youtubeLiveStatus } from "./public-api";
import {
  LIVE_LINK_ID,
  visibleLive,
} from "../supabase/functions/_shared/youtube-live.js";
import { highlightOptions, highlightStyle } from "./highlights";
import Celebration from "./Celebration";
import React, { useState, useEffect, useRef } from "react";
import { Heart, Share2, Check, ArrowUpRight } from "lucide-react";
import { safeUrl, visible, linkThumbnail, socialFollowerTotal } from "./model";
import { enabled, optedIn, consent, startTracking, track } from "./analytics";
import { SocialIcon as Icon } from "./social-icons";
import { platformLabels as icons, resolvePlatform } from "./social-platforms";

function LinkImage({ src, icon, url, hero = false }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src)
    return hero ? (
      <div className="feature-art" aria-hidden="true">
        <span>
          stay
          <br />
          <i>curious.</i>
        </span>
      </div>
    ) : (
      <Icon name={icon} url={url} />
    );
  return (
    <img
      className={hero ? "feature-thumbnail" : undefined}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
function Turnstile() {
  const ref = useRef(null);
  useEffect(() => {
    let id;
    let cancelled = false;
    const render = () => {
      if (!cancelled && window.turnstile && ref.current)
        id = window.turnstile.render(ref.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
          callback: startTracking,
          theme: "light",
        });
    };
    if (window.turnstile) render();
    else {
      let s = document.getElementById("turnstile-script");
      if (!s) {
        s = document.createElement("script");
        s.id = "turnstile-script";
        s.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", render, { once: true });
    }
    return () => {
      cancelled = true;
      if (id !== undefined) window.turnstile?.remove(id);
    };
  }, []);
  return <div ref={ref} className="turnstile" />;
}
function PublicPage({ site, preview = false }) {
  const { profile: p, theme: t, links, socials } = site;
  const followers = socialFollowerTotal(socials);
  const [allow, setAllow] = useState(optedIn());
  const [choice, setChoice] = useState(() => {
    try {
      return localStorage.getItem("cheryl-analytics-consent");
    } catch {
      return null;
    }
  });
  const [shareMessage, setShareMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const background =
    t.backgroundImage && safeUrl(t.backgroundImage, true)
      ? `linear-gradient(${t.background}cc,${t.background}cc),url("${safeUrl(t.backgroundImage, true)}") center/cover`
      : t.gradient
        ? `linear-gradient(150deg,${t.background},${t.backgroundEnd})`
        : t.background;
  const [liveResult, setLiveResult] = useState(null);
  useEffect(() => {
    let alive = true;
    if (["off", "manual"].includes(p.liveMode)) {
      setLiveResult(null);
      return;
    }
    const load = () =>
      youtubeLiveStatus()
        .then((result) => alive && setLiveResult(result))
        .catch(() => alive && setLiveResult({ status: "unknown" }));
    load();
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [p.liveMode]);
  const live = visibleLive(p, liveResult);
  async function share() {
    try {
      if (navigator.share)
        await navigator.share({
          title: p.display_name,
          url: "https://cherylxxw.com",
        });
      else {
        await navigator.clipboard.writeText("https://cherylxxw.com");
        setShareMessage("Link copied");
        setTimeout(() => setShareMessage(""), 2000);
      }
    } catch {
      setShareMessage("Sharing unavailable");
    }
  }
  return (
    <div
      className={`public-page look-${t.look || "classic"} animation-${t.animation || "none"} ${preview ? "preview-page" : ""}`}
      style={{
        background,
        color: t.text,
        "--accent": t.accent,
        "--page-background": t.background,
        colorScheme: t.mode,
        "--card": t.card,
        "--radius": t.radius + "px",
        "--gap": t.gap + "px",
        "--shadow":
          t.shadow === 0
            ? "none"
            : t.shadow === 2
              ? "0 8px 24px #00000012"
              : "0 3px 8px #00000005",
        fontFamily:
          t.font === "serif"
            ? "Georgia, serif"
            : "Inter, system-ui, sans-serif",
      }}
    >
      <Celebration theme={t} />
      <div className="public-top">
        <a className="wordmark" href="/" aria-label="Home">
          c<span>.</span>
        </a>
        {p.share && (
          <button
            className="share"
            onClick={share}
            aria-label="Share this page"
          >
            <Share2 size={17} />
          </button>
        )}
      </div>
      <main className="public-content" style={{ maxWidth: t.width }}>
        <header className={"profile " + (t.align === "left" ? "left" : "")}>
          <div
            className={`avatar-ring ${live ? "avatar-live" : ""}`}
            style={{ width: t.avatarSize + 12, height: t.avatarSize + 12 }}
          >
            <img
              src={safeUrl(p.avatar_url, true) || "/avatar.svg"}
              alt={`${p.display_name} profile`}
              width={t.avatarSize}
              height={t.avatarSize}
              onError={(e) => {
                e.currentTarget.src = "/avatar.svg";
              }}
            />
            {live && <span className="avatar-live-label">LIVE</span>}
          </div>
          <p className="eyebrow">MY LITTLE CORNER OF THE INTERNET</p>
          <h1>
            {p.display_name}
            {p.badge && (
              <span
                className="profile-badge"
                title="Decorative profile badge"
                aria-label="Decorative profile badge"
              >
                <Check size={11} />
              </span>
            )}
            <span className="name-dot">.</span>
          </h1>
          {p.username && <p className="handle">@{p.username}</p>}
          <p className="bio">{p.bio}</p>
          <div className="social-row">
            {socials
              .filter((s) => s.active)
              .map((s) => (
                <a
                  key={s.id}
                  href={safeUrl(s.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={icons[resolvePlatform(s.icon, s.url)]}
                  onClick={() => !preview && track("link_click", s.id)}
                >
                  <Icon name={s.icon} url={s.url} size={19} />
                </a>
              ))}
          </div>
          {followers != null && (
            <p
              className="follower-total"
              title="Combined manually entered followers and subscribers across visible accounts; this is not a unique audience."
            >
              <strong>{followers.toLocaleString("en")}</strong> total followers
            </p>
          )}
        </header>
        {live && (
          <a
            className="youtube-live-card"
            href={live.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => !preview && track("link_click", LIVE_LINK_ID)}
          >
            {live.thumbnail && (
              <img
                src={live.thumbnail}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <div>
              <span className="live-kicker">
                <i />
                LIVE NOW ON YOUTUBE
              </span>
              <strong>{live.title}</strong>
              <span className="live-watch">
                Watch live <ArrowUpRight size={16} />
              </span>
            </div>
          </a>
        )}
        <div className="link-heading">
          <span>A FEW PLACES TO FIND ME</span>
          <span className="little-star">✳</span>
        </div>
        <section className="link-list" aria-label="Featured links">
          {links
            .filter((l) => l.id !== LIVE_LINK_ID && visible(l, now))
            .map((l) => (
              <a
                className={
                  `link-card highlight-${Object.hasOwn(highlightOptions, l.highlight) ? l.highlight : "none"} ` +
                  (l.featured ? "featured " : "") +
                  (linkThumbnail(l) ? "rich-preview" : "")
                }
                key={l.id}
                href={safeUrl(l.url)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => !preview && track("link_click", l.id)}
                style={{
                  ...highlightStyle(l),
                  background:
                    l.backgroundImage && safeUrl(l.backgroundImage, true)
                      ? `linear-gradient(${l.background || t.card}ee,${l.background || t.card}ee),url("${safeUrl(l.backgroundImage, true)}") center/cover`
                      : l.background || t.card,
                  color: l.text || t.text,
                  borderColor: l.border || undefined,
                  borderRadius: l.radius ?? t.radius,
                }}
              >
                {["shine", "glow"].includes(l.highlight) && (
                  <span className="link-highlight" aria-hidden="true" />
                )}
                {!l.featured && linkThumbnail(l) && (
                  <div className="rich-preview-image">
                    <LinkImage
                      src={linkThumbnail(l)}
                      icon={l.icon}
                      url={l.url}
                    />
                  </div>
                )}
                {l.featured && (
                  <span className="featured-label">
                    LATEST & GREATEST <span>↗</span>
                  </span>
                )}
                <div className="card-inner">
                  <span className="card-icon">
                    <LinkImage
                      key={linkThumbnail(l)}
                      src={linkThumbnail(l)}
                      icon={l.icon}
                      url={l.url}
                    />
                  </span>
                  <span className="card-copy">
                    <strong>{l.title}</strong>
                    <DiscountBadge link={l} />
                    {l.description && <span>{l.description}</span>}
                  </span>
                  <ArrowUpRight size={18} className="card-arrow" />
                </div>
                {l.featured &&
                  (linkThumbnail(l) ? (
                    <LinkImage
                      key={linkThumbnail(l)}
                      src={linkThumbnail(l)}
                      icon={l.icon}
                      url={l.url}
                      hero
                    />
                  ) : (
                    <div className="feature-art" aria-hidden="true">
                      <div className="art-circle" />
                      <span>
                        stay
                        <br />
                        <i>curious.</i>
                      </span>
                      <div className="art-rays">✳</div>
                      <span className="art-note">
                        a new perspective
                        <br />
                        is one click away
                      </span>
                    </div>
                  ))}
              </a>
            ))}
        </section>
        <footer className="public-footer">
          <Heart size={12} />
          <span>{p.footer}</span>
          <small>
            © {new Date().getFullYear()} {p.display_name}
          </small>
          {!preview && enabled && (
            <button
              onClick={() => {
                const value = !allow;
                consent(value);
                setAllow(value);
                setChoice(value ? "yes" : "no");
              }}
            >
              Analytics: {allow ? "allowed" : "off"} · change
            </button>
          )}
        </footer>
      </main>
      <a
        className="design-credit"
        href="https://moowomedia.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        Custom designs by Moowo Media
      </a>
      {shareMessage && <div className="toast">{shareMessage}</div>}
      {!preview && enabled && !choice && (
        <div className="consent">
          <span>
            Allow anonymous visits and click analytics? No tracking before you
            allow it.
          </span>
          <button
            onClick={() => {
              consent(true);
              setAllow(true);
              setChoice("yes");
            }}
          >
            Allow
          </button>
          <button
            onClick={() => {
              consent(false);
              setAllow(false);
              setChoice("no");
            }}
          >
            Decline
          </button>
        </div>
      )}
      {!preview &&
        enabled &&
        allow &&
        !navigator.globalPrivacyControl &&
        navigator.doNotTrack !== "1" && <Turnstile />}
    </div>
  );
}

export default PublicPage;
