// ============================================================
// componentSymbols.tsx - SVG Symbol Renderers for Circuit Components
// All symbols follow IEEE/IEC schematic standard simplified forms
// ============================================================

import React from 'react';
import type { ComponentType } from '../types/circuit';

interface SymbolProps {
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  selected?: boolean;
  id: string;
  label?: string;
  value?: number;
  type: ComponentType;
}

// --- Utility: format a numeric value nicely for display ---
function formatValue(type: ComponentType, value: number): string {
  switch (type) {
    case 'R': {
      if (value >= 1e6) return `${(value / 1e6).toFixed(1)}MΩ`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)}kΩ`;
      return `${value}Ω`;
    }
    case 'C': {
      if (value >= 1e-3) return `${(value * 1e3).toFixed(1)}mF`;
      if (value >= 1e-6) return `${(value * 1e6).toFixed(1)}μF`;
      if (value >= 1e-9) return `${(value * 1e9).toFixed(1)}nF`;
      return `${(value * 1e12).toFixed(1)}pF`;
    }
    case 'L': {
      if (value >= 1) return `${value.toFixed(1)}H`;
      if (value >= 1e-3) return `${(value * 1e3).toFixed(1)}mH`;
      return `${(value * 1e6).toFixed(1)}μH`;
    }
    case 'V_DC':
    case 'V_AC': return `${value}V`;
    case 'I_DC':
    case 'I_AC': return `${value}A`;
    default: return `${value}`;
  }
}

// --- Component size constants (all in SVG units) ---
// Each component is drawn within a 60×60 bounding box
// Pins are always at specific positions on the boundary
export const COMP_W = 60;
export const COMP_H = 60;

// Pin offsets from component's (x,y) center-top-left
// Default orientation: vertical (top pin = [30, 0], bottom pin = [30, 60])
export const PIN_OFFSETS: Record<ComponentType, { x: number; y: number }[]> = {
  R:      [{ x: 30, y: 0 }, { x: 30, y: 60 }],
  C:      [{ x: 30, y: 0 }, { x: 30, y: 60 }],
  L:      [{ x: 30, y: 0 }, { x: 30, y: 60 }],
  V_DC:   [{ x: 30, y: 0 }, { x: 30, y: 60 }],
  I_DC:   [{ x: 30, y: 0 }, { x: 30, y: 60 }],
  V_AC:   [{ x: 30, y: 0 }, { x: 30, y: 60 }],
  I_AC:   [{ x: 30, y: 0 }, { x: 30, y: 60 }],
  VCVS:   [{ x: 30, y: 0 }, { x: 30, y: 60 }, { x: 0, y: 30 }, { x: 60, y: 30 }],
  VCCS:   [{ x: 30, y: 0 }, { x: 30, y: 60 }, { x: 0, y: 30 }, { x: 60, y: 30 }],
  CCVS:   [{ x: 30, y: 0 }, { x: 30, y: 60 }, { x: 0, y: 30 }, { x: 60, y: 30 }],
  CCCS:   [{ x: 30, y: 0 }, { x: 30, y: 60 }, { x: 0, y: 30 }, { x: 60, y: 30 }],
  OPAMP:  [{ x: 0, y: 15 }, { x: 0, y: 45 }, { x: 60, y: 30 }],
  GROUND: [{ x: 30, y: 0 }],
  WIRE:   [],
};

// --- Individual Symbol Shapes (drawn at 0,0, rotated via transform) ---

const ResistorSymbol: React.FC = () => (
  <>
    <line x1="30" y1="0" x2="30" y2="12" />
    <rect x="18" y="12" width="24" height="36" rx="2" />
    <line x1="30" y1="48" x2="30" y2="60" />
  </>
);

const CapacitorSymbol: React.FC = () => (
  <>
    <line x1="30" y1="0" x2="30" y2="26" />
    <line x1="12" y1="26" x2="48" y2="26" />
    <line x1="12" y1="34" x2="48" y2="34" />
    <line x1="30" y1="34" x2="30" y2="60" />
  </>
);

const InductorSymbol: React.FC = () => (
  <>
    <line x1="30" y1="0" x2="30" y2="12" />
    {/* Arcs representing inductor coils */}
    <path d="M30 12 Q24 12 24 18 Q24 24 30 24 Q36 24 36 30 Q36 36 30 36 Q24 36 24 42 Q24 48 30 48" />
    <line x1="30" y1="48" x2="30" y2="60" />
  </>
);

const VoltageSourceDC: React.FC = () => (
  <>
    <line x1="30" y1="0" x2="30" y2="16" />
    <circle cx="30" cy="30" r="14" />
    {/* Plus mark at top inside circle */}
    <line x1="30" y1="20" x2="30" y2="27" />
    <line x1="26.5" y1="23.5" x2="33.5" y2="23.5" />
    {/* Minus mark at bottom inside circle */}
    <line x1="26.5" y1="37" x2="33.5" y2="37" />
    <line x1="30" y1="44" x2="30" y2="60" />
  </>
);

const VoltageSourceAC: React.FC = () => (
  <>
    <line x1="30" y1="0" x2="30" y2="16" />
    <circle cx="30" cy="30" r="14" />
    {/* Sine wave inside */}
    <path d="M22 30 Q25 24 28 30 Q31 36 34 30 Q37 24 38 30" />
    <line x1="30" y1="44" x2="30" y2="60" />
  </>
);

const CurrentSourceDC: React.FC = () => (
  <>
    <line x1="30" y1="0" x2="30" y2="16" />
    <circle cx="30" cy="30" r="14" />
    {/* Arrow upward */}
    <line x1="30" y1="40" x2="30" y2="22" />
    <polyline points="25,28 30,22 35,28" />
    <line x1="30" y1="44" x2="30" y2="60" />
  </>
);

const CurrentSourceAC: React.FC = () => (
  <>
    <line x1="30" y1="0" x2="30" y2="16" />
    <circle cx="30" cy="30" r="14" />
    <path d="M22 30 Q25 24 28 30 Q31 36 34 30 Q37 24 38 30" />
    <line x1="30" y1="22" x2="30" y2="20" />
    <polyline points="26,24 30,20 34,24" />
    <line x1="30" y1="44" x2="30" y2="60" />
  </>
);

const ControlledSourceSymbol: React.FC<{ type: 'V' | 'I' }> = ({ type }) => (
  <>
    {/* Diamond shape for controlled sources */}
    <polyline points="30,4 56,30 30,56 4,30 30,4" />
    <line x1="30" y1="0" x2="30" y2="4" />
    <line x1="30" y1="56" x2="30" y2="60" />
    <line x1="0" y1="30" x2="4" y2="30" />
    <line x1="56" y1="30" x2="60" y2="30" />
    {type === 'V' ? (
      <>
        <line x1="30" y1="20" x2="30" y2="27" />
        <line x1="26.5" y1="23.5" x2="33.5" y2="23.5" />
        <line x1="26.5" y1="37" x2="33.5" y2="37" />
      </>
    ) : (
      <>
        <line x1="30" y1="40" x2="30" y2="22" />
        <polyline points="25,28 30,22 35,28" />
      </>
    )}
    {/* Control label */}
  </>
);

const OpAmpSymbol: React.FC = () => (
  <>
    {/* Triangle body */}
    <polyline points="4,4 4,56 56,30 4,4" />
    {/* Inverting input (-) at pin 0 (top) */}
    <line x1="0" y1="15" x2="4" y2="15" />
    <line x1="6" y1="15" x2="12" y2="15" />
    <line x1="9" y1="12" x2="9" y2="18" />
    {/* Non-inverting input (+) at pin 1 (bottom) */}
    <line x1="0" y1="45" x2="4" y2="45" />
    <line x1="6" y1="45" x2="12" y2="45" />
    {/* Output at pin 2 (right) */}
    <line x1="56" y1="30" x2="60" y2="30" />
  </>
);

const GroundSymbol: React.FC = () => (
  <>
    <line x1="30" y1="0" x2="30" y2="20" />
    <line x1="14" y1="20" x2="46" y2="20" />
    <line x1="19" y1="26" x2="41" y2="26" />
    <line x1="24" y1="32" x2="36" y2="32" />
  </>
);

// --- Main ComponentSymbol renderer ---
export const ComponentSymbol: React.FC<SymbolProps> = ({
  x, y, rotation, selected, id, label, value, type,
}) => {
  const mainTransform = `translate(${x}, ${y})`;
  const rotateTransform = `rotate(${rotation}, ${COMP_W / 2}, ${COMP_H / 2})`;
  const displayValue = value !== undefined ? formatValue(type, value) : '';
  const displayLabel = label || id;

  const renderShape = () => {
    switch (type) {
      case 'R':     return <ResistorSymbol />;
      case 'C':     return <CapacitorSymbol />;
      case 'L':     return <InductorSymbol />;
      case 'V_DC':  return <VoltageSourceDC />;
      case 'V_AC':  return <VoltageSourceAC />;
      case 'I_DC':  return <CurrentSourceDC />;
      case 'I_AC':  return <CurrentSourceAC />;
      case 'VCVS':
      case 'CCVS':  return <ControlledSourceSymbol type="V" />;
      case 'VCCS':
      case 'CCCS':  return <ControlledSourceSymbol type="I" />;
      case 'OPAMP': return <OpAmpSymbol />;
      case 'GROUND': return <GroundSymbol />;
      default:      return null;
    }
  };

  return (
    <g
      transform={mainTransform}
      className={`component-group ${selected ? 'component-selected' : ''}`}
      data-id={id}
    >
      <g transform={rotateTransform}>
        {/* Invisible hit-box for click selection */}
        <rect
          x="0" y="0"
          width={COMP_W} height={COMP_H}
          className="component-hitbox"
          rx="4"
        />
        {/* Symbol strokes */}
        <g className="component-body">
          {renderShape()}
        </g>
      </g>
      {/* ID label - Kept horizontal */}
      <text
        x={COMP_W / 2}
        y={-6}
        textAnchor="middle"
        className="component-label"
      >
        {displayLabel}
      </text>
      {/* Value label - Kept horizontal */}
      <text
        x={COMP_W / 2}
        y={COMP_H + 14}
        textAnchor="middle"
        className="component-value"
      >
        {displayValue}
      </text>
    </g>

  );
};

export default ComponentSymbol;
