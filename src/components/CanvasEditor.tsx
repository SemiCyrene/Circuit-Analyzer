// ============================================================
// CanvasEditor.tsx - Interactive SVG Canvas for Circuit Drawing
// Handles: component placement, wire drawing, selection, pan/zoom
// ============================================================

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useCircuit } from '../store/circuitStore';
import { ComponentSymbol, COMP_W, COMP_H, PIN_OFFSETS } from './componentSymbols';
import type { Component, ComponentType, Wire, WiringMode } from '../types/circuit';

const GRID = 20;
const PIN_SNAP_RADIUS = 16; // px — how close cursor must be to snap to a pin

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

let _idCounter = 1;
function genId(prefix: string): string {
  return `${prefix}${_idCounter++}`;
}

const DEFAULT_VALUE: Partial<Record<ComponentType, number>> = {
  R: 1000, C: 1e-6, L: 1e-3,
  V_DC: 5, I_DC: 0.001, V_AC: 5, I_AC: 0.001,
  GROUND: 0,
};

// ---- Pin world position (handles rotation) ----
function getPinWorldPos(comp: Component, pinIndex: number) {
  const offset = PIN_OFFSETS[comp.type]?.[pinIndex];
  if (!offset) return { x: comp.position.x, y: comp.position.y };
  const cx = COMP_W / 2;
  const cy = COMP_H / 2;
  const angle = (comp.rotation * Math.PI) / 180;
  const dx = offset.x - cx;
  const dy = offset.y - cy;
  return {
    x: comp.position.x + cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: comp.position.y + cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

// ---- Find the nearest pin within snap radius ----
interface NearestPin {
  comp: Component;
  pinIndex: number;
  pinId: string;
  x: number;
  y: number;
}

function findNearestPin(
  components: Component[],
  x: number,
  y: number,
  excludePinId?: string,
): NearestPin | null {
  let best: NearestPin | null = null;
  let bestDist = PIN_SNAP_RADIUS;
  for (const comp of components) {
    if (comp.type === 'WIRE') continue;
    comp.pins.forEach((pin, i) => {
      if (pin.id === excludePinId) return;
      const pos = getPinWorldPos(comp, i);
      const dist = Math.hypot(pos.x - x, pos.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = { comp, pinIndex: i, pinId: pin.id, x: pos.x, y: pos.y };
      }
    });
  }
  return best;
}

// ---- Build path between two points depending on wiring mode ----
function buildWirePath(
  x1: number, y1: number,
  x2: number, y2: number,
  mode: WiringMode = 'orthogonal',
): { x: number; y: number }[] {
  if (mode === 'direct') {
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }
  // Orthogonal path: horizontal then vertical
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
  ];
}

export const CanvasEditor: React.FC = () => {
  const { state, dispatch } = useCircuit();
  const svgRef = useRef<SVGSVGElement>(null);

  // Ephemeral wire-drawing state
  const [drawingWire, setDrawingWire] = useState<{
    startPinId: string;
    startX: number; startY: number;
    currentX: number; currentY: number;
    snapTarget: NearestPin | null;
  } | null>(null);

  // Dragging a component
  const [dragging, setDragging] = useState<{
    id: string;
    offsetX: number; offsetY: number;
  } | null>(null);

  // Middle-mouse panning
  const [panning, setPanning] = useState<{ startX: number; startY: number; origPan: { x: number; y: number } } | null>(null);

  // toCanvas: screen → canvas coordinates
  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.panOffset.x) / state.zoom,
      y: (clientY - rect.top  - state.panOffset.y) / state.zoom,
    };
  }, [state.zoom, state.panOffset]);

  // ---- Canvas background click: place component or clear selection ----
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    const isBackground = target === svgRef.current || target.classList.contains('canvas-bg');
    if (!isBackground) return;

    const { x, y } = toCanvas(e.clientX, e.clientY);

    // Right click (button 2) to start pan/drag
    if (e.button === 2) {
      e.preventDefault();
      setPanning({ startX: e.clientX, startY: e.clientY, origPan: { ...state.panOffset } });
      return;
    }

    const tool = state.activeTool;

    if (tool === 'SELECT') { dispatch({ type: 'CLEAR_SELECTED' }); return; }
    if (tool === 'WIRE' || tool === 'DELETE') return;

    // Place component
    const compType = tool as ComponentType;
    const sx = snap(x - COMP_W / 2);
    const sy = snap(y - COMP_H / 2);
    const newId = genId(compType + '_');
    const newComp: Component = {
      id: newId,
      type: compType,
      value: DEFAULT_VALUE[compType] ?? 1,
      position: { x: sx, y: sy },
      rotation: 0,
      label: '',
      pins: PIN_OFFSETS[compType]?.map((_o, i) => ({
        id: `${newId}-pin${i}`,
        nodeId: genId('node_'),
      })) ?? [],
    };
    dispatch({ type: 'ADD_COMPONENT', component: newComp });
  }, [state.activeTool, state.panOffset, toCanvas, dispatch]);

  // ---- Pin circle click: start/finish wire ----
  const handlePinPointerDown = useCallback((
    e: React.PointerEvent,
    comp: Component,
    pinIndex: number,
  ) => {
    if (e.button === 2) return; // Right-click bypasses pin connect to allow panning
    if (state.activeTool !== 'WIRE') return;
    e.stopPropagation();
    const pin = comp.pins[pinIndex];
    const pos = getPinWorldPos(comp, pinIndex);
    setDrawingWire({
      startPinId: pin.id,
      startX: pos.x, startY: pos.y,
      currentX: pos.x, currentY: pos.y,
      snapTarget: null,
    });
  }, [state.activeTool]);

  const handlePinPointerUp = useCallback((
    e: React.PointerEvent,
    comp: Component,
    pinIndex: number,
  ) => {
    if (!drawingWire || state.activeTool !== 'WIRE') return;
    e.stopPropagation();
    const endPin = comp.pins[pinIndex];
    if (endPin.id === drawingWire.startPinId) { setDrawingWire(null); return; }
    const endPos = getPinWorldPos(comp, pinIndex);
    const newWire: Wire = {
      id: genId('wire_'),
      startPinId: drawingWire.startPinId,
      endPinId: endPin.id,
      path: buildWirePath(drawingWire.startX, drawingWire.startY, endPos.x, endPos.y, state.wiringMode),
      routingMode: state.wiringMode,
    };
    dispatch({ type: 'ADD_WIRE', wire: newWire });
    setDrawingWire(null);
  }, [drawingWire, state.activeTool, state.wiringMode, dispatch]);

  // ---- Component body click: select / delete / drag ----
  const handleComponentPointerDown = useCallback((e: React.PointerEvent, compId: string) => {
    if (e.button === 2) return; // Right-click bypasses component drag to allow panning
    e.stopPropagation();
    const comp = state.topology.components.find(c => c.id === compId);
    if (!comp) return;

    if (state.activeTool === 'DELETE') {
      dispatch({ type: 'REMOVE_COMPONENT', id: compId });
      return;
    }
    if (state.activeTool === 'SELECT') {
      dispatch({ type: 'SET_SELECTED', ids: [compId] });
      const { x, y } = toCanvas(e.clientX, e.clientY);
      setDragging({ id: compId, offsetX: x - comp.position.x, offsetY: y - comp.position.y });
    }
  }, [state.activeTool, state.topology.components, toCanvas, dispatch]);

  // ---- Pointer move: drag / wire preview / pan ----
  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const { x, y } = toCanvas(e.clientX, e.clientY);

    if (panning) {
      dispatch({
        type: 'SET_PAN',
        offset: {
          x: panning.origPan.x + (e.clientX - panning.startX),
          y: panning.origPan.y + (e.clientY - panning.startY),
        },
      });
      return;
    }

    if (dragging) {
      dispatch({
        type: 'UPDATE_COMPONENT',
        id: dragging.id,
        patch: { position: { x: snap(x - dragging.offsetX), y: snap(y - dragging.offsetY) } },
      });
      return;
    }

    if (drawingWire) {
      const nearest = findNearestPin(state.topology.components, x, y, drawingWire.startPinId);
      setDrawingWire(prev => prev ? {
        ...prev,
        currentX: nearest ? nearest.x : snap(x),
        currentY: nearest ? nearest.y : snap(y),
        snapTarget: nearest,
      } : null);
    }
  }, [panning, dragging, drawingWire, state.topology.components, toCanvas, dispatch]);

  const handlePointerUp = useCallback((_e: React.PointerEvent<SVGSVGElement>) => {
    if (panning) { setPanning(null); return; }
    setDragging(null);

    // If wire drawing, try to snap to nearest pin under cursor
    if (drawingWire && drawingWire.snapTarget) {
      const endPin = drawingWire.snapTarget;
      const newWire: Wire = {
        id: genId('wire_'),
        startPinId: drawingWire.startPinId,
        endPinId: endPin.pinId,
        path: buildWirePath(drawingWire.startX, drawingWire.startY, endPin.x, endPin.y, state.wiringMode),
        routingMode: state.wiringMode,
      };
      dispatch({ type: 'ADD_WIRE', wire: newWire });
    }
    if (drawingWire) setDrawingWire(null);
  }, [panning, drawingWire, state.wiringMode, dispatch]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // don't fire inside inputs

      if (e.key === 'Escape') {
        dispatch({ type: 'SET_TOOL', tool: 'SELECT' });
        setDrawingWire(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.repeat) {
        state.selectedIds.forEach(id => {
          if (state.topology.components.some(c => c.id === id)) {
            dispatch({ type: 'REMOVE_COMPONENT', id });
          } else {
            dispatch({ type: 'REMOVE_WIRE', id });
          }
        });
        dispatch({ type: 'CLEAR_SELECTED' });
      }
      if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
        state.selectedIds.forEach(id => {
          const comp = state.topology.components.find(c => c.id === id);
          if (comp) {
            const newRot = ((comp.rotation + 90) % 360) as 0 | 90 | 180 | 270;
            dispatch({ type: 'UPDATE_COMPONENT', id, patch: { rotation: newRot } });
          }
        });
      }
      // Tool shortcuts
      const toolMap: Record<string, string> = {
        's': 'SELECT', 'w': 'WIRE', 'r': 'R',
        'g': 'GROUND', 'd': 'DELETE',
      };
      if (toolMap[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) {
        dispatch({ type: 'SET_TOOL', tool: toolMap[e.key.toLowerCase()] as any });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.selectedIds, state.topology.components, dispatch]);

  // ---- Wheel zoom (centered on cursor) ----
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = Math.max(0.2, Math.min(5, state.zoom * factor));
    // Zoom toward cursor
    const rect = svgRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    dispatch({ type: 'SET_PAN', offset: {
      x: cx - (cx - state.panOffset.x) * (newZoom / state.zoom),
      y: cy - (cy - state.panOffset.y) * (newZoom / state.zoom),
    }});
    dispatch({ type: 'SET_ZOOM', zoom: newZoom });
  }, [state.zoom, state.panOffset, dispatch]);

  const { components, wires } = state.topology;
  const transform = `translate(${state.panOffset.x}, ${state.panOffset.y}) scale(${state.zoom})`;

  // ---- Build a lookup: pinId → world pos (for wire rendering) ----
  const pinPosCache = new Map<string, { x: number; y: number }>();
  components.forEach(comp => {
    comp.pins.forEach((pin, i) => {
      pinPosCache.set(pin.id, getPinWorldPos(comp, i));
    });
  });

  return (
    <svg
      ref={svgRef}
      className={`canvas-svg tool-${state.activeTool.toLowerCase()}`}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={e => e.preventDefault()}
      style={{ touchAction: 'none' }}
    >
      <g transform={transform}>
        {/* Background hit-target */}
        <rect className="canvas-bg" x="-9999" y="-9999" width="19998" height="19998" fill="transparent" />

        {/* ---- Wires ---- */}
        {wires.map(wire => {
          const isSelected = state.selectedIds.has(wire.id);
          // Re-compute path endpoints from current pin positions
          const sp = pinPosCache.get(wire.startPinId);
          const ep = pinPosCache.get(wire.endPinId);
          let pts = wire.path;
          if (sp && ep) {
            pts = buildWirePath(sp.x, sp.y, ep.x, ep.y, wire.routingMode || 'orthogonal');
          }
          const points = pts.map(p => `${p.x},${p.y}`).join(' ');
          return (
            <polyline
              key={wire.id}
              points={points}
              className={`wire-path ${isSelected ? 'selected' : ''}`}
              onPointerDown={_e => {
                if (state.activeTool === 'DELETE') {
                  _e.stopPropagation();
                  dispatch({ type: 'REMOVE_WIRE', id: wire.id });
                } else if (state.activeTool === 'SELECT') {
                  _e.stopPropagation();
                  dispatch({ type: 'SET_SELECTED', ids: [wire.id] });
                }
              }}
            />
          );
        })}

        {/* ---- Components ---- */}
        {components.map(comp => (
          <g key={comp.id} onPointerDown={e => handleComponentPointerDown(e, comp.id)}>
            <ComponentSymbol
              x={comp.position.x} y={comp.position.y}
              rotation={comp.rotation}
              selected={state.selectedIds.has(comp.id)}
              id={comp.id}
              label={comp.label || comp.id}
              value={comp.value}
              type={comp.type}
            />

            {/* Pin circles — wire connect targets */}
            {comp.pins.map((pin, i) => {
              const pos = getPinWorldPos(comp, i);
              const isSnapping = drawingWire?.snapTarget?.pinId === pin.id;
              return (
                <circle
                  key={pin.id}
                  cx={pos.x} cy={pos.y}
                  r={isSnapping ? 6 : 4}
                  className="node-dot"
                  style={{
                    cursor: state.activeTool === 'WIRE' ? 'crosshair' : 'default',
                    fill: isSnapping ? 'var(--status-success)' : undefined,
                    transition: 'r 80ms ease, fill 80ms ease',
                  }}
                  onPointerDown={e => handlePinPointerDown(e, comp, i)}
                  onPointerUp={e => handlePinPointerUp(e, comp, i)}
                />
              );
            })}

            {/* ---- Solver result overlays ---- */}
            {state.solverResult?.success && comp.pins.map((pin, i) => {
              const v = state.solverResult!.nodeVoltages[pin.nodeId];
              if (!v) return null;
              const mag = Math.sqrt(v.re ** 2 + v.im ** 2);
              if (mag < 1e-10) return null; // skip GND
              const pos = getPinWorldPos(comp, i);
              const phaseStr = v.im !== 0
                ? `∠${(Math.atan2(v.im, v.re) * 180 / Math.PI).toFixed(1)}°`
                : '';
              return (
                <g key={`voverlay-${pin.id}`}>
                  {/* Tiny badge background */}
                  <rect
                    x={pos.x + 5} y={pos.y - 16}
                    width={phaseStr ? 78 : 44} height={14}
                    rx={3} ry={3}
                    fill="var(--status-success)"
                    opacity={0.15}
                  />
                  <text
                    x={pos.x + 7} y={pos.y - 5}
                    className="voltage-label"
                  >
                    {mag.toFixed(3)}V{phaseStr}
                  </text>
                </g>
              );
            })}

            {/* Branch current label (below component) */}
            {state.solverResult?.success && (() => {
              const I = state.solverResult!.branchCurrents[comp.id];
              if (!I) return null;
              const imag = Math.sqrt(I.re ** 2 + I.im ** 2);
              if (imag < 1e-15) return null;
              const cx = comp.position.x + COMP_W / 2;
              const cy = comp.position.y + COMP_H + 26;
              const txt = imag >= 1
                ? `${imag.toFixed(3)}A`
                : imag >= 1e-3
                ? `${(imag * 1e3).toFixed(3)}mA`
                : `${(imag * 1e6).toFixed(3)}μA`;
              return (
                <text
                  key={`ilabel-${comp.id}`}
                  x={cx} y={cy}
                  textAnchor="middle"
                  style={{
                    fill: 'var(--status-warning)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    fontWeight: 600,
                    pointerEvents: 'none',
                  }}
                >
                  I={txt}
                </text>
              );
            })()}
          </g>
        ))}

        {/* ---- Live wire being drawn ---- */}
        {drawingWire && (() => {
          const pts = buildWirePath(
            drawingWire.startX, drawingWire.startY,
            drawingWire.currentX, drawingWire.currentY,
            state.wiringMode,
          );
          const points = pts.map(p => `${p.x},${p.y}`).join(' ');
          return (
            <polyline
              points={points}
              stroke={drawingWire.snapTarget ? 'var(--status-success)' : 'var(--text-secondary)'}
              strokeWidth="1.5"
              strokeDasharray="6 3"
              strokeLinecap="round"
              fill="none"
              style={{ pointerEvents: 'none' }}
            />
          );
        })()}
      </g>
    </svg>
  );
};

export default CanvasEditor;
