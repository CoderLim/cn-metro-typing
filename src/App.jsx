import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CITIES, DEFAULT_CITY } from "./cities.js";
import { useCityData } from "./hooks/useCityData.js";
import { buildMapModel, runStations, DIRECTION } from "./lib/map.js";
import { stationTarget, normalizeInput, charMatches, LANG } from "./lib/typing.js";
import HomeScreen from "./components/HomeScreen.jsx";
import GameScreen from "./components/GameScreen.jsx";
import ResultScreen from "./components/ResultScreen.jsx";
import { SunIcon, MoonIcon } from "./components/icons.jsx";

const TIMED_MS = 30_000;

export default function App() {
  const [cityId] = useState(DEFAULT_CITY);
  const city = CITIES.find((c) => c.id === cityId);
  const { data, boundary, error } = useCityData(cityId);
  const mapModel = useMemo(
    () => (data && boundary ? buildMapModel(boundary, data.lines) : null),
    [data, boundary],
  );

  const [screen, setScreen] = useState("home");
  const [lineId, setLineId] = useState(null);
  const [runIndex, setRunIndex] = useState(0);
  const [direction, setDirection] = useState(DIRECTION.FORWARD);
  const [mode, setMode] = useState("timed");
  const [lang, setLang] = useState(LANG.ENGLISH);
  const [dark, setDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  const [stationIndex, setStationIndex] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shake, setShake] = useState(false);
  const [composition, setComposition] = useState("");

  const startedAt = useRef(0);
  const typedRef = useRef(0);
  const stationRef = useRef(0);
  const playingRef = useRef(false);
  const composingRef = useRef(false);
  const inputRef = useRef(null);

  const line = data?.lines.find((l) => l.id === lineId) ?? null;
  const stations = useMemo(
    () => runStations(line, runIndex, direction),
    [line, runIndex, direction],
  );
  const target = stationTarget(stations[stationIndex], lang);

  const totalKeys = correct + errors;
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const remainingSec = Math.max(Math.ceil((TIMED_MS - elapsedMs) / 1000), 0);
  const minutes = Math.max(elapsedMs, 2000) / 60_000;
  const metrics = {
    speed:
      lang === LANG.CHINESE
        ? Math.round(correct / minutes)
        : Math.round(correct / 5 / minutes),
    speedUnit: lang === LANG.CHINESE ? "CPM" : "WPM",
    accuracy: totalKeys ? Math.round((correct / totalKeys) * 100) : 100,
  };

  useEffect(() => {
    document.body.classList.toggle("dark", dark);
  }, [dark]);

  const clearInput = useCallback(() => {
    composingRef.current = false;
    if (inputRef.current) inputRef.current.value = "";
    setComposition("");
  }, []);

  const startGame = useCallback(() => {
    if (!line) return;
    clearInput();
    playingRef.current = true;
    typedRef.current = 0;
    stationRef.current = 0;
    setStationIndex(0);
    setTypedCount(0);
    setCorrect(0);
    setErrors(0);
    setCompleted(0);
    setElapsedMs(0);
    startedAt.current = performance.now();
    inputRef.current?.focus({ preventScroll: true });
    setScreen("game");
  }, [line, clearInput]);

  const backHome = useCallback(() => {
    playingRef.current = false;
    clearInput();
    inputRef.current?.blur();
    setLineId(null);
    setRunIndex(0);
    setDirection(DIRECTION.FORWARD);
    setScreen("home");
  }, [clearInput]);

  const finishGame = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    clearInput();
    inputRef.current?.blur();
    const ms = performance.now() - startedAt.current;
    setElapsedMs(mode === "timed" ? Math.min(ms, TIMED_MS) : ms);
    setScreen("result");
  }, [mode, clearInput]);

  useEffect(() => {
    if (screen !== "game") return;
    const timer = setInterval(() => {
      const ms = performance.now() - startedAt.current;
      setElapsedMs(mode === "timed" ? Math.min(ms, TIMED_MS) : ms);
    }, 200);
    return () => clearInterval(timer);
  }, [screen, mode]);

  useEffect(() => {
    if (screen === "game" && mode === "timed" && elapsedMs >= TIMED_MS) finishGame();
  }, [screen, mode, elapsedMs, finishGame]);

  const advanceStation = useCallback(() => {
    const current = stationRef.current;
    setCompleted((n) => n + 1);
    if (mode === "line" && current >= stations.length - 1) {
      finishGame();
      return;
    }
    const next = (current + 1) % stations.length;
    typedRef.current = 0;
    stationRef.current = next;
    setStationIndex(next);
    setTypedCount(0);
  }, [mode, stations.length, finishGame]);

  const handleChar = useCallback(
    (char) => {
      if (!playingRef.current || [...char].length !== 1) return;
      const station = stations[stationRef.current];
      if (!station) return;
      const chars = [...stationTarget(station, lang)];
      const expected = chars[typedRef.current];
      if (charMatches(char, expected, lang)) {
        typedRef.current += 1;
        setCorrect((n) => n + 1);
        if (typedRef.current >= chars.length) advanceStation();
        else setTypedCount(typedRef.current);
      } else {
        setErrors((n) => n + 1);
        setShake(false);
        requestAnimationFrame(() => setShake(true));
        setTimeout(() => setShake(false), 180);
      }
    },
    [stations, lang, advanceStation],
  );

  // 输入法提交（或移动端键入）的整段文字逐字送入比对。
  const commitInput = useCallback(
    (input) => {
      const text = input.value;
      if (!text) return;
      input.value = "";
      setComposition("");
      for (const char of normalizeInput(text, lang)) handleChar(char);
    },
    [handleChar, lang],
  );

  const onInput = useCallback(
    (e) => {
      if (composingRef.current || e.nativeEvent.isComposing) {
        setComposition(e.currentTarget.value);
        return;
      }
      commitInput(e.currentTarget);
    },
    [commitInput],
  );
  const onCompositionStart = useCallback((e) => {
    composingRef.current = true;
    setComposition(e.currentTarget.value);
  }, []);
  const onCompositionUpdate = useCallback((e) => {
    setComposition(e.data || e.currentTarget.value || "");
  }, []);
  const onCompositionEnd = useCallback(
    (e) => {
      composingRef.current = false;
      setComposition("");
      commitInput(e.currentTarget);
    },
    [commitInput],
  );

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        if (screen === "game" || screen === "result") backHome();
        else if (screen === "home" && lineId) {
          setLineId(null);
          setRunIndex(0);
          setDirection(DIRECTION.FORWARD);
        }
        return;
      }
      if (
        screen !== "game" ||
        e.target === inputRef.current ||
        e.repeat ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.key.length !== 1
      ) {
        return;
      }
      if (e.key === " " || target[typedRef.current] === " ") e.preventDefault();
      handleChar(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, lineId, target, handleChar, backHome]);

  const selectLine = useCallback((id) => {
    window.scrollTo({ top: 0 });
    setLineId(id);
    setRunIndex(0);
    setDirection(DIRECTION.FORWARD);
  }, []);
  const resetLine = useCallback(() => {
    setLineId(null);
    setRunIndex(0);
    setDirection(DIRECTION.FORWARD);
  }, []);
  const changeRun = useCallback((index) => {
    setRunIndex(index);
    setDirection(DIRECTION.FORWARD);
  }, []);

  const chrome = screen !== "game";

  return (
    <div className="app-shell">
      <input
        ref={inputRef}
        className="typing-input"
        type="text"
        inputMode="text"
        lang={lang === LANG.CHINESE ? "zh-CN" : "en"}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={
          lang === LANG.CHINESE
            ? "中文站名输入"
            : lang === LANG.PINYIN
              ? "拼音站名输入"
              : "英文站名输入"
        }
        onInput={onInput}
        onCompositionStart={onCompositionStart}
        onCompositionUpdate={onCompositionUpdate}
        onCompositionEnd={onCompositionEnd}
      />
      {chrome ? (
        <header className="topbar">
          <button className="brand" type="button" onClick={backHome} aria-label="回到首页">
            <span>CHINA METRO TYPING</span>
          </button>
          <div className="top-actions">
            <span className="city-chip">
              {city.nameEn} {city.nameZh}
            </span>
            <button
              className="icon-button"
              type="button"
              aria-pressed={dark}
              aria-label="切换深色模式"
              onClick={() => setDark((d) => !d)}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>
      ) : null}
      <main>
        {error ? (
          <div className="data-error">
            <strong>地图数据加载失败</strong>
            <span>{error.message}</span>
            <button type="button" onClick={() => location.reload()}>
              重新加载
            </button>
          </div>
        ) : null}
        {!error && (!data || !mapModel) ? (
          <div className="loading">
            <span />
            正在加载{city.nameZh}路网…
          </div>
        ) : null}
        {data && mapModel && screen === "home" ? (
          <HomeScreen
            data={data}
            mapModel={mapModel}
            selectedLine={line}
            runIndex={runIndex}
            onRunChange={changeRun}
            direction={direction}
            onDirectionChange={setDirection}
            mode={mode}
            onModeChange={setMode}
            lang={lang}
            onLangChange={setLang}
            onSelect={selectLine}
            onReset={resetLine}
            onStart={startGame}
          />
        ) : null}
        {data && mapModel && screen === "game" && line && stations.length ? (
          <GameScreen
            mapModel={mapModel}
            line={line}
            stations={stations}
            mode={mode}
            stationIndex={stationIndex}
            typedCount={typedCount}
            target={target}
            lang={lang}
            composition={composition}
            completed={completed}
            remaining={remainingSec}
            elapsed={elapsedSec}
            metrics={metrics}
            shake={shake}
            onBack={backHome}
            onFocusTyping={() => inputRef.current?.focus({ preventScroll: true })}
          />
        ) : null}
        {screen === "result" ? (
          <ResultScreen
            elapsed={elapsedSec}
            completed={completed}
            metrics={metrics}
            routeColor={line?.color}
            onBack={backHome}
            onRetry={startGame}
          />
        ) : null}
      </main>
      {chrome ? (
        <footer>
          <div className="footer-brand">
            <span className="footer-wordmark">CHINA METRO TYPING</span>
            <span className="footer-lines" aria-hidden="true">
              {(data?.lines ?? []).map((l) => (
                <i key={l.id} style={{ background: l.color }} />
              ))}
            </span>
          </div>
          <div className="footer-meta">
            <p>
              <span className="footer-label">DATA</span>
              线路
              <a href="https://amap.com/" target="_blank" rel="noreferrer">
                高德地图
              </a>
              <span className="footer-sep">·</span>
              边界
              <a
                href="https://datav.aliyun.com/portal/school/atlas/area_selector"
                target="_blank"
                rel="noreferrer"
              >
                DataV.GeoAtlas
              </a>
              <span className="footer-sep">·</span>
              英文站名
              <a
                href="https://en.wikipedia.org/wiki/List_of_Shanghai_Metro_stations"
                target="_blank"
                rel="noreferrer"
              >
                Wikipedia
              </a>
            </p>
            <p>
              灵感来自
              <a href="https://tw-metro-typing.yencheng.dev/" target="_blank" rel="noreferrer">
                TAIWAN METRO TYPING
              </a>
              <span className="footer-sep">·</span>
              非地铁公司官方服务，仅供打字练习
            </p>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
