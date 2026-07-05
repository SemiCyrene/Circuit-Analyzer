// ============================================================
// PhasorDiagram.tsx - AC Phasor Polar Canvas
// 在极坐标圆盘上绘制各节点电压和支路电流的相量箭头
// Apple 极简黑白风格：细线、细字、精准标注
// ============================================================

import React, { useRef, useEffect, useCallback } from 'react';
import { useCircuit } from '../store/circuitStore';
import { translations } from '../store/translations';

const SIZE = 260;       // canvas 尺寸 px
const CX   = SIZE / 2; // 圆心 X
const CY   = SIZE / 2; // 圆心 Y
const R    = 106;       // 极坐标半径（单位圆）

// 根据极坐标绘制一个带箭头的相量
function drawPhasor(
  ctx: CanvasRenderingContext2D,
  magnitude: number,
  phaseRad: number,
  scale: number,
  color: string,
  label: string,
  dashed = false,
) {
  const len = magnitude * scale;
  const ex = CX + len * Math.cos(phaseRad);
  const ey = CY - len * Math.sin(phaseRad); // SVG Y 轴向下，cos/sin Y 取反

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = 1.5;
  if (dashed) ctx.setLineDash([4, 3]);
  else ctx.setLineDash([]);

  // 画线
  ctx.beginPath();
  ctx.moveTo(CX, CY);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // 箭头头部
  const arrowLen = 8;
  const arrowAngle = 0.4; // radians
  const angle = Math.atan2(ey - CY, ex - CX);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(
    ex - arrowLen * Math.cos(angle - arrowAngle),
    ey - arrowLen * Math.sin(angle - arrowAngle),
  );
  ctx.lineTo(
    ex - arrowLen * Math.cos(angle + arrowAngle),
    ey - arrowLen * Math.sin(angle + arrowAngle),
  );
  ctx.closePath();
  ctx.fill();

  // 标签
  ctx.font = '9px "SF Mono", "Fira Code", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lx = ex + 14 * Math.cos(angle);
  const ly = ey + 14 * Math.sin(angle);
  ctx.fillText(label, lx, ly);

  ctx.restore();
}

export const PhasorDiagram: React.FC = () => {
  const { state } = useCircuit();
  const t = translations[state.language];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // DPI scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width  = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    ctx.scale(dpr, dpr);

    // Background
    const isDark = state.theme === 'dark';
    const textColor    = isDark ? '#F5F5F7' : '#1D1D1F';
    const subtleColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const tickColor    = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';

    ctx.clearRect(0, 0, SIZE, SIZE);

    // ---- Draw polar grid ----
    const rings = 4;
    for (let i = 1; i <= rings; i++) {
      ctx.beginPath();
      ctx.arc(CX, CY, (R / rings) * i, 0, 2 * Math.PI);
      ctx.strokeStyle = subtleColor;
      ctx.lineWidth = i === rings ? 1 : 0.5;
      ctx.setLineDash(i === rings ? [] : [3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Axes (0°, 90°, 180°, 270°)
    for (let a = 0; a < 4; a++) {
      const angle = (a * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.lineTo(CX + (R + 14) * Math.cos(angle), CY - (R + 14) * Math.sin(angle));
      ctx.strokeStyle = tickColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = tickColor;
    ctx.font = '9px "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('0°',   CX + R + 18, CY + 3);
    ctx.fillText('90°',  CX,          CY - R - 14);
    ctx.fillText('180°', CX - R - 22, CY + 3);
    ctx.fillText('270°', CX,          CY + R + 14);

    // Center dot
    ctx.beginPath();
    ctx.arc(CX, CY, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = textColor;
    ctx.fill();

    const result = state.solverResult;
    if (!result?.success) {
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.runToViewPhasors, CX, CY + R + 30);
      return;
    }

    // ---- Compute scale from max magnitude ----
    const voltages = Object.values(result.nodeVoltages);
    const currents = Object.values(result.branchCurrents);
    const allMags  = [
      ...voltages.map(v => Math.sqrt(v.re ** 2 + v.im ** 2)),
      ...currents.map(i => Math.sqrt(i.re ** 2 + i.im ** 2)),
    ].filter(m => m > 1e-10);

    if (allMags.length === 0) {
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.noNonZeroSignals, CX, CY + R + 30);
      return;
    }

    const maxMag = Math.max(...allMags);
    const scale  = R / maxMag;

    // ---- Draw node voltage phasors ----
    // Use monochrome: primary text color for voltages, secondary for currents
    const nodeIds = Object.keys(result.nodeVoltages);
    nodeIds.forEach((nodeId, idx) => {
      const v = result.nodeVoltages[nodeId];
      const mag = Math.sqrt(v.re ** 2 + v.im ** 2);
      if (mag < 1e-10) return;
      const phase = Math.atan2(v.im, v.re);
      const magStr = mag >= 1 ? `${mag.toFixed(2)}V` : `${(mag * 1e3).toFixed(1)}mV`;
      const label = `V${idx + 1}\n${magStr}`;
      const alpha = Math.max(0.5, 1 - idx * 0.15);
      drawPhasor(ctx, mag, phase, scale,
        isDark ? `rgba(245,245,247,${alpha})` : `rgba(29,29,31,${alpha})`,
        label,
      );
    });

    // ---- Draw branch current phasors (dashed, lighter) ----
    const branchIds = Object.keys(result.branchCurrents);
    branchIds.forEach((id, idx) => {
      const i = result.branchCurrents[id];
      const mag = Math.sqrt(i.re ** 2 + i.im ** 2);
      if (mag < 1e-10) return;
      const phase = Math.atan2(i.im, i.re);
      const magStr = mag >= 1 ? `${mag.toFixed(3)}A`
        : mag >= 1e-3 ? `${(mag * 1e3).toFixed(2)}mA`
        : `${(mag * 1e6).toFixed(2)}μA`;
      const label = `I(${id})\n${magStr}`;
      const alpha = Math.max(0.3, 0.7 - idx * 0.1);
      drawPhasor(ctx, mag, phase, scale,
        isDark ? `rgba(142,142,147,${alpha})` : `rgba(110,110,115,${alpha})`,
        label,
        true, // dashed
      );
    });

    // ---- Legend ----
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isDark ? 'rgba(245,245,247,0.5)' : 'rgba(29,29,31,0.4)';
    ctx.fillText(t.legend, 8, 6);

  }, [state.solverResult, state.theme, t]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0' }}>
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-canvas)',
        }}
      />
      {state.analysisType === 'DC' && (
        <p style={{
          marginTop: 10,
          fontSize: 'var(--text-sm)',
          color: 'var(--text-tertiary)',
          textAlign: 'center',
          padding: '0 12px',
        }}>
          {t.phasorUnavailable}
        </p>
      )}
    </div>
  );
};

export default PhasorDiagram;
