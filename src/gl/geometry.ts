import { Product, ProfilePoint } from '../types';

// ---------- 随机数（按产品 id 播种，干花位置稳定） ----------
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- 剖面采样 ----------

/** Catmull-Rom 插值，把用户剖面点重采样为 rows 行（y 均匀） */
export function resampleProfile(points: ProfilePoint[], rows: number): { y: number; r: number }[] {
  const pts = [...points].sort((a, b) => a.y - b.y);
  const out: { y: number; r: number }[] = [];
  const rAt = (y: number): number => {
    if (y <= pts[0].y) return pts[0].r;
    if (y >= pts[pts.length - 1].y) return pts[pts.length - 1].r;
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1].y < y) i++;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = (y - p1.y) / Math.max(p2.y - p1.y, 1e-6);
    const t2 = t * t, t3 = t2 * t;
    // 标准 Catmull-Rom
    return Math.max(0.01,
      0.5 * ((2 * p1.r) + (-p0.r + p2.r) * t +
        (2 * p0.r - 5 * p1.r + 4 * p2.r - p3.r) * t2 +
        (-p0.r + 3 * p1.r - 3 * p2.r + p3.r) * t3));
  };
  for (let i = 0; i < rows; i++) {
    const y = i / (rows - 1);
    out.push({ y, r: rAt(y) });
  }
  return out;
}

export interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  extra: Float32Array | null; // 每顶点附加数据（蜡体：thick, radial, cap, h）
  extraSize: number;
  indices: Uint32Array;
}

/** 旋转成型：profile 为 (y01, r01)，映射到世界 yBase+y*height、r*rScale */
export function buildLathe(
  profile: { y: number; r: number }[],
  segments: number,
  yBase: number,
  height: number,
  rScale: number,
  withTopCap: boolean,
): Mesh {
  const rows = profile.length;
  const pos: number[] = [];
  const nrm: number[] = [];
  const extra: number[] = [];
  const idx: number[] = [];

  // 剖面法线（2D）：切线 (dr, dy) → 法线 (dy, -dr)
  const n2: { nr: number; ny: number }[] = [];
  for (let i = 0; i < rows; i++) {
    const a = profile[Math.max(0, i - 1)];
    const b = profile[Math.min(rows - 1, i + 1)];
    const dr = (b.r - a.r) * rScale;
    const dy = Math.max((b.y - a.y) * height, 1e-6);
    const len = Math.hypot(dy, -dr) || 1;
    n2.push({ nr: dy / len, ny: -dr / len });
  }

  for (let i = 0; i < rows; i++) {
    const { y, r } = profile[i];
    const wy = yBase + y * height;
    const wr = r * rScale;
    for (let s = 0; s <= segments; s++) {
      const th = (s / segments) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      pos.push(wr * c, wy, wr * sn);
      nrm.push(n2[i].nr * c, n2[i].ny, n2[i].nr * sn);
      // thick = 到轴心距离（局部厚度近似）；radial/cap 侧壁不用
      extra.push(wr, 0, 0, y);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = i * (segments + 1) + s;
      const b = a + segments + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  if (withTopCap) {
    // 顶盖：同心环到中心，法线朝上
    const topY = yBase + height;
    const rTop = profile[rows - 1].r * rScale;
    const rings = 10;
    const capStart = pos.length / 3;
    for (let ring = 0; ring <= rings; ring++) {
      const rr = rTop * (1 - ring / rings);
      for (let s = 0; s <= segments; s++) {
        const th = (s / segments) * Math.PI * 2;
        pos.push(rr * Math.cos(th), topY, rr * Math.sin(th));
        nrm.push(0, 1, 0);
        extra.push(height * 0.6, rr, 1, 1);
      }
    }
    for (let ring = 0; ring < rings; ring++) {
      for (let s = 0; s < segments; s++) {
        const a = capStart + ring * (segments + 1) + s;
        const b = a + segments + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    extra: new Float32Array(extra),
    extraSize: 4,
    indices: new Uint32Array(idx),
  };
}

/** 容器杯：外壁 → 杯口 → 内壁 → 内底 的一条剖面 */
export function buildCup(radius: number, height: number, segments: number): Mesh {
  const wall = radius * 0.08;
  const rIn = radius - wall;
  const floorH = height * 0.07;
  const profile = [
    { y: 0, r: radius * 0.96 },
    { y: height * 0.02, r: radius },
    { y: height, r: radius },
    { y: height, r: rIn },
    { y: floorH, r: rIn },
    { y: floorH, r: 0.001 },
  ];
  // 直接用世界坐标剖面（y 已是世界值），复用 lathe：yBase=0, height=1, rScale=1
  const rows = profile.length;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const n2: { nr: number; ny: number }[] = [];
  for (let i = 0; i < rows; i++) {
    const a = profile[Math.max(0, i - 1)];
    const b = profile[Math.min(rows - 1, i + 1)];
    const dr = b.r - a.r;
    const dy = b.y - a.y;
    const len = Math.hypot(dy, -dr) || 1;
    n2.push({ nr: dy / len, ny: -dr / len });
  }
  for (let i = 0; i < rows; i++) {
    const { y, r } = profile[i];
    for (let s = 0; s <= segments; s++) {
      const th = (s / segments) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      pos.push(r * c, y, r * sn);
      nrm.push(n2[i].nr * c, n2[i].ny, n2[i].nr * sn);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = i * (segments + 1) + s;
      const b = a + segments + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    extra: null,
    extraSize: 0,
    indices: new Uint32Array(idx),
  };
}

export function buildDesk(size: number): Mesh {
  const h = size / 2;
  return {
    positions: new Float32Array([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    extra: null,
    extraSize: 0,
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}

export function buildCylinder(r: number, y0: number, y1: number, segments: number): Mesh {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= 1; i++) {
    const y = i === 0 ? y0 : y1;
    for (let s = 0; s <= segments; s++) {
      const th = (s / segments) * Math.PI * 2;
      pos.push(r * Math.cos(th), y, r * Math.sin(th));
      nrm.push(Math.cos(th), 0, Math.sin(th));
    }
  }
  for (let s = 0; s < segments; s++) {
    idx.push(s, s + segments + 1, s + 1, s + 1, s + segments + 1, s + segments + 2);
  }
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    extra: null,
    extraSize: 0,
    indices: new Uint32Array(idx),
  };
}

export function buildQuad(): Float32Array {
  // 火焰用：x -1..1, y 0..1
  return new Float32Array([-1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1]);
}

export function buildGlowQuad(): Float32Array {
  return new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
}

// ---------- 场景派生量 ----------

export interface SceneLayout {
  floorH: number;   // 杯内底高度
  waxBaseY: number;
  waxH: number;
  waxTopY: number;
  waxRScale: number;
  wickTopY: number;
  flamePos: [number, number, number];
  topRadius: number; // 蜡顶半径（世界单位）
}

export function computeLayout(p: Product): SceneLayout {
  const { radius, height } = p.container;
  const floorH = height * 0.07;
  const innerH = height - floorH;
  const waxH = innerH * p.waxFill;
  const waxBaseY = floorH;
  const waxTopY = waxBaseY + waxH;
  const waxRScale = (radius - radius * 0.08) * 0.985;
  const wickTopY = waxTopY + 0.045;
  const sorted = [...p.profile].sort((a, b) => a.y - b.y);
  const topRadius = sorted[sorted.length - 1].r * waxRScale;
  return {
    floorH, waxBaseY, waxH, waxTopY, waxRScale,
    wickTopY,
    flamePos: [0, wickTopY + 0.02, 0],
    topRadius,
  };
}

/** 干花实例数据：offset(3) rot(3) scale(1) hue(1) */
export function buildFlowers(p: Product, layout: SceneLayout, maxCount: number): { data: Float32Array; count: number } {
  const count = Math.min(p.flowers.enabled ? p.flowers.count : 0, maxCount);
  const rand = mulberry32(hashString(p.id));
  const profile = resampleProfile(p.profile, 64);
  const rAt = (y01: number) => {
    const i = Math.min(profile.length - 1, Math.max(0, Math.round(y01 * (profile.length - 1))));
    return profile[i].r * layout.waxRScale;
  };
  const arr: number[] = [];
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 30) {
    guard++;
    const y01 = 0.06 + rand() * 0.86;
    const rMax = rAt(y01);
    // depth 越小花越贴近表面，越容易透过蜡看到
    const depth = p.flowers.depth;
    const radial = rMax * (1 - depth * 0.55) * (0.55 + rand() * 0.45);
    if (radial > rMax * 0.97) continue;
    const th = rand() * Math.PI * 2;
    const x = radial * Math.cos(th);
    const z = radial * Math.sin(th);
    const y = layout.waxBaseY + y01 * layout.waxH;
    // 朝向：大致朝外，带随机倾角
    const rotY = -th + Math.PI / 2 + (rand() - 0.5) * 0.9;
    const rotX = (rand() - 0.5) * 0.8;
    const rotZ = (rand() - 0.5) * 0.8;
    const scale = p.flowers.size * (0.7 + rand() * 0.7);
    const hue = rand();
    arr.push(x, y, z, rotX, rotY, rotZ, scale, hue);
    placed++;
  }
  return { data: new Float32Array(arr), count: placed };
}
