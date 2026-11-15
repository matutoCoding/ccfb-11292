import React, { useRef } from 'react';
import { useStore } from '../store';
import { ContainerType, ProfilePoint } from '../types';

const PRESETS: { name: string; profile: ProfilePoint[] }[] = [
  { name: '圆柱', profile: [{ y: 0, r: 0.9 }, { y: 1, r: 0.9 }] },
  { name: '收口', profile: [{ y: 0, r: 0.92 }, { y: 0.7, r: 0.95 }, { y: 1, r: 0.72 }] },
  { name: '鼓腹', profile: [{ y: 0, r: 0.7 }, { y: 0.4, r: 0.98 }, { y: 1, r: 0.78 }] },
  { name: '锥形', profile: [{ y: 0, r: 0.95 }, { y: 1, r: 0.55 }] },
  { name: '波浪', profile: [{ y: 0, r: 0.85 }, { y: 0.25, r: 0.95 }, { y: 0.5, r: 0.8 }, { y: 0.75, r: 0.95 }, { y: 1, r: 0.85 }] },
];

const W = 260, H = 320, PAD = 24;

export function ShapePage() {
  const { selected, updateSelected } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIdx = useRef(-1);

  if (!selected) return <div className="page"><p className="muted">请先在「产品」页选择一个产品。</p></div>;
  const p = selected;
  const profile = [...p.profile].sort((a, b) => a.y - b.y);

  const toXY = (pt: ProfilePoint) => ({ x: PAD + pt.r * (W - PAD * 2), y: H - PAD - pt.y * (H - PAD * 2) });
  const fromXY = (x: number, y: number): ProfilePoint => ({
    r: Math.min(1, Math.max(0.05, (x - PAD) / (W - PAD * 2))),
    y: Math.min(1, Math.max(0, (H - PAD - y) / (H - PAD * 2))),
  });

  const svgPos = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const commit = (pts: ProfilePoint[]) => {
    updateSelected({ profile: [...pts].sort((a, b) => a.y - b.y) });
  };

  const pathD = profile.map((pt, i) => {
    const { x, y } = toXY(pt);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="page">
      <h2>造型编辑</h2>

      <section>
        <h3>基本信息</h3>
        <label className="field">
          <span>产品名称</span>
          <input value={p.name} onChange={(e) => updateSelected({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>香型</span>
          <input value={p.scent} onChange={(e) => updateSelected({ scent: e.target.value })} />
        </label>
      </section>

      <section>
        <h3>容器杯</h3>
        <div className="row gap">
          {(['glass', 'ceramic', 'metal'] as ContainerType[]).map((t) => (
            <button
              key={t}
              className={p.container.type === t ? 'primary' : ''}
              onClick={() => updateSelected({ container: { ...p.container, type: t } })}
            >
              {{ glass: '玻璃', ceramic: '陶瓷', metal: '金属' }[t]}
            </button>
          ))}
        </div>
        <label className="field">
          <span>杯身颜色</span>
          <input type="color" value={p.container.color}
            onChange={(e) => updateSelected({ container: { ...p.container, color: e.target.value } })} />
        </label>
        <label className="field">
          <span>杯径 {p.container.radius.toFixed(2)}</span>
          <input type="range" min="0.35" max="0.7" step="0.01" value={p.container.radius}
            onChange={(e) => updateSelected({ container: { ...p.container, radius: +e.target.value } })} />
        </label>
        <label className="field">
          <span>杯高 {p.container.height.toFixed(2)}</span>
          <input type="range" min="0.45" max="1.1" step="0.01" value={p.container.height}
            onChange={(e) => updateSelected({ container: { ...p.container, height: +e.target.value } })} />
        </label>
        <label className="field">
          <span>灌蜡高度 {(p.waxFill * 100).toFixed(0)}%</span>
          <input type="range" min="0.3" max="0.95" step="0.01" value={p.waxFill}
            onChange={(e) => updateSelected({ waxFill: +e.target.value })} />
        </label>
      </section>

      <section>
        <h3>蜡体剖面线（旋转成型）</h3>
        <p className="muted">拖动节点调整外形；双击空白添加节点；右键节点删除。</p>
        <div className="row gap wrap">
          {PRESETS.map((pre) => (
            <button key={pre.name} onClick={() => commit(pre.profile.map((q) => ({ ...q })))}>
              {pre.name}
            </button>
          ))}
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="profile-editor"
          onPointerMove={(e) => {
            if (dragIdx.current < 0) return;
            const { x, y } = svgPos(e);
            const pts = [...profile];
            pts[dragIdx.current] = fromXY(x, y);
            commit(pts);
          }}
          onPointerUp={() => { dragIdx.current = -1; }}
          onDoubleClick={(e) => {
            const rect = svgRef.current!.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * W;
            const y = ((e.clientY - rect.top) / rect.height) * H;
            commit([...profile, fromXY(x, y)]);
          }}
        >
          {/* 轴线与网格 */}
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} className="axis" />
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={PAD + g * (W - PAD * 2)} y1={PAD} x2={PAD + g * (W - PAD * 2)} y2={H - PAD} className="grid" />
          ))}
          {/* 镜像轮廓预览 */}
          <path d={`${pathD} ${[...profile].reverse().map((pt) => {
            const { x, y } = toXY({ y: pt.y, r: 0 });
            return `L${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(' ')} Z`} className="profile-fill" />
          <path d={pathD} className="profile-line" />
          {profile.map((pt, i) => {
            const { x, y } = toXY(pt);
            return (
              <circle
                key={i}
                cx={x} cy={y} r={7}
                className="profile-node"
                onPointerDown={(e) => { e.preventDefault(); dragIdx.current = i; }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (profile.length > 2) commit(profile.filter((_, j) => j !== i));
                }}
              />
            );
          })}
        </svg>
      </section>
    </div>
  );
}
