// ============================================================
// Toolbar.tsx - Floating Bottom Dock Component Picker
// Apple macOS Dock inspired: glassmorphism, hover scale animation
// ============================================================

import React from 'react';
import {
  MousePointer2, Minus, Zap, Circle, Wind,
  Trash2, Grid3x3, ToggleLeft, ZoomIn, ZoomOut,
  Activity
} from 'lucide-react';
import { useCircuit } from '../store/circuitStore';
import { translations } from '../store/translations';
import type { EditorTool } from '../types/circuit';

interface DockItem {
  tool: EditorTool;
  labelKey: 'select' | 'wire' | 'delete' | 'R' | 'C' | 'L' | 'V_DC' | 'V_AC' | 'I_DC' | 'I_AC' | 'GROUND';
  tooltipKey: 'select' | 'wire' | 'delete' | 'R' | 'C' | 'L' | 'V_DC' | 'V_AC' | 'I_DC' | 'I_AC' | 'GROUND';
  icon: React.ReactNode;
}

const PRIMARY_TOOLS: DockItem[] = [
  {
    tool: 'SELECT',
    labelKey: 'select',
    tooltipKey: 'select',
    icon: <MousePointer2 size={18} strokeWidth={1.5} />,
  },
  {
    tool: 'WIRE',
    labelKey: 'wire',
    tooltipKey: 'wire',
    icon: <Minus size={18} strokeWidth={1.5} />,
  },
];

const COMPONENT_TOOLS: DockItem[] = [
  {
    tool: 'R',
    labelKey: 'R',
    tooltipKey: 'R',
    icon: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>R</span>,
  },
  {
    tool: 'C',
    labelKey: 'C',
    tooltipKey: 'C',
    icon: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>C</span>,
  },
  {
    tool: 'L',
    labelKey: 'L',
    tooltipKey: 'L',
    icon: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>L</span>,
  },
  {
    tool: 'V_DC',
    labelKey: 'GROUND', // just dummy, we display static text or custom text
    tooltipKey: 'V_DC',
    icon: <Zap size={16} strokeWidth={1.5} />,
  },
  {
    tool: 'V_AC',
    labelKey: 'GROUND',
    tooltipKey: 'V_AC',
    icon: <Activity size={16} strokeWidth={1.5} />,
  },
  {
    tool: 'I_DC',
    labelKey: 'GROUND',
    tooltipKey: 'I_DC',
    icon: <Circle size={16} strokeWidth={1.5} />,
  },
  {
    tool: 'I_AC',
    labelKey: 'GROUND',
    tooltipKey: 'I_AC',
    icon: <Wind size={16} strokeWidth={1.5} />,
  },
  {
    tool: 'GROUND',
    labelKey: 'GROUND',
    tooltipKey: 'GROUND',
    icon: <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600 }}>GND</span>,
  },
];

const ACTION_TOOLS: DockItem[] = [
  {
    tool: 'DELETE',
    labelKey: 'delete',
    tooltipKey: 'delete',
    icon: <Trash2 size={16} strokeWidth={1.5} />,
  },
];

export const Toolbar: React.FC = () => {
  const { state, dispatch } = useCircuit();
  const t = translations[state.language];

  // Tool labels and tooltips in translation
  const getToolStrings = (item: DockItem) => {
    switch (item.tool) {
      case 'SELECT':
        return { label: t.select, tooltip: `${t.select} & Move (S)` };
      case 'WIRE':
        return { label: t.wire, tooltip: `${t.wire} (W)` };
      case 'DELETE':
        return { label: t.delete, tooltip: `${t.delete} (D)` };
      case 'R':
        return { label: 'R', tooltip: state.language === 'zh' ? '电阻 (R)' : 'Resistor (R)' };
      case 'C':
        return { label: 'C', tooltip: state.language === 'zh' ? '电容 (C)' : 'Capacitor (C)' };
      case 'L':
        return { label: 'L', tooltip: state.language === 'zh' ? '电感 (L)' : 'Inductor (L)' };
      case 'V_DC':
        return { label: 'Vdc', tooltip: state.language === 'zh' ? '直流电压源' : 'DC Voltage Source' };
      case 'V_AC':
        return { label: 'Vac', tooltip: state.language === 'zh' ? '交流电压源' : 'AC Voltage Source' };
      case 'I_DC':
        return { label: 'Idc', tooltip: state.language === 'zh' ? '直流电流源' : 'DC Current Source' };
      case 'I_AC':
        return { label: 'Iac', tooltip: state.language === 'zh' ? '交流电流源' : 'AC Current Source' };
      case 'GROUND':
        return { label: 'GND', tooltip: state.language === 'zh' ? '接地 (G)' : 'Ground (G)' };
      default:
        return { label: '', tooltip: '' };
    }
  };

  const setTool = (tool: EditorTool) => dispatch({ type: 'SET_TOOL', tool });

  const renderBtn = (item: DockItem) => {
    const info = getToolStrings(item);
    return (
      <button
        key={item.tool}
        className={`dock-btn ${state.activeTool === item.tool ? 'active' : ''}`}
        data-tooltip={info.tooltip}
        onClick={() => setTool(item.tool)}
        title={info.tooltip}
      >
        {item.icon}
        <span className="dock-btn__label">{info.label}</span>
      </button>
    );
  };

  return (
    <div className="dock" role="toolbar" aria-label="Circuit editor tools">
      {/* Primary tools */}
      {PRIMARY_TOOLS.map(renderBtn)}

      <div className="dock-separator" />

      {/* Component tools */}
      {COMPONENT_TOOLS.map(renderBtn)}

      <div className="dock-separator" />

      {/* Utility tools */}
      {ACTION_TOOLS.map(renderBtn)}

      <div className="dock-separator" />

      {/* Grid toggle */}
      <button
        className={`dock-btn ${state.showGrid ? 'active' : ''}`}
        data-tooltip={state.language === 'zh' ? '切换网格显示' : 'Toggle Grid'}
        onClick={() => dispatch({ type: 'TOGGLE_GRID' })}
        title={state.language === 'zh' ? '切换网格显示' : 'Toggle Grid'}
      >
        <Grid3x3 size={16} strokeWidth={1.5} />
        <span className="dock-btn__label">{t.grid}</span>
      </button>

      {/* Zoom controls */}
      <button
        className="dock-btn"
        data-tooltip={t.zoomIn}
        onClick={() => dispatch({ type: 'SET_ZOOM', zoom: state.zoom * 1.2 })}
        title={t.zoomIn}
      >
        <ZoomIn size={16} strokeWidth={1.5} />
        <span className="dock-btn__label">{state.language === 'zh' ? '放大' : 'In'}</span>
      </button>

      <button
        className="dock-btn"
        data-tooltip={t.zoomOut}
        onClick={() => dispatch({ type: 'SET_ZOOM', zoom: state.zoom * 0.8 })}
        title={t.zoomOut}
      >
        <ZoomOut size={16} strokeWidth={1.5} />
        <span className="dock-btn__label">{state.language === 'zh' ? '缩小' : 'Out'}</span>
      </button>

      {/* Reset zoom */}
      <button
        className="dock-btn"
        data-tooltip={state.language === 'zh' ? '恢复默认大小 (100%)' : 'Reset View (100%)'}
        onClick={() => {
          dispatch({ type: 'SET_ZOOM', zoom: 1 });
          dispatch({ type: 'SET_PAN', offset: { x: 0, y: 0 } });
        }}
        title={state.language === 'zh' ? '恢复默认大小 (100%)' : 'Reset View (100%)'}
      >
        <ToggleLeft size={16} strokeWidth={1.5} />
        <span className="dock-btn__label">{t.reset}</span>
      </button>
    </div>
  );
};

export default Toolbar;
