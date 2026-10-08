import {
  type CompatVue,
  type ComponentPublicInstance,
  type ContextManager,
  contextManager,
  setContextManager,
} from 'vue'
declare const Vue: CompatVue

const manager: ContextManager = {
  getContext: () => undefined,
  setContext: (_context: unknown) => {},
}
setContextManager(manager)
contextManager.getContext = manager.getContext
contextManager.setContext = manager.setContext
Vue.contextManager = manager
const same: ContextManager = Vue.contextManager
same.getContext()
declare const instance: ComponentPublicInstance
instance._capturedContext
// @ts-expect-error adapter must implement both methods
setContextManager({ getContext() {} })
// @ts-expect-error setter requires an argument
contextManager.setContext()
