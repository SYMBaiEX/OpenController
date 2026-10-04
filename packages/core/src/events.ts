export type Unsubscribe = () => void;

export class EventEmitter<TEvents extends Record<string, unknown>> {
  private readonly listeners = new Map<
    keyof TEvents,
    Set<(...args: never[]) => unknown>
  >();

  on<TKey extends keyof TEvents>(
    eventName: TKey,
    listener: (event: TEvents[TKey]) => void,
  ): Unsubscribe {
    const listeners =
      this.listeners.get(eventName) ?? new Set<(...args: never[]) => unknown>();
    listeners.add(listener as (...args: never[]) => unknown);
    this.listeners.set(eventName, listeners);

    return () => {
      listeners.delete(listener as (...args: never[]) => unknown);
      if (listeners.size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit<TKey extends keyof TEvents>(
    eventName: TKey,
    event: TEvents[TKey],
  ): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return;
    }

    for (const listener of [...listeners]) {
      (listener as (event: TEvents[TKey]) => void)(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
