import React, { useState, useEffect } from "react";
import PublicPage from "./PublicPage";
import { publicSite, configured } from "./public-api";
const Admin = React.lazy(() => import("./Admin"));
export default function App() {
  const admin = location.pathname.replace(/\/$/, "") === "/admin";
  const [site, setSite] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (admin) {
      let m = document.querySelector('meta[name="robots"]');
      if (!m) {
        m = document.createElement("meta");
        m.name = "robots";
        document.head.appendChild(m);
      }
      m.content = "noindex,nofollow";
      document.title = "Your space • Cheryl";
      return;
    }
    const load = () =>
      publicSite()
        .then(setSite)
        .catch(() =>
          setError(
            "This page is temporarily unavailable. Please try again shortly.",
          ),
        );
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);
  if (!configured && import.meta.env.PROD)
    return (
      <div className="loading">
        This site is waiting for its owner to finish setup.
      </div>
    );
  if (admin)
    return (
      <React.Suspense
        fallback={<div className="loading">Loading your space…</div>}
      >
        <Admin />
      </React.Suspense>
    );
  if (!site)
    return (
      <div className="loading">
        {error || "A little moment…"}
        {error && (
          <button className="button" onClick={() => location.reload()}>
            Retry
          </button>
        )}
      </div>
    );
  return <PublicPage site={site} />;
}
