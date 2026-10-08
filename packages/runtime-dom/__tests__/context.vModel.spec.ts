import {
  cloneVNode,
  contextManager,
  createApp,
  createSSRApp,
  defineAsyncComponent,
  h,
  nextTick,
  ref,
  setContextManager,
  vModelCheckbox,
  vModelDynamic,
  vModelRadio,
  vModelSelect,
  vModelText,
  watch,
  withDirectives,
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

it.each([
  ['text', vModelText, 'input', 'text'],
  ['checkbox', vModelCheckbox, 'input', 'checkbox'],
  ['radio', vModelRadio, 'input', 'radio'],
  ['select', vModelSelect, 'select', undefined],
  ['dynamic text', vModelDynamic, 'input', 'text'],
  ['dynamic checkbox', vModelDynamic, 'input', 'checkbox'],
  ['dynamic radio', vModelDynamic, 'input', 'radio'],
  ['dynamic select', vModelDynamic, 'select', undefined],
] as const)(
  '%s uses the directive owner only when the VNode has no creator',
  async (_, directive, tag, type) => {
    for (const hydrate of [false, true]) {
      for (const hasCreator of [false, true]) {
        const creator = { id: 'creator' }
        const owner = { id: 'directive owner' }
        const initial = type === 'checkbox' ? false : ''
        const model = ref<any>(initial)
        const seen: any[] = []
        let version = 0
        const makeShell = () =>
          h(
            tag,
            { type, value: tag === 'input' ? 'picked' : undefined },
            tag === 'select'
              ? [h('option', { value: '' }), h('option', { value: 'picked' })]
              : undefined,
          )
        const shell = makeShell()
        expect(shell.ctx).toBeNull()
        const Child = {
          inheritAttrs: false,
          setup() {
            watch(model, () => seen.push(['watch', ambient]), { flush: 'sync' })
            return () => {
              const assignedVersion = version
              return withDirectives(
                cloneVNode(hasCreator ? createdShell! : shell, {
                  'onUpdate:modelValue': (value: any) => {
                    seen.push([assignedVersion, ambient])
                    model.value = value
                  },
                }),
                [[directive, model.value]],
              )
            }
          },
        }
        let createdShell: ReturnType<typeof h> | undefined
        ambient = creator
        const app = (hydrate ? createSSRApp : createApp)({
          render() {
            createdShell = makeShell()
            return h(Child, { ctx: owner })
          },
        })
        const root = document.createElement('div')
        if (hydrate) {
          root.innerHTML =
            tag === 'select'
              ? '<select><option value=""></option><option value="picked"></option></select>'
              : `<input type="${type}" value="picked">`
        }
        const vm = app.mount(root)
        const el = root.firstChild as HTMLInputElement | HTMLSelectElement
        const expectedOwner = hasCreator ? creator : owner
        for (version = 0; version < 2; version++) {
          ambient = 'caller'
          if (version) vm.$.subTree.component!.update()
          expect(root.firstChild).toBe(el)
          if (tag === 'select') (el as HTMLSelectElement).selectedIndex = 1
          else if (type === 'text') el.value = 'picked'
          else (el as HTMLInputElement).checked = true
          el.dispatchEvent(new Event(type === 'text' ? 'input' : 'change'))
          expect(model.value).toEqual(type === 'checkbox' ? true : 'picked')
          expect(seen).toEqual([
            [version, expectedOwner],
            ['watch', expectedOwner],
          ])
          expect(ambient).toBe('caller')
          model.value = initial
          await nextTick()
          seen.length = 0
        }
        app.unmount()
      }
    }
  },
)

it.each([
  ['checkbox array', vModelCheckbox, 'input', 'checkbox', [], ['picked']],
  [
    'checkbox Set',
    vModelCheckbox,
    'input',
    'checkbox',
    new Set(),
    new Set(['picked']),
  ],
  ['radio', vModelRadio, 'input', 'radio', '', 'picked'],
  ['select', vModelSelect, 'select', undefined, '', 'picked'],
  ['select array', vModelSelect, 'select', undefined, [], ['picked']],
  [
    'select Set',
    vModelSelect,
    'select',
    undefined,
    new Set(),
    new Set(['picked']),
  ],
  ['dynamic checkbox', vModelDynamic, 'input', 'checkbox', [], ['picked']],
  ['dynamic radio', vModelDynamic, 'input', 'radio', '', 'picked'],
  ['dynamic select', vModelDynamic, 'select', undefined, '', 'picked'],
] as const)(
  '%s mounted/hydrated model handlers and updated assigners enter the owner',
  async (_, directive, tag, type, initial, expected) => {
    for (const hydrate of [false, true]) {
      const owner = { id: 'owner' }
      ambient = owner
      const model = ref<any>(initial)
      const seen: any[] = []
      let version = 0
      const app = (hydrate ? createSSRApp : createApp)({
        setup() {
          watch(model, () => seen.push(['watch', ambient]), { flush: 'sync' })
          return () => {
            const assignedVersion = version
            return withDirectives(
              h(
                tag,
                {
                  type,
                  value: tag === 'input' ? 'picked' : undefined,
                  multiple: tag === 'select' && typeof initial === 'object',
                  'onUpdate:modelValue': (value: any) => {
                    seen.push([assignedVersion, ambient])
                    model.value = value
                  },
                },
                tag === 'select'
                  ? [
                      h('option', { value: '' }),
                      h('option', { value: 'picked' }, 'picked'),
                    ]
                  : undefined,
              ),
              [[directive, model.value]],
            )
          }
        },
      })
      const root = document.createElement('div')
      if (hydrate) {
        root.innerHTML =
          tag === 'select'
            ? `<select${typeof initial === 'object' ? ' multiple' : ''}><option value=""></option><option value="picked">picked</option></select>`
            : `<input type="${type}" value="picked">`
      }
      const vm = app.mount(root)
      await nextTick()
      ambient = 'caller'
      version++
      vm.$.update()
      const el = root.firstChild as HTMLInputElement | HTMLSelectElement
      if (tag === 'select') {
        ;(el as HTMLSelectElement).options[0].selected = false
        ;(el as HTMLSelectElement).options[1].selected = true
      } else (el as HTMLInputElement).checked = true
      el.dispatchEvent(new Event('change'))
      expect(model.value).toEqual(expected)
      expect(seen).toEqual([
        [1, owner],
        ['watch', owner],
      ])
      expect(ambient).toBe('caller')
      await nextTick()
      expect((el as any)._pendingValue).toBeUndefined()
      expect(ambient).toBe('caller')
      app.unmount()
    }
  },
)

it.each([vModelText, vModelDynamic])(
  'text composition and lazy handlers preserve owner and updated assigners',
  async directive => {
    const owner = { id: 'owner' }
    ambient = owner
    const model = ref('')
    const seen: any[] = []
    let version = 0
    const app = createApp({
      setup() {
        watch(model, () => seen.push(['watch', ambient]), { flush: 'sync' })
        return () => {
          const assignedVersion = version
          return h(
            'div',
            [false, true].map(lazy =>
              withDirectives(
                h('input', {
                  'onUpdate:modelValue': (value: string) => {
                    seen.push([assignedVersion, ambient])
                    model.value = value
                  },
                }),
                [[directive, model.value, undefined, { lazy, trim: true }]],
              ),
            ),
          )
        }
      },
    })
    const root = document.createElement('div')
    const vm = app.mount(root)
    ambient = 'caller'
    version++
    vm.$.update()
    const [text, lazy] = root.querySelectorAll('input')
    text.dispatchEvent(new Event('compositionstart'))
    text.value = ' composing '
    text.dispatchEvent(new Event('input'))
    expect(model.value).toBe('')
    text.dispatchEvent(new Event('compositionend'))
    expect(model.value).toBe('composing')
    await nextTick()
    lazy.value = ' lazy '
    lazy.dispatchEvent(new Event('input'))
    expect(model.value).toBe('composing')
    lazy.dispatchEvent(new Event('change'))
    expect(model.value).toBe('lazy')
    expect(lazy.value).toBe('lazy')
    expect(seen).toEqual([
      [1, owner],
      ['watch', owner],
      [1, owner],
      ['watch', owner],
    ])
    expect(ambient).toBe('caller')
    app.unmount()
  },
)

it('native model errors restore context without changing event identity', () => {
  const owner = { id: 'owner' }
  ambient = owner
  const error = new Error('model')
  const seen: any[] = []
  const app = createApp({
    render: () =>
      withDirectives(
        h('input', {
          'onUpdate:modelValue': () => {
            seen.push(ambient)
            throw error
          },
          onInput: (event: Event) => seen.push(event),
        }),
        [[vModelText, '']],
      ),
  })
  const root = document.createElement('div')
  app.mount(root)
  const onError = (event: ErrorEvent) => {
    expect(event.error).toBe(error)
    event.preventDefault()
  }
  window.addEventListener('error', onError)
  ambient = 'caller'
  const event = new Event('input')
  try {
    root.firstChild!.dispatchEvent(event)
    expect(seen).toEqual([owner, event])
    expect(ambient).toBe('caller')
  } finally {
    window.removeEventListener('error', onError)
    app.unmount()
  }
})

it('select scheduled cleanup re-enters the dispatch owner and restores its caller', async () => {
  const owner = { id: 'owner' }
  ambient = owner
  const app = createApp({
    render: () =>
      withDirectives(
        h(
          'select',
          {
            'onUpdate:modelValue': () => {},
          },
          [h('option', { value: 'picked' }, 'picked')],
        ),
        [[vModelSelect, 'picked']],
      ),
  })
  const root = document.createElement('div')
  app.mount(root)
  const select = root.firstChild as HTMLSelectElement
  const seen: any[] = []
  let pending: any
  Object.defineProperty(select, '_pendingValue', {
    get: () => pending,
    set(value) {
      seen.push(ambient)
      pending = value
    },
  })
  ambient = 'caller'
  select.dispatchEvent(new Event('change'))
  expect(ambient).toBe('caller')
  ambient = 'later caller'
  await nextTick()
  expect(seen).toEqual([owner, owner])
  expect(ambient).toBe('later caller')
  app.unmount()
})

it('deferred text hydration assigns pre-hydration user edits in the DOM owner', async () => {
  const owner = {
    id: 'owner',
    createWithValue() {
      return this
    },
  }
  ambient = owner
  const model = ref('server')
  const seen: any[] = []
  let hydrate!: () => void
  const Comp = defineAsyncComponent({
    loader: () =>
      Promise.resolve({
        setup() {
          watch(model, () => seen.push(['watch', ambient]), { flush: 'sync' })
          return () =>
            withDirectives(
              h('input', {
                'onUpdate:modelValue': (value: string) => {
                  seen.push(['assign', ambient])
                  model.value = value
                },
              }),
              [[vModelText, model.value]],
            )
        },
      }),
    hydrate: run => {
      hydrate = run
    },
  })
  const root = document.createElement('div')
  root.innerHTML = '<input value="server">'
  const input = root.firstChild as HTMLInputElement
  input.value = 'edited'
  const app = createSSRApp({ render: () => h(Comp) })
  app.mount(root)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  ambient = 'caller'
  hydrate()
  await nextTick()
  expect(model.value).toBe('edited')
  expect(seen).toEqual([
    ['assign', owner],
    ['watch', owner],
  ])
  expect(ambient).toBe('caller')
  input.value = 'event'
  input.dispatchEvent(new Event('input'))
  expect(model.value).toBe('event')
  expect(seen.slice(2)).toEqual([
    ['assign', owner],
    ['watch', owner],
  ])
  expect(ambient).toBe('caller')
  app.unmount()
})
