import { inflateSync, brotliDecompressSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { roomEvents } from "./bilibili-events.mjs";

export function packet(operation, value = "") {
  const body = Buffer.from(
    typeof value === "string" ? value : JSON.stringify(value),
  );
  const result = Buffer.alloc(16 + body.length);
  result.writeUInt32BE(result.length, 0);
  result.writeUInt16BE(16, 4);
  result.writeUInt16BE(1, 6);
  result.writeUInt32BE(operation, 8);
  result.writeUInt32BE(1, 12);
  body.copy(result, 16);
  return result;
}

export function decodePackets(bytes, depth = 0) {
  if (depth > 4) throw new Error("弹幕数据嵌套过深");
  const data = Buffer.from(bytes);
  const result = [];
  for (let offset = 0; offset < data.length;) {
    if (data.length - offset < 16) throw new Error("弹幕数据不完整");
    const size = data.readUInt32BE(offset);
    const header = data.readUInt16BE(offset + 4);
    const version = data.readUInt16BE(offset + 6);
    const operation = data.readUInt32BE(offset + 8);
    if (header < 16 || size < header || offset + size > data.length)
      throw new Error("弹幕数据长度错误");
    const body = data.subarray(offset + header, offset + size);
    if (version === 2 || version === 3) {
      const unpack = version === 2 ? inflateSync : brotliDecompressSync;
      result.push(
        ...decodePackets(unpack(body, { maxOutputLength: 1048576 }), depth + 1),
      );
    } else if (operation === 5 || operation === 8) {
      result.push({ operation, data: JSON.parse(body.toString("utf8")) });
    } else result.push({ operation });
    offset += size;
  }
  return result;
}

export class BilibiliRoom {
  constructor(room, { fetcher = fetch, Socket = WebSocket, cookie = "" } = {}) {
    this.room = room;
    this.fetcher = fetcher;
    this.Socket = Socket;
    this.cookie = cookie;
    const parts = Object.fromEntries(
      cookie.split(";").map((item) => {
        const split = item.indexOf("=");
        return [item.slice(0, split).trim(), item.slice(split + 1).trim()];
      }),
    );
    this.uid = Number(parts.DedeUserID) || 0;
    this.buvid = parts.buvid3 || "";
    this.notice = "";
    this.messages = [];
    this.roomEvents = [];
    this.connected = false;
    this.status = "正在连接实时弹幕…";
    this.session = randomUUID();
    this.sequence = 0;
    this.events = 0;
    this.lastEvent = null;
    this.generation = 0;
    this.failures = 0;
    this.lastUsed = Date.now();
    this.stopped = false;
    this.ready = this.start();
  }

  snapshot() {
    this.lastUsed = Date.now();
    return {
      room: this.room,
      roomId: this.roomId,
      transport: "websocket",
      connected: this.connected,
      status: this.status,
      messages: this.messages.slice(),
      roomEvents: this.roomEvents.slice(),
      received: this.sequence,
      events: this.events,
      lastEvent: this.lastEvent,
      loginConfigured: Boolean(this.cookie),
      notice: this.notice,
    };
  }

  async json(path) {
    const response = await this.fetcher(
      `https://api.live.bilibili.com${path}`,
      {
        headers: {
          Referer: `https://live.bilibili.com/${this.room}`,
          "User-Agent": "Mozilla/5.0",
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        signal: this.controller.signal,
      },
    );
    if (!response.ok) throw new Error(`Bilibili HTTP ${response.status}`);
    const body = await response.json();
    if (body.code !== 0)
      throw new Error(
        `Bilibili 返回 ${body.code}：${body.message || body.msg || "请求失败"}`,
      );
    return body.data;
  }

  async start() {
    const generation = ++this.generation;
    const active = () => !this.stopped && generation === this.generation;
    this.controller = new AbortController();
    this.status = "正在连接实时弹幕…";
    this.deadline = setTimeout(() => this.fail("实时弹幕连接超时"), 15000);
    try {
      const info = await this.json(`/room/v1/Room/room_init?id=${this.room}`);
      if (!active()) return;
      this.roomId = info.room_id;
      if (!Number.isSafeInteger(this.roomId) || this.roomId <= 0)
        throw new Error("直播间不存在");
      const config = await this.json(
        `/room/v1/Danmu/getConf?room_id=${this.roomId}&platform=pc&player=web`,
      );
      if (!active()) return;
      const hosts = (config.host_server_list || []).filter(
        (h) =>
          typeof h.host === "string" &&
          /^[a-z0-9.-]+\.chat\.bilibili\.com$/i.test(h.host),
      );
      if (!hosts.length || !config.token)
        throw new Error("未取得弹幕服务器信息");
      const host = hosts[this.failures % hosts.length].host;
      const socket = new this.Socket(`wss://${host}/sub`);
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        if (!active()) return;
        socket.send(
          packet(7, {
            uid: this.uid,
            buvid: this.buvid,
            roomid: this.roomId,
            protover: 3,
            platform: "web",
            type: 2,
            key: config.token,
          }),
        );
      };
      socket.onmessage = (event) => {
        if (!active()) return;
        try {
          for (const entry of decodePackets(event.data)) {
            if (entry.operation === 8) {
              if (entry.data.code !== 0)
                throw new Error(`弹幕认证失败（${entry.data.code}）`);
              clearTimeout(this.deadline);
              this.connected = true;
              this.failures = 0;
              this.status = "弹幕通道已连接 · 等待第一条弹幕";
              this.lastHeartbeat = Date.now();
              socket.send(packet(2, "[object Object]"));
              clearInterval(this.heartbeat);
              this.heartbeat = setInterval(() => {
                if (Date.now() - this.lastHeartbeat > 65000)
                  return this.fail("弹幕心跳超时");
                try {
                  socket.send(packet(2, "[object Object]"));
                } catch {
                  this.fail("弹幕心跳发送失败");
                }
              }, 30000);
            } else if (entry.operation === 3) this.lastHeartbeat = Date.now();
            else if (entry.operation === 5 && this.connected)
              this.receive(entry.data);
          }
        } catch (error) {
          this.fail(error.message);
        }
      };
      socket.onerror = () => {
        if (active()) this.fail("实时弹幕网络连接失败");
      };
      socket.onclose = () => {
        if (active()) this.fail("实时弹幕连接已断开");
      };
    } catch (error) {
      if (active()) this.fail(error.message);
    }
  }

  receive(data) {
    this.events++;
    this.lastEvent = String(data.cmd || "unknown");
    if (data.cmd === "LOG_IN_NOTICE") {
      this.notice = String(data.data?.notice_msg || "Bilibili 提示需要登录");
      return;
    }
    if (!String(data.cmd).startsWith("DANMU_MSG")) {
      for (const event of roomEvents(data)) this.pushEvent(event);
      return;
    }
    const info = data.info;
    if (
      !Array.isArray(info) ||
      typeof info[1] !== "string" ||
      !Array.isArray(info[2])
    )
      return;
    const [uid, name] = info[2];
    if (!uid) {
      this.status = "已连接 · 部分弹幕缺少用户标识，未计票";
      return;
    }
    const message = this.pushEvent({
      kind: "chat",
      user: String(uid),
      name: String(name || uid).slice(0, 40),
      text: info[1].slice(0, 300),
    });
    this.messages.push(message);
    this.status = "已连接 · 正在接收实时弹幕";
    if (this.messages.length > 300)
      this.messages.splice(0, this.messages.length - 300);
  }

  pushEvent(event) {
    const entry = {
      ...event,
      id: `${this.session}:${++this.sequence}`,
      at: Date.now(),
    };
    this.roomEvents.push(entry);
    if (this.roomEvents.length > 300)
      this.roomEvents.splice(0, this.roomEvents.length - 300);
    return entry;
  }

  disconnect() {
    this.generation++;
    this.connected = false;
    clearTimeout(this.deadline);
    clearInterval(this.heartbeat);
    this.controller?.abort();
    if (this.socket) {
      this.socket.onopen =
        this.socket.onmessage =
        this.socket.onerror =
        this.socket.onclose =
          null;
      this.socket.close();
      this.socket = undefined;
    }
  }

  fail(message) {
    if (this.stopped) return;
    this.disconnect();
    this.status = `${message}，正在自动重连…`;
    clearTimeout(this.retry);
    this.retry = setTimeout(
      () => {
        this.ready = this.start();
      },
      Math.min(30000, 3000 * ++this.failures),
    );
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    this.disconnect();
  }
}

export function createBilibiliRelay(options = {}) {
  const rooms = new Map();
  const cleanup = setInterval(() => {
    for (const [key, room] of rooms) {
      if (Date.now() - room.lastUsed > 60000) {
        room.stop();
        rooms.delete(key);
      }
    }
  }, 15000);
  cleanup.unref?.();
  return {
    async get(room) {
      const cookie = options.loadCookie ? await options.loadCookie() : "";
      if (rooms.has(room) && rooms.get(room).cookie !== cookie) {
        rooms.get(room).stop();
        rooms.delete(room);
      }
      if (!rooms.has(room)) {
        if (rooms.size >= 8) {
          const oldest = [...rooms.entries()].sort(
            (a, b) => a[1].lastUsed - b[1].lastUsed,
          )[0];
          oldest[1].stop();
          rooms.delete(oldest[0]);
        }
        rooms.set(room, new BilibiliRoom(room, { ...options, cookie }));
      }
      return rooms.get(room).snapshot();
    },
    close() {
      clearInterval(cleanup);
      for (const room of rooms.values()) room.stop();
      rooms.clear();
    },
  };
}
