// ============================================================
// App.tsx - Root Application Component
// Assembles Header, CanvasEditor, Sidebar, Toolbar
// Handles theme application and simulation orchestration
// ============================================================

import React, { useEffect, useCallback } from 'react';
import { CircuitProvider, useCircuit } from './store/circuitStore';
import { Header } from './components/Header';
import { CanvasEditor } from './components/CanvasEditor';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { runSimulation } from './solver/solverBridge';

// Inner app component (needs access to circuit context)
const AppInner: React.FC = () => {
  const { state, dispatch } = useCircuit();

  // Apply theme to document root for CSS variable switching
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    // Brief transition class for smooth theme animation
    document.body.classList.add('theme-transition');
    const timer = setTimeout(() => document.body.classList.remove('theme-transition'), 600);
    return () => clearTimeout(timer);
  }, [state.theme]);

  // Run simulation handler
  const handleRun = useCallback(async () => {
    if (state.topology.components.length === 0) return;

    dispatch({ type: 'SET_SIMULATING', isSimulating: true });
    dispatch({ type: 'SET_SOLVER_RESULT', result: null });

    // Slight async delay so UI updates before heavy computation
    await new Promise(r => setTimeout(r, 50));

    try {
      const result = runSimulation(
        state.topology.components,
        state.topology.wires,
        state.analysisType === 'DC' ? 0 : state.frequency,
      );
      dispatch({ type: 'SET_SOLVER_RESULT', result });
    } catch (err) {
      dispatch({
        type: 'SET_SOLVER_RESULT',
        result: {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown solver error',
          nodeVoltages: {},
          branchCurrents: {},
        },
      });
    } finally {
      dispatch({ type: 'SET_SIMULATING', isSimulating: false });
    }
  }, [state.topology.components, state.frequency, dispatch]);

  return (
    <div className="app-shell">
      <Header onRun={handleRun} />

      <main
        className={`canvas-area ${state.showGrid ? '' : 'grid-hidden'}`}
        role="main"
        aria-label="Circuit canvas"
      >
        <CanvasEditor />
        <Toolbar />
      </main>

      <Sidebar />
    </div>
  );
};

// Root App — wraps with provider
const App: React.FC = () => (
  <CircuitProvider>
    <AppInner />
  </CircuitProvider>
);

export default App;
