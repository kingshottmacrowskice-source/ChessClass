/** 背景音乐播放器：开场无人下棋时放 start 曲，对局进行中放 play 曲，单曲循环。 */
export class MusicPlayer {
  private audio = new Audio();
  private mode: "off" | "start" | "game" = "off";
  private index = 0;
  private playlist: string[] = [];
  /** 当前曲目是否已完整播完至少一遍（决定切歌权限是否可用）。 */
  private completedOnce = false;
  /** 已排队、等待当前曲目播完后再执行的切歌请求。 */
  private pendingNext = false;

  private readonly startList = ["/music/start1.m4a", "/music/start2.m4a"];
  private readonly gameList = [
    "/music/play1.m4a",
    "/music/play2.m4a",
    "/music/play3.m4a",
    "/music/play4.m4a",
    "/music/play5.m4a",
  ];

  constructor() {
    this.audio.volume = 0.5;
    this.audio.preload = "none";
  }

  private shuffle(list: string[]) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private play() {
    if (this.mode === "off" || !this.playlist.length) return;
    this.audio.src = this.playlist[this.index % this.playlist.length];
    this.audio.loop = false;
    this.audio.onended = () => {
      // 当前曲目已完整播完一遍。
      this.completedOnce = true;
      if (this.pendingNext) {
        // 排队中的切歌请求：只在这里真正切换，绝不半途打断。
        this.pendingNext = false;
        this.completedOnce = false;
        this.index = (this.index + 1) % this.playlist.length;
        this.play();
      } else {
        // 没有切歌请求：循环播放同一首。
        this.audio.currentTime = 0;
        void this.audio.play().catch(() => {
          /* 浏览器可能拦截自动播放；等下次触发再尝试。 */
        });
      }
    };
    void this.audio.play().catch(() => {
      /* 浏览器可能拦截自动播放；等下次触发再尝试。 */
    });
  }

  /** 切歌权限当前是否可用：当前曲目已至少播完一遍。 */
  switchable() {
    return this.completedOnce;
  }

  /** 请求切到下一首。仅当当前曲目已播完一遍后才受理，返回是否已受理。 */
  requestNext() {
    if (!this.completedOnce || this.pendingNext) return false;
    this.pendingNext = true;
    return true;
  }

  playStart() {
    if (this.mode === "start") return;
    this.mode = "start";
    this.playlist = this.shuffle(this.startList);
    this.index = 0;
    this.completedOnce = false;
    this.pendingNext = false;
    this.play();
  }

  playGame() {
    if (this.mode === "game") return;
    this.mode = "game";
    this.playlist = this.shuffle(this.gameList);
    this.index = 0;
    this.completedOnce = false;
    this.pendingNext = false;
    this.play();
  }

  stop() {
    this.mode = "off";
    this.completedOnce = false;
    this.pendingNext = false;
    this.audio.pause();
    this.audio.onended = null;
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
