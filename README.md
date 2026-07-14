# CHINA METRO TYPING

用中国真实地铁线路与站名练打字。在地图上选线，每打对一个字，列车就前进一段。在线体验：https://typing.ryekee.com

## 特性

- 真实经纬度地图选线，支线独立区间显示
- 英文、拼音、中文三种打字模式
- 30 秒快打与全线挑战两种玩法
- 支线区间与行驶方向选择
- 深色模式、键盘操作
- 多城市框架（当前上海）

## 快速开始

```bash
pnpm install
pnpm dev
pnpm build
node scripts/build-city-data.mjs shanghai
```

## 数据来源与致谢

- 线路站点来自高德地图地铁数据（非官方接口）
- 行政区边界来自阿里 DataV.GeoAtlas
- 官方英文站名整理自 Wikipedia
- 灵感来自 [TAIWAN METRO TYPING](https://tw-metro-typing.yencheng.dev/)（作者 Yen Cheng），本项目为独立实现未复制原作代码
- 非地铁公司官方服务，仅供打字练习
