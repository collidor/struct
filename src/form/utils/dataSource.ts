import type {
  HttpDataSourceConfig,
  ProviderDataSourceConfig,
  VirtualScrollConfig,
  AsyncPaginationConfig,
} from '../../types/ast'

/**
 * Recursively scans an object, array, or string for tokens matching `$values.<field>`
 * and extracts the distinct root field dependencies.
 */
export function extractValueDependencies(obj: unknown): string[] {
  const deps = new Set<string>()
  if (!obj || typeof obj !== 'object') return []

  const visit = (val: unknown) => {
    if (typeof val === 'string') {
      const matches = val.matchAll(/\$values\.([a-zA-Z0-9_.-]+)/g)
      for (const m of matches) {
        if (m[1]) {
          const rootProp = m[1].split('.')[0]
          if (rootProp) deps.add(rootProp)
        }
      }
    } else if (Array.isArray(val)) {
      for (const item of val) visit(item)
    } else if (typeof val === 'object' && val !== null) {
      for (const v of Object.values(val)) visit(v)
    }
  }

  visit(obj)
  return Array.from(deps)
}

/**
 * Normalizes an HTTP data source config and automatically computes `dependsOn`.
 */
export function normalizeHttpConfig(
  config: Omit<HttpDataSourceConfig, 'type'>,
): HttpDataSourceConfig {
  const extractedDeps = [
    ...extractValueDependencies(config.query),
    ...extractValueDependencies(config.body),
    ...extractValueDependencies(config.headers),
    ...extractValueDependencies(config.url),
  ]
  const combinedDeps = Array.from(
    new Set([...(config.dependsOn || []), ...extractedDeps]),
  )

  return {
    ...config,
    type: 'http',
    method: config.method || 'GET',
    dependsOn: combinedDeps,
  }
}

/**
 * Normalizes a provider data source config and automatically computes `dependsOn`.
 */
export function normalizeProviderConfig(
  key: string,
  config?: Omit<ProviderDataSourceConfig, 'type' | 'key'>,
): ProviderDataSourceConfig {
  const extractedDeps = extractValueDependencies(config?.params)
  const combinedDeps = Array.from(
    new Set([...(config?.dependsOn || []), ...extractedDeps]),
  )

  return {
    ...config,
    type: 'provider',
    key,
    dependsOn: combinedDeps,
  }
}

/**
 * Normalizes a virtual scroll config.
 */
export function normalizeVirtualConfig(
  config?: Partial<VirtualScrollConfig> | boolean,
): VirtualScrollConfig {
  if (config === true || config === undefined) {
    return {
      enabled: true,
      itemHeight: 40,
      overscan: 5,
      viewportHeight: '320px',
      threshold: 100,
    }
  }
  if (config === false) {
    return { enabled: false }
  }
  return {
    enabled: config.enabled ?? true,
    itemHeight: config.itemHeight ?? 40,
    overscan: config.overscan ?? 5,
    viewportHeight: config.viewportHeight ?? '320px',
    threshold: config.threshold ?? 100,
  }
}

/**
 * Normalizes pagination configuration.
 */
export function normalizePaginationConfig(
  config?: Partial<AsyncPaginationConfig> | number,
): AsyncPaginationConfig {
  if (typeof config === 'number') {
    return { mode: 'pages', pageSize: config }
  }
  return {
    mode: config?.mode || 'pages',
    pageSize: config?.pageSize ?? 50,
  }
}
