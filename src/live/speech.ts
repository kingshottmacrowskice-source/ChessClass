import { useEffect, useRef, useState } from "react";

export type Bubble = { id: number; text: string };

export function bubbleDuration(text: string) {
  return Math.min(
    14000,
    Math.max(2200, 1200 + Array.from(text.replace(/\s/g, "")).length * 210),
  );
}

/** How many bubbles can stay on screen before the oldest is dropped. */
const MAX_BUBBLES = 5;

/**
 * A queue of speech bubbles: new lines stack in order instead of replacing the
 * current one. Each bubble lives for `bubbleDuration` and then fades out on its
 * own; a streaming reply grows in place inside its own bubble.
 */
export function useSpeechBubble(initial: string) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() =>
    initial ? [{ id: 0, text: initial }] : [],
  );
  const listRef = useRef<Bubble[]>(initial ? [{ id: 0, text: initial }] : []);
  const nextId = useRef(initial ? 1 : 0);
  const alive = useRef(true);
  const streaming = useRef(false);
  const lastShownAt = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const texts = useRef(new Map<number, string>());

  const commit = (list: Bubble[]) => {
    listRef.current = list;
    setBubbles(list);
  };
  const clearTimer = (id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    texts.current.delete(id);
  };
  const dismiss = (id: number) => {
    clearTimer(id);
    if (alive.current) commit(listRef.current.filter((b) => b.id !== id));
  };
  const schedule = (id: number, text: string) => {
    clearTimer(id);
    timers.current.set(
      id,
      setTimeout(() => dismiss(id), bubbleDuration(text)),
    );
  };
  const push = (text: string) => {
    const id = nextId.current++;
    texts.current.set(id, text);
    let list = [...listRef.current, { id, text }];
    if (list.length > MAX_BUBBLES) {
      list.slice(0, list.length - MAX_BUBBLES).forEach((b) => clearTimer(b.id));
      list = list.slice(list.length - MAX_BUBBLES);
    }
    commit(list);
    return id;
  };

  /** Show a finished line. Soft lines yield to a stream or a line < 2.5s old. */
  const say = (value: string, soft = false) => {
    if (!alive.current) return false;
    if (
      soft &&
      (streaming.current ||
        (lastShownAt.current && performance.now() - lastShownAt.current < 2500))
    )
      return false;
    streaming.current = false;
    lastShownAt.current = performance.now();
    const id = push(value);
    if (value) schedule(id, value);
    return true;
  };
  const beginStream = () => {
    streaming.current = true;
    lastShownAt.current = performance.now();
    return push("");
  };
  const streamText = (id: number, value: string) => {
    if (!alive.current) return;
    lastShownAt.current = performance.now();
    texts.current.set(id, value);
    commit(
      listRef.current.map((b) => (b.id === id ? { ...b, text: value } : b)),
    );
  };
  const endStream = (id: number) => {
    if (!alive.current) return;
    streaming.current = false;
    const text = texts.current.get(id) ?? "";
    if (!text.trim()) {
      dismiss(id);
      return;
    }
    schedule(id, text);
  };

  useEffect(() => {
    if (initial) schedule(0, initial);
    return () => {
      alive.current = false;
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  const clear = () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    texts.current.clear();
    streaming.current = false;
    commit([]);
  };
  return {
    bubbles,
    say,
    beginStream,
    streamText,
    endStream,
    clear,
    hold: push,
    dismiss,
  };
}
