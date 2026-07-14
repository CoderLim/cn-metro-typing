import { useEffect, useState } from "react";

// 按城市加载线路数据与行政区边界；两个 JSON 都在 public/data/<city>/ 下。
export function useCityData(cityId) {
  const [state, setState] = useState({ data: null, boundary: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    const opts = { signal: controller.signal };
    setState({ data: null, boundary: null, error: null });
    Promise.all([
      fetch(`/data/${cityId}/metro.json`, opts).then(toJson),
      fetch(`/data/${cityId}/boundary.json`, opts).then(toJson),
    ])
      .then(([data, boundary]) => {
        if (!data.lines?.length) throw new Error("线路数据是空的");
        setState({ data, boundary, error: null });
      })
      .catch((error) => {
        if (error.name !== "AbortError") setState({ data: null, boundary: null, error });
      });
    return () => controller.abort();
  }, [cityId]);

  return state;
}

async function toJson(res) {
  if (!res.ok) throw new Error(`数据加载失败（${res.status}）`);
  return res.json();
}
