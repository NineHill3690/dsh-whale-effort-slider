# 交接说明（HANDOFF）

> 这份文件给「下一个对话」看：现在是什么状态、改过什么、哪些已实测、哪些是坑。
> 版本 **1.3.0**（包名 `dsh-whale-effort-slider`，v1.3.0 起与市场条目脱钩），源码目录就是本目录（profile 里以 `link:` 引用，改文件即改插件）。

## 1. 这个插件现在是什么

`dsh-whale-effort-slider` —— 把 DSH 输入框的模型席换成一条鲸鱼滑条：
上方推理强度滑条、下方 provider → 模型两级下钻列表，左上角一枚鲸鱼按钮开关「智能体团队协作」。

来源：上游 [ABING1111/dsh-codex-model-effort-selector](https://github.com/ABING1111/dsh-codex-model-effort-selector)
v1.1.2（MIT）。本目录是在它基础上的复刻 + 三处本地改造，详见 [`REPLICA.md`](REPLICA.md)。

| 文件 | 作用 | 谁改过 |
|---|---|---|
| `client.js` | 全部实现（席位接管、滑条、粒子、下钻、团队开关）。手写、零构建 | 本地改过（见第 3 节） |
| `index.js` | 宿主半边空实现，只为让包成为 cordis 节点 | 未改 |
| `package.json` | 清单；`dsh.bundle.patch` + `dsh.client` | 本地改过（exports/files/version） |
| `cordis.patch.yml` | 把包 insert 进 profile 组合层 | 未改 |
| `locale/{zh,en}.json` | 插件页标题/描述/详情页路径 | 本地重写 |
| `icon.svg` | 插件图标（蓝紫底板 + 滑轨 + 闪电） | 本地原创 |
| `docs/DETAIL*.md`、`docs/preview.svg` | 插件详情页单图 | 本地原创 |
| `docs/REPLICA.md` | 复刻与改造全记录（含逐项验证数字） | 本地 |
| `README.md` | 安装/交互说明 | 本地重写 |

## 2. 当前生效状态

- profile：`desktop`（Electron 管的那个），包以 **`link:`** 指向本目录
- 席位：`conversation.input.model`，本插件 `priority: -1` 遮蔽官方（官方 `priority: 0` 变为 inactive）
- 已实测：弹层几何、两级下钻、Fast→团队按钮、深浅两套配色、整页 reload 后状态回填；
  v1.2.7 的电能滑条只有**离屏渲染**核对（见第 3 节第 8 条截图）
- 未实测：**浅色主题**（本机 profile 固定 `dark`）、拖动跨弹层边界的手势、多 provider 目录、
  v1.2.7 滑条在网页端 setPointerCapture 下的真实拖动手感

## 3. 相对上游改了什么（按时间顺序）

1. **弹层定位**（v1.1.3）：宿主输入框座位 `an3WzG_composerSeat` 带 `will-change: transform`，
   是固定定位的包含块，上游把视口坐标当成了相对座位的坐标 → 卡片被顶出窗口右侧。
   修法：加 `.cmes-probe` 探针量出真正的包含块，`align()` 里换算；`--cmes-avail` 供 `max-height`。
2. **左上角按钮改功能**（v1.2.0）：⚡ Fast 视觉开关 → 真正开关 Agent Team
   （`ctx.remote.agentTeams.setEnabled(sessionId, on)`；状态读 `useProjection('agentTeam')`）。
   入口 `inject` 因此多了 `remote.agentTeams`。
3. **图标三改**（v1.2.1 / v1.2.2）：三只官方鲸鱼 → 正三角 → 中心重叠 + 放大 + 深浅对比。
   现在是 `WHALE_TRIO = [[1.4,8.8,0.6],[10.2,5.2,0.3],[12.6,10,0.42]]`（24×24 画布），
   按钮内 24×24、收起态 20×20，`stroke:none`，关=近白、开=`#4D6BFE`。
4. **档位文案与颜色**（v1.2.3，按用户要求）：以前档位名走本插件自造的词表
   （`关闭` / `极低` / `轻度` / `中` / `高` / `极高` / `Ultra`），并且每个档位还有一套
   阶梯墨色。现在：
   - 标签 = 目录里的 `effort.name`，也就是 DSH 自己的 **Off / Low / High / Max**
     （`dsh-llm-deepseek` 的 `model-info` 就这么命名）；`EFFORT_LABEL` 只在某个 id
     没有 `name` 时兜底，仍然是同一套词。
   - 档位字改成**固定淡蓝**，不再随档位变色：深色 `#a9d6ff`（9.2:1），浅色 `#2a78c4`
     （4.6:1，纯淡蓝在浅底上看不见，只降明度不改色相）。`EFFORT_INK*` / `inkFor`
     随之删除，`--cmes-ink` 仍然由 JS 按主题盖章，只是值固定。
     - ⚠️ **已被 §7（v1.2.26）推翻**：用户要的是「档位字的颜色 = 对应滑动条背景颜色」，
       所以字色又跟着档位走了，但取的是**海水色标**而不是当年那套阶梯墨色，并且明度
       由对比度求解（四档仍然 ≥4.5:1）。
   - 实测（网页端 reload 后读计算样式）：档位名 `High`、字色 `rgb(169,214,255)`、
     滑轨 4 档（`aria-valuemax=3`）。
5. **档位下面那行模型名去厂商前缀**（v1.2.4，按用户要求）：弹层里 `High` 下面那行
   由 `DeepSeek-V4.1-Flash` 改显示 `V4.1-Flash`（`stripVendor()`，正则
   `^deepseek[\s\-_:：·]+`）。**只改这一处**：收起态 caption、模型列表行、
   `aria-label`、`title` 悬浮提示都还是全名，实测 caption 与 title 均为
   `DeepSeek-V4.1-Flash`、列表行为 `DeepSeek-V4.1-Flash` / `DeepSeek-V4-Pro`。
6. **弹层背景改液态玻璃**（v1.2.5，按用户要求）：`.cmes-popover` 不再用
   `--dsw-specific-menu` 那种实色面板，改成四层叠加的半透明玻璃：
   ① 两处镜面高光（左上主光 + 右下补光，纯 alpha 白）② 顶部一层压暗 scrim
   （保证 13px 文字在花壁纸上仍可读）③ 158° 的明暗渐变 ④ 烟灰本体
   `--cmes-glassBody`；`backdrop-filter: blur(30px) saturate(170%) brightness(1.05)`
   负责真正的折射；倒角只用 box-shadow（顶部亮线 inset + 底部暗线 + 外投影）和
   1px 半透明描边，不占布局。`::before` 是一层 15s 缓动的斜向流光（`glassDrift`），
   排在 panes 之前所以永远在内容下面，`prefers-reduced-motion` 下静止。
   - 颜色全部走 token：`--cmes-glassBody/Sheen/Scrim/Edge/Shadow/Blur`，浅色在
     `.cmes-root` 给白玻璃默认值，深色在 `body[data-ds-dark-theme] .cmes-root` 覆盖
     （深色必须更低的高光与更重的投影，否则一片奶白）。
   - 实测（reload 后读计算样式）：`border-radius:16px`、`border rgba(255,255,255,.22)`、
     backdrop `blur(30px) saturate(170%) brightness(1.05)`、背景 8 层；档位名
     `#a9d6ff` 在玻璃上的实测对比度 **9.5:1**（正文行 8.2:1）。
   - 截图：`docs/preview-liquid-glass.png`（深色）、`docs/preview-liquid-glass-light.png`
     （浅色，临时去掉 body 上的 `data-ds-dark-theme` 拍的）。
   - ⚠️ `overflow:hidden` + `backdrop-filter` 让弹层继续是 fixed 后代的包含块，
     团队提示气泡必须留在 `.cmes-root` 下 —— 这次没动那条约束。
7. **玻璃按 wallpaper-engine 的配方重做（v1.2.6，用户口径「透明度太低」）**：
   上一版是自己发明的烟灰板（`rgba(18,20,26,.42)` + 顶部 scrim .20 + blur 30px），
   观感像实心卡。现在照 `dsh-plugin-wallpaper-engine-glass` 的
   **iOS liquid glass 卡片配方**（`lib/client.glass.js` 里 `[data-question-key] [class*="_card"]`
   那一族），并且直接对齐**这台机器上正在跑的**玻璃参数（读 body 上的 `--we-*` 得到）：
   | 项 | 参考值（实测） | 本插件令牌 |
   |---|---|---|
   | 玻璃色 | `--we-surface-tint-dark` = `#0d1524`（深浅两套都是它） | `--cmes-glassTint:13,21,36` |
   | 玻璃透明度 | `--we-glass-alpha` = 0.19 | `--cmes-glassAlpha:.19`（深） / `.30`（浅，白玻璃） |
   | 玻璃模糊 | `--we-blur` = **6px** | `blur(6px)` |
   | 饱和 / 亮度 | `--we-saturate` 1.3、`--we-glass-brightness` 1.04 | 同值 + `contrast(1.01)` |
   | 可读性地板 | `--we-readability-floor` = `calc(0.59 * 0)`（**保真度 0，地板关**） | 不铺地基层 |
   | 釉光 | 卡片配方 `180deg .16 → .05@38% → .02` | `--cmes-glassSheenA/B/C` |
   | 边 | `inset 0 1px 0 .32` + 底面 .08 + 0.5px 发丝 + `0 12px 40px` | `--cmes-glassHighlight/Hairline/Lift` |
   - 关键认识：**参考面板透明度只有 0.19**，地板又被用户关掉，所以它是「几乎全透 +
     6px 浅霜」。6px 而不是 30px 是重点 —— 大半径把壁纸糊成灰雾，看着反而"厚"。
   - 去掉 scrim、去掉 15s 流光（参考卡片是静态釉，没有动画）；正文改吃
     `--cmes-glassText` 文字阴影，这样不靠加深底色也能压在花壁纸上。
   - 实测（深色，reload 后读计算样式）：`background-color rgba(13,21,36,0.19)`、
     `background-image` 单条 180° 渐变（.16/.05/.02）、`backdrop-filter: blur(6px)
     saturate(1.3) brightness(1.04) contrast(1.01)`、`border-width:0`、
     四条 `box-shadow`、`border-radius:16px`；截图像素取样：档位名对比度 **6.4:1**、
     模型名副行 6.1:1（浅色 0.30 白玻璃同样可读）。
   - 截图：`docs/preview-liquid-glass.png`（强度面板）、`docs/preview-liquid-glass-models.png`
     （模型列表页）、`docs/preview-liquid-glass-light.png`（浅色核对）。
   - 想再调透明度：只动 `--cmes-glassAlpha`（和浅色那行），别再加 body 层 ——
     一旦加回 .42 那种底色，就退回「实心卡」的观感。

8. **滑条换成 excellent-slider 那颗「电能滑条」（v1.2.7，按用户要求）**：
   把 `dsh-codex-excellent-slider` 的 power slider 整段搬过来（那颗插件已从本机删除，
   本次是对着回收站里的源码 `$RGHUQF5\dsh-codex-excellent-slider\lib\client.js` 抄的），
   只换前缀与几何；玻璃弹层、两级下钻、鲸鱼按钮、文案、`aria` 全都保持原样。
   - 几何：轨道 26px → **22px**（`RAIL_H`），`top` 65 → **67**（中心线仍是 78px）；
     填充宽 `calc(11px + (100% - 22px) * var(--cmes-pos))`；旋钮 30px → **25px**，
     中心从 11px 起算（`RAIL_INSET = RAIL_H/2`），所以两端各溢出 1.5px 而不是压出轨道。
   - 填充色：`linear-gradient(90deg, rgb(59,130,246), <按比例>)`，蓝 `#3b82f6` →
     紫 `#a855f7`（比例 .05~.667）→ 深紫 `#7c3aed`（.667~1）。拖动时 `paintLive` 同时写
     `--cmes-pos` 与 `--cmes-fillBg`，**颜色跟着指针连续走**，不是只在档位之间跳。
   - 星尘：22 颗 3px 白点，各占一条横向轨道；数量 `round(energy*22)`、整体不透明度
     `.6+.4*energy`、速度 `3*ratio-1`（夹在 .35~2）。亮度/时长/相位按 index 哈希，重渲染不重排。
     分道用与 22 互质的步长 7，所以「只亮前 N 颗」时也铺满整条轨道（按相位排序会让前 N 颗
     挤成自上而下的一根条，这是抄的过程中修掉的一个坑）。
   - 最高档：Ultra 材质（2 倍宽渐变一次性扫入 1.8s + .2s 淡入）+ 13.6s 呼吸薄雾 +
     四层极光（8.5/13/16/23s，负延迟，出现时已在半途）+ 旋钮溅 8 滴墨（498ms 后卸载）。
     墨溅只在「进入」时放一次，打开弹层时本来就停在最高档不会放。
   - 删掉旧的一套：4 个刻度点（`cmes-dot`/`passed`/`hovered`）、`peak` 的 `colorflow`/
     `shimmer` 流动填充、`cmes-sp` 火花、`cmes-bp` 迸发、`cmes-halo` 光环；连同 `hovered`
     状态和它绑定的 `pointerMove`（新滑条没有 hover 高亮）。深色 token `--cmes-dotPassed`、
     `--cmes-peakGradient` 一并删除；`--cmes-fill` 仍留作兜底色。
   - 交互一行没改：文档级 pointer 手势、按下即跳、拖动连续不吸附、松手吸附并提交、
     方向键/Home/End、`aria-valuemin=0`（**没有**跟着参考实现改成 1 基）。
   - 实测：`node --check` 通过；CSS 模板 30.2KB、反引号 0、`undefined`/`NaN` 0、花括号 157/157；
     离屏渲染五档 + 最高档 + 深色卡片截图核对（`docs/preview-power-slider.png`）。
     网页端还没核对，刷新页面后用肉眼过一遍：拖动手感、最高档扫入与墨溅、浅色主题。

9. **两级下钻的返回按钮（v1.2.8，按用户要求）**：
   - page 1（provider 列表）标题左侧新增 26px 返回按钮，点击回强度面板并清空搜索词 ——
     与该层 Escape（`pane models / view 1`）完全同一条路径；此前这一层只能靠 Escape 或点外部退出。
   - page 2（「DeepSeek Account」模型列表）那个返回按钮原来用的是 **向右** 的 `chevron`
     （`m9 18 6-6-6-6`），看着像"再进一层"；现在改用新增的 `ICON.chevronLeft`
     （`m15 18-6-6 6-6`），两页的返回都朝左。
   - 两页共用一个 `.cmes-head`（26px 按钮 + 8px 内距 + 2px 上距 = 36px），page 1 的标题
     从 12px 灰字 `.cmes-sec` 换成和 page 2 一致的 14px/600 `.cmes-title`；`.cmes-sec` 与
     `SEC_H` 一起删除，page 1 高度模型改用 `HEAD_H`（36），否则 provider 列表会多算 6px。
   - 未改动：provider 行右侧那个向右箭头（那是"进入"，方向本来就对）、搜索框、选中勾、
     行高 41/39 与列表上限 252。
   - 实测：`node --check` 通过；离屏（只喂 CSS + 骨架 DOM）量到 head **36×252**、back **26×26**、
     图标 **12×12**、标题 `14px/600`、path `m15 18-6-6 6-6`；`chevronLeft` 只被两处 back 使用，
     `SEC_H`/`cmes-sec` 已无残留。正式 UI 尚未在本机网页端复核（需要用户刷新一次页面）。

10. **旋钮圆头换成官方鲸鱼（v1.2.9→v1.2.10，按用户要求）**：
   - 旋钮里那颗 25px 白色圆饼（`.cmes-knob` 的 `background` + `box-shadow`）删掉，改成同尺寸
     的官方鲸鱼剪影：用 `client.js` 里已有的 `WHALE` 路径（`FISH_LOGO_PATH`，和团队徽标同一份
     源），新增 `knobWhale()` 生成 `<svg viewBox="-0.2229 -0.0263 23.3967 17.0659">`，
     `preserveAspectRatio="xMidYMid meet"` 落在 25×25 的定位盒里，纵向按官方比例
     （23.3967:17.0659）居中，不拉伸。
   - **v1.2.10 放大（用户要求：鲸鱼上下最长的那一维 = 流动填充的宽度）**：定位盒还是 25px
     （`KNOB_D`，行程、指针换算、墨溅原点都吃它），但**图形本体不再填满这个盒子**：新增
     `KNOB_WHALE_H = RAIL_H`（22）与 `KNOB_WHALE_W = 22 * 23.3967 / 17.0659 = 30.16`，
     `.cmes-knobWhale` 直接用这两个像素值（`height:22px;width:30.16px`），定位盒加
     `display:flex;align-items:center;justify-content:center` 让 30.16 宽的两端对称外溢。
     于是鲸鱼的上下长度 = **22px = 轨道/填充的粗细**，看上去是嵌在条子里而不是浮着的小徽章。
   - 外溢量算过：中心仍在 `11px + (100% - 22px) * pos`，半宽 15.08，所以 pos=0/1 时两端各探出
     `15.08 - 11 = 4.08px`（旧圆头是 1.5px）；弹层左右内距 12px，探出后仍离卡片边 8px，不裁。
   - 墨溅跟着调：`INK_START_RADIUS` 24 → **28**（`28 * INK_SCALE(25/46) ≈ 15.2px`，正好贴着
     新的半宽 15.08 起飞）；不改的话 -2°/163° 两颗墨滴会从鲸鱼肚子里出来。
   - **朝右必须镜像**：官方路径原生是朝左的（头在左、尾鳍在右上），`transform="translate(22.9509 0) scale(-1 1)"`。
     22.9509 = `WHALE_BOX.x * 2 + WHALE_BOX.w`（=`-0.2229*2 + 23.3967`），是 bbox 的左右边界之和，
     以它为轴翻转，镜像后仍然精确落在原 bbox 内，不用重新量 viewBox。
   - 上色走 `currentColor`：`.cmes-knob` 设 `color: var(--cmes-knob, #fff)`，`path` 用
     `fill: currentColor`，浅色/深色主题都吃 token（深色下 `--cmes-knob` 仍是白）。
   - **阴影必须留**：白色鲸鱼压在浅色轨道上（#e8e7e8）会糊掉，实测无阴影时头部轮廓几乎看不见；
     最终选紧阴影 `filter: var(--cmes-knobFilter, drop-shadow(0 .5px .6px rgba(0,0,0,.55)) drop-shadow(0 1px 2px rgba(0,0,0,.28)))`，
     双层柔和版（1px/1.5px 那档）在 1x 下发虚。`--cmes-knobFilter` 留着给主题覆盖。
   - 位置/动画一行没动：`left: calc(11px + (100% - 22px) * var(--cmes-pos))`、`transition`、拖动时
     `scale(1.045)` 都按 25px 定位盒的中心算，墨溅也从同一个中心出发。
   - 实测：`node --check` 通过；CSS 模板 32.0KB、花括号 408/408、反引号 0；离屏渲染（临时 harness 直接抽
     真 CSS + 真路径）截图核对 pos=0/0.5/1、浅色/深色、1x/2x，鲸鱼朝右、随拖动跟手、深色下反白可读。
   - 截图：`docs/preview-knob-whale.png`（浅色三档 + 2x/3x 特写 + 深色三档）。第 8 条那张
     `docs/preview-power-slider.png` 是 v1.2.7 圆头时期拍的，**没有重拍**——它记录的是星尘/材质，
     旋钮长什么样以新图为准。
   - 详情页单图 `docs/preview.svg` 里原来那颗 32px 白圆（`<circle cx="345" cy="109" r="16">`）
     同步换成鲸鱼：`translate(345 109) scale(-1.5235 1.5235) translate(-11.47545 -8.50665)`，
     负的 scale 就是镜像；`26/17.0659 = 1.5235` 让鲸鱼高 = 那张图里轨道的 26px（图还是 26px 时代的
     几何），宽 35.65，和实机「高度 = 填充粗细」是同一条规矩。

11. **流体前锋对齐鲸鱼（v1.2.11，用户口径「将红线位置与蓝线位置重合」）**：
   - 现象（用户放大截图量出来的）：鲸鱼的墨迹跨 345px 里的 54..277，中心 165.5、墨迹质心 173.5；
     紫色填充的可见右缘只有 ~152，**比鲸鱼 bbox 中心还早 13.5px**，于是「流体停在鲸鱼左肩，
     整个身体挂在淡色轨道上」。
   - 根因不是旋钮位置错，而是**填充右端是药丸圆头**：`border-radius:999px` 让前锋是一个
     `RAIL_INSET = 11px` 的半圆，圆的尖端虽然正好落在旋钮锚点（= 鲸鱼 bbox 中心），但**圆的可见
     质量早就退到尖端后面 ~8.7px**，再加上鲸鱼自己两端外溢 2.58px 盖掉了填充最后一段，
     眼睛读到的前锋大约在字形 20% 处。数字上「填充右缘 = 旋钮中心 = 鲸鱼 bbox 中心」三线合一，
     所以只在纸上对齐。
   - 改法（形状，不是加大偏移）：
     1. `.cmes-fill` 的 `border-radius` 由 `999px` 改成 `${RAIL_INSET}px 0 0 ${RAIL_INSET}px`
        —— **前沿变成方角**，前锋是一条干净的竖线，位置就是锚点，和墨迹质心同一条 x。
     2. 新增 `KNOB_FLOW_REACH = 2`（`client.js` 几何常量区），填充宽度变成
        `calc(11px + 2px + (100% - 22px) * pos)`：把这条线再往前推 2px，正好落在墨迹质心上
        （质心在 bbox 中心右 0.75px，实测 1.5px@6x）。**这是唯一需要拧的旋钮**：0 = 严格锚点，2 = 质心。
   - 实测（6x 离屏 harness，5 档 × 深浅两套）：
     - 鲸鱼墨迹 730..907（178px@6x = 29.7px，与 30.16 差在抗锯齿），bbox 中心在锚点左 0.58px，
       墨迹质心在锚点右 0.25px。
     - 改动前：可见紫右缘 = 锚点 − 8（≈ −1.3px），前锋藏在鲸鱼尾鳍后面。
     - 改动后：紫右缘 = 锚点 + 47（≈ +7.8px），前沿竖线穿过鲸鱼身体，档位 0/1 两端都不越界
       （pos=1 时填充宽 = 100% − 9px，仍在药丸右端圆头内侧；pos=0 时是 13px 的圆头小疙瘩）。
   - 浅色主题顺带变清楚了：以前白鲸压浅轨道（#e8e7e8）时尾鳍糊成一团、"流体到哪"看不出来；
     现在前沿是硬边，能直接看出水线切在鲸鱼身上。**没有加描边**——第 10 条试过，0.5 描边会把尾鳍
     糊胖，仍然只靠两层 drop-shadow。
   - 物料同步：
     - `docs/preview-knob-whale.png` **重拍**（浅/深各 5 档，2.6x）：旧图是 v1.2.10 的圆头时期，
       ratio 0.5 那格里蓝色只到鲸鱼脖子，正是用户嫌弃的观感。
     - `docs/preview.svg` 从 26px 时代更新到现在的 22px 几何：轨道 `y=98 h=22 rx=11`，
       填充改成 `path`（左圆右方，右缘 355 = 锚点 353 + 2），删掉 7 颗旧刻度点（v1.2.7 起就没有了，
       图里一直留着），鲸鱼中心 345 → **353**、缩放 `1.5235` → **1.2891**（= 22/17.0659）。
     - 上一版把鲸鱼放在 345、填充右缘 358，鲸鱼比前锋还靠左 13px，属于同一张图的陈旧几何。
   - 校验：`node --check client.js` 通过；CSS 模板花括号配对、反引号 0；离屏 harness 直接抽源码
     常量（`RAIL_H/KNOB_FLOW_REACH/border-radius`）渲染，防止图和代码漂移。

12. **旋钮鲸鱼再放大、内部镂空跑流体（v1.2.12，用户口径「将滑动图标的鲸鱼再放大，可以溢出滑动条，
   上下最宽的长度（如图红线处）与原滑动头的直径相同，流动动画要填满鲸鱼的内部，但是不能溢出鲸鱼图标」）**：
   - 尺寸：`KNOB_WHALE_H` 由 `RAIL_H`(22) 改成 `KNOB_D`(25)。用户放大的截图里那条红线量的正是
     **旧圆头旋钮的直径 = 25px**，所以鲸鱼上下要顶到 25px；轨道只有 22px，上下各溢出 1.5px 是**设计要求**，
     不是失误。宽度按 bbox 比例自己算：`25 * 23.3967 / 17.0659 = 34.27`（原 30.16），左右各溢出定位盒 4.64px。
     定位盒仍是 `KNOB_D = 25` —— 行程、指针换算、墨滴原点全以它为基准，**别跟着改**。
   - 第一版错在哪：把流体层**盖在白鲸身上**（`KNOB_FLOW_ALPHA` 0.58，再降到 0.26），整只鲸鱼变成婴儿蓝，
     压在紫条上轮廓几乎消失。用户一句「鲸鱼图标本身颜色不变，填满的是鲸鱼内部的透明处」点破了：
     要填的是**图标自身的镂空**（眼睛、背脊斜带、腹部的开口），不是鲸鱼本体。
   - 第二版还是错的（**坑，务必记住**）：clip 用**整条路径**（= 鲸鱼本体）去夹流体，然后把白色本体
     画在上面。看着像好了，其实是**一滴流体都没画出来**：clip 内被白色压死，clip 外（镂空处）根本没夹到，
     镂空里看到的永远是**屁股底下的滑条**。用「白色本体 `fill:none` + 滑条清空」的对照图才看清这个骗局
     （`.tmp-whale` 那次 debug 列的渲染：隐藏本体后鲸鱼轮廓里只剩两个小口子有颜色，正是镂空）。
   - 正确做法：**clip 用镂空本身**。`WHALE` 是一条多子路径的 path，**第 1 条子路径是外轮廓，其余子路径
     就是镂空**（腹部开口 / 眼睛 / 眼睛里的白点）。所以 `const WHALE_INNER = WHALE.slice(WHALE.indexOf('M', 1))`
     —— 从第二个 `M` 开始切，几何不复制、不会和 `WHALE` 漂移。流体 clip 到 `WHALE_INNER`：
     镂空吃到流体，本体一滴不沾，**结构上就不可能溢出图标**。
   - 现在的画法（三层，**绘制顺序就是机制**）：
     1. `<clipPath>` = `WHALE_INNER`（镂空），里面的 `<g>` 放两块 `rect`：竖着走的蓝→紫渐变
        （`#8ec5ff` → `#3b82f6` → `var(--cmes-wfEnd)`，`x1=.10 y1=0 x2=.55 y2=1`，
        竖着倒才不会被读成「条子的水平渐变」），再叠一道 `spreadMethod="repeat"` 的白色斜光带
        （`SHEEN_PERIOD = 12`、`SHEEN_SKEW = .58`、7 段 stop 峰值 .42、`SHEEN_SHIFT_Y = 6.96`）；
     2. 白色本体 `<path class="...-knobWhaleBase" d={WHALE}>` **最后画**：本体是实心的，
        盖住镂空边缘的抗锯齿，接缝是一条干净的剪影线，不会出现一圈浅色描边；
     3. 用 SVG `clipPath` 而不是 CSS mask / `overflow:hidden`：**夹的就是镂空本身，误差到像素**。
   - 动画：`@keyframes ${P}-whale-flow` 把光带平移**正好一个周期**（`translate(-12px, 6.96px)`，
     1.5s linear infinite），首尾无缝、不跳帧；`prefers-reduced-motion` 下 `animation:none; opacity:.34`
     （颜色是信息，动是装饰）。
   - 颜色跟随档位：`paintLive` / `snapLive` 额外写 `--${P}-wfEnd = fillEndColor(frac)`，
     拖动时镂空里的紫跟着条子一起变深，静止时也和当前档位对得上。
   - 墨滴：`INK_START_RADIUS` 28 → 34（`34*25/46 = 18.5px` > 字形半宽 `17.13px`），
     否则墨点会从鲸鱼肚子里冒出来。
   - 实测（离屏 harness **直接正则抽源码常量**，Edge `--headless=new`，device scale 1，8x 放大）：
     5 档 × 深浅两套，字形 bbox 恒为 **34.00 × 25.00 CSS px**（高度正好 = `KNOB_D` ✓）；
     镂空对着色（腹部开口 + 眼睛 + 背脊斜带）。**溢出 = 0，而且是结构性的**：流体被 clip 在
     `WHALE_INNER` 里，任何像素都落不进本体或轮廓外。对照图（`fill:none` 藏掉本体 + 滑条清空）
     只剩那三个口子有颜色，说明「涂的正好是镂空」。
   - 物料同步：`docs/preview.svg` 缩放 `1.2891` → `1.4649`（= 25/17.0659，中心 353/109 不变），
     并加 `#whaleShape` / `#whaleOpenings` / `#whaleClip` / `#whaleFlow`（clip 用的是镂空那份），
     静态图也能看出镂空里的流体；
     `docs/preview-knob-whale.png` 重拍（浅/深 × 5 档，含放大后的 25px 字形）；`package.json` → **1.2.12**。
   - 校验：`node --check client.js` 通过；CSS 模板花括号 424/424 配对、反引号 0；
     `.cmes-knobWhale path` 这条旧选择器已删除（改成 `-knobWhaleBase`），`wfEnd` 只出现在 JS 里。

13. **镂空里的流体与条子统一 + 鲸鱼再放大（v1.2.13，用户口径「鲸鱼内部的透明处的流动效果要和外部一致，
   统一，另外鲸鱼图标本身再放大一些，溢出滑动条没关系」）**：
   - 尺寸：`KNOB_WHALE_H` 25 → **30**（**不再等于 `KNOB_D`**，直接写字面量 30）。轨道 22px，上下各溢出 **4px**；
     宽按 bbox 比例 `30 * 23.3967 / 17.0659 = 41.13`（原 34.27），左右各溢出定位盒 **8.07px**。
     定位盒仍是 `KNOB_D = 25` —— 行程 / 指针换算 / 墨滴原点全以它为基准，**别跟着改**。
     用户明确说「溢出滑动条没关系」，所以这不是视觉 bug，是需求。
   - 流体方向改了（这是用户这一轮真正的不满）：v1.2.12 的渐变是**竖着倒**的
     （`x1=.10 y1=0 x2=.55 y2=1`，`#8ec5ff → #3b82f6 → wfEnd`），本意是「别和条子的水平渐变撞脸」，
     结果读起来像**第二种材质**——条子是蓝→紫横着走，镂空里却是自上而下的冷水。
     现在改成**和条子同一条式子**：`linearGradient x1=0 y1=0 x2=1 y2=0`，两个 stop
     `rgb(59,130,246)` → `var(--cmes-wfEnd)`，即 `fillBackground()` 里那条
     `linear-gradient(90deg, EFFORT_RGB_BLUE, fillEndColor(ratio))` 的同色同向版本。镂空跟着档位一起变紫。
   - 流动元素也换了：斜光带（`SHEEN_*`）删掉，换成**白色小点**——就是条子自己的星尘语言
     （`.cmes-efstar` 是 3px 白点、右→左扫）。常量：`KNOB_DOT_COUNT = 7`、`KNOB_DOT_R = 0.62`（用户单位，
     约 1.1px，比条子的 3px 小，因为镂空只有十几个像素）、`KNOB_DOT_TRAVEL = 27.4`
     （= 字形宽 23.3967 + 4 单位余量，点在 clip 外出生和消失，循环重启看不见）。
     7 条的 `cy` 落在 `0.37..0.87 * bh`（只有这一段是镂空带，再往外整段被 clip 掉）；
     时长 `2.7 + (i%4)*0.45` s、延迟 `-0.41*i` s、透明度 `0.62 + (i%3)*0.13`，**全部由索引推出来**，
     不用 `Math.random()`，重渲染不会重新洗牌。
   - **镜像坑（这一条是错的，v1.2.14 已推翻，留作反面教材）**：当时写成「本体是 `scale(-1 1)` 画的，
     点在未镜像的用户坐标里，所以 CSS 必须 `translateX(+27.4px)` 屏幕上才是右→左」。
     错在「点没进镜像组」——`translate()` 只挂在 clip 的 path 和本体 path 上，点的 `<g>` 是干净的
     用户坐标系，`+27.4px` 就是**屏幕上的左→右**，和条子的右→左反着跑。用户一眼看出来就是这个。
   - 减动效：`prefers-reduced-motion` 下 `.knobWhaleDot{animation:none;opacity:0}`
     （颜色是信息，动是装饰；点直接消失，不留冻结在半路的残影）。
   - 墨滴：`INK_START_RADIUS` 34 → **40**（`40*25/46 = 21.74px` > 新半宽 `41.13/2 = 20.57px`；
     最大墨滴 `52*25/46 = 28.3px`，起点仍在所有落点内侧）。
   - 实测（`.tmp-whale/emit.js` 从源码里切出真 `knobWhale()` 执行，Edge `--headless=new`）：
     `bare.html`（只有旋钮、灰底、无滑条）量出字形 bbox **40.75 × 30.00 CSS px**（高度正好 30 ✓，
     宽度差 0.4px 是抗锯齿边）；`frames3.html` 把点的动画分别冻在 `0 / -0.75 / -1.5 / -2.25s`
     （`animation-play-state:paused`），四帧能看到白点从右侧进、穿过腹开口和眼睛、往左出，**始终在镂空里**。
   - 物料：`docs/preview.svg` 缩放 `1.4649` → **1.7579**（= 30/17.0659，中心 353/109 不变），
     `#whaleFlow` 改成横向两段 stop（`#3B82F6 → #A855F7`）；`docs/preview-knob-whale.png` 重拍（30px）；
     `README.md` 滑条那段重写；`package.json` → **1.2.13**，`dist/` 重打。
   - 校验：`node --check client.js` 通过；CSS 模板花括号 **425/425**、反引号 0；
     `SHEEN_*` / `knobWhaleSheen` 在 `client.js` 里已**一个不剩**（旧选择器、旧关键帧一起删干净）。

14. **星尘掉头 + 出得来（v1.2.14，用户口径「滑动图标鲸鱼内部的透明处流动效果的方向和外部不一致，
    从鲸鱼内部的透明处流动的粒子要连贯的流动到外部」，并附了一张红箭头指左的示意图）**：
   - 病因两条，都在 v1.2.13 里：
     a) 关键帧是 `translateX(+27.4px)`，而点的 `<g>` **没有**继承镜像，于是屏幕上是左→右，
        条子的 `.cmes-efstarDot`（`cmes-efstar-sweep` 的 `translate3d(-100%,0,0)`）是右→左 —— 反着跑；
     b) 点被 `clip-path` 夹在镂空里，走到镂空与本体交界处**当场消失**，永远不会出现在图标外面，
        所以「内部的流」和「外面的流」是两回事。
   - 修法一（方向）：关键帧改 `to{transform:translateX(-KNOB_DOT_TRAVEL px)}`，**负号**才是屏幕右→左；
     点的出生点也挪到本体里靠头部一侧（每条 lane 的 `s` 比该行本体右边界内缩约 1 单位），
     所以循环重启时点是**被本体盖住**的，不会凭空出现。
   - 修法二（连贯）：点不再走 clip，改走一张 **`<mask>`**（`maskUnits=userSpaceOnUse`，一块横带
     `x = bx-13.5 … bx+bw+0.6`、`y = by+3.6 … by+bh-1.2`）：
     带子里先铺一条横向渐变（左端黑 = 透明，`42.46%` 之后全白），再用 `WHALE` 填黑把本体挖掉、
     用 `WHALE_INNER` 填白把三个镂空补回来。于是**一张点层**同时满足：镂空里看得见、本体下看不见、
     轮廓外又看得见，越过鲸鱼左缘后按渐变淡出——同一颗点连续走完全程，没有第二层可以对不上表。
     渐变停点是 `fadeAt(x)` 现算的：`KNOB_DOT_FADE = { solid: 2.2, gone: -5 }`（用户单位）。
   - 常量：`KNOB_DOT_TRAVEL = 27`（原来 27.4）、`KNOB_DOT_LANES = [{f,s} × 7]`
     （`f = 0.44/0.5/0.56/0.62/0.68/0.74/0.8`，`s = 21.92/21.88/21.72/21.42/20.98/20.36/19.52`），
     时长 `2.4 + (i%4)*0.3` s（原来 2.7 起步，配 27 单位 ≈ 11.25 u/s ≈ 19.8px/s，贴住条子中段的 ~22px/s）。
   - **点比 lane 多**：`KNOB_DOT_COUNT = KNOB_DOT_LANES.length + 3`（= 10）。循环按 `i % length` 取 lane，
     所以有三条 lane 各带第二颗点、错开半个相位。原因是一颗 lane 一颗点时，18 帧（0.12 s/帧）采样里有
     **3 帧一颗都看不见**——所有点恰好同时躲到腹部右侧那道墙后面，读感是水流一顿一顿；
     10 颗之后**空帧为 0**，可见颗数均值从 ~2.1 提到 ~2.7。加颗数只动这一个常量，不动几何。
   - 为什么 lane 只到 `0.44…0.80`：拿 `openmask.png` / `bodymask.png`（50px/单位的真路径光栅）扫过
     `f = 0.42…0.90`，`0.86` 以下腹部开口覆盖率直接掉到 **0**（旧的 `0.87` 那条是死 lane，永远看不见），
     而 `0.44…0.80` 每行镂空有 **3.6–8.7 单位**可走。实测可见占空比从 25–42% 提到 **61–70%**。
   - 已知取舍（不是 bug）：点在腹部开口和轮廓左缘之间要**钻过 4–9 单位本体**，那一段必然看不见
     （点在白色本体**下面**画，本来就看不见；mask 里把本体挖黑只是把这件事写死）。所以读感是
     「穿过鲸鱼背后」而不是「穿透白色」。另外 `ratio` 接近 0 时旋钮贴着轨道左端，尾巴那 1–2 颗极淡的点
     会露到轨道圆头外面一点 —— 鲸鱼本体在那一头本来就溢出轨道 3px，按同一套语言接受。
   - 实测（`.tmp-whale/`）：`emit.js` 直接正则抽真源码里的 `knobWhale()` 与全部常量执行，
     Edge `--headless=new`；`flow.html` 用 `.cN{--cmes-t}` 把**整片错峰的场**冻在 6 个时刻
     （`calc(var(--cmes-delay) - t)` + `animation-play-state:paused`），能看到点从头部出生 → 穿过腹部开口
     → 在轮廓左缘外冒头 → 淡出；`gifframes.html` 18 帧 × 0.12s 逐帧走一遍。
     数值核对（Python + PIL 逐像素查两张 mask）：7 条 lane 出生点**全部**落在本体内（`birth_occ=yes`），
     每条 `x(t)` 单调递减（右→左），可见比例 61–70%。
   - 物料：`docs/preview-knob-whale.png` 重拍（`gen_docs_preview.py` 已同步成 clip 物料 + mask 星尘 +
     真实 lane 表）；`README.md` 滑条那段改写；`package.json` → **1.2.14**，`dist/` 重打。
   - 校验：`node --check client.js` 通过；出现的坑：第一版把 `h('g',{clipPath})` 的右括号多写了一个，
     物料 `<g>` 被塞进 `<defs>` 里 → 镂空里空掉、星尘全无（截图一眼可见），改成 `}))),` 收 `mask`+`defs`
     后再在 svg 层发物料 `<g>` 才对。

15. **镂空里的流动整层取消（v1.2.15，用户口径「把滑动旋钮图标鲸鱼内部的透明处流动取消」）**：
   - 决定：旋钮鲸鱼只剩**一条曲线**，鲸鱼路径自己带的三个镂空（眼睛、腹部开口、背鳍斜缝）
     恢复**真透明** —— 透出来的是旋钮底色，不再是「条子渐变 + 白色星尘」。也就是说
     v1.2.13 的「物料渐变」与 v1.2.14 的「mask 星尘」两条线**一起退役**，不是关掉动画、是把层删掉。
   - 删掉的东西：`KNOB_FLOW_ALPHA`、`KNOB_DOT_R/_TRAVEL/_FADE/_DUR_BASE/_DUR_STEP/_PHASE`、
     `KNOB_DOT_LANES`（7 条）、`KNOB_DOT_COUNT`（=10）、以及只给星尘点用的 `WHALE_INNER` 常量
     （`WHALE_INNER` 是「取 WHALE 里除第一段外所有 subpath」拼出来的镂空路径，现在没人引用）；
     每次渲染生成的 `whaleUid` 也删了（没有 id 需要它防冲突）。
   - `knobWhale(cls, ratio)` → **`knobWhale(cls)`**（不再需要比例，镂空里没有东西要跟着水位动）：
     只吐一个 `<svg viewBox="WHALE_BOX" preserveAspectRatio="xMidYMid meet">` 套一个
     `<path class="${P}-knobWhaleBase" d={WHALE} transform="translate(WHALE_REFLECT 0) scale(-1 1)">`；
     `<defs>`/`clipPath`/两条 `linearGradient`/`mask`/10 颗 `<circle>` 全部不存在了。
   - CSS：删 `.knobWhaleFlow`、`.knobWhaleDot`、`@keyframes ${P}-whale-drift`、
     `prefers-reduced-motion` 里那条 `.knobWhaleDot`；只留 `.${P}-knobWhaleBase{fill:currentColor;stroke:none}`。
   - 连带清理：`paintLive()` / `snapLive()` / 滑轨那段 inline style 里三处 `--cmes-wfEnd`（渐变末色）
     一起删，现在没有任何元素读它。
   - **没动的**：`WHALE` 路径数据一个字符没改（三个镂空仍在路径里，靠自身的环绕规则挖空）；
     `WHALE_BOX` / `WHALE_REFLECT` / 镜像写法、`KNOB_D = 25` 定位盒、`KNOB_WHALE_H = 30` 字形高度、
     `KNOB_FLOW_REACH = 2`（这是**填充前沿**的水位补偿，和图标内部无关，保留）。
   - 实测（`.tmp-whale/emit2.js` + `.tmp-whale/v1215.png`）：`emit2.js` 从真源码按行抽
     `const WHALE` / `WHALE_BOX` / `WHALE_REFLECT` / `knobWhale()`，用一个把 `h()` 还原成
     HTML 字符串的小渲染器出页，Edge `--headless=new --force-device-scale-factor=2` 截图 6 格
     （白/墨/蓝底各一 + 3x + 8x 两格放大）。8x 下眼睛、腹部开口、背鳍缝里**只剩底色**，
     没有任何渐变条带或白点；产物 HTML 里 `gradient` / `<circle` / `<mask` / `url(#` 命中 **0**。
     这比「看动画」可靠：没有那一层，就不存在「流动方向对不对」的问题。
   - 校验：`node --check client.js` 通过；`KNOB_DOT|knobWhaleFlow|knobWhaleDot|wfEnd|WHALE_INNER|whale-drift|whaleUid|KNOB_FLOW_ALPHA`
     全文件命中 **0**；文件 2399 → 2159 行（141329 → 125468 bytes）。
   - 物料：`docs/preview.svg`（插件详情页那张）删掉 `#whaleOpenings`、`#whaleClip`、`#whaleFlow`
     与那块 `fill="url(#whaleFlow)"` 的 rect —— 详情页里的旋钮现在也是镂空真透，21503 → 19398 bytes；
     `docs/preview-knob-whale.png` 重拍（`gen_docs_preview.py` 已改成「单路径」版：浅/深 × 5 档，2.6x，
     不再画 clip/mask/星尘）；`package.json` → **1.2.15**；`dist/` 重打
     （`-1.2.15.zip` 666755 bytes / `-1.2.15.tgz` 664527 bytes，各 20 个条目）。

16. **眼睛与腹部开口填色：v1.2.16 淡蓝 → v1.2.17 深蓝**（用户口径先是「将我用红线圈出来的两个透明处将透明改为淡蓝色填满」，看过后又「改成深蓝色吧」）：
   - 背景：v1.2.15 删掉流动之后，三个镂空都是真透明（透出旋钮底色）。用户拿截图用红圈标出
     **眼睛**和**腹部开口**，要求这两处**填满颜色**；背脊斜带不在圈里，**继续真透明**。
     既然不再透，也就不存在「流动」——所以填的是**静态平涂**（v1.2.16 先用淡蓝 `#C7DBFF`，v1.2.17 按用户要求改深蓝 `#1E40AF`，
     仍可用 `--cmes-knobHole` 换色），不是 v1.2.13 那套物料渐变。
   - 几何（`.tmp-whale/emit3.js` 逐条染色实测过）：`WHALE` 是 4 条 subpath 拼成的**一条** `<path>`：
     0 = 外轮廓、1 = 腹部开口、2 = 瞳孔小点、3 = 眼睛。用 `WHALE.match(/M[^M]*/g)` 切成数组后
     `WHALE_SUBS` 取 `[1] + [3]` 拼成 `WHALE_OPENINGS`（腹部 + 眼睛），`WHALE_PUPIL = WHALE_SUBS[2]`。
     **关键**：腹部与眼睛在 nonzero 环绕下本来就是洞，把这两条单独画一层色块**垫在本体下面**，
     本体自然盖住其余部分，所以不需要 clip、不需要 mask、更不需要 evenodd。
   - 三层顺序（`client.js` 的 `knobWhale()`）：`knobWhaleOpening`（色块，最下）→ `knobWhaleBase`
     （`currentColor` 本体）→ `knobWhalePupil`（`currentColor`，最上）。瞳孔必须是最上层、且带
     `stroke:currentColor;stroke-width:1`：瞳孔本身是本体数据里的洞，本体洞边与瞳孔自己的边是
     两条独立的抗锯齿曲线，不描同色边就在放大图里留一圈浅色发丝缝（第一版正是如此，
     `.tmp-whale/eye-crop2.png` 能直接看到那圈环）。
   - CSS 两条：`.${P}-knobWhaleOpening{fill:var(--${P}-knobHole,#1e40af);stroke:none}` 与
     `.${P}-knobWhalePupil{fill:currentColor;stroke:currentColor;stroke-width:1;stroke-linejoin:round}`；
     `.${P}-knobWhaleBase` 仍是 `fill:currentColor`。
   - 实测：`.tmp-whale/emit2.js` 已改成**按内容定位**抽常量与函数（不再写死行号，改注释不会误抽），
     产物 `.tmp-whale/bare2.html` 截图 `v1216e.png`：8x 下眼睛是干净的色块杏仁、腹部是色块月牙、
     背脊斜带仍是透出底色的一道缝；瞳孔缝消失。

17. **镂空填色改跟着滑轨底色走（v1.2.18，用户口径「改成滑动条的底色的颜色吧」）**：
   - 一句话：`.knobWhaleOpening` 的 `fill` 从固定 `#1e40af` 改成
     `var(--${P}-knobHole, var(--${P}-track, #e8e7e8))` —— 即**默认就是滑轨底色**，而且会跟着
     轨道一起被 `trackFor()` 按档位重新染色。
   - 为什么这样接：`--${P}-track` 是 `rail` 元素上的 inline 变量（每次渲染按当前档位的
     `fillEndColor` 混出底色写进去），旋钮 `<div class="knob">` 是 `rail` 的子节点，自定义属性
     天然继承，所以镂空里那块色和轨道**用的是同一个值**，不需要第二套颜色逻辑。
   - 连带观察：拖动时 `paintLive` 只写 `--pos` / `--fillBg`，不写 `--track`，所以拖动过程中
     镂空色停在上一次落定的档位——和轨道本身的行为一致（轨道也不实时变色），松手后一起更新。
   - 实测（`.tmp-whale/emit2.js` 的 6 格现在每格都显式给 `--cmes-track`，否则会静默落到浅色兜底）：
     深色主题 track `#232324` → 镂空是深炭块，白鲸身上像官方 logo 那只深色眼睛，最像原图；
     浅色主题 track `#e8e7e8` → 镂空是极淡的灰，只比白鲸本体深一点点，接近"看不见但痕迹在"。
     两种主题都由 `docs/preview-knob-whale.png` 记录（`gen_docs_preview.py` 已改成把 `t["track"]`
     作为填充色传进 `knob()`）。
   - 想回到固定色：给 `--cmes-knobHole` 赋值即可，链式 `var()` 的第一顺位就是它。
18. **团队协作时滑条流动速度翻倍（v1.2.19，用户口径「当启用智能体团队协作功能时，滑动条的流动速度翻倍」）**：
   - 一句话：新增 `TEAM_FLOW = 2` 与 `flowFor(teamOn)`（返回 1 或 0.5 的**时间乘数**）。
     星尘（`EnergyStars` 里 `starDurationFor(...) * flowFor(teamOn)`，延时由已缩放的时长推出，
     所以相位分布不变）；CSS 侧四个极光 `a1..a4`、Ultra 雾气呼吸、材质扫过全部改成
     `calc(<基准时长> * var(--${P}-flow,1))`，而 `--${P}-flow` 是 `rail` 元素上 inline 盖的
     `flowFor(teamOn)`（team 开=0.5，即 2 倍速）。**`animation-delay` 也按同一乘数缩放**
     （极光 `2.4/.7/3.3`、`2.6/-1.5`、`2.8/-5.5`、`3/-10.7`，雾气 `-4.2`），
     所以各层之间的相位百分比和 idle 时一模一样，只是整体在时间轴上收紧。
   - 为什么是时长乘数而不是重算几何：星尘的条数、泳道高度、相位、缓动曲线都不动，
     只在时间轴上压缩，所以翻转团队位的瞬间星场不会重排、不会出现一坨挤在左端；
     基线与 `prefers-reduced-motion` 分支（`animation:none`）都不受影响。
   - 故意**没**跟着翻倍的：墨溅（`INK_*`，一次性到达反馈，不是流动）、滑轨/填充/旋钮自己的
     `.18s` 跟手过渡（那是交互反馈）。
   - ⚠️ **已被第 19 条（v1.2.20）推翻**：duration/delay 的乘法虽然也测到 2.000 倍，但每次
     重定时都会让动画按新的 delay 重新解析相位，切位瞬间星场和极光会「跳一下」。保留此条只为
     记录当时的做法与数字。
   - 实测（`.tmp-whale/verify_flow.js`：从 `client.js` 里抽出真实 CSS 模板并解析 `${...}`，
     用 headless Edge 读 `getComputedStyle(...).animationDuration`）：`--cmes-flow:1` 时
     雾气 `13.6s`、极光 `0.9s/8.5s/4.5s`、`0.9s/13s`、`0.9s/16s`、`0.9s/23s`、材质 `1.8s`；
     `:0.5` 时逐项正好一半（`6.8s`、`4.25s`、`6.5s`、`8s`、`11.5s`、`0.9s`），比例全是 **2.000**；
     星尘 index 0 从 `2.822s` → `1.411s`，三个采样点比例 2/2/2；`animationDelay` 同步减半
     （雾气 `-4.2s`→`-2.1s`，a1 `2.4/0.7/3.3s`→`1.2/0.35/1.65s`，a2 `2.6/-1.5s`→`1.3/-0.75s`，
     a3 `2.8/-5.5s`→`1.4/-2.75s`，a4 `3/-10.7s`→`1.5/-5.35s`）。

19. **加速方式改成「不切换动画」（v1.2.20，用户口径「能不能在原流动动画的基础上直接加速，而不切换动画」）**：
   - 一句话：把第 18 条的 CSS 重定时全部撤掉（duration / delay / `--cmes-flow` 都回到原始值），
     改成对**正在运行的动画对象**下 `playbackRate`：
     ```
     function applyFlowRate(el, teamOn) {
       const rate = teamOn ? TEAM_FLOW : 1;              // TEAM_FLOW = 2
       for (const anim of el.getAnimations({ subtree: true })) anim.playbackRate = rate;
     }
     ```
     组件里挂一个 `useEffect(..., [teamOn, peak])`：翻转时对 `railRef` 整棵子树刷一遍；
     再挂一个 capture 阶段的 `animationstart` 监听，把**晚到**的动画（升到 Ultra 层才挂载的
     材质/雾气/极光、被档位变化重建的星尘）也补上速率。
   - 为什么这样更好：`playbackRate` 只改时钟走多快，**不碰 `currentTime`**，所以翻转那一刻
     每颗星、每层极光都停在原帧，键帧/时长/延时/缓动一个字节没动；关掉时写回 1 也是精确复位。
     第 18 条那种改 `animation-duration` + `animation-delay` 的做法虽然也快 2 倍，但重定时等于
     让动画按新的 delay 重新对相位，视觉上会跳。
   - 与重渲染共存：`EnergyStars` 的 duration/delay 仍然按档位实时写 inline style（拖动时每帧变），
     实测改 `animationDuration` 后 `getAnimations()` 返回的是**同一个** CSSAnimation 对象，
     `playbackRate` 保持 2、`currentTime` 不跳（见下面的实测第 4 项），所以拖动不会把加速刷掉。
   - 故意没加速的：到达喷气 `SPOUT_*`（一次性手势反馈，v1.2.21 前叫 `INK_*`）、`.prefers-reduced-motion` 下本来就是
     `animation:none`（没有动画对象，`getAnimations` 也拿不到）。
   - 实测（两套）：
     1) `.tmp-whale/verify_rate.js`（headless Edge，虚拟时间）：两趟的 computed
        `animationDuration` 完全一致——雾气 `13.6s`、a1 `0.9s, 8.5s, 4.5s`、a4 `0.9s, 23s`、
        扫过 `1.8s, 0.2s`，证明 CSS 里**没有**任何重定时残留；`playbackRate` idle=1、team=2；
        设置速率前后 `currentTime` 差 **0ms**（不跳）。
     2) `.tmp-whale/gen_probe.js` 生成的两张探针页，在真实 Chromium（ego 浏览器）里用 rAF
        采样 `currentTime` 对 `performance.now()` 求斜率：rate 1 → **slope 1**（5506ms 内前进
        5506ms），rate 2 → **slope 2**（2027.6ms 内前进 4055.3ms）。
     3) 同一页面里把 `.cmes-efstar` 的 `animationDuration` 从 `2.82s` 改成 `1.9s`（模拟档位重渲染）：
        `sameObject: true`、`playbackRate` 仍为 2、`currentTime` 未变。

20. **到达反馈从「墨汁溅射」换成「鲸鱼喷气」（v1.2.21，用户口径「把墨汁喷溅换成喷气实装」）**：
   - 为什么换：八个深色墨点从旋钮径向炸开，视觉上是**喷墨**——那是章鱼的动作；我们自己的 logo 是鲸，
     鲸表达情绪的方式是**换气**。同一处一次性反馈换成：气柱从呼吸孔拔起 → 顶端翻成伞状 → 几粒水珠回落后散掉。
   - 锚点：`SPOUT_HOLE_X = 12`、`SPOUT_HOLE_Y = -21`（46 单位参考系，× `SPOUT_SCALE = KNOB_D/46 = 0.5435`
     → 实际 `+6.52px, -11.41px`）。**必须是呼吸孔、不是旋钮圆心**：字模是镜像的（鲸朝右），
     头骨最高点在圆心右侧一点，从背中间冒气读起来像"冒烟"。
   - 结构（全部挂在 `.${P}-spout` 上，`left` 由 `knobLeft` 给，和原来的 `InkRing` 一样）：
     `.plume` 柔光体积 → `.jet.j1/.j2/.j3` 三层气柱（每层都是 `clip-path` 下窄上宽的喇叭口 +
     上缘 `mask-image` 渐隐，`transform-origin:50% 100%` + `translate(-50%,-100%)` 让底部正好压在呼吸孔上，
     于是 `scaleY` 一拉就是"从孔里窜出来"；**三层是必要的**——单层几何锥读作"光束"，
     宽的一层滞后 45ms、细的一层滞后 85ms，边缘互相错开才像喷出来的水汽）
     → `.crown` 顶端伞云（21×9 单位）→ `.mist` ×2 侧向漂散 → `.burble` ×2 孔口小泡 → `.drop` ×7 水珠（抛物线：
     62% 到最远点，末帧回落到 `dy*0.72`，读作被重力拽回来）。
   - 时间：`SPOUT_START_DELAY = 30`、`SPOUT_DURATION = 560`、`SPOUT_TOTAL = 660`（原来是
     `INK_START_DELAY 70 + INK_DURATION 400 + 28 = 498`）。水珠的 `--dur` 是「剩给自己的时间」
     （`SPOUT_DURATION - delay`），所以七粒同时落地，不是一根越来越长的尾巴。
   - 颜色：白到淡蓝 `#ffffff / #f2fbff / #eafaff / #dcefff`，每粒带 `box-shadow` 冷光；
     **不用深色**——深色是墨，白色才是水汽。
   - 同样在 `prefers-reduced-motion` 里整层 `display:none`（一句慢速喷气读起来像故障）。
   - 验证：`demo/make-spout-harness.mjs` 从 `client.js` **原文**抽出喷气 CSS 段（`${P}`→`cmes`）
     与 `SPOUT_*` 常量块 + `spoutDropStyle()`，在 `demo/spout-harness.html` 里按真实几何（25px 旋钮、
     41.13×30 鲸鱼、`translate(22.9509 0) scale(-1 1)`）重放，用 `getAnimations()` 的 `pause()` +
     `currentTime` 定格到 140/260/380/500/600ms 逐帧看形——所以看到的形状就是发布形状。
     换尺寸只改 `SPOUT_HOLE_X/Y` 与 CSS 里的 `*-px * var(--s)`。

21. **喷气补齐与一个 0×0 的老 bug（v1.2.22，用户口径「把鲸鱼喷气效果在这个基础上再做的稍微丰富一点」）**：
   - **先修 bug**：`.jet` 的尺寸写的是 `calc(var(--jw) * var(--s))`，而 `--jw/--jh` 是无单位数字、
     `--s` 也是数字，**数字×数字是非法长度**，浏览器直接丢掉这条声明 → 三层气柱从 v1.2.21 起一直是 `0×0`，
     **一次都没画出来**。屏幕上看到的那道「气柱」其实只是 `.plume` 的柔光体积。
     改成 `calc(var(--jw) * 1px * var(--s))` 之后气柱才真的存在——所以 v1.2.22 的画面变化里，有一半是「补上」。
   - **放大**：`SPOUT_GAIN = 1.15`（只乘到 `--s`）。46 空间里的尺寸乘 `SPOUT_SCALE = 0.5435` 后整团只有 21px 高，
     压在 25px 旋钮上比例是对的，但新加的伞沿、闪点、二次 chuff 小到看不见。`--shx/--shy` **仍按 `SPOUT_SCALE` 算**，
     所以喷口还精确落在呼吸孔上，长高的只是水汽。
   - **新增十层**（都挂在同一次动画里，不改触发逻辑）：
     `.halo` 孔口光晕（`halo-pulse`）、`.bwash` 背部横向水膜（`bwash-spread`）、
     `.shock` 扁椭圆冲击环（`shock-ring`）、`.thread.t1/.t2/.t3` 三根引路细丝（`thread-rise`，各自 `--tx/--ty` 甩开不同角度）、
     `.fan.l/.r` **一对向外翻的伞沿**（`fan-bloom`，这是把轮廓从「光柱」变成「喷泉」的关键）、
     `.puff` 第二声 chuff（`puff-chuff`）、`.glint.g1/.g2/.g3` 四角星反光（`glint-twinkle`，`clip-path` 画的，不用图片）、
     `.drip` 那滴回落到鲸鱼背上的重水珠（`drip-fall`）。
   - **水珠**从 7 粒加到 11 粒，并把圆点改成**沿自身飞行线拉长的椭球**：
     `--tilt` 转弯、`--stretch` 拉长（`rotate(var(--tilt)) scaleY(var(--stretch))`）。
     另加 `DROP_SIZE_SCALE = 1.25`——原来 1.5–3 单位换算下来只有 1–1.6px，是「灰」不是「水」。
   - **时间**：`SPOUT_DURATION 560 → 640`（给 +240ms 的第二声 chuff 腾地方），`SPOUT_TOTAL` 跟着变 `740`；
     新层的动画时长一律写成 `calc(var(--dur) - 240ms)` 之类，保证仍落在同一次手势里，不拖尾。
   - **验证**：`node demo/make-spout-harness.mjs` → `demo/spout-harness.html?v=9`，定格 170/300/430/560/680ms 看形。
     注意 ego 浏览器窗口只有几百 px 高时，`clip` 超出视口会让 `Page.captureScreenshot` 挂住，先 `ego_page_info` 量一下再截。
## 4. 继续改之前必须知道的
- **改完要刷新页面**（客户端 bundle 在页面加载时注入）；插件页显示的版本号要**完全退出重开**才更新。
- `client.js` 里 CSS 是一个模板字符串（`const CSS = \`...\``），**注释与文字里不能出现反引号**，否则整个文件语法错误。
- 三处几何常量都在 `WHALE_TRIO` / `.cmes-teamMark` 的 CSS 里；改图标只动这两处 + `docs/preview.svg` 的 `<g>`。
- 旋钮鲸鱼（v1.2.9）另有一份：`WHALE_BOX` / `WHALE_REFLECT`（`WHALE` 路径本身的 bbox 与镜像轴）
  + `knobWhale()`；**镜像靠 `translate(WHALE_REFLECT 0) scale(-1 1)`**，别手动改路径里的坐标。
  旋钮盒子仍是 `KNOB_D = 25`（字形是 `KNOB_WHALE_H = 30` + `KNOB_WHALE_W = 41.13` 按 bbox 比例算出来，
  v1.2.13 起比轨道和定位盒都大一圈，**这是故意的**）；改鲸鱼大小只动 `KNOB_WHALE_H`，宽度和 `viewBox` 会自己缩。
  旋钮鲸鱼是**三层、全静态**（v1.2.16）：`knobWhale()` = `knobWhaleOpening`（平涂，默认就是 `--cmes-track` 滑轨底色，画腹部+眼睛）
  → `knobWhaleBase`（`currentColor` 本体）→ `knobWhalePupil`（`currentColor` + 同色描边，堵住瞳孔缝），
  一个 `<svg>` 三个 `<path>`。**不要再往里面加 `rect` / `<circle>` / `mask` / `clipPath` / 渐变 / 动画** ——
  v1.2.13（物料渐变）、v1.2.14（mask 星尘）两套已整层删除，用户要的就是内部既没有流动、也不是透的。
  换填充色只改 `--cmes-knobHole`（默认接 `--cmes-track`，即滑轨底色）或 `.knobWhaleOpening` 的 `fill`；要改大小只改 `KNOB_WHALE_H`。
- 团队开关：Host 状态在 `agentTeam` 投影里，官方「模型菜单里的 Enable agent teamwork」读同一份；
  但本次会话里**开关会被回合边界重置**（我边跑回合边切时观察到），属宿主行为，不是按钮逻辑。
- 官方 UI 关闭团队时会弹确认框，这个按钮**直接切**（按用户要求）。
- 上游 `docs/SPEC.md`（像素规格）、`INCIDENTS.md`（事故复盘）**没有**打进本目录，
  需要时去 `工作区/ref/upstream/` 或上游仓库看。

## 5. 打包与安装

- 归档：`dist/dsh-codex-model-effort-selector-1.2.28.zip`（可直接解压到任意目录，用插件面板安装）
  与 `dist/dsh-codex-model-effort-selector-1.2.28.tgz`（npm 风格），与源码目录同步重建；
  旧的 `-1.2.2`、`-1.2.10`、`-1.2.11`、`-1.2.12`、`-1.2.13`、`-1.2.14`、`-1.2.15`、`-1.2.16`、`-1.2.17`、`-1.2.18`、`-1.2.19`、`-1.2.20`、`-1.2.21`、`-1.2.22`–`-1.2.27` 包都是历史，别再用
  （1.2.13/1.2.14 的镂空里还在跑渐变和星尘；1.2.15 的镂空是透的；1.2.16 眼睛腹部是淡蓝的；1.2.17 是深蓝的；**跟着滑轨底色走**只有 1.2.18 起才有；**团队协作时流动翻倍**只有 1.2.19 起才有，但 1.2.19 是重定时、切位会跳，**不跳的 playbackRate 版**才是 1.2.20；**到达喷气**只有 1.2.21 起才有，1.2.20 及以前喷的是墨；**气柱真的画出来 + 伞沿/闪点/二次 chuff/回落水珠**只有 1.2.22 起才有，1.2.21 的三层气柱是 0×0）。
- 桌面版安装：设置 → 插件 → 添加插件 → 填解压后的**目录绝对路径** → 立即启用 → 完全重启
- 命令行（非 desktop profile）：`dsh plugin --profile <profile> add link:"<目录绝对路径>"`
- ⚠️ 安装后**不要移动或删除**该目录（`link:` 指向它）

## 6. v1.2.23 —— 海水色标 + 水流粒子 + 团队小队

这一版把 demo（`default-workspace/demo/water-flow/`）的视觉搬进插件。三块改动，互不依赖。

### 6.1 颜色：四档色标，档内不连续变

`fillBackground(ratio)` 不再返回「起点蓝 → 终点紫」的两色渐变，而是**六个固定位置
（0/20/40/60/80/100%）的色标**，档位只换这六个色标的颜色：

| 档 | 六个色标 |
| --- | --- |
| Off  | 淡化 a、淡化 a、a、a、a、a |
| Low  | a ×6 |
| High | a、a、a、b、b、b |
| Max  | a、a、b、b、c、c |

浅色 `a=rgb(134,194,234)`、`b=rgb(58,120,196)`、`c=rgb(17,58,110)`；深色 `a=rgb(110,170,214)`、
`b=rgb(44,104,168)`、`c=rgb(14,48,92)`。**没有青碧色**，色相统一在 210° 附近。

**档间过渡不靠 CSS `@property`**：`waterStopsAt(ratio, dark)` 把连续 ratio 映射到四个
作者档位之间做 smoothstep 插值，所以拖动时颜色是连续跨档的，落点正好在某档上时逐字节
复现那一档。好处是 live 拖动（`paintLive` 每次 pointermove 都重写 `--cmes-fillBg`）天然
平滑，不需要额外补间，也不怕 `@property` 在旧 Chromium 里不生效。

`fillEndColor(ratio, dark)` 保留原名（`trackFor` / `mixHex` 还在问），内部改成
`waterDeepAt()`，即渐变最深那一端，未填充轨道的 tint 因此跟着档位走。

深色主题走 `--cmes-fillBgDark`（`fillBackgroundDark`），CSS 里
`body[data-ds-dark-theme] .cmes-fill` 取它；`paintLive` / `snapLive` 现在同时写两个变量。

### 6.2 水流：替换星尘，没有光点

`.cmes-efstars` / `.cmes-efstar` / `.cmes-efstarDot` 整层删除，换成：

- `.cmes-water`（容器，z-index 2）
- `.cmes-flow`（lane，1.3px 高，`flow-sweep` 只做 `translate3d(-100%,0,0)`）
- `.cmes-flow > i`（水纹线：`--cmes-fw` 宽 26..74px、两端渐隐白渐变、`blur(.25px)`、`flow-bob` 上下 ±1.2px）
- `.cmes-flow > i::before`（下沿深青影 `rgba(11,66,96,.34)`，让浅色水体上也读得出来）
- `.cmes-flow.wisp > i`（45% 的 lane 追加一条更细更淡的副痕）
- `.cmes-bubble`（只在 Max 档，1–2 颗/lane，`bubble-rise`）

**lane 上没有 opacity 淡入淡出**（v1.2.23 前的星尘有 `0→7% 1→90% 1→100% 0`）。实测那样
会出现整条 rail 只剩背景的空档；现在进出全靠线自身两端渐隐，任意时刻都有水纹在场。

深度分层：`depthOf(row)=(row.y-8)/84`，近处更粗更亮更快
（`--fw = 26+depth*22+hash*26`、`opacity = .45+depth*.5`、`duration /= (0.78+0.44*depth)`）。
`STAR_ROWS` / `starHash` / `starSpeed` / `starCountFor` 这些确定性表**原样复用**——它们只是
「22 条 lane 的相位与高度」，与星点与否无关，改名字的收益低于改名的风险。

Max 档的气泡由 `peak = isPeakId(displayed)` 决定，与 `UltraLayer` 同一条件。

### 6.2b 粒子结构对齐 demo（1.2.23 补丁）

第一版只给每条 lane 生成一条线、把 wisp 做成给主线加 class 变淡，和 demo 的 `buildLane` A 分支差了三处，视觉上整条 bar 变成了平行划痕。现按 demo 逐项对齐：

| 项 | demo `template.html` | 现在 `client.js` |
| --- | --- | --- |
| 每 lane 主线数 | `hash(index,47)>0.55 ? 2 : 1` | 同 |
| 第二条错位 | `marginLeft 40 + hash(index,53)*50` | 同 |
| 主线抖动 | `marginTop (hash(index+k*5,61)-.5)*5` | 同 |
| 线高 | `calc(1.3px * --ds)`，`--ds = .8 + depth*.6` | 同（原先写死 1.3px） |
| 上沿高光 | `::after` `left/right:12%`、`.7px`、blur `.18px` | 补上了（原先只有下沿影） |
| 渐变 | 5 段 `0/22/55/78/100` | 同（原先 3 段 `.52/.30/.10`） |
| 短线 | 独立 `<i class="wisp">`，12–30px，`bob*1.6` | 改成独立元素（原先只是给主线加 class） |
| 气泡 | `marginLeft 6 + hash(index*5+k,103)*74` | 同（原先 90） |

另外删掉了 `.cmes-water` 容器上的 `opacity: starOpacityFor(ratio)`。逐条线已经带了 `0.45 + depth*0.5`，再乘一层 0.6–1.0 的能量系数，低档整层会淡成雾。现在低档只是"线少"，不是"线淡"。

### 6.2c 水体上下分层的修复（1.2.25）

现象：水面在 rail 高度约 64% 处出现一条水平接缝，上下两段纹理不连续，深色主题下像两层拼起来的。

原因：`.cmes-tex` 写了 `background-size:auto 14px`。rail 只有 22px 高，纹理 14px 一个周期垂直重复，第二行只剩 8px 被裁，斜纹在两行交界处相位断开；再叠 `mix-blend-mode:overlay`（比 soft-light 强得多）和 `opacity:.9`，接缝被放大成一条明显分界。

修法：回到 demo 的写法——

| 属性 | 错的值 | 现在（= demo） |
| --- | --- | --- |
| inset | `0` | `-30% -10%`（纹理超出容器，接缝推到可视区外） |
| background-size | `auto 14px` | 不写（默认 auto，连续） |
| 混合模式 | `overlay` | `soft-light` |
| opacity | `.9` | `.85` |
| 纹样 | `1px/12px` 单线 | `0 5px / .10 5px 7px / 0 7px 15px` 三停 |

`.cmes-swell` 同步从 `inset:-10% 0` 改成 `-45% -25%`，条纹 62/148px 改成 54/76/148px。

验收：把 rail 区域按行取平均亮度扫描，浅色主题最大单行变化 6.8、深色 8.2，全部落在斜纹自身的斜率上，没有单行阶跃。

### 6.3 团队小队

`body.team`（即 `.cmes-rail.team`）时，`.cmes-knob` 内新增 `.cmes-pod`，里面两只缩小鲸鱼：

- `.podBig`：`30.2 × 22px`（高 = `RAIL_H`），`1.7s`
- `.podMid`：`20.1 × 14.7px`（`RAIL_H * 2/3`），`2.2s`

`pod-bob` 同时做上下 ±1.6px 与前后 ∓1.7px 位移 + ±2.6° 摆动，两只周期不同、负延迟错开，
所以看上去是「大的领着小的在游」，不是两只同步抖。

`.cmes-pod` 在 **knob 内部**（`right:calc(100% + 12px)`），所以拖动时零成本跟随，不存在
第二套位置计算与漂移。12px 是因为鲸鱼字形本身已经伸出 knob 左缘约 8px，取 12 才不会重叠。

`--cmes-podfade = clamp01((pos - .02) / .11)` 写在 rail 上：knob 停在最左时小队淡出，
浪迹不会捅出卡片边缘。

`podWhale()` 只用**本体 path**（`WHALE`），不带 opening / pupil —— 22px 和 15px 下那两个
细节会糊成噪点，描边加轮廓才是这个尺寸能读出来的鲸鱼。**鲸鱼三层结构本身没动**（见 §3 的告诫）。

二倍速不在这里做：`applyFlowRate(rail, teamOn)` 仍然用 `playbackRate = 2`，
所以小队、水流、水体纹理、喷气一起翻倍，且切位不跳相位。

### 6.4 顺手改的

- `.cmes-tex`（101° 细斜纹，`overlay`，5.2s）与 `.cmes-swell`（62/148px，`soft-light`，3.6s）
  两层水体纹理，加在 `.cmes-fill` 里 `.cmes-water` 之下——这是「管子灌满水」观感的来源。
- Ultra 层四道 aurora 从紫色系改成冷海水色（`rgba(226,246,255,…)` / `rgba(96,168,222,…)` /
  `rgba(168,214,244,…)` / `rgba(40,96,158,…)`）。深蓝水体上叠紫色会脏；结构没动。
- `prefers-reduced-motion` 段的类名同步成 `.cmes-flow / .cmes-flow > i / .cmes-bubble / .cmes-tex / .cmes-swell / .cmes-podw`。
- `starBrightnessFor()` 删除（原本只喂 `.efstarDot`）。

### 6.5 验证过的数值

`waterStopsAt` 在四档上的输出（浅色）：

```
Off   #aad4f0 #aad4f0 #86c2ea #86c2ea #86c2ea #86c2ea
Low   #86c2ea #86c2ea #86c2ea #86c2ea #86c2ea #86c2ea
High  #86c2ea #86c2ea #86c2ea #3a78c4 #3a78c4 #3a78c4
Max   #86c2ea #86c2ea #3a78c4 #3a78c4 #113a6e #113a6e
```

`Low` 之后 0.36→0.64 的中间态逐帧跨向 `High`，没有跳变。七档 provider 采样同一张表的
分数位置，仍然平滑。
### 6.6 两个踩过的坑（都已在代码注释里标了）

1. **气泡不能是 lane 的 `<i>`**。`.cmes-flow > i` 是 0,1,1 优先级，`.cmes-bubble` 是 0,1,0 ——
   气泡会继承水纹线的 44px 宽渐变和 `flow-bob`，看起来就是「多出来几条水纹」而不是圆泡。
   现在气泡是 `<b class="cmes-bubble">`，`.flow > i` 选不中它。
2. **`.cmes-ultra` 原本是紫色不透明渐变**（`#3d74e8 → #7c3aed → #6d28d9`）。Max 档 `peak` 为真时
   它盖在六色标上，整条 bar 变紫罗兰。现在改成**半透明的冷色带 + `mix-blend-mode:soft-light`**
   （alpha 6%–17%），只压深右侧、提亮左上，六色标的「浅/蓝/深」三段仍然读得出来。

### 6.7 离线验证工具

`render.mjs`：在 node 里 stub `window.__ModuleLoader__`、给一个手写的 React（`createElement` +
单遍 hook 运行时），把 `client.js` 的 `Selector` 直接渲染成静态 HTML + 内联 `<style>`，
再按档位导出 `preview-<level>.html`，浏览器打开就能看四档实际像素。

```bash
node render.mjs off  full preview-off.html
node render.mjs max  full preview-max.html
```

它只跑一次渲染（不重渲染），所以 `useState` 的交互态用 override 数组注入
（`[true, true, 'effort', …]` 依次对应 open / present / pane）。`useEffect` / `useLayoutEffect`
被跳过，`getBoundingClientRect` 一类宿主测量因此不会执行。

`preview-tiers.png` 是四档的合成图：Off 空、Low 一整条浅蓝、High 前半浅蓝后半蓝、
Max 浅/蓝/深三段 + 气泡。

## 7. v1.2.26 —— 档位字改成「本档滑条自己的颜色」

用户口径：「把思考等级的 Off、Low、High 和 Max 的字体颜色设置为对应滑动条背景颜色」。

改之前档位字是**固定**淡蓝（深色 `#a9d6ff` / 浅色 `#2a78c4`，见 §3 第 4 条），四档共用一色。
现在 `effortInk(fraction, dark)` 按「这一档滑条自己的颜色」算字色；`--cmes-ink` 的三处盖章
（rail / trigger / popover）一行没动，只是喂进去的函数换了实现。

### 7.1 怎么算「对应」

底色 = 旋钮所在位置的填充色 `waterDeepAt(f, dark)`，再按填充进度混回空轨道
（`mixHex(railBase, deep, TRACK_TINT)`，`TRACK_TINT` 与 `trackFor()` 同为 0.22）：

```js
const deep = waterDeepAt(f, dark);
const trackHex = mixHex(railBase(dark), rgbToHex(deep), TRACK_TINT);
const base = rgbMix(hexToRgb(trackHex), deep, clamp01(f * 3));
```

Off 那一档几乎没有填充，所以它拿到的是**空轨道的淡灰蓝**——不灌水时看到的就是这个颜色，
比「一点点蓝」更贴 Off 的语义。

### 7.2 只动明度，色相不动

底色不能直接当字色：浅色卡 `#f8f9fa` 上 Off 的 `#d2dfe8` 只有 **1.7:1**，深色卡 `#2a2b2e`
上 Max 的 `#0e305c` 只有 **1.2:1**。所以 `solveInk()` 保留色相，饱和度设下限 **0.5**
（海水最淡那端几乎是中性灰，不加下限 Off 会算成灰白 `#c4ced6`，就不像水了），只沿明度轴
往外走到刚好过 AA：

| 主题 | Off | Low | High | Max |
| --- | --- | --- | --- | --- |
| 深色 | `#b3d0e6` 8.8:1 | `#93c0e1` 7.3:1 | `#7eacdd` 6.0:1 | `#609ae7` 4.9:1 |
| 浅色 | `#3675a1` 4.7:1 | `#1c6ba0` 5.4:1 | `#2b5992` 6.8:1 | `#113a6e` 10.7:1 |

Max 在浅色里**一点没动**（`#113a6e` 本来就有 10.7:1，求解器第一步就返回底座色），
所以浅色 Max 的字色与滑条最深处完全同色；深色 Max 则必须提亮到 4.9:1 才看得见。

两条 ramp 都单调、都 ≥4.5，四档既互相区分，又各自就是本档的水色。`inkCache` 按
`(主题, round(f*256))` 缓存 128 条，滑条每次重渲染不会重复求解。

### 7.3 验证

- `render.mjs` 加了一个开关：`DARK=1 node render.mjs high nope out.html` 会喂
  `document.body.hasAttribute('data-ds-dark-theme') === true`，并且把预览页底色换成 `#101418`
  ——之前沙箱里的 `document.body` 只有 `{dataset:{}}`，所以以前只能渲染浅色。
- 四档浅/深共 8 张预览逐个查 `--cmes-ink`，值就是 §7.2 表里那 8 个。
- 合成图：`docs/preview-ink-dark.png`（深色四档弹层）、`docs/preview-ink-light.png`（浅色四档）、
  `docs/preview-ink-levels.png`（四档字色 + 对应滑条底色 + 实测对比度同屏对照）。

## 8. v1.2.27 —— 到顶那句「更快消耗使用额度」改深蓝

用户口径：「把当滑动鲸鱼图标滑动到最大档位时的『更快消耗使用额度』的字体改为深蓝色」。

改之前那句是**紫色流光**：`background:linear-gradient(90deg,#a965dd,#653780,…)` +
`background-clip:text` + `color:transparent`，再跑一个 `cmes-sweep` 让亮带扫过去
（深色主题把 `--cmes-warnHi/Lo` 换成 `#c39bff`/`#f3e6ff`）。现在整段渐变、`clip`、`sweep`
一起删掉，只剩实色字：

```css
.cmes-warning span{display:inline-block;color:var(--cmes-warnInk,#113a6e);
                   -webkit-text-fill-color:currentColor}
```

### 8.1 「深蓝」取哪个蓝

不新造色号，直接取**同一条阶梯最顶端那一档的墨色** `effortInk(1, dark)`，
也就是 Max 档位字自己的颜色，由 JS 以 `--cmes-warnInk` 内联盖在 `.cmes-warning` 上：

| 主题 | 值 | 卡面对比度 |
| --- | --- | --- |
| 浅色 | `#113a6e` | 10.7:1 |
| 深色 | `#609ae7` | 4.9:1 |

浅色就是用户要的深藏蓝，而且和滑条最深处、Max 那个字**完全同色**。深色主题下纯 NAVY
（`#113a6e`）压在 `#2a2b2e` 的卡上只有 1 点多，等于看不见，所以沿用 §7.2 的求解结果
把同一色相提到 4.9:1——这是这条色相在深卡上「还能看清」的最低亮度，HANDOFF 留档备查。
`docs/HANDOFF.md` 第 2 节那条「浅色主题未实测」对本次改动**不适用**：两句都在离屏渲染里
逐字量过计算样式（见 8.2）。

### 8.2 验证

- `render.mjs` 加了 `MESSAGE=1`：第 8 个 `useState` 就是 `message`，喂 `true` 才能把
  那句 1800ms 的瞬时提示钉在预览里（以前没有任何办法截到它）。
- `MESSAGE=1 node render.mjs max nope preview-warn-light.html` →
  计算样式 `rgb(17,58,110)`、`background-image:none`、`animation-name:none`、
  `--cmes-warnInk:#113a6e`；`MESSAGE=1 DARK=1 …` → `rgb(96,154,231)`、`--cmes-warnInk:#609ae7`。
- 出图：`docs/preview-warn-light.png`、`docs/preview-warn-dark.png`（弹层元素截图，3 倍 zoom）。
  文案在渲染沙箱里走 `t=k=>k`，所以截图上显示的是字典键 `warning`，字色不受影响。

> v1.2.28 把触发点从「滑到顶」搬到了「打开团队协作」，词也换了，见 §9。

## 9. v1.2.28 —— 这句警告改挂到「团队协作开关」上，并换词

用户口径：「把警告放在启用智能体团队后显示，同时改成『更快消耗推理 token』」。

v1.2.27 那句是**滑条到顶**时闪的（`enterPeak()` ← `showEffort()`）。现在触发点整个搬家：

| | v1.2.27 | v1.2.28 |
| --- | --- | --- |
| 谁触发 | 档位从非顶档进入 `max`/`ultra` | 团队协作开关被**打开**（Host 确认成功后） |
| 文案 zh / en | `更快消耗使用额度` / `Consumes usage quota faster` | `更快消耗推理 token` / `Burns reasoning tokens faster` |
| 颜色 | 深蓝（同 v1.2.27） | 没动 |

### 9.1 为什么搬

- **代价的可见性不对等**：顶档是用户自己推上去的、当轮就结束、而且档位名就印在原位；团队协作是 3~4× token
  的持续倍数，写在 `#cmes-team-tip` 这个 **hover tooltip** 里（`client.js:2680`，靠 `tipOn`），
  鼠标不悬停就永远读不到，而且一开就跨回合生效。
- **交互语法**：1.8 秒一次性淡入是「状态变更确认」的语法，开关是状态变更；滑条到顶已经有插件里最贵的反馈
  （Ultra 材质、四层极光、鲸鱼喷气、星尘变密），再加一句话是把同一件事说两遍。
- **文案该跟语义走**：`reasoningTokens` 是 DSH token-meter 里真实存在的桶
  （`dsh-token-meter/src/turn-usage.ts:24`），顶档主要是**更慢**，真正把它撑成倍数的是多 agent 并行，
  所以这句话的主语本来就是团队模式。

### 9.2 代码怎么改的

- `message` 从布尔改成**文案 key**：`const [message, setMessage] = useState(null)`（`client.js:1653`）。
  渲染处 `t(message)`（`client.js:2551`），`.message` 那个 class 判断不用改，字符串非空即真。
- `enterPeak()` → `flash(key)`（`client.js:1921`）：清旧 timer → `setMessage(key)` → 1800ms 后归 `null`。
- `showEffort()` 只剩两行（记 preview + setPreview），**不再**碰 message——所以现在在滑条上把鲸鱼拖到顶、
  或用方向键/End 跳到顶档，都不会再出这句。
- `toggleTeam()`（`client.js:1704`）的 `settle()` 里 `if (next) flash('warning')`：**只在打开方向**、
  且**只在 Host 回执成功之后**闪。失败分支先 `return`，所以不会出现「开关没开成却警告你多花钱」。
- 两处 reset（`client.js:2020`、`client.js:2262`）`setMessage(null)`。
- `render.mjs` 的 `MESSAGE=1` 现在喂的是 `'warning'` 这个 key，不是 `true`。

### 9.3 验证到哪一步

- `node --check client.js` 通过；`MESSAGE=1 node render.mjs max nope …` 渲染出来的节点是
  `<div class="cmes-warning" style="--cmes-warnInk:#113a6e"><span>warning</span></div>`
  （沙箱里 `t=k=>k`，所以显示的是 key）。
- 单行放得下：真文案在 13px 下宽 **114.2px**，而这一行的可用宽度是 **174px**（232 − 29 − 29），
  行高 18px 不换行。
- 出图：`docs/preview-warn-light.png`、`docs/preview-warn-dark.png`（已把 span 文本换成真文案再截）。
- ⚠️ **没实测**：真机上点鲸鱼按钮触发这条提示的动效（离屏渲染只跑 `useState` 初值，不跑事件）。
  要实测就在 DSH 里开关一次团队协作，看档位名那一行是否让位 1.8 秒。

## 10. v1.2.29：收起态只剩箭头 → 换成宿主自己的图标

**症状**（用户截图）：打开左/右任一侧边栏后，推理强度选择器塌成一个圆角小方块，
里面只有一个向下的箭头。

**成因**：宿主 composer 行带 `container-type: inline-size`，侧边栏一开行宽变窄，
`observeControlRow()` 就给这一行盖上 `data-model-compact`
（`--dsh-composer-model-text-display:none` + `--dsh-composer-model-icon-display:block`）。
插件早就接住了这套变量（`.cmes-compact` / `.cmes-caption` / `.cmes-triggerEffort`），
但 `.cmes-compact` 里那颗图标用的是 `icon('model')`，走的是默认 class `.cmes-icon`——
**而这个 class 从来没有任何 `width/height`**。一个只有 `viewBox` 的行内 `<svg>` 按默认
对象尺寸（300×150）参与 flex 布局，作为可收缩兄弟节点被压成 0 宽，于是席位上只剩
`flex:none` 的 12px 箭头。离屏复现命令：`node render-trigger-probe.mjs`（修复前截图里
compact 行确实只有 chevron）。

**改法**（`client.js`）：

1. 新增 `DSH_GLYPH` 表，把宿主 `dsh-web-frontend` 图标表里的两条字形逐字节抄进来：
   `data-outline`（16×16，intrinsic 16，`fill:currentColor` 的盘体 + 描边的齿轮缺口）
   与 `chevron-down-outline`（16×16 viewBox，intrinsic **14**，路径
   `M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6`）。
   宿主 `p7={regular:1,medium:1.3}`，所以 `regular` = `stroke-width:1`，
   这也正是 `ModelSelect.trigger` 里 `IconDataOutlineRegular size={16}` 与
   默认 14px chevron 的画法。
2. 新增 `dshIcon(name, cls)`：`viewBox:'0 0 16 16'`、`strokeWidth:1`、
   `width=height=glyph.size`，按宿主的方式逐 path 输出。
3. 席位改用 `dshIcon('data', 'cmes-compactIcon')` + `dshIcon('chevronDown', 'cmes-chev')`；
   `-.cmes-compactIcon{width:16px;height:16px;flex:none;color:var(--dsw-alias-label-secondary)}`
   （宿主 `.triggerIcon` 就吃 `label-secondary`），`.cmes-chev` 12px → **14px** 对齐宿主。
4. 删掉 `ICON.down` / `ICON.model`（弹层内部那些 24 单位自绘字形不动）。

**验证**：`node --check client.js` 通过；`.tmp-trigger-probe.mjs` 生成的
`render-trigger-compare.html` 在 compact 变量下渲染为 `[16px data 图标][14px chevron]`，
与宿主 `ModelSelect` 的 28px 席位一致（padding 仍是我们自己的 0 7px、gap 5px）。
⚠️ 没在真 GUI 里点过：本地 `dsh web` 需要 token 才能开，改完要 **reload 一次页面** 才生效
（profile 是 `link:`，文件已经是最新）。

## 11. v1.2.30：一次结构清理 + 修掉一批隐 bug

这一版**不改外观**（离屏渲染输出的 HTML 只有一处 +314 字节，来自把内联样式搬进 CSS），
只动结构与交互正确性。清单按「先 bug、后结构」排，每条都能单独回滚。

### 11.1 修掉的 bug（有症状、有原因）

1. **暗色主题下未填充轨道用错颜色**。`fillEndColor(ratio, dark)` 包装在调用点写成
   `fillEndColor(fraction)`，丢了主题参数，于是 `waterDeepAt(fraction, undefined)`
   取的是浅色海域的深端。删掉包装，调用点直接用 `waterDeepAt(pos, dark)`，并在
   JSDoc 上写明 `dark` **必需**。
2. **拖拽时旋钮跳格**。rail 的内联 `--cmes-pos/--cmes-fillBg/--cmes-fillBgDark` 每次
   render 都用**吸附后**的 `fraction` 重写，而拖动过程中 `showEffort()` 会触发 render
   （preview 变了），于是 `paintLive()` 写进去的连续值被网格值盖掉，旋钮在指针下逐格
   闪跳。现在新增 `liveFracRef` 记录 `paintLive` 最后写入的连续值，`dragging` 期间内联
   style 用 `live ?? fraction`。
3. **渲染期强制样式重算**。菜单高度曾从 DOM 读 `--cmes-avail`（`getComputedStyle`），
   每次 render 都触发一次同步布局——包括拖拽中每次 preview 变化。改成 `avail` state，
   由 `align()` 写入。
4. **每次 render 都拉一次模型目录**。`useEffect(..., [available, load])` 里的 `load` 是
   席位 `inject(sessionId)` 的返回值，每帧重identity，于是目录在拖拽时被 60Hz 重新请求。
   改成 `loadRef` + 依赖 `[available]`。
5. **`useSyncExternalStore` 每帧退订重订**。内联箭头使 `subscribe/snapshot` 每帧换代，
   React 会拆掉再建订阅。改 `useCallback([directory])`。
6. **条件调用 hook**。`typeof useProjection === 'function' ? useProjection('agentTeam') : null`
   在 prop 迟到时会改变 hook 顺序。改 `noProjection` 兜底 + 无条件调用。
7. **空列表按 Home/End 把 highlight 变成 -1**，随后 `(prev + delta + len) % len` 得 NaN。
   `modelKeyDown` 重写：先 `if (!n) return`，再 clamp 后取模。
8. **提交在飞行中点模型没反应**。`chooseModel` 原来 `if (disabled || busyRef.current) return`，
   模型按钮还挂 `disabled: busy`。`commit()` 本来就会合并 pending，所以只保留 `disabled`
   门槛，按钮改 `aria-busy`。
9. **英文界面出现中文**。模型行的 `'档'`、`'不支持'`、`'该模型不支持推理等级'`、`'加载失败'`
   写死中文；加 `levels` / `noLevels` / `loadFailed` 三个 key。
10. **关弹层时喷气层可能留着**。到达顶档那口气的 `setTimeout(setSpoutOn(false))` 会被
    effect cleanup 清掉，若此时 `open` 变 false，effect 早退 → `spoutOn` 永远为 true。
    早退分支里补 `setSpoutOn(false)`。
11. **取消拖拽回错的档**。`cancelDrag()` 原来是 `snapLive(latest.current.index)`，而
    `index` 在拖动中跟的是 **preview**；取消应当回到**已提交**的档，改 `savedIndex`。

### 11.2 结构清理

- 死代码（全部经脚本交叉核对，`cmes-*` 类名与 CSS 选择器一一对应，**CSS 无死规则**）：
  `EFFORT_RGB_BLUE/VIOLET/DEEP`、`ENERGY_END`、`starOpacityFor`、`modelCount`、
  `fillEndColor`、`onLostPointerCapture: () => {}` 空处理器、`present`/`setPresent`
  及其 180ms 延迟 effect（`<section>` 本来就是无条件渲染的，`present` 只在被删掉的
  `latest.current.open` 里读过一次）、`latest` 整个对象（7 个字段里只有 `index` 有人读，
  改成 `indexRef`）。
- 单表化：`EFFORT_LABEL`（id→文案）删掉，改成 `EFFORT_LABEL_BY_BUCKET`（bucket→文案），
  由已有的 `effortBucket()` 派生，同一个 id 同义词表不再出现两份。
- `mixHex` 复用 `hexToRgb`，不再自己写一遍 `substr` 解析。
- `.cmes-status` 从四个内联样式变成一条 CSS 规则（颜色走主题变量）。
- `modelNodes` 里的 `flatModels.findIndex(...)` 每行一次 → 一次 `Map` 建索引（O(n²)→O(n)）。
- 搜索框 `onChange` 直接 `onQuery`（`setQuery` + `setHighlight(0)` 一次 batch），删掉
  `useEffect(() => setHighlight(0), [query, pane, view])`。

### 11.3 交互流畅度

- `pointermove` → `queuePointer()`：只记最新坐标，单帧 rAF 后统一 `applyPointer`，
  120Hz 触控板不再每帧写三四次 CSS 变量 + 触发多次 React render。
- `pointerDown` 冻结 `railBoxRef`（rail 的 rect），`pointermove` 不再每帧
  `getBoundingClientRect`；`align()` 在滚动/尺寸变化时清掉这个缓存。
- `finish()/cancelDrag()` 先 `dropQueuedPointer()`，再写吸附值，避免"松手后一帧又被
  队列里的旧坐标改回去"。
- `resized()` 从「500ms 内逐帧 rAF 追 `align()`」改成「立即 align + 下一帧补一次」。
- document 级监听（拖拽 / 外点关闭 / Escape）改为经 `handlersRef` 转发，listener 只在
  `dragging` / `open` 翻转时挂一次，不再依赖 render 闭包。

### 11.4 验证

- `node --check client.js` 通过。
- `node render.mjs high` → `bytes 93023`、`has water: true | flow: 14 | bubble: 4`、
  `has fillBg gradient: true`。水/气泡数与 v1.2.29 完全一致；字节数 +314 是
  `.cmes-status` 那条 CSS 规则。
- ⚠️ **`render.mjs` 的 `resetHooks()` 是按位置覆盖前 N 个 `useState`**。这一版删了
  `present`，所以数组从 11 项变 10 项（`[true, 'effort', null, false, null, false, MESSAGE, '', false, '']`）。
  以后再增删 `useState`，**同步改这一行**，否则 harness 会把 `pane` 喂成 `true`、水就没了
  （本次已踩过：改完出现 `flow: 0`）。
- `node render-trigger-probe.mjs` 正常输出 `render-trigger-compare.html`。
- 真 GUI 仍**没点过**：本地 `dsh web` 要 token 才开（`dsh web authentication required;
  reopen the URL printed by dsh web.`），本轮只有离屏渲染 + 静态核对。


## 12. v1.3.0：改名分家，成为独立插件

原包名 `dsh-codex-model-effort-selector` 与市场里作者条目标识完全相同，等于把本地分支挂在
别人的户口上：市场一更新就会覆盖本地目录，日志与对话里也无法区分谁是谁。v1.3.0 起改名为
**`dsh-whale-effort-slider`**，市场条目从此显示「未安装」，本插件独立演进。

命名取舍（讨论过 `dsh-whale-dial` / `dsh-whale-effort` / `dsh-whale-reasoning-slider`）：
最终选带 `slider` 的全称，理由是可搜索性与「一看到就知道形态」；代价是 24 个字符偏长，
且 profile 里已有两个 `*-slider`（`dsh-codex-effort-slider`、`dsh-codex-excellent-slider`），
搜索时会撞车。若将来觉得太长，最短的等义替换是 `dsh-whale-dial`。

### 12.1 一共改了六处（少一处就加载失败）

| 位置 | 改动 |
|---|---|
| 目录 | `plugins/dsh-codex-model-effort-selector` → `plugins/dsh-whale-effort-slider` |
| `package.json` | `name`、`version` → `1.3.0` |
| `client.js` | `window.__ModuleLoader__.load({ id })` 与 `const NS`（locale 命名空间）→ 新名 |
| `cordis.patch.yml` | `insert[0].id` / `insert[0].name` → 新名 |
| `locale/{zh,en}.json` | `meta.title` 去掉 Codex 前缀，改「鲸鱼推理滑条 · 模型调度」/ `Whale reasoning-effort slider`；`meta.description` 重写 |
| profile | `package.json` 的 `dsh.profile.bundles` 数组项、`dependencies` 的 key 与 `link:` 路径；`pnpm-lock.yaml` 的 3 行；`node_modules` 链接按新名重建 |

`README.md` 标题与安装路径同步更新；`cordis.patch.yml`、`index.js` 之外没有任何代码依赖包名，
`${P} = 'cmes'` 这个 CSS 类前缀故意保留（改它要动 600 行 CSS，且它只是内部命名）。

`dist/` 里躺着 v1.2.25–v1.2.29 的旧打包产物（文件名带旧名），只是历史归档，
不参与加载；要发包的话按新名重新生成，别直接传旧的。

### 12.2 坑：删掉旧的 `node_modules` 链接

profile 里那条是**目录符号链接**，删法有讲究：

- `rm -rf` 有递归删掉目标目录（整个插件源码）的风险，绝不能用。
- MSYS 的 `rmdir` 报 `Not a directory`，`rm` 会报 `Is a directory`。
- PowerShell 5.1 的 `Remove-Item` 对 symlink 抛 `NullReferenceException`（已知 bug）。
- 可用：`[System.IO.Directory]::Delete('路径', $false)` —— 第二个参数 `false` 表示不递归，
  只删链接本身。
- 重建时 `fs.symlinkSync(target, link, 'dir')` 在未开开发者模式的机器上 `EPERM`，
  回退成 `'junction'` 即可（pnpm 自己也是这么建的）。

### 12.3 验证

- `node --check client.js` 通过；`package.json` / `locale/*.json` 均可 JSON 解析。
- `node render.mjs` 四档与 v1.2.30 基线**逐字节一致**：off `87426 / flow 0`、
  low `90340 / flow 7`、high `93023 / flow 14`、max `99536 / flow 22 / bubble 36`
  ——说明改名没有碰到渲染逻辑。
- profile 链接自检：`realpath` 指向新目录，`package.json` 读出
  `name=dsh-whale-effort-slider version=1.3.0`，`client.js` 存在。
- ⚠️ **改完必须完全退出并重开 DSH Desktop**（不只是关窗口）：bundle 列表在启动时读取，
  热重载不会重扫包名。

### 12.4 回退方式

改名前完整目录快照：`系统临时目录\cmes-full-backup-v1.2.30`（含 50MB 的图片与 dist）。
profile 的 `package.json` 与 `pnpm-lock.yaml` 各留了一份 `.bak-before-rename`。
回退就是把六处改回原名、重建链接、重启。

## 13. v1.3.0 发布准备：一个开关剖成两个包 + 站点

这一节不属于插件运行时行为，是「拿出去发布」这一件事的落地记录。仓库里 `client.js`
仍然是作者自己在用的那一份（`GLASS = true`），对外发的两个 zip 由 `build.mjs` 从它翻出来。

### 13.1 GLASS 开关

弹层原先只有一套玻璃样式（v1.2.5–v1.2.6 从 `dsh-plugin-wallpaper-engine` 移植的
iOS liquid glass：0.19 alpha tint、顶部釉光、6px 冻雾、四层边缘光、`backdrop-filter`）。
为了让「默认版本 = 没有液态玻璃」成立，改成：

- `const GLASS = true;` 与 `const POPOVER_CSS = GLASS ? `玻璃三段规则` : `实色三段规则`;`，
  原先写在 `CSS` 模板里的 popover 段整段替换为 `${POPOVER_CSS}`。
- 实色分支：`background-color:var(--cmes-panel)`、`border:1px solid var(--cmes-panelEdge)`、
  `box-shadow:var(--cmes-panelLift)`、`background-image:none`，并显式 `--cmes-glassText:none`
  （不透明底上不需要给文字补阴影），没有 `backdrop-filter`。
- 新增三个 token，root 与 dark 段各一套：
  `--cmes-panel`（`#ffffff` / `#232324`）、`--cmes-panelEdge`（`rgba(15,23,42,.10)` /
  `rgba(255,255,255,.10)`）、`--cmes-panelLift`（浅色两层阴影 / 深色更重的两层）。

**主题适配是这样成立的**：深色规则的选择器是 `body[data-ds-dark-theme] .cmes-root`，
弹层是 `.cmes-root` 的后代，直接继承这套 token；JS 侧 `isDarkNow()` 用的是同一个
`document.body.hasAttribute('data-ds-dark-theme')`，所以「底色」和「按主题算出来的墨色」
不会各说各话。实测（浏览器读 computed style）：

| | 底色 | 描边 | 投影 | 标题墨色 |
|---|---|---|---|---|
| 浅色 | `rgb(255,255,255)` | `rgba(15,23,42,.10)` | `rgba(15,23,42,.16) 0 12px 32px` | `#2b5992` |
| 深色 | `rgb(35,35,36)` | `rgba(255,255,255,.10)` | `rgba(0,0,0,.45) 0 16px 40px` | `#7eacdd` |

（玻璃 token 只被 `.cmes-popover` 自己和 `glassText`（标题的 text-shadow）消费，
所以实色版关掉面板那几层就够了，内部小元件没有别的玻璃底要清。）

### 13.2 build.mjs

`node build.mjs` 读 `package.json` 的 name/version，确认源码里有 `const GLASS = true;`，
然后对两个变体各铺一个目录 `build/<name>-<ver>-<tag>/`：`client.js`（翻转那一行）
+ `index.js`/`cordis.patch.yml`/`icon.svg`/`LICENSE`/`README.md`/`locale`
+ 改写 description 的 `package.json` + 中文 `INSTALL.txt`，最后
`tar -a -c -f dist/<name>-<ver>-<tag>.zip -C build <dirName>` 打包，写 `dist/build-manifest.json`，删 `build/`。

坑：**`INSTALL.txt` 一开始叫 `安装说明.txt`**，bsdtar 在 Windows 上按系统代码页写文件名，
解压出来是乱码（`��װ˵��.txt`）。非 ASCII 文件名一律不用。
第二个坑：`VARIANTS` 里的 `glass` 字段最初当成「这个包叫什么」，结果 default 包写进了
`GLASS = true`——两个包内容反了。现在该字段就是「写进 client.js 的值」，并在注释里写死。

### 13.3 站点（`site/`）

- `site/index.html`：单文件、无外部依赖、支持 `prefers-color-scheme`，含双版本下载、
  四张主题×材质对比图、功能说明、版本对比表、三步安装、注意事项。
- `site/downloads/`：两个 zip 的副本（Pages 只托管站点目录，所以复制一份）。
- `site/img/`：四张 880×620 的截图。
- `site/demo-*.html` + `site/make-shots.py`：把离屏 `render.mjs` 的输出包进一个假聊天窗口
  （壁纸渐变 + 气泡 + 输入框），因为玻璃效果在纯色底上看不出来。深色版用 `DARK=1` 渲染，
  并且 `data-ds-dark-theme` 必须加在 `<body>` 上——选择器是 `body[...] .cmes-root`，
  加在中间容器上不生效（第一次就是这么截出「深色壁纸配浅色墨色」的废图）。

### 13.4 仓库卫生

发布前把根目录清了一遍：`preview-*.html`、`shot-*.png`、`wide-*`、`cmp-*`、
`render-trigger-compare.*` 移进 `dev/`，旧名 tgz/zip（v1.2.25–v1.2.29，共 45MB）移进
`dev/archive/`；一次性的 `patch_glass.py` 删掉。新增 `.gitignore`（`node_modules/`、`build/`）。

### 13.5 验证

- `node --check client.js` 通过；四档渲染正常：off `87010 / flow 0`、low `89924 / flow 7`、
  high `92607 / flow 14`、max `99120 / flow 22 / bubble 36`（比 v1.2.30 各少约 416 字节，
  差额就是被缩短的 popover 注释；flow / bubble 与基线完全一致）。
- 玻璃版 output 有 `backdrop-filter:var(--cmes-glassBlur)`（root+dark 两处），实色版为 0。
- 两个 zip 解压后 `const GLASS` 分别为 `false` / `true`，`node --check` 均通过。
- 落地页相对链接全部存在（4 张图 + 2 个 zip）。
- ⚠️ 未做真机 GUI 冒烟：`http://dsh web 本地端口` 返回 `dsh web authentication required`，
  拿不到带 token 的地址，只能以离屏渲染 + computed style 为准。

## 14. 术语更正：这条滑条上没有「星尘」，是「海流」

v1.2.23 把 22 颗白点换成了横向细丝（`cmes-fil` / `cmes-wisp` / `cmes-bubble`），
视觉上已经是水流。但代码里的常量仍叫 `STAR_*`，文档和 README 里也一直写着「星尘」，
导致 v1.3.0 发布页把已经不存在的东西当卖点。用户当场指出后统一更正：

- 面向用户的文案（`README.md`、`site/index.html`、`locale/zh.json`、`locale/en.json`
  的 `meta.description`）：星尘 → 海流 / `stardust` → `drifting sea currents`。
- `client.js` 内部注释：`energy star dust` 段改写为 `sea current`，并注明
  `STAR_*` 是 v1.2.x 遗留名字、只驱动几何、真正画的元素在下面的 water-flow CSS 里。
- `docs/HANDOFF.md` 与 `docs/REPLICA.md` 里的「星尘」**不改**：那些是逐版记录，
  当时确实叫这个名字，改了等于篡改历史。

## 15. 换掉沿用上游的图标：透明底 + 三鲸 + 鲸鱼旋钮

v1.3.0 之前 `icon.svg` 一直是上游 ABING1111 那版：紫色渐变圆角方块 + 白色闪电 +
白色胶囊滑条 + 圆形旋钮。有人下载这个插件时，详情页里看到的是别人的图标。

用户口径（m01363）：「背景换成透明，然后圆形滑动头换成鲸鱼图标，闪电标志换成
启用智能体团队协作的图标」。

新图标 `icon.svg`（64×64，4942 B）：

- **透明底**：不铺任何背景板，浅色与深色详情页都能直接贴。
- **滑条**：中性灰轨道（`#5B6B80` @ 40%）+ 蓝紫渐变填充（`#2F7BE8` → `#6B4BE8`），
  60% 处停住。
- **旋钮**：官方鲸鱼轮廓，白底 + `#0B1E33` 描边 1.25px——浅底靠描边、深底靠白面。
  必须水平镜像（`translate(47.251 36.5) scale(-1 1)`），跟组件里 `WHALE_REFLECT`
  （`client.js:1432`，`22.9509`）+ `scale(-1 1)` 的做法一致，鲸鱼才是朝右游向档位；
  第一版漏了这层镜像，鲸鱼朝左，看着像在倒退。三只团队鲸不翻——`teamMark` 里就是原方向。
- **团队标记**：三只鲸鱼群游（代替闪电），坐标沿用 `WHALE_TRIO` 的相对位置。

实现细节：

- 鲸鱼 path 只在 `<defs>` 里写一遍（3448 字符），其余三处用 `<use href="#whale">`
  复用，整份图标才 4.9 KB。
- 第一版把三只鲸鱼手摆 `translate` 摆重叠了，放大 300% 一看像"一只鲸鱼分叉"；
  改成套 `WHALE_TRIO` 的间距关系后正常。
- 配色首版用 `#4C9BF5`/`#7C5CF6`，在浅色卡片上偏淡（16–32px 几乎看不见），
  加深到 `#2F7BE8`/`#6B4BE8` 并把轨道透明度提到 40%。

验证：

- `dev/icon-compare.html`：浅色/深色两条带、16/32/48/112px 四档、详情页卡片尺寸。
- 两个 zip 内 `icon.svg` 与工作区字节完全一致（md5 `4c0e76c18b…`），`package.json`
  的 `"icon": "./icon.svg"` 指向它。
- 顺带修掉 `package.json` description 里的 `an eleven-stop effort rail`（档位从来
  不是固定十一档），改为 `an effort rail (stops come from the model)`。
