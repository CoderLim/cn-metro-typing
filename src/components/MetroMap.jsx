import { useEffect, useMemo, useRef, useState } from "react";
import { HOME_VIEW, fitRouteBox, toPolyline } from "../lib/map.js";

// 游戏地图：相机跟随火车拉近视角，火车随打字进度在站间插值前进。
export default function MetroMap({
  mapModel,
  line,
  stations,
  stationIndex,
  trainProgress,
}) {
  const route = mapModel.routes.find((r) => r.id === line.id);
  const box = useMemo(() => {
    const b = fitRouteBox(route, { pad: 34, minWidth: 170 });
    return [b[0], b[1] + b[3] * 0.14, b[2], b[3]];
  }, [route]);

  // 相机视野：约等于相邻站平均间距的 5.5 倍；缩放增益太小的短线不跟随。
  const followWidth = useMemo(() => {
    const pts = stations
      .map((s) => route.pointsById.get(s.stationId))
      .filter(Boolean);
    let sum = 0;
    for (let i = 1; i < pts.length; i++) {
      sum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    const avg = pts.length > 1 ? sum / (pts.length - 1) : box[2];
    return Math.min(Math.max(avg * 5.5, 36), box[2]);
  }, [stations, route, box]);
  const zoom = box[2] / followWidth;
  const following = zoom >= 1.15;

  const nextIndex = stationIndex + 1 < stations.length ? stationIndex + 1 : null;
  const current = route.pointsById.get(stations[stationIndex].stationId);
  const next =
    nextIndex === null ? current : route.pointsById.get(stations[nextIndex].stationId);
  const t = nextIndex === null ? 0 : Math.min(Math.max(trainProgress, 0), 1);
  const train = [
    current[0] + (next[0] - current[0]) * t,
    current[1] + (next[1] - current[1]) * t,
  ];
  const progressPoints = stations
    .slice(0, stationIndex + 1)
    .map((s) => route.pointsById.get(s.stationId))
    .filter(Boolean);
  if (t > 0) progressPoints.push(train);

  const unit = box[2] / HOME_VIEW[2] / (following ? zoom : 1);
  const trainScale = unit * 0.28;

  // 跟随时火车固定在画面偏上（38% 高度），底部留给到站牌。
  const cameraTransform = following
    ? `translate(${(box[0] + box[2] / 2).toFixed(2)}px, ${(box[1] + box[3] * 0.38).toFixed(2)}px) scale(${zoom.toFixed(4)}) translate(${(-train[0]).toFixed(2)}px, ${(-train[1]).toFixed(2)}px)`
    : "none";

  // 到站脉冲：站序变化时（含 timed 模式回绕）在刚完成的站点放一个扩散环。
  const prevIndexRef = useRef(stationIndex);
  const [pulse, setPulse] = useState(null);
  useEffect(() => {
    const prev = prevIndexRef.current;
    if (prev !== stationIndex) {
      prevIndexRef.current = stationIndex;
      const station = stations[prev];
      const point = station && route.pointsById.get(station.stationId);
      if (point) {
        setPulse({
          x: point[0],
          y: point[1],
          id: `${station.stationId}-${prev}-${stationIndex}`,
        });
      }
    }
  }, [stationIndex, stations, route]);

  return (
    <svg
      className="metro-map"
      viewBox={box.join(" ")}
      style={{ "--u": unit }}
      aria-hidden="true"
    >
      <g className="camera" style={{ transform: cameraTransform }}>
        <g className="game-districts">
          {mapModel.districts.map((d) => (
            <path key={d.id} d={d.d} />
          ))}
        </g>
        {mapModel.routes.map((r) =>
          r.id === route.id
            ? null
            : r.segmentPoints.map((pts, i) => (
                <polyline
                  key={`${r.id}-${i}`}
                  className="map-line network"
                  points={toPolyline(pts)}
                  stroke={r.color}
                />
              )),
        )}
        {route.segmentPoints.map((pts, i) => (
          <polyline key={`c-${i}`} className="map-casing" points={toPolyline(pts)} />
        ))}
        {route.segmentPoints.map((pts, i) => (
          <polyline
            key={`l-${i}`}
            className="map-line selected"
            points={toPolyline(pts)}
            stroke={route.color}
          />
        ))}
        <polyline
          className="map-progress"
          points={toPolyline(progressPoints)}
          stroke={route.color}
        />
        {route.stations.map((s) => {
          const idx = stations.findIndex((x) => x.stationId === s.stationId);
          const state =
            idx >= 0 && idx < stationIndex
              ? " is-passed"
              : idx === stationIndex
                ? " is-current"
                : idx === nextIndex
                  ? " is-next"
                  : "";
          return (
            <circle
              key={s.stationId}
              className={`map-node${state}`}
              cx={s.point[0]}
              cy={s.point[1]}
            />
          );
        })}
        {pulse ? (
          <g
            key={pulse.id}
            className="node-pulse"
            style={{ transform: `translate(${pulse.x}px, ${pulse.y}px)` }}
          >
            <circle r={5 * unit} stroke={route.color} />
          </g>
        ) : null}
        <g
          className="map-train"
          style={{ transform: `translate(${train[0]}px, ${train[1]}px)` }}
        >
          <g className="map-train-icon" transform={`scale(${trainScale.toFixed(4)})`}>
            <circle className="train-halo" r="24" />
            <rect className="train-body" x="-18" y="-13" width="36" height="26" rx="8" />
            <rect className="train-window" x="-12" y="-7" width="9" height="8" rx="2.5" />
            <rect className="train-window" x="3" y="-7" width="9" height="8" rx="2.5" />
            <circle className="train-light" cx="-10" cy="8" r="2.2" />
            <circle className="train-light" cx="10" cy="8" r="2.2" />
          </g>
        </g>
        <text
          className="map-station-label"
          x={current[0]}
          y={current[1] - 9 * unit}
          textAnchor="middle"
        >
          {stations[stationIndex].nameZh}
        </text>
      </g>
    </svg>
  );
}
