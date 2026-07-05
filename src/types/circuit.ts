// ============================================================
// circuit.ts - Core TypeScript Data Types for Circuit Topology
// ============================================================

/** All supported component types in the circuit editor */
export type ComponentType =
  | 'R'      // Resistor (Ω)
  | 'C'      // Capacitor (F)
  | 'L'      // Inductor (H)
  | 'V_DC'   // DC Voltage Source (V)
  | 'I_DC'   // DC Current Source (A)
  | 'V_AC'   // AC Voltage Source (amplitude V, phase Deg)
  | 'I_AC'   // AC Current Source (amplitude A, phase Deg)
  | 'VCVS'   // Voltage-Controlled Voltage Source (gain μ)
  | 'VCCS'   // Voltage-Controlled Current Source (transconductance g)
  | 'CCVS'   // Current-Controlled Voltage Source (transresistance r)
  | 'CCCS'   // Current-Controlled Current Source (gain β)
  | 'OPAMP'  // Ideal Operational Amplifier
  | 'GROUND' // Ground terminal (Reference Node 0)
  | 'WIRE'   // Wire / conductor (used for connection)

/** Represents a single pin on a component */
export interface ComponentPin {
  id: string;      // Unique pin ID e.g. "R1-pin0"
  nodeId: string;  // Topological node ID (equal-potential group via union-find)
}

/** Represents a placed component on the canvas */
export interface Component {
  id: string;          // Unique component ID e.g. "R1", "V_AC1"
  type: ComponentType;
  value: number;       // Main value (Ω, F, H, V amplitude, A amplitude, gain…)
  label?: string;      // Display label e.g. "1kΩ", "5V"
  phase?: number;      // AC source initial phase (degrees), default 0
  frequency?: number;  // Per-component frequency override (Hz); usually global freq is used

  // Canvas position & orientation
  position: { x: number; y: number }; // Top-left corner on canvas (px)
  rotation: 0 | 90 | 180 | 270;       // Rotation in degrees

  pins: ComponentPin[]; // Ordered pin list. For 2-terminal: [positive, negative]

  // Controlled source – control terminal node IDs
  controlPins?: [string, string]; // [ctrl_plus_nodeId, ctrl_minus_nodeId]
  controlBranch?: string;         // Source branch ID whose current controls this source
}

/** Represents a drawn wire segment between two pins */
export interface Wire {
  id: string;
  startPinId: string;   // Pin ID of the wire's start
  endPinId: string;     // Pin ID of the wire's end
  path: { x: number; y: number }[]; // Waypoints
  routingMode?: WiringMode;          // The mode this wire was drawn with
}

/** Complete snapshot of the current circuit on the canvas */
export interface CircuitTopology {
  components: Component[];
  wires: Wire[];
}

/** Analysis modes supported by the solver */
export type AnalysisType = 'DC' | 'AC' | 'TRANSIENT';

/** Input data structure passed to the MNA solver */
export interface CircuitData {
  components: Component[];
  frequency: number; // Global AC frequency (Hz), ω = 2πf
}

/** A complex number result value */
export interface ComplexValue {
  re: number; // Real part
  im: number; // Imaginary part
}

/** Result returned by the MNA solver */
export interface SolverResult {
  success: boolean;
  error?: string;
  // Node voltage indexed by nodeId; for DC, im = 0
  nodeVoltages: Record<string, ComplexValue>;
  // Branch current indexed by component ID; for DC, im = 0
  branchCurrents: Record<string, ComplexValue>;
}

/** State of the editor tool currently active */
export type EditorTool =
  | 'SELECT'
  | 'WIRE'
  | 'R'
  | 'C'
  | 'L'
  | 'V_DC'
  | 'I_DC'
  | 'V_AC'
  | 'I_AC'
  | 'GROUND'
  | 'DELETE'

/** Theme options */
export type Theme = 'light' | 'dark';

/** Language options */
export type Language = 'zh' | 'en';

/** Wiring mode options */
export type WiringMode = 'orthogonal' | 'direct';

