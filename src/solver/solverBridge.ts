// ============================================================
// solverBridge.ts - 连接 React UI 与 MNA 求解器
// 负责：拓扑节点归并、CircuitData 构建、调用求解器
// ============================================================

import { solveCircuit } from './mna-solver';
import { mergeTopologyNodes } from './unionFind';
import type { Component, Wire, CircuitData, SolverResult } from '../types/circuit';

const GND_NODE_ID = '__GND__';

/**
 * 从画布拓扑构建可供 MNA 求解器使用的 CircuitData。
 *
 * 核心工作：
 * 1. 用并查集把所有被导线连接的引脚归并为同一逻辑节点。
 * 2. 识别 GROUND 类型元件，强制将其引脚节点标记为参考地（__GND__）。
 * 3. 把归并后的节点 ID 回填到每个元件的 pins[i].nodeId。
 */
export function buildCircuitData(
  components: Component[],
  wires: Wire[],
  frequency: number,
): CircuitData {
  // Step 1：用并查集归并所有引脚节点
  const pinToRoot = mergeTopologyNodes(components, wires);

  // Step 2：找到接地根节点（GROUND 元件的引脚所指向的根）
  const groundRoots = new Set<string>();
  for (const comp of components) {
    if (comp.type === 'GROUND') {
      for (const pin of comp.pins) {
        const root = pinToRoot.get(pin.id) ?? pin.id;
        groundRoots.add(root);
      }
    }
  }

  // Step 3：构建更新后的组件列表（将 pins[i].nodeId 改为并查集根节点）
  const updatedComponents: Component[] = components.map(comp => ({
    ...comp,
    pins: comp.pins.map(pin => {
      let root = pinToRoot.get(pin.id) ?? pin.id;
      // 如果该根是接地根，统一替换为 GND_NODE_ID
      if (groundRoots.has(root)) root = GND_NODE_ID;
      return { ...pin, nodeId: root };
    }),
    // 受控源控制端引脚同样需要归并
    controlPins: comp.controlPins
      ? comp.controlPins.map(nodeId => {
          const root = pinToRoot.get(nodeId) ?? nodeId;
          return groundRoots.has(root) ? GND_NODE_ID : root;
        }) as [string, string]
      : undefined,
  }));

  return {
    components: updatedComponents,
    frequency,
  };
}

/**
 * 顶层调用入口：构建数据并求解
 */
export function runSimulation(
  components: Component[],
  wires: Wire[],
  frequency: number,
): SolverResult {
  if (components.length === 0) {
    return {
      success: false,
      error: '电路中没有任何元件。',
      nodeVoltages: {},
      branchCurrents: {},
    };
  }

  // 检查是否存在接地元件
  const hasGround = components.some(c => c.type === 'GROUND');
  if (!hasGround) {
    return {
      success: false,
      error: '电路中没有接地点（GND）。MNA 求解需要至少一个参考地节点。',
      nodeVoltages: {},
      branchCurrents: {},
    };
  }

  const circuitData = buildCircuitData(components, wires, frequency);
  return solveCircuit(circuitData);
}

// ============================================================
// 内置测试用例（可在控制台直接运行验证）
// ============================================================

/**
 * 测试 1：直流纯电阻分压电路
 * 电路：5V 直流源 → R1(1kΩ) → R2(1kΩ) → GND
 * 期望：节点 A（R1/R2 中点）= 2.5V
 *       I(V1) = 2.5mA
 */
export function testDCResistorDivider(): void {
  const components: Component[] = [
    {
      id: 'GND1', type: 'GROUND', value: 0,
      position: { x: 0, y: 0 }, rotation: 0,
      pins: [{ id: 'GND1-pin0', nodeId: '__GND__' }],
    },
    {
      id: 'V1', type: 'V_DC', value: 5,
      position: { x: 0, y: 0 }, rotation: 0,
      pins: [
        { id: 'V1-pin0', nodeId: 'nodeVcc' }, // 正极
        { id: 'V1-pin1', nodeId: '__GND__' },  // 负极接地
      ],
    },
    {
      id: 'R1', type: 'R', value: 1000,
      position: { x: 0, y: 0 }, rotation: 0,
      pins: [
        { id: 'R1-pin0', nodeId: 'nodeVcc' },
        { id: 'R1-pin1', nodeId: 'nodeA' },
      ],
    },
    {
      id: 'R2', type: 'R', value: 1000,
      position: { x: 0, y: 0 }, rotation: 0,
      pins: [
        { id: 'R2-pin0', nodeId: 'nodeA' },
        { id: 'R2-pin1', nodeId: '__GND__' },
      ],
    },
  ];

  const result = solveCircuit({ components, frequency: 0 });
  const Va = result.nodeVoltages['nodeA'];
  const Vcc = result.nodeVoltages['nodeVcc'];
  const Iv1 = result.branchCurrents['V1'];
  console.log('=== Test 1: DC Resistor Divider ===');
  console.log('Success:', result.success);
  console.log(`V(nodeVcc) = ${Vcc?.re.toFixed(4)} V  (expected: 5.0000)`);
  console.log(`V(nodeA)   = ${Va?.re.toFixed(4)} V  (expected: 2.5000)`);
  console.log(`I(V1)      = ${Math.abs(Iv1?.re ?? 0).toFixed(6)} A  (expected: 0.002500)`);
  console.log('');
}

/**
 * 测试 2：交流 RC 电路（RC 低通滤波器）
 * 电路：5V∠0° AC 100Hz → R(1kΩ) → C(1μF) → GND
 * 理论输出电压（C 两端）:
 *   Xc = 1/(2π×100×1e-6) ≈ 1591.5Ω
 *   |Vc| = 5 × Xc / √(R²+Xc²) ≈ 3.846V
 */
export function testACRCFilter(): void {
  const f = 100;
  const R = 1000;
  const C = 1e-6;
  const Xc = 1 / (2 * Math.PI * f * C);
  const expectedMag = 5 * Xc / Math.sqrt(R * R + Xc * Xc);

  const components: Component[] = [
    {
      id: 'GND1', type: 'GROUND', value: 0,
      position: { x: 0, y: 0 }, rotation: 0,
      pins: [{ id: 'GND1-pin0', nodeId: '__GND__' }],
    },
    {
      id: 'V1', type: 'V_AC', value: 5, phase: 0, frequency: f,
      position: { x: 0, y: 0 }, rotation: 0,
      pins: [
        { id: 'V1-pin0', nodeId: 'nodeVin' },
        { id: 'V1-pin1', nodeId: '__GND__' },
      ],
    },
    {
      id: 'R1', type: 'R', value: R,
      position: { x: 0, y: 0 }, rotation: 0,
      pins: [
        { id: 'R1-pin0', nodeId: 'nodeVin' },
        { id: 'R1-pin1', nodeId: 'nodeOut' },
      ],
    },
    {
      id: 'C1', type: 'C', value: C,
      position: { x: 0, y: 0 }, rotation: 0,
      pins: [
        { id: 'C1-pin0', nodeId: 'nodeOut' },
        { id: 'C1-pin1', nodeId: '__GND__' },
      ],
    },
  ];

  const result = solveCircuit({ components, frequency: f });
  const Vout = result.nodeVoltages['nodeOut'];
  const mag = Vout ? Math.sqrt(Vout.re ** 2 + Vout.im ** 2) : 0;
  const phase = Vout ? (Math.atan2(Vout.im, Vout.re) * 180 / Math.PI) : 0;
  console.log('=== Test 2: AC RC Low-Pass Filter ===');
  console.log('Success:', result.success);
  console.log(`|Vout|   = ${mag.toFixed(4)} V  (expected: ${expectedMag.toFixed(4)})`);
  console.log(`∠Vout    = ${phase.toFixed(2)}°`);
  console.log('');
}

// 在模块加载时自动运行测试（仅开发环境）
if (import.meta.env?.DEV) {
  testDCResistorDivider();
  testACRCFilter();
}
