import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('client.js', 'utf8');
const LEVEL = process.argv[2] || 'high';
const DARK = process.env.DARK === '1';
let mod = null;
const sandbox = {
  window: {
    __ModuleLoader__: { load(m) { mod = m; } },
    innerWidth: 1440,
    innerHeight: 900,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  },
  document: {
    documentElement: { dataset: {}, getAttribute: () => null, style: {} },
    body: { dataset: {}, hasAttribute: n => DARK && n === 'data-ds-dark-theme' },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  console, setTimeout, clearTimeout, queueMicrotask,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

/* ---- minimal hook runtime: one pass, no re-render ---- */
let override = [];
let qi = 0;
function resetHooks(ov) { override = ov || []; qi = 0; }
const hooks = {
  useState(init) { const v = qi < override.length ? override[qi] : (typeof init === 'function' ? init() : init); qi += 1; return [v, () => {}]; },
  useEffect() {}, useLayoutEffect() {},
  useRef() { return { current: null }; },
  useSyncExternalStore(sub, get) { return get(); },
  useMemo(f) { return f(); },
  useCallback(f) { return f; },
};
const React = {
  createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }),
  ...hooks,
};
const fakeRequire = id => (id === 'react' ? React : (() => { throw new Error('require ' + id); })());

const api = mod.factory(fakeRequire);
let Comp = null;
api.apply({
  effect(fn) { fn(); return () => {}; },
  locale: { register() { return () => {}; } },
  slots: { inject(_n, fn) { fn(); return () => {}; }, register(_cfg, comp) { Comp = comp; return comp; } },
  modelDirectories: {}, sessions: {}, remote: {},
});

/* fixture：四个 provider，档位数故意不一致，用来同时看到「N 档 / 不支持推理档位」两种行 */
const model = (id, name, efforts) => ({
  id, name,
  reasoning: efforts ? { defaultEffort: efforts[1] || efforts[0], efforts: efforts.map(e => ({ id: e })) } : null,
});
const snapshot = {
  pending: null,
  current: { provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: LEVEL },
  groups: [
    {
      id: 'deepseek', name: 'DeepSeek',
      models: [
        model('deepseek-v4', 'DeepSeek V4', ['off', 'low', 'high', 'max']),
        model('deepseek-v4-pro', 'DeepSeek V4 Pro', ['off', 'low', 'medium', 'high', 'max']),
        model('deepseek-r3', 'DeepSeek R3', ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
      ],
    },
    {
      id: 'openai', name: 'OpenAI',
      models: [
        model('gpt-5.2', 'GPT-5.2', ['off', 'low', 'medium', 'high']),
        model('gpt-5.2-mini', 'GPT-5.2 mini', ['off', 'low', 'high']),
      ],
    },
    {
      id: 'anthropic', name: 'Anthropic',
      models: [
        model('claude-opus-4.6', 'Claude Opus 4.6', ['off', 'low', 'medium', 'high', 'max']),
        model('claude-haiku-4.6', 'Claude Haiku 4.6', null),
      ],
    },
    {
      id: 'google', name: 'Google',
      models: [model('gemini-3-pro', 'Gemini 3 Pro', ['off', 'low', 'high'])],
    },
  ],
};
const directory = { subscribe: () => () => {}, getSnapshot: () => snapshot };

/* render: open + present forced true so the popover (and its rail) mounts.
   MESSAGE=1 also latches the header line on, which is the only way to see it:
   it normally lives for 1800ms after the teamwork toggle is switched on. The
   state holds the locale KEY (not a boolean), so the value is 'warning'.

   OVR='{"1":"models","14":2,"15":"deepseek"}' overrides any single useState slot
   by index (see BASE below) so one harness can render every panel state. */
const MESSAGE = process.env.MESSAGE === '1' ? 'warning' : null;

/* useState order in Selector — index → name:
   0 open, 1 pane, 2 teamWant, 3 teamSaving, 4 preview, 5 dragging, 6 message,
   7 error, 8 busy, 9 query, 10 highlight, 11 tipOn, 12 spout, 13 spoutOn,
   14 view, 15 subProvider, 16 avail */
const BASE = [true, 'effort', null, false, null, false, MESSAGE, '', false, '', 0, false, 0, false, 1, null, 0];
const states = BASE.slice();
const OVR = process.env.OVR ? JSON.parse(process.env.OVR) : null;
if (OVR) for (const k of Object.keys(OVR)) states[Number(k)] = OVR[k];
resetHooks(states);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function css(obj) {
  return Object.entries(obj || {}).map(([k, v]) => {
    if (v === null || v === undefined || v === '') return '';
    const name = k.startsWith('--') ? k : k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    return `${name}:${v}`;
  }).filter(Boolean).join(';');
}
function render(node) {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (Array.isArray(node)) return node.map(render).join('');
  if (typeof node === 'string' || typeof node === 'number') return esc(node);
  if (typeof node.type === 'function') {
    if (node.type === React.Fragment) return render(node.kids);
    return render(node.type(node.props));
  }
  const p = node.props || {};
  let attrs = '';
  if (p.className) attrs += ` class="${esc(p.className)}"`;
  if (p.style && typeof p.style === 'object') attrs += ` style="${esc(css(p.style))}"`;
  for (const [k, v] of Object.entries(p)) {
    if (k === 'className' || k === 'style' || k === 'children') continue;
    if (k === 'key' || k === 'ref' || k.startsWith('on')) continue;
    if (v === null || v === undefined || typeof v === 'function' || typeof v === 'object') continue;
    attrs += ` ${k}="${esc(v)}"`;
  }
  const tag = node.type;
  const inner = render(node.kids);
  if (tag === 'style') return `<style>${(node.kids || []).join('')}</style>`;
  if (['br', 'img', 'input', 'path', 'circle', 'rect'].includes(tag)) return `<${tag}${attrs} />`;
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

let tree;
try {
  /* the locale dict lives inside client.js; mirror the keys the harness can
     actually reach so the shots never show a raw key like "warning" */
  const ZH = {
    choose: '选择模型', effort: '推理强度', tokenCost: '3x~4x token',
    teamHint: '启用智能体团队协作', teamLabel: '智能体团队协作',
    teamFailed: '团队协作开关失败', reset: '重置为默认',
    warning: '更快消耗推理 token', model: '切换模型', back: '返回',
    loading: '正在加载模型', empty: '没有可用模型',
    unsupported: '此模型未提供推理强度', retry: '重试',
    busy: '正在切换', failed: '切换失败',
    unavailable: '此会话不能切换模型',
    search: '搜索模型', noMatch: '没有匹配的模型', clear: '清除搜索',
    levels: '档', noLevels: '不支持推理档位', loadFailed: '加载失败',
  };
  tree = Comp({ directory, load() {}, select() {}, available: true, locked: false, t: k => ZH[k] ?? k, sessionId: 's1', setTeam() {}, useProjection: () => null });
} catch (e) {
  console.error('RENDER FAILED:', e.message);
  console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
const html = render(tree);
const only = process.argv[3] === 'rail';
let out = html;
if (only) {
  const m = html.match(/<div class="[^"]*-rail[^"]*"[\s\S]*?<\/div><\/div><\/div>/);
  out = m ? m[0] : html;
}
fs.writeFileSync(process.argv[4] || 'preview-render.html', `<!doctype html><meta charset="utf-8"><body${DARK ? ' data-ds-dark-theme=""' : ''} style="margin:0;padding:24px;background:${DARK ? '#101418' : '#f2f3f5'};font-family:-apple-system,'Segoe UI',sans-serif;width:420px">${out}</body>`);
console.log('bytes', html.length);
console.log('has water:', html.includes('water'), '| flow:', (html.match(/-flow"/g) || []).length, '| bubble:', (html.match(/-bubble/g) || []).length);
console.log('has fillBg gradient:', /linear-gradient\(90deg, rgb\(134,194,234\)/.test(html));
