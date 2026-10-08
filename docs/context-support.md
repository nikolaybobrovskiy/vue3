# Ambient context support

This port preserves the nbgo Vue 2 v4 synchronous ambient-context behavior. Source provenance: Vue 2 commits `467fcef5` (initial context support), `5f9a9a6e`, `379e9dda`, and `826ec1d1`; the source comparison is `e90cc60c..f9dd8416`. The final `f9dd8416` commit rebuilds distribution files without adding source semantics.

## Adapter

```ts
import { createApp, contextManager, setContextManager } from 'vue'

let ambient: any
setContextManager({
  getContext: () => ambient,
  setContext: value => {
    ambient = value
  },
})
// Alternatively, replace contextManager.getContext / .setContext individually.
createApp(Component, { ctx: requestContext }).mount('#app')
```

The default adapter does nothing. In the compatibility build, `Vue.contextManager = adapter` replaces the same backing manager used by that build's runtime; its getter is live. Independently bundled Vue copies do not share this singleton.

A component captures `vnode.props.ctx || contextManager.getContext()` once, even if `ctx` is not declared as a prop. Falsy `ctx` values use ambient context. When the capture is truthy and merged options contain an explicit `name`, Vue derives the capture with `createWithValue('VueComponent', name)`. Filename-inferred `__name` is not used. Native roots capture at mount; `new Vue({ propsData: { ctx } })` captures at constructor time. Public and internal instances expose `_capturedContext`; the framework's unrelated internal `ctx` field is unchanged. Updating props does not recapture.

`ctx` remains a normal Vue prop/attribute, not a reserved framework-only field. An undeclared `ctx` can fall through onto a DOM root or root child component. Declare it as a prop when it should be consumed by a component, or use `inheritAttrs: false` and explicitly forward only the intended attributes. Context capture itself does not remove or mutate the incoming props.

## Boundaries and limits

- Initialization includes prop default factories, Composition setup, Options beforeCreate/data/provide/immediate watchers/created. Async setup's complete Vue-managed setup completion is also scoped, including runtime compiler callbacks.
- Client render **and patch**, resumed render, deferred hydration, SSR optimized rendering and ordinary subtree traversal use owning capture. Children created inside these boundaries inherit through ambient context, not a universal parent fallback.
- Options/Composition lifecycle hooks, KeepAlive hooks and compat `hook:*` events use owning capture.
- DOM listeners use their VNode creator's capture, including slotted listeners, stable updated invokers, arrays and once listeners. A VNode created outside rendering falls back to the patching component. Native DOM `v-model` handlers (text, lazy/composition, checkbox, radio, select and dynamic models) use their creator's capture too; without a VNode creator, they fall back to the component that attached the directive. Vnode-prop component event handlers (normal and once) and legacy component v-model handlers deliberately execute under **undefined** context. Direct compat `$on`/`$once` handlers execute in emitting caller ambient context.
- The first queued scheduler job captures the caller's ambient context for the entire flush, post callbacks and recursive drain. Ordinary pre/post watchers therefore use flush context; synchronous watchers use calling ambient. Watchers and methods are not universally rebound. Slots keep executing ambient context.
- `$nextTick(callback)` captures calling ambient with truthy fallback to instance capture, preserving `this`, result and rejection. Native named `nextTick(callback)` also captures calling ambient (a Vue 3 extension). Callbackless `nextTick()` is only a flush promise.

Every scoped synchronous boundary restores its prior context in `finally`, including thrown errors. There is **no general propagation through arbitrary `await`, asynchronous handlers, timers or callbackless nextTick**. The adapter is not a request-isolation mechanism by itself; use a suitable external async-context implementation when isolation across concurrent requests is required. `withAsyncContext` and render-instance/slot binding APIs are intentionally unchanged.
