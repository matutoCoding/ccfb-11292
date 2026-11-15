import React, { useRef, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { CandleRenderer } from './gl/renderer';
import { Viewport } from './components/Viewport';
import { ProductsPage } from './pages/ProductsPage';
import { ShapePage } from './pages/ShapePage';
import { MaterialPage } from './pages/MaterialPage';
import { BurnPage } from './pages/BurnPage';
import { SettingsPage } from './pages/SettingsPage';

type PageKey = 'products' | 'shape' | 'material' | 'burn' | 'settings';

const NAV: { key: PageKey; label: string }[] = [
  { key: 'products', label: '产品' },
  { key: 'shape', label: '造型' },
  { key: 'material', label: '材质配色' },
  { key: 'burn', label: '点燃预览' },
  { key: 'settings', label: '设置' },
];

function Shell() {
  const [page, setPage] = useState<PageKey>('products');
  const [fps, setFps] = useState(60);
  const rendererRef = useRef<CandleRenderer | null>(null);
  const { selected } = useStore();
  const showViewport = page !== 'products';

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>🕯 蜡烛工作室</h1>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.key}
              className={page === n.key ? 'active' : ''}
              onClick={() => setPage(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        {selected && (
          <div className="current-product">
            <span className="muted">当前产品</span>
            <strong>{selected.name}</strong>
          </div>
        )}
      </aside>
      <main className={showViewport ? 'split' : 'full'}>
        <div className="panel">
          {page === 'products' && <ProductsPage />}
          {page === 'shape' && <ShapePage />}
          {page === 'material' && <MaterialPage />}
          {page === 'burn' && <BurnPage fps={fps} />}
          {page === 'settings' && <SettingsPage rendererRef={rendererRef} />}
        </div>
        {showViewport && <Viewport rendererRef={rendererRef} onFps={setFps} />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
