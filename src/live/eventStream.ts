export type LiveEventKind =
  | "session"
  | "chat"
  | "vote"
  | "move"
  | "analysis"
  | "entry"
  | "follow"
  | "share"
  | "gift"
  | "guard"
  | "superchat"
  | "like"
  | "speech";
export type LiveEvent = {
  id: number;
  at: number;
  kind: LiveEventKind;
  data: unknown;
  historical?: boolean;
};
export type EventBatch = {
  events: LiveEvent[];
  history: LiveEvent[];
  cursor: number;
  dropped: number;
};

/** The board writes facts only. Reading never triggers a model or removes events. */
export class LiveEventStream {
  private events: LiveEvent[] = [];
  private sequence = 0;
  constructor(private capacity = 300) {}
  append(
    kind: LiveEventKind,
    data: unknown,
    at = Date.now(),
    historical = false,
  ) {
    this.events.push({
      id: ++this.sequence,
      at,
      kind,
      data,
      ...(historical ? { historical: true } : {}),
    });
    if (this.events.length > this.capacity) this.events.shift();
  }
  read(after: number): EventBatch {
    const unseen = this.events.filter((e) => e.id > after);
    const events = unseen.filter((e) => !e.historical);
    return {
      events,
      history: this.events
        .filter((e) => e.id <= after || e.historical)
        .slice(-40),
      cursor: this.sequence,
      dropped: Math.max(0, (unseen[0]?.id ?? this.sequence + 1) - after - 1),
    };
  }
  recordSpeech(text: string, source: "local" | "ai", reason?: string) {
    if (text.trim()) this.append("speech", { text, source, reason });
  }
  clear() {
    this.events = [];
    this.sequence = 0;
  }
}
