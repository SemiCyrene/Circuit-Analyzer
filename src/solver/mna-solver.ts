// ============================================================
// mna-solver.ts - Modified Nodal Analysis (MNA) Circuit Solver
// 改进节点电压法电路求解器
//
// 支持元件：R, C, L, V_DC, I_DC, V_AC, I_AC,
//           VCVS, VCCS, CCVS, CCCS, OPAMP, GROUND
// 支持分析：DC（直流稳态）, AC（交流相量稳态）
//
// 算法参考：
//   Vladimirescu, A. "The SPICE Book" (1994)
//   Pillage, L. et al. "Electronic Circuit and System Simulation Methods" (1995)
// ============================================================

import * as math from 'mathjs';
import type { Component, CircuitData, SolverResult, ComplexValue } from '../types/circuit';

// ============================================================
// 常量
// ============================================================
/** 防止奇异矩阵的最小电导（并联在每个节点到地之间） */
const GMIN = 1e-12;
/** 防止电压源支路引起奇异的极小串联电阻 */
const RMIN = 1e-9;
/** 接地节点的标准名称 */
const GND_NODE = '__GND__';

// ============================================================
// 辅助：复数工厂
// ============================================================
function cx(re: number, im: number = 0): math.Complex {
  return math.complex(re, im) as math.Complex;
}

function toCxResult(c: math.Complex | number): ComplexValue {
  if (typeof c === 'number') return { re: c, im: 0 };
  return { re: (c as math.Complex).re, im: (c as math.Complex).im };
}

// ============================================================
// Step 1 - 节点编号器
// 从元件列表中提取所有拓扑节点，分配 0-based 索引。
// 接地节点（GND）固定为 index=0，其余节点按遇见顺序编号。
// ============================================================
interface NodeMap {
  /** nodeId -> matrix row/col index (0 = GND) */
  idToIdx: Map<string, number>;
  /** 非接地节点总数 N（矩阵前 N 行/列） */
  N: number;
}

function buildNodeMap(components: Component[]): NodeMap {
  const idToIdx = new Map<string, number>();
  idToIdx.set(GND_NODE, 0);

  // 将 GROUND 类型元件的引脚节点映射到 GND
  for (const comp of components) {
    if (comp.type === 'GROUND') {
      for (const pin of comp.pins) {
        idToIdx.set(pin.nodeId, 0);
      }
    }
  }

  // 收集其余所有节点
  let nextIdx = 1;
  for (const comp of components) {
    if (comp.type === 'GROUND') continue;
    for (const pin of comp.pins) {
      if (!idToIdx.has(pin.nodeId)) {
        idToIdx.set(pin.nodeId, nextIdx++);
      }
    }
    // 受控源控制端节点
    if (comp.controlPins) {
      for (const nodeId of comp.controlPins) {
        if (!idToIdx.has(nodeId)) {
          idToIdx.set(nodeId, nextIdx++);
        }
      }
    }
  }

  return { idToIdx, N: nextIdx - 1 }; // N = 非接地节点数
}

// ============================================================
// Step 2 - 确定需要额外电流变量的元件
// MNA 中，电压源、电感（DC 时为短路）、受控电压源、运放
// 都需要引入额外的支路电流变量 Ix。
// ============================================================
type ExtraCurrentComponent = Component & { extraIdx: number };

function collectExtraCurrentComps(
  components: Component[],
  analysisType: 'DC' | 'AC',
): ExtraCurrentComponent[] {
  const result: ExtraCurrentComponent[] = [];
  let idx = 0;
  for (const comp of components) {
    let needsExtra = false;
    switch (comp.type) {
      case 'V_DC':
      case 'V_AC':
      case 'VCVS':
      case 'CCVS':
      case 'OPAMP':
        needsExtra = true;
        break;
      case 'L':
        // DC 时电感为短路（0V 电压源），需引入电流变量
        // AC 时电感为 jωL 阻抗，不需要额外电流变量
        needsExtra = analysisType === 'DC';
        break;
      default:
        break;
    }
    if (needsExtra) {
      result.push({ ...comp, extraIdx: idx++ });
    }
  }
  return result;
}

// ============================================================
// Step 3 - 构建 MNA 矩阵并求解
// 矩阵结构 (size = N + M):
//   前 N 行/列：N 个非接地节点（KCL 方程 + 电导填充）
//   后 M 行/列：M 个额外电流变量（KVL 方程）
// ============================================================
export function solveCircuit(data: CircuitData): SolverResult {
  const { components, frequency } = data;
  const analysisType: 'DC' | 'AC' = frequency === 0 ? 'DC' : 'AC';
  const omega = 2 * Math.PI * frequency; // 角频率

  // -- 过滤掉 GROUND 和 WIRE 类型元件（不参与 MNA）--
  const activeComps = components.filter(c => c.type !== 'GROUND' && c.type !== 'WIRE');

  // -- 构建节点编号 --
  const { idToIdx, N } = buildNodeMap(components);

  if (N === 0) {
    return {
      success: false,
      error: '电路中没有有效的非接地节点。请确保电路中有接地元件（GND）。',
      nodeVoltages: {},
      branchCurrents: {},
    };
  }

  // -- 确定额外电流变量 --
  const extraComps = collectExtraCurrentComps(activeComps, analysisType);
  const M = extraComps.length; // 额外变量数
  const SIZE = N + M;          // 矩阵总维度

  // -- 初始化矩阵 A 和向量 z (全复数) --
  // A[i][j] 和 z[i] 均为复数
  const A: math.Complex[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => cx(0)),
  );
  const z: math.Complex[] = Array.from({ length: SIZE }, () => cx(0));

  // -- 辅助函数：安全获取节点索引（接地 = 0 不进入矩阵）--
  const ni = (nodeId: string): number => idToIdx.get(nodeId) ?? 0;

  // -- 辅助函数：向 A 矩阵中加值（行 r, 列 c 加 val） --
  // 行/列 0 代表接地，跳过（接地为参考点，不建立方程）
  const addA = (r: number, c: number, val: math.Complex) => {
    if (r <= 0 || c <= 0) return; // 跳过接地行/列
    A[r - 1][c - 1] = math.add(A[r - 1][c - 1], val) as math.Complex;
  };

  // -- 辅助函数：向 z 向量中加值 --
  const addZ = (r: number, val: math.Complex) => {
    if (r <= 0) return;
    z[r - 1] = math.add(z[r - 1], val) as math.Complex;
  };

  // -- 辅助函数：获取额外电流变量的矩阵行/列索引 --
  const extraRow = (extraIdx: number): number => N + extraIdx + 1;
  // (N+1 ~ N+M 在 1-indexed 中对应 A 的 N ~ N+M-1 行/列)

  // ============================================================
  // Gmin 注入：为所有节点到地之间并联极小电导，防止奇异矩阵
  // ============================================================
  for (let i = 1; i <= N; i++) {
    A[i - 1][i - 1] = math.add(A[i - 1][i - 1], cx(GMIN)) as math.Complex;
  }

  // ============================================================
  // 元件 Stamp（盖章）——遍历所有有效元件
  // ============================================================
  for (const comp of activeComps) {
    const p = comp.pins[0]?.nodeId; // 正引脚节点
    const n = comp.pins[1]?.nodeId; // 负引脚节点
    const np = ni(p ?? GND_NODE);
    const nn = ni(n ?? GND_NODE);

    switch (comp.type) {
      // --------------------------------------------------------
      // 电阻 R：导纳 G = 1/R
      // KCL stamp:
      //   A[p][p] += G,  A[p][n] -= G
      //   A[n][p] -= G,  A[n][n] += G
      // --------------------------------------------------------
      case 'R': {
        const G = cx(1 / Math.max(comp.value, 1e-15));
        addA(np, np,  G);
        addA(np, nn, math.unaryMinus(G) as math.Complex);
        addA(nn, np, math.unaryMinus(G) as math.Complex);
        addA(nn, nn,  G);
        break;
      }

      // --------------------------------------------------------
      // 电容 C：
      //   DC 分析：开路（填入极小电导 Gmin，上面已统一注入，此处跳过）
      //   AC 分析：导纳 Y = jωC
      // --------------------------------------------------------
      case 'C': {
        if (analysisType === 'AC') {
          const Y = cx(0, omega * comp.value); // jωC
          addA(np, np,  Y);
          addA(np, nn, math.unaryMinus(Y) as math.Complex);
          addA(nn, np, math.unaryMinus(Y) as math.Complex);
          addA(nn, nn,  Y);
        }
        // DC 时视为开路，Gmin 已经在上面统一注入，不再额外处理
        break;
      }

      // --------------------------------------------------------
      // 电感 L：
      //   DC 分析：视为短路（0V 独立电压源），需要额外电流变量
      //   AC 分析：阻抗 Z = jωL，导纳 Y = 1/(jωL)
      // --------------------------------------------------------
      case 'L': {
        if (analysisType === 'AC') {
          const ZL = math.complex(0, omega * comp.value); // jωL
          // 为防数值问题，串联极小电阻 RMIN
          const Z = math.add(ZL, cx(RMIN)) as math.Complex;
          const Y = math.divide(cx(1), Z) as math.Complex;
          addA(np, np,  Y);
          addA(np, nn, math.unaryMinus(Y) as math.Complex);
          addA(nn, np, math.unaryMinus(Y) as math.Complex);
          addA(nn, nn,  Y);
        } else {
          // DC：电感短路，作为 0V 电压源处理
          const ec = extraComps.find(e => e.id === comp.id)!;
          const er = extraRow(ec.extraIdx);
          // KCL: 节点 p 流出电流 +Ix，节点 n 流入电流 -Ix
          addA(np, er,  cx(1));
          addA(nn, er, cx(-1));
          // KVL: V_p - V_n = 0（串联极小电阻压降）
          addA(er, np,  cx(1));
          addA(er, nn, cx(-1));
          addA(er, er, cx(RMIN)); // 极小串联电阻
          // z[er] = 0 （已经初始化为 0）
        }
        break;
      }

      // --------------------------------------------------------
      // 直流电压源 V_DC：引入支路电流 Ix
      // KCL:  A[p][er] = +1,  A[n][er] = -1
      // KVL:  A[er][p] = +1, A[er][n] = -1, z[er] = V
      // 串联 RMIN 防止纯电压源环路奇异
      // --------------------------------------------------------
      case 'V_DC': {
        const ec = extraComps.find(e => e.id === comp.id)!;
        const er = extraRow(ec.extraIdx);
        addA(np, er,  cx(1));
        addA(nn, er, cx(-1));
        addA(er, np,  cx(1));
        addA(er, nn, cx(-1));
        addA(er, er, cx(RMIN));
        addZ(er, cx(comp.value));
        break;
      }

      // --------------------------------------------------------
      // 交流电压源 V_AC：同 V_DC，但激励为相量 V∠φ
      // --------------------------------------------------------
      case 'V_AC': {
        const phaseRad = ((comp.phase ?? 0) * Math.PI) / 180;
        const Vphasor = cx(
          comp.value * Math.cos(phaseRad),
          comp.value * Math.sin(phaseRad),
        );
        const ec = extraComps.find(e => e.id === comp.id)!;
        const er = extraRow(ec.extraIdx);
        addA(np, er,  cx(1));
        addA(nn, er, cx(-1));
        addA(er, np,  cx(1));
        addA(er, nn, cx(-1));
        addA(er, er, cx(RMIN));
        addZ(er, Vphasor);
        break;
      }

      // --------------------------------------------------------
      // 直流电流源 I_DC：KCL 直接注入节点激励
      // 电流从 n 引脚流向 p 引脚（箭头方向）
      // z[p] -= I,  z[n] += I
      // --------------------------------------------------------
      case 'I_DC': {
        addZ(np, cx(-comp.value)); // 从 p 流出
        addZ(nn, cx(comp.value));  // 从 n 流入
        break;
      }

      // --------------------------------------------------------
      // 交流电流源 I_AC：同 I_DC，激励为相量
      // --------------------------------------------------------
      case 'I_AC': {
        const phaseRad = ((comp.phase ?? 0) * Math.PI) / 180;
        const Iphasor = cx(
          comp.value * Math.cos(phaseRad),
          comp.value * Math.sin(phaseRad),
        );
        addZ(np, math.unaryMinus(Iphasor) as math.Complex);
        addZ(nn, Iphasor);
        break;
      }

      // --------------------------------------------------------
      // 电压控制电压源 VCVS：V_out = μ * V_ctrl
      // pins[0]=输出正, pins[1]=输出负
      // controlPins=[控制正, 控制负]
      // 引入支路电流 Ix（流过输出支路）
      // KCL 输出端：A[p_out][er]=+1, A[n_out][er]=-1
      // KVL: V_p_out - V_n_out - μ*(V_cp - V_cn) = 0
      //   => A[er][p_out]=+1, A[er][n_out]=-1, A[er][cp]=-μ, A[er][cn]=+μ
      // --------------------------------------------------------
      case 'VCVS': {
        const cp = ni(comp.controlPins?.[0] ?? GND_NODE);
        const cn = ni(comp.controlPins?.[1] ?? GND_NODE);
        const mu = comp.value;
        const ec = extraComps.find(e => e.id === comp.id)!;
        const er = extraRow(ec.extraIdx);
        addA(np, er,  cx(1));
        addA(nn, er, cx(-1));
        addA(er, np,  cx(1));
        addA(er, nn, cx(-1));
        addA(er, cp, cx(-mu));
        addA(er, cn, cx(mu));
        addA(er, er, cx(RMIN)); // 极小串联电阻
        break;
      }

      // --------------------------------------------------------
      // 电压控制电流源 VCCS：I_out = g * V_ctrl
      // pins[0]=输出正, pins[1]=输出负
      // controlPins=[控制正, 控制负]
      // 直接 KCL stamp（不需要额外电流变量）：
      //   A[p_out][cp] += g,   A[p_out][cn] -= g
      //   A[n_out][cp] -= g,   A[n_out][cn] += g
      // --------------------------------------------------------
      case 'VCCS': {
        const cp = ni(comp.controlPins?.[0] ?? GND_NODE);
        const cn = ni(comp.controlPins?.[1] ?? GND_NODE);
        const g = cx(comp.value);
        addA(np, cp,  g);
        addA(np, cn, math.unaryMinus(g) as math.Complex);
        addA(nn, cp, math.unaryMinus(g) as math.Complex);
        addA(nn, cn,  g);
        break;
      }

      // --------------------------------------------------------
      // 电流控制电压源 CCVS：V_out = r * I_ctrl
      // 控制电流来自另一个电压源支路（controlBranch 指向该源的 ID）
      // 引入支路电流 Ix（流过输出支路）
      // KCL 输出端：A[p][er]=+1, A[n][er]=-1
      // KVL: V_p - V_n - r * I_ctrl = 0
      //   => A[er][p]=+1, A[er][n]=-1, A[er][ctrl_er]=-r
      // --------------------------------------------------------
      case 'CCVS': {
        const r = comp.value;
        const ec = extraComps.find(e => e.id === comp.id)!;
        const er = extraRow(ec.extraIdx);
        const ctrlEc = extraComps.find(e => e.id === comp.controlBranch);
        addA(np, er,  cx(1));
        addA(nn, er, cx(-1));
        addA(er, np,  cx(1));
        addA(er, nn, cx(-1));
        if (ctrlEc) {
          addA(er, extraRow(ctrlEc.extraIdx), cx(-r));
        }
        addA(er, er, cx(RMIN)); // 极小串联电阻
        break;
      }

      // --------------------------------------------------------
      // 电流控制电流源 CCCS：I_out = β * I_ctrl
      // 控制电流来自另一个电压源支路（controlBranch 指向该源的 ID）
      // KCL stamp:
      //   A[p][ctrl_er] += β,  A[n][ctrl_er] -= β
      // --------------------------------------------------------
      case 'CCCS': {
        const beta = cx(comp.value);
        const ctrlEc = extraComps.find(e => e.id === comp.controlBranch);
        if (ctrlEc) {
          const ctrlEr = extraRow(ctrlEc.extraIdx);
          addA(np, ctrlEr,  beta);
          addA(nn, ctrlEr, math.unaryMinus(beta) as math.Complex);
        }
        break;
      }

      // --------------------------------------------------------
      // 理想运算放大器 OPAMP
      // 引脚：pins[0]=反相输入(-)  pins[1]=同相输入(+)  pins[2]=输出
      // 理想运放约束：
      //   1. 输入端虚断：两输入端无电流流入（自动满足，因 KCL 不填）
      //   2. 输入端虚短：V_+ = V_-（无限增益约束）
      //      => KVL: V_pins[1] - V_pins[0] = 0
      //      引入支路电流 Ix（运放输出电流）
      // KCL 输出端：A[out][er] = +1（输出节点注入电流）
      // KVL（虚短）：A[er][pin1] = +1, A[er][pin0] = -1
      // --------------------------------------------------------
      case 'OPAMP': {
        const pinMinus = ni(comp.pins[0]?.nodeId ?? GND_NODE); // 反相 (-)
        const pinPlus  = ni(comp.pins[1]?.nodeId ?? GND_NODE); // 同相 (+)
        const pinOut   = ni(comp.pins[2]?.nodeId ?? GND_NODE); // 输出
        const ec = extraComps.find(e => e.id === comp.id)!;
        const er = extraRow(ec.extraIdx);
        // 运放输出端注入电流 Ix
        addA(pinOut, er, cx(1));
        // 虚短约束：V+ - V- = 0
        addA(er, pinPlus,  cx(1));
        addA(er, pinMinus, cx(-1));
        break;
      }

      default:
        break;
    }
  }

  // ============================================================
  // Step 4 - 求解线性方程组 A·x = z
  // 使用 math.js 的 lusolve（LU 分解）
  // ============================================================
  let xValues: math.Complex[];

  try {
    // math.lusolve 返回 MathArray，转换为 Complex 数组
    const xRaw = math.lusolve(A, z) as math.Complex[][];
    xValues = xRaw.map(row => {
      const v = row[0];
      if (typeof v === 'number') return cx(v);
      return v as math.Complex;
    });
  } catch (err) {
    return {
      success: false,
      error: `矩阵求解失败（可能存在孤立节点或无接地）: ${String(err)}`,
      nodeVoltages: {},
      branchCurrents: {},
    };
  }

  // ============================================================
  // Step 5 - 解析结果：节点电压 & 支路电流
  // ============================================================
  const nodeVoltages: Record<string, ComplexValue> = {};
  const branchCurrents: Record<string, ComplexValue> = {};

  // 从求解向量 x 中提取节点电压（索引 0 ~ N-1 → 节点 1 ~ N）
  for (const [nodeId, idx] of idToIdx.entries()) {
    if (idx === 0) {
      nodeVoltages[nodeId] = { re: 0, im: 0 }; // GND 固定为 0
      continue;
    }
    const v = xValues[idx - 1];
    nodeVoltages[nodeId] = toCxResult(v);
  }

  // 从求解向量 x 中提取额外支路电流（索引 N ~ N+M-1）
  for (const ec of extraComps) {
    const rowIdx = N + ec.extraIdx; // 0-based index in x
    const i = xValues[rowIdx];
    branchCurrents[ec.id] = toCxResult(i);
  }

  // 对于电阻、电容（AC）的支路电流，从节点电压计算
  for (const comp of activeComps) {
    if (branchCurrents[comp.id]) continue; // 已有（来自额外变量）
    const p = comp.pins[0]?.nodeId;
    const n = comp.pins[1]?.nodeId;
    if (!p || !n) continue;
    const Vp = nodeVoltages[p] ?? { re: 0, im: 0 };
    const Vn = nodeVoltages[n] ?? { re: 0, im: 0 };
    const dV = math.subtract(cx(Vp.re, Vp.im), cx(Vn.re, Vn.im)) as math.Complex;

    if (comp.type === 'R') {
      const I = math.divide(dV, cx(comp.value)) as math.Complex;
      branchCurrents[comp.id] = toCxResult(I);
    } else if (comp.type === 'C' && analysisType === 'AC') {
      const Y = cx(0, omega * comp.value);
      const I = math.multiply(Y, dV) as math.Complex;
      branchCurrents[comp.id] = toCxResult(I);
    } else if (comp.type === 'L' && analysisType === 'AC') {
      const Z = math.complex(RMIN, omega * comp.value);
      const I = math.divide(dV, Z) as math.Complex;
      branchCurrents[comp.id] = toCxResult(I);
    } else if (comp.type === 'I_DC' || comp.type === 'I_AC') {
      const phaseRad = ((comp.phase ?? 0) * Math.PI) / 180;
      branchCurrents[comp.id] = {
        re: comp.value * Math.cos(phaseRad),
        im: comp.value * Math.sin(phaseRad),
      };
    }
  }

  return {
    success: true,
    nodeVoltages,
    branchCurrents,
  };
}
