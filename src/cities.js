// 城市注册表：新增城市 = 跑一次 scripts/build-city-data.mjs + 在这里加一行。
export const CITIES = [
  {
    id: "shanghai",
    nameZh: "上海",
    nameEn: "SHANGHAI",
  },
];

export const DEFAULT_CITY = CITIES[0].id;
