/**
 * Universal Edge Graph Engine for poly-relational data modeling without SQLite DDL churn.
 */

export interface EdgeEndpointTuple {
  sourceId: string
  relationName: string
  targetId: string
}

export type EdgeKey = EdgeEndpointTuple

export interface UniversalEdge<TMeta = Record<string, unknown>> {
  id: string
  source_id: string
  relation_name: string
  target_id: string
  metadata_json?: string | null
  metadata?: TMeta
  created_at: number
}

export class UniversalEdgeEngine {
  private edges = new Map<string, UniversalEdge>()
  private sourceMap = new Map<string, Set<string>>() // sourceId -> Set of edgeIds
  private targetMap = new Map<string, Set<string>>() // targetId -> Set of edgeIds
  private relationMap = new Map<string, Set<string>>() // relation_name -> Set of edgeIds

  /**
   * Creates a relational link between two entities.
   */
  public link<TMeta = Record<string, unknown>>(
    endpoints: EdgeEndpointTuple,
    metadata?: TMeta,
  ): UniversalEdge<TMeta>
  public link<TMeta = Record<string, unknown>>(
    sourceId: string,
    relationName: string,
    targetId: string,
    metadata?: TMeta,
  ): UniversalEdge<TMeta>
  public link<TMeta = Record<string, unknown>>(
    endpointOrSourceId: string | EdgeEndpointTuple,
    relationOrMeta?: string | TMeta,
    maybeTargetId?: string,
    maybeMetadata?: TMeta,
  ): UniversalEdge<TMeta> {
    let sourceId: string
    let relationName: string
    let targetId: string
    let metadata: TMeta | undefined

    if (typeof endpointOrSourceId === 'object') {
      sourceId = endpointOrSourceId.sourceId
      relationName = endpointOrSourceId.relationName
      targetId = endpointOrSourceId.targetId
      metadata = relationOrMeta as TMeta | undefined
    } else {
      sourceId = endpointOrSourceId
      relationName = relationOrMeta as string
      targetId = maybeTargetId as string
      metadata = maybeMetadata
    }

    // Check if link already exists with same source, relation, target
    const existing = this.findEdge(sourceId, relationName, targetId)
    if (existing) {
      if (metadata !== undefined) {
        existing.metadata = metadata as unknown as Record<string, unknown>
        existing.metadata_json = JSON.stringify(metadata)
      }
      return existing as UniversalEdge<TMeta>
    }

    const id = `edge_${sourceId}_${relationName}_${targetId}_${Date.now()}`
    const metadataJson = metadata !== undefined ? JSON.stringify(metadata) : null

    const edge: UniversalEdge<TMeta> = {
      id,
      source_id: sourceId,
      relation_name: relationName,
      target_id: targetId,
      metadata_json: metadataJson,
      metadata,
      created_at: Date.now(),
    }

    this.addEdge(edge as unknown as UniversalEdge)
    return edge
  }

  /**
   * Removes a specific relational link.
   */
  public unlink(endpoints: EdgeEndpointTuple): boolean
  public unlink(sourceId: string, relationName: string, targetId: string): boolean
  public unlink(
    endpointOrSourceId: string | EdgeEndpointTuple,
    relationName?: string,
    targetId?: string,
  ): boolean {
    const edge =
      typeof endpointOrSourceId === 'object'
        ? this.findEdge(endpointOrSourceId)
        : this.findEdge(endpointOrSourceId, relationName!, targetId!)
    if (!edge) return false

    return this.removeEdge(edge.id)
  }

  /**
   * Cascading cleanup when an entity is deleted.
   */
  public cascadeEntityDelete(entityId: string): number {
    let deletedCount = 0
    const edgeIdsToDelete = new Set<string>()

    const outSet = this.sourceMap.get(entityId)
    if (outSet) {
      outSet.forEach((id) => edgeIdsToDelete.add(id))
    }

    const inSet = this.targetMap.get(entityId)
    if (inSet) {
      inSet.forEach((id) => edgeIdsToDelete.add(id))
    }

    edgeIdsToDelete.forEach((edgeId) => {
      if (this.removeEdge(edgeId)) {
        deletedCount++
      }
    })

    return deletedCount
  }

  /**
   * Retrieves all outgoing edges from a source entity, optionally filtered by relation name.
   */
  public getOutgoing(sourceId: string, relationName?: string): UniversalEdge[] {
    return this.getEdgesFromIndex(this.sourceMap, sourceId, relationName)
  }

  /**
   * Retrieves all incoming edges to a target entity, optionally filtered by relation name.
   */
  public getIncoming(targetId: string, relationName?: string): UniversalEdge[] {
    return this.getEdgesFromIndex(this.targetMap, targetId, relationName)
  }

  private getEdgesFromIndex(
    indexMap: Map<string, Set<string>>,
    entityId: string,
    relationName?: string,
  ): UniversalEdge[] {
    const edgeIds = indexMap.get(entityId)
    if (!edgeIds || edgeIds.size === 0) return []

    const results: UniversalEdge[] = []
    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId)
      if (edge && (!relationName || edge.relation_name === relationName)) {
        results.push(edge)
      }
    }
    return results
  }

  /**
   * Checks if a relationship exists.
   */
  public hasRelation(endpoints: EdgeEndpointTuple): boolean
  public hasRelation(sourceId: string, relationName: string, targetId: string): boolean
  public hasRelation(
    endpointOrSourceId: string | EdgeEndpointTuple,
    relationName?: string,
    targetId?: string,
  ): boolean {
    return typeof endpointOrSourceId === 'object'
      ? this.findEdge(endpointOrSourceId) !== undefined
      : this.findEdge(endpointOrSourceId, relationName!, targetId!) !== undefined
  }

  /**
   * Returns target IDs connected via outgoing edges.
   */
  public getTargetIds(sourceId: string, relationName?: string): string[] {
    return this.getOutgoing(sourceId, relationName).map((e) => e.target_id)
  }

  /**
   * Returns source IDs connected via incoming edges.
   */
  public getSourceIds(targetId: string, relationName?: string): string[] {
    return this.getIncoming(targetId, relationName).map((e) => e.source_id)
  }

  /**
   * Finds an exact edge by source, relation, and target.
   */
  public findEdge(endpoints: EdgeEndpointTuple): UniversalEdge | undefined
  public findEdge(
    sourceId: string,
    relationName: string,
    targetId: string,
  ): UniversalEdge | undefined
  public findEdge(
    endpointOrSourceId: string | EdgeEndpointTuple,
    relationName?: string,
    targetId?: string,
  ): UniversalEdge | undefined {
    let src: string
    let rel: string
    let tgt: string
    if (typeof endpointOrSourceId === 'object') {
      src = endpointOrSourceId.sourceId
      rel = endpointOrSourceId.relationName
      tgt = endpointOrSourceId.targetId
    } else {
      src = endpointOrSourceId
      rel = relationName!
      tgt = targetId!
    }
    const outEdges = this.getOutgoing(src, rel)
    return outEdges.find((e) => e.target_id === tgt)
  }

  /**
   * Returns a snapshot of all edges.
   */
  public exportEdges(): UniversalEdge[] {
    return Array.from(this.edges.values())
  }

  /**
   * Hydrates the engine with existing edge records.
   */
  public importEdges(edges: UniversalEdge[]): void {
    this.clear()
    for (const edge of edges) {
      if (edge.metadata_json && !edge.metadata) {
        try {
          edge.metadata = JSON.parse(edge.metadata_json)
        } catch {
          // Keep raw or undefined
        }
      }
      this.addEdge(edge)
    }
  }

  public clear(): void {
    this.edges.clear()
    this.sourceMap.clear()
    this.targetMap.clear()
    this.relationMap.clear()
  }

  private addEdge(edge: UniversalEdge): void {
    this.edges.set(edge.id, edge)

    if (!this.sourceMap.has(edge.source_id)) {
      this.sourceMap.set(edge.source_id, new Set())
    }
    this.sourceMap.get(edge.source_id)!.add(edge.id)

    if (!this.targetMap.has(edge.target_id)) {
      this.targetMap.set(edge.target_id, new Set())
    }
    this.targetMap.get(edge.target_id)!.add(edge.id)

    if (!this.relationMap.has(edge.relation_name)) {
      this.relationMap.set(edge.relation_name, new Set())
    }
    this.relationMap.get(edge.relation_name)!.add(edge.id)
  }

  private removeEdge(edgeId: string): boolean {
    const edge = this.edges.get(edgeId)
    if (!edge) return false

    this.edges.delete(edgeId)

    const outSet = this.sourceMap.get(edge.source_id)
    if (outSet) {
      outSet.delete(edgeId)
      if (outSet.size === 0) this.sourceMap.delete(edge.source_id)
    }

    const inSet = this.targetMap.get(edge.target_id)
    if (inSet) {
      inSet.delete(edgeId)
      if (inSet.size === 0) this.targetMap.delete(edge.target_id)
    }

    const relSet = this.relationMap.get(edge.relation_name)
    if (relSet) {
      relSet.delete(edgeId)
      if (relSet.size === 0) this.relationMap.delete(edge.relation_name)
    }

    return true
  }
}
