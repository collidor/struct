import { describe, it, expect } from 'vitest'
import { f } from '../src/form'
import { extractValueDependencies } from '../src/form/utils/dataSource'

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

  describe('Declarative HTTP DataSource (.fromHttp)', () => {
    it('attaches a 100% serializable HttpDataSourceConfig and auto-extracts dependsOn', () => {
      const clusterField = f
        .string()
        .asSelect()
        .fromHttp({
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

      expect(clusterField.dataSource).toBeDefined()
      expect(clusterField.dataSource?.type).toBe('http')
      if (clusterField.dataSource?.type === 'http') {
        expect(clusterField.dataSource.method).toBe('GET')
        expect(clusterField.dataSource.url).toBe('/api/v1/clusters')
        expect(clusterField.dataSource.dependsOn).toEqual(
          expect.arrayContaining(['region', 'environment']),
        )
        expect(clusterField.dataSource.valueKey).toBe('clusterId')
      }

      // JSON round-trip test (zero functions)
      const serialized = JSON.stringify(clusterField.descriptor)
      const parsed = JSON.parse(serialized)
      expect(parsed.metadata.dataSource.type).toBe('http')
      expect(parsed.metadata.dataSource.dependsOn).toEqual(
        expect.arrayContaining(['region', 'environment']),
      )
    })
  })

  describe('Named Provider DataSource (.fromProvider)', () => {
    it('attaches ProviderDataSourceConfig with reactive parameter dependencies', () => {
      const usersField = f
        .array(f.string())
        .asCombobox({ multiple: true })
        .fromProvider('iam_users', {
          params: { department: '$values.org.department' },
          debounceMs: 300,
        })

      expect(usersField.dataSource).toBeDefined()
      expect(usersField.dataSource?.type).toBe('provider')
      if (usersField.dataSource?.type === 'provider') {
        expect(usersField.dataSource.key).toBe('iam_users')
        expect(usersField.dataSource.dependsOn).toEqual(['org'])
        expect(usersField.dataSource.debounceMs).toBe(300)
      }
    })
  })

  describe('Virtualization & Pagination (.virtual, .paginate)', () => {
    it('normalizes virtual scroll defaults on collection views', () => {
      const tableField = f
        .array(f.struct({ id: f.string(), name: f.string() }))
        .asTable()
        .virtual({ itemHeight: 48, overscan: 10, viewportHeight: '400px' })

      expect(tableField.virtualConfig).toEqual({
        enabled: true,
        itemHeight: 48,
        overscan: 10,
        viewportHeight: '400px',
        threshold: 100,
      })

      const comboboxField = f.array(f.string()).asCombobox().virtual(true)
      expect(comboboxField.virtualConfig).toEqual({
        enabled: true,
        itemHeight: 40,
        overscan: 5,
        viewportHeight: '320px',
        threshold: 100,
      })
    })

    it('normalizes pagination config on schemas', () => {
      const pagedField = f.array(f.string()).paginate(25)
      expect(pagedField.paginationConfig).toEqual({
        mode: 'pages',
        pageSize: 25,
      })
    })
  })

  describe('Form Node Resolution', () => {
    it('propagates dataSource, virtual, and dependsOn to FormFieldNode in resolveNodeTree', () => {
      const schema = f.struct('ClusterForm', {
        region: f.string().default('us-east-1'),
        cluster: f
          .string()
          .asSelect()
          .fromHttp({
            url: '/api/v1/clusters',
            query: { region: '$values.region' },
          }),
        members: f
          .array(f.string())
          .asCombobox({ multiple: true })
          .virtual({ itemHeight: 32 })
          .paginate(50),
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
  })
})
