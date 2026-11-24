/**
 * Codex model + reasoning-effort selector — client (web) bundle.
 *
 * Replaces DSH's compact `conversation.input.model` seat with a Codex-style
 * popover that holds two panes:
 *
 *   - `models` — the provider-grouped model list (Codex list styling)
 *   - `effort` — the pixel-replica reasoning-effort slider
 *
 * Every geometry value in `CSS` was measured frame-by-frame from the original
 * Codex desktop recording (93 frames); see `docs/codex-reasoning-slider-spec.md`.
 * The recording was captured at 1.385x, so CSS px = recorded px / 1.385.
 *
 * Written by hand against the documented host API:
 *   ctx.slots            — `conversation.input.model` seat
 *   ctx.modelDirectories — session-scoped catalog + `select()`
 *   ctx.sessions         — subagent address check
 *   ctx.locale           — dictionaries
 *
 * No host hooks are registered and no events are emitted, so the plugin stays
 * fail-open: if any anchor is missing it renders nothing instead of breaking the
 * composer.
 */

window.__ModuleLoader__.load({
  id: 'dsh-whale-effort-slider',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore, useMemo, useCallback } = React;

    const NS = 'dsh-whale-effort-slider';
    const P = 'cmes';   // class prefix

    /* ------------------------------------------------------------------ *
     * Copy
     * ------------------------------------------------------------------ */
    /* Both dictionaries must carry an identical key set.
     *
     * Effort labels are deliberately NOT in here any more: the ladder shows
     * DSH's own wording (`off` / `low` / `high` / `max` -> Off / Low / High /
     * Max) taken from the catalog's `effort.name`, so those words must not
     * travel with the UI language. */
    const zh = {
      choose: '选择模型', effort: '推理强度', tokenCost: '3x~4x token',
      teamHint: '启用智能体团队协作', teamLabel: '智能体团队协作',
      teamFailed: '团队协作开关失败', reset: '重置为默认',
      warning: '更快消耗推理 token', model: '切换模型', back: '返回',
      loading: '正在加载模型', empty: '没有可用模型',
      unsupported: '此模型未提供推理强度', retry: '重试',
      busy: '正在切换', failed: '切换失败',
      unavailable: '此会话不能切换模型',
      search: '搜索模型', noMatch: '没有匹配的模型', clear: '清除搜索',
      levels: '档', noLevels: '不支持推理档位', loadFailed: '加载失败'
    };
    const en = {
      choose: 'Select model', effort: 'Reasoning effort', tokenCost: '3x~4x token',
      teamHint: 'Enable agent teamwork', teamLabel: 'Agent teamwork',
      teamFailed: 'Teamwork toggle failed', reset: 'Reset to default',
      warning: 'Burns reasoning tokens faster', model: 'Switch model', back: 'Back',
      loading: 'Loading models', empty: 'No available models',
      unsupported: 'This model provides no reasoning effort levels', retry: 'Retry',
      busy: 'Switching', failed: 'Selection failed',
      unavailable: 'Model selection unavailable',
      search: 'Search models', noMatch: 'No matching models', clear: 'Clear search',
      levels: 'levels', noLevels: 'No reasoning levels', loadFailed: 'failed to load'
    };

    /* ------------------------------------------------------------------ *
     * Effort ladder — ordered here, LABELLED by DSH itself.
     *
     * The catalog already ships the words this control is supposed to print:
     * every effort arrives as `{ id, name, description }`, and DSH's own names
     * are Off / Low / High / Max (see `model-info` in `dsh-llm-deepseek`).
     * So a label is `effort.name` first, and this table is only the fallback
     * for an id that shows up WITHOUT a name — same vocabulary, no invented
     * tiers (`轻度` / `极高` / `Ultra` were the old, home-made wording).
     * ------------------------------------------------------------------ */
    const EFFORT_ORDER = [
      'off', 'none', 'minimal', 'low', 'medium', 'mid',
      'high', 'xhigh', 'extra-high', 'max', 'ultra'
    ];
    /* The peak tier (DSH `max`): the one stop that turns the rail violet and
     * raises the quota warning. Keyed on the id, exactly like the original app,
     * so a 4-level model (off/low/high/max) never fakes a peak stop it does
     * not have. */
    const PEAK_IDS = ['max', 'ultra'];
    const isPeakId = id => PEAK_IDS.includes(String(id ?? '').toLowerCase().trim());

    /* ------------------------------------------------------------------ *
     * Per-effort palette.
     *
     * Every value clears three WCAG floors, verified by `test/palette.mjs`,
     * SEPARATELY PER THEME (the shipped dark card #2a2b2e and the light card
     * #f8f9fa composite differ by ~13:1 in luminance, so no single ramp can
     * serve both — see the disjoint luminance windows in docs/ARCHITECTURE.md):
     *   A. fill vs the unfilled rail                      >= 2.5
     *   B. knob vs fill                                   >= 2.2
     *   C. the level word vs card                         >= 4.5  — AA body text
     *
     * `minimal` cannot be a genuinely light blue in LIGHT mode: anything
     * lighter than ~#4a8ef8 drops below floor A against the pale rail and
     * washes out. The "low energy" feel therefore comes from saturation and
     * value, not from lightness.
     *
     * `off` is deliberately neutral slate — a closed level must not look
     * energised, and it must not be mistakable for the pale-violet peak.
     * ------------------------------------------------------------------ */
    /* The ramp is ordered by HUE, not by lightness: 216.6deg -> 263.9deg,
     * blue drifting to violet as effort rises. Luminance is deliberately NOT
     * monotonic — violet is inherently darker than blue at equal saturation,
     * so demanding a darkening ramp would force `max` to desaturate toward
     * pink and stop reading as "Ultra". `max` is instead the most luminous of
     * the violet pair, which suits a peak level.
     * All fills clear >= 2.5 against the unfilled rail. */
    const EFFORT_FILL = {
      off: '#9ecfe6', minimal: '#86c2ea', low: '#6fb2e4', medium: '#4f96d4',
      high: '#3a78c4', xhigh: '#24569b', max: '#113a6e'
    };
    /* ------------------------------------------------------------------ *
     * Dark palette — solved per level against the SHIPPED dark surfaces
     * (`@deepseek-ai/dsh-client-ui-theme`, v0.2.0-rc.2):
     *   card  = --dsw-specific-menu #43454a73 over page #151517 -> #2a2b2e
     *   card token fallback = --dsw-alias-bg-layer-2            -> #2c2c2e
     *   card upper bound    = --dsw-alias-bg-layer-3            -> #353638
     *   rail  = --dsw-alias-bg-layer-1 (an inset groove)        -> #232324
     *   knob  = --dsw-alias-label-primary (a bright puck)       -> #f9fafb
     *
     * The ramp keeps the light palette's HUE axis (216 -> 264deg, blue to
     * violet) but inverts the energy reading: on a dark card a darker fill
     * means LESS visible, so relative luminance rises 0.245 -> 0.383 as effort
     * climbs, while fills stay below the knob's luminance so the knob still
     * reads against them.
     * ------------------------------------------------------------------ */
    const EFFORT_FILL_DARK = {
      off: '#7fb6d6', minimal: '#8fc9ec', low: '#79bcdf', medium: '#5fa6d5',
      high: '#4a93cc', xhigh: '#3579be', max: '#2a63a8'
    };
    /* The level WORD wears the level's own water (v1.2.26): hue, and as much
     * saturation as survives the contrast solve, come from the rail's fill at
     * the SAME ratio the knob stands at — so Off reads pale, Low light blue,
     * High mid blue, Max deep blue, i.e. the colours sweeping past under it.
     *
     * Lightness cannot come straight from the rail: its deep end is near-black
     * against a near-white card, so the raw fill lands at 1.7:1 (Off, light) or
     * 1.2:1 (Max, dark). Only LIGHTNESS moves — hue is kept exactly, and
     * saturation never drops below 0.5 so the word stays "water" instead of
     * going grey — until it clears AA (4.5:1) on its own card:
     *
     *   theme   Off    Low    High   Max     (target contrast, AA = 4.5)
     *   dark    8.8    7.3    5.9    4.9     the word sinks as the water does
     *   light   4.7    5.4    6.7    8.6     …and darkens the same way
     *
     * Both ramps are monotonic and stay above 4.5, so the four words remain
     * distinguishable while each one matches its own tier's fill. */
    const INK_TARGET_DARK = [8.8, 7.3, 5.9, 4.9];
    const INK_TARGET_LIGHT = [4.7, 5.4, 6.7, 8.6];
    /* The cards these words sit on, measured from the shipped palettes:
     * dark = --dsw-specific-menu #43454a73 over page #151517 -> #2a2b2e;
     * light = --dsw-specific-menu over #f8f9fa -> #f8f9fa. */
    const CARD_RGB_DARK = [42, 43, 46];
    const CARD_RGB_LIGHT = [248, 249, 250];
    /* Unknown ids fall between `low` and `high` so a custom level still reads. */
    const FILL_FALLBACK = '#6fb2e4';
    const FILL_FALLBACK_DARK = '#79bcdf';

    /** Which ladder bucket an effort id belongs to (for the palette). */
    function effortBucket(id) {
      const k = String(id ?? '').toLowerCase().trim();
      if (['off', 'none', '关闭', '无'].includes(k)) return 'off';
      if (k === 'minimal') return 'minimal';
      if (k === 'low') return 'low';
      if (k === 'medium' || k === 'mid') return 'medium';
      if (k === 'high') return 'high';
      if (k === 'xhigh' || k === 'extra-high') return 'xhigh';
      if (k === 'max' || k === 'ultra') return 'max';
      return null;
    }
    /* Fallback label per BUCKET, in DSH's own vocabulary. Derived from the
     * bucket rather than from the id so there is ONE id->tier table in the
     * file: a synonym added above (`extra-high`, `关闭`, …) is labelled
     * correctly without a second edit here. */
    const EFFORT_LABEL_BY_BUCKET = {
      off: 'Off', minimal: 'Low', low: 'Low',
      medium: 'Medium', high: 'High', xhigh: 'High', max: 'Max'
    };
    function fillFor(id, dark) {
      const b = effortBucket(id);
      if (b) return (dark ? EFFORT_FILL_DARK : EFFORT_FILL)[b];
      return dark ? FILL_FALLBACK_DARK : FILL_FALLBACK;
    }
    /* ---- level ink: the word wears the water under it ------------------
     * `relLum` / `contrastOn` are the WCAG 2.1 relative-luminance pair, kept
     * local because the browser's own contrast helpers are not available in
     * the render path. */
    function relLum(c) {
      const f = v => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    }
    function contrastOn(c, card) {
      const a = relLum(c), b = relLum(card);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    function rgbToHsl(c) {
      const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const d = max - min;
      const l = (max + min) / 2;
      let h = 0, s = 0;
      if (d > 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
      }
      return [h * 360, s, l];
    }
    function hslToRgb(h, s, l) {
      const hh = ((h % 360) + 360) % 360;
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs((hh / 60) % 2 - 1));
      const m = l - c / 2;
      let r = 0, g = 0, b = 0;
      if (hh < 60) { r = c; g = x; }
      else if (hh < 120) { r = x; g = c; }
      else if (hh < 180) { g = c; b = x; }
      else if (hh < 240) { g = x; b = c; }
      else if (hh < 300) { r = x; b = c; }
      else { r = c; b = x; }
      return [r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v + m)) * 255));
    }
    /** Keep hue + saturation, move lightness just far enough to reach `target`. */
    function solveInk(base, dark, target) {
      const card = dark ? CARD_RGB_DARK : CARD_RGB_LIGHT;
      const [hue, baseSat, baseL] = rgbToHsl(base);
      /* A chroma floor: the pale end of the water is nearly neutral, and a
       * grey word would stop reading as "the blue level" at all. 0.5 keeps
       * every stop recognisably water without inventing a new hue. */
      const sat = Math.max(baseSat, 0.5);
      /* Walk outward from the rail's own lightness, so the ink stays as close
       * to the fill as the contrast floor allows. */
      for (let step = 0; step <= 400; step++) {
        for (const sign of [1, -1]) {
          const l = baseL + sign * step * 0.002;
          if (l < 0 || l > 1) continue;
          const c = hslToRgb(hue, sat, l);
          if (contrastOn(c, card) >= target) return c;
        }
      }
      return hslToRgb(hue, sat, dark ? 0.88 : 0.22);
    }
    /* Solved inks are pure functions of (quantised ratio, theme); the rail can
     * re-render on every keypress, so keep the last 128 results. */
    const inkCache = new Map();
    /** The level word's colour at `fraction` of the ladder, per theme. */
    function effortInk(fraction, dark) {
      const f = clamp01(fraction);
      const key = (dark ? 'd' : 'l') + Math.round(f * 256);
      const hit = inkCache.get(key);
      if (hit) return hit;
      const targets = dark ? INK_TARGET_DARK : INK_TARGET_LIGHT;
      const x = f * (targets.length - 1);
      const i = Math.min(targets.length - 2, Math.floor(x));
      const k = x - i;
      /* same smoothstep the water uses, so word and water crossfade together */
      const e = k * k * (3 - 2 * k);
      const target = targets[i] + (targets[i + 1] - targets[i]) * e;
      /* What the eye reads as "the slider's background at this level": the
       * filled water at the knob, faded into the unfilled track as the fill
       * runs out. Off has essentially no fill at all, so its word starts from
       * the pale track — the same grey-blue the empty rail wears — and the
       * chroma floor keeps it blue rather than neutral grey. */
      const deep = waterDeepAt(f, dark);
      const trackHex = mixHex(railBase(dark), rgbToHex(deep), TRACK_TINT);
      const base = rgbMix(hexToRgb(trackHex), deep, clamp01(f * 3));
      const ink = rgbToHex(solveInk(base, dark, target));
      if (inkCache.size > 128) inkCache.clear();
      inkCache.set(key, ink);
      return ink;
    }
    function hexToRgb(hex) {
      return [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16));
    }
    /** Mix a hex colour toward another by `t` (0..1). Used for the rail track. */
    function mixHex(a, b, t) {
      const pa = hexToRgb(a);
      const pb = hexToRgb(b);
      const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
      return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
    }
    /* self-test: a non-linear mix would silently break the track's floor A */
    if (mixHex('#000000', '#ffffff', 0.5) !== '#808080') {
      throw new Error('mixHex self-test failed: the tint is not linear');
    }

    /* ------------------------------------------------------------------ *
     * Theme — dark mode detection.
     *
     * DSH signals the active palette by toggling `data-ds-dark-theme` on
     * `<body>` (the boot script sets it before any plugin runs, and the
     * shipped palette keys every dark token off that same attribute), so the
     * attribute — NOT `prefers-color-scheme` — is the authoritative signal:
     * the user can pick "dark" while the OS is light, and the media query
     * would then disagree with the palette actually in force.
     *
     * `useSyncExternalStore` keeps the reactive contract explicit: the store
     * notifies subscribers through a MutationObserver, so flipping the theme
     * in settings re-colours the popover live, with no reload.
     * ------------------------------------------------------------------ */
    const RAIL_BASE_LIGHT = '#e8e7e8';   // measured from the original recording
    const RAIL_BASE_DARK = '#232324';    // --dsw-alias-bg-layer-1 (inset groove)
    /* 22% of the level colour tinted over the rail base — the same mix the
     * light theme always used, just over a theme-correct base. */
    const TRACK_TINT = 0.22;

    function isDarkNow() {
      try {
        return typeof document !== 'undefined'
          && document.body != null
          && document.body.hasAttribute('data-ds-dark-theme') === true;
      } catch (e) { return false; }
    }
    function subscribeTheme(notify) {
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined'
        || document.body == null) return () => {};
      const mo = new MutationObserver(notify);
      mo.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
      return () => mo.disconnect();
    }
    /** Reactive dark-mode flag for the component tree. */
    function useDarkTheme() {
      return useSyncExternalStore(subscribeTheme, isDarkNow, () => false);
    }
    /** The rail's un-filled base colour for the active theme. */
    function railBase(dark) {
      return dark ? RAIL_BASE_DARK : RAIL_BASE_LIGHT;
    }
    /** Tinted track: the base mixed 22% toward the current level's fill. */
    function trackFor(fill, dark) {
      return mixHex(railBase(dark), fill, TRACK_TINT);
    }

    function rank(id) {
      const i = EFFORT_ORDER.indexOf(String(id).toLowerCase());
      return i === -1 ? 50 : i;
    }
    /** Sort the model's declared efforts into Codex ladder order. */
    function sortEfforts(list) {
      return [...(list || [])].sort((a, b) => rank(a.id) - rank(b.id));
    }
    /** Label for an effort: DSH's own catalog name wins, id table is fallback. */
    function effortLabel(effort) {
      if (!effort) return '';
      const name = typeof effort.name === 'string' ? effort.name.trim() : '';
      if (name) return name;
      const bucket = effortBucket(effort.id);
      return (bucket && EFFORT_LABEL_BY_BUCKET[bucket]) || effort.id || '';
    }

    /* The model line UNDER the level word drops the vendor prefix, so
     * `DeepSeek-V4.1-Flash` reads as `V4.1-Flash` right under `High`.
     *
     * Display-only, and only in that one spot: the trigger caption, the
     * provider → model list rows, `aria-label` and the `title` tooltip all keep
     * the full catalog name, so hovering or drilling down still tells you the
     * vendor. A name that IS the prefix (bare "DeepSeek") is left untouched
     * rather than rendering empty. */
    const VENDOR_PREFIX = /^deepseek[\s\-_:：·]+/i;
    function stripVendor(name) {
      const full = String(name ?? '');
      return full.replace(VENDOR_PREFIX, '') || full;
    }

    /* ------------------------------------------------------------------ *
     * Geometry — the card is measured from the original recording; the rail
     * is then the power slider of dsh-codex-excellent-slider, re-scaled to it.
     *
     * Verified cross-checks (recorded px -> CSS px, ratio 1.385):
     *   card height    144 -> 104.0   |  rail width 346 -> 249.8
     *   list row pitch  42.6 -> 30.8  |  list font   14 ->  10.1 cap
     *
     * The slider replaces the old 26px trough (top 65, 30px knob, per-tick dots)
     * with the reference's anatomy: 22px track, 25px knob, and a knob CENTRE
     * that travels over [11, width - 11] because 11 = RAIL_H / 2. Starting the
     * rail at 67 keeps that centre on the same 78px line the old trough used,
     * so nothing else in the card moves.
     * ------------------------------------------------------------------ */
    const RAIL_H = 22;
    const RAIL_INSET = RAIL_H / 2;
    const KNOB_D = 25;
    /* v1.2.12: the whale is drawn to the KNOB's diameter, not to the track's.
     * v1.2.10 matched it to the fill's 22px thickness ("the logo is exactly as
     * thick as the bar"), but on screen that still read as a badge sitting IN the
     * groove. The reference — and the user's red line — measured the glyph's
     * tallest axis against the OLD round knob: 25px. v1.2.13 goes past that on
     * purpose: the mark is 30px tall, so it overhangs the 22px track by 4px at the
     * top and at the bottom and stands ON the bar instead of sitting in the
     * groove. Spilling past the bar is allowed here — it was asked for twice. Width
     * follows the logo's own ratio: 30 * 23.3967 / 17.0659 = 41.13px, i.e. 8.07px
     * of overhang on each side of the 25px positioning box (flex centres it). The
     * positioning box itself stays KNOB_D, because the travel, the pointer maths
     * and the spout's origin are all keyed to that box. */
    const KNOB_WHALE_H = 30;
    const KNOB_WHALE_W = +(KNOB_WHALE_H * 23.3967 / 17.0659).toFixed(2);   // 41.13
    /* v1.2.15 - THE INTERIOR IS TRANSPARENT AGAIN, WITH NOTHING IN IT.
     * v1.2.12..v1.2.14 painted the logo's own cut-outs (the eye, the ventral
     * patch) with the bar's gradient and streamed white sparks through them. The
     * knob is asked to be the plain mark again, so the openings are simply open:
     * whatever sits behind the glyph - the coloured fill on its left, the pale
     * track on its right - shows through, the way the official logo's own
     * geometry does. Nothing here to tune any more: the flow alpha, the dot lane
     * table, the run-off fade and the spark clock all left with the layers that
     * used them. The glyph size above and KNOB_FLOW_REACH below (that one is the
     * FILL's frontier, not the glyph) are untouched. */
    /* v1.2.11 — ALIGN THE FLOW FRONT TO THE WHALE, NOT TO THE PILL CAP.
     * The fill used to be a pill (border-radius 999px) whose right end stopped
     * exactly on the knob's centre, so the LAST THING you saw was a 11px
     * semicircular cap tapering away: its visible mass ended ~8.7px behind the
     * tip, under the whale's rear fluke. The eye therefore put the frontier at
     * roughly a fifth of the glyph, the whole body sat on the pale track, and
     * the knob looked stranded instead of swimming — the fill and the whale
     * only LOOKED aligned on paper.
     * The fix is the shape, not a bigger offset: the leading end is now SQUARE
     * (see the .fill rule), so the frontier is a crisp vertical line and it is
     * exactly where the knob's anchor is — the same x the blowhole sits on.
     * KNOB_FLOW_REACH then nudges that line past the anchor by the small amount
     * that separates the anchor from the silhouette's optical centre
     * (+0.75px) plus the bit the reference wants wet, so the line cuts the
     * body instead of grazing its rear edge. 0 keeps the fill keyed 1:1 to the
     * anchor; 2 lands it on the centroid. This is the single knob to tune. */
    const KNOB_FLOW_REACH = 2;
    const RAIL_TOP = 67;

    /* ---- fill: keyed to the knob's ratio ----
     * One ratio drives three things at once (fill gradient, starfield energy,
     * Ultra material), so the pointer can move all of them continuously: the
     * fill is painted from the live fraction, not from the snapped stop.
     * The blue -> violet -> deep ramp itself lives in WATER_LIGHT/WATER_DARK;
     * ENERGY_START is where the starfield begins to light up. */
    const ENERGY_START = 0.05;
    function clamp01(v) {
      const n = Number(v);
      if (!isFinite(n)) return 0;
      return n < 0 ? 0 : n > 1 ? 1 : n;
    }
    function rgbMix(from, to, t) {
      const k = clamp01(t);
      return from.map((v, i) => Math.round(v + (to[i] - v) * k));
    }
    function rgbCss(c) {
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
    /* ---- 海水色标 ----
     * Six flat stops at 0/20/40/60/80/100% of the fill. The stop POSITIONS never
     * move; only their colours change with the tier, so a tier switch is a pure
     * colour change and the water keeps its shape.
     *
     * Positions are per-tier, colours interpolate: `waterStopsAt` walks the four
     * authored levels (Off / Low / High / Max) with a smoothstep, so dragging
     * between two levels crossfades the palette instead of snapping it. Landing
     * exactly on a level reproduces that level's authored water byte for byte.
     * A bar with more than four levels (some providers ship seven) samples the
     * same four authored keys at fractional positions, which stays smooth and
     * keeps the meaning: faintest -> one blue -> blue band -> deep band. */
    const WATER_LIGHT = (() => {
      const a = [134, 194, 234], b = [58, 120, 196], c = [17, 58, 110];
      const pale = rgbMix(a, [255, 255, 255], 0.30);
      return [
        [pale, pale, a, a, a, a],                                // Off  : 一片最淡的海
        [a, a, a, a, a, a],                                      // Low  : 整条浅蓝
        [a, a, a, b, b, b],                                      // High : 前半浅蓝后半蓝
        [a, a, b, b, c, c]                                       // Max  : 浅 / 蓝 / 深
      ];
    })();
    const WATER_DARK = (() => {
      const a = [110, 170, 214], b = [44, 104, 168], c = [14, 48, 92];
      const pale = rgbMix(a, [8, 24, 40], 0.26);
      return [
        [pale, pale, a, a, a, a],
        [a, a, a, a, a, a],
        [a, a, a, b, b, b],
        [a, a, b, b, c, c]
      ];
    })();
    const WATER_STOP_POS = [0, 20, 40, 60, 80, 100];

    /** Six stop colours for a *continuous* ratio, smoothstepped between tiers. */
    function waterStopsAt(ratio, dark) {
      const table = dark ? WATER_DARK : WATER_LIGHT;
      const last = table.length - 1;
      const x = clamp01(ratio) * last;
      const i = Math.min(last - 1, Math.floor(x));
      const k = x - i;
      const e = k * k * (3 - 2 * k);
      return table[i].map((col, j) => rgbMix(col, table[i + 1][j], e));
    }
    /** The same six stops as a paint-ready gradient. */
    function waterGradient(ratio, dark) {
      const stops = waterStopsAt(ratio, dark);
      const parts = stops.map((c, i) => `${rgbCss(c)} ${WATER_STOP_POS[i]}%`);
      return `linear-gradient(90deg, ${parts.join(', ')})`;
    }
    /** Light-theme gradient — what the rail's inline variable carries. */
    function fillBackground(ratio) {
      return waterGradient(ratio, false);
    }
    /** Dark-theme gradient (the same water, sunk to the dark card's range). */
    function fillBackgroundDark(ratio) {
      return waterGradient(ratio, true);
    }
    /**
     * Deep end of the water at `ratio`; tints the unfilled track and paints the
     * gradient's last stop. The theme argument is REQUIRED — the old wrapper
     * `fillEndColor()` dropped it at the call site, so the dark card was tinted
     * with the light ocean.
     */
    function waterDeepAt(ratio, dark) {
      const s = waterStopsAt(ratio, dark);
      return s[s.length - 1];
    }
    /** 0..1 "how much energy is this tier giving off" — drives the starfield. */
    function energyFor(ratio) {
      return clamp01((clamp01(ratio) - ENERGY_START) / (1 - ENERGY_START));
    }
    /** The track tint still speaks hex (trackFor/mixHex), so convert. */
    function rgbToHex(c) {
      return '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    }

    /* ---- sea current (the lanes the water strands ride) ----
     * 22 lanes, one per height, no two strands on the same row. Length,
     * brightness and lifetime are hashed per index, so a re-render never
     * reshuffles a current that is already in flight.
     *
     * The STAR_* names are kept from the v1.2.x star-dust build on purpose:
     * they still drive the geometry, only the painted element changed from a
     * dot to a filament (see the water-flow CSS block further down). */
    const STAR_COUNT = 22;
    const STAR_GOLDEN = 0.6180339887498949;
    const STAR_DURATION_MEAN = 1.5;      // seconds at speed factor 1
    const STAR_DURATION_SPREAD = 0.08;
    /* ---- teamwork flow boost (v1.2.20) ----
     * Agent teamwork doubles the slider's FLOW speed, and it does so on the
     * RUNNING animations instead of by swapping them: every CSS animation
     * inside the rail (the water strands, the four aurora veils, the Ultra haze's
     * breathing, the one-shot material sweep) is handed a playbackRate of
     * TEAM_FLOW through the Web Animations API. playbackRate rescales the
     * animation's clock in place — it never touches currentTime — so the frame
     * a star is on, its progress through the loop and the phase between the
     * veils all survive the flip, and the only visible change is that
     * everything then moves twice as fast.
     *
     * v1.2.19 did the same doubling by RE-TIMING the CSS instead (duration and
     * delay multiplied by a --cmes-flow variable). It measured 2.000x too, but
     * every re-timing re-resolved the animations' delays, so flipping the bit
     * made the starfield and the veils jump to a new phase. The API route has
     * no such seam: same keyframes, same durations, same delays, only the
     * clock rate changes, and flipping back is exact.
     *
     * `animationstart` re-asserts the rate for layers that mount later (the
     * Ultra stack on the way up, a starfield rebuilt by a ratio change), so a
     * late animation joins the boost instead of running at 1x. The arrival
     * spout is deliberately left alone: it is feedback on one gesture, not a
     * flow. */
    const TEAM_FLOW = 2;
    /** Push TEAM_FLOW (or 1) onto every animation currently running in el. */
    function applyFlowRate(el, teamOn) {
      if (!el || typeof el.getAnimations !== 'function') return;
      const rate = teamOn ? TEAM_FLOW : 1;
      let list;
      try {
        list = el.getAnimations({ subtree: true });
      } catch (e) {
        return;                                  // old engines: leave the default
      }
      for (const anim of list) {
        /* Setting playbackRate does not restart or seek anything; it only
         * changes how fast currentTime advances from here on. */
        try {
          anim.playbackRate = rate;
        } catch (e) {
          /* a paused or finished animation may refuse the write: ignore */
        }
      }
    }
    /** Deterministic (index, salt) -> 0..1. */
    function starHash(index, salt) {
      const n = ((index + 1) * salt * 2654435761) % 4294967296;
      return ((n >>> 8) % 1000) / 1000;
    }
    const STAR_ROWS = (() => {
      /* Two things have to hold at once: no two stars share a lane, AND the
       * FIRST N entries of the array still cover the whole height. The rail
       * fills its starfield from 0 to 22 stars as the knob moves right, so a
       * prefix that climbed from top to bottom (which is what sorting lanes by
       * phase produces) would read as a stripe that thickens downward. Handing
       * lanes out with a stride coprime with the count (7 and 22 share no
       * factor, so it is a permutation) fixes the prefix problem; phase stays
       * golden-ratio spaced so the delays never fall into a rhythm. */
      const rows = [];
      for (let i = 0; i < STAR_COUNT; i += 1) {
        const lane = (i * 7) % STAR_COUNT;
        rows.push({
          index: i,
          phase: ((i + 1) * STAR_GOLDEN) % 1,
          y: 8 + (lane / (STAR_COUNT - 1)) * 84      // 8%..92% of the fill
        });
      }
      return rows;
    })();
    /** Faster the further right the knob is; floored so stars still creep. */
    function starSpeed(ratio) {
      return Math.min(2, Math.max(0.35, 3 * clamp01(ratio) - 1));
    }
    function starCountFor(ratio) {
      return Math.round(energyFor(ratio) * STAR_COUNT);
    }
    function starDurationFor(index, speed) {
      const factor = Math.min(2, Math.max(0.35, speed));
      const jitter = 1 - STAR_DURATION_SPREAD + 2 * STAR_DURATION_SPREAD * starHash(index, 29);
      return (STAR_DURATION_MEAN * 2 / factor) * jitter;
    }
    function starDelayFor(index, phase, duration) {
      return -((phase + 0.03 * starHash(index, 53)) % 1) * duration;
    }

    /* ---- blowhole spout: one-shot, fired on arrival at the top tier ----
     * v1.2.21 replaces the ink splatter. Eight dark drops sprayed radially out
     * of the knob read as a squirt of ink — an octopus gesture on a whale, and
     * the wrong animal inside our own logo. A whale announces itself by
     * blowing: air and spray straight up out of the blowhole, a crown that
     * mushrooms open at the top, then a few droplets falling back.
     *
     * The whole thing is anchored on the BLOWHOLE, not on the knob centre. The
     * glyph is mirrored so the animal faces right, so the top of its skull sits
     * right of centre, on the line the jet has to leave from — a jet out of the
     * middle of its back reads as steam, not as breath.
     *
     * Authored in the same 46-unit reference space the ink used (46 units =
     * KNOB_D), so the burst stays proportional if the knob box ever changes:
     * SPOUT_HOLE_Y = -21 * 25/46 = -11.4px is the skull's high point, and the
     * jet is 36 * 25/46 = 19.6px tall, i.e. it clears the glyph instead of
     * hiding inside it. */
    const SPOUT_SCALE = KNOB_D / 46;

    /* v1.2.22: every layer is authored in a 46px-space and multiplied by
     * SPOUT_SCALE (25/46 = 0.5435). At that scale the whole blow was 21px tall
     * - correct against a 25px knob, but the new layers (fans, glints, chuff)
     * were too small to read. SPOUT_GAIN grows the spray only; --shx/--shy keep
     * SPOUT_SCALE so the spout still leaves the blowhole exactly. */
    const SPOUT_GAIN = 1.15;
    const SPOUT_HOLE_X = 12;        // 46-space: 12 * 25/46 = 6.5px right of centre
    const SPOUT_HOLE_Y = -21;       // 46-space: top of the skull
    const SPOUT_START_DELAY = 30;   // ms before the jet breaks the surface
    /* v1.2.22: 560 -> 640ms. The extra 80ms is not a slower jet, it is room for
     * the second chuff (fire at +240ms, live 400ms) and the falling drip to land
     * inside the same one-shot window; the column itself still peaks at 22%. */
    const SPOUT_DURATION = 640;     // ms of rise + mushroom + chuff + fall
    /* Droplets: dx/dy are the far end of each one's flight, in 46-space. They
     * leave last-to-first (the tail has the longest delay so the crown opens
     * before the outside drops arrive), and every one lands on the same frame
     * because `--dur` is what is left of SPOUT_DURATION after its own delay.
     * `tilt` is the drop's own flight angle in degrees (atan2(dx, -dy)) and
     * `stretch` its elongation along that line: a droplet in fast flight is a
     * teardrop, not a marble. v1.2.22 took the count 7 -> 11 and opened the
     * two outermost arcs (±20 units) so the spray has a WIDTH, not just a top. */
    const SPOUT_DROPS = [
      { dx: -4.5, dy: -33.0, size: 3.0, delay: 64, tone: '#ffffff', tilt: -8, stretch: 1.35 },
      { dx: 6.5, dy: -36.0, size: 2.6, delay: 48, tone: '#f2fbff', tilt: 10, stretch: 1.3 },
      { dx: -9.5, dy: -40.0, size: 2.2, delay: 104, tone: '#dcf1ff', tilt: -13, stretch: 1.25 },
      { dx: 11.0, dy: -33.0, size: 2.4, delay: 82, tone: '#eafaff', tilt: 18, stretch: 1.28 },
      { dx: 1.5, dy: -46.0, size: 2.6, delay: 96, tone: '#ffffff', tilt: 2, stretch: 1.4 },
      { dx: -15.0, dy: -26.0, size: 2.0, delay: 138, tone: '#cfeaff', tilt: -30, stretch: 1.22 },
      { dx: 16.0, dy: -24.0, size: 2.0, delay: 128, tone: '#dff4ff', tilt: 34, stretch: 1.22 },
      /* v1.2.22 additions: the two wide flanks, one high stray, one inner mist-drop */
      { dx: -20.0, dy: -19.0, size: 1.7, delay: 152, tone: '#bfe3ff', tilt: -46, stretch: 1.2 },
      { dx: 20.5, dy: -18.5, size: 1.8, delay: 158, tone: '#d9f2ff', tilt: 48, stretch: 1.2 },
      { dx: -1.5, dy: -52.0, size: 2.2, delay: 88, tone: '#ffffff', tilt: -2, stretch: 1.5 },
      { dx: 4.0, dy: -42.5, size: 1.5, delay: 120, tone: '#eaf9ff', tilt: 5, stretch: 1.25 },
    ];
    /* v1.2.22: the droplets were authored as 1.5-3 units, which at 0.54px/unit
     * is 1-1.6px - dust, not water. One shared factor keeps the authored table
     * readable while making every drop 1.25x heavier on screen. */
    const DROP_SIZE_SCALE = 1.25;
    /** How long the whole flourish lives; the burst state clears after it. */
    const SPOUT_TOTAL = SPOUT_START_DELAY + SPOUT_DURATION + 70;
    function spoutDropStyle(spec) {
      return {
        '--dx': (spec.dx * SPOUT_SCALE * SPOUT_GAIN).toFixed(2) + 'px',
        '--dy': (spec.dy * SPOUT_SCALE * SPOUT_GAIN).toFixed(2) + 'px',
        '--size': (spec.size * DROP_SIZE_SCALE * SPOUT_SCALE * SPOUT_GAIN).toFixed(2) + 'px',
        '--tone': spec.tone,
        '--tilt': (spec.tilt || 0) + 'deg',
        '--stretch': (spec.stretch || 1).toFixed(2),
        '--dur': SPOUT_DURATION - spec.delay + 'ms',
        '--delay': SPOUT_START_DELAY + spec.delay + 'ms',
      };
    }

    /* ------------------------------------------------------------------ *
     * Popover surface: ONE switch, TWO builds
     *
     *   GLASS = true   the v1.2.6 recipe: a 0.19-alpha tint, a top-weighted
     *                  sheen and a 6px backdrop frost, four edge shadows and
     *                  no body layer at all.
     *   GLASS = false  the default build: an opaque themed panel with a
     *                  hairline border and a soft lift. No backdrop-filter,
     *                  which also renders faster without GPU compositing.
     *
     * `build.mjs` flips exactly this one line to produce the two zips offered
     * on the download page, so the variants can never drift apart: everything
     * else (rail, stardust, spout, drill-down, i18n) is shared byte for byte.
     * ------------------------------------------------------------------ */
    const GLASS = true;

    const POPOVER_CSS = GLASS ? `
.${P}-popover{position:fixed;bottom:var(--${P}-bottom,40px);left:var(--${P}-left,12px);width:272px;max-width:calc(100vw - 24px);height:var(--${P}-height,104px);max-height:var(--${P}-avail,calc(100vh - 40px));padding:0;
  background-color:rgba(var(--${P}-glassTint),var(--${P}-glassAlpha));
  background-image:linear-gradient(180deg,
    rgba(255,255,255,var(--${P}-glassSheenA)) 0%,
    rgba(255,255,255,var(--${P}-glassSheenB)) 38%,
    rgba(255,255,255,var(--${P}-glassSheenC)) 100%);
  border:0;
  border-radius:16px;
  box-shadow:
    inset 0 1px 0 var(--${P}-glassHighlight),
    inset 0 -1px 0 rgba(255,255,255,.08),
    inset 0 0 0 .5px var(--${P}-glassHairline),
    var(--${P}-glassLift);
  backdrop-filter:var(--${P}-glassBlur);
  -webkit-backdrop-filter:var(--${P}-glassBlur);
  z-index:1100;overflow:hidden;transform-origin:bottom left;transition:opacity .18s ease,transform .18s ease,height .2s cubic-bezier(.2,.8,.2,1),visibility 0s}
.${P}-popover.closed{opacity:0;pointer-events:none;visibility:hidden;transform:translateY(5px) scale(.98);transition-delay:0s,0s,0s,.18s}
.${P}-popover.peak{--${P}-glassHighlight:rgba(178,138,255,.60);--${P}-glassHairline:rgba(178,138,255,.34)}
` : `
.${P}-popover{position:fixed;bottom:var(--${P}-bottom,40px);left:var(--${P}-left,12px);width:272px;max-width:calc(100vw - 24px);height:var(--${P}-height,104px);max-height:var(--${P}-avail,calc(100vh - 40px));padding:0;
  --${P}-glassText:none;
  background-color:var(--${P}-panel,#ffffff);
  background-image:none;
  border:1px solid var(--${P}-panelEdge,rgba(15,23,42,.10));
  border-radius:16px;
  box-shadow:var(--${P}-panelLift,0 12px 32px rgba(15,23,42,.16));
  z-index:1100;overflow:hidden;transform-origin:bottom left;transition:opacity .18s ease,transform .18s ease,height .2s cubic-bezier(.2,.8,.2,1),visibility 0s}
.${P}-popover.closed{opacity:0;pointer-events:none;visibility:hidden;transform:translateY(5px) scale(.98);transition-delay:0s,0s,0s,.18s}
.${P}-popover.peak{--${P}-panelEdge:rgba(155,72,235,.45)}
`;

    const CSS = `
.${P}-root{position:relative;display:inline-flex;min-width:0;font-family:var(--dsw-font-family);font-size:14px;letter-spacing:0;
  /* Liquid-glass tokens, copied from the recipe dsh-plugin-wallpaper-engine
     uses for its floating glass cards (lib/client.glass.js, the iOS-liquid-glass
     block), with its LIVE knob values read off the running host:
       alpha    0.19   → --we-glass-alpha  (its 玻璃透明度, 0 = solid, 60 = clear)
       frost    6px    → --we-blur, with saturate 1.3 / brightness 1.04 /
                         contrast 1.01 (--we-saturate, --we-glass-brightness)
       floor    0      → 玻璃保真度 0, i.e. NO readability-floor layer at all
     That last one is why our earlier .42 slab read as opaque: the reference
     panes carry a 0.19 tint and nothing else. So:
       glassTint/glassAlpha  the only body the pane has (an rgb triple + alpha,
                             so one token pair serves both themes)
       glassSheenA/B/C       the top-weighted white specular gradient that turns
                             a flat tint into wet glass
       glassHighlight        the 1px top refraction line
       glassHairline         the 0.5px edge hairline
       glassLift             the soft elevation shadow
       glassText             a text shadow, which is how text stays readable on
                             a floor-less pane without adding body back */
  /* opaque surface for the GLASS=false build (see POPOVER_CSS) */
  --${P}-panel:#ffffff;
  --${P}-panelEdge:rgba(15,23,42,.10);
  --${P}-panelLift:0 12px 32px rgba(15,23,42,.16),0 2px 6px rgba(15,23,42,.06);
  --${P}-glassTint:255,255,255;
  --${P}-glassAlpha:.30;
  --${P}-glassBlur:blur(6px) saturate(1.3) brightness(1.04) contrast(1.01);
  --${P}-glassSheenA:.16;
  --${P}-glassSheenB:.05;
  --${P}-glassSheenC:.02;
  --${P}-glassHighlight:rgba(255,255,255,.42);
  --${P}-glassHairline:rgba(255,255,255,.12);
  --${P}-glassLift:0 12px 40px rgba(15,23,42,.20);
  --${P}-glassText:0 1px 2px rgba(15,23,42,.40),0 0 14px rgba(15,23,42,.22)}
.${P}-root *{box-sizing:border-box;corner-shape:round}
.${P}-root button{font:inherit;cursor:pointer;border:0;background:transparent;color:inherit}

/* ---------- trigger (collapsed seat) ---------- */
.${P}-trigger{display:inline-flex;align-items:center;gap:5px;max-width:250px;height:28px;padding:0 7px;border-radius:8px;color:var(--dsw-alias-label-caption);font-size:13px!important}
.${P}-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.${P}-trigger:disabled{cursor:default;opacity:.55}
.${P}-trigger:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
/* The agent-team mark: the official whale, three times, FILLED ONLY.
   A filled silhouette has no hairline stroke to smear at 20px, which is what
   kept the earlier outline version looking blurry. State is carried by COLOUR:
   white at rest, the host's brand blue once teamwork is on.
   --dsw-alias-label-primary is near-white on the dark palette and near-black on
   the light one, so the mark stays legible in both themes; the blue is the
   host's own brand token rather than an invented hue. */
.${P}-teamMark{width:20px;height:20px;flex:none;color:var(--${P}-teamOff,var(--dsw-alias-label-primary,#fff))}
.${P}-teamMark path{fill:currentColor;stroke:none}
.${P}-tool.active .${P}-teamMark,.${P}-trigger.team .${P}-teamMark{color:var(--${P}-teamOn,var(--dsw-alias-brand-primary-new-color,#4d6bfe))}
.${P}-iconSmall{width:14px;height:14px;flex:none}
/* The caption is the ONLY part allowed to shrink: the model name truncates with
   an ellipsis while the level keeps its (two) characters. They used to share one
   truncating box, so with a long model name — and with Fast on, which costs
   another ~21px for the ⚡ — the level slid past the ellipsis and disappeared. */
.${P}-caption{flex:0 1 auto;display:var(--dsh-composer-model-text-display,inline);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.${P}-triggerEffort{flex:none;display:var(--dsh-composer-model-text-display,inline);white-space:nowrap;color:var(--${P}-ink,#a9d6ff);transition:color .2s ease}
/* Icon-only seat (the host stamps --dsh-composer-model-icon-display:block on the
   control row when the composer cannot fit the text; opening either sidebar
   narrows that row, which is exactly when this state shows up).
   BUG (fixed in 1.2.29): the glyph inside this span had NO width/height rule.
   An inline <svg> with only a viewBox sizes itself from the default object size,
   so as a shrinkable flex child it was squeezed to zero and the seat collapsed
   to the bare chevron the user saw. The glyph now carries the host's own
   intrinsic size (16px), which is what dsh's ModelSelect.triggerIcon does. */
.${P}-compact{display:var(--dsh-composer-model-icon-display,none);flex:none;align-items:center}
.${P}-compactIcon{display:block;width:16px;height:16px;flex:none;color:var(--dsw-alias-label-secondary)}
/* 14px / stroke 1: the host chevron's own intrinsic size and weight
   ("chevron-down-outline" in the shipped icon set, regular weight). */
.${P}-chev{width:14px;height:14px;flex:none;color:var(--dsw-alias-label-caption);transition:transform .12s ease}
.${P}-trigger[aria-expanded=true] .${P}-chev{transform:rotate(180deg)}

/* ---------- the Fast tooltip ----------
   BUG (fixed here): this layer used to be a child of the ⚡ button — i.e. INSIDE
   the popover — and position:fixed alone could not free it. The popover
   paints the shipped menu material
   backdrop-filter: var(--dsw-menu-backdrop-filter) = blur(40px) saturate(150%),
   and a non-none backdrop-filter makes that element the CONTAINING BLOCK for
   every fixed/absolute descendant. So the viewport coordinates positionTip
   computed were re-interpreted against the POPOVER's box (measured in a real
   browser: a wanted top of 479 landed at 1023 = 544 popover top + 479) and
   overflow:hidden then clipped the layer away. Hover *did* flip opacity to 1
   and visibility to visible — nothing was ever painted, which is exactly the
   "悬停无法显示" symptom.
   FIX: render the tooltip as a SIBLING of the popover under .cmes-root.
   That box carries no transform / filter / backdrop-filter, so position:fixed
   resolves against the viewport again (probe-verified: a fixed box inside the
   popover reports the popover origin, one inside the root reports 0,0).
   The tooltip is therefore no longer a descendant of the button, so the old
   .cmes-fast:hover [role=tooltip] rule could never fire; visibility is a
   .show class driven by pointer enter/leave + focus/blur instead. */
.${P}-tip{position:fixed;z-index:1400;padding:7px 12px;white-space:nowrap;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));box-shadow:var(--dsw-elevation-panel);border-radius:10px;font-size:12px;line-height:17px;text-align:center;color:var(--dsw-alias-label-primary);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(2px);transition:opacity .12s ease,transform .12s ease,visibility 0s .12s}
.${P}-tip.show{opacity:1;visibility:visible;transform:translateY(0);transition:opacity .12s ease,transform .12s ease,visibility 0s}
/* the reference tooltip is a two-line card: a heavier title over a muted
   subtitle. The "visual only" disclosure stays for assistive tech only, so the
   card keeps the reference's two-line shape. */
.${P}-tip span{display:block;color:var(--dsw-alias-label-secondary)}
.${P}-tip .${P}-tipTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:18px}

/* ---------- containing-block probe ----------
   position:fixed is only viewport-relative while NO ancestor establishes a
   containing block. The host's composer seat does: it carries
   will-change:transform, so every fixed descendant is laid out against the
   SEAT's box. That is why the popover used to be pushed right by the seat's own
   x offset (280px in the docked composer, far more in a wide window) and ran off
   the right edge of the window, and why the vertical anchor drifted.

   This probe is a fixed child stretched over its own containing block, so its
   rect IS the coordinate origin the popover's left/bottom are interpreted
   against. align() converts viewport coordinates into that space. When no
   ancestor creates one, the probe equals the viewport and the conversion is the
   identity — the behaviour stays exactly as it was on hosts that need nothing. */
.${P}-probe{position:fixed;left:0;top:0;right:0;bottom:0;visibility:hidden;pointer-events:none;z-index:-1}

/* ---------- popover surface (POPOVER_CSS; GLASS picks the build) ---------- */
${POPOVER_CSS}


/* ---------- panes ---------- */
.${P}-pane{position:absolute;left:0;right:0;bottom:0;opacity:1;transform:translateY(0);transition:opacity .14s ease,transform .2s ease,visibility 0s}
.${P}-pane.hidden{opacity:0;pointer-events:none;visibility:hidden;transform:translateY(5px);transition-delay:0s,0s,.14s}

/* ---------- effort pane ---------- */
.${P}-main{height:104px}
.${P}-tool{position:absolute;top:7px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;padding:0;border-radius:8px;color:var(--dsw-alias-label-caption)}
.${P}-tool:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-fast{left:7px}
.${P}-reset{right:7px}
.${P}-tool svg{width:16px;height:16px}
/* the team mark uses the whole 28px hit area: the whales are filled silhouettes,
   and every extra pixel is what keeps them legible without a hairline stroke */
.${P}-tool .${P}-teamMark{width:24px;height:24px}
.${P}-fast.active{color:var(--${P}-accent,#3988f6)}
.${P}-popover.peak .${P}-fast.active{color:var(--${P}-accentPeak,#9b48eb)}
.${P}-modelLink{position:absolute;left:43px;right:43px;top:8px;height:42px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 4px;border-radius:5px;transition:opacity .2s ease}
.${P}-modelLink:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-heading{display:flex;gap:3px;justify-content:center;align-items:center;max-width:100%;height:20px;color:var(--${P}-ink,#a9d6ff);font-size:14px;line-height:20px;white-space:nowrap;text-shadow:var(--${P}-glassText);transition:color .2s ease}
.${P}-heading svg{width:10px;height:10px;color:var(--dsw-alias-label-caption)}
.${P}-modelName{display:block;max-width:100%;height:18px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.${P}-modelLink .${P}-modelName{text-shadow:var(--${P}-glassText)}
.${P}-warning{position:absolute;left:29px;right:29px;top:20px;text-align:center;line-height:18px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s ease}
/* The quota warning wears a DEEP BLUE (v1.2.27), the same family as the Max
   level word under it: solid ink instead of the old violet shimmer, so the line
   reads as a proper colour on the card rather than a light band sweeping
   through transparent text. Ink comes from --cmes-warnInk, stamped inline from
   the ladder's top rung; the light card therefore gets the Max word's own navy
   and the dark card the legible lift of that hue (a navy would sink into
   #2a2b2e). */
.${P}-warning span{display:inline-block;color:var(--${P}-warnInk,#113a6e);-webkit-text-fill-color:currentColor}
.${P}-popover.message .${P}-modelLink,.${P}-popover.message .${P}-tool{opacity:0;pointer-events:none}
.${P}-popover.message .${P}-warning{opacity:1}

/* ---------- rail: the power slider ----------
   Anatomy and timings are ported from dsh-codex-excellent-slider's power
   slider, re-prefixed and re-scaled to this popover:
     track 22px -> fill (blue -> violet -> deep, keyed to the knob's ratio)
     -> sea current (22 lanes; count and speed rise with the energy)
     -> Ultra material + 4-layer aurora (top tier only)
     -> one-shot blowhole spout out of the knob on arrival at that tier
     -> 25px knob whose centre rides [11px, width - 11px].
   Only the geometry differs from the reference: this rail spans the popover's
   12px insets, so the knob travels over calc(100% - 22px) inside a 22px track.
   The track stays tinted toward the current level (railBase/trackFor); the fill
   gradient is stamped inline and follows the live ratio, not just the stop.
   v1.2.11: the fill's front cap is SQUARE and it runs KNOB_FLOW_REACH past the
   knob's centre, so the flow frontier is a straight line sitting on the whale's
   whale's optical centre instead of a pill tip that the fluke hides — see the constant for
   the arithmetic. */
.${P}-rail{position:absolute;left:12px;right:12px;top:${RAIL_TOP}px;height:${RAIL_H}px;border-radius:999px;background:var(--${P}-track,#e8e7e8);box-shadow:inset 0 1px 0 rgba(255,255,255,.05);touch-action:none;cursor:pointer;transition:background .25s ease}
/* GRAB AREA — the knob is 25px tall on a 22px track, so the puck overhangs and
   that overhang would be a dead zone. This transparent pad widens the rail's
   OWN hit box over it (plus 6px each side); the knob stays pointer-events:none,
   so the event TARGET never changes while the value slides under the cursor —
   one stable target for the whole gesture, which is what keeps a drag from
   being interrupted part-way. */
.${P}-rail::before{content:"";position:absolute;inset:-8px -6px;border-radius:999px}
.${P}-rail:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#3989e9);outline-offset:2px}
.${P}-fill{position:absolute;left:0;top:0;bottom:0;width:calc(${RAIL_INSET + KNOB_FLOW_REACH}px + (100% - ${RAIL_H}px)*var(--${P}-pos,0));border-radius:${RAIL_INSET}px 0 0 ${RAIL_INSET}px;overflow:hidden;pointer-events:none;background:var(--${P}-fillBg,var(--${P}-fill,#6fb2e4));transition:width .18s cubic-bezier(.2,.9,.25,1),background .24s ease}
body[data-ds-dark-theme] .${P}-fill{background:var(--${P}-fillBgDark,var(--${P}-fill,#79bcdf))}
/* the knob and the fill stop animating while the pointer owns the value */
.${P}-rail.dragging .${P}-fill{transition:none}

/* ---------- Ultra material (top tier only) ----------
   A 2x-wide gradient swept into place, then a soft haze that breathes. The
   sweep is what sells "this tier is different": the material slides across the
   fill once and parks at its stop instead of looping.
   v1.2.20: these durations and delays are the authored ones and stay put. The
   teamwork boost no longer re-times them (v1.2.19 did, by multiplying them with
   a --cmes-flow variable); applyFlowRate hands the running animations a
   playbackRate of 2 instead, so sweep, haze and the four aurora veils simply
   run twice as fast with their phases intact. */
.${P}-ultra{position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;--${P}-sweep:1.8s;--${P}-hazeAlpha:.065;background-image:radial-gradient(ellipse at 54% 28%,rgba(226,246,255,.11),rgba(168,214,244,.035) 38%,rgba(168,214,244,0) 72%),linear-gradient(90deg,rgba(255,255,255,.08) 0%,rgba(190,230,255,.05) 25%,rgba(126,186,232,.06) 50%,rgba(22,62,112,.11) 60%,rgba(12,42,82,.14) 68%,rgba(6,30,64,.16) 74%,rgba(12,42,82,.14) 79%,rgba(22,62,112,.11) 88%,rgba(6,26,54,.17) 100%);mix-blend-mode:soft-light;background-size:100% 100%,200% 100%;background-repeat:no-repeat;background-position:0 0,0% 0%;animation:${P}-ultra-sweep var(--${P}-sweep) linear both,${P}-ultra-in .2s ease-out both}
@keyframes ${P}-ultra-in{from{opacity:0}to{opacity:1}}
@keyframes ${P}-ultra-sweep{
  0%{background-position:0 0,67% 0%;animation-timing-function:cubic-bezier(.30,.70,.35,1)}
  12%{background-position:0 0,80% 0%;animation-timing-function:cubic-bezier(.28,.06,.30,1)}
  100%{background-position:0 0,100% 0%}
}
body:not([data-ds-dark-theme]) .${P}-ultra{--${P}-hazeAlpha:.035}
.${P}-ultraHaze{position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:radial-gradient(ellipse at 61% 58%,rgba(226,246,255,var(--${P}-hazeAlpha)) 0%,rgba(168,214,244,.022) 34%,rgba(168,214,244,0) 72%);animation:${P}-haze-breathe 13.6s ease-in-out infinite;animation-delay:-4.2s}
@keyframes ${P}-haze-breathe{0%,100%{opacity:.55}50%{opacity:.9}}

/* ---------- aurora: four drifting veils over the Ultra material ----------
   Each veil is twice the fill's width and slides with its own duration and
   direction, so the composite never visibly repeats. Delays are negative so
   the veils are already mid-cycle when the tier arrives — there is no "startup"
   moment to catch.
   v1.2.20: the durations below are the numbers the replica was tuned with and
   are not touched; agent teamwork doubles them through playbackRate
   (applyFlowRate), which keeps each veil's phase ratio across the flip. */
.${P}-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1}
.${P}-aurora>i{position:absolute;top:-30%;bottom:-30%;left:-50%;width:200%;display:block;background-repeat:no-repeat;opacity:0;animation-name:${P}-aurora-in;animation-duration:.9s;animation-timing-function:ease-out;animation-fill-mode:both}
.${P}-aurora>.a1{background-image:radial-gradient(7% 170% at 50% 45%,rgba(226,246,255,.40) 0%,rgba(226,246,255,.15) 46%,rgba(226,246,255,0) 76%);animation-name:${P}-aurora-in,${P}-aurora-x1,${P}-aurora-breathe;animation-duration:.9s,8.5s,4.5s;animation-delay:2.4s,.7s,3.3s;animation-iteration-count:1,infinite,infinite;animation-direction:normal,alternate,alternate;animation-timing-function:ease-out,ease-in-out,ease-in-out;animation-fill-mode:both,both,none}
.${P}-aurora>.a2{background-image:radial-gradient(10% 180% at 50% 55%,rgba(96,168,222,.38) 0%,rgba(96,168,222,.14) 50%,rgba(96,168,222,0) 78%);animation-name:${P}-aurora-in,${P}-aurora-x2;animation-duration:.9s,13s;animation-delay:2.6s,-1.5s;animation-iteration-count:1,infinite;animation-direction:normal,alternate;animation-timing-function:ease-out,linear;animation-fill-mode:both,both}
.${P}-aurora>.a3{background-image:radial-gradient(5% 160% at 50% 50%,rgba(168,214,244,.30) 0%,rgba(168,214,244,.11) 52%,rgba(168,214,244,0) 80%);animation-name:${P}-aurora-in,${P}-aurora-x3;animation-duration:.9s,16s;animation-delay:2.8s,-5.5s;animation-iteration-count:1,infinite;animation-direction:normal,alternate;animation-timing-function:ease-out,linear;animation-fill-mode:both,both}
.${P}-aurora>.a4{background-image:radial-gradient(8% 140% at 50% 60%,rgba(40,96,158,.30) 0%,rgba(40,96,158,.11) 55%,rgba(40,96,158,0) 82%);animation-name:${P}-aurora-in,${P}-aurora-x4;animation-duration:.9s,23s;animation-delay:3s,-10.7s;animation-iteration-count:1,infinite;animation-direction:normal,alternate;animation-timing-function:ease-out,linear;animation-fill-mode:both,both}
@keyframes ${P}-aurora-in{from{opacity:0}to{opacity:1}}
@keyframes ${P}-aurora-breathe{from{opacity:1}to{opacity:.72}}
@keyframes ${P}-aurora-x1{from{transform:translate3d(-16%,1.4px,0)}to{transform:translate3d(16%,-1.4px,0)}}
@keyframes ${P}-aurora-x2{from{transform:translate3d(14%,-1.6px,0)}to{transform:translate3d(-14%,1.6px,0)}}
@keyframes ${P}-aurora-x3{from{transform:translate3d(-10%,1.8px,0)}to{transform:translate3d(10%,-1.8px,0)}}
@keyframes ${P}-aurora-x4{from{transform:translate3d(8%,-1px,0)}to{transform:translate3d(-8%,1px,0)}}

/* ---------- water flow (replaces the star dust) ----------
   No dots, no glow. Each particle is a thin horizontal filament with both ends
   faded out, so it reads as water sliding past rather than as a spark. Three
   things carry the motion: the filament's own bob (drop-bob), the lane's
   right-to-left sweep, and the two water layers under it.

   Determinism is unchanged: heights, lengths and lifetimes all come from
   starHash(index, salt), so a re-render never reshuffles a flow in flight.
   The lane carries NO opacity ramp any more - the filament fades at its own
   ends, and a lane-level fade made whole frames of the bar go empty (measured). */
.${P}-water{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2}
.${P}-flow{position:absolute;left:0;right:0;height:1.3px;margin-top:-.65px;pointer-events:none;animation-name:${P}-flow-sweep;animation-timing-function:linear;animation-iteration-count:infinite}
.${P}-flow>i{position:absolute;left:100%;top:0;border-radius:999px;
  animation-name:${P}-flow-bob;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
/* Filament: five-stop gradient so both ends dissolve, a brighter cap along the top
   and a deep-teal shadow along the bottom. Height scales with --ds, so near lanes
   are visibly thicker than far ones. */
.${P}-flow>i.${P}-fil{width:var(--${P}-fw,44px);height:calc(1.3px * var(--${P}-ds,1));margin-top:calc(-0.65px * var(--${P}-ds,1));
  background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(240,251,255,.30) 22%,rgba(255,255,255,.62) 55%,rgba(240,251,255,.34) 78%,rgba(255,255,255,0) 100%);
  filter:blur(.25px)}
.${P}-flow>i.${P}-fil::after{content:"";position:absolute;left:12%;right:12%;top:-.4px;height:.7px;border-radius:999px;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.85) 45%,rgba(255,255,255,.35) 72%,rgba(255,255,255,0));filter:blur(.18px)}
.${P}-flow>i.${P}-fil::before{content:"";position:absolute;left:10%;right:10%;bottom:-.45px;height:.9px;border-radius:999px;
  background:linear-gradient(90deg,rgba(13,74,105,0),rgba(11,66,96,.34) 44%,rgba(13,74,105,0));filter:blur(.35px)}
/* Wisp: a shorter, fainter dash threaded between the filaments so the lanes never
   read as parallel scratches. Its own element, not a modifier on the filament. */
.${P}-flow>i.${P}-wisp{width:var(--${P}-wl,22px);height:1.1px;margin-top:-.55px;opacity:.4;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.30) 40%,rgba(255,255,255,.44) 68%,rgba(255,255,255,0));
  filter:blur(.4px)}
@keyframes ${P}-flow-sweep{from{transform:translate3d(0,0,0)}to{transform:translate3d(-100%,0,0)}}
@keyframes ${P}-flow-bob{from{transform:translateY(-1.2px) scaleY(.86)}to{transform:translateY(1.2px) scaleY(1.1)}}

/* Max tier: a few bubbles ride the same lanes. */
.${P}-bubble{position:absolute;left:100%;top:50%;width:2.6px;height:2.6px;margin:-1.3px 0 0 -1.3px;border-radius:50%;
  background:rgba(255,255,255,.9);box-shadow:0 0 3px rgba(255,255,255,.42);opacity:0;
  animation-name:${P}-bubble-rise;animation-timing-function:ease-out;animation-iteration-count:infinite}
@keyframes ${P}-bubble-rise{
  0%{transform:translate(0,3px) scale(.45);opacity:0}
  18%{opacity:.72}
  70%{opacity:.55}
  100%{transform:translate(-7px,-5px) scale(1.05);opacity:0}
}

/* ---------- water body texture ----------
   Two translucent layers under the particles: a fine diagonal grain that never
   stops drifting, and a long swell that makes the whole column breathe. They
   are what turn a flat gradient into "a tube full of water". */
.${P}-tex{position:absolute;inset:-30% -10%;pointer-events:none;z-index:1;mix-blend-mode:soft-light;opacity:.85;
  background-image:repeating-linear-gradient(99deg,rgba(255,255,255,0) 0 5px,rgba(255,255,255,.10) 5px 7px,rgba(255,255,255,0) 7px 15px);
  animation:${P}-tex-drift 5.2s linear infinite}
@keyframes ${P}-tex-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(-15px,0,0)}}
.${P}-swell{position:absolute;inset:-45% -25%;pointer-events:none;z-index:1;mix-blend-mode:soft-light;opacity:.75;
  background:repeating-linear-gradient(95deg,rgba(255,255,255,0) 0 54px,rgba(255,255,255,.10) 54px 76px,rgba(255,255,255,0) 76px 148px);
  animation:${P}-swell-drift 3.6s linear infinite}
@keyframes ${P}-swell-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(-148px,0,0)}}

/* ---------- teamwork pod ----------
   Two smaller whales trail the knob whenever agent teamwork is on. They live
   INSIDE the knob, so they follow it for free: no second position calculation,
   no drift between the puck and its wake.
   Sizes are keyed to the rail: podBig is exactly RAIL_H tall, podMid is two
   thirds of it. They are pushed 12px past the knob's left edge because the
   whale glyph already overhangs it by about 8px - at 12 they never overlap it.
   The podfade variable fades the pod out when the knob is parked at the far
   left, so the wake cannot poke out of the card. */
.${P}-pod{position:absolute;top:50%;right:calc(100% + 12px);display:flex;align-items:center;gap:3px;
  transform:translateY(-50%);opacity:0;pointer-events:none;transition:opacity .3s ease}
.${P}-rail.team .${P}-pod{opacity:var(--${P}-podfade,1)}
.${P}-podw{display:block;overflow:visible;color:#fff;filter:drop-shadow(0 1px 1.2px rgba(9,42,68,.24))}
.${P}-podBase{fill:currentColor;stroke:rgba(7,48,74,.34);stroke-width:.6;paint-order:stroke}
.${P}-podw.podBig{width:30.2px;height:${RAIL_H}px;opacity:.94;animation:${P}-pod-bob 1.7s linear infinite alternate;animation-delay:-.5s}
.${P}-podw.podMid{width:20.1px;height:${(RAIL_H * 2 / 3).toFixed(1)}px;opacity:.8;animation:${P}-pod-bob 2.2s linear infinite alternate;animation-delay:-1.35s}
@keyframes ${P}-pod-bob{from{transform:translate(-1.7px,-1.6px) rotate(-2.6deg)}to{transform:translate(1.7px,1.6px) rotate(2.6deg)}}

/* ---------- blowhole spout ----------
   ONE-SHOT. On arrival at the top tier the whale blows: the column punches out
   of the blowhole, mushrooms into a crown, and a few droplets fall back. It is
   what makes the arrival read as breath rather than as a colour change, and it
   never loops.

   The jet grows UP out of its own bottom edge (transform-origin 50% 100%, plus
   a -100% Y translate that parks that edge exactly on the blowhole), so one
   element already gives the "shot out of the hole" feel without scaling the
   whole container. The crown, mist and droplets are separate layers purely so
   they can lag the column.

   v1.2.22 - RICHER, NOT LOUDER. The same single breath, but the air around it
   now behaves like air instead of like one decal: a light halo blooms at the
   hole, a flat shock ring pushes out across the water film, the blown-off
   moisture washes sideways along the whale's back, three thin filaments lead
   the column and curl off at different angles, the crown breaks into a second
   smaller chuff a beat later, two glints catch the light in the spray, one
   heavy droplet falls back ONTO the whale, and the drops themselves are
   elongated along their own flight line instead of staying round. Every layer
   is staggered in [40ms, 240ms] behind the column, so it still reads as ONE
   gesture - adding mass, not events. Nothing loops; prefers-reduced-motion
   still removes the whole layer. */
.${P}-spout{position:absolute;top:50%;width:0;height:0;overflow:visible;pointer-events:none;z-index:2}
.${P}-jet{position:absolute;left:var(--shx);top:var(--shy);width:calc(var(--jw) * 1px * var(--s));height:calc(var(--jh) * 1px * var(--s));clip-path:polygon(40% 100%,60% 100%,100% 6%,80% 0,20% 0,0 6%);-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 34%,#000 100%);mask-image:linear-gradient(180deg,transparent 0,#000 34%,#000 100%);background:linear-gradient(180deg,rgba(255,255,255,.1) 0%,rgba(248,254,255,.9) 34%,rgba(232,250,255,.78) 62%,rgba(226,247,255,.32) 100%);filter:blur(calc(.65px * var(--s)));transform-origin:50% 100%;opacity:0;animation:${P}-jet-rise var(--dur) cubic-bezier(.16,.62,.24,1) var(--jd,var(--delay)) 1 both}
/* v1.2.22 BUGFIX: --jw/--jh are unitless numbers, so the old
   calc(var(--jw) * var(--s)) was a NUMBER * NUMBER and CSS dropped the
   declaration - the three cones were always 0x0 and therefore never painted.
   The column people actually saw came from .plume alone. Multiplying by 1px
   turns the authored 46-space sizes into real lengths, so the jet exists now
   and the numbers below finally mean what they say. */
/* Three cones, not one: a single geometric funnel reads as a light beam. The
   wide one lags (the column thickens as it climbs), the thin one leads and
   leans longest — together their edges are irregular enough to read as spray. */
.${P}-jet.j1{--jw:20;--jh:38;--ja:1}
.${P}-jet.j2{--jw:32;--jh:27;--ja:.4;--jd:calc(var(--delay) + 45ms);background:radial-gradient(72% 84% at 50% 76%,rgba(226,247,255,.5),rgba(226,247,255,0) 78%)}
.${P}-jet.j3{--jw:9;--jh:32;--ja:.3;--jd:calc(var(--delay) + 85ms)}
.${P}-plume{position:absolute;left:var(--shx);top:calc(var(--shy) - 2px * var(--s));width:calc(34px * var(--s));height:calc(42px * var(--s));border-radius:50% 50% 44% 44%/40% 40% 60% 60%;background:radial-gradient(58% 52% at 50% 34%,rgba(233,249,255,.62),rgba(206,240,255,.24) 62%,rgba(206,240,255,0) 84%);filter:blur(calc(2.2px * var(--s)));transform-origin:50% 100%;opacity:0;animation:${P}-plume-rise var(--dur) ease-out var(--delay) 1 both}
.${P}-crown{position:absolute;left:var(--shx);top:calc(var(--shy) - 34px * var(--s));width:calc(34px * var(--s));height:calc(14px * var(--s));border-radius:50%;background:radial-gradient(46% 50% at 50% 46%,rgba(255,255,255,.94),rgba(232,250,255,.6) 42%,rgba(214,242,255,.24) 68%,rgba(214,242,255,0) 88%);filter:blur(calc(.55px * var(--s)));box-shadow:0 0 calc(8px * var(--s)) rgba(196,235,255,.5);opacity:0;animation:${P}-crown-pop var(--dur) ease-out var(--delay) 1 both}
.${P}-mist{position:absolute;left:var(--shx);top:calc(var(--shy) - 27px * var(--s));width:calc(9px * var(--s));height:calc(4px * var(--s));border-radius:50%;background:radial-gradient(50% 50% at 50% 50%,rgba(233,249,255,.7),rgba(233,249,255,0) 72%);filter:blur(calc(.8px * var(--s)));opacity:0;animation:${P}-mist-drift var(--dur) ease-out var(--delay) 1 both}
.${P}-mist.m1{--mx:calc(-10px * var(--s))}
.${P}-mist.m2{--mx:calc(9px * var(--s));animation-delay:calc(var(--delay) + 60ms)}
.${P}-drop{position:absolute;left:var(--shx);top:var(--shy);width:0;height:0;opacity:0;animation:${P}-drop-fly var(--dur) cubic-bezier(.18,.6,.32,1) var(--delay) 1 both}
/* the drop is an ellipsoid now, not a ball: --tilt turns it onto its own flight
   line and --stretch lengthens it along that line, so a fast big droplet reads
   as a droplet instead of as a dot. Both are per-drop numbers baked in JS. */
.${P}-drop::before{content:"";position:absolute;left:0;top:0;width:var(--size);height:var(--size);border-radius:50%;background:var(--tone);box-shadow:0 0 calc(1.6px * var(--s)) rgba(190,232,255,.4);transform:translate(-50%,-50%) rotate(var(--tilt,0deg)) scaleY(var(--stretch,1))}
.${P}-burble{position:absolute;left:var(--shx);top:var(--shy);width:calc(2.6px * var(--s));height:calc(2.6px * var(--s));margin:calc(-1.3px * var(--s)) 0 0 calc(-1.3px * var(--s));border-radius:50%;background:rgba(255,255,255,.92);opacity:0;animation:${P}-burble-pop var(--dur) ease-out var(--delay) 1 both}
.${P}-burble.b2{left:calc(var(--shx) + 2.4px * var(--s));animation-delay:calc(var(--delay) + 45ms)}
/* HALO: the light the breath spills onto the water film around the hole. Sits
   BEHIND everything (first child), so it only ever lifts the background. */
.${P}-halo{position:absolute;left:var(--shx);top:var(--shy);width:calc(24px * var(--s));height:calc(16px * var(--s));border-radius:50%;background:radial-gradient(50% 50% at 50% 50%,rgba(255,255,255,.85),rgba(214,242,255,.42) 46%,rgba(206,238,255,0) 78%);filter:blur(calc(1.5px * var(--s)));opacity:0;animation:${P}-halo-pulse var(--dur) ease-out var(--delay) 1 both}
/* SHOCK: a flat ring, not a circle - the rail is a horizontal surface seen at a
   shallow angle, so its ripples are ellipses. A border keeps the edge crisp at
   the small size where a radial-gradient ring turns to mush. */
.${P}-shock{position:absolute;left:var(--shx);top:var(--shy);width:calc(18px * var(--s));height:calc(8px * var(--s));border-radius:50%;border:calc(.9px * var(--s)) solid rgba(238,251,255,.9);box-shadow:0 0 calc(4px * var(--s)) rgba(190,232,255,.55);opacity:0;animation:${P}-shock-ring var(--dur) cubic-bezier(.2,.7,.3,1) calc(var(--delay) + 14ms) 1 both}
/* BACKWASH: the moisture the jet throws off does not vanish sideways in mid
   air, it washes across the animal's back. Flattened + blurred so it hugs the
   rail plane instead of floating. */
.${P}-bwash{position:absolute;left:var(--shx);top:calc(var(--shy) + 1px * var(--s));width:calc(30px * var(--s));height:calc(8px * var(--s));border-radius:50%;background:radial-gradient(50% 50% at 50% 50%,rgba(236,250,255,0) 32%,rgba(236,250,255,.5) 58%,rgba(214,242,255,0) 84%);filter:blur(calc(.9px * var(--s)));opacity:0;animation:${P}-bwash-spread var(--dur) ease-out calc(var(--delay) + 6ms) 1 both}
/* THREADS: three hair-thin leading filaments. They are what makes the jet read
   as JETTED water rather than as a cone of light: each one leaves at a slightly
   different angle and drifts further off-axis the longer it lives, so the
   column's silhouette breaks up at the edges. --th is height in 46-space. */
.${P}-thread{position:absolute;left:var(--shx);top:var(--shy);width:calc(1.1px * var(--s));height:calc(var(--th) * 1px * var(--s));border-radius:calc(1px * var(--s));background:linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(248,254,255,.62) 30%,rgba(226,247,255,.38) 74%,rgba(226,247,255,0) 100%);filter:blur(calc(.6px * var(--s)));transform-origin:50% 100%;opacity:0;animation:${P}-thread-rise calc(var(--dur) - 96ms) cubic-bezier(.18,.62,.28,1) var(--td,var(--delay)) 1 both}
.${P}-thread.t1{--th:26;--tx:calc(-7px * var(--s));--ty:calc(-30px * var(--s));--td:calc(var(--delay) + 40ms)}
.${P}-thread.t2{--th:31;--tx:calc(9px * var(--s));--ty:calc(-34px * var(--s));--td:calc(var(--delay) + 70ms)}
.${P}-thread.t3{--th:23;--tx:calc(2px * var(--s));--ty:calc(-41px * var(--s));--td:calc(var(--delay) + 96ms)}
/* CHUFF: the crown does not simply fade - it breaks into one smaller ring a
   beat later, which is how a real blow ends. Own duration minus its delay, so
   it still lands inside SPOUT_DURATION. */
.${P}-puff{position:absolute;left:var(--shx);top:calc(var(--shy) - 32px * var(--s));width:calc(26px * var(--s));height:calc(9px * var(--s));border-radius:50%;background:radial-gradient(50% 50% at 50% 50%,rgba(255,255,255,0) 44%,rgba(240,252,255,.66) 58%,rgba(214,242,255,.26) 70%,rgba(214,242,255,0) 86%);filter:blur(calc(.5px * var(--s)));opacity:0;animation:${P}-puff-chuff calc(var(--dur) - 240ms) ease-out calc(var(--delay) + 240ms) 1 both}
/* v1.2.22 FAN: the two lobes that turn the silhouette from a light beam into a
   fountain. A real blow spreads sideways once it clears the hole; without them
   everything sat inside one narrow funnel. Each lobe is a half-mist that swells
   outward and drops as it fades, and they leave at slightly different times so
   the umbrella is asymmetric. */
.${P}-fan{position:absolute;left:var(--shx);top:calc(var(--shy) - 30px * var(--s));width:calc(20px * var(--s));height:calc(11px * var(--s));border-radius:50% 50% 44% 44%/56% 56% 44% 44%;background:radial-gradient(58% 60% at 50% 62%,rgba(244,253,255,.5),rgba(214,242,255,.22) 58%,rgba(214,242,255,0) 82%);filter:blur(calc(1.5px * var(--s)));transform-origin:50% 100%;opacity:0;animation:${P}-fan-bloom calc(var(--dur) - 60ms) cubic-bezier(.2,.58,.3,1) var(--fd,var(--delay)) 1 both}
.${P}-fan.l{--fx:calc(-1 * 1px);--fd:calc(var(--delay) + 60ms)}
.${P}-fan.r{--fx:1px;--fd:calc(var(--delay) + 110ms)}
/* GLINTS: the 4-point catch-light inside the spray. clip-path star, no image,
   no blur cost beyond one drop-shadow; a rotation makes them sparkle rather
   than pulse. */
.${P}-glint{position:absolute;left:var(--shx);top:var(--shy);width:calc(2.4px * var(--s));height:calc(2.4px * var(--s));background:#fff;clip-path:polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%);filter:drop-shadow(0 0 calc(1.2px * var(--s)) rgba(206,240,255,.8));opacity:0;animation:${P}-glint-twinkle calc(var(--dur) - 100ms) ease-out var(--gd,var(--delay)) 1 both}
.${P}-glint.g1{--gx:calc(-8px * var(--s));--gy:calc(-26px * var(--s));--gd:calc(var(--delay) + 100ms)}
.${P}-glint.g2{--gx:calc(10px * var(--s));--gy:calc(-20px * var(--s));--gd:calc(var(--delay) + 150ms);width:calc(2.2px * var(--s));height:calc(2.2px * var(--s))}
.${P}-glint.g3{--gx:calc(1px * var(--s));--gy:calc(-38px * var(--s));--gd:calc(var(--delay) + 200ms);width:calc(2.6px * var(--s));height:calc(2.6px * var(--s))}
/* DRIP: the one heavy droplet the crown cannot hold. It falls back down onto
   the whale's back instead of outward, which is the note that makes the burst
   feel gravity-bound rather than firework-like. */
.${P}-drip{position:absolute;left:calc(var(--shx) + 1px * var(--s));top:calc(var(--shy) - 31px * var(--s));width:calc(1.9px * var(--s));height:calc(2.6px * var(--s));border-radius:50% 50% 50% 50%/60% 60% 42% 42%;background:rgba(243,253,255,.95);box-shadow:0 0 calc(1.4px * var(--s)) rgba(190,232,255,.5);opacity:0;animation:${P}-drip-fall calc(var(--dur) - 300ms) cubic-bezier(.4,0,.8,.62) calc(var(--delay) + 300ms) 1 both}
@keyframes ${P}-jet-rise{0%{opacity:calc(0 * var(--ja,1));transform:translate(-50%,-100%) scaleY(.05)}22%{opacity:calc(.95 * var(--ja,1));transform:translate(-50%,-100%) scaleY(1)}46%{opacity:calc(.72 * var(--ja,1));transform:translate(-50%,-100%) scaleY(1.08)}100%{opacity:calc(0 * var(--ja,1));transform:translate(-50%,-112%) scaleY(1.22)}}
@keyframes ${P}-plume-rise{0%{opacity:0;transform:translate(-50%,-100%) scale(.35,.2)}26%{opacity:.58;transform:translate(-50%,-100%) scale(.8,.92)}56%{opacity:.46;transform:translate(-50%,-103%) scale(1.08,1.06)}100%{opacity:0;transform:translate(-50%,-110%) scale(1.4,1.12)}}
@keyframes ${P}-crown-pop{0%,16%{opacity:0;transform:translate(-50%,-50%) scale(.2)}34%{opacity:.86;transform:translate(-50%,-50%) scale(1)}58%{opacity:.5;transform:translate(-50%,-54%) scale(1.5)}100%{opacity:0;transform:translate(-50%,-62%) scale(2.1)}}
@keyframes ${P}-fan-bloom{0%,22%{opacity:0;transform:translate(-50%,-50%) scale(.25,.4)}44%{opacity:.5;transform:translate(calc(-50% + var(--fx) * 5 * var(--s)),-52%) scale(1,.9)}72%{opacity:.3;transform:translate(calc(-50% + var(--fx) * 9 * var(--s)),-40%) scale(1.3,.78)}100%{opacity:0;transform:translate(calc(-50% + var(--fx) * 12 * var(--s)),-24%) scale(1.5,.6)}}
@keyframes ${P}-mist-drift{0%,14%{opacity:0;transform:translate(-50%,-50%) scale(.5)}40%{opacity:.62;transform:translate(calc(-50% + var(--mx) * .55),-50%) scale(1)}100%{opacity:0;transform:translate(calc(-50% + var(--mx)),calc(-50% - 3px * var(--s))) scale(1.5)}}
@keyframes ${P}-drop-fly{0%{opacity:0;transform:translate3d(0,0,0)}10%{opacity:1}62%{opacity:.9;transform:translate3d(calc(var(--dx) * .88),var(--dy),0)}100%{opacity:0;transform:translate3d(var(--dx),calc(var(--dy) * .72),0)}}
@keyframes ${P}-burble-pop{0%,20%{opacity:0;transform:scale(.5)}40%{opacity:.95;transform:scale(1)}100%{opacity:0;transform:translate(calc(1px * var(--s)),calc(-7px * var(--s))) scale(.6)}}
@keyframes ${P}-halo-pulse{0%{opacity:0;transform:translate(-50%,-50%) scale(.35)}14%{opacity:.8;transform:translate(-50%,-52%) scale(.9)}34%{opacity:.46;transform:translate(-50%,-58%) scale(1.12)}100%{opacity:0;transform:translate(-50%,-70%) scale(1.38)}}
@keyframes ${P}-shock-ring{0%{opacity:0;transform:translate(-50%,-50%) scale(.3,.24)}12%{opacity:.85}55%{opacity:.32;transform:translate(-50%,-50%) scale(1.7,1.25)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.5,1.8)}}
@keyframes ${P}-bwash-spread{0%{opacity:0;transform:translate(-50%,-50%) scale(.35,.5)}16%{opacity:.6;transform:translate(-50%,-50%) scale(.7,.75)}42%{opacity:.3;transform:translate(-50%,-50%) scale(1,1)}100%{opacity:0;transform:translate(-50%,calc(-50% + 1px * var(--s))) scale(1.5,.92)}}
@keyframes ${P}-thread-rise{0%{opacity:0;transform:translate(-50%,-100%) scaleY(.12)}18%{opacity:.9;transform:translate(-50%,-100%) scaleY(1)}46%{opacity:.55;transform:translate(calc(-50% + var(--tx) * .4),calc(-100% + var(--ty) * .34)) scaleY(1.05)}100%{opacity:0;transform:translate(calc(-50% + var(--tx)),calc(-100% + var(--ty))) scaleY(1.16)}}
@keyframes ${P}-puff-chuff{0%,16%{opacity:0;transform:translate(-50%,-50%) scale(.25,.3)}34%{opacity:.75;transform:translate(-50%,-50%) scale(1,1)}66%{opacity:.38;transform:translate(-50%,calc(-50% - 3px * var(--s))) scale(1.7,1.25)}100%{opacity:0;transform:translate(-50%,calc(-50% - 6px * var(--s))) scale(2.3,1.5)}}
@keyframes ${P}-glint-twinkle{0%,12%{opacity:0;transform:translate(calc(-50% + var(--gx)),calc(-50% + var(--gy))) scale(.2) rotate(0deg)}26%{opacity:.82;transform:translate(calc(-50% + var(--gx)),calc(-50% + var(--gy))) scale(1.1) rotate(24deg)}44%{opacity:.5;transform:translate(calc(-50% + var(--gx)),calc(-50% + var(--gy) - 2px * var(--s))) scale(.85) rotate(52deg)}70%,100%{opacity:0;transform:translate(calc(-50% + var(--gx)),calc(-50% + var(--gy) - 4px * var(--s))) scale(.4) rotate(70deg)}}
@keyframes ${P}-drip-fall{0%{opacity:0;transform:translate(0,-40%) scale(.6)}18%{opacity:.95;transform:translate(0,0) scale(1)}70%{opacity:.9;transform:translate(0,calc(16px * var(--s))) scale(1.05,1.25)}100%{opacity:0;transform:translate(0,calc(22px * var(--s))) scale(.8,1.5)}}

/* ---------- knob: the DeepSeek whale ----------
   The round puck is gone. The knob is now the official logo — the same WHALE
   path the agent-team mark draws — MIRRORED so the animal faces right, i.e.
   looks the way the fill travels. The POSITIONING box stays the puck's 25px
   (KNOB_D), so the travel, the pointer maths and the spout's anchor are
   untouched: its centre, not its box, still sits on the value
   (RAIL_INSET/RAIL_H). The GLYPH is drawn larger than that box (v1.2.12): its
   height is the knob's own diameter, KNOB_WHALE_H = KNOB_D = 25, so the logo is
   1.5px taller than the 22px fill and overhangs the groove above and below — the
   slug rides ON the bar instead of sitting in it, and the round knob's full
   diameter is what the eye still measures the mark against. Width follows the
   logo's ratio, KNOB_WHALE_W = 34.27, so it overhangs the 25px box by 4.64px on
   each side (flex centres it). Filled only, one path, no stroke — a
   hairline outline smears and fattens the tail flukes into a blob. The two drop
   shadows are what keep a white whale legible over BOTH halves it straddles: the
   coloured fill under its left side and the pale track it overhangs on its
   right. White on blue is also the logo's own colourway (blue tile, white
   whale), so the knob still reads as the brand rather than as a dot. */
.${P}-knob{position:absolute;left:calc(${RAIL_INSET}px + (100% - ${RAIL_H}px)*var(--${P}-pos,0));top:50%;width:${KNOB_D}px;height:${KNOB_D}px;display:flex;align-items:center;justify-content:center;color:var(--${P}-knob,#ffffff);pointer-events:none;z-index:3;transform:translate(-50%,-50%);transition:left .18s cubic-bezier(.2,.9,.25,1);will-change:left;filter:var(--${P}-knobFilter,drop-shadow(0 .5px .6px rgba(0,0,0,.55)) drop-shadow(0 1px 2px rgba(0,0,0,.28)))}
/* v1.2.12: the glyph is taller than the bar and WIDER than the track by its own
   ratio, so it overhangs the 22px bar top and bottom by 4px (v1.2.13 took it from
   25 to 30px) and the 25px flex box left and right by 8px. That overhang is the
   request, not an accident: the red line in the user's zoom measured the OLD round
   knob's diameter, and the whale has to read bigger than the thing it replaced. */
.${P}-knobWhale{display:block;flex:none;height:${KNOB_WHALE_H}px;width:${KNOB_WHALE_W}px;overflow:visible}
/* Body path, filled only (v1.2.15). The mark is the same WHALE silhouette the
   team button draws, mirrored so the animal faces the way the fill travels, and
   painted in currentColor. The logo's own openings - the eye, the ventral patch,
   the sliver between fin and flank - are cut out of the path data, so the body
   itself never paints inside them. */
.${P}-knobWhaleBase{fill:currentColor;stroke:none}
/* v1.2.16/17/18: the two openings the user ringed - the eye and the ventral
   patch - are a flat wash instead of a window onto the rail. The colour walked
   pale blue #c7dbff (1.2.16) -> deep blue #1e40af (1.2.17) -> the RAIL'S OWN
   TRACK colour (1.2.18, "改成滑动条的底色的颜色"): --cmes-track is stamped on the
   rail element per level and inherited here, so the inlay re-tints with the bar
   instead of being a fixed hue. This rule paints just those two opening
   subpaths (WHALE_OPENINGS), UNDER the body, so the body covers everything
   except them and the wash is visible exactly there. The pupil
   dot is its own hole in the body data too, so it is drawn LAST in ink rather
   than under the body: painting it under would blend its antialiased edge
   against the page instead of against the wash and leave a pale rim. The same
   hairline survives even on top, because the body's hole edge and the dot's own
   edge are two separate antialiased curves - hence the same-colour stroke,
   which fattens the dot by half a unit and swallows the seam. No gradient, no
   motion, no opacity - a hole is a colour now, not a flow. The wash is
   var() driven so a later palette can retint it without touching the geometry. */
.${P}-knobWhaleOpening{fill:var(--${P}-knobHole,var(--${P}-track,#e8e7e8));stroke:none}
.${P}-knobWhalePupil{fill:currentColor;stroke:currentColor;stroke-width:1;stroke-linejoin:round}
/* PRESS DEFORMATION: holding swells the puck slightly, letting go eases back.
   Scale only, and the transform origin is the knob's own centre, so its layout
   box — the thing the pointer maths reads — never moves. */
.${P}-rail.dragging{cursor:grabbing}
.${P}-rail.dragging .${P}-knob{transform:translate(-50%,-50%) scale(1.045);transition:none}
.${P}-noeffort{position:absolute;top:${RAIL_TOP}px;left:12px;right:12px;text-align:center;font-size:12px;line-height:${RAIL_H}px;color:var(--dsw-alias-label-secondary)}
/* Commit failure / catalog error. Used to be four inline styles on the node;
 * it is a class so the colour comes from the theme, not from a frozen var. */
.${P}-status{position:absolute;left:12px;right:12px;bottom:6px;text-align:center;font-size:12px;line-height:16px;color:var(--dsw-alias-state-error-primary)}
@media (prefers-reduced-motion:reduce){
  /* everything that loops stops moving; the Ultra material parks at its end
     stop instead of sweeping, and the spout is pure decoration so it is removed
     rather than slowed (a slow jet rising out of the whale reads as a fault) */
  .${P}-ultra,.${P}-ultraHaze,.${P}-flow,.${P}-flow>i,.${P}-bubble,.${P}-tex,.${P}-swell,.${P}-podw,.${P}-aurora>i{animation:none}
  .${P}-ultra{background-position:0 0,100% 0%}
  .${P}-ultraHaze{opacity:1}
  .${P}-aurora>i{opacity:.6;transform:translateX(0)}
  .${P}-spout{display:none}
  .${P}-rail.dragging .${P}-knob{transform:translate(-50%,-50%) scale(1.03);transition:none}
}

/* ---------- model pane: two-level drill-down ----------
   Page 1 lists providers (each with the currently selected model name on the
   right + a chevron); clicking one slides page 2 in — that provider's models
   with a search box and a back button. This replaces the earlier
   collapsible-group list, which had a contradictory open/closed state model.
   Geometry follows the reference implementation (panel 272 wide, provider row
   41, model row 39, list max-height 252). */
/* Issue 2 fix: the pane is anchored with bottom:0 but no top, so its height is
   content-driven. That made the models pane's height:100% resolve to auto, the
   whole flex chain lost its definite height, and a long provider list simply
   overflowed the popover and got clipped with nothing to scroll. Pinning top:0
   gives the pane a definite height so min-height:0 on the descendants can
   actually hand the leftover space to the row list. */
.${P}-models{top:0;height:100%;padding:10px;overflow:hidden;display:flex;flex-direction:column}
.${P}-viewport{position:relative;overflow:hidden;transition:height .3s cubic-bezier(.32,.72,.28,1);flex:1 1 auto;min-height:0}
/* Each page is a full-height flex column so its inner list can scroll.
   Without this the page is content-sized and the LAST row gets clipped by the
   viewport's overflow:hidden with no way to scroll to it (issue 2). */
.${P}-page{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;transition:transform .3s cubic-bezier(.32,.72,.28,1)}
.${P}-page.slot1{transform:translateX(0)}
.${P}-page.slot2{transform:translateX(100%)}
.${P}-viewport.view2 .${P}-page.slot1{transform:translateX(-100%)}
.${P}-viewport.view2 .${P}-page.slot2{transform:translateX(0)}
/* page 1's provider list needs its OWN scroller: the reference learned that a
   clipped provider row is unreachable because page 1 has no scroll container. */
.${P}-rows{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 2px 4px}
.${P}-row{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:transparent;border:0;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.5;padding:10px;border-radius:10px;cursor:pointer;text-align:left;user-select:none}
.${P}-row:hover,.${P}-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
/* Issue 1: a small blue dot marks the provider that holds the CURRENT model,
   so the active group is visible without opening every provider. It is the
   second item (after the name), so it sits at the right end of the row. */
.${P}-rowDot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--${P}-accent,#3a83f7);box-shadow:0 0 0 3px var(--${P}-accentHalo,rgba(58,131,247,.16))}
/* The provider row is name + dot + chevron: the name absorbs the free space,
   which pushes the dot and the chevron to the right edge. */
.${P}-rowName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-rowChev{width:11px;height:11px;flex:none;color:var(--dsw-alias-label-tertiary,#9aa0ab)}
/* Both pages of the drill-down share this header: a 26px back button plus the
   page title (the section name on page 1, the provider on page 2). Its height is
   2 + 26 + 8 = 36, which is what the JS height model calls HEAD_H. */
.${P}-head{flex:none;display:flex;align-items:center;gap:6px;padding:2px 4px 8px}
.${P}-back{width:26px;height:26px;flex:none;display:grid;place-items:center;background:transparent;border:0;border-radius:8px;color:var(--dsw-alias-label-tertiary,#9aa0ab);cursor:pointer}
.${P}-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.${P}-back svg{width:12px;height:12px}
.${P}-title{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-search{flex:none;display:flex;align-items:center;gap:8px;margin:0 4px 6px;padding:7px 10px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-interactive-bg-hover));border-radius:10px}
.${P}-search svg{width:13px;height:13px;flex:none;color:var(--dsw-alias-label-caption,#7c8290)}
.${P}-search input{flex:1 1 auto;min-width:0;background:transparent;border:0;outline:0;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.${P}-list{flex:1 1 auto;min-height:0;overflow-y:auto;max-height:252px;overscroll-behavior:contain;padding:0 2px 4px}
.${P}-model{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:transparent;border:0;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:1.5;padding:9px 10px;border-radius:9px;cursor:pointer;text-align:left;user-select:none}
.${P}-model:hover,.${P}-model:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.${P}-modelName{display:flex;align-items:center;gap:6px;min-width:0}
.${P}-modelName>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-model.na .${P}-modelName>span:first-child{color:var(--dsw-alias-label-tertiary,#9aa0ab)}
.${P}-cnt{flex:none;font-size:10.5px;color:var(--dsw-alias-label-caption,#7c8290);background:var(--dsw-alias-interactive-bg-hover);border-radius:6px;padding:1px 6px}
.${P}-model.na .${P}-cnt{color:var(--dsw-alias-state-warn-label,#6b5b4a)}
.${P}-ck{width:15px;height:15px;flex:none;color:var(--dsw-alias-label-primary);opacity:0}
.${P}-model.sel .${P}-ck{opacity:1}
.${P}-empty{color:var(--dsw-alias-label-tertiary,#9aa0ab);font-size:13px;padding:14px 10px;text-align:center}
.${P}-failure{border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger,rgba(229,72,77,.12));color:var(--dsw-alias-state-error-primary,#e5484d);font-size:12px;line-height:1.6;padding:4px 8px;margin:0 2px 3px;word-break:break-word}
.${P}-sr{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

/* ---------- dark theme ----------
   DSH toggles data-ds-dark-theme on <body>; only the static chrome below
   needs a palette swap, because the fills, inks and track are stamped per
   level in JS from the EFFORT_*_DARK tables. Surfaces, borders and labels
   already come from --dsw-alias-* tokens, which flip on their own.
   Values follow the shipped dark tokens:
     label-primary #f9fafb | business #7aaaff | bg-layer-1 #232324 */
body[data-ds-dark-theme] .${P}-root{
  /* the whale stays white: the colour the knob inherits in dark (#2c2c2e)
     would sink into the #232324 track and the logo would disappear */
  --${P}-knob:#f9fafb;
  /* one soft halo instead of the light theme's two shadows — white on a dark
     track already reads, it only needs to sit off the glass card behind it */
  --${P}-knobFilter:drop-shadow(0 1px 2px rgba(0,0,0,.55));
  /* accents lift to the shipped dark business/peak hues */
  --${P}-accent:#7aaaff;
  --${P}-accentPeak:#c39bff;
  --${P}-accentHalo:rgba(122,170,255,.20);
  /* the quota warning's ink is NOT set here: it is stamped inline per theme
     from the ladder's top rung (see the warning div), so the light card gets
     the Max word's navy and this dark card gets the legible lift of that hue */
  /* the dark twin, matched to the live host: the wallpaper engine's glass
     colour is set to navy #0d1524 for BOTH themes and its alpha is 0.19, which
     is exactly what its panes composite to. The sheer white sheen is the same
     gradient (a card, not a sidebar); only the lift and the text shadow get
     heavier so the words still sit off a bright wallpaper patch. */
  --${P}-panel:#232324;
  --${P}-panelEdge:rgba(255,255,255,.10);
  --${P}-panelLift:0 16px 40px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.30);
  --${P}-glassTint:13,21,36;
  --${P}-glassAlpha:.19;
  --${P}-glassHighlight:rgba(255,255,255,.32);
  --${P}-glassHairline:rgba(255,255,255,.09);
  --${P}-glassLift:0 12px 40px rgba(0,0,0,.28);
  --${P}-glassText:0 1px 2px rgba(0,0,0,.55),0 0 14px rgba(0,0,0,.32);
}
`;

    /* ------------------------------------------------------------------ *
     * Icons (hand-drawn paths for the popover; no third-party assets)
     * The two glyphs INSIDE the composer trigger — the data mark and the
     * trailing chevron — come from DSH_GLYPH below instead: they have to
     * match the host's own selector, not merely evoke it.
     * ------------------------------------------------------------------ */
    const ICON = {
      chevron: 'm9 18 6-6-6-6',
      /* A back affordance must point BACK (left in LTR). The pane headers used
       * the forward chevron above, so every "back" button read as "go deeper". */
      chevronLeft: 'm15 18-6-6 6-6',
      check: 'm20 6-11 11-5-5',
      reset: 'M3 11a9 9 0 1 1 2.6 7M3 4v7h7',
      close: 'M6 6l12 12M18 6L6 18',
      search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
    };

    /* ------------------------------------------------------------------ *
     * The host's OWN icon set, for the two glyphs that sit inside the
     * composer seat. Copied verbatim out of the shipped sprite in
     * dsh-web-frontend (the `data-outline` and `chevron-down-outline`
     * entries of its glyph map): 16x16 viewBox, `regular` weight =
     * stroke-width 1, intrinsic size 16 for data and 14 for the chevron.
     *
     * Why not the hand-drawn paths in ICON above? Inside the composer the
     * trigger sits next to dsh's own selects, and the seat has an icon-only
     * state the host switches on itself (opening a sidebar narrows the
     * control row far enough to stamp --dsh-composer-model-icon-display).
     * In that state the plugin has to read as the host's model control, so
     * it draws the host's glyph at the host's size rather than a 24-unit
     * look-alike.
     * ------------------------------------------------------------------ */
    const DSH_GLYPH = {
      data: {
        size: 16,
        paths: [
          /* the stacked-platter body (filled, like the shipped sprite) */
          { d: 'M7.8667 0.349609C8.96906 0.349634 10.0601 0.481272 11.0317 0.735352C11.9973 0.987845 12.8453 1.362 13.4644 1.84766C14.0744 2.32629 14.507 2.95539 14.5161 3.69336H14.5171V8.53516C14.0843 8.32076 13.6108 8.17679 13.1108 8.11816C13.1831 7.96848 13.2162 7.82856 13.2163 7.70312V5.76758C12.6269 6.16618 11.8739 6.47995 11.0317 6.7002C10.0602 6.95423 8.96896 7.08494 7.8667 7.08496C6.76461 7.08493 5.67411 6.95415 4.70264 6.7002C3.85994 6.48006 3.10694 6.1662 2.51709 5.76758V7.70312L2.521 7.78418C2.56374 8.19554 2.93361 8.74414 3.91357 9.23145C4.9281 9.73585 6.35004 10.0371 7.8667 10.0371C8.26373 10.0371 8.6543 10.0141 9.03271 9.97461C8.75596 10.3799 8.54664 10.8349 8.42041 11.3232C8.23666 11.3313 8.0518 11.3369 7.8667 11.3369C6.20108 11.3369 4.57025 11.01 3.33447 10.3955C3.04163 10.2499 2.76658 10.0836 2.51709 9.90039V11.6738C2.51728 12.1379 2.88589 12.7556 3.92236 13.292C4.93457 13.8157 6.35342 14.1289 7.8667 14.1289C8.12318 14.1289 8.37694 14.1161 8.62646 14.0986C8.82021 14.5535 9.08999 14.9682 9.41943 15.3271C8.91285 15.3934 8.39149 15.4287 7.8667 15.4287C6.19761 15.4287 4.56379 15.0869 3.32568 14.4463C2.11244 13.8185 1.21649 12.8562 1.21631 11.6738V3.76367C1.21595 3.74853 1.21438 3.733 1.21436 3.71777C1.21436 2.96917 1.65103 2.33053 2.26807 1.84668C2.88747 1.36112 3.73675 0.987685 4.70264 0.735352C5.67413 0.481376 6.76457 0.349636 7.8667 0.349609ZM7.8667 1.65039C6.86269 1.65042 5.88326 1.77028 5.03076 1.99316C4.17183 2.2176 3.50421 2.52956 3.06982 2.87012C2.65043 3.19909 2.52622 3.48898 2.51709 3.69336V3.74414C2.52719 3.94845 2.65185 4.23772 3.06982 4.56543C3.50425 4.90601 4.17172 5.21795 5.03076 5.44238C5.88326 5.66527 6.8627 5.78513 7.8667 5.78516C8.8707 5.78513 9.85015 5.66525 10.7026 5.44238C11.5611 5.21787 12.2286 4.9049 12.6626 4.56445C13.0982 4.22252 13.2163 3.9231 13.2163 3.71777L13.2104 3.63574C13.1818 3.43623 13.044 3.16941 12.6626 2.87012C12.2286 2.52957 11.5614 2.21773 10.7026 1.99316C9.85009 1.77025 8.8708 1.65041 7.8667 1.65039Z', fill: 'currentColor' },
          /* the settings notch on the platter corner (stroked) */
          { d: 'M12.8936 10.0361L13.2061 10.5566C13.2296 10.5959 13.2651 10.6562 13.3027 10.707C13.3469 10.7666 13.4148 10.8431 13.5195 10.9023C13.6244 10.9617 13.725 10.9801 13.7988 10.9873C13.8619 10.9934 13.9318 10.9932 13.9775 10.9932H14.6162L14.8896 11.4502L14.5947 11.9443C14.5698 11.9859 14.5312 12.0483 14.5029 12.1084C14.4781 12.1611 14.4514 12.2312 14.4395 12.3164L14.4326 12.4072L14.4395 12.4971C14.4514 12.5825 14.4781 12.6532 14.5029 12.7061C14.5312 12.7661 14.5689 12.8287 14.5938 12.8701L14.8896 13.3633L14.6162 13.8213H13.9775C13.9318 13.8213 13.8619 13.821 13.7988 13.8271C13.7433 13.8326 13.6728 13.8442 13.5967 13.875L13.5195 13.9121C13.4148 13.9714 13.3469 14.0478 13.3027 14.1074C13.265 14.1583 13.2296 14.2186 13.2061 14.2578L12.8936 14.7783H12.3115L11.999 14.2578C11.9755 14.2186 11.9401 14.1583 11.9023 14.1074C11.8693 14.0628 11.823 14.0083 11.7578 13.959L11.6855 13.9121L11.6074 13.875C11.5316 13.8445 11.4615 13.8325 11.4062 13.8271C11.3432 13.821 11.2733 13.8213 11.2275 13.8213H10.5889L10.3135 13.3633L10.6104 12.8701C10.6352 12.8287 10.6739 12.7661 10.7021 12.7061C10.7352 12.6357 10.7724 12.534 10.7725 12.4072C10.7724 12.2804 10.7352 12.1788 10.7021 12.1084C10.6739 12.0483 10.6353 11.9859 10.6104 11.9443L10.3135 11.4502L10.5889 10.9932H11.2275C11.2733 10.9932 11.3432 10.9934 11.4062 10.9873C11.4801 10.9801 11.5808 10.9616 11.6855 10.9023C11.7903 10.843 11.8582 10.7666 11.9023 10.707C11.94 10.6562 11.9755 10.5959 11.999 10.5566L12.3115 10.0361H12.8936Z', stroke: 'currentColor', 'strokeMiterlimit': 10 },
        ],
      },
      chevronDown: {
        size: 14,
        paths: [{ d: 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6', stroke: 'currentColor' }],
      },
    };

    /* ------------------------------------------------------------------ *
     * Agent-team mark — three of the OFFICIAL DeepSeek whales, different
     * sizes, partially overlapping in a triangle: the lead on top, two
     * members below-left and below-right. The path and view box are the
     * shipped logo (FISH_LOGO_PATH, 23.16 x 17.04, from
     * @deepseek-ai/dsh-client-ui-primitives) reused verbatim, so the mark is
     * the real one rather than a redraw of it.
     *
     * One <path> per whale with its own transform, filled and unstroked: any
     * hairline outline would smear into the neighbours at the 20px the button
     * gives us, which is exactly what made the first version look blurry.
     * ------------------------------------------------------------------ */
    const WHALE = "M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z";
    /* [x, y, scale] in a 24x24 box — an upright triangle that CONVERGES on the
     * middle: SMALL on top, LARGE lower-left, MEDIUM lower-right, all three
     * overlapping around (12, 11) instead of ringing a hollow centre.
     *
     *   large   1.40..15.30 x  8.80..19.02   scale .60   (13.90 x 10.22)
     *   small  10.20..17.15 x  5.20..10.31   scale .30   ( 6.95 x 5.11)
     *   medium 12.60..22.33 x 10.00..17.16   scale .42   ( 9.73 x 7.16)
     * All three share the strip x 12.60..15.30, y 10.00..10.31 — the apex sits in
     * the crook between the two others, so they overlap in the middle while each
     * keeps its own eye and flank. The large one is 1.43x the medium.
     *
     * The large one is deliberately 1.38x the medium (13.43 vs 9.73 units wide)
     * so the size difference is obvious rather than suggestive. Filled only —
     * no strokes, no seams — so it stays the official silhouette. */
    const WHALE_TRIO = [[1.4, 8.8, 0.6], [10.2, 5.2, 0.3], [12.6, 10.0, 0.42]];
    function teamMark(cls) {
      return h('svg', { className: cls, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: 'false' },
        WHALE_TRIO.map(([x, y, k], i) => h('path', {
          key: i, d: WHALE,
          transform: `translate(${x} ${y}) scale(${k})`
        })));
    }

    /* ------------------------------------------------------------------ *
     * The knob's whale — the same shipped path, turned around.
     *
     * The official mark swims LEFT (head low-left, flukes up-right), which is
     * what the wordmark wants but the wrong way round for a slider: the fill
     * grows rightwards, so the knob should look that way. Two details make the
     * mirror exact rather than approximate:
     *
     *   1. WHALE_BOX is the path's OWN bounding box, measured from the path
     *      data (-0.2229..23.1738 x -0.0263..17.0396), not the round 0 0 23.16
     *      17.04 the wordmark uses. Using the tight box means the whale fills
     *      the 25px knob exactly instead of carrying the logo's own margins,
     *      which at this size would shrink it to a smudge.
     *   2. reflect = bboxMinX + bboxMaxX = 22.9509. translate() by that, then
     *      scale(-1 1), maps every x to 22.9509 - x — the glyph lands back
     *      inside its own box, centred, with nothing clipped at either edge.
     *
     * Filled, unstroked, single path: identical treatment to the team mark, so
     * both marks stay the real silhouette. -------------------------------- */
    const WHALE_BOX = { x: -0.2229, y: -0.0263, w: 23.3967, h: 17.0659 };
    /* toFixed so the emitted transform is a clean `translate(22.9509 0)` and not
     * the float tail 22.950899999999998 the subtraction can leave behind */
    const WHALE_REFLECT = (WHALE_BOX.x * 2 + WHALE_BOX.w).toFixed(4);   // 22.9509
    /* v1.2.16 - THE OPENINGS GET A COLOUR. WHALE is a single <path> built from
     * four subpaths: the outline, then the ventral patch, the pupil dot and the
     * eye. Split them here so the knob can paint exactly the two openings the
     * user ringed - the ventral patch and the eye - as a flat pale blue wash, and
     * the pupil dot separately in the ink colour. Both go UNDER the body: the
     * body's own winding then covers everything else, so a hole becomes simply a
     * colour and no clip, mask or evenodd is involved. */
    const WHALE_SUBS = WHALE.match(/M[^M]*/g) || [];
    const WHALE_OPENINGS = `${WHALE_SUBS[1] || ''}${WHALE_SUBS[3] || ''}`;
    const WHALE_PUPIL = WHALE_SUBS[2] || '';
    /* v1.2.15 - THE KNOB IS A PLAIN SILHOUETTE AGAIN. The interior treatment
     * (the bar's gradient clipped to the openings, plus the masked spark layer
     * and their whole <defs>) is removed: this builds one mirrored <path> and
     * nothing else. No ids are generated any more, because there is nothing left
     * to reference - which also retires the per-instance uid that existed only so
     * two mounted popovers could not share one clip.
     *
     * The mirror is unchanged and still exact: translate by the bbox sum
     * (WHALE_REFLECT), then scale(-1 1), so every x maps to 22.9509 - x and the
     * glyph lands centred inside its own box with nothing clipped at either edge.
     */
    function knobWhale(cls) {
      const mirror = `translate(${WHALE_REFLECT} 0) scale(-1 1)`;
      return h('svg', {
        className: cls,
        viewBox: `${WHALE_BOX.x} ${WHALE_BOX.y} ${WHALE_BOX.w} ${WHALE_BOX.h}`,
        preserveAspectRatio: 'xMidYMid meet',
        'aria-hidden': true, focusable: 'false'
      },
      h('path', { className: `${P}-knobWhaleOpening`, d: WHALE_OPENINGS, transform: mirror }),
      h('path', { className: `${P}-knobWhaleBase`, d: WHALE, transform: mirror }),
      h('path', { className: `${P}-knobWhalePupil`, d: WHALE_PUPIL, transform: mirror }));
    }

    /** One of the pod whales that trail the knob under agent teamwork.
     *
     *  Same glyph and same mirror, body path only: at 22px and 15px the openings
     *  and the pupil collapse into noise, and the outline plus its stroke is
     *  what still reads as a whale at that size. Rendered inside the knob, so
     *  they inherit its position and can never drift from it. */
    function podWhale(cls, key) {
      const mirror = `translate(${WHALE_REFLECT} 0) scale(-1 1)`;
      return h('svg', {
        key,
        className: cls,
        viewBox: `${WHALE_BOX.x} ${WHALE_BOX.y} ${WHALE_BOX.w} ${WHALE_BOX.h}`,
        preserveAspectRatio: 'xMidYMid meet',
        'aria-hidden': true, focusable: 'false'
      }, h('path', { className: `${P}-podBase`, d: WHALE, transform: mirror }));
    }
    function icon(name, cls) {
      return h('svg', {
        className: cls || `${P}-icon`, viewBox: '0 0 24 24', 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round'
      }, h('path', { d: ICON[name] || ICON.chevron }));
    }

    /* Draws one of DSH_GLYPH's entries exactly the way the host draws its own
     * icons: 16-unit viewBox, `regular` weight (stroke-width 1), intrinsic
     * width=height=size. Inside the composer seat this makes the trigger
     * pixel-identical to dsh's model control instead of merely similar. */
    function dshIcon(name, cls) {
      const glyph = DSH_GLYPH[name];
      return h('svg', {
        className: cls, viewBox: '0 0 16 16',
        width: glyph.size, height: glyph.size,
        fill: 'none', strokeWidth: 1, 'aria-hidden': true, focusable: 'false'
      }, glyph.paths.map((path, i) => h('path', { key: i, ...path })));
    }

    /* ------------------------------------------------------------------ *
     * Slider sub-layers — the three animated layers of the power slider.
     *
     * They are pure functions of the ratio (stars) or of a burst counter (spout),
     * and every offset comes from the module's deterministic tables, so a
     * re-render mid-animation cannot reshuffle a starfield or a spout
     * already in flight.
     * ------------------------------------------------------------------ */

    /** Depth of a lane, 0 at the top of the fill and 1 at the bottom. Near lanes
     *  are thicker, brighter and faster than far ones, which is what gives the
     *  water its perspective instead of reading as an even field of specks. */
    function depthOf(row) {
      return clamp01((row.y - 8) / 84);
    }

    /* Extra pace per level, sampled continuously so a bar with two levels or
     * fourteen levels still lands somewhere sensible. High is the level that
     * visibly works harder (1.32x); Max settles back to 1.06x because its water
     * is the thickest, and pushing it faster reads as turbulence, not effort. */
    const TIER_FLOW = [1, 1, 1.32, 1.06];
    function tierRateFor(index, total) {
      const last = TIER_FLOW.length - 1;
      const t = total <= 1 ? 0 : clamp01(index / (total - 1));
      const x = t * last;
      const i = Math.min(last - 1, Math.floor(x));
      const k = x - i;
      return TIER_FLOW[i] + (TIER_FLOW[i + 1] - TIER_FLOW[i]) * k;
    }

    /** Water flow: thin filaments sliding right to left through the fill.
     *
     *  Replaces the old star dust outright — no dots, no glow, no box-shadow.
     *  A filament is a 26..74px gradient whose both ends fade out, blurred a
     *  quarter pixel, bobbing +/-1.2px on its own clock; the lane it rides
     *  sweeps across the fill. Depth drives size, brightness and pace, so the
     *  near water races ahead of the far water.
     *
     *  At the top level a few bubbles ride the same lanes (the one element of
     *  the old "material" language that stayed): 1-2 per lane, rising and
     *  fading, small enough to be a read of "this water is boiling", not confetti.
     *
     *  The teamwork boost is NOT applied here (v1.2.20): applyFlowRate doubles
     *  the rail's playbackRate instead, so the flip never re-phases a filament
     *  mid-flight. */
    function WaterFlow({ ratio, index, total, peak }) {
      const count = starCountFor(ratio);
      if (count <= 0) return null;
      const speed = starSpeed(ratio);
      const tierRate = tierRateFor(index, total);
      /* No container-level opacity: each filament already carries its own
         (0.45 + depth*0.5), and multiplying a second ramp on top dimmed the
         whole layer until the water read as haze instead of flow. */
      return h('div', {
        className: `${P}-water`,
        'aria-hidden': true
      }, STAR_ROWS.slice(0, count).map((row) => {
        const depth = depthOf(row);
        const chrono = starDurationFor(row.index, speed) / (0.78 + 0.44 * depth) / tierRate;
        const bob = 1.3 + starHash(row.index, 83) * 1.2;
        const ds = 0.8 + depth * 0.6;
        const kids = [];
        /* Two filaments on most lanes: a second line 40-90px behind, 1.35x slower
         * and jittered +-2.5px across the rail. One line per lane reads as a set of
         * parallel scratches; two overlapping ones read as flowing water. */
        const lines = starHash(row.index, 47) > 0.55 ? 2 : 1;
        for (let k = 0; k < lines; k += 1) {
          kids.push(h('i', {
            key: `f${k}`,
            className: `${P}-fil`,
            style: {
              [`--${P}-ds`]: ds.toFixed(2),
              [`--${P}-fw`]: (26 + depth * 22 + starHash(row.index + k, 43) * 26).toFixed(1) + 'px',
              marginLeft: k ? (40 + starHash(row.index, 53) * 50).toFixed(1) + 'px' : undefined,
              marginTop: ((starHash(row.index + k * 5, 61) - 0.5) * 5).toFixed(1) + 'px',
              opacity: (0.45 + depth * 0.5).toFixed(2),
              animationDuration: (bob * (k ? 1.35 : 1)).toFixed(2) + 's',
              animationDelay: (-starHash(row.index + k * 7, 31) * bob).toFixed(2) + 's'
            }
          }));
        }
        if (starHash(row.index, 68) > 0.45) {
          kids.push(h('i', {
            key: 'wisp',
            className: `${P}-wisp`,
            style: {
              [`--${P}-wl`]: (12 + starHash(row.index, 73) * 18).toFixed(1) + 'px',
              marginLeft: (8 + starHash(row.index, 79) * 56).toFixed(1) + 'px',
              marginTop: ((starHash(row.index, 83) - 0.5) * 6).toFixed(1) + 'px',
              animationDuration: (bob * 1.6).toFixed(2) + 's',
              animationDelay: (-starHash(row.index, 89) * bob).toFixed(2) + 's'
            }
          }));
        }
        if (peak) {
          const bubbles = 1 + (starHash(row.index, 101) > 0.55 ? 1 : 0);
          for (let k = 0; k < bubbles; k += 1) {
            /* a <b>, not an <i>: the lane's own `> i` rule would win against a
             * plain class and hand the bubble the filament's gradient */
            kids.push(h('b', {
              key: `b${k}`,
              className: `${P}-bubble`,
              style: {
                marginLeft: (6 + starHash(row.index * 5 + k, 103) * 74).toFixed(1) + 'px',
                animationDuration: (1.1 + starHash(row.index + k, 107) * 1.1).toFixed(2) + 's',
                animationDelay: (-starHash(row.index + k, 109) * 2.1).toFixed(2) + 's'
              }
            }));
          }
        }
        return h('div', {
          key: row.index,
          className: `${P}-flow`,
          style: {
            top: row.y.toFixed(1) + '%',
            animationDuration: chrono.toFixed(2) + 's',
            animationDelay: starDelayFor(row.index, row.phase, chrono).toFixed(2) + 's'
          }
        }, kids);
      }));
    }

    /** The top tier's material: swept gradient, breathing haze, aurora veils. */
    function UltraLayer() {
      return h('div', { className: `${P}-ultra`, 'aria-hidden': true },
        h('div', { className: `${P}-ultraHaze` }),
        h('div', { className: `${P}-aurora` },
          h('i', { className: 'a1' }),
          h('i', { className: 'a2' }),
          h('i', { className: 'a3' }),
          h('i', { className: 'a4' })));
    }

    /** One-shot blowhole spout out of the knob. Re-keyed per burst by the caller.
     *  Layer order is depth order: light and ground-wash first (halo, backwash,
     *  shock ring all sit BEHIND the water and only lift what is already there),
     *  then the column and its filaments, then the air above it (crown, chuff,
     *  drift mist, glints), then the hole's own bubbles, and finally the heavy
     *  drip and the eleven droplets in front of everything. */
    function SpoutBurst({ knobLeft }) {
      return h('div', {
        className: `${P}-spout`,
        style: {
          left: knobLeft,
          '--s': (SPOUT_SCALE * SPOUT_GAIN).toFixed(4),
          '--shx': (SPOUT_HOLE_X * SPOUT_SCALE).toFixed(2) + 'px',
          '--shy': (SPOUT_HOLE_Y * SPOUT_SCALE).toFixed(2) + 'px',
          '--dur': SPOUT_DURATION + 'ms',
          '--delay': SPOUT_START_DELAY + 'ms'
        },
        'aria-hidden': true
      },
      h('span', { className: `${P}-halo` }),
      h('span', { className: `${P}-bwash` }),
      h('span', { className: `${P}-shock` }),
      h('span', { className: `${P}-plume` }),
      h('span', { className: `${P}-jet j2` }),
      h('span', { className: `${P}-jet j3` }),
      h('span', { className: `${P}-jet j1` }),
      h('span', { className: `${P}-thread t1` }),
      h('span', { className: `${P}-thread t2` }),
      h('span', { className: `${P}-thread t3` }),
      h('span', { className: `${P}-crown` }),
      h('span', { className: `${P}-puff` }),
      h('span', { className: `${P}-fan l` }),
      h('span', { className: `${P}-fan r` }),
      h('span', { className: `${P}-mist m1` }),
      h('span', { className: `${P}-mist m2` }),
      h('span', { className: `${P}-glint g1` }),
      h('span', { className: `${P}-glint g2` }),
      h('span', { className: `${P}-glint g3` }),
      h('span', { className: `${P}-burble b1` }),
      h('span', { className: `${P}-burble b2` }),
      h('span', { className: `${P}-drip` }),
      SPOUT_DROPS.map((spec, i) => h('span', {
        key: i,
        className: `${P}-drop`,
        style: spoutDropStyle(spec)
      })));
    }

    /* ------------------------------------------------------------------ *
     * Agent teamwork — the toggle's single source of truth.
     *
     * This button used to be a visual-only "Fast" switch with its own
     * localStorage flag. It now drives the host's real Team mode, so the state
     * belongs to the Session, not to this plugin: the Host keeps it in the
     * `agentTeam` projection and `remote.agentTeams.setEnabled()` writes it.
     * Reading the projection means two surfaces (this button and the shipped
     * Team row in the model menu) can never disagree, and a conversation
     * switch needs no bookkeeping here at all.
     *
     * `teamWant` is the optimistic value while a save is in flight: the click
     * paints immediately, the projection catches up, and a rejection drops the
     * optimistic value so the button snaps back to what the Host reported.
     * ------------------------------------------------------------------ */
    function teamStateOf(projection) {
      return projection !== null && typeof projection === 'object' && projection.enabled === true;
    }

    /* ------------------------------------------------------------------ *
     * Measurement — ONE definition of "the box we are laid out in".
     *
     * The popover's `left`/`bottom` and the teamwork tooltip's `left`/`top`
     * are both `position: fixed`, and both are resolved against whatever
     * containing block the host's composer establishes — the viewport unless
     * the composer claims that role (see the probe's CSS note). Measuring
     * through the same probe is what keeps the two layers agreeing; before
     * this they each had their own copy of the logic and drifted apart.
     * ------------------------------------------------------------------ */
    function controlBoxOf(probe) {
      if (probe) {
        const box = probe.getBoundingClientRect();
        if (box.width > 0 || box.height > 0) return box;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      return { left: 0, top: 0, right: w, bottom: h, width: w, height: h };
    }
    /* `innerWidth` includes the classic scrollbar; clientWidth is the width
     * actually drawn, so clamping to it keeps a card off the scrollbar
     * instead of under it. */
    function viewportSize() {
      return {
        w: document.documentElement.clientWidth || window.innerWidth,
        h: document.documentElement.clientHeight || window.innerHeight
      };
    }
    /** Fraction of stop `i` on a ladder of `total` stops (0 when flat). */
    function stopFractionOf(i, total) {
      return total > 1 ? i / (total - 1) : 0;
    }
    /** Stand-in for the seat's `useProjection` when a host omits it. */
    function noProjection() {
      return null;
    }

    /* ================================================================== *
     * Selector component
     * ================================================================== */
    /* The `renderSlot` prop is deliberately NOT used here.
     *
     * `renderSlot('conversation.input.model.label', …)` is only legal for an
     * entry that DECLARES that child slot, and that child belongs to the
     * shipped `@deepseek-ai/dsh-client-ui-model-selection` entry. Declaring it
     * here as well is what killed the official registration and made the model
     * selector disappear from the composer when this plugin was switched off
     * (incident 20). The renderer only builds a `renderSlot` binding for an
     * entry that declares children, so with no `children` in our registration
     * the prop is simply absent — which is exactly what we want. */
    function Selector({ directory, load, select, available, locked, t, sessionId, setTeam, useProjection }) {
      /* The store callbacks MUST be stable. Inline arrows here gave
       * `useSyncExternalStore` a new `subscribe` on every render, and React
       * responds to a changed subscribe identity by tearing the subscription
       * down and rebuilding it — one subscribe/unsubscribe round trip per
       * render, i.e. per pointermove during a drag. */
      const subscribe = useCallback(fn => directory.subscribe(fn), [directory]);
      const snapshot = useCallback(() => directory.getSnapshot(), [directory]);
      const state = useSyncExternalStore(subscribe, snapshot);

      const [open, setOpen] = useState(false);
      const [pane, setPane] = useState('effort');
      /* Team mode comes from the Host: the `agentTeam` projection is the single
       * source of truth, so this button and the shipped Team row always agree.
       * `useProjection` is a standard prop of this seat; the no-op fallback
       * keeps the hook call unconditional — branching around a hook call is a
       * hook-order violation, and a host that passes the prop late would have
       * crashed the seat. */
      const project = typeof useProjection === 'function' ? useProjection : noProjection;
      const teamProjection = project('agentTeam');
      const hostTeamOn = teamProjection === undefined || teamProjection === null ? null : teamStateOf(teamProjection);
      /* last value this button asked for; paints before the projection catches
       * up, and is dropped again if the Host rejects the change */
      const [teamWant, setTeamWant] = useState(null);
      const [teamSaving, setTeamSaving] = useState(false);
      const teamOn = teamWant !== null ? teamWant : hostTeamOn === true;
      const [preview, setPreview] = useState(null);
      const [dragging, setDragging] = useState(false);
      /* the header line currently taking over the level word, or null.
       * A KEY, not a boolean: the line is not always about the tier (see
       * flash() — today only the teamwork toggle raises it). */
      const [message, setMessage] = useState(null);
      const [error, setError] = useState('');
      const [busy, setBusy] = useState(false);
      const [query, setQuery] = useState('');
      const [highlight, setHighlight] = useState(0);
      /* tooltip visibility is state now, not `:hover` CSS: the tooltip has to
       * live OUTSIDE the popover to escape the backdrop-filter containing block,
       * so it is no longer a descendant of the ⚡ button and no descendant
       * selector can reach it (see the CSS block for the full diagnosis). */
      const [tipOn, setTipOn] = useState(false);
      /* Bumped when the knob ARRIVES on the top tier. It re-keys the spout
       * layer, so each arrival remounts the burst and its CSS replays from zero
       * instead of resuming a finished animation; `spoutOn` drops the layer
       * again once the flourish is over. */
      const [spout, setSpout] = useState(0);
      const [spoutOn, setSpoutOn] = useState(false);
      /* Two-level drill-down (replaces the old collapsible-group list).
       * `view` is 1 (provider list) or 2 (that provider's models). */
      const [view, setView] = useState(1);
      const [subProvider, setSubProvider] = useState(null);
      /* Free height above the trigger, in px, as measured by align(). It is
       * STATE because the model list's cap has to be known while rendering:
       * reading `--cmes-avail` back out of the DOM during render forced a style
       * recalculation on EVERY render — including every preview change of a
       * drag — for a number that only changes on open / resize / scroll. */
      const [avail, setAvail] = useState(0);

      const rootRef = useRef(null);
      const popupRef = useRef(null);
      const probeRef = useRef(null);
      const railRef = useRef(null);
      const triggerRef = useRef(null);
      const searchRef = useRef(null);
      const tipRef = useRef(null);
      const teamBtnRef = useRef(null);
      const previewRef = useRef(null);
      const dragRef = useRef(false);
      /* which pointerId owns the active drag (multi-pointer safety) */
      const pointerRef = useRef(null);
      const busyRef = useRef(false);
      const pendingRef = useRef(null);
      const mountedRef = useRef(true);
      const timersRef = useRef([]);
      /* The stop index of the last committed render, for the gesture code that
       * runs OUTSIDE a render (pointerup without coordinates, a lost capture).
       * Assigned in a layout effect, never during render: concurrent rendering
       * may throw a render away, and a listener would then read a tree that
       * never reached the screen. */
      const indexRef = useRef(0);
      /* The rail's rect, frozen for the duration of a drag. A pointermove must
       * not re-measure: `getBoundingClientRect()` on every move is a layout
       * read per frame, and the rail cannot move under a held pointer anyway
       * (a scroll or resize clears this cache via align()). */
      const railBoxRef = useRef(null);
      /* Coalesced paint: the newest pointer x, and the frame that will apply it */
      const moveXRef = useRef(null);
      const frameRef = useRef(0);
      /* The fraction paintLive() last wrote, or null when no drag is live.
       * React re-renders during a drag (the preview changes level), and the
       * rail's inline `--cmes-pos` used to be rewritten from the SNAPPED
       * fraction on each of those renders — which is what made the knob jump to
       * the next stop under the pointer instead of tracking it. The style now
       * writes THIS value while dragging, so React and paintLive agree. */
      const liveFracRef = useRef(null);
      /* The latest closures for the document-level listeners, which are
       * attached once per gesture and must not capture a stale render. */
      const handlersRef = useRef({});
      /* The index the popover last showed, so the spout/sweep fires on the
       * ARRIVAL transition only — not on every render that happens to sit at
       * the top tier. */
      const seenIndexRef = useRef(null);

      /* Clear the optimistic value as soon as the projection agrees, so the
       * button is driven by the Host from then on (and a change made from the
       * shipped Team row shows up here too). */
      useEffect(() => {
        if (teamWant !== null && hostTeamOn === teamWant) setTeamWant(null);
      }, [teamWant, hostTeamOn]);

      /* One click flips the host's Team mode. The click paints immediately
       * (`teamWant`), the save runs through `remote.agentTeams.setEnabled`, and
       * a rejection snaps the button back and surfaces the reason on the
       * popover's own status line rather than a toast. */
      function toggleTeam() {
        if (disabled) return;
        const next = !teamOn;
        setTeamWant(next);
        setTeamSaving(true);
        setError('');
        const settle = result => {
          setTeamSaving(false);
          if (result !== undefined && result !== null && result.ok === false) {
            setTeamWant(null);
            setError(`${t('teamFailed')}：${result.error?.message ?? ''}`.trim());
            return;
          }
          /* only the ON direction: switching back off costs nothing, and a line
           * there would be noise. Fired AFTER the Host confirms, so the warning
           * can never outlive a toggle that failed. */
          if (next) flash('warning');
        };
        let pending;
        try {
          pending = typeof setTeam === 'function' ? setTeam(next) : undefined;
        } catch (failure) {
          settle({ ok: false, error: { message: String(failure) } });
          return;
        }
        if (pending && typeof pending.then === 'function') {
          pending.then(settle, failure => settle({ ok: false, error: { message: String(failure) } }));
        } else {
          settle(pending);
        }
      }

      /* ---------- derive catalog state ---------- */
      const selection = state.pending || state.current;
      const groups = state.groups || [];
      const group = groups.find(g => g.id === selection?.provider);
      const model = group?.models.find(m => m.id === selection?.model);
      const efforts = sortEfforts(model?.reasoning?.efforts);
      const savedEffort = selection?.reasoningEffort ?? model?.reasoning?.defaultEffort;
      const displayed = preview ?? savedEffort;
      const index = Math.max(0, efforts.findIndex(e => e.id === displayed));
      const fraction = stopFractionOf(index, efforts.length);
      /* The collapsed seat shows the level word too, so it needs the same
       * ratio — solved from the SAVED effort, never the preview one: the seat
       * must not follow a drag that has not been committed. */
      const savedIndex = Math.max(0, efforts.findIndex(e => e.id === savedEffort));
      const savedFraction = stopFractionOf(savedIndex, efforts.length);
      /* Ultra styling keys on the *id*, never on "is the last stop" — otherwise
       * a two-level model (light/high) would paint its top stop violet. */
      const peak = isPeakId(displayed);
      /* Per-theme palette: every fill/ink/track value below is picked for the
       * active theme, so a live theme switch re-colours without a remount. */
      const dark = useDarkTheme();
      const modelName = model?.name || selection?.model || t('choose');
      const disabled = Boolean(locked || !available);
      /* Ultra styling keys on the id, never on "is the last stop" — that is
       * what `peak` already encodes; the slider reads the same flag. */
      const tipShown = tipOn && open && pane === 'effort';

      /* A render must not write to a ref: with concurrent rendering React may
       * throw a render away, and the listeners would then read values from a
       * tree that never reached the screen. */
      useLayoutEffect(() => {
        indexRef.current = index;
      });

      /* `load` comes from the seat's `inject(sessionId)`, which rebuilds its
       * return value — and therefore this prop — on every render. Keying the
       * effect on `load` meant "load the catalog" ran on EVERY render, so a
       * drag that changed the preview re-fetched the catalog at 60Hz. */
      const loadRef = useRef(load);
      useLayoutEffect(() => { loadRef.current = load; });
      useEffect(() => {
        if (available) loadRef.current?.();
      }, [available]);
      /* Teamwork flow boost (v1.2.20): keep every animation running inside the
       * rail at TEAM_FLOW, without touching durations, delays or keyframes.
       * Runs on the bit flip and on `peak` (the Ultra stack mounts then, so its
       * animations are born after the flip). `animationstart` covers the rest:
       * a starfield rebuilt by a ratio change, or a veil restarting, re-asserts
       * the rate the moment it begins — in capture phase because the event
       * bubbles from the animated child, not from the rail itself. */
      useEffect(() => {
        const rail = railRef.current;
        if (!rail) return undefined;
        applyFlowRate(rail, teamOn);
        const onStart = () => applyFlowRate(rail, teamOn);
        rail.addEventListener('animationstart', onStart, true);
        return () => rail.removeEventListener('animationstart', onStart, true);
      }, [teamOn, peak]);

      /* Place the Fast tooltip above its button.
       * Two corrections have gone into this function. The layer must live
       * OUTSIDE the popover (the popover's backdrop-filter clips it), and its
       * coordinates — like the popover's — are resolved against whatever
       * containing block the host's composer establishes, not the viewport, so
       * they are converted through the same probe (see `controlBox`). */
      function positionTip() {
        const tip = tipRef.current;
        const btn = teamBtnRef.current;
        if (!tip || !btn) return;
        /* The probe stretched over the containing block gives the origin these
         * fixed coordinates are measured from (the viewport, unless the host's
         * composer claims the role — see the probe's CSS note). */
        const box = controlBoxOf(probeRef.current);
        const r = btn.getBoundingClientRect();
        const tw = tip.offsetWidth || 120;
        const th = tip.offsetHeight || 44;
        const vw = viewportSize().w;
        const left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, vw - tw - 8));
        const top = Math.max(8, r.top - th - 7);
        tip.style.left = `${left - box.left}px`;
        tip.style.top = `${top - box.top}px`;
      }

      /* ---------- effects ---------- */
      useEffect(() => {
        mountedRef.current = true;
        return () => {
          mountedRef.current = false;
          timersRef.current.forEach(clearTimeout);
        };
      }, []);

      /* The tooltip is measured AFTER it is in the DOM. Positioning it in the
       * hover handler was a second, hidden defect: on the very first hover the
       * layer had never been laid out, so `offsetWidth/offsetHeight` fell back
       * to the placeholder numbers and the card was placed with a guessed size
       * and guessed height. A layout effect always sees real metrics. */
      useLayoutEffect(() => {
        if (!tipShown) return;
        positionTip();
        const settle = () => positionTip();
        window.addEventListener('resize', settle);
        document.addEventListener('scroll', settle, true);
        return () => {
          window.removeEventListener('resize', settle);
          document.removeEventListener('scroll', settle, true);
        };
      }, [tipShown]);

      /* the tooltip must never outlive the state that anchors it */
      useEffect(() => {
        if (!open || pane !== 'effort') setTipOn(false);
      }, [open, pane]);

      /* TIER ARRIVAL — fires on the transition INTO the top tier while the
       * popover is open. A drag, a track click, `End`, or the reset button all
       * funnel through `index`, so every route to the top fires the flourish
       * exactly once. Opening the popover already parked at the top must NOT
       * fire, which is why the first observed index of each open is only
       * recorded. `spoutOn` is cleared after SPOUT_TOTAL so the layer does not
       * linger (and cannot be replayed by an unrelated re-render). */
      useEffect(() => {
        if (!open) {
          seenIndexRef.current = null;
          /* the dismissal timer is cleared by this effect's cleanup, so a close
           * that interrupts a burst would otherwise leave the layer mounted */
          setSpoutOn(false);
          return;
        }
        if (seenIndexRef.current === null) { seenIndexRef.current = index; return; }
        const arrived = peak && seenIndexRef.current !== index;
        seenIndexRef.current = index;
        /* leaving the top tier drops the (already faded) layer immediately, so
         * it is never left mounted with a single-shot animation that has
         * finished and can no longer be seen */
        if (!arrived) { if (!peak) setSpoutOn(false); return; }
        setSpout(n => n + 1);
        setSpoutOn(true);
        const timer = setTimeout(() => setSpoutOn(false), SPOUT_TOTAL);
        return () => clearTimeout(timer);
      }, [index, open, peak]);

      /* THE GESTURE IS OWNED BY THE DOCUMENT, not by the rail.
       *
       * Pointer capture alone is not a reliable owner: it is dropped whenever
       * the capturing element is replaced, the press starts a native drag or a
       * text selection, the pointer leaves the window, or the browser decides to
       * take the gesture away (all of which fire `pointercancel` /
       * `lostpointercapture`). When that happens the rail simply stops hearing
       * `pointermove` and the drag freezes mid-way — reported as "按住拖到一半
       * 就变成无法选中".
       *
       * So while a drag is live we listen on the DOCUMENT in the capture phase.
       * Capture-phase listeners on the document see every pointer event
       * regardless of capture retargeting, so the drag keeps tracking the
       * pointer even if the rail itself never receives the event. The rail keeps
       * no move handler of its own, so each pointermove is applied exactly
       * once. */
      useEffect(() => {
        if (!dragging) return undefined;
        const owns = e => pointerRef.current === null || e.pointerId === pointerRef.current;
        /* `handlersRef` — not the closures of the render that flipped
         * `dragging` — because these listeners outlive it: a long drag
         * re-renders many times, and a captured `index`/`efforts` would go
         * stale under the pointer. */
        const move = e => { if (owns(e) && dragRef.current) handlersRef.current.move(e.clientX); };
        const up = e => { if (owns(e) && dragRef.current) handlersRef.current.finish(e); };
        const cancel = e => { if (owns(e) && dragRef.current) handlersRef.current.cancel(); };
        /* A release outside the window never reaches the document; focus loss is
         * the only signal we get, and the gesture must not stay latched. */
        const blur = () => { if (dragRef.current) handlersRef.current.finish(); };
        document.addEventListener('pointermove', move, true);
        document.addEventListener('pointerup', up, true);
        document.addEventListener('pointercancel', cancel, true);
        window.addEventListener('blur', blur);
        return () => {
          document.removeEventListener('pointermove', move, true);
          document.removeEventListener('pointerup', up, true);
          document.removeEventListener('pointercancel', cancel, true);
          window.removeEventListener('blur', blur);
        };
      }, [dragging]);

      /* One-shot header line: for 1800ms the level word and the two tools give
       * the slot to a single sentence.
       *
       * WHO RAISES IT (v1.2.28): the teamwork toggle, not the peak tier. The two
       * costs are not the same kind of fact — a peak tier is a visible, per-turn,
       * self-inflicted choice that already has the loudest feedback in this
       * plugin (ultra material, aurora, the spout), while teamwork multiplies
       * spend 3~4x across turns and says so ONLY in a hover tooltip. A transient
       * line is state-change grammar, and a toggle is the state change. */
      function flash(key) {
        if (!key) return;
        timersRef.current.forEach(clearTimeout);
        setMessage(key);
        timersRef.current = [setTimeout(() => { if (mountedRef.current) setMessage(null); }, 1800)];
      }
      function showEffort(id) {
        previewRef.current = id;
        setPreview(id);
      }

      async function commit(next) {
        if (disabled || !next) return;
        /* BUG FIX (issue 6, deeper cause): a second commit while one was in
         * flight was silently DROPPED (`if busyRef.current return`), so a fast
         * drag-then-release could leave the UI showing a level that was never
         * submitted. Instead we coalesce: remember the newest intent and run it
         * once the current request settles, so the last choice always wins. */
        pendingRef.current = next;
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError('');
        try {
          while (pendingRef.current) {
            const want = pendingRef.current;
            pendingRef.current = null;
            const result = await select(want);
            if (result && !result.ok) throw new Error(result.error?.message || t('failed'));
            if (result === undefined) throw new Error(t('unavailable'));
          }
        } catch (cause) {
          pendingRef.current = null;
          if (mountedRef.current) setError(cause?.message || t('failed'));
        } finally {
          busyRef.current = false;
          if (mountedRef.current) {
            setBusy(false);
            setPreview(null);
            previewRef.current = null;
          }
        }
      }

      function chooseEffort(id) {
        if (!selection || disabled || !efforts.some(e => e.id === id)) return;
        showEffort(id);
        if (id !== savedEffort) void commit({ ...selection, reasoningEffort: id });
        else { previewRef.current = null; setPreview(null); }
      }

      /* What "重置为默认" should land on.
       *
       * `defaultEffort` is OPTIONAL in the host's catalog projection: the
       * session controller only emits it when the provider resolves one
       * (`...(resolved.reasoning.defaultEffort === undefined ? {} : …)`), and
       * the Trae adapter only forwards it when the UPSTREAM model advertises
       * `default_reasoning_effort` — most models advertise their level list but
       * no default. So `model.reasoning` can exist with `efforts` but WITHOUT
       * `defaultEffort`.
       *
       * The reset button used to call `chooseEffort(defaultEffort)`
       * unconditionally, and `chooseEffort` refuses an id that is not a
       * declared stop — so with no default the click was a silent no-op that
       * read as "重置默认只有 DeepSeek 那个组好用，其他组点了没反应".
       *
       * One definition of "default" for the whole plugin: the provider's
       * declared default when it is a real declared stop, otherwise the middle
       * stop — the same rule `chooseModel` already applies when landing on a
       * model with no history. That also covers a provider whose declared
       * default is not among the stops it advertises.
       */
      function defaultStopId() {
        if (!efforts.length) return undefined;
        const declared = model?.reasoning?.defaultEffort;
        if (declared !== undefined && efforts.some(e => e.id === declared)) return declared;
        return efforts[Math.floor(efforts.length / 2)].id;
      }

      function resetToDefault() {
        if (disabled) return;
        const id = defaultStopId();
        if (id === undefined) return;      // nothing to reset to (no levels)
        chooseEffort(id);
      }

      function chooseModel(providerId, nextModel) {
        /* NOT gated on `busyRef`. commit() coalesces, so picking a model while
         * a reasoning-level commit is still in flight supersedes it instead of
         * being silently swallowed (the "click does nothing" symptom). */
        if (disabled) return;
        const same = selection?.provider === providerId && selection?.model === nextModel.id;
        /* Middle level on switch (reference rule): floor(n/2). A model with no
         * declared levels gets a payload with NO `reasoningEffort` key at all —
         * absent means "no opinion", which is not the same as an explicit null. */
        const levels = sortEfforts(nextModel.reasoning?.efforts);
        const mid = levels.length ? levels[Math.floor(levels.length / 2)].id : undefined;
        const id = same ? savedEffort : mid;
        setPane('effort');
        setView(1);
        setSubProvider(null);
        setQuery('');
        timersRef.current.forEach(clearTimeout);
        setMessage(null);
        setPreview(null);
        previewRef.current = null;
        void commit({
          provider: providerId, model: nextModel.id,
          ...(id === undefined ? {} : { reasoningEffort: id })
        });
      }

      function close() {
        cancelDrag();
        setOpen(false);
        setQuery('');
        /* BUG FIX (issue 2): the pane must be reset on close. The popover's
         * height is driven by `--${P}-height`, which is 104px for the effort
         * pane but the (taller) list height for the model pane. Leaving
         * `pane === 'models'` meant reopening animated the height from the list
         * height back down to 104px — the visible "panel retracts from above"
         * flicker. Resetting here also matches the original app, which always
         * opens on the effort pane. The drill-down state resets with it. */
        setPane('effort');
        setView(1);
        setSubProvider(null);
        setHighlight(0);
        triggerRef.current?.focus({ preventScroll: true });
      }

      /* Escape backs out one layer at a time, matching the reference:
       * page 2 -> page 1 -> effort pane -> closed. */
      function backOutOneLayer() {
        if (pane === 'models') {
          if (view === 2) goBack();
          else { setPane('effort'); setQuery(''); }
        } else close();
      }

      /* ---------- positioning + outside click + Escape ---------- */
      useLayoutEffect(() => {
        if (!open) return;
        let frame = 0;
        /* Both listeners only forward: the handlers themselves live in
         * `handlersRef`, so they always run the CURRENT closures without this
         * effect re-attaching on every state change. */
        function outside(event) {
          if (!rootRef.current?.contains(event.target)) handlersRef.current.close();
        }
        function escape(event) {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          handlersRef.current.escapeBack();
        }
        function align() {
          const trigger = triggerRef.current?.getBoundingClientRect();
          if (!trigger || !popupRef.current || !rootRef.current) return;
          /* The box the popover's `left`/`bottom` are measured against. Not
           * necessarily the viewport: see the probe's CSS note. Reading it
           * instead of assuming is the whole fix — the popover and the tooltip
           * both used to be offset by the composing seat's own origin. */
          const box = controlBoxOf(probeRef.current);
          const vp = viewportSize();
          const width = Math.min(272, vp.w - 24);
          const left = Math.max(12, Math.min((trigger.left + trigger.right - width) / 2, vp.w - width - 12));
          const gap = 8;
          /* bottom edge in viewport coordinates, then expressed in the control
           * box's own space, which is what `bottom:` resolves against. */
          const bottomEdge = trigger.top - gap;
          const bottom = box.bottom - bottomEdge;
          /* The CSS `max-height` cannot use `100vh` any more: `bottom` is
           * control-box relative now, so hand it the free space as state — the
           * menu height calculation reads it from there instead of forcing a
           * `getComputedStyle` on every render. */
          const free = Math.max(96, Math.min(bottomEdge - 24, vp.h - 24));
          const style = rootRef.current.style;
          style.setProperty(`--${P}-left`, `${left - box.left}px`);
          style.setProperty(`--${P}-bottom`, `${bottom}px`);
          style.setProperty(`--${P}-avail`, `${free}px`);
          /* The rail may have moved (scroll, resize). Drop the frozen drag rect
           * so the next pointermove re-measures instead of using a stale box. */
          railBoxRef.current = null;
          setAvail(free);
        }
        /* A resize can settle over the next frame (scrollbar reflow, the
         * composer growing). One deferred pass covers that; the old 500ms
         * per-frame loop kept running `align()` 30 times for a single gesture. */
        function resized() {
          cancelAnimationFrame(frame);
          align();
          frame = requestAnimationFrame(align);
        }
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape, true);
        window.addEventListener('resize', resized);
        document.addEventListener('scroll', align, true);
        align();
        return () => {
          document.removeEventListener('pointerdown', outside);
          document.removeEventListener('keydown', escape, true);
          window.removeEventListener('resize', resized);
          document.removeEventListener('scroll', align, true);
          cancelAnimationFrame(frame);
        };
      }, [open]);

      /* focus the search box when the model pane opens */
      useLayoutEffect(() => {
        if (open && pane === 'models' && searchRef.current) searchRef.current.focus({ preventScroll: true });
      }, [open, pane]);

      /* ---------- rail pointer math (shared by knob / fill / stars) ---------- */
      /* The knob CENTRE travels over [11, width-11] (11 = RAIL_H/2), so a
       * pointer maps to a 0..1 fraction over that same inset span.
       *
       * NOTE: there is deliberately no knobX()/px helper any more. The knob, the
       * fill and the spout layer all anchor on `--${P}-pos` inside `calc(...)`,
       * so nothing in the render path has to read layout or reflow. */
      function fractionAt(clientX) {
        const box = railBoxRef.current || railRef.current?.getBoundingClientRect();
        if (!box || box.width <= 2 * RAIL_INSET) return 0;
        return Math.max(0, Math.min(1, (clientX - box.left - RAIL_INSET) / (box.width - 2 * RAIL_INSET)));
      }
      function nearestIndex(clientX) {
        if (efforts.length < 2) return 0;
        /* A missing/non-numeric coordinate can only mean "no pointer position";
         * resolving it to the CURRENT stop keeps every caller on the ladder. */
        if (!Number.isFinite(clientX)) return Math.max(0, indexRef.current);
        return Math.round(fractionAt(clientX) * (efforts.length - 1));
      }

      /** Paint one rail variable, bypassing React. */
      function writeRail(name, value) {
        const rail = railRef.current;
        if (!rail) return;
        rail.style.setProperty(`--${P}-${name}`, value);
      }

      /* During a drag the knob tracks the pointer continuously (no snapping);
       * the value snaps only on release. Both the knob and the fill derive from
       * ONE unitless variable, `--${P}-pos` (0..1).
       *
       * `paintLive` writes the RAW fraction and records it in `liveFracRef`; the
       * rail's inline style writes that same recorded value while `dragging`
       * (see `railStyle`), so a re-render mid-drag — the preview level changes
       * on the way past a stop — cannot rewrite `--pos` with the SNAPPED
       * fraction and yank the knob onto the grid under the pointer.
       *
       * `snapLive` writes the snapped fraction back before we commit, so the
       * knob provably settles on a stop even when React BAILS OUT of the
       * re-render (releasing on the level already previewed is identical state,
       * which would otherwise leave the knob wherever the pointer stopped). */
      function paintLive(frac) {
        liveFracRef.current = frac;
        writeRail('pos', String(frac));
        writeRail('fillBg', fillBackground(frac));
        writeRail('fillBgDark', fillBackgroundDark(frac));
      }

      /** Force the knob onto a stop, bypassing React's bail-out. */
      function snapLive(i) {
        const frac = stopFractionOf(i, efforts.length);
        liveFracRef.current = null;
        writeRail('pos', String(frac));
        writeRail('fillBg', fillBackground(frac));
        writeRail('fillBgDark', fillBackgroundDark(frac));
      }

      /* ONE place applies a pointer position to the rail. Called by the press
       * and by the coalesced frame below, so both routes produce exactly the
       * same value (continuous, no snapping while down). */
      function applyPointer(clientX) {
        const frac = fractionAt(clientX);
        paintLive(frac);
        const i = Math.round(frac * (efforts.length - 1));
        const id = efforts[i]?.id;
        if (id && id !== previewRef.current) showEffort(id);
      }

      /* pointermove is delivered faster than the compositor paints (120Hz+
       * trackpads, coalesced synthetic moves). Painting each one restyled the
       * rail several times per frame for no visible gain, and each preview
       * change also re-rendered React. One frame is the right budget: keep the
       * newest x and let the next rAF apply it. */
      function queuePointer(clientX) {
        moveXRef.current = clientX;
        if (frameRef.current) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = 0;
          const x = moveXRef.current;
          moveXRef.current = null;
          if (x === null || !dragRef.current) return;
          applyPointer(x);
        });
      }
      function dropQueuedPointer() {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
        moveXRef.current = null;
      }

      function pointerDown(event) {
        /* Deliberately NOT gated on `busyRef`. An in-flight commit must never
         * make the rail ungrabbable — that was a large part of the "sometimes
         * I cannot grab it" symptom. Commits coalesce, so a drag started during
         * one simply supersedes it. Only a genuinely non-interactive rail
         * (disabled session / single level) refuses the gesture. */
        if (disabled || efforts.length < 2) return;
        /* Suppress the browser's own press-drag defaults (text selection, native
         * drag-and-drop). Those default actions are what fire `pointercancel`
         * and silently kill a drag mid-gesture — the "拖动中途变成无法选中" bug. */
        event.preventDefault();
        railRef.current?.focus({ preventScroll: true });
        /* Freeze the rail's rect for the whole gesture: it cannot move while a
         * pointer is held, and re-measuring on every move is a layout read per
         * frame. align() drops the cache whenever the layout really changes. */
        railBoxRef.current = railRef.current?.getBoundingClientRect() ?? null;
        /* Pointer capture is a convenience, NOT the mechanism: the gesture is
         * owned by the document listener below, so losing capture (or never
         * being granted it) can no longer strand a drag. */
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* non-fatal */ }
        dragRef.current = true;
        pointerRef.current = event.pointerId;
        setDragging(true);
        applyPointer(event.clientX);
      }

      function finish(event) {
        if (!dragRef.current) return;
        dragRef.current = false;
        pointerRef.current = null;
        dropQueuedPointer();
        railBoxRef.current = null;
        setDragging(false);
        /* Snapping to the nearest stop is what guarantees the knob SETTLES:
         * React's next render may be a bail-out (see snapLive). A release
         * WITHOUT coordinates (a synthesised pointerup, a lost capture, the
         * window-blur fallback) must resolve to the stop the knob is already
         * on — `nearestIndex(NaN)` would write `--pos: NaN` and throw the knob
         * across the track. */
        const known = event != null && Number.isFinite(event.clientX);
        const at = indexRef.current;
        const i = known ? nearestIndex(event.clientX) : at;
        snapLive(i);
        const target = efforts[i] ?? efforts[at];
        if (target) chooseEffort(target.id);
      }

      /* A cancelled drag rolls back to the last COMMITTED level (not a commit).
       * The knob must land on that stop too, for the same bail-out reason. */
      function cancelDrag() {
        if (!dragRef.current) return;
        dragRef.current = false;
        pointerRef.current = null;
        dropQueuedPointer();
        railBoxRef.current = null;
        setDragging(false);
        previewRef.current = null;
        setPreview(null);
        timersRef.current.forEach(clearTimeout);
        setMessage(null);
        /* back to the COMMITTED stop, not the preview stop `index` tracks */
        snapLive(savedIndex);
      }

      function keyDown(event) {
        let next = index;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next++;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next--;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = efforts.length - 1;
        else return;
        event.preventDefault();
        const i = Math.max(0, Math.min(efforts.length - 1, next));
        /* Keyboard moves already land on a stop, but snap explicitly so the
         * same bail-out cannot leave a stale position behind. */
        snapLive(i);
        const target = efforts[i];
        if (target) chooseEffort(target.id);
      }

      /* The document-level listeners read their handlers from here, so they
       * always run the CURRENT closures without re-attaching mid-gesture. */
      useLayoutEffect(() => {
        handlersRef.current = {
          move: queuePointer, finish, cancel: cancelDrag,
          close, goBack, escapeBack: backOutOneLayer
        };
      });

      /* ---------- model pane: two-level drill-down ---------- */
      /* The provider whose models page 2 is showing (null on page 1). */
      const activeProvider = subProvider === null
        ? null
        : groups.find(g => g.id === subProvider) ?? null;

      /* Page 2's rows, filtered by the query. Matching is the same
       * case-insensitive ordered-subsequence rule the shipped selector uses. */
      const providerModels = useMemo(() => {
        if (!activeProvider) return [];
        const q = query.trim().toLowerCase();
        if (!q) return activeProvider.models;
        return activeProvider.models.filter(m => {
          const name = (m.name || m.id).toLowerCase();
          if (name.includes(q)) return true;
          let i = 0;
          for (const ch of name) if (ch === q[i]) i++;
          return i === q.length;
        });
      }, [activeProvider, query]);

      /* Page 1 is a plain provider list; nothing to filter there. */
      const flatModels = useMemo(
        () => (activeProvider
          ? providerModels.map(m => ({ group: activeProvider, model: m }))
          : []),
        [activeProvider, providerModels]
      );

      function enterProvider(gid) {
        setSubProvider(gid);
        setQuery('');
        setHighlight(0);
        setView(2);
      }
      function goBack() {
        setView(1);
        setSubProvider(null);
        setQuery('');
        setHighlight(0);
      }

      /* A highlight carried over from the previous list would point at a row
       * that no longer exists after a filter — but resetting it from an effect
       * cost a second render per keystroke. Every route that changes the list
       * sets it directly instead (typing resets it here, navigation resets it
       * in enterProvider/goBack/close). */
      const onQuery = value => {
        setQuery(value);
        setHighlight(0);
      };

      function modelKeyDown(event) {
        const n = flatModels.length;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!n) return;
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          /* Clamp before wrapping: `highlight` can be -1 (nothing highlighted
           * yet, or a filtered list that shrank), and (-1 + 1) % n would land
           * on the wrong row while (-1 - 1) % n goes negative. */
          const at = Math.min(Math.max(highlight, 0), n - 1);
          setHighlight((at + delta + n) % n);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          const entry = flatModels[highlight];
          if (entry) chooseModel(entry.group.id, entry.model);
        } else if (event.key === 'Home') {
          event.preventDefault();
          if (n) setHighlight(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          if (n) setHighlight(n - 1);
        }
      }

      /* ---------- render ---------- */
      const currentLabel = efforts.length
        ? (effortLabel(efforts[index]) || t('effort'))
        : '';
      const triggerLabel = effortLabel(efforts.find(e => e.id === savedEffort));
      const status = error || (state.status === 'error' ? t('failed') : '');

      /* Height is computed from the rows actually rendered, so the popover fits
       * its content and shrinks while searching. Constants mirror the CSS
       * (provider row 41, model row 39, list cap 252, page head 36, search 40,
       * empty block 48) — the reference implementation learned the hard way that
       * a stale row height clips the last row with no way to scroll back. */
      const ROW_H = 41, MODEL_H = 39, LIST_MAX_H = 252, LIST_PAD_B = 4;
      const HEAD_H = 36, SEARCH_H = 40, EMPTY_H = 48, PAD = 20;
      const noticeRows = (state.failures?.length ?? 0);
      const noticeH = noticeRows > 0
        ? Math.min(noticeRows, 4) * 30 + (groups.length === 0 ? 8 : 4)
        : (groups.length === 0 ? EMPTY_H : 0);

      let menuHeight;
      if (view !== 2 || !activeProvider) {
        menuHeight = PAD + Math.max(44, HEAD_H + groups.length * ROW_H + noticeH);
      } else {
        const n = providerModels.length;
        const listH = n === 0
          ? EMPTY_H + LIST_PAD_B
          : Math.min(n * MODEL_H + LIST_PAD_B, LIST_MAX_H);
        menuHeight = PAD + Math.max(44, HEAD_H + SEARCH_H + listH);
      }

      /* Issue 2: cap the requested height to the space actually available above
       * the trigger, so a long provider list scrolls INSIDE the panel instead of
       * overflowing the window. `avail` is what align() measured for the control
       * box the popover is laid out in — deriving it again from `--cmes-bottom`
       * would repeat the old mistake of treating that offset as viewport-relative
       * (it is measured from the composing seat when the host makes it a
       * containing block). It is state, so this render never touches layout. */
      const roomAbove = avail > 0
        ? avail
        : (typeof window === 'undefined' ? Infinity : Math.max(120, window.innerHeight - 64));
      const cappedHeight = Math.min(menuHeight, roomAbove);

      const classes = [
        `${P}-popover`,
        !open ? 'closed' : '',
        peak ? 'peak' : '',
        message ? 'message' : ''
      ].filter(Boolean).join(' ');

      /* --- model pane: page 1 (providers) + page 2 (that provider's models) --- */
      const providerNodes = groups.map(g => {
        const isCurrent = selection?.provider === g.id;
        return h('button', {
          key: `p-${g.id}`,
          className: `${P}-row`,
          type: 'button',
          'aria-expanded': view === 2 && subProvider === g.id,
          onClick: () => enterProvider(g.id)
        },
          /* Issue 1: blue dot marks the provider that owns the current model.
           * It sits at the RIGHT end of the row (just before the chevron), so
           * it lands where the eye scans for row status. The provider's
           * currently selected model name used to sit there too; it is
           * deliberately gone (the second level already shows it), leaving
           * name + dot + chevron. */
          h('span', { className: `${P}-rowName` }, g.name),
          h('span', { className: `${P}-rowDot`, hidden: !isCurrent, 'aria-hidden': true }),
          icon('chevron', `${P}-rowChev`));
      });

      /* Failures are surfaced, not swallowed: after taking over the seat, the
       * shipped selector's per-provider failure list is ours to report too. */
      const noticeNodes = [];
      if (noticeRows > 0) {
        (state.failures || []).slice(0, 4).forEach((f, i) => {
          noticeNodes.push(h('div', {
            key: `f-${i}`, className: `${P}-failure`,
            title: f.message
          }, `${f.name} ${t('loadFailed')}: ${f.message}`));
        });
      } else if (groups.length === 0) {
        noticeNodes.push(h('div', { key: 'empty', className: `${P}-empty` },
          state.status === 'loading' ? t('loading') : t('empty')));
      }

      /* One pass builds the flat index, so a long provider list does not run a
       * linear `findIndex` per row (that was O(n²) inside the render). */
      const flatEntry = new Map();
      flatModels.forEach((entry, i) => flatEntry.set(entry.model.id, i));

      const modelNodes = providerModels.map(m => {
        const entry = flatEntry.get(m.id) ?? -1;
        const selected = selection?.provider === activeProvider?.id && selection?.model === m.id;
        const levelCount = sortEfforts(m.reasoning?.efforts).length;
        const levelText = levelCount ? `${levelCount} ${t('levels')}` : t('noLevels');
        return h('button', {
          key: `m-${m.id}`,
          className: `${P}-model${selected ? ' sel' : ''}${levelCount ? '' : ' na'}${entry === highlight ? ' hovered' : ''}`,
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': selected,
          'aria-busy': busy || undefined,
          title: levelText,
          /* same value = same render: React bails out, so sweeping the pointer
           * down a long list does not re-render the pane per row */
          onMouseEnter: () => setHighlight(h => (h === entry ? h : entry)),
          onClick: () => chooseModel(activeProvider.id, m)
        },
          h('span', { className: `${P}-modelName` },
            /* The catalog model name, rendered directly. We do NOT route this
             * through `renderSlot('conversation.input.model.label', …)`: that
             * child slot is declared by the shipped model-selection entry, and
             * claiming it here is what made the official selector disappear
             * when this plugin was switched off (incident 20). */
            h('span', null, m.name || m.id),
            h('span', { className: `${P}-cnt` }, levelText)),
          icon('check', `${P}-ck`));
      });
      if (activeProvider && !modelNodes.length) {
        modelNodes.push(h('div', { key: 'empty', className: `${P}-empty` }, t('noMatch')));
      }

      const modelsView = h('div', {
        className: `${P}-pane ${P}-models${pane !== 'models' ? ' hidden' : ''}`,
        role: 'menu', 'aria-label': t('model'),
        inert: pane !== 'models' ? '' : undefined,
        onKeyDown: modelKeyDown
      },
        h('div', {
          className: `${P}-viewport${view === 2 ? ' view2' : ''}`,
          'aria-hidden': false
        },
          /* page 1 — providers (own scroller so a long list is reachable) */
          h('div', { className: `${P}-page slot1` },
            /* Page 1 gets the same header shape as page 2: a back button that
             * leaves the model pane and returns to the effort pane (what Escape
             * already does from this level), then the page title. Without it the
             * only way back was Escape or clicking outside, which is
             * undiscoverable on a touch/keyboard-less pass through the menu. */
            h('div', { className: `${P}-head` },
              h('button', {
                type: 'button', className: `${P}-back`,
                'aria-label': t('back'), title: t('back'),
                onClick: () => { setPane('effort'); setQuery(''); }
              }, icon('chevronLeft', `${P}-iconSmall`)),
              h('span', { className: `${P}-title` }, t('model'))),
            h('div', { className: `${P}-rows` }, ...providerNodes, ...noticeNodes)),

          /* page 2 — models of the chosen provider */
          h('div', {
            className: `${P}-page slot2`,
            inert: view !== 2 ? '' : undefined
          },
            h('div', { className: `${P}-head` },
              h('button', {
                type: 'button', className: `${P}-back`,
                'aria-label': t('back'), title: t('back'),
                onClick: goBack
              }, icon('chevronLeft', `${P}-iconSmall`)),
              h('span', { className: `${P}-title` },
                activeProvider ? activeProvider.name : '')),
            h('label', { className: `${P}-search` },
              icon('search', `${P}-iconSmall`),
              h('input', {
                ref: searchRef, type: 'text', value: query,
                placeholder: t('search'), 'aria-label': t('search'),
                spellCheck: false,
                onChange: e => onQuery(e.target.value)
              })),
            h('div', { className: `${P}-list` }, ...modelNodes))));

      /* --- effort pane --- */
      const effortView = h('div', {
        className: `${P}-pane ${P}-main${pane !== 'effort' ? ' hidden' : ''}`,
        inert: pane !== 'effort' ? '' : undefined
      },
        h('button', {
          className: `${P}-tool ${P}-fast${teamOn ? ' active' : ''}`,
          ref: teamBtnRef,
          'aria-label': `${t('teamLabel')}${teamSaving ? ' (…)' : ''}`,
          'aria-pressed': teamOn,
          'aria-describedby': 'cmes-team-tip',
          /* The tooltip CANNOT be a child of this button: the popover's
           * backdrop-filter would make itself the containing block for a fixed
           * descendant and clip it away. It is rendered at the root (see the
           * return value) and revealed through `tipOn`. */
          onPointerEnter: () => setTipOn(true),
          onPointerLeave: () => setTipOn(false),
          onFocus: () => setTipOn(true),
          onBlur: () => setTipOn(false),
          onClick: toggleTeam
        },
          teamMark(`${P}-teamMark`)),

        h('button', {
          className: `${P}-modelLink`, onClick: () => setPane('models'),
          'aria-label': t('model'), title: modelName
        },
          h('span', { className: `${P}-heading` }, currentLabel || t('choose'), icon('chevron', `${P}-iconSmall`)),
          /* vendor prefix dropped here only — see stripVendor() */
          h('span', { className: `${P}-modelName` }, stripVendor(modelName))),

        /* Peak quota warning: its ink is the TOP rung of the same ladder the
         * level word uses (`effortInk(1, dark)`), so "deep blue" on the light
         * card is literally the Max word's own navy, and the dark card gets the
         * legible lift of that same hue instead of a navy that would vanish. */
        h('div', {
          className: `${P}-warning`,
          style: { [`--${P}-warnInk`]: effortInk(1, dark) }
        }, h('span', null, message ? t(message) : '')),

        h('button', {
          className: `${P}-tool ${P}-reset`,
          /* disabled only when there is genuinely nothing to reset to: the old
           * `!model?.reasoning` test left the button enabled-but-inert for the
           * common "efforts but no declared default" provider */
          disabled: busy || efforts.length === 0,
          'aria-label': t('reset'), title: t('reset'),
          onClick: resetToDefault
        }, icon('reset')),

        efforts.length
          ? h('div', {
              className: `${P}-rail${dragging ? ' dragging' : ''}${teamOn ? ' team' : ''}`,
              ref: railRef,
              /* Per-level colouring: the un-filled track is still tinted toward
               * the current level (railBase/trackFor), and the heading ink is
               * the SAME water, solved for contrast (v1.2.26).
               *
               * `live` is the fraction paintLive last wrote, or null between
               * gestures. Using it here is what makes "continuous while
               * dragging" actually hold: every re-render during a drag (the
               * preview level changes as the pointer crosses a stop) would
               * otherwise rewrite these variables from the SNAPPED `fraction`
               * and yank the knob onto the grid under the pointer. */
              style: (() => {
                const live = dragging ? liveFracRef.current : null;
                const pos = live ?? fraction;
                return {
                  [`--${P}-fill`]: fillFor(displayed, dark),
                  [`--${P}-fillBg`]: fillBackground(pos),
                  [`--${P}-fillBgDark`]: fillBackgroundDark(pos),
                  [`--${P}-track`]: trackFor(rgbToHex(waterDeepAt(pos, dark)), dark),
                  [`--${P}-ink`]: effortInk(pos, dark),
                  /* the pod is hidden while the knob sits at the far left, so the
                   * wake can never poke out of the card's edge */
                  [`--${P}-podfade`]: clamp01((pos - 0.02) / 0.11).toFixed(2),
                  /* one unitless fraction drives knob, fill, water and material */
                  [`--${P}-pos`]: pos
                };
              })(),
              role: 'slider', tabIndex: 0,
              'aria-label': t('effort'),
              'aria-valuemin': 0, 'aria-valuemax': efforts.length - 1,
              'aria-valuenow': index, 'aria-valuetext': currentLabel,
              'aria-disabled': busy || disabled,
              onPointerDown: pointerDown,
              onPointerUp: finish, onPointerCancel: cancelDrag,
              onKeyDown: keyDown
            },
              h('div', { className: `${P}-fill` },
                h('div', { className: `${P}-tex`, 'aria-hidden': true }),
                h('div', { className: `${P}-swell`, 'aria-hidden': true }),
                h(WaterFlow, { ratio: fraction, index, total: efforts.length, peak }),
                peak ? h(UltraLayer) : null),
              /* the blowhole spout: keyed on the arrival counter, so mounting a
               * new key restarts every layer from 0% */
              spoutOn
                ? h(SpoutBurst, {
                    key: `spout-${spout}`,
                    knobLeft: `calc(${RAIL_INSET}px + (100% - ${RAIL_H}px) * ${fraction})`
                  })
                : null,
              h('div', { className: `${P}-knob` },
                h('div', { className: `${P}-pod`, 'aria-hidden': true },
                  podWhale(`${P}-podw podMid`, 'podMid'),
                  podWhale(`${P}-podw podBig`, 'podBig')),
                knobWhale(`${P}-knobWhale`)))
          : h('div', { className: `${P}-noeffort` }, t('unsupported')));

      return h('div', { className: `${P}-root`, ref: rootRef },
        h('style', null, CSS),

        /* Stretched over the containing block the popover is laid out in, so its
         * rect tells align() where `left`/`bottom` are really measured from. */
        h('div', { className: `${P}-probe`, ref: probeRef, 'aria-hidden': true }),

        h('button', {
          className: `${P}-trigger${isPeakId(savedEffort) ? ' peak' : ''}${teamOn ? ' team' : ''}`,
          ref: triggerRef, disabled,
          'aria-label': `${modelName} ${triggerLabel}`.trim(),
          'aria-expanded': open, 'aria-haspopup': 'dialog', 'aria-busy': busy,
          /* the collapsed seat also shows the level colour (issue 3) */
          style: { [`--${P}-ink`]: effortInk(savedFraction, dark) },
          onClick: () => {
            if (open) close();
            else { setPane(model ? 'effort' : 'models'); setOpen(true); load(); }
          }
        },
          teamOn ? teamMark(`${P}-teamMark`) : null,
          /* Icon-only seat: the host's own data glyph at the host's own size.
           * This used to be a 24-unit hand-drawn layers path with no size rule,
           * which collapsed to nothing and left the seat showing a lonely
           * chevron whenever a sidebar narrowed the composer row. */
          h('span', { className: `${P}-compact` }, dshIcon('data', `${P}-compactIcon`)),
          /* The model name and the effort are SEPARATE flex children on purpose.
           * They used to share one truncating box, so a long model name — and
           * turning Fast on costs another ~21px of width for the ⚡ — pushed the
           * level label past the ellipsis and it vanished entirely. Splitting
           * them lets the NAME be the part that truncates while the level stays
           * legible: it is two characters, and it is the thing the user came to
           * read. `--dsh-composer-model-text-display` still hides both together
           * in the host's icon-only compact mode. */
          h('span', { className: `${P}-caption` },
            /* The catalog model name, rendered directly.
             *
             * This used to go through `renderSlot('conversation.input.model.label', …)`
             * so the shipped "1017" badge would decorate it. That child slot is
             * declared by the SHIPPED model-selection entry, and a child slot may
             * be declared by only ONE entry — declaring it here as well is what
             * threw the official registration away and made the model selector
             * vanish from the composer when this plugin was switched off
             * (incident 20). The badge is decoration; the selector itself is
             * the feature, so the selector wins. */
            modelName),
          triggerLabel
            ? h('span', { className: `${P}-triggerEffort` }, triggerLabel)
            : null,
          dshIcon('chevronDown', `${P}-chev`)),

        h('section', {
          className: classes, ref: popupRef, role: 'dialog',
          'aria-label': pane === 'models' ? t('model') : t('effort'),
          'aria-hidden': !open, inert: !open ? '' : undefined,
          style: {
            [`--${P}-height`]: `${pane === 'models' ? cappedHeight : 104}px`,
            /* the heading ink is stamped here so the effort pane's title picks
             * up the current level's water colour */
            [`--${P}-ink`]: effortInk(fraction, dark)
          }
        },
          modelsView,
          effortView,
          busy ? h('div', { className: `${P}-sr`, role: 'status' }, t('busy')) : null,
          status ? h('div', { className: `${P}-status`, role: 'alert' }, status) : null),

        /* THE TEAM TOOLTIP — a sibling of the popover, NOT a descendant of it.
         * The popover's backdrop-filter makes it the containing block for fixed
         * descendants and its `overflow:hidden` then clips them, which is why
         * hovering used to reveal nothing at all. `.cmes-root` has no
         * transform/filter, so `position:fixed` here is viewport-relative and
         * nothing clips it. It is portalled no further than this wrapper, which
         * keeps it inside the plugin's own tree (no react-dom dependency). */
        h('span', {
          role: 'tooltip', id: 'cmes-team-tip',
          className: `${P}-tip${tipShown ? ' show' : ''}`,
          ref: tipRef, 'aria-hidden': tipShown ? undefined : 'true'
        },
          h('span', { className: `${P}-tipTitle` }, t('tokenCost')),
          h('span', null, t('teamHint'))));
    }

    /* ================================================================== *
     * Plugin
     * ================================================================== */
    return {
      /* `remote` / `remote.session` are NOT optional here, and they are not
       * "already provided by modelDirectories".
       *
       * `ctx.modelDirectories.directoryFor(sessionId)` is implemented by the
       * shipped `ModelDirectoryResolver`, whose `directoryFor()` reaches for
       * `this.ctx.remote.session`. Cordis validates that access against the
       * CALLER's inject list, not the service's own — so calling directoryFor()
       * from a plugin that has not itself injected `remote.session` throws:
       *
       *   slot entry crashed in 'conversation.input.model':
       *   Error: cannot get property "remote.session" without inject
       *
       * The throw happens inside the seat's `inject(sessionId)`, i.e. on every
       * render of the composer seat, which takes the entry down and leaves the
       * popover unopenable. The shipped selector declares exactly these two, so
       * we mirror its contract. */
      inject: ['slots', 'modelDirectories', 'sessions', 'locale', 'remote', 'remote.session', 'remote.agentTeams'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }));
        ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
          name: 'conversation.input.model',
          locale: NS,
          /* NO `children` HERE — AND THAT IS DELIBERATE. See incident 20.
           *
           * `conversation.input.model.label` is a CHILD SLOT, and a child slot
           * may be declared by exactly ONE entry: the registry throws
           * `slot "..." is already declared (by ...)` for the second declarer
           * (SlotCore.register, shipped in dsh-web-frontend's bundle).
           *
           * The shipped `@deepseek-ai/dsh-client-ui-model-selection` declares
           * that child. So does this plugin — and whoever registers SECOND
           * throws. We register first (this package is a dynamic bundle with
           * `immediately: true`), which means the SHIPPED entry's registration
           * threw and it never reached the ledger. The seat was therefore held
           * by this plugin alone, and when the plugin was switched off the
           * seat became EMPTY: the model selector vanished from the composer
           * and the official one could not come back, because it had never
           * been registered in the first place.
           *
           * Declaring the child is also what made the renderer hand us a
           * `renderSlot` binding (the renderer only builds it when the entry
           * declares children, and it authorizes only keys in THIS entry's own
           * children table). We do not own that child — the shipped entry owns
           * it — so we must not declare it, and we must not call `renderSlot`
           * for it. We render the catalog model name directly instead.
           *
           * The cost is the shipped "1017" badge, which decorates the model
           * name: while this plugin holds the seat, the badge is not drawn.
           * That is a cosmetic loss, and it is the only outcome that keeps the
           * official selector alive across an uninstall. */
          priority: -1,
          inject(sessionId) {
            const directory = ctx.modelDirectories.directoryFor(sessionId);
            const available = ctx.sessions.subagentAddress(sessionId) === undefined;
            return {
              available,
              sessionId,
              directory: directory.store,
              load: () => { if (available) directory.load().catch(() => {}); },
              select: sel => (available ? directory.select(sel) : Promise.resolve(undefined)),
              /* Team mode is a Host setting on the Session; this is the ONLY
               * writer this button needs. The result is `{ ok, error? }` and is
               * reported back to the popover's status line verbatim. */
              setTeam: enabled => ctx.remote.agentTeams.setEnabled(sessionId, enabled)
            };
          }
        }, Selector));
      }
    };
  }
});
