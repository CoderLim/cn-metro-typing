/**
 * Fetch official English metro station names from English Wikipedia and
 * write data/en-names/<city>.json (Chinese station name -> official
 * English name), consumed by scripts/build-city-data.mjs.
 *
 * Approach (mirrors how data/en-names/shanghai.json was curated by hand):
 *   1. For a city, try a list of candidate Wikipedia page titles, most
 *      commonly "List of <City> Metro/Subway/Rail Transit stations".
 *   2. Parse the page's wikitables for rows that carry both an English
 *      station name and its Chinese name (either column order), pairing
 *      adjacent cells.
 *   3. Keep the first candidate page that yields a non-trivial number of
 *      pairs; write the resulting map (sorted for a stable diff).
 *
 * Cities with no working Wikipedia list page are skipped entirely (no
 * file is written) so scripts/build-city-data.mjs keeps falling back to
 * AMap's pinyin field for them.
 *
 * Usage:
 *   node scripts/fetch-wiki-en-names.mjs <cityId> [--fresh] [--min=N]
 *   node scripts/fetch-wiki-en-names.mjs --all [--fresh]
 *
 * Downloaded HTML is cached under data/raw/wiki/ (gitignored via
 * data/raw); only the extracted JSON under data/en-names/ is committed.
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const wikiCacheDir = path.join(root, "data/raw/wiki");
const enNamesDir = path.join(root, "data/en-names");

const UA =
  "cn-metro-typing-databot/1.0 (https://github.com/; contact: xspent@gmail.com) research/data-extraction";

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const allMode = args.includes("--all");
const minArg = args.find((a) => a.startsWith("--min="));
const minPairsDefault = minArg ? Number(minArg.slice("--min=".length)) : 8;
const cityArg = args.find((a) => !a.startsWith("--")) ?? null;

// city id (AMap "spell") -> common English exonym used in Wikipedia titles.
const CITY_EN_NAME = {
  aomen: "Macau",
  beijing: "Beijing",
  changchun: "Changchun",
  changsha: "Changsha",
  changzhou: "Changzhou",
  chengdu: "Chengdu",
  chongqing: "Chongqing",
  chuzhou: "Chuzhou",
  dalian: "Dalian",
  dongguan: "Dongguan",
  ezhou: "Ezhou",
  foshan: "Foshan",
  fuzhou: "Fuzhou",
  guangzhou: "Guangzhou",
  guiyang: "Guiyang",
  haerbin: "Harbin",
  hangzhou: "Hangzhou",
  hefei: "Hefei",
  huhehaote: "Hohhot",
  jinan: "Jinan",
  jinhua: "Jinhua",
  kunming: "Kunming",
  lanzhou: "Lanzhou",
  luoyang: "Luoyang",
  nanchang: "Nanchang",
  nanjing: "Nanjing",
  nanning: "Nanning",
  nantong: "Nantong",
  ningbo: "Ningbo",
  qingdao: "Qingdao",
  qingyuan: "Qingyuan",
  shanghai: "Shanghai",
  shaoxing: "Shaoxing",
  shenyang: "Shenyang",
  shenzhen: "Shenzhen",
  shijiazhuang: "Shijiazhuang",
  suzhou: "Suzhou",
  taiyuan: "Taiyuan",
  taizhou: "Taizhou",
  tianjin: "Tianjin",
  wenzhou: "Wenzhou",
  wuhan: "Wuhan",
  wuhu: "Wuhu",
  wulumuqi: "Urumqi",
  wuxi: "Wuxi",
  xiamen: "Xiamen",
  xian: "Xi'an",
  xianggang: "Hong Kong",
  xiangtan: "Xiangtan",
  xiangxi: "Xiangxi",
  xuchang: "Xuchang",
  xuzhou: "Xuzhou",
  zhengzhou: "Zhengzhou",
  ziyang: "Ziyang",
};

// Extra page-title candidates tried *before* the generated pattern list,
// for cities whose Wikipedia article doesn't follow the generic
// "List of <City> Metro/Subway/Rail Transit stations" naming.
const CITY_PAGE_OVERRIDES = {
  beijing: ["List of Beijing Subway stations"],
  chongqing: ["List of Chongqing Rail Transit stations"],
  xianggang: ["List of MTR stations"],
  aomen: ["Macau Light Rapid Transit"],
  wulumuqi: ["List of Ürümqi Metro stations"],
  suzhou: ["List of Suzhou Rail Transit stations"],
  changchun: ["List of Changchun Rail Transit stations"],
};

function candidateTitles(id) {
  const name = CITY_EN_NAME[id] ?? id;
  const overrides = CITY_PAGE_OVERRIDES[id] ?? [];
  const generated = [
    `List of ${name} Metro stations`,
    `List of ${name} Rail Transit stations`,
    `List of ${name} Subway stations`,
    `List of ${name} Metro Stations`,
    `${name} Metro`,
    `${name} Rail Transit`,
    `${name} Subway`,
  ];
  // De-dupe while preserving order (overrides win the race).
  return [...new Set([...overrides, ...generated])];
}

// Some smaller/newer systems have no city-wide list article and no
// full-roster table on the main system article either (only a
// lines-overview table, e.g. "Qingdao Metro") — but each individual line
// almost always gets its own "Line N (<City> Metro/Rail Transit/Subway)"
// article with a full English/Chinese station table. Used as a fallback.
async function readCityLineNames(id) {
  try {
    const raw = JSON.parse(await readFile(path.join(root, "data/raw", `${id}-subway.json`), "utf-8"));
    return [...new Set((raw.l ?? []).map((e) => e.ln))];
  } catch {
    return [];
  }
}

// Chinese station names actually used by this city's AMap feed, so a
// supplementary source (see CITY_SUPPLEMENTARY_SOURCES) only contributes
// entries this city can actually use, instead of dumping an entire
// neighbouring system's roster into its file.
async function readCityStationNames(id) {
  try {
    const raw = JSON.parse(await readFile(path.join(root, "data/raw", `${id}-subway.json`), "utf-8"));
    const names = new Set();
    for (const entry of raw.l ?? []) {
      for (const st of entry.st ?? []) {
        if (st.n) names.add(st.n);
      }
    }
    return names;
  } catch {
    return null;
  }
}

function mergeInto(target, source) {
  for (const [zh, en] of Object.entries(source)) {
    if (!(zh in target)) target[zh] = en;
  }
}

function lineLabelsFromNames(lineNames) {
  const labels = new Set();
  for (const ln of lineNames) {
    // Match the numbered-line pattern anywhere in the raw AMap line name —
    // some cities prefix it with the city name or transit mode, e.g.
    // "佛山2号线" (Foshan Line 2) or "地铁3号线支线" (Metro Line 3 branch).
    let m = ln.match(/(\d+)号线(?:支线)?$/);
    if (m) {
      labels.add(m[1]);
      continue;
    }
    m = ln.match(/S(\d+)(?:[（(][^）)]*[）)])?线$/);
    if (m) labels.add(`S${m[1]}`);
  }
  return [...labels];
}

function lineCandidateTitles(name, label) {
  return [
    `Line ${label} (${name} Metro)`,
    `Line ${label} (${name} Rail Transit)`,
    `Line ${label} (${name} Subway)`,
  ];
}

// A few cities' subway "lines" are literally the cross-border extension of
// a neighbouring city's numbered metro line (same official line, same
// station names) rather than a system of their own, e.g. Ezhou's only
// line is Wuhan Metro Line 11's eastward extension. For these, generate
// per-line candidate titles under the *parent* system's English name.
const CITY_LINE_SOURCE = {
  ezhou: "wuhan",
  xiangtan: "changsha",
  ziyang: "chengdu",
};

// Cities that co-run a line with a neighbouring big system whose own
// city-wide Wikipedia list article already documents it end-to-end, e.g.
// Foshan's Guangfo Line stations are listed on "List of Guangzhou Metro
// stations". Tried last, and filtered to this city's own station names.
const CITY_SUPPLEMENTARY_SOURCES = {
  foshan: ["guangzhou"],
};

async function fetchCityNamesViaLines(id, { minPairs }) {
  const sourceId = CITY_LINE_SOURCE[id] ?? id;
  const lineNames = await readCityLineNames(id);
  const labels = lineLabelsFromNames(lineNames);
  if (!labels.length) return null;
  const name = CITY_EN_NAME[sourceId] ?? sourceId;
  const map = {};
  const usedTitles = [];
  for (const label of labels) {
    for (const title of lineCandidateTitles(name, label)) {
      const html = await fetchPage(title);
      if (!html) continue;
      const lineMap = extractStationNames(html);
      if (Object.keys(lineMap).length === 0) continue;
      for (const [zh, en] of Object.entries(lineMap)) {
        if (!(zh in map)) map[zh] = en;
      }
      usedTitles.push(title);
      break;
    }
  }
  const count = Object.keys(map).length;
  if (count >= minPairs) {
    return { title: `逐线聚合：${usedTitles.join("; ")}`, map, count };
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- HTML fetch (with on-disk cache) ----------

async function fetchPage(title) {
  const slug = title.replace(/ /g, "_");
  const cacheFile = path.join(wikiCacheDir, `${slug}.html`);
  if (!fresh) {
    try {
      await access(cacheFile);
      return await readFile(cacheFile, "utf-8");
    } catch {
      // fall through to network fetch
    }
  }
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`;
  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA } });
  } catch {
    return null;
  } finally {
    await sleep(300); // rate-limit: >=300ms between Wikipedia requests
  }
  if (!res.ok) return null;
  const html = await res.text();
  if (/Wikipedia does not have an article with this exact name/i.test(html)) return null;
  await mkdir(wikiCacheDir, { recursive: true });
  await writeFile(cacheFile, html, "utf-8");
  return html;
}

// ---------- wikitable parsing ----------

const ENTITY_MAP = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(str) {
  return str.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ent) => {
    if (ent[0] === "#") {
      const code =
        ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ent in ENTITY_MAP ? ENTITY_MAP[ent] : m;
  });
}

function cellPlainText(cellHtml) {
  const noSup = cellHtml.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "");
  const noTags = noSup.replace(/<[^>]+>/g, "");
  const decoded = decodeEntities(noTags);
  // Stray "{"/"}" occasionally leak through from unbalanced wikitext
  // templates in the source article itself (observed on one Tianjin row);
  // they're never legitimate in a station name, so drop them.
  return decoded.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function extractTables(html) {
  const tables = [];
  const re = /<table\b[^>]*class="[^"]*\bwikitable\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = re.exec(html))) tables.push(m[1]);
  return tables;
}

function extractTableRows(tableHtml) {
  const rows = [];
  const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(tableHtml))) rows.push(m[1]);
  return rows;
}

function extractRowCells(rowHtml) {
  const cells = [];
  const re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m;
  while ((m = re.exec(rowHtml))) cells.push(m[1]);
  return cells;
}

// Chinese station-name cell: only hanzi, digits, the interpunct (used for
// combined interchange names, e.g. Shanghai's "一大会址·黄陂南路"), and
// parenthesised annotations. Length-capped to avoid picking up unrelated
// all-Chinese prose cells.
const CHINESE_ONLY_RE = /^(?=.*[一-鿿])[一-鿿0-9·（）()]{2,20}$/;
const NOT_A_LINE_LABEL_RE = /^[0-9一-鿿]*号线$/; // e.g. "2号线" false positive

const ENGLISHISH_RE = /^[A-Za-z][A-Za-z0-9'&.,\-()/ ]*$/;
const ENGLISH_BLACKLIST = new Set([
  "underground",
  "elevated",
  "at-grade",
  "ground level",
  "island",
  "side",
  "island platform",
  "side platform",
  "yes",
  "no",
  "n/a",
  "open",
  "closed",
  "planned",
  "future",
  "under construction",
  "terminus",
]);

function hasStationAnchor(cellHtml) {
  return /<a\b[^>]*\btitle="[^"]*\bstation\b[^"]*"[^>]*>/i.test(cellHtml);
}

// Wikipedia's own house style sentence-cases suffixes like "railway station"
// ("Beijing South railway station"); the curated data/en-names/shanghai.json
// uses Title Case throughout ("Shanghai South Railway Station"). Normalize
// to Title Case for consistency, preserving tokens that already carry
// internal capitals or digits (acronyms like "MTR", combos like "1&2").
const TITLE_CASE_MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "per", "the", "to", "vs", "via",
]);
function titleCaseWord(word, isEdge) {
  if (!word) return word;
  if (/[A-Z]/.test(word.slice(1)) || /\d/.test(word)) return word;
  const lower = word.toLowerCase();
  if (!isEdge && TITLE_CASE_MINOR_WORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
function titleCase(str) {
  const words = str.split(" ");
  return words.map((w, i) => titleCaseWord(w, i === 0 || i === words.length - 1)).join(" ");
}

function pickEnglishCandidate(cellsHtml, chineseIndex) {
  // Pass 1: strong signal — a wikilink to a "... station" article.
  for (const off of [-1, 1, -2, 2]) {
    const html = cellsHtml[chineseIndex + off];
    if (html == null) continue;
    if (hasStationAnchor(html)) {
      const text = cellPlainText(html);
      if (text) return titleCase(text);
    }
  }
  // Pass 2: plain-text heuristic, immediate neighbours only.
  for (const off of [-1, 1]) {
    const html = cellsHtml[chineseIndex + off];
    if (html == null) continue;
    const text = cellPlainText(html);
    if (!text) continue;
    if (ENGLISH_BLACKLIST.has(text.toLowerCase())) continue;
    if (ENGLISHISH_RE.test(text) && /[A-Za-z]{2,}/.test(text)) return titleCase(text);
  }
  return null;
}

function extractStationNames(html) {
  const map = {};
  for (const table of extractTables(html)) {
    for (const rowHtml of extractTableRows(table)) {
      const cellsHtml = extractRowCells(rowHtml);
      if (cellsHtml.length < 2) continue;
      const cellTexts = cellsHtml.map(cellPlainText);
      // Station rows should carry exactly one pure-Chinese-name cell;
      // rows with 0 or 2+ are headers/legends/notes — skip them.
      const chineseIdxs = [];
      for (let i = 0; i < cellTexts.length; i++) {
        const t = cellTexts[i];
        if (t && CHINESE_ONLY_RE.test(t) && !NOT_A_LINE_LABEL_RE.test(t)) chineseIdxs.push(i);
      }
      if (chineseIdxs.length !== 1) continue;
      const idx = chineseIdxs[0];
      const zh = cellTexts[idx];
      const en = pickEnglishCandidate(cellsHtml, idx);
      if (!en) continue;
      if (!(zh in map)) map[zh] = en;
      // Some per-line articles (e.g. Taiyuan's) spell every Chinese name
      // with a trailing "站" ("大南门站") even though AMap's own station
      // name usually omits it ("大南门"). Register the stripped form too
      // so the build-time lookup still hits.
      if (zh.endsWith("站") && zh.length >= 3) {
        const stripped = zh.slice(0, -1);
        if (!(stripped in map)) map[stripped] = en;
      }
    }
  }
  return map;
}

// ---------- per-city driver ----------

async function fetchCityNames(id, { minPairs = minPairsDefault, allowSupplements = true } = {}) {
  const merged = {};
  const sources = [];

  // 1. City-wide roster page(s) — stop once one candidate looks solid, but
  // don't let a weak match (e.g. a lines-overview-only page) block a
  // better one from being tried.
  for (const title of candidateTitles(id)) {
    const html = await fetchPage(title);
    if (!html) continue;
    const map = extractStationNames(html);
    const count = Object.keys(map).length;
    if (count === 0) continue;
    mergeInto(merged, map);
    sources.push(`${title}（${count}）`);
    if (count >= minPairs) break;
  }

  // 2. Always supplement with per-line articles — city-wide pages are
  // sometimes stale or partial (missing newly opened stations/lines), so
  // this fills gaps even when step 1 already found a usable page.
  const viaLines = await fetchCityNamesViaLines(id, { minPairs: 0 });
  if (viaLines && viaLines.count > 0) {
    mergeInto(merged, viaLines.map);
    sources.push(viaLines.title);
  }

  // 3. A handful of cities co-run a line with a neighbouring big system
  // whose own list article already covers it end-to-end.
  if (allowSupplements) {
    for (const supId of CITY_SUPPLEMENTARY_SOURCES[id] ?? []) {
      const supplement = await fetchCityNames(supId, { allowSupplements: false });
      if (!supplement) continue;
      const ownNames = await readCityStationNames(id);
      const filtered = ownNames
        ? Object.fromEntries(Object.entries(supplement.map).filter(([zh]) => ownNames.has(zh)))
        : supplement.map;
      mergeInto(merged, filtered);
      sources.push(`供源:${supId}`);
    }
  }

  const count = Object.keys(merged).length;
  if (count >= minPairs) return { title: sources.join(" + "), map: merged, count };
  return null;
}

function sortedJson(map) {
  const sorted = {};
  for (const k of Object.keys(map).sort((a, b) => a.localeCompare(b, "zh"))) sorted[k] = map[k];
  return JSON.stringify(sorted, null, 2) + "\n";
}

async function runCity(id) {
  const result = await fetchCityNames(id);
  if (!result) {
    console.log(`✗ ${id}：未找到可用的 Wikipedia 站名列表页`);
    return { id, ok: false, count: 0 };
  }
  await mkdir(enNamesDir, { recursive: true });
  await writeFile(path.join(enNamesDir, `${id}.json`), sortedJson(result.map), "utf-8");
  console.log(`✓ ${id}：《${result.title}》→ ${result.count} 个站名`);
  return { id, ok: true, count: result.count, title: result.title };
}

// data/en-names/shanghai.json was hand-curated (see task history) and is
// already a superset of what this generic extractor produces for a couple
// of combined interchange names (e.g. the "·" joined ones) — never let
// --all clobber it. Run `node scripts/fetch-wiki-en-names.mjs shanghai`
// explicitly if it ever needs regenerating from scratch.
const SKIP_IN_ALL = new Set(["shanghai"]);

async function runAll() {
  const ids = Object.keys(CITY_EN_NAME).filter((id) => !SKIP_IN_ALL.has(id));
  const results = [];
  for (const id of ids) {
    results.push(await runCity(id));
  }
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n完成：${ok.length}/${results.length} 个城市抓到官方英文站名`);
  if (failed.length) {
    console.log(`✗ 无数据源（${failed.length}）：${failed.map((r) => r.id).join(", ")}`);
  }
}

if (allMode) {
  await runAll();
} else if (cityArg) {
  await runCity(cityArg);
} else {
  console.error(
    "用法：node scripts/fetch-wiki-en-names.mjs <cityId> [--fresh] [--min=N]  或  node scripts/fetch-wiki-en-names.mjs --all [--fresh]",
  );
  process.exit(1);
}
