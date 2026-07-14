/**
 * Build per-city data files for the typing game.
 *
 * Usage: node scripts/build-city-data.mjs <cityId> [--fresh]
 *
 * Sources:
 *   - Metro lines/stations: AMap subway feed (GCJ-02 coordinates)
 *   - District boundaries: Aliyun DataV GeoAtlas (also GCJ-02, so the two align)
 *   - Official English station names: data/en-names/<city>.json
 *     (curated from Wikipedia) + data/en-names/<city>-overrides.json (manual fixes)
 *
 * Output:
 *   - public/data/<city>/metro.json
 *   - public/data/<city>/boundary.json
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoArea } from "d3-geo";

const CITIES = {
  shanghai: {
    adcode: "3100",
    districtAdcode: "310000",
    nameZh: "上海",
    nameEn: "Shanghai",
    operatorName: "上海地铁",
    // Badge codes for non-numeric lines.
    lineCodes: { 磁浮线: "ML", 浦江线: "PJ", 市域机场线: "JC" },
  },
};

const cityId = process.argv[2];
const fresh = process.argv.includes("--fresh");
const city = CITIES[cityId];
if (!city) {
  console.error(`未知城市 "${cityId}"，可用：${Object.keys(CITIES).join(", ")}`);
  process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const rawDir = path.join(root, "data/raw");
const outDir = path.join(root, "public/data", cityId);

async function cached(file, url) {
  const target = path.join(rawDir, file);
  if (!fresh) {
    try {
      await access(target);
      return JSON.parse(await readFile(target, "utf-8"));
    } catch {
      // fall through to fetch
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${url}（${res.status}）`);
  const data = await res.json();
  await mkdir(rawDir, { recursive: true });
  await writeFile(target, JSON.stringify(data));
  return data;
}

async function loadOptional(file) {
  try {
    return JSON.parse(await readFile(path.join(root, file), "utf-8"));
  } catch {
    return {};
  }
}

function lineCode(lineName) {
  const numeric = lineName.match(/^(\d+)号线$/);
  if (numeric) return numeric[1];
  return city.lineCodes[lineName] ?? lineName.slice(0, 2);
}

function typingTarget(nameEn) {
  return nameEn
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9'& ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fallback when no official English name exists: AMap's pinyin field,
// e.g. "WaiHuan Lu" -> "Waihuan Lu".
function prettifyPinyin(sp) {
  return (sp ?? "")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// GeoJSON（RFC 7946）的外环是逆时针，而 d3-geo 按球面几何要求顺时针，
// 否则会渲染成"全球减去该多边形"。写出前把环的绕向翻转成 d3 约定。
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

const [subway, boundary] = await Promise.all([
  cached(
    `${cityId}-subway.json`,
    `http://map.amap.com/service/subway?srhdata=${city.adcode}_drw_${cityId}.json`,
  ),
  cached(
    `${cityId}-boundary.json`,
    `https://geo.datav.aliyun.com/areas_v3/bound/${city.districtAdcode}_full.json`,
  ),
]);

const enNames = {
  ...(await loadOptional(`data/en-names/${cityId}.json`)),
  ...(await loadOptional(`data/en-names/${cityId}-overrides.json`)),
};

// AMap annotates some names with parentheticals the curated mapping may not
// carry, e.g. "浦东南路(原东昌路)" or "国家会展中心(2号线)".
function lookupEn(nameZh) {
  const stripped = nameZh.replace(/[（(][^（）()]*[）)]/g, "").trim();
  return enNames[nameZh] ?? enNames[stripped] ?? null;
}

// AMap represents each service run (main line / branch) as a separate entry
// sharing the same line name. Group runs into one line; each run becomes a
// segment, mirroring how branches are picked as separate 区间 in the game.
const grouped = new Map();
for (const entry of subway.l ?? []) {
  if (!grouped.has(entry.ln)) grouped.set(entry.ln, []);
  grouped.get(entry.ln).push(entry);
}

const missing = [];
const lines = [];
for (const [lineName, runs] of grouped) {
  runs.sort((a, b) => b.st.length - a.st.length);
  const stationsById = new Map();
  const segments = [];
  for (const run of runs) {
    const ids = [];
    for (const st of run.st) {
      const id = st.sid;
      ids.push(id);
      if (stationsById.has(id)) continue;
      const [lon, lat] = st.sl.split(",").map(Number);
      let nameEn = lookupEn(st.n);
      if (!nameEn) {
        nameEn = prettifyPinyin(st.sp) || st.n;
        missing.push(`${lineName} ${st.n} → ${nameEn}`);
      }
      const pinyin =
        (st.sp ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") ||
        typingTarget(nameEn).replace(/[^a-z0-9]/g, "");
      stationsById.set(id, {
        id,
        stationId: id,
        nameZh: st.n,
        nameEn,
        target: typingTarget(nameEn),
        pinyin,
        lat,
        lon,
      });
    }
    segments.push(ids);
  }
  const stations = [...stationsById.values()].map((s, i) => ({
    ...s,
    sequence: i + 1,
  }));
  lines.push({
    id: `${city.adcode}-${lineCode(lineName)}`,
    operatorId: city.adcode,
    operatorName: city.operatorName,
    lineId: lineCode(lineName),
    lineName,
    color: `#${runs[0].cl}`,
    loop: runs[0].lo === 1 || runs[0].lo === "1",
    stations,
    segments,
  });
}

const metro = {
  city: cityId,
  cityNameZh: city.nameZh,
  cityNameEn: city.nameEn,
  source: "高德地图地铁数据（非官方接口）· 官方英文站名整理自 Wikipedia",
  generatedAt: new Date().toISOString(),
  lines,
};

const boundaryOut = {
  ...boundary,
  features: boundary.features.map((f) => ({ ...f, geometry: rewind(f.geometry) })),
};

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "metro.json"), JSON.stringify(metro, null, 2));
await writeFile(path.join(outDir, "boundary.json"), JSON.stringify(boundaryOut));

const total = lines.reduce((n, l) => n + l.stations.length, 0);
console.log(`✓ ${city.nameZh}：${lines.length} 条线路，${total} 个站点`);
if (missing.length) {
  console.log(`\n⚠ ${missing.length} 个站点缺官方英文名（已用拼音回退）：`);
  for (const m of missing) console.log("  " + m);
}
