/** Synchronous ambient-context adapter. Vue does not propagate arbitrary awaits. */
export interface ContextManager {
  getContext(): any
  setContext(context: any): void
}

export let contextManager: ContextManager = {
  getContext() {},
  setContext() {},
}

export function setContextManager(manager: ContextManager): void {
  contextManager = manager
}

export function runWithContext<T>(context: any, fn: () => T): T {
  const manager = contextManager
  const previous = manager.getContext()
  manager.setContext(context)
  try {
    return fn()
  } finally {
    manager.setContext(previous)
  }
}
