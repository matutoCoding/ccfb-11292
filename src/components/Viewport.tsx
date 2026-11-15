import React, { useEffect, useRef } from 'react';
import { CandleRenderer } from '../gl/renderer';
import { useStore } from '../store';

interface Props {
  rendererRef: React.MutableRefObject<CandleRenderer | null>;
  onFps: (fps: number) => void;
}

/** 常驻 3D 视口：跨页面共享同一个渲染器实例 */
export function Viewport({ rendererRef, onFps }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, selected } = useStore();
  const fpsCb = useRef(onFps);
  fpsCb.current = onFps;

  // 创建/销毁渲染器
  useEffect(() => {
    if (!canvasRef.current) return;
    let renderer: CandleRenderer | null = null;
    try {
      renderer = new CandleRenderer(canvasRef.current, (fps) => fpsCb.current(fps));
    } catch (err) {
      console.error(err);
      return;
    }
    rendererRef.current = renderer;
    renderer.start();
    const onResize = () => renderer?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      renderer?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 产品或画质变化 → 重建几何
  useEffect(() => {
    if (rendererRef.current && selected) {
      rendererRef.current.setScene(selected, state.preview.quality);
    }
  }, [selected, state.preview.quality, rendererRef]);

  // 预览状态 → 动态 uniform
  useEffect(() => {
    rendererRef.current?.setPreview(state.preview);
  }, [state.preview, rendererRef]);

  return (
    <div className="viewport">
      <canvas ref={canvasRef} className="gl-canvas" />
      <div className="viewport-hint">拖动旋转 · 滚轮缩放</div>
    </div>
  );
}
