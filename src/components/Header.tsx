import React from 'react';
import { Sun, Moon, Play, Loader, Cpu, Languages } from 'lucide-react';
import { useCircuit } from '../store/circuitStore';
import { translations } from '../store/translations';
import type { AnalysisType } from '../types/circuit';

interface HeaderProps {
  onRun: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onRun }) => {
  const { state, dispatch } = useCircuit();
  const t = translations[state.language];

  const toggleTheme = () => {
    dispatch({ type: 'SET_THEME', theme: state.theme === 'light' ? 'dark' : 'light' });
  };

  const toggleLanguage = () => {
    dispatch({ type: 'SET_LANGUAGE', language: state.language === 'zh' ? 'en' : 'zh' });
  };

  const hasComponents = state.topology.components.length > 0;

  return (
    <header className="header">
      {/* Brand */}
      <div className="header__brand">
        <Cpu size={18} strokeWidth={1.5} className="header__logo" />
        <span className="header__title">{t.title}</span>
        <span className="header__subtitle">{t.subtitle}</span>
      </div>

      {/* Center: Analysis Mode Selector */}
      <div className="analysis-mode-group" role="group" aria-label="Analysis type">
        {(['DC', 'AC'] as AnalysisType[]).map(type => (
          <button
            key={type}
            className={`analysis-mode-btn ${state.analysisType === type ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ANALYSIS_TYPE', analysisType: type })}
            aria-pressed={state.analysisType === type}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Right Controls */}
      <div className="header__controls">
        {/* Solver status indicator */}
        {state.solverResult && (
          <span
            className={`status-dot ${state.solverResult.success ? 'success' : 'error'}`}
            title={state.solverResult.success ? 'Simulation OK' : 'Simulation Error'}
            style={{ marginRight: 6 }}
          />
        )}

        {/* Component count */}
        <span style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-tertiary)',
          marginRight: 8,
          fontFamily: 'var(--font-mono)',
        }}>
          {state.topology.components.length} {t.components}
        </span>

        {/* Language toggle */}
        <button
          className="icon-btn"
          onClick={toggleLanguage}
          title={state.language === 'zh' ? 'Switch to English' : '切换为中文'}
          aria-label="Toggle language"
          style={{ marginRight: 4 }}
        >
          <Languages size={15} strokeWidth={1.5} />
        </button>

        {/* Theme toggle */}
        <button
          className="icon-btn"
          onClick={toggleTheme}
          title={state.theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          aria-label="Toggle theme"
        >
          {state.theme === 'light'
            ? <Moon size={15} strokeWidth={1.5} />
            : <Sun size={15} strokeWidth={1.5} />
          }
        </button>

        {/* Run Simulation Button */}
        <button
          id="run-simulation-btn"
          className={`run-btn ${state.isSimulating ? 'simulating' : ''}`}
          onClick={onRun}
          disabled={!hasComponents || state.isSimulating}
          aria-label="Run simulation"
        >
          {state.isSimulating
            ? <Loader size={14} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
            : <Play size={14} strokeWidth={1.5} />
          }
          {state.isSimulating ? t.solving : t.run}
        </button>
      </div>

      {/* Keyframe for spinner (inline so it's scoped) */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  );
};

export default Header;
