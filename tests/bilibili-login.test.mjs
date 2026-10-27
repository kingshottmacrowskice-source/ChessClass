import test from "node:test";
import assert from "node:assert/strict";
import { BilibiliLogin } from "../scripts/bilibili-login.mjs";

function fixture() {
  let now = 1000000,
    cookie = "",
    pollCode = 86101;
  const requests = [];
  let cookies = [
    "SESSDATA=test-secret; Path=/; HttpOnly",
    "DedeUserID=42; Path=/",
    "unneeded=discard-me",
  ];
  let block;
  const login = new BilibiliLogin({
    now: () => now,
    loadCookie: async () => cookie,
    saveCookie: async (value, active) => {
      if (active()) cookie = value;
    },
    fetcher: async (url) => {
      requests.push(url);
      if (url.includes("/poll?") && block) await block;
      return {
        ok: true,
        headers: { getSetCookie: () => cookies },
        json: async () => ({
          code: 0,
          data: url.endsWith("generate")
            ? {
                url: "https://account.bilibili.com/qr/test",
                qrcode_key: "private-key",
              }
            : { code: pollCode },
        }),
      };
    },
  });
  return {
    login,
    requests,
    tick: (ms = 2000) => (now += ms),
    code: (code) => (pollCode = code),
    cookies: (value) => (cookies = value),
    block: (value) => (block = value),
    cookie: () => cookie,
  };
}

test("QR flow waits, scans, saves only needed cookies, and hides credentials", async () => {
  const f = fixture();
  try {
    const qr = await f.login.start();
    assert.equal(qr.status, "waiting_scan");
    assert.ok(!JSON.stringify(qr).includes("private-key"));
    assert.equal((await f.login.poll(qr.id)).status, "waiting_scan");
    const before = f.requests.length;
    await f.login.poll(qr.id);
    assert.equal(f.requests.length, before);
    f.tick();
    f.code(86090);
    assert.equal((await f.login.poll(qr.id)).status, "scanned");
    f.tick();
    f.code(0);
    const done = await f.login.poll(qr.id);
    assert.equal(done.status, "confirmed");
    assert.equal(done.qrUrl, "");
    assert.equal(f.cookie(), "SESSDATA=test-secret; DedeUserID=42");
    assert.ok(!JSON.stringify(done).includes("test-secret"));
    assert.deepEqual(await f.login.status(), { configured: true });
    await f.login.logout();
    assert.equal(f.cookie(), "");
    assert.ok(
      f.requests.every((url) =>
        url.startsWith("https://passport.bilibili.com/"),
      ),
    );
  } finally {
    f.login.close();
  }
});

test("expiry and unknown sessions do not poll upstream; start has a cooldown", async () => {
  const f = fixture();
  try {
    const qr = await f.login.start();
    await assert.rejects(f.login.start(), /10 秒/);
    assert.equal((await f.login.poll("wrong-session")).status, "expired");
    f.tick(180001);
    assert.equal((await f.login.poll(qr.id)).status, "expired");
    assert.equal(f.requests.length, 1);
  } finally {
    f.login.close();
  }
});

test("cancelling while confirmation is pending never saves the late credential", async () => {
  const f = fixture();
  try {
    const qr = await f.login.start();
    f.code(0);
    let release;
    f.block(new Promise((resolve) => (release = resolve)));
    const first = f.login.poll(qr.id);
    const second = f.login.poll(qr.id);
    assert.equal(f.requests.length, 2);
    f.login.cancel(qr.id);
    release();
    assert.equal((await first).status, "cancelled");
    await second;
    assert.equal(f.cookie(), "");
  } finally {
    f.login.close();
  }
});

test("missing credentials and upstream expiry are never reported as successful login", async () => {
  const f = fixture();
  try {
    let qr = await f.login.start();
    f.code(0);
    f.cookies([]);
    assert.equal((await f.login.poll(qr.id)).status, "error");
    assert.equal(f.cookie(), "");
    f.tick(10000);
    qr = await f.login.start();
    f.code(86038);
    assert.equal((await f.login.poll(qr.id)).status, "expired");
  } finally {
    f.login.close();
  }
});
