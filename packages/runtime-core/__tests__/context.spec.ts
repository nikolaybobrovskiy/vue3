import { afterEach, describe, expect, it } from 'vitest'
import * as core from '../src'
import {
  KeepAlive,
  Suspense,
  h,
  nodeOps,
  onActivated,
  onDeactivated,
  onMounted,
  onUpdated,
  ref,
  render,
  watch,
  withCtx,
} from '@vue/runtime-test'
import { queueJob, queuePostFlushCb } from '../src/scheduler'
import { injectHook } from '../src/apiLifecycle'
import { LifecycleHooks } from '../src/enums'
import { createComponentInstance } from '../src/component'

let ambient: any
const original = core.contextManager
const context = {
  createWithValue: (key: string, name: string) => ({ key, name }),
}
afterEach(() => {
  core.setContextManager(original)
  ambient = undefined
})

function install() {
  expect(core.setContextManager).toBeTypeOf('function')
  core.setContextManager({
    getContext: () => ambient,
    setContext: (value: any) => {
      ambient = value
    },
  })
}

describe('ambient context', () => {
  it('does not read ambient context for a callbackless nextTick', async () => {
    const getContext = vi.fn()
    core.setContextManager({ getContext, setContext() {} })
    await core.nextTick()
    expect(getContext).not.toHaveBeenCalled()
  })

  it('does not universally fall back to a parent capture outside render/patch', () => {
    install()
    ambient = 'parent'
    const parent = createComponentInstance(h({}), null, null)
    ambient = undefined
    const child = createComponentInstance(h({}), parent, null)
    expect(child._capturedContext).toBeUndefined()
    expect(parent._capturedContext).toBe('parent')
  })
  it.each([undefined, null, false, 0, ''])(
    'falsy raw ctx %s uses ambient, ignoring inferred names',
    value => {
      install()
      ambient = context
      const vnode = h(
        { __name: 'Inferred', render: () => h('div') },
        { ctx: value },
      )
      render(vnode, nodeOps.createElement('div'))
      expect(vnode.component!._capturedContext).toBe(context)
    },
  )

  it('keeps ordinary pre/post watchers on flush context and slots on executing ambient', async () => {
    install()
    ambient = 'owner'
    const seen: any[] = []
    const n = ref(0)
    let slot: any
    render(
      h({
        setup() {
          slot = withCtx(() => ambient)
          watch(n, () => seen.push(['pre', ambient]))
          watch(n, () => seen.push(['post', ambient]), { flush: 'post' })
          return () => h('div')
        },
      }),
      nodeOps.createElement('div'),
    )
    ambient = 'trigger'
    expect(slot()).toBe('trigger')
    n.value++
    ambient = 'outside'
    await core.nextTick()
    expect(seen).toEqual([
      ['pre', 'trigger'],
      ['post', 'trigger'],
    ])
    expect(ambient).toBe('outside')
  })

  it('restores ambient when initialization, render, lifecycle and error reporting throw', () => {
    install()
    for (const phase of ['setup', 'render']) {
      ambient = 'outside'

      const vnode = h(
        {
          [phase]() {
            expect(ambient).toBe('owner')
            throw new Error(phase)
          },
          ...(phase === 'render' ? {} : { render: () => h('div') }),
        },
        { ctx: 'owner' },
      )
      expect(() => render(vnode, nodeOps.createElement('div'))).toThrow(phase)
      expect(ambient).toBe('outside')
      expect('Unhandled error during execution').toHaveBeenWarned()
    }
    const vnode = h({ render: () => h('div') }, { ctx: 'owner' })
    render(vnode, nodeOps.createElement('div'))
    const hook = injectHook(
      LifecycleHooks.MOUNTED,
      () => {
        expect(ambient).toBe('owner')
        throw new Error('hook')
      },
      vnode.component,
    )!
    expect(hook).toThrow('hook')
    expect(ambient).toBe('outside')
    expect('Unhandled error during execution').toHaveBeenWarned()
  })

  it('scopes async setup completion Options and resumed client rendering', async () => {
    install()
    ambient = 'owner'
    const seen: any[] = []
    let resolve!: (value: any) => void
    const Comp = {
      setup() {
        seen.push(ambient)
        return new Promise(r => {
          resolve = r
        })
      },
      created() {
        seen.push(ambient)
      },
      render() {
        seen.push(ambient)
        return h('div')
      },
    }
    render(
      h(Suspense, null, { default: () => h(Comp) }),
      nodeOps.createElement('div'),
    )
    ambient = 'outside'
    resolve({})
    await Promise.resolve()
    await core.nextTick()
    expect(seen).toEqual(['owner', 'owner', 'owner'])
    expect(ambient).toBe('outside')
  })

  it('KeepAlive hooks execute under owning capture rather than trigger context', async () => {
    install()
    const owner = {
      createWithValue() {
        return this
      },
    }
    ambient = owner
    const visible = ref(true)
    const seen: any[] = []
    const Comp = {
      setup() {
        onActivated(() => seen.push(ambient))
        onDeactivated(() => seen.push(ambient))
        return () => h('div')
      },
    }
    render(
      h({
        render: () =>
          h(KeepAlive, null, {
            default: () => (visible.value ? h(Comp) : null),
          }),
      }),
      nodeOps.createElement('div'),
    )
    ambient = 'caller'
    visible.value = false
    await core.nextTick()
    visible.value = true
    await core.nextTick()
    expect(seen).toEqual([owner, owner, owner])
    expect(ambient).toBe('caller')
  })
  it('scopes render, patch-created children and lifecycle but not slots or sync watchers', async () => {
    install()
    const owner = { id: 'owner' }
    ambient = owner
    const n = ref(0)
    const seen: any[] = []
    let child: any
    const Child = {
      props: ['n'],
      setup() {
        child = core.getCurrentInstance()
        seen.push(ambient)
      },
      render() {
        seen.push(ambient)
        return h('div')
      },
    }
    const root = nodeOps.createElement('div')
    render(
      h({
        setup() {
          onMounted(() => seen.push(ambient))
          onUpdated(() => seen.push(ambient))
          watch(n, () => seen.push(['sync', ambient]), { flush: 'sync' })
          return () => {
            seen.push(ambient)
            return h(Child, { n: n.value })
          }
        },
      }),
      root,
    )
    expect(child._capturedContext).toBe(owner)
    expect(seen).toEqual([owner, owner, owner, owner])
    seen.length = 0
    ambient = 'caller'
    n.value++
    await core.nextTick()
    expect(seen).toEqual([['sync', 'caller'], owner, owner, owner])
    expect(ambient).toBe('caller')
  })

  it('captures first scheduler caller across recursive post drain and separate nextTick callbacks', async () => {
    install()
    const seen: any[] = []
    ambient = 'first'
    queueJob(() => {
      seen.push(ambient)
      queuePostFlushCb(() => {
        seen.push(ambient)
        queueJob(() => seen.push(ambient))
      })
    })
    const a = core.nextTick(
      function (this: string) {
        seen.push([ambient, this])
        return 42
      }.bind('bound'),
    )
    ambient = 'second'
    queueJob(() => seen.push(ambient))
    const b = core.nextTick(() => {
      seen.push(ambient)
      throw new Error('tick')
    })
    ambient = 'outside'
    expect(await a).toBe(42)
    await expect(b).rejects.toThrow('tick')
    expect(seen).toEqual([
      'first',
      'first',
      'first',
      'first',
      ['first', 'bound'],
      'second',
    ])
    expect(ambient).toBe('outside')
  })

  it('uses undefined for vnode event handlers, including once, and restores on errors', () => {
    install()
    ambient = 'owner'
    const seen: any[] = []
    const vnode = h(
      { render: () => h('div') },
      {
        onTest: () => seen.push(ambient),
        onTestOnce: () => seen.push(ambient),
      },
    )
    render(vnode, nodeOps.createElement('div'))
    ambient = 'caller'
    vnode.component!.emit('test')
    vnode.component!.emit('test')
    expect(seen).toEqual([undefined, undefined, undefined])
    expect(ambient).toBe('caller')
  })
  it('captures raw ctx once and runs all initialization under explicit merged name', () => {
    install()
    const captured = { key: 'VueComponent', name: 'Named' }
    const explicit = { createWithValue: vi.fn(() => captured) }
    const seen: any[] = []
    const record = () => {
      seen.push(ambient)
    }
    const Comp = {
      extends: { name: 'Named' },
      props: { value: { default: record } },
      setup: record,
      beforeCreate: record,
      data() {
        record()
        return { count: 0 }
      },
      provide() {
        record()
        return {}
      },
      watch: { count: { immediate: true, handler: record } },
      created: record,
      render() {
        return h('div')
      },
    }
    ambient = 'outside'
    const vnode = h(Comp, { ctx: explicit })
    const root = nodeOps.createElement('div')
    render(vnode, root)
    expect(explicit.createWithValue).toHaveBeenCalledExactlyOnceWith(
      'VueComponent',
      'Named',
    )
    expect(seen).toHaveLength(7)
    expect(seen).toEqual(Array(7).fill(captured))
    expect(seen.every(value => value === captured)).toBe(true)
    expect((vnode.component as any)._capturedContext).toEqual(captured)
    expect((vnode.component!.proxy as any)._capturedContext).toEqual(captured)
    expect(ambient).toBe('outside')
    render(h(Comp, { ctx: 'changed' }), root)
    expect((vnode.component as any)._capturedContext).toEqual(captured)
  })
})
