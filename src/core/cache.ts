export class Lru<T> {
  private map = new Map<string, T>();
  constructor(private limit = 80) {}
  get(key: string) {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, v: T) {
    this.map.delete(key);
    this.map.set(key, v);
    while (this.map.size > this.limit)
      this.map.delete(this.map.keys().next().value!);
  }
  clear() {
    this.map.clear();
  }
}
export const abortError = () => new DOMException("请求已取消", "AbortError");
