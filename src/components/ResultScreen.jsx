import { RestartIcon } from "./icons.jsx";

export default function ResultScreen({
  elapsed,
  completed,
  metrics,
  routeColor,
  onBack,
  onRetry,
}) {
  return (
    <section className="results" style={{ "--result-route": routeColor }}>
      <div className="result-stage">
        <div className="result-card">
          <span className="result-kicker">JOURNEY COMPLETE</span>
          <h2>这班车，跑得很顺。</h2>
          <p>
            你在 {elapsed} 秒内通过了 {completed} 个车站。
          </p>
          <div className="result-metrics">
            <div>
              <strong>{completed}</strong>
              <span>通过站数</span>
            </div>
            <div>
              <strong>{metrics.speed}</strong>
              <span>平均 {metrics.speedUnit}</span>
            </div>
            <div>
              <strong>{metrics.accuracy}%</strong>
              <span>正确率</span>
            </div>
          </div>
          <div className="result-actions">
            <button className="secondary-button" type="button" onClick={onBack}>
              重新选线
            </button>
            <button className="start-button" type="button" onClick={onRetry}>
              <span>再跑一次</span>
              <b>
                <RestartIcon size={19} />
              </b>
            </button>
          </div>
        </div>
        {/* 到站后车门滑开露出成绩卡；纯装饰，动画后不拦截交互 */}
        <div className="metro-doors" aria-hidden="true">
          <div className="metro-door metro-door-left">
            <i className="door-window" />
            <i className="door-stripe" />
            <i className="door-light" />
          </div>
          <div className="metro-door metro-door-right">
            <i className="door-window" />
            <i className="door-stripe" />
            <i className="door-light" />
          </div>
        </div>
      </div>
    </section>
  );
}
