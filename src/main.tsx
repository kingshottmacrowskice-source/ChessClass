import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import App from "./App";
import LiveMode from "./live/LiveMode";
import "./style.css";
import ActionPreview from "./live/ActionPreview";
function Root() {
  const [live, setLive] = useState(location.hash === "#live");
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => {
      setHash(location.hash);
      setLive(location.hash === "#live");
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  if (hash === "#actions") return <ActionPreview />;
  return live ? (
    <LiveMode
      exit={() => {
        location.hash = "";
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
