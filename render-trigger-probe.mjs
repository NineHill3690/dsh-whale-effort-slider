/* Off-screen probe: render ONLY the plugin trigger subtree, in both the host's
 * wide mode and its icon-only compact mode, into one HTML page so the two can be
 * compared at real size and screenshotted.
 *
 * Reuses the same fake runtime render.mjs uses (vm sandbox + minimal React). */
import fs from 'node:fs'
import vm from 'node:vm'

const src = fs.readFileSync('client.js', 'utf8')
let mod = null
const sandbox = {
  window: {
    __ModuleLoader__: { load(m) { mod = m } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  },
  document: {
    documentElement: { dataset: {}, getAttribute: () => null, style: {} },
    body: { dataset: {}, hasAttribute: () => false },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  console, setTimeout, clearTimeout, queueMicrotask,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(src, sandbox)

let override = []
let qi = 0
function resetHooks(ov) { override = ov || []; qi = 0 }
const hooks = {
  useState(init) { const v = qi < override.length ? override[qi] : (typeof init === 'function' ? init() : init); qi += 1; return [v, () => {}] },
  useEffect() {}, useLayoutEffect() {},
  useRef() { return { current: null } },
  useSyncExternalStore(sub, get) { return get() },
  useMemo(f) { return f() },
  useCallback(f) { return f },
}
const React = { createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }), ...hooks }
const fakeRequire = id => (id === 'react' ? React : (() => { throw new Error('require ' + id) })())

const api = mod.factory(fakeRequire)
let Comp = null
api.apply({
  effect(fn) { fn(); return () => {} },
  locale: { register() { return () => {} } },
  slots: { inject(_n, fn) { fn(); return () => {} }, register(_cfg, comp) { Comp = comp; return comp } },
  modelDirectories: {}, sessions: {}, remote: {},
})

const snapshot = {
  pending: null,
  current: { provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: 'high' },
  groups: [{ id: 'deepseek', label: 'DeepSeek', models: [{ id: 'deepseek-v4', name: 'DeepSeek V4', reasoning: { defaultEffort: 'high', efforts: [{ id: 'off' }, { id: 'low' }, { id: 'high' }, { id: 'max' }] } }] }],
}
const directory = { subscribe: () => () => {}, getSnapshot: () => snapshot }

/* first hook = `open`; false keeps the popover out of the way so the shot only
 * contains the collapsed seats. */
resetHooks([false, true, 'effort', null, false, null, false, null, '', false, ''])
const tree = Comp({ directory, load() {}, select() {}, available: true, locked: false, t: k => k, sessionId: 's1', setTeam() {}, useProjection: () => null })

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function css(obj) {
  return Object.entries(obj || {}).map(([k, v]) => {
    if (v === null || v === undefined || v === '') return ''
    const name = k.startsWith('--') ? k : k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
    return `${name}:${v}`
  }).filter(Boolean).join(';')
}
function render(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (Array.isArray(node)) return node.map(render).join('')
  if (typeof node === 'string' || typeof node === 'number') return esc(node)
  if (typeof node.type === 'function') return render(node.type(node.props))
  const p = node.props || {}
  let attrs = ''
  if (p.className) attrs += ` class="${esc(p.className)}"`
  if (p.style && typeof p.style === 'object') attrs += ` style="${esc(css(p.style))}"`
  for (const [k, v] of Object.entries(p)) {
    if (['className', 'style', 'children', 'key', 'ref'].includes(k) || k.startsWith('on')) continue
    if (v === null || v === undefined || typeof v === 'function' || typeof v === 'object') continue
    attrs += ` ${k}="${esc(v)}"`
  }
  const tag = node.type
  const inner = render(node.kids)
  if (tag === 'style') return `<style>${(node.kids || []).join('')}</style>`
  if (['br', 'img', 'input', 'path', 'circle', 'rect'].includes(tag)) return `<${tag}${attrs} />`
  return `<${tag}${attrs}>${inner}</${tag}>`
}

const html = render(tree)
const triggerMatch = html.match(/<button class="[^"]*-trigger[^"]*"[\s\S]*?<\/button>/)
if (!triggerMatch) { console.error('trigger not found'); process.exit(1) }
const styleMatch = html.match(/<style>[\s\S]*?<\/style>/)
const trigger = triggerMatch[0]
const style = styleMatch ? styleMatch[0] : ''

const out = `<!doctype html><meta charset="utf-8">
<body style="margin:0;padding:18px 22px;background:#0b1220;font-family:'Segoe UI',sans-serif;color:#c9d3e3">
  <p style="font:11px/15px monospace;color:#7f90a8;margin:0 0 8px">wide (text)</p>
  <div class="seat">${trigger}</div>
  <p style="font:11px/15px monospace;color:#7f90a8;margin:18px 0 8px">compact (host icon-only mode)</p>
  <div class="seat" style="--dsh-composer-model-text-display:none;--dsh-composer-model-icon-display:block">${trigger}</div>
  <p style="font:11px/15px monospace;color:#7f90a8;margin:18px 0 8px">reference: DSH trigger (16 icon + 14 chevron, stroke 1)</p>
  <div class="seat dsh">
    <button class="dsh-trigger" aria-label="DeepSeek V4 high">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" data-icon="dsw-icon-data-outline-regular"><use href="#dsw-icon-data-outline-regular"/></svg>
      <svg class="dsh-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke-width="1"><path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" stroke="currentColor"/></svg>
    </button>
  </div>
  ${style}
  <style>
    .seat{display:inline-flex;align-items:center;padding:2px 6px;border-radius:10px;background:#16223a;margin-right:10px}
    .dsh-trigger{display:flex;align-items:center;gap:4px;height:28px;padding:0 4px 0 8px;border:0;background:transparent;color:#8b98ab;border-radius:6px;font:13px/20px 'Segoe UI',sans-serif}
    .dsh-chev{flex:none;color:#7c8290}
  </style>
</body>`

fs.writeFileSync('render-trigger-compare.html', out)
console.log('wrote render-trigger-compare.html', out.length)
console.log('trigger:', trigger.slice(0, 400))
