// ============================================================
// Sidebar.tsx - Right Analysis Panel with Tabs
// Shows: Properties, DC Results, Phasors, Settings
// ============================================================

import React, { useState } from 'react';
import { Cpu, BarChart2, Zap, Settings, RotateCw } from 'lucide-react';
import { useCircuit } from '../store/circuitStore';
import { translations } from '../store/translations';
import { PhasorDiagram } from './PhasorDiagram';
import type { AnalysisType } from '../types/circuit';

type SidebarTab = 'properties' | 'results' | 'phasors' | 'settings';

// Helper: format complex value for display
function formatComplex(re: number, im: number, unit: string): string {
  const mag = Math.sqrt(re * re + im * im);
  if (Math.abs(im) < 1e-9) return `${re.toFixed(4)} ${unit}`;
  const phase = (Math.atan2(im, re) * 180) / Math.PI;
  return `${mag.toFixed(4)}∠${phase.toFixed(1)}° ${unit}`;
}

// ---- Properties Panel ----
const PropertiesPanel: React.FC = () => {
  const { state, dispatch } = useCircuit();
  const t = translations[state.language];
  const selectedId = Array.from(state.selectedIds)[0];
  const comp = selectedId
    ? state.topology.components.find(c => c.id === selectedId)
    : null;

  if (!comp) {
    return (
      <div className="empty-state">
        <Cpu size={32} className="empty-state__icon" />
        <p className="empty-state__title">{t.noSelection}</p>
        <p className="empty-state__desc">{t.noSelectionDesc}</p>
      </div>
    );
  }

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      dispatch({ type: 'UPDATE_COMPONENT', id: comp.id, patch: { value: val } });
    }
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'UPDATE_COMPONENT', id: comp.id, patch: { label: e.target.value } });
  };

  return (
    <div>
      <div className="prop-card">
        <div className="prop-card__title">{t.component}</div>
        <div className="prop-row">
          <span className="prop-row__label">{t.type}</span>
          <span className="prop-row__value">{comp.type}</span>
        </div>
        <div className="prop-row">
          <span className="prop-row__label">ID</span>
          <span className="prop-row__value">{comp.id}</span>
        </div>
        <div className="prop-row">
          <span className="prop-row__label">{t.rotation}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="prop-row__value">{comp.rotation}°</span>
            <button
              className="icon-btn"
              onClick={() => {
                const newRot = ((comp.rotation + 90) % 360) as 0 | 90 | 180 | 270;
                dispatch({ type: 'UPDATE_COMPONENT', id: comp.id, patch: { rotation: newRot } });
              }}
              title={state.language === 'zh' ? '旋转 90° (快捷键 R)' : 'Rotate 90° (Shortcut R)'}
              style={{ width: '24px', height: '24px', padding: 0 }}
            >
              <RotateCw size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="prop-card">
        <div className="prop-card__title">{t.parameters}</div>
        <div className="field-group">
          <label className="field-label">{t.label}</label>
          <input
            className="field-input"
            type="text"
            value={comp.label ?? comp.id}
            onChange={handleLabelChange}
            placeholder={comp.id}
          />
        </div>
        <div className="field-group">
          <label className="field-label">{t.value}</label>
          <input
            className="field-input"
            type="number"
            step="any"
            value={comp.value}
            onChange={handleValueChange}
          />
        </div>
        {(comp.type === 'V_AC' || comp.type === 'I_AC') && (
          <div className="field-group">
            <label className="field-label">{t.phase}</label>
            <input
              className="field-input"
              type="number"
              step="1"
              value={comp.phase ?? 0}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) dispatch({ type: 'UPDATE_COMPONENT', id: comp.id, patch: { phase: v } });
              }}
            />
          </div>
        )}
      </div>

      <div className="prop-card">
        <div className="prop-card__title">{t.nodes}</div>
        {comp.pins.map((pin, i) => (
          <div className="prop-row" key={pin.id}>
            <span className="prop-row__label">Pin {i}</span>
            <span className="prop-row__value" style={{ fontSize: '10px' }}>{pin.nodeId}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---- Results Panel ----
const ResultsPanel: React.FC = () => {
  const { state } = useCircuit();
  const t = translations[state.language];
  const result = state.solverResult;

  if (!result) {
    return (
      <div className="empty-state">
        <BarChart2 size={32} className="empty-state__icon" />
        <p className="empty-state__title">{t.noSimData}</p>
        <p className="empty-state__desc">{t.noSimDataDesc}</p>
      </div>
    );
  }

  if (!result.success) {
    return (
      <div className="prop-card" style={{ borderColor: 'var(--status-error)' }}>
        <div className="prop-card__title" style={{ color: 'var(--status-error)' }}>Simulation Error</div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {result.error ?? 'Unknown error occurred.'}
        </p>
      </div>
    );
  }

  const nodeIds = Object.keys(result.nodeVoltages);
  const branchIds = Object.keys(result.branchCurrents);

  return (
    <div>
      <div className="prop-card">
        <div className="prop-card__title">{t.nodeVoltages}</div>
        {nodeIds.length === 0 && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>No nodes found.</p>
        )}
        {nodeIds.map(nodeId => {
          const v = result.nodeVoltages[nodeId];
          return (
            <div className="prop-row" key={nodeId}>
              <span className="prop-row__label" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                {nodeId}
              </span>
              <span className="result-value">{formatComplex(v.re, v.im, 'V')}</span>
            </div>
          );
        })}
      </div>

      <div className="prop-card">
        <div className="prop-card__title">{t.branchCurrents}</div>
        {branchIds.length === 0 && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>No branches found.</p>
        )}
        {branchIds.map(branchId => {
          const i = result.branchCurrents[branchId];
          return (
            <div className="prop-row" key={branchId}>
              <span className="prop-row__label">I({branchId})</span>
              <span className="result-value">{formatComplex(i.re, i.im, 'A')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---- Settings Panel ----
const SettingsPanel: React.FC = () => {
  const { state, dispatch } = useCircuit();
  const t = translations[state.language];

  return (
    <div>
      <div className="prop-card">
        <div className="prop-card__title">{t.analysisSettings}</div>
        <div className="field-group">
          <label className="field-label">{t.analysisType}</label>
          <div className="analysis-mode-group" style={{ borderRadius: 'var(--radius-sm)', padding: '2px' }}>
            {(['DC', 'AC'] as AnalysisType[]).map(type => (
              <button
                key={type}
                className={`analysis-mode-btn ${state.analysisType === type ? 'active' : ''}`}
                style={{ flex: 1, borderRadius: 'var(--radius-sm)' }}
                onClick={() => dispatch({ type: 'SET_ANALYSIS_TYPE', analysisType: type })}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {state.analysisType === 'AC' && (
          <div className="field-group">
            <label className="field-label">{t.frequency}</label>
            <input
              className="field-input"
              type="number"
              min="0.001"
              step="1"
              value={state.frequency}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (v > 0) dispatch({ type: 'SET_FREQUENCY', frequency: v });
              }}
            />
          </div>
        )}
      </div>

      <div className="prop-card">
        <div className="prop-card__title">Canvas</div>
        <div className="prop-row">
          <span className="prop-row__label">{t.grid}</span>
          <button
            className={`icon-btn ${state.showGrid ? 'active' : ''}`}
            style={{ width: 'auto', padding: '2px 10px', borderRadius: 'var(--radius-sm)' }}
            onClick={() => dispatch({ type: 'TOGGLE_GRID' })}
          >
            {state.showGrid ? 'On' : 'Off'}
          </button>
        </div>

        {/* Wiring Mode control */}
        <div className="field-group" style={{ marginTop: '12px', marginBottom: '4px' }}>
          <label className="field-label">{t.wiringMode}</label>
          <div className="analysis-mode-group" style={{ borderRadius: 'var(--radius-sm)', padding: '2px' }}>
            <button
              className={`analysis-mode-btn ${state.wiringMode === 'orthogonal' ? 'active' : ''}`}
              style={{ flex: 1, borderRadius: 'var(--radius-sm)' }}
              onClick={() => dispatch({ type: 'SET_WIRING_MODE', mode: 'orthogonal' })}
            >
              {t.orthogonal}
            </button>
            <button
              className={`analysis-mode-btn ${state.wiringMode === 'direct' ? 'active' : ''}`}
              style={{ flex: 1, borderRadius: 'var(--radius-sm)' }}
              onClick={() => dispatch({ type: 'SET_WIRING_MODE', mode: 'direct' })}
            >
              {t.direct}
            </button>
          </div>
        </div>

        <div className="prop-row" style={{ marginTop: '12px' }}>
          <span className="prop-row__label">Zoom</span>
          <span className="result-value">{Math.round(state.zoom * 100)}%</span>
        </div>
      </div>

      <div className="prop-card">
        <div className="prop-card__title">{t.dangerZone}</div>
        <button
          onClick={() => {
            if (window.confirm(t.clearConfirm)) {
              dispatch({ type: 'CLEAR_CIRCUIT' });
            }
          }}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--status-error)',
            background: 'transparent',
            color: 'var(--status-error)',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            transition: 'all var(--duration-fast)',
          }}
        >
          {t.clearCircuit}
        </button>
      </div>
    </div>
  );
};

// ---- Main Sidebar ----
export const Sidebar: React.FC = () => {
  const { state } = useCircuit();
  const t = translations[state.language];
  const [activeTab, setActiveTab] = useState<SidebarTab>('properties');

  const tabs: { id: SidebarTab; label: string; icon: React.ReactNode }[] = [
    { id: 'properties', label: t.props, icon: <Settings size={12} /> },
    { id: 'results',    label: t.results, icon: <BarChart2 size={12} /> },
    { id: 'phasors',   label: t.phasor, icon: <Zap size={12} /> },
    { id: 'settings',  label: t.config, icon: <Cpu size={12} /> },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar__tabs" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`sidebar__tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="sidebar__content" role="tabpanel">
        {activeTab === 'properties' && <PropertiesPanel />}
        {activeTab === 'results' && <ResultsPanel />}
        {activeTab === 'phasors' && <PhasorDiagram />}
        {activeTab === 'settings' && <SettingsPanel />}
      </div>
    </aside>
  );
};

export default Sidebar;
