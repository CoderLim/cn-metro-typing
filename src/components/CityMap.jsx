import { memo, useEffect, useMemo, useRef, useState } from "react";
import { HOME_VIEW, fitRouteBox, toPolyline, DIRECTION } from "../lib/map.js";

// 沿线路每隔几站取一个箭头位置与朝向；reverse 时调头。
function directionArrows(points, direction, gap = 3) {
  const arrows = [];
  for (let k = 1; k < points.length; k += gap) {
    const [x0, y0] = points[k - 1];
    const [x1, y1] = points[k];
    let angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    if (direction === DIRECTION.REVERSE) angle += 180;
    arrows.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, angle });
  }
  return arrows;
}

// 首页城市地图：真实边界 + 全部线路；选中线路时 viewBox 缓动聚焦。
export default memo(function CityMap({ mapModel, selectedLineId, direction, onSelect }) {
  const svgRef = useRef(null);
  const [intro, setIntro] = useState(true);
  const selected = mapModel.routes.find((r) => r.id === selectedLineId) ?? null;
  const targetBox = useMemo(
    () => (selected ? fitRouteBox(selected, { pad: 42, minWidth: 220 }) : HOME_VIEW),
    [selected],
  );

  useEffect(() => {
    const maxSegments = Math.max(...mapModel.routes.map((r) => r.segmentPoints.length));
    const total = (0.3 + mapModel.routes.length * 0.06 + maxSegments * 0.4 + 1.6) * 1000;
    const timer = setTimeout(() => setIntro(false), total);
    return () => clearTimeout(timer);
  }, [mapModel.routes]);

  useEffect(() => {
    if (selectedLineId) setIntro(false);
  }, [selectedLineId]);

  // viewBox 动画：rAF + ease-out cubic，同时更新 --u 保持线宽的屏幕尺寸稳定。
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const from = (svg.getAttribute("viewBox") ?? HOME_VIEW.join(" "))
      .split(/\s+/)
      .map(Number);
    const started = performance.now();
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 680;
    let frame;
    const tick = (now) => {
      const t = Math.min((now - started) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const box = from.map((v, i) => v + (targetBox[i] - v) * eased);
      svg.setAttribute("viewBox", box.join(" "));
      svg.style.setProperty("--u", box[2] / HOME_VIEW[2]);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [targetBox]);

  return (
    <svg
      ref={svgRef}
      className={`city-map${intro ? " intro" : ""}`}
      viewBox={HOME_VIEW.join(" ")}
      role="img"
      aria-label="依真实经纬度绘制的城市地铁线路图"
    >
      <defs>
        <filter id="city-shadow" x="-40%" y="-30%" width="180%" height="180%">
          <feDropShadow
            dx="0"
            dy="14"
            stdDeviation="16"
            floodColor="#3a3226"
            floodOpacity=".13"
          />
        </filter>
        <pattern id="map-grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path
            d="M26 0H0V26"
            fill="none"
            stroke="currentColor"
            strokeOpacity=".05"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect
        className="home-map-grid"
        x="-900"
        y="-500"
        width="2800"
        height="1800"
        fill="url(#map-grid)"
      />
      <g className="city-districts" filter="url(#city-shadow)">
        {mapModel.districts.map((d) => (
          <path key={d.id} d={d.d} aria-label={d.name} />
        ))}
      </g>
      <g className="home-routes">
        {mapModel.routes.map((route, i) => {
          const isSelected = route.id === selectedLineId;
          const delay = 0.3 + i * 0.06;
          const nodes = isSelected
            ? [...new Map(route.stations.map((s) => [s.stationId, s.point])).values()]
            : [];
          return (
            <g
              key={route.id}
              className={`home-route${isSelected ? " selected" : ""}${
                selectedLineId && !isSelected ? " muted" : ""
              }`}
              role="button"
              tabIndex={0}
              aria-label={`选择${route.lineName}`}
              onClick={() => onSelect(route.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(route.id);
                }
              }}
            >
              {route.segmentPoints.map((pts, si) => (
                <g key={si} style={{ "--seg-delay": `${(delay + si * 0.4).toFixed(2)}s` }}>
                  <polyline className="home-route-hit" points={toPolyline(pts)} />
                  <polyline
                    className="home-route-casing"
                    pathLength="1"
                    points={toPolyline(pts)}
                  />
                  <polyline
                    className="home-route-line"
                    pathLength="1"
                    points={toPolyline(pts)}
                    stroke={route.color}
                  />
                </g>
              ))}
              {nodes.map(([x, y], ni) => (
                <circle key={ni} className="home-route-node" cx={x} cy={y} />
              ))}
              {isSelected && direction
                ? route.segmentPoints.map((pts, si) =>
                    directionArrows(pts, direction).map((a, ai) => (
                      <g
                        key={`${direction}-${si}-${ai}`}
                        className="route-arrow"
                        transform={`translate(${a.x.toFixed(2)} ${a.y.toFixed(2)}) rotate(${a.angle.toFixed(1)})`}
                      >
                        <path className="dir-arrow" d="M -2.2 -1.7 L 2.6 0 L -2.2 1.7 Z" />
                      </g>
                    )),
                  )
                : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
});
