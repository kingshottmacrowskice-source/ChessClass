// Field mappings: xfgryujk/blivedm, blivedm/models/web.py and models/pb.py.
// Decode only the protobuf fields needed for interactions and gifts; no raw payload is exposed.
function fields(bytes) {
  const out = new Map();
  let offset = 0;
  const uint = () => {
    let value = 0n;
    for (let shift = 0n; shift < 70n && offset < bytes.length; shift += 7n) {
      const byte = bytes[offset++];
      value |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return value;
    }
    throw new Error("Invalid protobuf integer");
  };
  while (offset < bytes.length) {
    const tag = Number(uint()),
      wire = tag & 7,
      field = tag >>> 3;
    if (!field) throw new Error("Invalid protobuf field");
    let value;
    if (wire === 0) value = uint().toString();
    else {
      const length =
        wire === 2 ? Number(uint()) : wire === 1 ? 8 : wire === 5 ? 4 : -1;
      if (length < 0 || length > bytes.length - offset)
        throw new Error("Invalid protobuf length");
      value = bytes.subarray(offset, offset + length);
      offset += length;
    }
    out.set(field, [...(out.get(field) || []), value]);
  }
  return out;
}
const value = (map, key) => map.get(key)?.[0]?.toString("utf8") ?? "";
const short = (v, n = 80) => String(v ?? "").slice(0, n);
const number = (v) =>
  Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined;

/** Normalize factual events, keeping paid-message text out of the voting path. */
export function roomEvents(command) {
  const cmd = String(command.cmd || "").split(":")[0];
  let d = command.data;
  if (!d || typeof d !== "object") return [];
  try {
    if (cmd === "INTERACT_WORD_V2" || cmd === "SEND_GIFT_V2") {
      if (typeof d.pb !== "string" || d.pb.length > 262144) return [];
      const p = fields(Buffer.from(d.pb, "base64"));
      if (cmd === "INTERACT_WORD_V2")
        d = { uid: value(p, 1), uname: value(p, 2), msg_type: value(p, 5) };
      else
        return (p.get(10) || []).flatMap((bytes) => {
          const gift = fields(bytes);
          return roomEvents({
            cmd: "SEND_GIFT",
            data: {
              uid: value(p, 1),
              uname: value(p, 2),
              giftName: value(gift, 2),
              num: value(gift, 3),
              giftId: value(gift, 1),
              total_coin: value(gift, 7),
              coin_type: value(gift, 8),
            },
          });
        });
    }
    const identity = {
      user: short(d.uid, 32),
      name: short(d.uname ?? d.username ?? d.user_info?.uname ?? "观众", 40),
    };
    if (cmd === "INTERACT_WORD" || cmd === "INTERACT_WORD_V2") {
      const kind = { 1: "entry", 2: "follow", 3: "share" }[Number(d.msg_type)];
      return kind ? [{ kind, ...identity }] : [];
    }
    if (cmd === "SEND_GIFT") {
      if (typeof d.giftName !== "string" || !number(d.num)) return [];
      return [
        {
          kind: "gift",
          ...identity,
          gift: short(d.giftName),
          count: number(d.num),
          giftId: short(d.giftId),
          totalCoin: number(d.total_coin),
          coinType: short(d.coin_type),
        },
      ];
    }
    if (cmd === "GUARD_BUY")
      return [
        {
          kind: "guard",
          ...identity,
          level: number(d.guard_level),
          count: number(d.num),
          gift: short(d.gift_name),
        },
      ];
    if (cmd === "SUPER_CHAT_MESSAGE")
      return [
        {
          kind: "superchat",
          ...identity,
          text: short(d.message, 300),
          amount: number(d.price),
          currency: "CNY",
        },
      ];
    if (cmd === "LIKE_INFO_V3_CLICK") return [{ kind: "like", ...identity }];
    return [];
  } catch {
    // A malformed optional notification must not disconnect the chat transport.
    return [];
  }
}
