import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import App from "./App";
import LiveMode from "./live/LiveMode";
import "./style.css";
import ActionPreview from "./live/ActionPreview";
import LiveSettings from "./live/LiveSettings";
const currentRoute = () =>
  location.hash ||
  ({ "/live": "#live", "/live-settings": "#live-settings" }[
    location.pathname.replace(/\/$/, "")
  ] ??
    "");
function Root() {
  const [live, setLive] = useState(currentRoute() === "#live");
  const [hash, setHash] = useState(currentRoute());
  useEffect(() => {
    const update = () => {
      setHash(currentRoute());
      setLive(currentRoute() === "#live");
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  if (hash === "#actions") return <ActionPreview />;
  if (hash === "#live-settings") return <LiveSettings />;
  return live ? (
    <LiveMode
      exit={() => {
        location.hash = "#analysis";
        setLive(false);
      }}
    />
  ) : (
    <>
      <button
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: 80,
          background: "#244d78",
          color: "white",
          padding: "14px 22px",
          boxShadow: "0 4px 20px #0004",
        }}
        onClick={() => {
          location.hash = "live";
          setLive(true);
        }}
      >
        ▶ 直播对练
      </button>
      <App />
    </>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
