import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import {
  Product, PreviewState, createProduct, DEFAULT_PREVIEW,
} from './types';

const LS_PRODUCTS = 'candle-studio.products.v1';
const LS_PREVIEW = 'candle-studio.preview.v1';
const LS_SELECTED = 'candle-studio.selected.v1';

interface State {
  products: Product[];
  selectedId: string | null;
  preview: PreviewState;
}

type Action =
  | { type: 'add' }
  | { type: 'update'; product: Product }
  | { type: 'remove'; id: string }
  | { type: 'duplicate'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'import'; products: Product[]; mode: 'merge' | 'replace' }
  | { type: 'preview'; patch: Partial<PreviewState> };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function initState(): State {
  let products = load<Product[]>(LS_PRODUCTS, []);
  if (!Array.isArray(products) || products.length === 0) {
    products = [createProduct('示例 · 晨雾花园')];
  }
  const selectedId = load<string | null>(LS_SELECTED, products[0]?.id ?? null);
  return {
    products,
    selectedId: products.some((p) => p.id === selectedId) ? selectedId : products[0]?.id ?? null,
    preview: { ...DEFAULT_PREVIEW, ...load<Partial<PreviewState>>(LS_PREVIEW, {}) },
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add': {
      const p = createProduct(`新品蜡烛 ${state.products.length + 1}`);
      return { ...state, products: [...state.products, p], selectedId: p.id };
    }
    case 'update': {
      const product = { ...action.product, updatedAt: Date.now() };
      return {
        ...state,
        products: state.products.map((p) => (p.id === product.id ? product : p)),
      };
    }
    case 'remove': {
      const products = state.products.filter((p) => p.id !== action.id);
      const selectedId =
        state.selectedId === action.id ? products[0]?.id ?? null : state.selectedId;
      return { ...state, products, selectedId };
    }
    case 'duplicate': {
      const src = state.products.find((p) => p.id === action.id);
      if (!src) return state;
      const now = Date.now();
      const copy: Product = {
        ...JSON.parse(JSON.stringify(src)),
        id: `p_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
        name: `${src.name} 副本`,
        createdAt: now,
        updatedAt: now,
      };
      const idx = state.products.findIndex((p) => p.id === action.id);
      const products = [...state.products];
      products.splice(idx + 1, 0, copy);
      return { ...state, products, selectedId: copy.id };
    }
    case 'select':
      return { ...state, selectedId: action.id };
    case 'import': {
      const incoming = action.products.filter((p) => p && p.id && p.container && p.profile);
      if (action.mode === 'replace') {
        return { ...state, products: incoming, selectedId: incoming[0]?.id ?? null };
      }
      const existing = new Set(state.products.map((p) => p.id));
      const merged = [...state.products];
      for (const p of incoming) {
        if (existing.has(p.id)) {
          p.id = `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
        }
        merged.push(p);
      }
      return { ...state, products: merged };
    }
    case 'preview':
      return { ...state, preview: { ...state.preview, ...action.patch } };
    default:
      return state;
  }
}

interface Store {
  state: State;
  dispatch: React.Dispatch<Action>;
  selected: Product | null;
  updateSelected: (patch: Partial<Product>) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  useEffect(() => {
    try { localStorage.setItem(LS_PRODUCTS, JSON.stringify(state.products)); } catch { /* 容量满时静默 */ }
  }, [state.products]);
  useEffect(() => {
    try { localStorage.setItem(LS_PREVIEW, JSON.stringify(state.preview)); } catch { /* ignore */ }
  }, [state.preview]);
  useEffect(() => {
    try { localStorage.setItem(LS_SELECTED, JSON.stringify(state.selectedId)); } catch { /* ignore */ }
  }, [state.selectedId]);

  const store = useMemo<Store>(() => {
    const selected = state.products.find((p) => p.id === state.selectedId) ?? null;
    return {
      state,
      dispatch,
      selected,
      updateSelected: (patch) => {
        if (selected) dispatch({ type: 'update', product: { ...selected, ...patch } });
      },
    };
  }, [state]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used within StoreProvider');
  return s;
}

// ---------- 导入导出 ----------

export function exportProducts(products: Product[]) {
  const blob = new Blob([JSON.stringify({ version: 1, products }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `candle-products-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImport(text: string): Product[] {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.products;
  if (!Array.isArray(list)) throw new Error('文件格式不正确：找不到产品数组');
  return list as Product[];
}
