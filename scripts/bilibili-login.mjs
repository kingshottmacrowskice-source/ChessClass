import { randomUUID } from "node:crypto";

const BASE = "https://passport.bilibili.com/x/passport-login/web/qrcode/";
const TERMINAL = new Set(["confirmed", "expired", "error", "cancelled"]);

/** A single local user's short-lived QR challenge. Never expose key or cookies. */
export class BilibiliLogin {
  constructor({ loadCookie, saveCookie, fetcher = fetch, now = Date.now }) {
    Object.assign(this, { loadCookie, saveCookie, fetcher, now });
    this.lastStart = -Infinity;
  }

  async request(url) {
    const response = await this.fetcher(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://www.bilibili.com/",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("B站登录服务暂时不可用，请稍后重试");
    const body = await response.json();
    if (body.code !== 0) throw new Error("B站登录请求失败，请稍后重试");
    return { response, data: body.data };
  }

  view(session = this.session) {
    if (!session)
      return { status: "expired", message: "二维码已失效，请重新生成" };
    if (!TERMINAL.has(session.status) && this.now() >= session.expiresAt)
      this.finish(session, "expired", "二维码已过期，请刷新");
    return {
      id: session.id,
      status: session.status,
      message: session.message,
      qrUrl: TERMINAL.has(session.status) ? "" : session.url,
      expiresAt: session.expiresAt,
    };
  }

  finish(session, status, message) {
    Object.assign(session, { status, message, key: "", url: "" });
    clearTimeout(session.expiry);
  }

  async start() {
    if (this.now() - this.lastStart < 10000)
      throw new Error("请间隔 10 秒再生成二维码");
    this.lastStart = this.now();
    this.cancel();
    const session = (this.session = {
      id: randomUUID(),
      status: "starting",
      message: "正在生成二维码…",
      expiresAt: this.now() + 180000,
      polls: 0,
      lastPoll: -Infinity,
    });
    session.expiry = setTimeout(
      () => this.finish(session, "expired", "二维码已过期，请刷新"),
      180000,
    );
    session.expiry.unref?.();
    try {
      const { data } = await this.request(BASE + "generate");
      if (this.session !== session || TERMINAL.has(this.view(session).status))
        return this.view(session);
      const url = new URL(data.url);
      if (
        url.protocol !== "https:" ||
        !["passport.bilibili.com", "account.bilibili.com"].includes(
          url.hostname,
        ) ||
        !data.qrcode_key
      )
        throw new Error("二维码响应无效，请重试");
      Object.assign(session, {
        key: data.qrcode_key,
        url: url.href,
        status: "waiting_scan",
        message: "请用哔哩哔哩 App 扫码",
      });
    } catch {
      if (this.session === session && !TERMINAL.has(session.status))
        this.finish(session, "error", "二维码生成失败，请稍后重试");
    }
    return this.view(session);
  }

  async poll(id) {
    const session = this.session;
    if (!session || session.id !== id) return this.view(null);
    if (TERMINAL.has(this.view(session).status) || !session.key)
      return this.view(session);
    if (session.pending) return session.pending;
    if (this.now() - session.lastPoll < 2000) return this.view(session);
    if (++session.polls > 90) {
      this.finish(session, "expired", "二维码已过期，请刷新");
      return this.view(session);
    }
    session.lastPoll = this.now();
    session.pending = this.pollOnce(session).finally(() => {
      session.pending = undefined;
    });
    return session.pending;
  }

  async pollOnce(session) {
    try {
      const { data, response } = await this.request(
        BASE + "poll?qrcode_key=" + encodeURIComponent(session.key),
      );
      const active = () =>
        this.session === session && !TERMINAL.has(this.view(session).status);
      if (!active()) return this.view(session);
      if (data.code === 86101) {
        session.status = "waiting_scan";
        session.message = "请用哔哩哔哩 App 扫码";
      } else if (data.code === 86090) {
        session.status = "scanned";
        session.message = "已扫码，请在手机上确认登录";
      } else if (data.code === 86038)
        this.finish(session, "expired", "二维码已过期，请刷新");
      else if (data.code === 0) {
        const cookies = new Map();
        for (const header of response.headers.getSetCookie()) {
          const pair = header.split(";", 1)[0];
          const split = pair.indexOf("=");
          const name = pair.slice(0, split).trim();
          const value = pair.slice(split + 1).trim();
          if (
            ["SESSDATA", "DedeUserID", "buvid3", "buvid4"].includes(name) &&
            value &&
            !/[\r\n]/.test(value)
          )
            cookies.set(name, value);
        }
        if (
          !cookies.has("SESSDATA") ||
          !/^\d+$/.test(cookies.get("DedeUserID") || "")
        )
          throw new Error("登录凭据缺失");
        const cookie = [...cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; ");
        await this.saveCookie(cookie, active);
        if (active())
          this.finish(session, "confirmed", "登录成功，弹幕连接将自动更新");
      } else
        this.finish(session, "error", "B站返回了未知登录状态，请刷新二维码");
    } catch {
      if (this.session === session && !TERMINAL.has(session.status))
        this.finish(session, "error", "登录检查或保存失败，请重新扫码");
    }
    return this.view(session);
  }

  cancel(id) {
    if (this.session && (!id || this.session.id === id))
      this.finish(this.session, "cancelled", "已取消扫码登录");
    return { status: "cancelled", message: "已取消扫码登录" };
  }

  async status() {
    return { configured: Boolean(await this.loadCookie()) };
  }
  async logout() {
    const pending = this.session?.pending;
    this.cancel();
    await pending;
    await this.saveCookie("", () => true);
    return { configured: false };
  }
  close() {
    this.cancel();
  }
}
