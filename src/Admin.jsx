import LiveControls from "./LiveControls";
import Analytics from "./AnalyticsDashboard";
import { highlightOptions } from "./highlights";
import Celebration, { celebrations } from "./Celebration";
import React, { useState, useEffect, useRef } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Share2,
  Check,
  Plus,
  GripVertical,
  Trash2,
  ExternalLink,
  LayoutDashboard,
  Link as LinkIcon,
  Palette,
  Sparkles,
  Radio,
  BarChart3,
  LogOut,
  Eye,
  Smartphone,
  Monitor,
  ChevronUp,
  ChevronDown,
  Download,
  Settings,
  Camera,
  X,
  Sun,
  Moon,
  Copy,
  Save,
  CheckCircle2,
} from "lucide-react";
import {
  presets,
  applyMood,
  automaticThumbnail,
  previewSupported,
  socialFollowerTotal,
  safeUrl,
} from "./model";
import {
  db,
  configured,
  owner,
  loadDraft,
  saveDraft,
  publish,
  upload,
} from "./api";
import PublicPage from "./PublicPage";
import { SocialIcon as Icon } from "./social-icons";
import {
  platformLabels as icons,
  normalizeAccountUrl,
  resolvePlatform,
  isPaymentPlatform,
} from "./social-platforms";

function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
function Toggle({ label, value, onChange, compact = false }) {
  return (
    <label className={`toggle ${compact ? "toggle-compact" : ""}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-label">{label}</span>
    </label>
  );
}
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Login({ onLogin }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <a className="wordmark" href="/">
        c<span>.</span>
      </a>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { error } = await db.auth.signInWithPassword({
              email,
              password,
            });
            if (error) throw error;
            onLogin();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="eyebrow">YOUR SPACE, YOUR WAY</p>
        <h1>Welcome back.</h1>
        <p>Sign in to manage your little corner of the internet.</p>
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
          <ArrowRight size={16} />
        </button>
        <a href="/">Back to public page</a>
      </form>
    </div>
  );
}
function ImageField({ label, value, onChange, notify }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="image-field">
      <Field
        label={label}
        type="url"
        value={value || ""}
        placeholder="https://…"
        onChange={(e) => onChange(e.target.value)}
      />
      <label className="upload button">
        <Camera size={14} />
        {busy ? "Uploading…" : "Upload"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            setBusy(true);
            try {
              onChange(await upload(f));
            } catch (e) {
              notify(e.message, true);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
    </div>
  );
}
import { fetchLinkPreview } from "./api";

function LinkEditor({ site, setSite, notify }) {
  const previewRequests = useRef(new Set());
  const [previewStatus, setPreviewStatus] = useState({});
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const link of site.links) {
        const key = `${link.id}:${link.url}`;
        if (
          !previewSupported(link.url) ||
          (link.thumbnail && link.thumbnail !== link.url) ||
          previewRequests.current.has(key)
        )
          continue;
        previewRequests.current.add(key);
        setPreviewStatus((s) => ({
          ...s,
          [link.id]: "Looking for a preview image…",
        }));
        fetchLinkPreview(link.url)
          .then((preview) => {
            const image = preview?.image;
            if (preview)
              setSite((s) => ({
                ...s,
                links: s.links.map((l) =>
                  l.id === link.id &&
                  l.url === link.url &&
                  (!l.thumbnail || l.thumbnail === l.url)
                    ? {
                        ...l,
                        thumbnail: image || "",
                        thumbnailSourceUrl: link.url,
                        title:
                          (!l.title ||
                            l.title === "New link" ||
                            l.title === l.url) &&
                          preview.title
                            ? preview.title
                            : l.title,
                        description: l.description || preview.description || "",
                      }
                    : l,
                ),
              }));
            setPreviewStatus((s) => ({
              ...s,
              [link.id]: image
                ? "Rich link preview found."
                : "This page has no preview image. You can upload one.",
            }));
          })
          .catch((error) =>
            setPreviewStatus((s) => ({ ...s, [link.id]: error.message })),
          );
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [site.links, setSite]);
  const [open, setOpen] = useState(null),
    [drag, setDrag] = useState(null);
  function update(id, patch) {
    setSite((s) => ({
      ...s,
      links: s.links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }
  function move(from, to) {
    if (from === to || to < 0 || to >= site.links.length) return;
    setSite((s) => {
      const links = [...s.links];
      links.splice(to, 0, links.splice(from, 1)[0]);
      return { ...s, links };
    });
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Your links</h2>
          <p>A home for everything you’re sharing.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            const id = crypto.randomUUID();
            setSite((s) => ({
              ...s,
              links: [
                ...s.links,
                {
                  id,
                  title: "New link",
                  description: "",
                  url: "https://",
                  icon: "globe",
                  active: false,
                  featured: false,
                  highlight: "none",
                  highlightIntensity: 2,
                  start: "",
                  end: "",
                  background: "",
                  text: "",
                  thumbnail: "",
                  backgroundImage: "",
                  border: "",
                  radius: null,
                },
              ],
            }));
            setOpen(id);
          }}
        >
          <Plus size={16} />
          Add link
        </button>
      </div>
      <div className="editor-links">
        {site.links.map((l, i) => (
          <article
            key={l.id}
            className={"editor-link " + (open === l.id ? "expanded" : "")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null) move(drag, i);
              setDrag(null);
            }}
          >
            <div className="editor-link-top">
              <button
                className="grip"
                draggable
                onDragStart={() => setDrag(i)}
                onDragEnd={() => setDrag(null)}
                aria-label={`Drag ${l.title} to reorder`}
              >
                <GripVertical size={18} />
              </button>
              <span className="editor-icon">
                <Icon name={l.icon} url={l.url} />
              </span>
              <button
                className="editor-link-title"
                onClick={() => setOpen(open === l.id ? null : l.id)}
              >
                <strong>{l.title}</strong>
                <small>{l.url}</small>
              </button>
              <Toggle
                label="Visible"
                value={l.active}
                onChange={(v) => update(l.id, { active: v })}
              />
              <button
                className="icon-button"
                onClick={() => setOpen(open === l.id ? null : l.id)}
                aria-label="Edit link"
              >
                <Settings size={16} />
              </button>
            </div>
            {open === l.id && (
              <div className="link-fields">
                <div className="two-columns">
                  <Field
                    label="Title"
                    value={l.title}
                    maxLength={100}
                    onChange={(e) => update(l.id, { title: e.target.value })}
                  />
                  <Field
                    label="Destination URL"
                    value={l.url}
                    onChange={(e) =>
                      update(l.id, {
                        url: e.target.value,
                        ...(l.thumbnailSourceUrl
                          ? { thumbnail: "", thumbnailSourceUrl: "" }
                          : {}),
                      })
                    }
                  />
                </div>
                <Field
                  label="Description"
                  value={l.description}
                  maxLength={180}
                  onChange={(e) =>
                    update(l.id, { description: e.target.value })
                  }
                />
                <div className="two-columns">
                  <Field label="Icon">
                    <select
                      value={l.icon}
                      onChange={(e) => update(l.id, { icon: e.target.value })}
                    >
                      {Object.keys(icons).map((k) => (
                        <option key={k} value={k}>
                          {icons[k]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Toggle
                    label="Featured card"
                    value={l.featured}
                    onChange={(v) => update(l.id, { featured: v })}
                  />
                </div>
                <div className="highlight-controls">
                  <Field label="Link highlight">
                    <select
                      value={l.highlight || "none"}
                      onChange={(e) =>
                        update(l.id, { highlight: e.target.value })
                      }
                    >
                      {Object.entries(highlightOptions).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label={`Intensity · ${l.highlightIntensity ?? 2}/5`}>
                    <input
                      type="range"
                      aria-label="Highlight intensity"
                      min="1"
                      max="5"
                      step="1"
                      value={l.highlightIntensity ?? 2}
                      disabled={!l.highlight || l.highlight === "none"}
                      onChange={(e) =>
                        update(l.id, {
                          highlightIntensity: Number(e.target.value),
                        })
                      }
                    />
                    <span className="intensity-labels">
                      <span>Subtle</span>
                      <span>Dramatic</span>
                    </span>
                  </Field>
                </div>
                <p className="small muted">
                  Draw attention to this link. Effects pause while hovering or
                  focusing and respect reduced motion preferences.
                </p>
                <div className="two-columns">
                  <Field
                    label="Background (blank = theme)"
                    placeholder="#ffffff"
                    value={l.background}
                    onChange={(e) =>
                      update(l.id, { background: e.target.value })
                    }
                  />
                  <Field
                    label="Text color (blank = theme)"
                    placeholder="#302e2a"
                    value={l.text}
                    onChange={(e) => update(l.id, { text: e.target.value })}
                  />
                  <Field
                    label="Border color (blank = default)"
                    value={l.border || ""}
                    onChange={(e) => update(l.id, { border: e.target.value })}
                  />
                  <Field
                    label="Corner radius"
                    type="number"
                    min="0"
                    max="40"
                    value={l.radius ?? ""}
                    placeholder={`Theme: ${site.theme.radius}`}
                    onChange={(e) =>
                      update(l.id, {
                        radius:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <ImageField
                  label="Thumbnail override (optional)"
                  value={l.thumbnail}
                  onChange={(v) =>
                    update(l.id, { thumbnail: v, thumbnailSourceUrl: "" })
                  }
                  notify={notify}
                />
                <p className="muted small">
                  {automaticThumbnail(l.url)
                    ? "YouTube thumbnail is automatic. Upload an image to override it; clear the override to use the video thumbnail."
                    : "Rich link previews are automatic for web links. Custom images take priority; pages that hide their metadata may need an uploaded image."}
                </p>
                {previewSupported(l.url) && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      previewRequests.current.delete(`${l.id}:${l.url}`);
                      update(l.id, { thumbnail: "", thumbnailSourceUrl: "" });
                    }}
                  >
                    Use automatic rich preview
                  </button>
                )}
                {previewStatus[l.id] && (
                  <p className="muted small" role="status">
                    {previewStatus[l.id]}
                  </p>
                )}
                <ImageField
                  label="Background image"
                  value={l.backgroundImage}
                  onChange={(v) => update(l.id, { backgroundImage: v })}
                  notify={notify}
                />
                <div className="two-columns">
                  <Field
                    label="Start (your local time)"
                    type="datetime-local"
                    value={l.start ? toLocal(l.start) : ""}
                    onChange={(e) =>
                      update(l.id, {
                        start: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      })
                    }
                  />
                  <Field
                    label="Expires (your local time)"
                    type="datetime-local"
                    value={l.end ? toLocal(l.end) : ""}
                    onChange={(e) =>
                      update(l.id, {
                        end: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : "",
                      })
                    }
                  />
                </div>
                <div className="link-actions">
                  <button
                    className="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                  >
                    <ChevronUp size={14} />
                    Move up
                  </button>
                  <button
                    className="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === site.links.length - 1}
                  >
                    <ChevronDown size={14} />
                    Move down
                  </button>
                  <a
                    className="button"
                    href={safeUrl(l.url) || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Test link
                    <ExternalLink size={13} />
                  </a>
                  <button
                    className="danger button"
                    onClick={() => {
                      if (
                        window.confirm(`Delete “${l.title}” from your draft?`)
                      )
                        setSite((s) => ({
                          ...s,
                          links: s.links.filter((x) => x.id !== l.id),
                        }));
                    }}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="muted small">
        Drag the handle to reorder. Move up/down also works with a keyboard.
        Schedules publish with the link.
      </p>
      <SocialEditor site={site} setSite={setSite} />
    </>
  );
}
function toLocal(value) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function SocialEditor({ site, setSite }) {
  const [adding, setAdding] = useState(false);
  const [account, setAccount] = useState({
    icon: "auto",
    url: "",
    followers: "",
  });
  const total = socialFollowerTotal(site.socials);
  const payment = isPaymentPlatform(account.icon, account.url);

  function change(id, p) {
    setSite((s) => ({
      ...s,
      socials: s.socials.map((x) => (x.id === id ? { ...x, ...p } : x)),
    }));
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>Social icons</h3>
        <button
          className="button"
          onClick={() => {
            setAccount({
              icon: "auto",
              url: "",
              followers: "",
            });
            setAdding(true);
          }}
        >
          <Plus size={14} />
          Add icon
        </button>
      </div>
      <p className="muted small">
        Enter the current followers or subscribers for each account. Visible
        icons contribute to the total; counts update when you edit them and
        publish.
      </p>
      {adding && (
        <form
          className="new-social-account"
          aria-label="Add social account"
          onSubmit={(e) => {
            e.preventDefault();
            const url = normalizeAccountUrl(account.url);
            if (!safeUrl(url)) return;
            const followers = payment ? 0 : Number(account.followers);
            if (
              (!payment && account.followers === "") ||
              !Number.isSafeInteger(followers) ||
              followers < 0 ||
              followers > 1000000000000
            )
              return;
            setSite((s) => ({
              ...s,
              socials: [
                ...s.socials,
                {
                  id: crypto.randomUUID(),
                  icon: account.icon,
                  url,
                  active: true,
                  followers,
                },
              ],
            }));
            setAdding(false);
          }}
        >
          <h4>Add an account</h4>
          <label>
            Platform
            <select
              value={account.icon}
              onChange={(e) =>
                setAccount((a) => ({ ...a, icon: e.target.value }))
              }
            >
              {Object.keys(icons).map((k) => (
                <option key={k} value={k}>
                  {icons[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Account URL
            <input
              autoFocus
              required
              placeholder="Paste your account or payment link"
              value={account.url}
              onChange={(e) =>
                setAccount((a) => ({ ...a, url: e.target.value }))
              }
            />
          </label>
          {account.icon === "auto" && (
            <p className="muted small">
              Detected icon: {icons[resolvePlatform("auto", account.url)]}
            </p>
          )}
          {payment ? (
            <p className="muted small">
              Payment links do not contribute to the follower total.
            </p>
          ) : (
            <label>
              Current followers
              <input
                required
                type="number"
                min="0"
                max="1000000000000"
                step="1"
                placeholder="Enter 0 for an account without followers"
                value={account.followers}
                onChange={(e) =>
                  setAccount((a) => ({ ...a, followers: e.target.value }))
                }
              />
            </label>
          )}
          <div className="link-actions">
            <button
              className="button"
              type="submit"
              disabled={!safeUrl(normalizeAccountUrl(account.url))}
            >
              Add account
            </button>
            <button
              className="button"
              type="button"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {site.socials.map((s, i) => (
        <div className="social-editor" key={s.id}>
          <select
            aria-label="Social platform"
            value={s.icon}
            onChange={(e) => change(s.id, { icon: e.target.value })}
          >
            {Object.keys(icons).map((k) => (
              <option key={k} value={k}>
                {icons[k]}
              </option>
            ))}
          </select>
          <input
            aria-label="Social destination"
            value={s.url}
            onChange={(e) => change(s.id, { url: e.target.value })}
            onBlur={(e) =>
              change(s.id, { url: normalizeAccountUrl(e.target.value) })
            }
          />
          <Icon name={s.icon} url={s.url} size={18} />
          <label className="social-followers">
            Followers
            <input
              aria-label={`Followers for ${s.icon} account ${i + 1}`}
              type="number"
              min="0"
              max="1000000000000"
              step="1"
              placeholder="Not entered"
              disabled={isPaymentPlatform(s.icon, s.url)}
              value={isPaymentPlatform(s.icon, s.url) ? 0 : (s.followers ?? "")}
              onChange={(e) =>
                change(s.id, {
                  followers:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <Toggle
            label="Show social icon"
            compact
            value={s.active}
            onChange={(value) => change(s.id, { active: value })}
          />
          <button
            className="icon-button"
            disabled={i === 0}
            aria-label="Move social icon up"
            onClick={() =>
              setSite((state) => {
                const a = [...state.socials];
                [a[i - 1], a[i]] = [a[i], a[i - 1]];
                return { ...state, socials: a };
              })
            }
          >
            <ChevronUp size={14} />
          </button>
          <button
            className="icon-button danger"
            aria-label="Remove social icon"
            onClick={() =>
              setSite((state) => ({
                ...state,
                socials: state.socials.filter((x) => x.id !== s.id),
              }))
            }
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <p className="manual-follower-summary">
        <strong>
          {total == null
            ? "No counts entered"
            : `${total.toLocaleString("en")} total followers`}
        </strong>
      </p>
    </section>
  );
}
function Animations({ site, setSite }) {
  const t = site.theme;
  const [replay, setReplay] = useState(0);
  const theme = (values) =>
    setSite((s) => ({ ...s, theme: { ...s.theme, ...values } }));
  return (
    <div className="appearance-editor">
      <section className="panel">
        <h3>Page motion</h3>{" "}
        <Field label="Motion">
          <select
            value={t.animation || "none"}
            onChange={(e) => theme({ animation: e.target.value })}
          >
            <option value="none">Still</option>
            <option value="fade">Soft fade</option>
            <option value="rise">Staggered rise</option>
          </select>
        </Field>
      </section>
      <section className="panel">
        <h3>Celebrations & holidays</h3>
        <p className="muted">
          Play a decorative effect when visitors open your page. Effects finish
          automatically and respect reduced motion preferences.
        </p>
        <Field label="Celebration">
          <select
            value={t.celebration || "none"}
            onChange={(e) => theme({ celebration: e.target.value })}
          >
            {Object.entries(celebrations).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Duration">
          <select
            value={t.celebrationDuration || 10}
            onChange={(e) =>
              theme({ celebrationDuration: Number(e.target.value) })
            }
          >
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={20}>20 seconds</option>
          </select>
        </Field>
        <div className="celebration-demo">
          <Celebration
            key={`${replay}-${t.celebration}-${t.celebrationDuration}`}
            theme={t}
          />
          <span>{celebrations[t.celebration || "none"]}</span>
        </div>
        <button
          className="button"
          type="button"
          disabled={!t.celebration || t.celebration === "none"}
          onClick={() => setReplay((n) => n + 1)}
        >
          Replay preview
        </button>
        <p className="muted">
          Save and publish to show this effect on your public page. Choose None
          when the occasion is over.
        </p>
      </section>
    </div>
  );
}

function Appearance({ site, setSite, notify }) {
  const [keepLinkStyles, setKeepLinkStyles] = useState(false);
  const t = site.theme,
    p = site.profile;
  const mood = (value) => setSite((s) => applyMood(s, value, keepLinkStyles));
  const theme = (patch) =>
      setSite((s) => ({ ...s, theme: { ...s.theme, ...patch } })),
    profile = (patch) =>
      setSite((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Make it yours</h2>
          <p>A few thoughtful details. A space that feels like you.</p>
        </div>
      </div>
      <section className="panel">
        <h3>Start with a mood</h3>
        <p className="muted small">
          Apply a complete look, then save and publish when ready.
        </p>
        <Toggle
          label="Keep custom link styles"
          value={keepLinkStyles}
          onChange={setKeepLinkStyles}
        />
        <div className="presets">
          {Object.entries(presets).map(([name, v]) => (
            <button
              key={name}
              type="button"
              className="preset"
              aria-pressed={Object.entries(v).every(
                ([key, value]) => t[key] === value,
              )}
              onClick={() => mood(v)}
            >
              <span
                style={{
                  background: `linear-gradient(135deg,${v.background},${v.backgroundEnd})`,
                }}
              >
                <i style={{ background: v.card }} />
                <i style={{ background: v.card }} />
              </span>
              {name}
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3>Profile</h3>
        <ImageField
          label="Profile image"
          value={p.avatar_url}
          onChange={(v) => profile({ avatar_url: v })}
          notify={notify}
        />
        <div className="two-columns">
          <Field
            label="Display name"
            value={p.display_name}
            maxLength={60}
            onChange={(e) => profile({ display_name: e.target.value })}
          />
          <Field
            label="Username"
            value={p.username}
            maxLength={60}
            onChange={(e) => profile({ username: e.target.value })}
          />
        </div>
        <Field label="Biography">
          <textarea
            rows="3"
            maxLength={300}
            value={p.bio}
            onChange={(e) => profile({ bio: e.target.value })}
          />
        </Field>
        <div className="two-columns">
          <Field
            label="Image size"
            type="range"
            min="64"
            max="160"
            value={t.avatarSize}
            onChange={(e) => theme({ avatarSize: Number(e.target.value) })}
          />
          <Field label="Header alignment">
            <select
              value={t.align}
              onChange={(e) => theme({ align: e.target.value })}
            >
              <option value="center">Center</option>
              <option value="left">Left</option>
            </select>
          </Field>
        </div>
        <Toggle
          label="Decorative profile badge"
          value={p.badge}
          onChange={(v) => profile({ badge: v })}
        />
        <Toggle
          label="Show share button"
          value={p.share}
          onChange={(v) => profile({ share: v })}
        />
        <Field
          label="Footer"
          value={p.footer}
          maxLength={120}
          onChange={(e) => profile({ footer: e.target.value })}
        />
      </section>
      <section className="panel">
        <h3>Colors & typography</h3>
        <div className="two-columns">
          {[
            ["background", "Background"],
            ["backgroundEnd", "Gradient end"],
            ["text", "Text"],
            ["card", "Card"],
            ["accent", "Accent"],
          ].map(([key, label]) => (
            <Field
              key={key}
              label={label}
              type="color"
              value={t[key]}
              onChange={(e) => theme({ [key]: e.target.value })}
            />
          ))}
          <Field label="Font">
            <select
              value={t.font}
              onChange={(e) => theme({ font: e.target.value })}
            >
              <option value="serif">Editorial serif</option>
              <option value="sans">Clean sans serif</option>
            </select>
          </Field>
          <Field label="Mode">
            <select
              value={t.mode}
              onChange={(e) =>
                mood(
                  presets[
                    e.target.value === "dark" ? "Minimal Dark" : "Minimal Light"
                  ],
                )
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
        </div>
        <Toggle
          label="Gradient background"
          value={t.gradient}
          onChange={(v) => theme({ gradient: v })}
        />
        <ImageField
          label="Page background image"
          value={t.backgroundImage}
          onChange={(v) => theme({ backgroundImage: v })}
          notify={notify}
        />
      </section>
      <section className="panel">
        <h3>Shape & spacing</h3>
        <Field label="Card look">
          <select
            value={t.look || "classic"}
            onChange={(e) => theme({ look: e.target.value })}
          >
            <option value="classic">Classic</option>
            <option value="neon">Neon glow</option>
            <option value="paper">Soft paper</option>
            <option value="glass">Frosted glass</option>
            <option value="bold">Bold outlines</option>
          </select>
        </Field>
        <div className="two-columns">
          {[
            ["radius", "Corner radius", 0, 40],
            ["gap", "Card spacing", 8, 28],
            ["width", "Page width", 320, 620],
            ["shadow", "Shadow intensity", 0, 2],
          ].map(([key, label, min, max]) => (
            <Field
              key={key}
              label={`${label} · ${t[key]}`}
              type="range"
              min={min}
              max={max}
              value={t[key]}
              onChange={(e) => theme({ [key]: Number(e.target.value) })}
            />
          ))}
        </div>
        <button
          className="button"
          onClick={() => mood(presets["Minimal Light"])}
        >
          Restore default theme
        </button>
      </section>
    </>
  );
}
function Tools({ site, notify }) {
  const [previewVersion, setPreviewVersion] = useState(0);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Ready to share</h2>
          <p>One link. All your favorite places.</p>
        </div>
      </div>
      <section className="panel">
        <h3>Link sharing preview</h3>
        <p className="muted">
          Your published profile photo and background appear when someone shares
          cherylxxw.com. Upload your profile photo in Appearance, then publish.
          Updates can take a minute; messaging apps may cache older previews.
        </p>
        <img
          className="sharing-preview"
          alt="Published link sharing preview"
          src={
            configured
              ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-preview?v=${previewVersion}`
              : "/social-preview.png"
          }
        />
        <button
          type="button"
          className="button"
          onClick={() => setPreviewVersion(Date.now())}
        >
          Refresh preview
        </button>
      </section>
      <section className="panel">
        <h3>Your address</h3>
        <div className="address">
          cherylxxw.com
          <button
            className="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText("https://cherylxxw.com");
                notify("Link copied");
              } catch {
                notify(
                  "Copy unavailable. Select the address to copy it.",
                  true,
                );
              }
            }}
          >
            <Copy size={14} />
            Copy
          </button>
        </div>
        <p className="small muted">
          Tag social profiles with ?utm_source=instagram&utm_medium=bio to
          improve attribution.
        </p>
        <button
          className="button"
          onClick={async () => {
            try {
              const QRCode = await import("qrcode");
              const data = await QRCode.toDataURL("https://cherylxxw.com", {
                width: 1024,
                margin: 3,
                color: { dark: "#302e2a", light: "#ffffff" },
              });
              const a = document.createElement("a");
              a.href = data;
              a.download = "cheryl-qr.png";
              a.click();
            } catch (e) {
              notify(e.message, true);
            }
          }}
        >
          <Download size={16} />
          Download QR code
        </button>
      </section>
      <section className="panel">
        <h3>Keep a copy</h3>
        <p className="muted">
          Export your current draft, including appearance and links.
        </p>
        <button
          className="button"
          onClick={() =>
            download(
              JSON.stringify(site, null, 2),
              "cheryl-site.json",
              "application/json",
            )
          }
        >
          <Download size={16} />
          Export site settings
        </button>
      </section>
      <section className="panel">
        <h3>Privacy & maintenance</h3>
        <p className="muted">
          Tracking is off unless configured and explicitly allowed by the
          visitor. No raw IP addresses or precise locations are stored. Review
          your deployment’s consent requirements and retention before enabling
          it.
        </p>
      </section>
    </>
  );
}
function Admin() {
  const [authenticated, setAuthenticated] = useState(!configured),
    [checking, setChecking] = useState(configured),
    [site, setSite] = useState(null),
    [tab, setTab] = useState(() =>
      new URLSearchParams(location.search).has("youtube") ? "live" : "links",
    ),
    [mobile, setMobile] = useState(true),
    [toast, setToast] = useState(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [fatal, setFatal] = useState("");
  const baseline = useRef("");
  const toastTimer = useRef();
  function notify(message, error = false) {
    setToast({ message, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }
  async function check() {
    setChecking(true);
    try {
      const { data } = await db.auth.getSession();
      if (data.session) {
        if (await owner()) setAuthenticated(true);
        else {
          await db.auth.signOut();
          setAuthenticated(false);
          setFatal("This account is not the configured owner.");
        }
      } else setAuthenticated(false);
    } catch (e) {
      setFatal(e.message);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    if (configured) {
      check();
      const { data } = db.auth.onAuthStateChange(() => {
        setTimeout(check, 0);
      });
      return () => data.subscription.unsubscribe();
    }
  }, []);
  useEffect(() => {
    if (authenticated)
      loadDraft()
        .then((s) => {
          baseline.current = JSON.stringify(s);
          setSite(s);
          setFatal("");
        })
        .catch((e) => setFatal(e.message));
  }, [authenticated]);
  useEffect(() => {
    setDirty(!!site && JSON.stringify(site) !== baseline.current);
  }, [site]);
  useEffect(() => {
    if (!dirty) return;
    const f = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  async function commit(goLive) {
    setBusy(true);
    try {
      if (goLive) await publish(site);
      else await saveDraft(site);
      baseline.current = JSON.stringify(site);
      setDirty(false);
      notify(
        goLive
          ? "Published. Your public page is up to date."
          : "Draft saved. Publish when you’re ready.",
      );
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  if (checking) return <div className="loading">Checking access…</div>;
  if (!authenticated)
    return (
      <>
        <Login onLogin={check} />
        {fatal && (
          <p className="auth-error" role="alert">
            {fatal}
          </p>
        )}
      </>
    );
  if (!site)
    return (
      <div className="loading">
        {fatal || "Loading your space…"}
        {fatal && (
          <button className="button" onClick={() => location.reload()}>
            Retry
          </button>
        )}
      </div>
    );
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <a className="admin-brand" href="/">
          c<span>.</span>
          <small>YOUR LITTLE SPACE</small>
        </a>
        <nav aria-label="Admin sections">
          {[
            ["links", LinkIcon, "My links"],
            ["appearance", Palette, "Appearance"],
            ["animations", Sparkles, "Animations"],
            ["live", Radio, "Live now"],
            ["analytics", BarChart3, "Analytics"],
            ["share", Share2, "Share & tools"],
          ].map(([key, I, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              <I size={18} />
              {label}
              {key === "links" && <small>{site.links.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} />
            View live page
          </a>
          <div className="owner-chip">
            <img
              src={safeUrl(site.profile.avatar_url, true) || "/avatar.svg"}
              alt=""
            />
            <span>
              <strong>{site.profile.display_name}</strong>
              <small>{configured ? "Owner account" : "Local demo"}</small>
            </span>
            {configured && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() => db.auth.signOut()}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <div>
            <span className="breadcrumb">
              Your space <span>/</span>{" "}
              {tab === "links"
                ? "My links"
                : tab === "live"
                  ? "Live now"
                  : tab === "share"
                    ? "Share & tools"
                    : tab[0].toUpperCase() + tab.slice(1)}
            </span>
            <h1>
              Good things start here<span>.</span>
            </h1>
          </div>
          <div className="header-actions">
            <span className="status">
              <i className={dirty ? "unsaved" : ""} />
              {dirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <button
              className="button"
              disabled={busy}
              onClick={() => commit(false)}
            >
              <Save size={15} />
              Save draft
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => commit(true)}
            >
              {busy ? "Saving…" : "Publish changes"}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </header>
        {!configured && (
          <div className="demo-banner">
            <span>
              <strong>You’re in a local demo.</strong> Changes are saved in this
              browser. Connect Supabase for private owner access and live
              publishing.
            </span>
            <a href="/">
              Public page
              <ArrowUpRight size={14} />
            </a>
          </div>
        )}
        <div className="workspace">
          <main className="editor-content">
            {tab === "links" && (
              <LinkEditor site={site} setSite={setSite} notify={notify} />
            )}{" "}
            {tab === "appearance" && (
              <Appearance site={site} setSite={setSite} notify={notify} />
            )}{" "}
            {tab === "animations" && (
              <Animations site={site} setSite={setSite} />
            )}
            {tab === "live" && (
              <LiveControls site={site} setSite={setSite} notify={notify} />
            )}
            {tab === "analytics" && <Analytics site={site} notify={notify} />}{" "}
            {tab === "share" && <Tools site={site} notify={notify} />}
          </main>
          {tab !== "analytics" && (
            <aside className="preview-panel">
              <div className="preview-heading">
                <span>
                  <Eye size={15} />
                  Live preview
                </span>
                <div>
                  <button
                    className={mobile ? "selected" : ""}
                    aria-label="Mobile preview"
                    onClick={() => setMobile(true)}
                  >
                    <Smartphone size={15} />
                  </button>
                  <button
                    className={!mobile ? "selected" : ""}
                    aria-label="Desktop preview"
                    onClick={() => setMobile(false)}
                  >
                    <Monitor size={15} />
                  </button>
                </div>
              </div>
              <div className={mobile ? "phone-frame" : "desktop-frame"}>
                <div className="phone-camera" />
                <div className="preview-scroll">
                  <PublicPage site={site} preview />
                </div>
              </div>
              <p className="preview-caption">
                {mobile ? "MOBILE" : "DESKTOP"} PREVIEW · DRAFT
              </p>
              <p className="preview-help">
                Looking good? Publish to share it with the world.
              </p>
            </aside>
          )}
        </div>
      </div>
      {toast && (
        <div
          className={"toast " + (toast.error ? "toast-error" : "")}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <X size={16} /> : <CheckCircle2 size={16} />}{" "}
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default Admin;
