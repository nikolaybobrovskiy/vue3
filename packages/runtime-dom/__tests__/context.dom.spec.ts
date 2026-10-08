import {
  contextManager,
  createApp,
  createSSRApp,
  createVNode,
  h,
  ref,
  setContextManager,
  vModelText,
  watch,
  withCtx,
  withDirectives,
} from '../src'
import { PatchFlags } from '@vue/shared'

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

it('native text model assignment and synchronous watchers enter the DOM owner', () => {
  const owner = { id: 'owner' }
  ambient = owner
  const model = ref('')
  const seen: any[] = []
  const app = createApp({
    setup() {
      watch(model, () => seen.push(['watch', ambient]), { flush: 'sync' })
      return () =>
        withDirectives(
          h('input', {
            'onUpdate:modelValue': (value: string) => {
              seen.push(['assign', ambient])
              model.value = value
            },
            onInput: () => seen.push(['input', ambient]),
          }),
          [[vModelText, model.value]],
        )
    },
  })
  const root = document.createElement('div')
  app.mount(root)
  ambient = 'caller'
  const input = root.firstChild as HTMLInputElement
  input.value = 'changed'
  input.dispatchEvent(new Event('input'))
  expect(model.value).toBe('changed')
  expect(seen).toEqual([
    ['assign', owner],
    ['watch', owner],
    ['input', owner],
  ])
  expect(ambient).toBe('caller')
  app.unmount()
})

it.each([0, PatchFlags.FULL_PROPS, PatchFlags.PROPS, PatchFlags.TEXT])(
  'stable DOM listeners change creator without replacing handlers (flag %s)',
  flag => {
    const parent = { id: 'parent' }
    const child = { id: 'child' }
    const seen: any[] = []
    const props = { onClick: () => seen.push(ambient) }
    let own = false
    const button = () => createVNode('button', props, 'slot', flag, ['onClick'])
    const Child = {
      inheritAttrs: false,
      setup(_: any, { slots }: any) {
        return () => (own ? button() : slots.default()[0])
      },
    }
    ambient = parent
    const app = createApp({
      render: () =>
        h(Child, { ctx: child }, { default: withCtx(() => [button()]) }),
    })
    const root = document.createElement('div')
    const vm = app.mount(root)
    const el = root.firstChild!
    ambient = 'caller'
    el.dispatchEvent(new Event('click'))
    own = true
    vm.$.subTree.component!.update()
    expect(root.firstChild).toBe(el)
    el.dispatchEvent(new Event('click'))
    expect(seen).toEqual([parent, child])
    expect(ambient).toBe('caller')
    app.unmount()
  },
)

it.each([false, true])(
  'DOM VNodes created outside rendering fall back to the patching component (hydrate %s)',
  hydrate => {
    const owner = { id: 'owner' }
    const seen: any[] = []
    const vnode = h('button', { onClick: () => seen.push(ambient) })
    expect(vnode.ctx).toBe(null)
    ambient = owner
    const app = (hydrate ? createSSRApp : createApp)({ render: () => vnode })
    const root = document.createElement('div')
    if (hydrate) root.innerHTML = '<button></button>'
    app.mount(root)
    ambient = 'caller'
    root.firstChild!.dispatchEvent(new Event('click'))
    expect(seen).toEqual([owner])
    expect(ambient).toBe('caller')
    app.unmount()
  },
)

it('slotted listener errors retain the patching component for error handling', () => {
  const parent = { id: 'parent' }
  const child = { id: 'child' }
  const error = new Error('listener')
  const seen: any[] = []
  const Child = {
    inheritAttrs: false,
    setup(_: any, { slots }: any) {
      return () => slots.default()[0]
    },
  }
  ambient = parent
  const app = createApp({
    render: () =>
      h(
        Child,
        { ctx: child },
        {
          default: withCtx(() => [
            h('button', {
              onClick: () => {
                seen.push(ambient)
                throw error
              },
            }),
          ]),
        },
      ),
  })
  const root = document.createElement('div')
  const vm = app.mount(root)
  const errorHandler = vi.fn()
  app.config.errorHandler = errorHandler
  ambient = 'caller'
  root.firstChild!.dispatchEvent(new Event('click'))
  expect(seen).toEqual([parent])
  expect(errorHandler).toHaveBeenCalledTimes(1)
  expect(errorHandler.mock.calls[0][0]).toBe(error)
  expect(errorHandler.mock.calls[0][1]).toBe(vm.$.subTree.component!.proxy)
  expect(ambient).toBe('caller')
  app.unmount()
})

it.each([
  [false, 0],
  [false, PatchFlags.PROPS],
  [false, PatchFlags.FULL_PROPS],
  [true, 0],
  [true, PatchFlags.TEXT],
  [true, PatchFlags.NEED_HYDRATION],
] as const)(
  'slotted DOM listeners use their creator (hydrate %s, flag %s) and updates',
  (hydrate, flag) => {
    const parent = { id: 'parent' }
    const child = { id: 'child' }
    const seen: any[] = []
    let version = 0
    const Child = {
      setup(_: any, { slots }: any) {
        return () =>
          h(
            'div',
            { onClick: () => seen.push(['child', ambient]) },
            slots.default(),
          )
      },
    }
    ambient = parent
    const app = (hydrate ? createSSRApp : createApp)({
      inheritAttrs: false,
      setup() {
        return () =>
          h(
            Child,
            { ctx: child },
            {
              default: withCtx(() => {
                // Rendering a slot must not itself rebind ambient context.
                expect(ambient).toBe(child)
                const renderedVersion = version
                const vnode = createVNode(
                  'button',
                  { onClick: () => seen.push([renderedVersion, ambient]) },
                  'slot',
                  flag | (version ? PatchFlags.PROPS : 0),
                  ['onClick'],
                )
                expect(vnode.ctx!._capturedContext).toBe(parent)
                return vnode
              }),
            },
          )
      },
    })
    const root = document.createElement('div')
    if (hydrate) root.innerHTML = '<div><button>slot</button></div>'
    const vm = app.mount(root)
    ambient = 'caller'
    root.querySelector('button')!.dispatchEvent(
      Object.assign(new Event('click', { bubbles: true }), {
        _vts: Infinity,
      }),
    )
    expect(seen).toEqual([
      [0, parent],
      ['child', child],
    ])
    expect(ambient).toBe('caller')
    seen.length = 0
    version++
    vm.$.update()
    root.querySelector('button')!.dispatchEvent(
      Object.assign(new Event('click', { bubbles: true }), {
        _vts: Infinity,
      }),
    )
    expect(seen).toEqual([
      [1, parent],
      ['child', child],
    ])
    expect(ambient).toBe('caller')
    app.unmount()
  },
)
