import { memo, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { ArrowLeftIcon } from "./icons.jsx";

const CHINA_VIEW = [0, 0, 960, 780];
// 覆盖全境（含南海诸岛与九段线）的取景框；海南省 feature 自带南海诸岛。
const CHINA_BOUNDS = {
  type: "Polygon",
  coordinates: [
    [
      [73.4, 3.3],
      [73.4, 53.8],
      [135.2, 53.8],
      [135.2, 3.3],
      [73.4, 3.3],
    ],
  ],
};

// 常显标签里与邻城拥挤的，放到点位下方避让（京津、沪宁杭、广深港）。
const LABEL_BELOW = new Set(["tianjin", "hangzhou", "shanghai", "shenzhen", "xianggang"]);

export default memo(function ChinaMap({
  china,
  cities,
  currentCityId,
  onPick,
  onBack,
}) {
  const svgRef = useRef(null);
  const zoomingRef = useRef(false);
  const [zooming, setZooming] = useState(false);

  const model = useMemo(() => {
    const projection = geoMercator().fitExtent(
      [
        [46, 36],
        [914, 748],
      ],
      CHINA_BOUNDS,
    );
    const path = geoPath(projection);
    const provinces = [];
    let dashline = null;
    for (const f of china.features) {
      if (!f.geometry) continue;
      if (f.properties?.adcode === "100000_JD") dashline = path(f);
      else
        provinces.push({
          id: f.properties.adcode,
          name: f.properties.name,
          d: path(f),
        });
    }
    const points = cities
      .filter((c) => Array.isArray(c.center))
      .map((c) => ({ ...c, point: projection(c.center) }));
    return { provinces, dashline, points };
  }, [china, cities]);

  // 点选城市：viewBox 缓动放大到该市，动画完成后交给 App 切城。
  const pick = (cityEntry) => {
    if (zoomingRef.current) return;
    zoomingRef.current = true;
    setZooming(true);
    const svg = svgRef.current;
    const [x, y] = cityEntry.point;
    const w = 64;
    const h = w * (CHINA_VIEW[3] / CHINA_VIEW[2]);
    const target = [x - w / 2, y - h / 2, w, h];
    const from = CHINA_VIEW;
    const started = performance.now();
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 1
      : 720;
    const tick = (now) => {
      const t = Math.min((now - started) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const box = from.map((v, i) => v + (target[i] - v) * eased);
      svg.setAttribute("viewBox", box.join(" "));
      svg.style.setProperty("--u", box[2] / CHINA_VIEW[2]);
      if (t < 1) requestAnimationFrame(tick);
      else onPick(cityEntry.id);
    };
    requestAnimationFrame(tick);
  };

  return (
    <section className="china-screen">
      <svg
        ref={svgRef}
        className={`china-map${zooming ? " zooming" : ""}`}
        viewBox={CHINA_VIEW.join(" ")}
        role="img"
        aria-label="全国已开通地铁城市分布图"
      >
        <defs>
          <filter id="china-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="14"
              floodColor="#3a3226"
              floodOpacity=".12"
            />
          </filter>
        </defs>
        <g className="china-provinces" filter="url(#china-shadow)">
          {model.provinces.map((p) => (
            <path key={p.id} d={p.d} aria-label={p.name} />
          ))}
        </g>
        {model.dashline ? (
          <path className="china-dashline" d={model.dashline} />
        ) : null}
        <g className="china-cities">
          {model.points.map((c) => {
            const tier =
              c.lineCount >= 15 ? "t1" : c.lineCount >= 6 ? "t2" : "t3";
            const [x, y] = c.point;
            return (
              <g
                key={c.id}
                className={`china-city${c.lineCount >= 10 ? " always" : ""}${
                  c.id === currentCityId ? " current" : ""
                }`}
                role="button"
                tabIndex={0}
                aria-label={`选择${c.nameZh}（${c.lineCount} 条线路）`}
                onClick={() => pick(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick(c);
                  }
                }}
              >
                <circle className="china-city-hit" cx={x} cy={y} />
                <circle className={`china-city-dot ${tier}`} cx={x} cy={y} />
                <text
                  className="china-city-label"
                  x={x}
                  y={LABEL_BELOW.has(c.id) ? y + 19 : y - 9}
                >
                  {c.nameZh}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="china-copy" aria-hidden={zooming ? "true" : undefined}>
        <div className="eyebrow">
          <span /> PICK A CITY
        </div>
        <h1>
          选一座城，<em>上车。</em>
        </h1>
        <p className="lede">
          {model.points.length} 座已开通地铁的城市按真实坐标落点，圆点越大线路越多。
        </p>
      </div>
      <button className="map-reset" type="button" onClick={onBack}>
        <ArrowLeftIcon /> 返回城市 <kbd>ESC</kbd>
      </button>
    </section>
  );
});
