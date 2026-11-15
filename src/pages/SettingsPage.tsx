import React from 'react';
import { useStore } from '../store';
import { CandleRenderer } from '../gl/renderer';
import { EnvMode, Quality, QUALITY_PRESETS } from '../types';

interface Props {
  rendererRef: React.MutableRefObject<CandleRenderer | null>;
}

const TYPE_LABEL = { glass: '玻璃', ceramic: '陶瓷', metal: '金属' } as const;

export function SettingsPage({ rendererRef }: Props) {
  const { state, dispatch, selected } = useStore();
  const { preview } = state;

  const setEnv = (env: EnvMode) => dispatch({ type: 'preview', patch: { env } });
  const setQuality = (quality: Quality) => dispatch({ type: 'preview', patch: { quality } });

  const screenshot = () => {
    if (!rendererRef.current || !selected) return;
    const p = selected;
    const lines = [
      `香型：${p.scent}`,
      `容器：${TYPE_LABEL[p.container.type]}杯 ${p.container.color}  径${p.container.radius.toFixed(2)} 高${p.container.height.toFixed(2)}`,
      `色层：${p.layers.map((l) => l.color).join(' → ')}`,
      `干花：${p.flowers.enabled ? `${p.flowers.count}朵 ${p.flowers.colorA}` : '无'}  透光度：${p.sss.toFixed(1)}`,
      `灌蜡：${(p.waxFill * 100).toFixed(0)}%  环境：${preview.env === 'day' ? '白天桌面' : '夜晚暗房'}  燃烧：${Math.floor(preview.burnTime)}s`,
    ];
    rendererRef.current.capturePNG(lines, p.name);
  };

  return (
    <div className="page">
      <h2>设置</h2>

      <section>
        <h3>环境</h3>
        <div className="row gap">
          <button className={preview.env === 'day' ? 'primary' : ''} onClick={() => setEnv('day')}>
            ☀ 白天桌面
          </button>
          <button className={preview.env === 'night' ? 'primary' : ''} onClick={() => setEnv('night')}>
            🌙 夜晚暗房
          </button>
        </div>
        <p className="muted">夜晚暗房下火焰是主光源，用于检验蜡体透光与杯壁暖光效果。</p>
      </section>

      <section>
        <h3>画质分档</h3>
        <div className="row gap">
          {(Object.keys(QUALITY_PRESETS) as Quality[]).map((q) => (
            <button key={q} className={preview.quality === q ? 'primary' : ''} onClick={() => setQuality(q)}>
              {QUALITY_PRESETS[q].label}
            </button>
          ))}
        </div>
        <p className="muted">
          流畅：0.6×分辨率 · 均衡：1×分辨率 · 精细：{QUALITY_PRESETS.high.pixelRatio.toFixed(1)}×分辨率、更多干花与火焰细节
        </p>
      </section>

      <section>
        <h3>产品图截图</h3>
        <button className="primary" onClick={screenshot} disabled={!selected}>
          📷 截图（含产品参数）
        </button>
        <p className="muted">导出 PNG，左下角附带名称、香型、容器、色层、干花等参数，可直接用于网店素材。</p>
      </section>
    </div>
  );
}
