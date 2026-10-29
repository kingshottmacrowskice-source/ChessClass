import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync, brotliCompressSync } from "node:zlib";
import { roomEvents } from "../scripts/bilibili-events.mjs";
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
test("normalizes room interactions and keeps payment messages out of chat votes", async () => {
  const room = new BilibiliRoom("12", setup());
  try {
    await room.ready;
    for (const event of [
      { cmd: "INTERACT_WORD", data: { uid: 1, uname: "入场者", msg_type: 1 } },
      {
        cmd: "SEND_GIFT",
        data: {
          uid: 2,
          uname: "送礼者",
          giftName: "小花",
          num: 3,
          coin_type: "silver",
          total_coin: 100,
        },
      },
      {
        cmd: "GUARD_BUY",
        data: { uid: 3, username: "舰长", guard_level: 3, num: 1 },
      },
      {
        cmd: "SUPER_CHAT_MESSAGE",
        data: {
          uid: 4,
          user_info: { uname: "留言者" },
          message: "e4",
          price: 30,
        },
      },
      { cmd: "INTERACT_WORD", data: { uid: 5, msg_type: 2 } },
      { cmd: "LIKE_INFO_V3_CLICK", data: { uid: 6 } },
    ])
      room.receive(event);
    room.receive(chat);
    const snapshot = room.snapshot();
    assert.deepEqual(
      snapshot.roomEvents.map((e) => e.kind),
      ["entry", "gift", "guard", "superchat", "follow", "like", "chat"],
    );
    assert.equal(snapshot.messages.length, 1);
    assert.equal(snapshot.messages[0].text, "大肥鱼测试");
    assert.equal(snapshot.roomEvents[1].count, 3);
    assert.equal(snapshot.roomEvents[3].currency, "CNY");
    assert.equal(new Set(snapshot.roomEvents.map((e) => e.id)).size, 7);
    assert.deepEqual(room.snapshot().roomEvents, snapshot.roomEvents);
  } finally {
    room.stop();
  }
});
test("decodes V2 entrance and multi-item gifts, ignoring malformed notifications", () => {
  const uint = (n) => {
    const out = [];
    let v = BigInt(n);
    do {
      const b = Number(v & 127n);
      v >>= 7n;
      out.push(b | (v ? 128 : 0));
    } while (v);
    return Buffer.from(out);
  };
  const int = (key, n) => Buffer.concat([uint(key * 8), uint(n)]);
  const str = (key, text) => {
    const b = Buffer.from(text);
    return Buffer.concat([uint(key * 8 + 2), uint(b.length), b]);
  };
  const entry = Buffer.concat([
    int(1, 123),
    str(2, "观众"),
    int(5, 1),
  ]).toString("base64");
  assert.deepEqual(
    roomEvents({ cmd: "INTERACT_WORD_V2", data: { pb: entry } }),
    [{ kind: "entry", user: "123", name: "观众" }],
  );
  const item = (gift, count) => Buffer.concat([str(2, gift), int(3, count)]);
  const gifts = Buffer.concat([
    int(1, 123),
    str(2, "观众"),
    str(10, item("小花", 2)),
    str(10, item("星星", 1)),
  ]).toString("base64");
  assert.deepEqual(
    roomEvents({ cmd: "SEND_GIFT_V2", data: { pb: gifts } }).map((e) => [
      e.gift,
      e.count,
    ]),
    [
      ["小花", 2],
      ["星星", 1],
    ],
  );
  assert.deepEqual(
    roomEvents({ cmd: "INTERACT_WORD_V2", data: { pb: "gA==" } }),
    [],
  );
  assert.deepEqual(
    roomEvents({ cmd: "COMBO_SEND", data: { giftName: "小花", num: 10 } }),
    [],
  );
  assert.deepEqual(
    roomEvents({ cmd: "SEND_GIFT", data: { giftName: "x", num: -1 } }),
    [],
  );
});
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
