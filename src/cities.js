// 城市注册表现在是构建产物：scripts/build-city-data.mjs --all 生成
// public/data/cities.json，App 启动时通过 useCityRegistry 拉取。
// 这里只留默认城市，供 URL 无 ?city= 参数或参数无效时回退。
export const DEFAULT_CITY = "shanghai";
