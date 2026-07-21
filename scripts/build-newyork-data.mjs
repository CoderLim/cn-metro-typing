/**
 * Build New York City subway data for the typing game.
 *
 * Usage:
 *   node scripts/build-newyork-data.mjs [--fresh]
 *
 * Sources:
 *   - Metro lines/stations: MTA Subway GTFS (WGS84)
 *     https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip
 *   - Borough boundaries: Click That Hood NYC boroughs GeoJSON (WGS84)
 *     (accurate shoreline-clipped borough polygons; NYC Open Data geospatial
 *     export was unavailable at script authoring time)
 *
 * Notes:
 *   - GTFS Trip Line express variants (6X/7X/FX) are folded into published Lines.
 *   - Selectable 区间 keep full-length published branches; short turns / late-night
 *     cutbacks are filtered out.
 *   - stationCount counts unique typing targets (station names), not raw stop IDs.
 *
 * Output:
 *   - public/data/newyork/metro.json
 *   - public/data/newyork/boundary.json
 *   - public/data/cities.json（合并/更新 newyork 条目）
 */
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { geoArea, geoBounds } from "d3-geo";

const execFileAsync = promisify(execFile);

const CITY_ID = "newyork";
const GTFS_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";
const BOUNDARY_URL =
  "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/new-york-city-boroughs.geojson";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceDir = path.join(root, "data/sources/newyork");
const gtfsDir = path.join(sourceDir, "gtfs");
const publicDataDir = path.join(root, "public/data");
const outDir = path.join(publicDataDir, CITY_ID);

const fresh = process.argv.includes("--fresh");

function typingTarget(nameEn) {
  return nameEn
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9'&\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// GeoJSON（RFC 7946）外环逆时针；d3-geo 按球面几何要顺时针。
const ringArea = (ring) => geoArea({ type: "Polygon", coordinates: [ring] });
function rewindRings(rings) {
  return rings.map((ring, i) => {
    const inverted = ringArea(ring) > Math.PI;
    const shouldReverse = i === 0 ? inverted : !inverted;
    return shouldReverse ? [...ring].reverse() : ring;
  });
}
function rewind(geometry) {
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: rewindRings(geometry.coordinates) };
  }
  if (geometry.type === "MultiPolygon") {
    return { ...geometry, coordinates: geometry.coordinates.map(rewindRings) };
  }
  return geometry;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c !== "")).map((r) => {
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] ?? "";
    return obj;
  });
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function download(url, target) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${url}（${res.status}）`);
  await mkdir(path.dirname(target), { recursive: true });
  await pipeline(res.body, createWriteStream(target));
}

async function ensureGtfs() {
  const zipPath = path.join(sourceDir, "gtfs_subway.zip");
  const routesPath = path.join(gtfsDir, "routes.txt");
  if (fresh || !(await fileExists(routesPath))) {
    console.log("Downloading MTA subway GTFS…");
    await download(GTFS_URL, zipPath);
    await mkdir(gtfsDir, { recursive: true });
    await execFileAsync("unzip", ["-o", zipPath, "-d", gtfsDir]);
  } else {
    console.log("Using cached GTFS in data/sources/newyork/gtfs/");
  }
}

async function loadBoundary() {
  const cachePath = path.join(sourceDir, "boroughs.geojson");
  if (fresh || !(await fileExists(cachePath))) {
    console.log("Downloading NYC borough boundaries…");
    const res = await fetch(BOUNDARY_URL);
    if (!res.ok) throw new Error(`下载边界失败（${res.status}）`);
    const text = await res.text();
    await mkdir(sourceDir, { recursive: true });
    await writeFile(cachePath, text);
  } else {
    console.log("Using cached borough boundaries");
  }
  const raw = JSON.parse(await readFile(cachePath, "utf-8"));
  if (!raw?.features?.length) throw new Error("边界数据为空");
  return {
    type: "FeatureCollection",
    features: raw.features.map((f) => {
      const name =
        f.properties?.name ??
        f.properties?.BoroName ??
        f.properties?.boro_name ??
        "Unknown";
      return {
        type: "Feature",
        properties: { name },
        geometry: rewind(f.geometry),
      };
    }),
  };
}

function stationKey(stop, stopsById) {
  const parent = stop.parent_station?.trim();
  if (parent && stopsById.has(parent)) return parent;
  return stop.stop_id;
}

function resolveStation(stopId, stopsById) {
  const stop = stopsById.get(stopId);
  if (!stop) return null;
  const key = stationKey(stop, stopsById);
  const base = stopsById.get(key) ?? stop;
  const nameEn = base.stop_name;
  // Schema still requires nameZh for map/UI labels. Non-China cities force
  // English typing mode, so mirror the English name here intentionally.
  return {
    id: key,
    stationId: key,
    nameZh: nameEn,
    nameEn,
    target: typingTarget(nameEn),
    pinyin: "",
    lat: Number(base.stop_lat),
    lon: Number(base.stop_lon),
  };
}

function canonicalizeIds(ids) {
  const fwd = ids.join("\0");
  const rev = [...ids].reverse().join("\0");
  return fwd <= rev ? ids : [...ids].reverse();
}

function terminalKey(ids) {
  const a = ids[0];
  const b = ids.at(-1);
  return a <= b ? `${a}\0${b}` : `${b}\0${a}`;
}

function isSubsequence(shortIds, longIds) {
  if (shortIds.length >= longIds.length) return false;
  let j = 0;
  for (let i = 0; i < longIds.length && j < shortIds.length; i++) {
    if (longIds[i] === shortIds[j]) j++;
  }
  return j === shortIds.length;
}

function isShortTurnOf(candidate, longer) {
  const longSet = new Set(longer.ids);
  const cStart = candidate.ids[0];
  const cEnd = candidate.ids.at(-1);
  if (!longSet.has(cStart) || !longSet.has(cEnd)) return false;
  const sharesTerminal =
    cStart === longer.ids[0] ||
    cStart === longer.ids.at(-1) ||
    cEnd === longer.ids[0] ||
    cEnd === longer.ids.at(-1);
  if (!sharesTerminal) return false;
  if (
    isSubsequence(candidate.ids, longer.ids) ||
    isSubsequence([...candidate.ids].reverse(), longer.ids)
  ) {
    return true;
  }
  // Same corridor, noticeably shorter (rush / late-night cutbacks).
  return candidate.ids.length < longer.ids.length * 0.85;
}

/**
 * Keep published full-length branches; drop short turns / late-night cutbacks.
 * One representative per terminal pair, ranked by length×log(frequency), then
 * drop short turns of longer kept runs (cap 3 — e.g. A to Lefferts / Far Rockaway / Rockaway Park).
 */
function pickSegments(sequenceCounts) {
  const entries = [...sequenceCounts.entries()]
    .map(([key, count]) => ({ ids: key.split("\0"), count }))
    .filter((e) => e.ids.length > 1);
  if (!entries.length) return [];

  // One representative per terminal pair: prefer longer, then more frequent.
  const byTerminals = new Map();
  for (const entry of entries) {
    const key = terminalKey(entry.ids);
    const prev = byTerminals.get(key);
    if (
      !prev ||
      entry.ids.length > prev.ids.length ||
      (entry.ids.length === prev.ids.length && entry.count > prev.count)
    ) {
      byTerminals.set(key, entry);
    }
  }

  const score = (e) => e.ids.length * Math.log10(e.count + 1);
  const candidates = [...byTerminals.values()].sort(
    (a, b) => score(b) - score(a) || b.ids.length - a.ids.length || b.count - a.count,
  );

  const kept = [];
  for (const candidate of candidates) {
    if (kept.some((k) => isShortTurnOf(candidate, k))) continue;
    // Drop rare schedule oddities (count=1–3 long trips) once a primary exists.
    if (kept.length) {
      const primary = kept[0];
      const minCount = Math.max(3, Math.floor(primary.count * 0.04));
      if (candidate.count < minCount) continue;
    }
    kept.push(candidate);
    if (kept.length >= 3) break;
  }

  return kept.map((e) => e.ids);
}

function lineSortKey(lineId) {
  if (/^\d+$/.test(lineId)) return [0, Number(lineId), ""];
  return [1, lineId.charCodeAt(0), lineId];
}

function shuttleLabel(longName, routeId) {
  const name = (longName || "").replace(/\s+Shuttle$/i, "").trim();
  if (name) return name.replace(/\s+St\b/i, " St");
  return routeId;
}

/** GTFS Trip Line express variants (6X/7X/FX) fold into the published Line. */
function publishedLineId(routeId, shortName) {
  const id = (routeId || "").trim();
  const short = (shortName || "").trim();
  // Express trip lines → base published line.
  if (/^[A-Z0-9]+X$/i.test(id) && id.length > 1) return id.slice(0, -1).toUpperCase();
  // Prefer public short name (SIR vs SI), but keep GS/FS/H when short_name is shared "S".
  if (short && short !== "S") return short;
  return id || short;
}

function isExpressRoute(route) {
  const raw = (route.route_id || "").trim();
  return /^[A-Z0-9]+X$/i.test(raw) && raw.length > 1;
}

function displayLineName(route, lineId) {
  if (["GS", "FS", "H"].includes(lineId) || (route.route_short_name || "").trim() === "S") {
    return `S · ${shuttleLabel(route.route_long_name, lineId)}`;
  }
  return lineId;
}

async function buildMetro() {
  await ensureGtfs();
  const [routes, trips, stopTimes, stops] = await Promise.all([
    readFile(path.join(gtfsDir, "routes.txt"), "utf-8").then(parseCsv),
    readFile(path.join(gtfsDir, "trips.txt"), "utf-8").then(parseCsv),
    readFile(path.join(gtfsDir, "stop_times.txt"), "utf-8").then(parseCsv),
    readFile(path.join(gtfsDir, "stops.txt"), "utf-8").then(parseCsv),
  ]);

  const stopsById = new Map(stops.map((s) => [s.stop_id, s]));
  const routesById = new Map(routes.map((r) => [r.route_id, r]));
  const tripRouteId = new Map(trips.map((t) => [t.trip_id, t.route_id]));

  // Group trips by published line (6X→6, 7X→7, FX→F).
  const tripsByLine = new Map();
  const lineMeta = new Map();
  for (const trip of trips) {
    const route = routesById.get(trip.route_id);
    if (!route) continue;
    const lineId = publishedLineId(route.route_id, route.route_short_name);
    if (!tripsByLine.has(lineId)) tripsByLine.set(lineId, []);
    tripsByLine.get(lineId).push(trip.trip_id);

    const express = isExpressRoute(route);
    const prev = lineMeta.get(lineId);
    if (!prev || (prev.express && !express)) {
      lineMeta.set(lineId, { route, express });
    }
  }

  const timesByTrip = new Map();
  for (const row of stopTimes) {
    if (!timesByTrip.has(row.trip_id)) timesByTrip.set(row.trip_id, []);
    timesByTrip.get(row.trip_id).push(row);
  }
  for (const list of timesByTrip.values()) {
    list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  }

  const lines = [];
  for (const [lineId, allTripIds] of tripsByLine) {
    const { route } = lineMeta.get(lineId) ?? {};
    if (!route || !allTripIds.length) continue;

    // Build 区间 from base-route trips only (ignore express trip shapes).
    const baseTripIds = allTripIds.filter((tripId) => {
      const r = routesById.get(tripRouteId.get(tripId));
      return r && !isExpressRoute(r);
    });
    const segmentTripIds = baseTripIds.length ? baseTripIds : allTripIds;

    const sequenceCounts = new Map();
    for (const tripId of segmentTripIds) {
      const times = timesByTrip.get(tripId) ?? [];
      const ids = [];
      for (const t of times) {
        const station = resolveStation(t.stop_id, stopsById);
        if (!station) continue;
        if (ids.at(-1) === station.stationId) continue;
        ids.push(station.stationId);
      }
      if (ids.length < 2) continue;
      const key = canonicalizeIds(ids).join("\0");
      sequenceCounts.set(key, (sequenceCounts.get(key) ?? 0) + 1);
    }

    const segments = pickSegments(sequenceCounts);
    if (!segments.length) continue;

    const stationsById = new Map();
    for (const seg of segments) {
      for (const id of seg) {
        if (stationsById.has(id)) continue;
        const station = resolveStation(id, stopsById);
        if (station) stationsById.set(id, station);
      }
    }

    const stations = [...stationsById.values()].map((s, i) => ({
      ...s,
      sequence: i + 1,
    }));
    if (stations.length < 2) continue;

    const color = (route.route_color || "0039A6").replace(/^#/, "");
    const loop = segments.some((seg) => seg.length > 2 && seg[0] === seg.at(-1));

    lines.push({
      id: `nyc-${lineId}`,
      operatorId: "mta",
      operatorName: "MTA New York City Transit",
      lineId,
      lineName: displayLineName(route, lineId),
      color: `#${color}`,
      loop,
      stations,
      segments,
    });
  }

  lines.sort((a, b) => {
    const ka = lineSortKey(a.lineId);
    const kb = lineSortKey(b.lineId);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return 0;
  });

  if (!lines.length) throw new Error("未解析出任何地铁线路");

  return {
    city: CITY_ID,
    cityNameZh: "纽约",
    cityNameEn: "New York",
    source:
      "MTA Subway GTFS · Borough boundaries from Click That Hood (NYC boroughs)",
    generatedAt: new Date().toISOString(),
    lines,
  };
}

async function upsertCitiesRegistry(metro, boundary) {
  const citiesPath = path.join(publicDataDir, "cities.json");
  const cities = JSON.parse(await readFile(citiesPath, "utf-8"));
  if (!Array.isArray(cities)) throw new Error("cities.json 格式无效");

  const [[west, south], [east, north]] = geoBounds(boundary);
  const center = [
    Number(((west + east) / 2).toFixed(4)),
    Number(((south + north) / 2).toFixed(4)),
  ];
  // Count unique typing targets (station names), not raw GTFS stop IDs.
  const targets = new Set();
  for (const line of metro.lines) {
    for (const s of line.stations) targets.add(s.target || s.nameEn);
  }

  const entry = {
    id: CITY_ID,
    adcode: "nyc",
    nameZh: "纽约",
    nameEn: "New York",
    region: "us",
    center,
    lineCount: metro.lines.length,
    stationCount: targets.size,
  };

  const idx = cities.findIndex((c) => c.id === CITY_ID);
  if (idx >= 0) cities[idx] = { ...cities[idx], ...entry };
  else cities.push(entry);

  cities.sort((a, b) => {
    const ra = a.region ?? "cn";
    const rb = b.region ?? "cn";
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a.nameEn.localeCompare(b.nameEn);
  });

  await writeFile(citiesPath, `${JSON.stringify(cities, null, 2)}\n`);
  return entry;
}

async function main() {
  const [metro, boundary] = await Promise.all([buildMetro(), loadBoundary()]);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "metro.json"), `${JSON.stringify(metro, null, 2)}\n`);
  await writeFile(
    path.join(outDir, "boundary.json"),
    `${JSON.stringify(boundary, null, 2)}\n`,
  );
  const entry = await upsertCitiesRegistry(metro, boundary);
  console.log(
    `Wrote ${metro.lines.length} lines / ${entry.stationCount} stations → public/data/newyork/`,
  );
  console.log(`Updated cities.json entry:`, entry);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
