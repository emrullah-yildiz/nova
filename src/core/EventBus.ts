type Listener = (...args: unknown[]) => void

export class EventBus {
  private listeners: Map<string, Set<Listener>> = new Map()

  on(event: string, callback: Listener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: Listener): void {
    const set = this.listeners.get(event)
    if (set) {
      set.delete(callback)
      if (set.size === 0) this.listeners.delete(event)
    }
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event)
    if (set) {
      set.forEach(cb => {
        try { cb(...args) } catch (e) { console.error(`[EventBus] Error in "${event}":`, e) }
      })
    }
  }
}

export const events = new EventBus()
