import CityMap from "./CityMap.jsx";
import { lineRuns, runStations, DIRECTION } from "../lib/map.js";
import { LANG } from "../lib/typing.js";
import { ArrowRightIcon, ArrowLeftIcon } from "./icons.jsx";

const LANG_OPTIONS = [
  { value: LANG.ENGLISH, label: "英文" },
  { value: LANG.PINYIN, label: "拼音" },
  { value: LANG.CHINESE, label: "中文" },
];
const MODE_OPTIONS = [
  { value: "timed", label: "30 秒" },
  { value: "line", label: "全线" },
];

export default function HomeScreen({
  data,
  mapModel,
  selectedLine,
  runIndex,
  onRunChange,
  direction,
  onDirectionChange,
  mode,
  onModeChange,
  lang,
  onLangChange,
  onSelect,
  onReset,
  onStart,
}) {
  const runs = lineRuns(selectedLine);
  const run = runs[runIndex] ?? runs[0] ?? null;
  const stations = runStations(selectedLine, runIndex, direction);
  const totalStations = data.lines.reduce((n, l) => n + l.stations.length, 0);

  return (
    <section className={`home-screen${selectedLine ? " focused" : ""}`}>
      <CityMap
        mapModel={mapModel}
        selectedLineId={selectedLine?.id ?? null}
        onSelect={onSelect}
      />
      <div className="home-copy" aria-hidden={selectedLine ? "true" : undefined}>
        <div className="eyebrow">
          <span /> REAL ROUTES · REAL STATIONS
        </div>
        <h1>
          一字一站，<em>认识一座城。</em>
        </h1>
        <p className="lede">
          在真实{data.cityNameZh}
          地图上选一条线路，用英文、拼音或中文把站名一个个敲出来。列车每前进一站，你就多认识这座城市的一个地方。
        </p>
        <div className="home-instruction">
          <b>01</b>
          <span>从地图或下方线路列表选择线路</span>
        </div>
        <span className="data-status">
          {data.lines.length} 条线路 · {totalStations} 个站点坐标 · 更多城市即将到站
        </span>
      </div>
      {selectedLine ? (
        <>
          <button className="map-reset" type="button" onClick={onReset}>
            <ArrowLeftIcon /> 返回{data.cityNameZh}全图 <kbd>ESC</kbd>
          </button>
          <div className="route-focus-card" aria-live="polite">
            <span className="focus-kicker">SELECTED ROUTE</span>
            <div className="focus-route-title">
              <span
                className="focus-line-code"
                style={{ "--focus-color": selectedLine.color }}
              >
                {selectedLine.lineId}
              </span>
              <div>
                <h2>{selectedLine.lineName}</h2>
                <p>
                  {selectedLine.operatorName} · {stations.length} 站
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}
      <div className="home-control-deck">
        <div className="route-carousel" aria-label="可选择的地铁线路">
          {data.lines.map((l) => (
            <button
              key={l.id}
              className={`route-button${selectedLine?.id === l.id ? " selected" : ""}`}
              type="button"
              style={{ "--route": l.color }}
              onClick={() => onSelect(l.id)}
            >
              <span className="route-symbol">{l.lineId}</span>
              <span>
                <strong>{l.lineName}</strong>
                <small>
                  {l.operatorName} · {runStations(l).length} 站
                </small>
              </span>
            </button>
          ))}
        </div>
        {selectedLine ? (
          <div className="focus-actions" style={{ "--focus-color": selectedLine.color }}>
            {runs.length > 1 ? (
              <div className="run-picker" aria-label="选择行驶区间">
                <span className="control-label">区间</span>
                <div className="run-options">
                  {runs.map((r, i) => (
                    <label
                      key={r.label}
                      className={`run-option${runIndex === i ? " selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="run"
                        value={i}
                        checked={runIndex === i}
                        onChange={() => onRunChange(i)}
                      />
                      <span>
                        <b>{r.label}</b>
                        <small>{r.stations.length} 站</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {run ? (
              <DirectionPicker
                stations={run.stations}
                value={direction}
                onChange={onDirectionChange}
              />
            ) : null}
            <div className="option-toolbar">
              <SegmentedControl
                label="站名"
                name="typing-language"
                value={lang}
                onChange={onLangChange}
                options={LANG_OPTIONS}
              />
              <SegmentedControl
                label="玩法"
                name="mode"
                value={mode}
                onChange={onModeChange}
                options={MODE_OPTIONS}
              />
              <button className="start-button" type="button" onClick={onStart}>
                <span>开始这条线路</span>
                <b>
                  <ArrowRightIcon size={20} />
                </b>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DirectionPicker({ stations, value, onChange }) {
  const first = stations[0];
  const last = stations[stations.length - 1];
  const options = [
    { value: DIRECTION.FORWARD, origin: first, destination: last },
    { value: DIRECTION.REVERSE, origin: last, destination: first },
  ];
  return (
    <div className="direction-picker" role="radiogroup" aria-label="行驶方向">
      <span className="control-label">方向</span>
      <div className="direction-options">
        {options.map((o) => (
          <label
            key={o.value}
            className={`direction-option${value === o.value ? " selected" : ""}`}
          >
            <input
              type="radio"
              name="direction"
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>
              <small>从 {o.origin.nameZh}</small>
              <b>
                往 {o.destination.nameZh}
                <ArrowRightIcon size={14} />
              </b>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SegmentedControl({ label, name, value, onChange, options }) {
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      <span className="control-label">{label}</span>
      <div className="segmented-options">
        {options.map((o) => (
          <label
            key={o.value}
            className={`segment-option${value === o.value ? " selected" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
