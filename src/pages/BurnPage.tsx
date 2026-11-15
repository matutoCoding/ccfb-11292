import React, { useEffect } from 'react';
import { useStore } from '../store';

interface Props {
  fps: number;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function BurnPage({ fps }: Props) {
  const { state, dispatch, selected } = useStore();
  const { preview } = state;

  // 点燃时燃烧时间每秒累积（驱动熔池扩大、杯壁光变化）
  useEffect(() => {
    if (!preview.lit) return;
    const id = setInterval(() => {
      dispatch({ type: 'preview', patch: { burnTime: state.preview.burnTime + 1 } });
    }, 1000);
    return () => clearInterval(id);
  }, [preview.lit, state.preview.burnTime, dispatch]);

  if (!selected) return <div className="page"><p className="muted">请先在「产品」页选择一个产品。</p></div>;

  const fpsOk = fps >= 50;

  return (
    <div className="page">
      <h2>点燃预览</h2>

      <section>
        <div className="row gap">
          <button
            className={preview.lit ? 'danger' : 'primary'}
            onClick={() => dispatch({ type: 'preview', patch: { lit: !preview.lit } })}
          >
            {preview.lit ? '熄灭' : '点燃'}
          </button>
          <button onClick={() => dispatch({ type: 'preview', patch: { burnTime: 0 } })}>
            重置燃烧
          </button>
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={preview.autoRotate}
              onChange={(e) => dispatch({ type: 'preview', patch: { autoRotate: e.target.checked } })}
            />
            <span>自动旋转</span>
          </label>
        </div>
      </section>

      <section>
        <h3>燃烧状态</h3>
        <label className="field">
          <span>燃烧时间 {fmtTime(preview.burnTime)}（熔池随时间扩大，杯壁暖光随之增强）</span>
          <input
            type="range" min="0" max="1800" step="5" value={preview.burnTime}
            onChange={(e) => dispatch({ type: 'preview', patch: { burnTime: +e.target.value } })}
          />
        </label>
        <label className="field">
          <span>风力 {preview.wind === 0 ? '无风' : preview.wind > 0 ? `向右 ${(Math.abs(preview.wind) * 100).toFixed(0)}%` : `向左 ${(Math.abs(preview.wind) * 100).toFixed(0)}%`}</span>
          <input
            type="range" min="-1" max="1" step="0.05" value={preview.wind}
            onChange={(e) => dispatch({ type: 'preview', patch: { wind: +e.target.value } })}
          />
        </label>
      </section>

      <section>
        <h3>性能</h3>
        <div className={`fps-meter ${fpsOk ? 'ok' : 'warn'}`}>
          {fps.toFixed(0)} FPS {fpsOk ? '✓ 达标（≥50）' : '⚠ 低于 50，建议降低画质档位'}
        </div>
        <p className="muted">夜晚暗房 + 自动旋转是性能基准场景，可在「设置」页切换验证。</p>
      </section>
    </div>
  );
}
