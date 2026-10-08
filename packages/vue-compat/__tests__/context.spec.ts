import Vue from '@vue/compat'
import { contextManager, h, setContextManager } from '@vue/runtime-core'
import { toggleDeprecationWarning } from '../../runtime-core/src/compat/compatConfig'
import { createApp } from '../src/esm-index'

let ambient: any
const original = contextManager
it.each([false, true])(
  'compat functional components with global mixins (configured manager: %s)',
  configured => {
    Vue.configureCompat({ MODE: 3 })
    const names: string[] = []
    const owner = {
      createWithValue(key: string, name: string) {
        expect(key).toBe('VueComponent')
        names.push(name)
        return this
      },
    }
    if (configured) {
      ambient = owner
      setContextManager({
        getContext: () => ambient,
        setContext: value => {
          ambient = value
        },
      })
    }
    function Functional() {
      return h('div', 'functional')
    }
    const app = createApp({ render: () => h(Functional) })
    app.mixin({ created() {} })
    const container = document.createElement('div')
    app.mount(container)
    expect(container.innerHTML).toBe('<div>functional</div>')
    expect(names).toEqual(configured ? ['Functional'] : [])
    if (configured) expect(ambient).toBe(owner)
    app.unmount()
  },
)

beforeEach(() => {
  toggleDeprecationWarning(false)
  Vue.configureCompat({ MODE: 2 })
})
afterEach(() => {
  setContextManager(original)
  Vue.configureCompat({ MODE: 3 })
})

it('compat whole manager replacement shares native backing and constructor capture, direct events and hook events', async () => {
  const manager = {
    getContext: () => ambient,
    setContext: (value: any) => {
      ambient = value
    },
  }
  ;(Vue as any).contextManager = manager
  expect(contextManager).toBe(manager)
  const owner = { id: 'owner' }
  ambient = owner
  const vm = new Vue({ propsData: { ctx: owner }, render: () => h('div') })
  const seen: any[] = []
  vm.$on('hook:mounted', () => seen.push(ambient))
  vm.$on('test', () => seen.push(ambient))
  vm.$once('test', () => seen.push(ambient))
  ambient = 'caller'
  vm.$mount()
  vm.$emit('test')
  vm.$emit('test')
  expect(seen).toEqual([owner, 'caller', 'caller', 'caller'])
  expect((vm as any)._capturedContext).toBe(owner)
  ambient = undefined
  expect(
    await vm.$nextTick(function () {
      expect(this).toBe(vm)
      return ambient
    }),
  ).toBe(owner)
  ambient = 'tick'
  expect(await vm.$nextTick(() => ambient)).toBe('tick')
  expect(ambient).toBe('tick')
  vm.$destroy()
})

it('compat legacy model callbacks deliberately run under undefined context', () => {
  setContextManager({
    getContext: () => ambient,
    setContext: value => {
      ambient = value
    },
  })
  const seen: any[] = []
  const Child = { render: () => h('div') }
  const vm = new Vue({
    render: () =>
      h(Child, {
        modelValue: 1,
        'onUpdate:modelValue': () => seen.push(ambient),
      }),
  })
  vm.$mount()
  ambient = 'caller'
  vm.$.subTree.component!.emit('input', 2)
  expect(seen).toEqual([undefined])
  expect(ambient).toBe('caller')
  vm.$destroy()
})
