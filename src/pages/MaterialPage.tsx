import React from 'react';
import { useStore } from '../store';
import { ColorLayer } from '../types';

export function MaterialPage() {
  const { selected, updateSelected } = useStore();
  if (!selected) return <div className="page"><p className="muted">请先在「产品」页选择一个产品。</p></div>;
  const p = selected;

  const setLayer = (i: number, patch: Partial<ColorLayer>) => {
    const layers = p.layers.map((l, j) => (j === i ? { ...l, ...patch } : l));
    updateSelected({ layers: [...layers].sort((a, b) => a.from - b.from) });
  };

  return (
    <div className="page">
      <h2>材质配色</h2>

      <section>
        <h3>蜡体透光</h3>
        <label className="field">
          <span>透光度（越小越透，火焰暖光穿透越强）{p.sss.toFixed(1)}</span>
          <input type="range" min="0.5" max="6" step="0.1" value={p.sss}
            onChange={(e) => updateSelected({ sss: +e.target.value })} />
        </label>
        <p className="muted">透光随蜡体厚度和离焰距离自然衰减：杯壁薄处与火焰附近最亮，底部厚处暗。</p>
      </section>

      <section>
        <h3>分层渐变（{p.layers.length}/4）</h3>
        {p.layers.map((l, i) => (
          <div key={i} className="layer-row">
            <input type="color" value={l.color} onChange={(e) => setLayer(i, { color: e.target.value })} />
            <label className="field grow">
              <span>起始 {(l.from * 100).toFixed(0)}%</span>
              <input type="range" min="0" max="1" step="0.01" value={l.from}
                onChange={(e) => setLayer(i, { from: Math.min(+e.target.value, l.to - 0.02) })} />
            </label>
            <label className="field grow">
              <span>结束 {(l.to * 100).toFixed(0)}%</span>
              <input type="range" min="0" max="1" step="0.01" value={l.to}
                onChange={(e) => setLayer(i, { to: Math.max(+e.target.value, l.from + 0.02) })} />
            </label>
            <button className="danger" disabled={p.layers.length <= 1}
              onClick={() => updateSelected({ layers: p.layers.filter((_, j) => j !== i) })}>
              删
            </button>
          </div>
        ))}
        <button
          disabled={p.layers.length >= 4}
          onClick={() => {
            const last = p.layers[p.layers.length - 1];
            updateSelected({
              layers: [...p.layers, { color: '#8a5a3a', from: last ? last.to : 0, to: 1 }].sort((a, b) => a.from - b.from),
            });
          }}
        >
          ＋ 添加色层
        </button>
      </section>

      <section>
        <h3>嵌入干花</h3>
        <label className="field row">
          <input type="checkbox" checked={p.flowers.enabled}
            onChange={(e) => updateSelected({ flowers: { ...p.flowers, enabled: e.target.checked } })} />
          <span>启用干花（在蜡中半隐半现）</span>
        </label>
        {p.flowers.enabled && (
          <>
            <label className="field">
              <span>数量 {p.flowers.count}</span>
              <input type="range" min="4" max="80" step="1" value={p.flowers.count}
                onChange={(e) => updateSelected({ flowers: { ...p.flowers, count: +e.target.value } })} />
            </label>
            <label className="field">
              <span>大小 {p.flowers.size.toFixed(3)}</span>
              <input type="range" min="0.02" max="0.1" step="0.005" value={p.flowers.size}
                onChange={(e) => updateSelected({ flowers: { ...p.flowers, size: +e.target.value } })} />
            </label>
            <label className="field">
              <span>嵌入深度（越小越贴杯壁越清晰）{p.flowers.depth.toFixed(2)}</span>
              <input type="range" min="0.1" max="1" step="0.05" value={p.flowers.depth}
                onChange={(e) => updateSelected({ flowers: { ...p.flowers, depth: +e.target.value } })} />
            </label>
            <div className="row gap">
              <label className="field">
                <span>花瓣色</span>
                <input type="color" value={p.flowers.colorA}
                  onChange={(e) => updateSelected({ flowers: { ...p.flowers, colorA: e.target.value } })} />
              </label>
              <label className="field">
                <span>花心色</span>
                <input type="color" value={p.flowers.colorB}
                  onChange={(e) => updateSelected({ flowers: { ...p.flowers, colorB: e.target.value } })} />
              </label>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
