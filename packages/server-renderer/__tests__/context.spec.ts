import { contextManager, createSSRApp, h, setContextManager } from 'vue'
import { renderToString } from '../src'
import { ssrRenderComponent } from '../src/helpers/ssrRenderComponent'

let ambient: any
const original = contextManager
afterEach(() => setContextManager(original))

it.each([false, true])(
  'SSR scopes async setup completion and nested ordinary/optimized traversal: optimized=%s',
  async optimized => {
    setContextManager({
      getContext: () => ambient,
      setContext: value => {
        ambient = value
      },
    })
    const seen: any[] = []
    const owner = { id: 'owner' }
    const Child = {
      setup() {
        seen.push(ambient)
      },
      render() {
        seen.push(ambient)
        return h('div', 'child')
      },
    }
    const Comp = {
      async setup() {
        seen.push(ambient)
        await Promise.resolve()
        return {}
      },
      created() {
        seen.push(ambient)
      },
      ...(optimized
        ? {
            ssrRender(_ctx: any, push: any, parent: any) {
              seen.push(ambient)
              push(ssrRenderComponent(Child, null, null, parent))
            },
          }
        : {
            render() {
              seen.push(ambient)
              return h(Child)
            },
          }),
    }
    ambient = 'outside'
    expect(await renderToString(createSSRApp(Comp, { ctx: owner }))).toContain(
      '<div',
    )
    expect(seen).toEqual(Array(5).fill(owner))
    expect(ambient).toBe('outside')
  },
)
