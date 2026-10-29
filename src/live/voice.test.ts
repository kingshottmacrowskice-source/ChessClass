import { expect, it, vi } from 'vitest';
import { Voice } from './voice';
it('shows speech only when playback starts and waits for its end', async () => {
 let audio: any;
 class FakeAudio {
  onplaying?: () => void; onended?: () => void;
  constructor() { audio=this; }
  play() { return Promise.resolve(); }
  pause() {}
 }
 vi.stubGlobal('window', {});
 vi.stubGlobal('Audio',FakeAudio);
 vi.stubGlobal('fetch', vi.fn(async()=>new Response(new Blob(['audio']))));
 const start=vi.fn(); let finished=false;
 const voice=new Voice({enabled:true,provider:'coeiroink',voice:'auto',rate:1,pitch:1});
 try {
  const pending=voice.speak('你好',false,{japanese:'こんにちは',onStart:start}).then(()=>{finished=true;});
  await vi.waitFor(()=>expect(audio).toBeDefined());
  expect(start).not.toHaveBeenCalled(); expect(finished).toBe(false);
  audio.onplaying(); expect(start).toHaveBeenCalledOnce(); expect(finished).toBe(false);
  audio.onended(); await pending; expect(finished).toBe(true);
 } finally { vi.unstubAllGlobals(); }
});
