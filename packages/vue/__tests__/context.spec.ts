import {
  Suspense,
  contextManager,
  createApp,
  h,
  nextTick,
  setContextManager,
} from '../src'

let ambient: any
const original = contextManager
beforeEach(() => {
  setContextManager({
    getContext: () => ambient,
    setContext: value => {
      ambient = value
    },
  })
})
afterEach(() => setContextManager(original))

it.each([false, true])(
  'runtime compiler callbacks use captured context (async setup: %s)',
  async asynchronous => {
    const names: string[] = []
    const owner = {
      createWithValue(key: string, name: string) {
        expect(key).toBe('VueComponent')
        names.push(name)
        return this
      },
    }
    const seen: any[] = []
    let resolve!: (value: {}) => void
    const pending = new Promise<{}>(r => (resolve = r))
    const Child = {
      name: 'CompilerOwner',
      inheritAttrs: false,
      template: asynchronous ? '<x-async></x-async>' : '<x-sync></x-sync>',
      setup: () => (asynchronous ? pending : {}),
    }
    ambient = 'mount caller'
    const app = createApp({
      render: () =>
        h(Suspense, null, { default: () => h(Child, { ctx: owner }) }),
    })
    app.config.isCustomElement = () => {
      seen.push(ambient)
      return true
    }
    const container = document.createElement('div')
    app.mount(container)
    expect(ambient).toBe('mount caller')
    if (asynchronous) {
      expect(seen).toEqual([])
      ambient = 'resolution caller'
      resolve({})
      await pending
      await nextTick()
    }
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(value => value === owner)).toBe(true)
    expect(names).toEqual(['CompilerOwner'])
    expect(ambient).toBe(asynchronous ? 'resolution caller' : 'mount caller')
    expect(container.innerHTML).toBe(
      asynchronous ? '<x-async></x-async>' : '<x-sync></x-sync>',
    )
    app.unmount()
  },
)

it.each([false, true])(
  'native functional components with global mixins (configured manager: %s)',
  configured => {
    const names: string[] = []
    const owner = {
      createWithValue(_key: string, name: string) {
        names.push(name)
        return this
      },
    }
    if (!configured) setContextManager(original)
    ambient = owner
    function Functional() {
      return h('div', 'functional')
    }
    const app = createApp({ render: () => h(Functional) })
    app.mixin({ created() {} })
    const container = document.createElement('div')
    app.mount(container)
    expect(container.innerHTML).toBe('<div>functional</div>')
    expect(names).toEqual(configured ? ['Functional'] : [])
    app.unmount()
  },
)
