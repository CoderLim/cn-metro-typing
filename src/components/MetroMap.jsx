import { useMemo } from "react";
import { HOME_VIEW, fitRouteBox, toPolyline } from "../lib/map.js";

// 游戏地图：聚焦选中线路，火车随打字进度在当前站与下一站之间插值前进。
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

  const unit = box[2] / HOME_VIEW[2];
  const trainScale = unit * 0.28;

  return (
    <svg
      className="metro-map"
      viewBox={box.join(" ")}
      style={{ "--u": unit }}
      aria-hidden="true"
    >
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
    </svg>
  );
}
