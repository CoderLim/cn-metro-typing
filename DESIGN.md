# DESIGN — CHINA METRO TYPING

## 1. 主题与氛围

暖纸上的墨字编辑排版 × 地铁导视系统。纸感底色、砖红点缀、等宽数字的"时刻表"气质；
界面是工具型游戏面（无 hero、无营销结构）。灵感来自 tw-metro-typing（自行实现）。

## 2. 色彩与角色

| Token | Light | Dark | 角色 |
|---|---|---|---|
| `--paper` | `oklch(95.5% 0.013 85)` ≈ #f5f1e6 | `oklch(20% 0.012 75)` | 页面画布（暖纸） |
| `--card` | `oklch(98.5% 0.008 90)` ≈ #fdfbf4 | `rgba(255,255,255,.04)` | 卡片/到站牌 |
| `--ink` | `oklch(21% 0.01 80)` ≈ #1b1916 | `oklch(92% 0.008 85)` | 主文字 |
| `--muted` | `oklch(52% 0.015 75)` | `oklch(65% 0.01 80)` | 次要文字 |
| `--accent` | `oklch(56% 0.155 32)` ≈ #c04a2e 石库门砖红 | 同（亮度+4%） | 品牌/CTA/强调 |
| `--line` | `oklch(87% 0.012 85)` | `rgba(255,255,255,.09)` | 分隔线 |
| 线路色 | 数据自带（高德官方色） | 同 | 功能色，贯穿选中态 |

60-30-10：纸面 60、墨字与分隔 30、砖红 + 线路色 10。中性色统一向暖黄相偏 0.01 chroma。

## 3. 字体

- 展示/数字/代号：`DM Mono`（时刻表气质；tabular-nums 用于计时与计分）
- 正文/站名：`Noto Sans SC`，回退 `PingFang SC`
- 展示级（≥32px）letter-spacing −0.022em；中排 −0.012em；正文默认
- 大站名（到站牌）：黑重 900，一行自适应字号（`--fit-font`）

## 4. 组件

- **按钮**：pill；主按钮砖红底纸色字，hover 提亮 4%，active `scale(.96)`；次按钮纸底墨字带 `--line` 边
- **到站牌卡片**：`--card` 底、24px 圆角、大柔影 `0 22px 60px rgba(45,35,20,.14)`；顶部 meta 行（序号+英文名）、NOW ARRIVING 大站名、右侧下一站、底部线路色条
- **route pill**：线路色底白字 pill，游戏中显示"X号线 · 往 终点站"
- **segmented control**：纸底 pill 槽 + 选中块砖红/线路色
- **打字目标**：DM Mono 逐字符 span；`typed` 变砖红、`current` 下划线光标闪烁

## 5. 布局

- 首页：地图占右 55%（SVG viewBox 常驻），文案与控制台叠左；底部路线走马廊
- 游戏：全屏地图为底，顶部 chrome（返回/route pill），中下到站牌卡片，卡片上方 scorebar
- 间距刻度：4/8/12/16/24/40/64；圆角刻度：{10, 16, 24, pill}

## 6. 深度

亮色：影阶两级（卡片大柔影 / 控件 `0 1px 3px rgba(0,0,0,.1)`），不给容器加描边围栏。
暗色：近黑暖底 + 白色低透明度台阶（.03/.05/.08），边 `rgba(255,255,255,.08)`。

## 7. Do / Don't

- Do：线路官方色作为选中态的唯一强调；等宽数字计分；地图元素尺寸随 viewBox 用户单位缩放
- Do：`prefers-reduced-motion` 全量降级（描画/缩放/抖动）
- Don't：不用渐变文字、不用 glassmorphism、不给每个容器上边框
- Don't：不引入图标库（内联 4 个 SVG）；不混第二种 CSS 方案
- Don't：地图上除选中线外的网络线保持极低存在感（淡化，不抢）

## 8. 响应式

- 断点 720px：首页文案居上、地图居下压缩高度；游戏卡片改纵向堆叠
- 375px 必须可玩；触控目标 ≥40px；`touch-action: manipulation`
- 移动端打字：隐藏 input 常驻聚焦，点卡片重新聚焦

## 9. Agent Prompt 速查

`--paper #f5f1e6 · --ink #1b1916 · --accent #c04a2e · card radius 24px · btn pill · DM Mono + Noto Sans SC`
例：「在 --paper 画布上做 pill 主按钮：DM Mono 15px/500，砖红 #c04a2e 底、#f5f1e6 字，active scale(.96)，focus-visible 2px 砖红 ring」
