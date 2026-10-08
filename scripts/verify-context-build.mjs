// Run after CJS builds: node scripts/verify-context-build.mjs
// Repeat with NODE_ENV=production to verify production entrypoints.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of [
  'window',
  'document',
  'Element',
  'HTMLElement',
  'SVGElement',
  'MathMLElement',
  'Node',
  'Event',
]) {
  if (dom.window[key]) globalThis[key] = dom.window[key]
}
const suffix =
  process.env.NODE_ENV === 'production' ? '.cjs.prod.js' : '.cjs.js'
const native = require('./packages/vue/dist/vue' + suffix)
const runtimeDom = require('./packages/runtime-dom/dist/runtime-dom' + suffix)
const core = require('./packages/runtime-core/dist/runtime-core' + suffix)
const ssr = require('./packages/server-renderer/dist/server-renderer' + suffix)
let ambient
const manager = {
  getContext: () => ambient,
  setContext: value => {
    ambient = value
  },
}
const owner = {
  createWithValue(key, name) {
    return { ...this, key, name }
  },
}
native.setContextManager(manager)
assert.equal(runtimeDom.contextManager, manager)
assert.equal(core.contextManager, manager)
const seen = []
const Comp = {
  name: 'Built',
  setup() {
    seen.push(ambient.name)
    return {}
  },
  render() {
    seen.push(ambient.name)
    return native.h(
      'button',
      { onClick: () => seen.push(ambient.name) },
      'built',
    )
  },
}
ambient = 'outside'
const app = native.createApp(Comp, { ctx: owner })
const root = document.createElement('div')
const vm = app.mount(root)
assert.equal(vm._capturedContext.name, 'Built')
root.firstChild.dispatchEvent(new Event('click'))
assert.deepEqual(seen, ['Built', 'Built', 'Built'])
assert.equal(ambient, 'outside')
assert.equal(
  await vm.$nextTick(function () {
    assert.equal(this, vm)
    return ambient
  }),
  'outside',
)
ambient = undefined
assert.equal(await vm.$nextTick(() => ambient), vm._capturedContext)
app.unmount()
const html = await ssr.renderToString(
  native.createSSRApp(
    {
      name: 'Server',
      async setup() {
        assert.equal(ambient.name, 'Server')
        await Promise.resolve()
        return {}
      },
      created() {
        assert.equal(ambient.name, 'Server')
      },
      render() {
        assert.equal(ambient.name, 'Server')
        return native.h('span', 'ssr')
      },
    },
    { ctx: owner },
  ),
)
assert.match(html, /ssr/)
assert.equal(ambient, undefined)
const Vue = require('./packages/vue-compat/dist/vue' + suffix)
Vue.configureCompat({
  MODE: 2,
  GLOBAL_MOUNT: 'suppress-warning',
  RENDER_FUNCTION: false,
  INSTANCE_EVENT_EMITTER: 'suppress-warning',
  INSTANCE_EVENT_HOOKS: 'suppress-warning',
  INSTANCE_DESTROY: 'suppress-warning',
})
Vue.contextManager = manager
assert.equal(Vue.contextManager, manager)
const compatSeen = []
const cvm = new Vue({
  propsData: { ctx: owner },
  name: 'CompatBuilt',
  created() {
    compatSeen.push(ambient.name)
  },
  render: () => Vue.h('div'),
})
ambient = 'compatCaller'
cvm.$on('hook:mounted', () => compatSeen.push(ambient.name))
cvm.$on('test', () => compatSeen.push(ambient))
cvm.$mount()
cvm.$emit('test')
assert.deepEqual(compatSeen, ['CompatBuilt', 'CompatBuilt', 'compatCaller'])
assert.equal(ambient, 'compatCaller')
const replacement = { ...manager }
Vue.setContextManager(replacement)
assert.equal(Vue.contextManager, replacement)
cvm.$destroy()
console.log(
  JSON.stringify({
    mode: process.env.NODE_ENV || 'development',
    native: ['vue', 'runtime-dom', 'runtime-core', 'server-renderer'],
    compat: 'live replacement + constructor/lifecycle/event capture',
    assertions: 'all passed',
  }),
)
