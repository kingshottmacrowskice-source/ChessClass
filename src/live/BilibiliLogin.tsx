import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Session = {
  id?: string;
  status: string;
  message: string;
  qrUrl?: string;
  expiresAt?: number;
};
const waiting = (s?: Session | null) =>
  s?.status === "waiting_scan" || s?.status === "scanned";
async function api(path = "", post = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/live/login" + path, {
      method: post ? "POST" : "GET",
      cache: "no-store",
      signal: controller.signal,
      ...(post
        ? { headers: { "Content-Type": "application/json" }, body: "{}" }
        : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "登录服务暂时不可用");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export default function BilibiliLogin() {
  const [configured, setConfigured] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const current = useRef(session);
  current.current = session;
  useEffect(() => {
    let stopped = false;
    void api()
      .then((data) => {
        if (!stopped) setConfigured(data.configured);
      })
      .catch(() => {
        if (!stopped) setError("无法读取登录状态，请稍后重试");
      });
    return () => {
      stopped = true;
      generation.current++;
      if (current.current?.id && waiting(current.current))
        void api(
          "/cancel?id=" + encodeURIComponent(current.current.id),
          true,
        ).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!session?.id || !waiting(session)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const id = session.id;
    const expiresAt = session.expiresAt || 0;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = async () => {
      if (Date.now() >= expiresAt) {
        setSession({ id, status: "expired", message: "二维码已过期，请刷新" });
        return;
      }
      try {
        const next: Session = await api(
          "/poll?id=" + encodeURIComponent(id),
          true,
        );
        if (stopped) return;
        setSession(next);
        if (next.status === "confirmed") setConfigured(true);
        if (waiting(next)) timer = setTimeout(poll, 2000);
      } catch {
        if (!stopped)
          setSession({
            id,
            status: "error",
            message: "登录检查失败，请刷新二维码后重试",
          });
      }
    };
    timer = setTimeout(poll, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [session?.id, waiting(session)]);

  const start = async () => {
    const token = ++generation.current;
    setBusy(true);
    setError("");
    setSession(null);
    try {
      const next: Session = await api("/qr", true);
      if (token !== generation.current) {
        if (next.id)
          void api("/cancel?id=" + encodeURIComponent(next.id), true).catch(
            () => {},
          );
        return;
      }
      setSession(next);
      setNow(Date.now());
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "二维码生成失败");
    } finally {
      if (token === generation.current) setBusy(false);
    }
  };
  const cancel = async () => {
    generation.current++;
    const id = session?.id;
    setSession(null);
    setBusy(false);
    if (id)
      await api("/cancel?id=" + encodeURIComponent(id), true).catch(() => {});
  };
  const logout = async () => {
    generation.current++;
    setBusy(true);
    setError("");
    setSession(null);
    try {
      await api("/logout", true);
      setConfigured(false);
    } catch {
      setError("清除登录失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-panel" aria-label="B站扫码登录">
      <h2>B站账号</h2>
      <p>{configured ? "已保存 B站登录，可重新扫码更新" : "尚未登录 B站"}</p>
      <p>用哔哩哔哩 App 扫码并确认，登录成功后自动更新弹幕连接。</p>
      {waiting(session) && session?.qrUrl && (
        <div className="bilibili-login-qr">
          <QRCodeSVG
            value={session.qrUrl}
            size={216}
            marginSize={4}
            title="B站登录二维码"
          />
          <small>
            剩余{" "}
            {Math.max(0, Math.ceil(((session.expiresAt || 0) - now) / 1000))} 秒
          </small>
        </div>
      )}
      {session && <p aria-live="polite">{session.message}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="persona-presets">
        {!waiting(session) && (
          <button type="button" disabled={busy} onClick={() => void start()}>
            {busy
              ? "正在处理…"
              : session
                ? "刷新二维码"
                : configured
                  ? "重新扫码登录"
                  : "扫码登录 B站"}
          </button>
        )}
        {waiting(session) && (
          <button type="button" onClick={() => void cancel()}>
            取消扫码
          </button>
        )}
        {configured && !waiting(session) && (
          <button type="button" disabled={busy} onClick={() => void logout()}>
            清除本机登录
          </button>
        )}
      </div>
      <small>登录信息仅保存在本机服务，直播页面无需扫码。</small>
    </section>
  );
}
