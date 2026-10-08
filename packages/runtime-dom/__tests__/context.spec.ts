import {
  contextManager,
  createApp,
  createSSRApp,
  defineAsyncComponent,
  h,
  setContextManager,
} from '../src'

let ambient: any
const original = contextManager
afterEach(() => setContextManager(original))

it('native root captures at mount rather than createApp and child first created in patch inherits owner', () => {
  setContextManager({
    getContext: () => ambient,
    setContext: value => {
      ambient = value
    },
  })
  ambient = 'creation'
  let visible = false
  const seen: any[] = []
  const Child = {
    setup() {
      seen.push(ambient)
    },
    render: () => h('div'),
  }
  const app = createApp({ render: () => (visible ? h(Child) : h('div')) })
  ambient = 'mount'
  const vm = app.mount(document.createElement('div'))
  expect(vm._capturedContext).toBe('mount')
  ambient = 'caller'
  visible = true
  vm.$.update()
  expect(seen).toEqual(['mount'])
  expect(ambient).toBe('caller')
  app.unmount()
})

it('deferred async hydration enters captured context including child creation', async () => {
  setContextManager({
    getContext: () => ambient,
    setContext: value => {
      ambient = value
    },
  })
  const seen: any[] = []
  let hydrate!: () => void
  const Child = {
    setup() {
      seen.push(ambient)
    },
    render() {
      seen.push(ambient)
      return h('span', 'hydrated')
    },
  }
  const Comp = defineAsyncComponent({
    loader: () =>
      Promise.resolve({
        render() {
          seen.push(ambient)
          return h(Child)
        },
      }),
    hydrate: run => {
      hydrate = run
    },
  })
  const container = document.createElement('div')
  container.innerHTML = '<span>hydrated</span>'
  const owner = {
    createWithValue() {
      return this
    },
  }
  ambient = owner
  const app = createSSRApp({ render: () => h(Comp) })
  app.mount(container)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  ambient = 'caller'
  expect(hydrate).toBeTypeOf('function')
  hydrate()
  expect(seen).toEqual([owner, owner, owner])
  expect(ambient).toBe('caller')
  app.unmount()
})

it('DOM stable invokers retain owner context for single, patched arrays, once and stopped handlers', () => {
  setContextManager({
    getContext: () => ambient,
    setContext: value => {
      ambient = value
    },
  })
  const seen: any[] = []
  const owner = { id: 'owner' }
  ambient = owner
  let handlers: any = () => seen.push(ambient)
  const app = createApp({
    render: () =>
      h('button', { onClick: handlers, onFocusOnce: () => seen.push(ambient) }),
  })
  const root = document.createElement('div')
  const vm = app.mount(root)
  const el = root.firstChild!
  ambient = 'caller'
  el.dispatchEvent(new Event('click'))
  handlers = [
    (event: Event) => {
      seen.push(ambient)
      event.stopImmediatePropagation()
    },
    () => seen.push('wrong'),
  ]
  vm.$.update()
  el.dispatchEvent(new Event('click'))
  el.dispatchEvent(new Event('focus'))
  el.dispatchEvent(new Event('focus'))
  expect(seen).toEqual([owner, owner, owner])
  expect(ambient).toBe('caller')
  app.unmount()
})
