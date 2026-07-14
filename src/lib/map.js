import { geoMercator, geoPath } from "d3-geo";

// 首页地图的基准 viewBox；投影把城市边界 fit 进右侧区域，左侧留给文案。
export const HOME_VIEW = [0, 0, 960, 760];
export const HOME_MAP_EXTENT = [
  [430, 56],
  [920, 720],
];

export const DIRECTION = { FORWARD: "forward", REVERSE: "reverse" };

// 每个城市只构建一次：行政区 path + 线路的投影坐标与折线段。
export function buildMapModel(boundary, lines, extent = HOME_MAP_EXTENT) {
  const projection = geoMercator().fitExtent(extent, boundary);
  const path = geoPath(projection);
  const districts = boundary.features.map((f) => ({
    id: f.properties.adcode ?? f.properties.name,
    name: f.properties.name,
    d: path(f),
  }));
  const routes = lines.map((line) => {
    const pointsById = new Map(
      line.stations.map((s) => [s.stationId, projection([s.lon, s.lat])]),
    );
    const segmentPoints = lineSegments(line)
      .map((ids) => ids.map((id) => pointsById.get(id)).filter(Boolean))
      .map((pts) =>
        line.loop && pts.length > 2 ? [...pts, pts[0]] : pts,
      )
      .filter((pts) => pts.length > 1);
    return {
      ...line,
      pointsById,
      segmentPoints,
      stations: line.stations.map((s) => ({
        ...s,
        point: pointsById.get(s.stationId),
      })),
    };
  });
  return { districts, routes };
}

function lineSegments(line) {
  const segments = line.segments?.length
    ? line.segments
    : [line.stations.map((s) => s.stationId)];
  return segments;
}

// 一条线的可选行驶区间（主线/支线各成一个 run）。
export function lineRuns(line) {
  if (!line) return [];
  const byId = new Map(line.stations.map((s) => [s.stationId, s]));
  return lineSegments(line)
    .map((ids, index) => {
      const stations = ids.map((id) => byId.get(id)).filter(Boolean);
      return {
        index,
        stations,
        label: stations.length
          ? `${stations[0].nameZh} → ${stations[stations.length - 1].nameZh}`
          : "",
      };
    })
    .filter((run) => run.stations.length > 1);
}

export function runStations(line, runIndex = 0, direction = DIRECTION.FORWARD) {
  const runs = lineRuns(line);
  const stations = (runs[runIndex] ?? runs[0])?.stations ?? [];
  return direction === DIRECTION.REVERSE ? [...stations].reverse() : stations;
}

// 由线路的投影点集算出聚焦 viewBox（含留白与最小尺寸/纵横比约束）。
export function fitRouteBox(route, { pad = 26, minWidth = 110, ratio = 0.72 } = {}) {
  const pts = route?.segmentPoints.flat() ?? [];
  if (!pts.length) return HOME_VIEW;
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX + pad * 2, minWidth);
  const height = Math.max(maxY - minY + pad * 2, width * ratio);
  return [
    (minX + maxX - width) / 2,
    (minY + maxY - height) / 2,
    width,
    height,
  ];
}

export function toPolyline(points) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}
