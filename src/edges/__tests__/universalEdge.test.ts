import { describe, it, expect, beforeEach } from 'vitest'
import { UniversalEdgeEngine } from '../universalEdge'

describe('Universal Edge Graph Engine', () => {
  let edgeEngine: UniversalEdgeEngine

  beforeEach(() => {
    edgeEngine = new UniversalEdgeEngine()
  })

  it('links and unlinks entities with relations and metadata', () => {
    const edge = edgeEngine.link('char_1', 'EQUIPPED', 'item_sword', { slot: 'main_hand' })
    expect(edge.source_id).toBe('char_1')
    expect(edge.relation_name).toBe('EQUIPPED')
    expect(edge.target_id).toBe('item_sword')
    expect(edge.metadata).toEqual({ slot: 'main_hand' })

    expect(edgeEngine.hasRelation('char_1', 'EQUIPPED', 'item_sword')).toBe(true)
    expect(edgeEngine.getTargetIds('char_1', 'EQUIPPED')).toEqual(['item_sword'])

    const unlinked = edgeEngine.unlink('char_1', 'EQUIPPED', 'item_sword')
    expect(unlinked).toBe(true)
    expect(edgeEngine.hasRelation('char_1', 'EQUIPPED', 'item_sword')).toBe(false)
  })

  it('handles multi-directional queries', () => {
    edgeEngine.link('char_1', 'FOLLOWS', 'char_leader')
    edgeEngine.link('char_2', 'FOLLOWS', 'char_leader')
    edgeEngine.link('char_leader', 'ALLIED_WITH', 'faction_guild')

    const followers = edgeEngine.getSourceIds('char_leader', 'FOLLOWS')
    expect(followers).toHaveLength(2)
    expect(followers).toContain('char_1')
    expect(followers).toContain('char_2')

    const leaderOutgoing = edgeEngine.getOutgoing('char_leader')
    expect(leaderOutgoing).toHaveLength(1)
    expect(leaderOutgoing[0].target_id).toBe('faction_guild')
  })

  it('cascades entity deletions across both incoming and outgoing edges', () => {
    edgeEngine.link('party_lead', 'COMMANDS', 'goblin_1')
    edgeEngine.link('goblin_1', 'TARGETS', 'player_wizard')

    const deleted = edgeEngine.cascadeEntityDelete('goblin_1')
    expect(deleted).toBe(2)
    expect(edgeEngine.hasRelation('party_lead', 'COMMANDS', 'goblin_1')).toBe(false)
    expect(edgeEngine.hasRelation('goblin_1', 'TARGETS', 'player_wizard')).toBe(false)
  })

  it('exports and imports edge collections', () => {
    edgeEngine.link('node_a', 'CONNECTED_TO', 'node_b', { weight: 5 })
    const exported = edgeEngine.exportEdges()

    const newEngine = new UniversalEdgeEngine()
    newEngine.importEdges(exported)

    expect(newEngine.hasRelation('node_a', 'CONNECTED_TO', 'node_b')).toBe(true)
    const out = newEngine.getOutgoing('node_a')
    expect(out[0].metadata).toEqual({ weight: 5 })
  })
})
