'use client';

import { useEffect, useRef } from 'react';

import type { JsonValue } from '../../../../../lib/shared';

export interface DrawPoint extends Record<string, JsonValue> { x: number; y: number }
export interface DrawStroke extends Record<string, JsonValue> { points: DrawPoint[] }

function paint(canvas: HTMLCanvasElement, strokes: DrawStroke[], liveStroke: DrawPoint[] | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1a1a2e';
  for (const stroke of [...strokes, ...(liveStroke ? [{ points: liveStroke }] : [])]) {
    if (stroke.points.length === 0) continue;
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (stroke.points.length === 1) {
      const point = stroke.points[0]!;
      ctx.arc(point.x * width, point.y * height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
}

/** A square, coordinate-normalized (0–1) drawing surface. Reports finished strokes via `onStrokeComplete`; the caller owns the stroke list so undo/clear/submit stay simple state operations. */
export function DrawingCanvas({ strokes, disabled, maxPointsPerStroke, onStrokeComplete }: {
  strokes: DrawStroke[]; disabled: boolean; maxPointsPerStroke: number; onStrokeComplete: (stroke: DrawStroke) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveStrokeRef = useRef<DrawPoint[] | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) paint(canvas, strokes, liveStrokeRef.current);
  }, [strokes]);

  function pointFromEvent(canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>): DrawPoint {
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return { x, y };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    liveStrokeRef.current = [pointFromEvent(canvas, event)];
    paint(canvas, strokes, liveStrokeRef.current);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas || !liveStrokeRef.current) return;
    if (liveStrokeRef.current.length < maxPointsPerStroke) {
      liveStrokeRef.current = [...liveStrokeRef.current, pointFromEvent(canvas, event)];
    }
    paint(canvas, strokes, liveStrokeRef.current);
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const finished = liveStrokeRef.current;
    liveStrokeRef.current = null;
    if (finished && finished.length > 0) onStrokeComplete({ points: finished });
    const canvas = canvasRef.current;
    if (canvas) paint(canvas, strokes, null);
  }

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={480}
      className="aspect-square w-full touch-none rounded-2xl border border-border bg-white"
      data-drawing-canvas
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}

export function StaticDrawingPreview({ strokes, size = 160 }: { strokes: DrawStroke[]; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) paint(canvas, strokes, null);
  }, [strokes]);
  return <canvas ref={canvasRef} width={size} height={size} className="aspect-square w-full rounded-xl border border-border bg-white" data-drawing-preview />;
}
