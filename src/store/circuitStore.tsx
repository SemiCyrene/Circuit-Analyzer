// ============================================================
// circuitStore.ts - Global state management for the circuit editor
// Using React Context + useReducer for predictable state updates
// ============================================================

import { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type {
  CircuitTopology,
  Component,
  Wire,
  EditorTool,
  Theme,
  AnalysisType,
  SolverResult,
  Language,
  WiringMode,
} from '../types/circuit';

// ------------------------------------------------------------------
// State Shape
// ------------------------------------------------------------------
export interface CircuitState {
  topology: CircuitTopology;
  selectedIds: Set<string>;
  activeTool: EditorTool;
  theme: Theme;
  language: Language;
  wiringMode: WiringMode;
  analysisType: AnalysisType;
  frequency: number;       // Global AC frequency (Hz)
  solverResult: SolverResult | null;
  isSimulating: boolean;
  showGrid: boolean;
  zoom: number;            // Canvas zoom level (1.0 = 100%)
  panOffset: { x: number; y: number };
}

const initialState: CircuitState = {
  topology: { components: [], wires: [] },
  selectedIds: new Set(),
  activeTool: 'SELECT',
  theme: 'light',
  language: 'zh',
  wiringMode: 'orthogonal',
  analysisType: 'DC',
  frequency: 60,
  solverResult: null,
  isSimulating: false,
  showGrid: true,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
};

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------
export type CircuitAction =
  | { type: 'ADD_COMPONENT'; component: Component }
  | { type: 'UPDATE_COMPONENT'; id: string; patch: Partial<Component> }
  | { type: 'REMOVE_COMPONENT'; id: string }
  | { type: 'ADD_WIRE'; wire: Wire }
  | { type: 'REMOVE_WIRE'; id: string }
  | { type: 'SET_SELECTED'; ids: string[] }
  | { type: 'CLEAR_SELECTED' }
  | { type: 'SET_TOOL'; tool: EditorTool }
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'SET_LANGUAGE'; language: Language }
  | { type: 'SET_WIRING_MODE'; mode: WiringMode }
  | { type: 'SET_ANALYSIS_TYPE'; analysisType: AnalysisType }
  | { type: 'SET_FREQUENCY'; frequency: number }
  | { type: 'SET_SOLVER_RESULT'; result: SolverResult | null }
  | { type: 'SET_SIMULATING'; isSimulating: boolean }
  | { type: 'TOGGLE_GRID' }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_PAN'; offset: { x: number; y: number } }
  | { type: 'CLEAR_CIRCUIT' }


// ------------------------------------------------------------------
// Reducer
// ------------------------------------------------------------------
function circuitReducer(state: CircuitState, action: CircuitAction): CircuitState {
  switch (action.type) {
    case 'ADD_COMPONENT':
      return {
        ...state,
        topology: {
          ...state.topology,
          components: [...state.topology.components, action.component],
        },
      };

    case 'UPDATE_COMPONENT':
      return {
        ...state,
        topology: {
          ...state.topology,
          components: state.topology.components.map(c =>
            c.id === action.id ? { ...c, ...action.patch } : c
          ),
        },
      };

    case 'REMOVE_COMPONENT':
      return {
        ...state,
        topology: {
          components: state.topology.components.filter(c => c.id !== action.id),
          // Also remove any wires connected to pins of this component
          wires: state.topology.wires.filter(
            w => !w.startPinId.startsWith(action.id) && !w.endPinId.startsWith(action.id)
          ),
        },
      };

    case 'ADD_WIRE':
      return {
        ...state,
        topology: {
          ...state.topology,
          wires: [...state.topology.wires, action.wire],
        },
      };

    case 'REMOVE_WIRE':
      return {
        ...state,
        topology: {
          ...state.topology,
          wires: state.topology.wires.filter(w => w.id !== action.id),
        },
      };

    case 'SET_SELECTED':
      return { ...state, selectedIds: new Set(action.ids) };

    case 'CLEAR_SELECTED':
      return { ...state, selectedIds: new Set() };

    case 'SET_TOOL':
      return { ...state, activeTool: action.tool };

    case 'SET_THEME':
      return { ...state, theme: action.theme };

    case 'SET_LANGUAGE':
      return { ...state, language: action.language };

    case 'SET_WIRING_MODE':
      return { ...state, wiringMode: action.mode };

    case 'SET_ANALYSIS_TYPE':
      return { ...state, analysisType: action.analysisType };

    case 'SET_FREQUENCY':
      return { ...state, frequency: action.frequency };

    case 'SET_SOLVER_RESULT':
      return { ...state, solverResult: action.result };

    case 'SET_SIMULATING':
      return { ...state, isSimulating: action.isSimulating };

    case 'TOGGLE_GRID':
      return { ...state, showGrid: !state.showGrid };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(0.25, Math.min(4, action.zoom)) };

    case 'SET_PAN':
      return { ...state, panOffset: action.offset };

    case 'CLEAR_CIRCUIT':
      return {
        ...state,
        topology: { components: [], wires: [] },
        selectedIds: new Set(),
        solverResult: null,
      };

    default:
      return state;
  }
}

// ------------------------------------------------------------------
// Context
// ------------------------------------------------------------------
interface CircuitContextValue {
  state: CircuitState;
  dispatch: React.Dispatch<CircuitAction>;
}

const CircuitContext = createContext<CircuitContextValue | null>(null);

export function CircuitProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(circuitReducer, initialState);
  return (
    <CircuitContext.Provider value={{ state, dispatch }}>
      {children}
    </CircuitContext.Provider>
  );
}

export function useCircuit(): CircuitContextValue {
  const ctx = useContext(CircuitContext);
  if (!ctx) throw new Error('useCircuit must be used inside CircuitProvider');
  return ctx;
}
