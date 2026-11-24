#!/usr/bin/env python3
"""Wrap an offscreen render in a fake DSH window so the popover has something
to sit on (liquid glass is invisible against a flat colour).

Usage (from the plugin root):

  node render.mjs high x dev/preview-high.html
  python site/make-shots.py dev/preview-high.html site/demo-high.html

  # feature close-up: no chat bubbles, smaller stage
  python site/make-shots.py dev/preview-high.html site/demo-feat.html \
      --size 560x420 --chat none --left 144 --bottom 158

  # dark twin
  python site/make-shots.py dev/preview-dark.html site/demo-dark.html --dark

Then screenshot the `.stage` element (deviceScaleFactor 2) into site/img/.

Chat bubbles: `--chat default` uses the built-in conversation, `--chat none`
leaves the wallpaper empty, `--chat file.json` reads `[{"role":"u"|"a","text":…}]`.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
SITE = HERE
IMG = SITE / 'img'

DEFAULT_CHAT = [
    ('u', '帮我把这三份周报合成一份，按项目分组'),
    ('a', '合成好了，按「推理服务 / 客户端 / 文档」分成三组，重复的进度条目合并成一条。'),
    ('a', '有一处冲突：周报 A 说接口冻结在周五，周报 C 说延到下周一。我按后者写的。'),
    ('u', '那就延到下周一，顺便把风险点单独列出来'),
    ('a', '已加一节「待确认风险」，三条：接口冻结日期、灰度比例、回滚预案负责人。'),
]


def extract_block(html: str, start: str) -> str:
    i = html.index(start)
    depth, pos = 0, i
    while True:
        o = html.find('<div', pos)
        c = html.find('</div>', pos)
        if c == -1:
            raise SystemExit('unbalanced: ' + start)
        if o != -1 and o < c:
            depth += 1
            pos = o + 4
        else:
            depth -= 1
            pos = c + 6
            if depth == 0:
                return html[i:pos]


TEMPLATE = """<!doctype html>
<meta charset="utf-8">
<title>{title}</title>
<style>
  html, body {{ margin: 0; height: 100%; }}
  body {{
    display: grid; place-items: center;
    background: #e9edf4;
    font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
    --dsw-font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  }}
  .stage {{
    position: relative; width: {w}px; height: {h}px;
    border-radius: 22px; overflow: hidden;
    transform: translateZ(0);
    box-shadow: 0 30px 74px rgba(58, 78, 120, .22);
    --cmes-left: {left}px;
    --cmes-bottom: {bottom}px;
    background:
      radial-gradient(900px 520px at 10% -12%, #d7e4ff 0%, transparent 62%),
      radial-gradient(720px 620px at 90% 10%, #f0d9f8 0%, transparent 66%),
      radial-gradient(680px 460px at 50% 110%, #cdeeee 0%, transparent 72%),
      linear-gradient(158deg, #f9fbfe 0%, #eef2fa 46%, #f7f1fb 100%);
  }}
  .grain {{
    position: absolute; inset: 0; pointer-events: none; opacity: .5;
    background-image: radial-gradient(rgba(30,50,90,.05) 1px, transparent 1px);
    background-size: 3px 3px;
  }}
  .chat {{
    position: absolute; inset: 0 0 210px 0; padding: 34px 46px;
    color: #3d4a63; font-size: 14px; line-height: 1.85;
  }}
  .chat .bubble {{
    max-width: 560px; margin-bottom: 14px; padding: 11px 16px;
    border-radius: 14px; backdrop-filter: none;
  }}
  .chat .u {{
    margin-left: auto; background: rgba(92, 148, 255, .13);
    border: 1px solid rgba(92, 148, 255, .26);
  }}
  .chat .a {{
    background: rgba(255, 255, 255, .78);
    border: 1px solid rgba(30, 50, 90, .07);
  }}
  .chat code {{ font-size: .92em; }}
  .dock {{ position: absolute; left: 46px; right: 46px; bottom: 30px; }}
  .composer {{
    display: flex; align-items: center; gap: 12px;
    padding: 13px 16px; border-radius: 17px;
    background: rgba(255, 255, 255, .74);
    border: 1px solid rgba(30, 50, 90, .10);
    box-shadow: 0 12px 30px rgba(58, 78, 120, .13);
    color: #7d8ca6; font-size: 13px;
  }}
  .composer .grow {{ flex: 1; }}
  .pill {{
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; border-radius: 999px; font-size: 12px;
    background: rgba(255, 255, 255, .8);
    border: 1px solid rgba(30, 50, 90, .12); color: #5b6b85;
  }}
  .send {{
    width: 26px; height: 26px; border-radius: 8px;
    background: linear-gradient(140deg, #6b8cff, #8d5bff);
    opacity: .9;
  }}

  /* the dark twin of the stage: a real dark-theme DSH window has a dark
     wallpaper too, so the demo must not show dark chrome on a light desk */
  body[data-ds-dark-theme] {{ background: #05070d; }}
  body[data-ds-dark-theme] .stage {{
    box-shadow: 0 34px 90px rgba(0, 0, 0, .6);
    background:
      radial-gradient(900px 520px at 12% -10%, #1d3f74 0%, transparent 62%),
      radial-gradient(720px 620px at 88% 12%, #6d2a7c 0%, transparent 66%),
      radial-gradient(680px 460px at 52% 108%, #0b5c67 0%, transparent 72%),
      linear-gradient(158deg, #070b16 0%, #0c0f1d 46%, #140a20 100%);
  }}
  body[data-ds-dark-theme] .grain {{
    background-image: radial-gradient(rgba(255, 255, 255, .05) 1px, transparent 1px);
  }}
  body[data-ds-dark-theme] .chat {{ color: #c9d5ea; }}
  body[data-ds-dark-theme] .bubble.u {{
    background: rgba(92, 148, 255, .17); border-color: rgba(126, 172, 255, .22);
  }}
  body[data-ds-dark-theme] .bubble.a {{
    background: rgba(255, 255, 255, .055); border-color: rgba(255, 255, 255, .085);
  }}
  body[data-ds-dark-theme] .composer {{
    background: rgba(9, 13, 24, .58); border-color: rgba(158, 190, 255, .17);
    box-shadow: 0 14px 34px rgba(0, 0, 0, .3); color: #8395b5;
  }}
  body[data-ds-dark-theme] .pill {{
    background: rgba(255, 255, 255, .06); border-color: rgba(255, 255, 255, .1); color: #a9b8d4;
  }}
</style>
<body{dark}>
<div class="stage">
  <div class="grain"></div>
{chat}
  <div class="dock">
    <div class="composer">
      <span>输入消息…</span>
      <span class="grow"></span>
      {root}
      <span class="send"></span>
    </div>
  </div>
</div>
"""


def bubble(role: str, text: str) -> str:
    return f'    <div class="bubble {role}">{text}</div>'


def chat_block(mode: str) -> str:
    if mode == 'none':
        return ''
    items = DEFAULT_CHAT
    if mode not in ('default', ''):
        items = [(d['role'], d['text']) for d in json.loads(pathlib.Path(mode).read_text(encoding='utf-8'))]
    body = '\n'.join(bubble(r, t) for r, t in items)
    return ('  <div class="chat">\n' + body + '\n  </div>')


def opt(argv, name, default):
    return argv[argv.index(name) + 1] if name in argv else default


def main():
    argv = sys.argv[1:]
    if len(argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    src, out = pathlib.Path(argv[0]), pathlib.Path(argv[1])
    dark = '--dark' in argv
    size = opt(argv, '--size', '880x620')
    w, h = (int(x) for x in size.lower().split('x'))
    chat = opt(argv, '--chat', 'default')
    left = opt(argv, '--left', '430')
    bottom = opt(argv, '--bottom', '96')

    html = src.read_text(encoding='utf-8')
    root = extract_block(html, '<div class="cmes-root')
    page = TEMPLATE.format(
        title=out.stem, root=root, w=w, h=h, left=left, bottom=bottom,
        chat=chat_block(chat),
        dark=' data-ds-dark-theme=""' if dark else '',
    )
    IMG.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding='utf-8')
    print(f'{out}  {len(page)} bytes  stage {w}x{h}  chat={chat}  left={left} bottom={bottom}')


if __name__ == '__main__':
    main()
