// ============================================================
// unionFind.ts - Union-Find (并查集) 拓扑节点归并算法
//
// 作用：用户在画布上通过导线连接了两个引脚，
// 这两个引脚在物理上处于同一等电位节点。
// 并查集负责把所有被导线连接的引脚归并为同一个"逻辑节点"。
//
// 算法复杂度：近似 O(α(N)) ≈ O(1) (路径压缩 + 按秩合并)
// ============================================================

export class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  /** 初始化一个节点 */
  add(id: string): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  /** 查找根节点（含路径压缩） */
  find(id: string): string {
    this.add(id);
    let root = id;
    // 找到根
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // 路径压缩
    let current = id;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  /** 合并两个节点所在的集合（按秩合并） */
  union(a: string, b: string): void {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra) ?? 0;
    const rankB = this.rank.get(rb) ?? 0;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }

  /** 获取所有节点所属的根节点映射 */
  getAllRoots(): Map<string, string> {
    const result = new Map<string, string>();
    for (const id of this.parent.keys()) {
      result.set(id, this.find(id));
    }
    return result;
  }
}

// ============================================================
// mergeTopologyNodes:
// 输入：组件列表 + 导线列表
// 输出：将所有被导线连接的 pinId 归并后，
//       返回一个 pinId -> 逻辑nodeId 的映射
// ============================================================
export function mergeTopologyNodes(
  components: import('../types/circuit').Component[],
  wires: import('../types/circuit').Wire[],
): Map<string, string> {
  const uf = new UnionFind();

  // 1. 把所有引脚加入并查集（初始每个引脚自成一组）
  for (const comp of components) {
    for (const pin of comp.pins) {
      uf.add(pin.id);
    }
  }

  // 2. 每条导线把它连接的两个引脚归并到同一组
  for (const wire of wires) {
    uf.union(wire.startPinId, wire.endPinId);
  }

  // 3. 返回 pinId -> 根节点ID 的映射
  return uf.getAllRoots();
}
