import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync, brotliCompressSync } from "node:zlib";
import {
  packet,
  decodePackets,
  BilibiliRoom,
  createBilibiliRelay,
} from "../scripts/bilibili-live.mjs";

const chat = {
  cmd: "DANMU_MSG:4:0:2:2:2:0",
  info: [[], "大肥鱼测试", [123, "观众"]],
};
function compressed(data, version) {
  const body = (version === 2 ? deflateSync : brotliCompressSync)(data);
  const result = Buffer.concat([packet(5).subarray(0, 16), body]);
  result.writeUInt32BE(result.length, 0);
  result.writeUInt16BE(version, 6);
  return result;
}
function setup() {
  const sockets = [];
  const requests = [];
  class Socket {
    sent = [];
    constructor() {
      sockets.push(this);
    }
    send(value) {
      this.sent.push(value);
    }
    close() {
      this.closed = true;
    }
    emit(value) {
      this.onmessage?.({ data: value });
    }
  }
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        code: 0,
        data: url.includes("room_init")
          ? { room_id: 9841047 }
          : {
              token: "test-token",
              host_server_list: [{ host: "test.chat.bilibili.com" }],
            },
      }),
    };
  };
  return { sockets, requests, Socket, fetcher };
}

test("decodes bundled plain, zlib and brotli packets and rejects truncated input", () => {
  const joined = Buffer.concat([packet(8, { code: 0 }), packet(5, chat)]);
  for (const data of [joined, compressed(joined, 2), compressed(joined, 3)])
    assert.deepEqual(decodePackets(data), [
      { operation: 8, data: { code: 0 } },
      { operation: 5, data: chat },
    ]);
  assert.throws(() => decodePackets(joined.subarray(0, -1)));
  const invalid = packet(5, chat);
  invalid.writeUInt32BE(0, 0);
  assert.throws(() => decodePackets(invalid));
});

test("authenticates the resolved room, keeps distinct events, and never exposes credentials", async () => {
  const env = setup();
  const room = new BilibiliRoom("12", {
    ...env,
    cookie: "SESSDATA=secret; DedeUserID=42; buvid3=device",
  });
  try {
    await room.ready;
    const socket = env.sockets[0];
    socket.onopen();
    const login = JSON.parse(socket.sent[0].subarray(16).toString());
    assert.equal(login.roomid, 9841047);
    assert.equal(login.uid, 42);
    assert.equal(login.buvid, "device");
    assert.equal(room.snapshot().connected, false);
    socket.emit(packet(8, { code: 0 }));
    assert.equal(room.snapshot().connected, true);
    socket.emit(
      compressed(Buffer.concat([packet(5, chat), packet(5, chat)]), 3),
    );
    const snapshot = room.snapshot();
    assert.equal(snapshot.received, 2);
    assert.equal(snapshot.messages[0].text, "大肥鱼测试");
    assert.equal(snapshot.messages[0].user, "123");
    assert.notEqual(snapshot.messages[0].id, snapshot.messages[1].id);
    assert.deepEqual(room.snapshot().messages, snapshot.messages);
    assert.ok(!JSON.stringify(snapshot).includes("secret"));
    socket.emit(
      packet(5, { cmd: "LOG_IN_NOTICE", data: { notice_msg: "请登录" } }),
    );
    assert.equal(room.snapshot().notice, "请登录");
  } finally {
    room.stop();
  }
  assert.equal(env.sockets[0].closed, true);
});

test("rejects failed authentication and reconnects without accepting stale events", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const env = setup();
  const room = new BilibiliRoom("9841047", env);
  try {
    await room.ready;
    const old = env.sockets[0];
    const stale = old.onmessage;
    old.emit(packet(8, { code: -101 }));
    assert.equal(room.connected, false);
    assert.match(room.status, /认证失败/);
    t.mock.timers.tick(3000);
    await room.ready;
    assert.equal(env.sockets.length, 2);
    stale({ data: packet(8, { code: 0 }) });
    assert.equal(room.connected, false);
    env.sockets[1].emit(packet(8, { code: 0 }));
    env.sockets[1].emit(packet(5, chat));
    assert.equal(room.snapshot().received, 1);
  } finally {
    room.stop();
  }
});

test("multiple viewers share a connection and cookie changes reconnect automatically", async () => {
  const env = setup();
  let cookie = "";
  const relay = createBilibiliRelay({ ...env, loadCookie: async () => cookie });
  try {
    await relay.get("9841047");
    await new Promise(setImmediate);
    await relay.get("9841047");
    assert.equal(env.sockets.length, 1);
    cookie = "SESSDATA=secret; DedeUserID=42";
    await relay.get("9841047");
    await new Promise(setImmediate);
    assert.equal(env.sockets.length, 2);
    assert.equal(env.sockets[0].closed, true);
  } finally {
    relay.close();
  }
});
