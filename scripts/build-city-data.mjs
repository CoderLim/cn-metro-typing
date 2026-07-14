/**
 * Build per-city data files for the typing game.
 *
 * Usage:
 *   node scripts/build-city-data.mjs <cityId> [--fresh]   构建单个城市
 *   node scripts/build-city-data.mjs --all [--fresh]      构建高德城市列表里的全部城市
 *
 * Sources:
 *   - City list: AMap subway citylist feed (spell / adcode / cityname)
 *   - Metro lines/stations: AMap subway feed (GCJ-02 coordinates)
 *   - District boundaries: Aliyun DataV GeoAtlas (also GCJ-02, so the two align)
 *   - Official English station names: data/en-names/<city>.json
 *     (curated from Wikipedia) + data/en-names/<city>-overrides.json (manual fixes)
 *     Cities without a curated file fall back to AMap's pinyin field.
 *
 * Output:
 *   - public/data/<city>/metro.json
 *   - public/data/<city>/boundary.json
 *   - public/data/cities.json（仅 --all 模式下重新生成，全量城市注册表）
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoArea, geoBounds } from "d3-geo";

const CITYLIST_URL = "http://map.amap.com/service/subway?srhdata=citylist.json";

// 人工覆盖：仅用于纠正/补充自动生成的城市元信息（不需要每个城市都有条目）。
const CITY_OVERRIDES = {
  shanghai: {
    operatorName: "上海地铁",
    // Badge codes for non-numeric lines.
    lineCodes: { 磁浮线: "ML", 浦江线: "PJ", 市域机场线: "JC" },
  },
};

const root = fileURLToPath(new URL("..", import.meta.url));
const rawDir = path.join(root, "data/raw");
const publicDataDir = path.join(root, "public/data");

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const allMode = args.includes("--all");
const cityArg = args.find((a) => !a.startsWith("--")) ?? null;

async function cached(file, url, fresh) {
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

// 少数省直辖县级市/直筒子市（如东莞、中山）没有市辖区，DataV 没有对应的
// "_full" 变体（按下级行政区划拆分），退回到不带 _full 的整市边界。
async function cachedBoundary(id, districtAdcode) {
  try {
    return await cached(
      `${id}-boundary.json`,
      `https://geo.datav.aliyun.com/areas_v3/bound/${districtAdcode}_full.json`,
      fresh,
    );
  } catch (fullErr) {
    try {
      return await cached(
        `${id}-boundary.json`,
        `https://geo.datav.aliyun.com/areas_v3/bound/${districtAdcode}.json`,
        fresh,
      );
    } catch {
      throw fullErr;
    }
  }
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

function stripAdminSuffix(name) {
  return name.replace(/(特别行政区|市)$/, "");
}

function toTitleCase(spell) {
  return spell.charAt(0).toUpperCase() + spell.slice(1).toLowerCase();
}

// 把高德城市列表里的一条记录整理成本脚本内部用的城市元信息，人工覆盖表优先。
function buildCityMeta(entry) {
  const id = entry.spell;
  const override = CITY_OVERRIDES[id] ?? {};
  const nameZh = override.nameZh ?? stripAdminSuffix(entry.cityname);
  const nameEn = override.nameEn ?? toTitleCase(entry.spell);
  const adcode = entry.adcode;
  const districtAdcode = override.districtAdcode ?? `${adcode}00`;
  const operatorName = override.operatorName ?? `${nameZh}地铁`;
  const lineCodes = override.lineCodes ?? {};
  return { id, adcode, districtAdcode, nameZh, nameEn, operatorName, lineCodes };
}

async function loadCityList() {
  const data = await cached("citylist.json", CITYLIST_URL, fresh);
  if (!data?.citylist?.length) throw new Error("高德城市列表为空");
  return data.citylist;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 构建单个城市：抓取（或读缓存）地铁 + 边界数据，写出 public/data/<city>/{metro,boundary}.json。
async function buildCity(cityMeta) {
  const { id, adcode, districtAdcode, nameZh, nameEn, operatorName, lineCodes } = cityMeta;
  const outDir = path.join(publicDataDir, id);

  const [subway, boundary] = await Promise.all([
    cached(`${id}-subway.json`, `http://map.amap.com/service/subway?srhdata=${adcode}_drw_${id}.json`, fresh),
    cachedBoundary(id, districtAdcode),
  ]);

  if (!subway?.l?.length) throw new Error("无地铁线路数据");
  if (!boundary?.features?.length) throw new Error("无边界数据");

  const enNames = {
    ...(await loadOptional(`data/en-names/${id}.json`)),
    ...(await loadOptional(`data/en-names/${id}-overrides.json`)),
  };
  // AMap annotates some names with parentheticals the curated mapping may not
  // carry, e.g. "浦东南路(原东昌路)" or "国家会展中心(2号线)".
  function lookupEn(stationNameZh) {
    const stripped = stationNameZh.replace(/[（(][^（）()]*[）)]/g, "").trim();
    return enNames[stationNameZh] ?? enNames[stripped] ?? null;
  }
  // 徽章代号："1号线八通线"→"1"、"4号线大兴线"→"4"、"S1线"→"S1"、"APM线"→"APM"
  function lineCode(lineName) {
    if (lineCodes[lineName]) return lineCodes[lineName];
    const numeric = lineName.match(/^([A-Za-z]{0,2}\d+)号?线/);
    if (numeric) return numeric[1];
    const letters = lineName.match(/^([A-Z]{2,4})线/);
    if (letters) return letters[1];
    return lineName.slice(0, 2);
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
        const stId = st.sid;
        ids.push(stId);
        if (stationsById.has(stId)) continue;
        const [lon, lat] = st.sl.split(",").map(Number);
        let stationNameEn = lookupEn(st.n);
        if (!stationNameEn) {
          stationNameEn = prettifyPinyin(st.sp) || st.n;
          missing.push(`${lineName} ${st.n} → ${stationNameEn}`);
        }
        const pinyin =
          (st.sp ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") ||
          typingTarget(stationNameEn).replace(/[^a-z0-9]/g, "");
        stationsById.set(stId, {
          id: stId,
          stationId: stId,
          nameZh: st.n,
          nameEn: stationNameEn,
          target: typingTarget(stationNameEn),
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
      id: `${adcode}-${lineCode(lineName)}`,
      operatorId: adcode,
      operatorName,
      lineId: lineCode(lineName),
      lineName,
      color: `#${runs[0].cl}`,
      loop: runs[0].lo === 1 || runs[0].lo === "1",
      stations,
      segments,
    });
  }

  const metro = {
    city: id,
    cityNameZh: nameZh,
    cityNameEn: nameEn,
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

  const stationCount = lines.reduce((n, l) => n + l.stations.length, 0);
  // 城市中心（边界外包框中点），供全国地图打点与聚焦缩放使用。
  const [[west, south], [east, north]] = geoBounds(boundaryOut);
  const center = [
    Number(((west + east) / 2).toFixed(4)),
    Number(((south + north) / 2).toFixed(4)),
  ];
  return {
    id,
    adcode,
    nameZh,
    nameEn,
    center,
    lineCount: lines.length,
    stationCount,
    missing,
  };
}

async function runSingle(id) {
  const citylist = await loadCityList();
  const entry = citylist.find((c) => c.spell === id);
  if (!entry) {
    console.error(
      `未知城市 "${id}"，请从高德城市列表里取 spell 字段（如 shanghai / beijing / guangzhou），或使用 --all 构建全部城市。`,
    );
    process.exit(1);
  }
  const cityMeta = buildCityMeta(entry);
  const summary = await buildCity(cityMeta);
  console.log(`✓ ${summary.nameZh}：${summary.lineCount} 条线路，${summary.stationCount} 个站点`);
  if (summary.missing.length) {
    console.log(`\n⚠ ${summary.missing.length} 个站点缺官方英文名（已用拼音回退）：`);
    for (const m of summary.missing) console.log("  " + m);
  }
}

async function runAll() {
  const citylist = await loadCityList();
  const results = [];
  const failures = [];

  for (const entry of citylist) {
    const cityMeta = buildCityMeta(entry);
    try {
      const summary = await buildCity(cityMeta);
      results.push(summary);
      const missingNote = summary.missing.length ? `（${summary.missing.length} 站缺官方英文名，已用拼音回退）` : "";
      console.log(`✓ ${summary.nameZh}(${summary.id})：${summary.lineCount} 条线路，${summary.stationCount} 个站点${missingNote}`);
    } catch (err) {
      console.error(`✗ ${cityMeta.nameZh}(${cityMeta.id})：${err.message}`);
      failures.push({ id: cityMeta.id, nameZh: cityMeta.nameZh, reason: err.message });
    }
    // 城市之间限速，别并发/连续轰高德与 DataV 接口。
    await sleep(200);
  }

  const registry = results
    .map((r) => ({
      id: r.id,
      adcode: r.adcode,
      nameZh: r.nameZh,
      nameEn: r.nameEn,
      center: r.center,
      lineCount: r.lineCount,
      stationCount: r.stationCount,
    }))
    .sort((a, b) => b.lineCount - a.lineCount);

  await mkdir(publicDataDir, { recursive: true });
  await writeFile(path.join(publicDataDir, "cities.json"), JSON.stringify(registry, null, 2));

  // 全国省级边界（含港澳台与南海诸岛，按 DataV 原样保留），供全国选城地图使用。
  const china = await cached(
    "china-boundary.json",
    "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
    fresh,
  );
  const chinaOut = {
    ...china,
    features: (china.features ?? []).map((f) =>
      f.geometry ? { ...f, geometry: rewind(f.geometry) } : f,
    ),
  };
  await writeFile(path.join(publicDataDir, "china.json"), JSON.stringify(chinaOut));
  console.log("✓ 全国省界已写入 public/data/china.json");

  console.log(`\n完成：${results.length}/${citylist.length} 个城市成功，已写入 public/data/cities.json`);
  if (failures.length) {
    console.log(`\n✗ 失败清单（${failures.length}）：`);
    for (const f of failures) console.log(`  ${f.nameZh}(${f.id})：${f.reason}`);
  }
}

if (allMode) {
  await runAll();
} else if (cityArg) {
  await runSingle(cityArg);
} else {
  console.error(
    "用法：node scripts/build-city-data.mjs <cityId> [--fresh]  或  node scripts/build-city-data.mjs --all [--fresh]",
  );
  process.exit(1);
}
