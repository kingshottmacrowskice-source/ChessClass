import { useEffect, useRef, useState } from "react";
export function bubbleDuration(text: string) {
  return Math.min(
    14000,
    Math.max(2200, 1200 + Array.from(text.replace(/\s/g, "")).length * 210),
  );
}
export function useSpeechBubble(initial: string) {
  const [bubble, setBubble] = useState(initial),
    text = useRef(initial),
    version = useRef(0),
    alive = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout>>();
  const stop = () => clearTimeout(timer.current);
  const schedule = () => {
    stop();
    const id = version.current;
    timer.current = setTimeout(() => {
      if (alive.current && id === version.current) {
        text.current = "";
        setBubble("");
      }
    }, bubbleDuration(text.current));
  };
  const say = (value: string) => {
    if (!alive.current) return;
    version.current++;
    stop();
    text.current = value;
    setBubble(value);
    if (value) schedule();
  };
  const beginStream = () => {
    version.current++;
    stop();
    return version.current;
  };
  const streamText = (id: number, value: string) => {
    if (alive.current && id === version.current) {
      text.current = value;
      setBubble(value);
    }
  };
  const endStream = (id: number) => {
    if (alive.current && id === version.current) schedule();
  };
  useEffect(() => {
    schedule();
    return () => {
      alive.current = false;
      stop();
    };
  }, []);
  return { bubble, say, beginStream, streamText, endStream };
}
