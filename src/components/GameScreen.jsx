import MetroMap from "./MetroMap.jsx";
import { LANG } from "../lib/typing.js";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons.jsx";

export default function GameScreen({
  mapModel,
  line,
  stations,
  mode,
  stationIndex,
  typedCount,
  target,
  lang,
  composition,
  completed,
  remaining,
  elapsed,
  metrics,
  shake,
  onBack,
  onFocusTyping,
}) {
  const station = stations[stationIndex];
  const nextStation = stations[stationIndex + 1] ?? null;
  const chars = [...target];
  const progress = chars.length ? typedCount / chars.length : 0;
  const isChinese = lang === LANG.CHINESE;
  const terminal = stations[stations.length - 1];

  return (
    <section className="game" style={{ "--active-route": line.color }}>
      <p className="screen-reader-status" aria-live="polite" aria-atomic="true">
        当前车站 {station.nameZh}，请输入 {target}
      </p>
      <MetroMap
        mapModel={mapModel}
        line={line}
        stations={stations}
        stationIndex={stationIndex}
        trainProgress={progress}
      />
      <div className="game-chrome">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeftIcon /> 返回选线 <kbd>ESC</kbd>
        </button>
        <div className="route-pill" style={{ background: line.color }}>
          {line.lineName} · 往 {terminal?.nameZh}
        </div>
      </div>
      <div className="scorebar">
        <Metric
          label={mode === "timed" ? "剩余" : "经过"}
          value={mode === "timed" ? remaining : elapsed}
          unit="秒"
        />
        <Metric label="到站" value={completed} unit="站" pop />
        <Metric label="速度" value={metrics.speed} unit={metrics.speedUnit} />
        <Metric label="正确率" value={metrics.accuracy} unit="%" />
      </div>
      <article className={`station-card${shake ? " shake" : ""}`} onClick={onFocusTyping}>
        <div className="station-meta">
          <span>{String(stationIndex + 1).padStart(2, "0")}</span>
          <span title={station.nameEn}>{station.nameEn}</span>
        </div>
        <div className="station-main">
          <div>
            <p>NOW ARRIVING</p>
            <h2 key={station.stationId} className="arrive-pop">
              {station.nameZh}
            </h2>
          </div>
          <div className={`next-station${nextStation ? "" : " is-terminal"}`}>
            <span>{nextStation ? "下一站" : "终点站"}</span>
            <strong>{nextStation?.nameZh ?? "本线终点"}</strong>
            {nextStation ? (
              <b>
                <ArrowRightIcon size={22} />
              </b>
            ) : null}
          </div>
        </div>
        <div className={`typing-area${isChinese ? " is-chinese" : ""}`}>
          <div
            className="typing-target"
            style={{
              "--fit-font": `calc((min(760px, 94vw) - 48px) / ${(
                chars.length * (isChinese ? 1 : 0.65)
              ).toFixed(2)})`,
            }}
            aria-label={`请输入 ${target}`}
          >
            {chars.map((c, i) => (
              <span
                key={`${c}-${i}`}
                className={i < typedCount ? "typed" : i === typedCount ? "current" : ""}
              >
                {c === " " ? " " : c}
              </span>
            ))}
          </div>
          {isChinese ? (
            <p
              id="typing-instruction"
              className={`composition-status${composition ? " is-composing" : ""}`}
            >
              {composition ? (
                <>
                  选字中 · <strong>{composition}</strong>
                </>
              ) : (
                "使用输入法选字"
              )}
            </p>
          ) : (
            <span id="typing-instruction" className="screen-reader-status">
              {lang === LANG.PINYIN
                ? "直接输入画面上站名的全拼"
                : "直接输入画面上的英文站名"}
            </span>
          )}
        </div>
        <div className="line-strip">
          <i />
          <span>{line.lineName}</span>
        </div>
      </article>
    </section>
  );
}

function Metric({ label, value, unit, pop = false }) {
  return (
    <div>
      <small>{label}</small>
      <strong key={pop ? value : undefined} className={pop ? "metric-pop" : ""}>
        {value}
      </strong>
      <span>{unit}</span>
    </div>
  );
}
