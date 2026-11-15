import React, { useRef, useState } from 'react';
import { useStore, exportProducts, parseImport } from '../store';
import { ContainerType } from '../types';

const TYPE_LABEL: Record<ContainerType, string> = { glass: '玻璃', ceramic: '陶瓷', metal: '金属' };

export function ProductsPage() {
  const { state, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState('');

  const onImportFile = async (file: File) => {
    try {
      const products = parseImport(await file.text());
      dispatch({ type: 'import', products, mode: importMode });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败');
    }
  };

  return (
    <div className="page products-page">
      <div className="page-header">
        <h2>产品列表</h2>
        <div className="row gap">
          <button className="primary" onClick={() => dispatch({ type: 'add' })}>＋ 新建产品</button>
          <button onClick={() => exportProducts(state.products)}>导出全部</button>
          <label className="row gap" style={{ gap: 6 }}>
            <select value={importMode} onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}>
              <option value="merge">合并导入</option>
              <option value="replace">覆盖导入</option>
            </select>
            <button onClick={() => fileRef.current?.click()}>导入</button>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="product-grid">
        {state.products.map((p) => (
          <div
            key={p.id}
            className={`product-card ${p.id === state.selectedId ? 'selected' : ''}`}
            onClick={() => dispatch({ type: 'select', id: p.id })}
          >
            <div className="product-card-head">
              <strong>{p.name}</strong>
              <span className="tag">{TYPE_LABEL[p.container.type]}杯</span>
            </div>
            <div className="product-card-meta">
              <span>香型：{p.scent}</span>
              <span>色层：{p.layers.length} · 干花：{p.flowers.enabled ? p.flowers.count : 0}</span>
              <span>更新：{new Date(p.updatedAt).toLocaleString()}</span>
            </div>
            <div className="row gap" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => dispatch({ type: 'duplicate', id: p.id })}>复制</button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm(`确定删除「${p.name}」？`)) dispatch({ type: 'remove', id: p.id });
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
        {state.products.length === 0 && <p className="muted">还没有产品，点击「新建产品」开始。</p>}
      </div>
    </div>
  );
}
