# 复刻记录

本目录是上游 `dsh-codex-model-effort-selector` v1.1.2 的**本地复刻副本**，用于在没有 GitHub 访问、
或需要在本地改造的情况下继续使用同一个插件。本文记录「复刻了什么、改了什么、在本机验证到什么」。

## 1. 来源

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/ABING1111/dsh-codex-model-effort-selector |
| 取源方式 | 通过 jsDelivr / ghproxy 镜像逐文件取回，与 npm 上的同版本逐字节核对 |
| 取到的版本 | v1.1.2（`package.json` 与 `CHANGELOG.md` 一致） |
| 许可 | MIT（`LICENSE` 逐字节保留） |
| 原始副本 | 工作区 `ref/upstream/`（含 README、SPEC、ARCHITECTURE、INCIDENTS、CHANGELOG、prototype.html） |

## 2. 逐字节一致的文件

| 文件 | 字节 | 说明 |
|---|---|---|
| `client.js` | 94198 → 见下节 | 浏览器 bundle，插件全部实现（席位接管、滑条、星尘/极光/墨溅、两级下钻、深色色板） |
| `index.js` | 468 | 宿主半边空实现，只为让包成为 cordis 树上的节点 |
| `LICENSE` | 1101 | MIT 全文 |

`client.js` 的像素几何与配色都是上游从 Codex 桌面版录屏 93 帧量出来的，这部分一个数都没动。
**本副本对 `client.js` 的改动只有下面第 5 节那一处定位缺陷修复**；改造时直接改这个文件，
包在 profile 里是 `link:`，改完完全重启 DSH 生效。

## 3. 重写的文件

| 文件 | 与上游的差异 |
|---|---|
| `package.json` | 增加 `./icon` 导出；`files` 增加 `locale/*.json`、`docs`、`README.md`；其余字段保持一致 |
| `cordis.patch.yml` | 与上游同构（`insert` 一条同名行） |
| `locale/zh.json`、`locale/en.json` | 补齐 `meta.detail`，描述按本副本重写 |
| `icon.svg` | 重画：蓝→紫圆角底板 + 滑轨与旋钮 + 闪电（上游是纯闪电） |
| `docs/DETAIL.md`、`docs/DETAIL.zh.md`、`docs/preview.svg` | 新增单图详情页 |
| `README.md` | 重写为本地副本的说明 |

## 4. 兼容性核对（本机 DSH 0.2.2-rc.5）

上游声明按 DSH 0.2.0-rc.2 / 0.2.1-rc.2 的 slot 契约编写，本机是 **0.2.2-rc.5**，逐项核对如下：

| 契约 | 上游用法 | 本机实际 | 结论 |
|---|---|---|---|
| `conversation.input.model` | `ctx.slots.inject` + `register({ name, locale, priority: -1, inject })` | slot 存在，kind=single、scope=session | ✅ |
| 席位遮蔽 | `priority: -1` 压过官方 `0` | 实测占据 `active: true`，官方 `active: false` | ✅ |
| 子槽位 | 故意不声明 `conversation.input.model.label` | 0.2.2 由官方条目声明（`.label` + `.options`），无冲突 | ✅ |
| `ctx.modelDirectories.directoryFor()` | 取 `{ store, load, select }` | 服务仍在（`ModelDirectoryResolver`），store 形状 `{current,pending,groups,failures,status,error}` 与插件读取一致 | ✅ |
| `ctx.sessions.subagentAddress()` | 判定子代理会话不可选模型 | 0.2.2 仍提供（官方选择器同款用法） | ✅ |
| `inject: ['remote','remote.session']` | `directoryFor()` 的注入校验 | 仍需这两个才能调 `directoryFor` | ✅ |
| `data-ds-dark-theme` | `MutationObserver` 订阅主题 | `<body>` 上仍有该属性，实测深色色板生效 | ✅ |
| `--dsw-*` 令牌 | 卡片/轨道/文字取官方令牌 | 令牌可用，旋钮解析为深色亮钮 `#f9fafb` | ✅ |

## 5. 修复：弹层按错坐标系定位（v1.1.3）

### 现象

宽窗口/停靠输入框下打开弹层，**卡片整体偏右**：右边缘被窗口裁掉，滑条右端与 ↻ 按钮贴到甚至越过
窗口边界；竖直方向也比预期高出一截。

### 根因

`position: fixed` 只有在**没有任何祖先建立包含块**时才相对视口。DSH 输入框座位
`an3WzG_composerSeat` 带 `will-change: transform`，按规范它就是固定定位子元素的包含块。
于是插件算出的视口坐标被当成**相对输入框座位**的坐标解释：

```
实测（1256 宽窗口，停靠输入框）：
  想要的视口 left = 458.5   实际渲染 x = 738.5   ← 多出 280 = 座位的 x
  想要的视口 bottom 边 = 710.7  实际 = 682.4     ← 少 28  = 座位盒子高度差
```

座位在窗口里越靠右，这个偏移越大，卡片就被推出窗口右侧 —— 上游按 0.2.0/0.2.1 的布局验证时
座位原点接近视口原点，所以这个问题没暴露。slot 说明里那句
"Fixed overlays must portal to the document body because the docked composer contains them"
说的就是同一件事（官方菜单用 body portal 规避，本插件是动态 bundle，拿不到 react-dom）。

### 修法（不引入 react-dom，也不改上游几何）

1. 在 `.cmes-root` 里加一个不可见的探针 `.cmes-probe{position:fixed;inset:0;visibility:hidden}`：
   它与弹层共享同一个包含块，所以它的 `getBoundingClientRect()` **就是** `left/bottom` 的真正原点。
2. `align()` 先算视口坐标（用 `documentElement.clientWidth/clientHeight`，不含滚动条），再减去探针原点
   换算到包含块坐标系；竖直方向按「弹层底边 = 触发按钮上方 8px」重算，不再用
   `innerHeight - trigger.top`。
3. 新增 `--cmes-avail`（触发按钮上方可用高度），CSS 的 `max-height` 改用它 —— 原来的
   `calc(100vh - var(--cmes-bottom))` 混用了两套坐标系，本来就会算错。
4. Fast 浮层（同样 `position:fixed`）走同一套换算。

无包含块时探针等于视口，换算退化为恒等，行为与上游完全一致。

### 验证

| 场景 | 结果 |
|---|---|
| 常规布局（座位原点 280,653） | 弹层渲染在视口 x=459，与触发按钮中心对齐，底边距按钮 8px，完全在视口内 |
| 压力布局（把输入框拉到 1150 宽，触发按钮跑到 x=1208…1379，越过 1256 的视口） | 弹层左侧被夹到 972（= 视口宽 − 272 − 12），右边缘 1244，距窗口边界 12px，**不再溢出**（修复前会渲染在 1252…1524） |
| 探针读数 | `{x:280,y:658,w:404,h:132}`，与 `an3WzG_composerSeat` 完全一致 |
| Fast 浮层 | 位于 ⚡ 上方 7px、水平居中、在视口内 |
| 刷新 | 整页 reload 后仍正确定位 |

## 6. 定制：左上角按钮改为「智能体团队协作」开关（v1.2.2）

### 改了什么

| 项 | 改前（上游） | 改后（本副本） |
|---|---|---|
| 图标 | ⚡ 手绘闪电路径 | **DeepSeek 官方鲸鱼** ×3，正三角（顶尖小、左下大、右下中），实心填充 |
| 功能 | Fast 视觉开关（只改外观，不改变速度或用量） | 调用 `remote.agentTeams.setEnabled(sessionId, on)`，真正开关会话的 Agent Team 模式 |
| 悬浮文案 | `1.5 倍速` / `用量更多` / `(仅视觉效果)` | `3x~4x token` / `启用智能体团队协作` |
| 状态来源 | 组件 state + `localStorage` 每会话记忆 | Host 的 `agentTeam` 投影（`useProjection('agentTeam').enabled`） |
| 开关前后 | 描边 → 实心 | **白 → 蓝**（形状不变，只换颜色；关=近白、开=DeepSeek 品牌蓝） |

### 图标

鲸鱼路径是随包发布的官方 logo（`FISH_LOGO_PATH`，viewBox `23.16 × 17.04`，
来自 `@deepseek-ai/dsh-client-ui-primitives` 的 `FishLogo`），**原样复用、只做等比缩放**：
没有描边、没有接缝色、没有重绘，三只都是同一个官方形状。

24×24 画布里的**正三角**（`[x, y, scale]`）：

```
大  ( 1.40,  8.80) ×0.60   左下，13.90 × 10.22
小  (10.20,  5.20) ×0.30   顶点， 6.95 ×  5.11
中  (12.60, 10.00) ×0.42   右下， 9.73 ×  7.16
```

三只的包围盒在 `x 12.60..15.30, y 10.00..10.31` 这条带子上**同时相交**，也就是
「整体中心部分重叠」；小鲸鱼落在另外两只的夹角里，眼睛与侧鳍仍露在外面。
大鲸鱼是中鲸鱼的 **1.43 倍**宽（13.90 vs 9.73），大小对比一眼能看出来。

> 中心重叠与可读性有冲突：24px 下三只同类剪影叠得越深越容易糊成一块。
> 现在的取值是在几张实测对比里挑的 —— 再往中心压会变成单块，完全分开则失去「重叠」。
> 想更清晰的话，把 `WHALE_TRIO` 第二项往上挪 0.5 就退回「顶点分开」的版本。

清晰度是这次的硬指标，做法有三条：

- **实心剪影**：没有 1px 细描边，就不会在小尺寸上糊成灰边（描边版发虚正是这个原因）
- **画到 24×24**：`.cmes-tool .cmes-teamMark` 显式压过 `.cmes-tool svg{16px}`，
  28×28 命中区里留 2px 边距（原来闪电是 15×17）；收起态那枚保持 20×20，免得挤掉模型名
- **不加 overflow/滤镜/非等比缩放**：纯 `translate + scale`，浏览器按几何精度栅格化

状态编码改成**颜色**：

| 状态 | 颜色 | 说明 |
|---|---|---|
| 关 | `--cmes-teamOff` → `--dsw-alias-label-primary`（深色主题 ≈ `#f9fafb` 近白，浅色主题 ≈ `#15171b` 近黑） | 用主题主文字色，浅色主题下才不会白到看不见 |
| 开 | `--cmes-teamOn` → `--dsw-alias-brand-primary-new-color`，回退 `#4D6BFE`（DeepSeek 品牌蓝） | 实测解析到 `#4D6BFE` |

收起态那枚同款小鲸鱼跟着同一套颜色：关不显示，开显示且为蓝色。

### 功能接线

```js
// inject 面（entry.inject(sessionId) 里）
setTeam: enabled => ctx.remote.agentTeams.setEnabled(sessionId, enabled)
```

- 入口的 `inject` 增加 `remote.agentTeams`（不声明会抛
  `cannot get property "remote.agentTeams" without inject`）
- 状态读 `useProjection('agentTeam').enabled` —— 这是席位标准 prop，官方那条
  「模型菜单里的 Enable agent teamwork」读的是同一个投影，所以两处永远一致
- 点击 → 立刻乐观上色（`teamWant`）→ 等投影追上后交还给 Host；
  Host 返回 `{ok:false}` 时回弹并把原因写进弹层自己的状态行
- 保存期间不再拒绝点击（`setEnabled` 幂等、Host 串行写入），只保留
  `locked`/`unavailable` 的禁用

### 与上游解耦的地方

- 删掉 `localStorage` 那份 Fast 记忆（状态已归 Host，本地再存一份必然打架）
- `.cmes-popover.fast-mode` 与星尘粒子的耦合去掉：星尘现在由旋钮比例驱动、Ultra 材质只表示最高档，
  不再因为团队协作开启而亮起

### 验证

| 项 | 结果 |
|---|---|
| 图标 | 3 条 `<path>`，按钮内 24×24、收起态 20×20，`stroke:none`；关 `rgb(249,250,251)`，开 `rgb(77,107,254)` |
| 悬浮 | 两行文案精确为 `3x~4x token` / `启用智能体团队协作` |
| 点击 | 关→开：`aria-pressed` false→true，`setEnabled` 返回 `ok:true`，投影刷新 |
| 反向 | 开→关同样成功，收起态图标随之消失 |
| 持久化 | 整页 reload 后仍为开启态、收起态图标仍在（Host 侧状态） |
| 一致性 | 与官方 Team 行读同一投影，不存在两处打架 |

## 7. 实机验证记录

在 `desktop` profile 安装（`link:` 到本目录）后，用 DSH Web UI 实测：

| 项 | 观测结果 |
|---|---|
| 安装 | `application: applied`，插件页显示标题、描述、自制图标、详情图，状态「运行中」 |
| 收起态 | 输入框右侧一枚按钮，文本 `DeepSeek-V4.1-Flash 高`（模型名 + 档位，Fast 关闭时无 ⚡） |
| 弹层几何 | 272×104；轨道 248×22（v1.2.7 起，见 HANDOFF 第 3 节第 8 条）；旋钮头是朝右的官方鲸鱼，高 22px（= 填充粗细）、宽 30.16px，定位盒仍 25px（v1.2.9 上线，v1.2.10 放大，见第 3 节第 10 条） |
| 档位 | 当前模型公布 4 档，`aria-valuemin=0 / max=3`，轨道不再画刻度点（v1.2.7 改为连续填充 + 星尘） |
| 点击轨道 | 点右端 → `aria-valuetext=Ultra`，填充切 Ultra 材质 + 极光 + 星尘，旋钮处溅一次墨 |
| 两级下钻 | 点标题 → provider 列表（1 个 provider「DeepSeek Account」带蓝点）；点该行 → 模型列表（2 个模型，各带「4 档」徽标，当前项打勾）+ 搜索框 |
| 弹层高度 | provider 页 91px、模型页 178px，按内容自适应且不裁行 |
| Fast 浮层 | 悬停 ⚡ 显示「1.5 倍速 / 用量更多」，坐标落在视口内（未被 `backdrop-filter` 裁掉） |
| 提交与回填 | 改档后收起态文案同步为 `… Ultra`；再改回 `高` 后同步回 `… 高` |
| 刷新 | 整页 reload 后席位仍由本插件持有，档位回填为 `高` |

未验证：浅色主题（本机 profile 固定 `dark`）、拖动中途跨弹层边界的手势、多 provider 目录。

## 8. 已知限制

与上游一致：遮蔽官方席位后官方那颗按钮的菜单没有入口（切模型仍有本面板与 `/model` 命令）；
不声明 `.label` 子槽位，代价是官方那个装饰徽标不显示；档位由模型公布的元数据决定。
