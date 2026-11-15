import {
  WAX_VS, WAX_FS, CUP_VS, CUP_FS, DESK_VS, DESK_FS,
  FLOWER_VS, FLOWER_FS, FLAME_VS, FLAME_FS, GLOW_VS, GLOW_FS,
  SOLID_VS, SOLID_FS,
} from './shaders';
import {
  Mesh, buildLathe, buildCup, buildDesk, buildCylinder, buildQuad, buildGlowQuad,
  resampleProfile, computeLayout, buildFlowers, SceneLayout,
} from './geometry';
import { mat4Perspective, mat4LookAt, hexToLinear, Mat4 } from './mat';
import { Product, PreviewState, Quality, QUALITY_PRESETS } from '../types';

interface Program {
  prog: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`着色器编译失败: ${gl.getShaderInfoLog(sh)}\n${src.split('\n').slice(0, 8).join('\n')}`);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`着色器链接失败: ${gl.getProgramInfoLog(prog)}`);
  }
  return { prog, uniforms: new Map() };
}

function U(gl: WebGL2RenderingContext, p: Program, name: string): WebGLUniformLocation | null {
  if (!p.uniforms.has(name)) p.uniforms.set(name, gl.getUniformLocation(p.prog, name));
  return p.uniforms.get(name) ?? null;
}

interface MeshGPU {
  vao: WebGLVertexArrayObject;
  count: number;
}

const ENVS = {
  day: {
    bg: [0.82, 0.79, 0.74] as const,
    ambient: [0.5, 0.48, 0.45],
    keyDir: [0.45, 0.75, 0.4],
    keyColor: [1.0, 0.96, 0.88],
    desk: [0.5, 0.38, 0.27],
    night: 0,
  },
  night: {
    bg: [0.012, 0.014, 0.022] as const,
    ambient: [0.045, 0.045, 0.06],
    keyDir: [0.45, 0.75, 0.4],
    keyColor: [0.06, 0.07, 0.1],
    desk: [0.16, 0.14, 0.15],
    night: 1,
  },
};

const FLAME_COLOR: [number, number, number] = [1.0, 0.62, 0.22];

export class CandleRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private programs: Record<string, Program> = {};
  private meshes: Record<string, MeshGPU> = {};
  private flowerCount = 0;
  private product: Product | null = null;
  private preview: PreviewState | null = null;
  private quality: Quality = 'high';
  private layout: SceneLayout | null = null;

  private yaw = 0.6;
  private pitch = 0.32;
  private dist = 2.1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  private raf = 0;
  private lastT = 0;
  private fpsEma = 60;
  private fpsTimer = 0;
  private onFps: (fps: number) => void;
  private time = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, onFps: (fps: number) => void) {
    this.canvas = canvas;
    this.onFps = onFps;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;

    this.programs.wax = createProgram(gl, WAX_VS, WAX_FS);
    this.programs.cup = createProgram(gl, CUP_VS, CUP_FS);
    this.programs.desk = createProgram(gl, DESK_VS, DESK_FS);
    this.programs.flower = createProgram(gl, FLOWER_VS, FLOWER_FS);
    this.programs.flame = createProgram(gl, FLAME_VS, FLAME_FS);
    this.programs.glow = createProgram(gl, GLOW_VS, GLOW_FS);
    this.programs.solid = createProgram(gl, SOLID_VS, SOLID_FS);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // 静态网格
    this.meshes.desk = this.uploadMesh(buildDesk(24), 0);
    this.meshes.flame = this.uploadQuad(buildQuad(), 2);
    this.meshes.glow = this.uploadQuad(buildGlowQuad(), 2);

    // 交互
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  // ---------- 交互 ----------
  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.setPointerCapture?.(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.yaw += (e.clientX - this.lastX) * 0.008;
    this.pitch = Math.min(1.35, Math.max(-0.1, this.pitch + (e.clientY - this.lastY) * 0.006));
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };
  private onUp = () => { this.dragging = false; };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = Math.min(5, Math.max(1.1, this.dist * (1 + e.deltaY * 0.001)));
  };

  // ---------- 网格上传 ----------
  private uploadMesh(mesh: Mesh, _flags: number): MeshGPU {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const mk = (loc: number, data: Float32Array, size: number) => {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    mk(0, mesh.positions, 3);
    mk(1, mesh.normals, 3);
    if (mesh.extra) {
      // thick, radial, cap, h → locations 2..5
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.extra, gl.STATIC_DRAW);
      for (let i = 0; i < 4; i++) {
        gl.enableVertexAttribArray(2 + i);
        gl.vertexAttribPointer(2 + i, 1, gl.FLOAT, false, 16, i * 4);
      }
    }
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: mesh.indices.length };
  }

  private uploadQuad(data: Float32Array, size: number): MeshGPU {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, size, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, count: data.length / size };
  }

  private deleteMesh(key: string) {
    const m = this.meshes[key];
    if (m) {
      this.gl.deleteVertexArray(m.vao);
      delete this.meshes[key];
    }
  }

  // ---------- 场景构建（产品或画质变化时） ----------
  setScene(product: Product, quality: Quality) {
    this.product = product;
    this.quality = quality;
    const gl = this.gl;
    const layout = computeLayout(product);
    this.layout = layout;
    const preset = QUALITY_PRESETS[quality];
    const segments = quality === 'low' ? 40 : quality === 'medium' ? 56 : 72;

    this.deleteMesh('wax');
    this.deleteMesh('cup');
    this.deleteMesh('wick');
    this.deleteMesh('flower');

    const profile = resampleProfile(product.profile, 56);
    this.meshes.wax = this.uploadMesh(
      buildLathe(profile, segments, layout.waxBaseY, layout.waxH, layout.waxRScale, true), 0);
    this.meshes.cup = this.uploadMesh(
      buildCup(product.container.radius, product.container.height, segments), 0);
    this.meshes.wick = this.uploadMesh(
      buildCylinder(0.011, layout.waxTopY - 0.015, layout.wickTopY, 10), 0);

    // 干花实例
    const { data, count } = buildFlowers(product, layout, preset.maxFlowers);
    this.flowerCount = count;
    if (count > 0) {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const corner = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, corner);
      gl.bufferData(gl.ARRAY_BUFFER, buildGlowQuad(), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const inst = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const stride = 8 * 4;
      const attr = (loc: number, size: number, offset: number) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(loc, 1);
      };
      attr(1, 3, 0);   // offset
      attr(2, 3, 12);  // rot
      attr(3, 1, 24);  // scale
      attr(4, 1, 28);  // hue
      gl.bindVertexArray(null);
      this.meshes.flower = { vao, count: 6 };
    }
    this.resize();
  }

  setPreview(preview: PreviewState) {
    this.preview = preview;
  }

  resize() {
    const gl = this.gl;
    const pr = QUALITY_PRESETS[this.quality].pixelRatio;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * pr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * pr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  // ---------- 主循环 ----------
  start() {
    this.lastT = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.1, (now - this.lastT) / 1000);
      this.lastT = now;
      this.time += dt;
      if (dt > 0) this.fpsEma = this.fpsEma * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
      this.fpsTimer += dt;
      if (this.fpsTimer > 0.5) {
        this.fpsTimer = 0;
        this.onFps(this.fpsEma);
      }
      if (this.preview?.autoRotate && !this.dragging) this.yaw += dt * 0.35;
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  // ---------- 渲染 ----------
  private render() {
    const { gl, product, preview, layout } = this;
    if (!product || !preview || !layout) return;
    this.resize();

    const env = ENVS[preview.env];
    const t = this.time;
    const lit = preview.lit ? 1 : 0;

    // 熔池半径：随燃烧时间 1-exp 增长，最终接近蜡顶半径
    const meltR = lit
      ? layout.topRadius * Math.min(1, 0.06 + 0.94 * (1 - Math.exp(-preview.burnTime / 200)))
      : 0;
    const meltGlow = layout.topRadius > 0 ? meltR / layout.topRadius : 0;

    // 火焰闪烁：多频正弦叠加，风力加大闪烁
    const windAbs = Math.abs(preview.wind);
    const flicker = 0.86
      + 0.09 * Math.sin(t * 11.3)
      + 0.05 * Math.sin(t * 23.7 + 1.3)
      + windAbs * 0.08 * Math.sin(t * 31.0 + 0.7);
    const flameI = lit * Math.max(0.4, flicker);
    const sway = 0.35 + meltGlow * 0.65 + windAbs * 0.4;

    const w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(env.bg[0], env.bg[1], env.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = mat4Perspective(Math.PI / 4.2, w / h, 0.05, 50);
    const target = [0, layout.waxTopY * 0.55, 0];
    const eye = [
      target[0] + this.dist * Math.cos(this.pitch) * Math.sin(this.yaw),
      target[1] + this.dist * Math.sin(this.pitch),
      target[2] + this.dist * Math.cos(this.pitch) * Math.cos(this.yaw),
    ];
    const view = mat4LookAt(eye, target, [0, 1, 0]);

    const preset = QUALITY_PRESETS[this.quality];
    const flamePos = layout.flamePos;
    const keyDir = normalize3(env.keyDir);

    const setCommon = (p: Program) => {
      gl.uniformMatrix4fv(U(gl, p, 'uProj'), false, proj);
      gl.uniformMatrix4fv(U(gl, p, 'uView'), false, view);
      const uEye = U(gl, p, 'uEye');
      if (uEye) gl.uniform3fv(uEye, eye);
      const uAmb = U(gl, p, 'uAmbient');
      if (uAmb) gl.uniform3fv(uAmb, env.ambient);
      const uKd = U(gl, p, 'uKeyDir');
      if (uKd) gl.uniform3fv(uKd, keyDir);
      const uKc = U(gl, p, 'uKeyColor');
      if (uKc) gl.uniform3fv(uKc, env.keyColor);
      const uFp = U(gl, p, 'uFlamePos');
      if (uFp) gl.uniform3fv(uFp, flamePos);
      const uFi = U(gl, p, 'uFlameI');
      if (uFi) gl.uniform1f(uFi, flameI);
      const uFc = U(gl, p, 'uFlameColor');
      if (uFc) gl.uniform3fv(uFc, FLAME_COLOR);
      const uLit = U(gl, p, 'uLit');
      if (uLit) gl.uniform1f(uLit, lit);
      const uMg = U(gl, p, 'uMeltGlow');
      if (uMg) gl.uniform1f(uMg, meltGlow);
    };

    // ---- 1. 不透明：桌面 ----
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    {
      const p = this.programs.desk;
      gl.useProgram(p.prog);
      setCommon(p);
      gl.uniform3fv(U(gl, p, 'uBaseColor'), env.desk);
      gl.uniform1f(U(gl, p, 'uIsNight'), env.night);
      gl.bindVertexArray(this.meshes.desk.vao);
      gl.drawElements(gl.TRIANGLES, this.meshes.desk.count, gl.UNSIGNED_INT, 0);
    }

    // ---- 2. 不透明杯（陶瓷/金属）或玻璃背面 ----
    const isGlass = product.container.type === 'glass';
    const cupType = product.container.type === 'glass' ? 0 : product.container.type === 'metal' ? 2 : 1;
    const drawCup = () => {
      const p = this.programs.cup;
      gl.useProgram(p.prog);
      setCommon(p);
      gl.uniform1i(U(gl, p, 'uType'), cupType);
      gl.uniform3fv(U(gl, p, 'uColor'), hexToLinear(product.container.color));
      gl.uniform1f(U(gl, p, 'uCupH'), product.container.height);
      gl.bindVertexArray(this.meshes.cup.vao);
      gl.drawElements(gl.TRIANGLES, this.meshes.cup.count, gl.UNSIGNED_INT, 0);
    };
    if (!isGlass) {
      drawCup();
    } else {
      // 玻璃背面先画（混合，不写深度）
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.cullFace(gl.FRONT);
      drawCup();
      gl.cullFace(gl.BACK);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // ---- 3. 烛芯 ----
    {
      const p = this.programs.solid;
      gl.useProgram(p.prog);
      setCommon(p);
      gl.uniform3fv(U(gl, p, 'uColor'), [0.08, 0.06, 0.05]);
      gl.uniform1f(U(gl, p, 'uTipY'), layout.wickTopY);
      gl.bindVertexArray(this.meshes.wick.vao);
      gl.drawElements(gl.TRIANGLES, this.meshes.wick.count, gl.UNSIGNED_INT, 0);
    }

    // ---- 4. 干花（蜡体之前，让蜡半透覆盖 → 半隐半现） ----
    if (this.flowerCount > 0 && this.meshes.flower) {
      const p = this.programs.flower;
      gl.useProgram(p.prog);
      setCommon(p);
      gl.uniform3fv(U(gl, p, 'uColorA'), hexToLinear(product.flowers.colorA));
      gl.uniform3fv(U(gl, p, 'uColorB'), hexToLinear(product.flowers.colorB));
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.meshes.flower.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.flowerCount);
      gl.disable(gl.BLEND);
    }

    // ---- 5. 蜡体（半透，不写深度） ----
    {
      const p = this.programs.wax;
      gl.useProgram(p.prog);
      setCommon(p);
      gl.uniform1f(U(gl, p, 'uMeltR'), meltR);
      gl.uniform1f(U(gl, p, 'uMeltDip'), 0.028);
      gl.uniform1f(U(gl, p, 'uSSS'), product.sss);
      gl.uniform1f(U(gl, p, 'uWaxTop'), layout.waxTopY);
      // 分层渐变
      const colors: number[] = [];
      const ranges: number[] = [];
      const layers = product.layers.length > 0 ? product.layers : [{ color: '#f0e0c8', from: 0, to: 1 }];
      for (let i = 0; i < 4; i++) {
        const l = layers[Math.min(i, layers.length - 1)];
        colors.push(...hexToLinear(l.color));
        ranges.push(l.from, l.to);
      }
      gl.uniform3fv(U(gl, p, 'uLayerColor'), colors);
      gl.uniform2fv(U(gl, p, 'uLayerRange'), ranges);
      gl.uniform1i(U(gl, p, 'uLayerCount'), Math.min(4, layers.length));
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(this.meshes.wax.vao);
      gl.drawElements(gl.TRIANGLES, this.meshes.wax.count, gl.UNSIGNED_INT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // ---- 6. 玻璃正面 ----
    if (isGlass) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      drawCup();
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // ---- 7. 光晕 + 火焰（加色混合） ----
    if (lit > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // 预乘
      gl.depthMask(false);
      {
        const p = this.programs.glow;
        gl.useProgram(p.prog);
        setCommon(p);
        gl.uniform3fv(U(gl, p, 'uCenter'), flamePos);
        gl.uniform1f(U(gl, p, 'uRadius'), 0.55 + meltGlow * 0.25);
        gl.uniform3fv(U(gl, p, 'uColor'), FLAME_COLOR);
        gl.uniform1f(U(gl, p, 'uIntensity'), 0.5 * flameI * (preview.env === 'night' ? 1.0 : 0.45));
        gl.bindVertexArray(this.meshes.glow.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.meshes.glow.count);
      }
      {
        const p = this.programs.flame;
        gl.useProgram(p.prog);
        setCommon(p);
        gl.uniform3fv(U(gl, p, 'uCenter'), flamePos);
        gl.uniform2f(U(gl, p, 'uSize'), 0.11, 0.24 * (0.92 + 0.12 * flicker));
        gl.uniform1f(U(gl, p, 'uWind'), preview.wind);
        gl.uniform1f(U(gl, p, 'uTime'), t);
        gl.uniform1f(U(gl, p, 'uSway'), sway);
        gl.uniform1f(U(gl, p, 'uFlicker'), flicker);
        gl.uniform1i(U(gl, p, 'uOctaves'), preset.noiseOctaves);
        gl.uniform1f(U(gl, p, 'uIntensity'), 1.0);
        gl.bindVertexArray(this.meshes.flame.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.meshes.flame.count);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    gl.bindVertexArray(null);
  }

  /** 截图：渲染一帧后合成参数文字，触发下载 */
  capturePNG(paramLines: string[], title: string) {
    this.render();
    const src = this.canvas;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    // 参数面板
    const pad = Math.round(out.width * 0.02);
    const lineH = Math.round(out.width * 0.022);
    const fontSize = Math.round(lineH * 0.62);
    const boxW = Math.round(out.width * 0.34);
    const boxH = pad + lineH * (paramLines.length + 1);
    ctx.fillStyle = 'rgba(10, 10, 14, 0.62)';
    ctx.fillRect(pad, out.height - boxH - pad, boxW, boxH);
    ctx.fillStyle = '#f5efe4';
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.fillText(title, pad * 1.6, out.height - boxH - pad + lineH);
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = '#d8d0c0';
    paramLines.forEach((line, i) => {
      ctx.fillText(line, pad * 1.6, out.height - boxH - pad + lineH * (i + 2));
    });
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '_')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }
}

function normalize3(v: readonly number[]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
