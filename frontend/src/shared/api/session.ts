export type SessionStamp = Readonly<{ identity: number; rotation: number }>;
type SessionChange = "identity" | "rotation";

export class BrowserSession {
  private stamp: SessionStamp = { identity: 0, rotation: 0 };
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly key: string;
  private readonly channel?: BroadcastChannel;
  private readonly locks?: LockManager;

  constructor(origin: string) {
    this.key = `task-tracker:session:${origin}`;
    if (typeof window === "undefined") return;
    this.locks = window.navigator.locks;
    if (typeof window.BroadcastChannel === "function") {
      this.channel = new window.BroadcastChannel(this.key);
      this.channel.onmessage = ({ data }) => {
        if (data === "identity" || data === "rotation") this.apply(data);
      };
    }
  }

  get current(): SessionStamp {
    return this.stamp;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  rotate() {
    this.publish("rotation");
  }

  changeIdentity() {
    this.publish("identity");
  }

  async runExclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.locks) return await this.locks.request(this.key, action);
    const result = this.queue.then(action);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private publish(change: SessionChange) {
    this.apply(change);
    this.channel?.postMessage(change);
  }

  private apply(change: SessionChange) {
    this.stamp = {
      identity: this.stamp.identity + (change === "identity" ? 1 : 0),
      rotation: this.stamp.rotation + 1,
    };
    if (change === "identity") {
      for (const listener of this.listeners) listener();
    }
  }
}
