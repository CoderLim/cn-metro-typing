import { useEffect, useState } from "react";

// 拉取全量城市注册表（public/data/cities.json，由 scripts/build-city-data.mjs --all 生成）。
export function useCityRegistry() {
  const [state, setState] = useState({ cities: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/cities.json", { signal: controller.signal })
      .then(toJson)
      .then((cities) => {
        if (!Array.isArray(cities) || !cities.length) throw new Error("城市列表是空的");
        setState({ cities, error: null });
      })
      .catch((error) => {
        if (error.name !== "AbortError") setState({ cities: null, error });
      });
    return () => controller.abort();
  }, []);

  return state;
}

async function toJson(res) {
  if (!res.ok) throw new Error(`城市列表加载失败（${res.status}）`);
  return res.json();
}
