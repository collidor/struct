import { describe, it, expect } from 'vitest'
import { s } from '../src'
import { f } from '../src/form'
import {
  extractValueDependencies,
  normalizeHttpConfig,
  normalizeProviderConfig,
  normalizeVirtualConfig,
  normalizePaginationConfig,
} from '../src/form/utils/dataSource'

describe('Serializable DataSource & Virtualization AST (Ticket 008)', () => {
  describe('extractValueDependencies', () => {
    it('extracts root property names from $values.<field> tokens', () => {
      const query = {
        region: '$values.region',
        role: '$values.auth.role',
        search: '$search',
        limit: 50,
      }
      const deps = extractValueDependencies(query)
      expect(deps).toContain('region')
      expect(deps).toContain('auth')
      expect(deps).not.toContain('search')
      expect(deps.length).toBe(2)
    })
  })

  describe('Declarative HTTP DataSource (normalizeHttpConfig)', () => {
    it('builds a 100% serializable HttpDataSourceConfig and auto-extracts dependsOn', () => {
      const dataSource = normalizeHttpConfig({
        url: '/api/v1/clusters',
        query: {
          region: '$values.region',
          env: '$values.environment',
          q: '$search',
          page: '$page',
        },
        responseItemsPath: 'data.clusters',
        valueKey: 'clusterId',
        labelKey: 'clusterName',
      })

      expect(dataSource.type).toBe('http')
      expect(dataSource.method).toBe('GET')
      expect(dataSource.url).toBe('/api/v1/clusters')
      expect(dataSource.dependsOn).toEqual(expect.arrayContaining(['region', 'environment']))
      expect(dataSource.valueKey).toBe('clusterId')

      // JSON round-trip test (zero functions)
      const parsed = JSON.parse(JSON.stringify(dataSource))
      expect(parsed.type).toBe('http')
      expect(parsed.dependsOn).toEqual(expect.arrayContaining(['region', 'environment']))
    })

    it('keeps explicit dependsOn and merges it with extracted dependencies', () => {
      const dataSource = normalizeHttpConfig({
        url: '/api/items',
        method: 'POST',
        body: { region: '$values.region' },
        dependsOn: ['manual'],
      })
      expect(dataSource.method).toBe('POST')
      expect(dataSource.dependsOn).toEqual(expect.arrayContaining(['manual', 'region']))
      expect(dataSource.dependsOn?.length).toBe(2)
    })
  })

  describe('Named Provider DataSource (normalizeProviderConfig)', () => {
    it('builds ProviderDataSourceConfig with reactive parameter dependencies', () => {
      const dataSource = normalizeProviderConfig('iam_users', {
        params: { department: '$values.org.department' },
        debounceMs: 300,
      })

      expect(dataSource.type).toBe('provider')
      expect(dataSource.key).toBe('iam_users')
      expect(dataSource.dependsOn).toEqual(['org'])
      expect(dataSource.debounceMs).toBe(300)
    })
  })

  describe('Virtualization & Pagination normalization', () => {
    it('normalizes virtual scroll defaults', () => {
      expect(
        normalizeVirtualConfig({ itemHeight: 48, overscan: 10, viewportHeight: '400px' }),
      ).toEqual({
        enabled: true,
        itemHeight: 48,
        overscan: 10,
        viewportHeight: '400px',
        threshold: 100,
      })

      expect(normalizeVirtualConfig(true)).toEqual({
        enabled: true,
        itemHeight: 40,
        overscan: 5,
        viewportHeight: '320px',
        threshold: 100,
      })
      expect(normalizeVirtualConfig(false)).toEqual({ enabled: false })
    })

    it('normalizes pagination config', () => {
      expect(normalizePaginationConfig(25)).toEqual({ mode: 'pages', pageSize: 25 })
      expect(normalizePaginationConfig({ mode: 'infinite' })).toEqual({
        mode: 'infinite',
        pageSize: 50,
      })
    })
  })

  describe('Form Node Resolution (f.field options)', () => {
    it('propagates dataSource, virtual, and dependsOn to FormFieldNode in toFormTree', () => {
      const schema = f.struct('ClusterForm', {
        region: s.string().default('us-east-1'),
        cluster: f.field(s.string(), {
          dataSource: normalizeHttpConfig({
            url: '/api/v1/clusters',
            query: { region: '$values.region' },
          }),
        }),
        members: f.field(s.array(s.string()), {
          widget: f.combobox({ multiple: true }),
          virtual: normalizeVirtualConfig({ itemHeight: 32 }),
          pagination: normalizePaginationConfig(50),
        }),
      })

      const tree = schema.toFormTree({ region: 'eu-west-1' })
      const clusterNode = tree.fieldsByKey.cluster
      expect(clusterNode).toBeDefined()
      expect(clusterNode.dataSource?.type).toBe('http')
      expect(clusterNode.dependsOn).toEqual(['region'])

      const membersNode = tree.fieldsByKey.members
      expect(membersNode).toBeDefined()
      expect(membersNode.virtual?.itemHeight).toBe(32)
      expect(membersNode.pagination?.pageSize).toBe(50)

      // Entire tree must be serializable
      const jsonTree = JSON.stringify(tree)
      expect(jsonTree).toBeTruthy()
      expect(() => JSON.parse(jsonTree)).not.toThrow()
    })

    it('accepts dataSource config directly on the field options', () => {
      const schema = f.struct({
        users: f.field(s.array(s.string()), {
          widget: f.combobox({ multiple: true }),
          dataSource: normalizeProviderConfig('iam_users', {
            params: { department: '$values.org.department' },
            debounceMs: 300,
          }),
        }),
      })
      const node = schema.toFormTree({}).fieldsByKey.users
      expect(node.dataSource?.type).toBe('provider')
      expect(node.dependsOn).toEqual(['org'])
    })
  })
})
