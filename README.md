# CHINA METRO TYPING｜中国地铁站名打字练习

以中国真实地铁线路与站名为题目的打字游戏，从上海开始。
在真实城市地图上选线，每打对一个字，列车就沿真实经纬度绘制的线路往下一站前进一段。

灵感来自 [TAIWAN METRO TYPING](https://tw-metro-typing.yencheng.dev/)（[源码](https://github.com/ridemountainpig/tw-metro-typing)，作者 Yen Cheng）。
本项目为独立实现，未复制原作代码（原仓库未附带开源许可证）。

## 功能

- 上海地铁 + 磁浮 + 市域机场线共 21 条线路、532 个站点坐标
- 依真实站序与经纬度（GCJ-02）绘制线路，支线（5/10/11 号线）以独立区间呈现
- 选线放大、行驶方向选择、30 秒快打、全线挑战
- 官方英文站名逐字输入（整理自 Wikipedia，如 People's Square、Century Avenue）
  与支持输入法选字的中文模式
- WPM／CPM、正确率、完成站数与列车移动反馈
- 深色模式、键盘操作（ESC 返回）、响应式布局
- 多城市框架：数据按城市生成，新增城市只需跑一次脚本 + 注册一行

## 技术架构

- Vite 7 + React 19（pnpm）
- d3-geo：`geoMercator().fitExtent` 将城市边界与站点投影到 SVG
- 无路由、无状态库、无 UI 框架；单一 `styles.css` 设计系统（见 `DESIGN.md`）

## 本机运行

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
pnpm test       # lib 单元测试
pnpm build      # 生产构建
```

## 数据管线

```bash
node scripts/build-city-data.mjs shanghai          # 使用 data/raw 缓存
node scripts/build-city-data.mjs shanghai --fresh  # 重新下载
```

数据来源：

- 线路 / 站点 / 官方线路色：高德地图地铁数据（非官方接口，GCJ-02 坐标）
- 行政区边界：阿里 DataV.GeoAtlas（同为 GCJ-02，与站点坐标一致，无需转换；
  构建时已把多边形绕向翻转为 d3-geo 的球面约定）
- 官方英文站名：`data/en-names/shanghai.json` 整理自
  [List of Shanghai Metro stations](https://en.wikipedia.org/wiki/List_of_Shanghai_Metro_stations)，
  人工修正见 `data/en-names/shanghai-overrides.json`（机场联络线等）

## 新增城市

1. 在 `scripts/build-city-data.mjs` 的 `CITIES` 里加一项（adcode、行政区 adcode、名称）
2. （可选）整理该城市的官方英文站名到 `data/en-names/<city>.json`，缺失自动回退拼音
3. 跑 `node scripts/build-city-data.mjs <city>`
4. 在 `src/cities.js` 注册

本项目不是任何地铁公司的官方服务，仅供打字练习使用。
