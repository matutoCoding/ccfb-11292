// ---------- 数据模型 ----------

export type ContainerType = 'glass' | 'ceramic' | 'metal';
export type EnvMode = 'day' | 'night';
export type Quality = 'low' | 'medium' | 'high';

/** 旋转剖面线上的一个点：y 为高度比例 0..1，r 为半径比例 0..1 */
export interface ProfilePoint {
  y: number;
  r: number;
}

/** 分层渐变色带，from/to 为蜡体高度比例 */
export interface ColorLayer {
  color: string; // #rrggbb
  from: number;
  to: number;
}

export interface FlowerConfig {
  enabled: boolean;
  count: number;      // 数量
  size: number;       // 尺寸比例
  depth: number;      // 嵌入深度 0..1（越浅越贴近杯壁越清晰）
  colorA: string;     // 花瓣主色
  colorB: string;     // 花心/辅色
}

export interface ContainerConfig {
  type: ContainerType;
  color: string;
  radius: number;   // 杯口半径（场景单位）
  height: number;   // 杯高
}

export interface Product {
  id: string;
  name: string;
  scent: string;        // 香型，仅作参数记录
  createdAt: number;
  updatedAt: number;
  container: ContainerConfig;
  profile: ProfilePoint[];   // 蜡体旋转剖面（按 y 升序）
  layers: ColorLayer[];      // 分层渐变（按 from 升序）
  flowers: FlowerConfig;
  waxFill: number;    // 蜡占杯高比例 0.3..0.95
  sss: number;        // 次表面散射强度（消光系数）0.5..6
}

export interface PreviewState {
  lit: boolean;
  burnTime: number;   // 秒，驱动熔池与火焰
  wind: number;       // -1..1
  autoRotate: boolean;
  env: EnvMode;
  quality: Quality;
}

export const DEFAULT_PROFILE: ProfilePoint[] = [
  { y: 0, r: 0.86 },
  { y: 0.02, r: 0.92 },
  { y: 0.5, r: 0.95 },
  { y: 0.96, r: 0.95 },
  { y: 1, r: 0.9 },
];

export function createProduct(name: string): Product {
  const now = Date.now();
  return {
    id: `p_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    scent: '白茶与姜花',
    createdAt: now,
    updatedAt: now,
    container: { type: 'glass', color: '#c8b89a', radius: 0.5, height: 0.72 },
    profile: DEFAULT_PROFILE.map((p) => ({ ...p })),
    layers: [
      { color: '#f3e2c7', from: 0, to: 0.45 },
      { color: '#e8b98a', from: 0.45, to: 0.8 },
      { color: '#c97e5a', from: 0.8, to: 1 },
    ],
    flowers: {
      enabled: true,
      count: 28,
      size: 0.055,
      depth: 0.75,
      colorA: '#b76d8a',
      colorB: '#e8c85a',
    },
    waxFill: 0.82,
    sss: 2.4,
  };
}

export const DEFAULT_PREVIEW: PreviewState = {
  lit: true,
  burnTime: 0,
  wind: 0,
  autoRotate: false,
  env: 'night',
  quality: 'high',
};

export const QUALITY_PRESETS: Record<Quality, { pixelRatio: number; maxFlowers: number; noiseOctaves: number; label: string }> = {
  low:    { pixelRatio: 0.6, maxFlowers: 16, noiseOctaves: 2, label: '流畅' },
  medium: { pixelRatio: 1.0, maxFlowers: 40, noiseOctaves: 3, label: '均衡' },
  high:   { pixelRatio: Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 2), maxFlowers: 80, noiseOctaves: 4, label: '精细' },
};
