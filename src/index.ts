// 1. Fluent Builder namespace
export { s, struct } from './builders/index'

// 2. Concrete Builder Classes
export {
  StringSchema,
  NumberSchema,
  BooleanSchema,
  DateSchema,
  BigIntSchema,
  NullSchema,
  AnySchema,
  AnySchemaClass,
} from './builders/primitives'
export { StructSchema } from './builders/struct'
export { ArraySchema } from './builders/array'
export { RecordSchema } from './builders/record'
export { EnumSchema, LiteralSchema } from './builders/enum'
export { UnionSchema, TupleSchema } from './builders/union'
export { TransformSchema, PipeSchema, type TransformFn } from './builders/transform'

export {
  BaseSchema,
  type ValidateResult,
  type ValidateAsyncResult,
} from './core/base'
export {
  StructValidationError,
  formatIssuePath,
  type StructIssue,
  type FlattenedErrors,
  type FormattedError,
} from './core/errors'

// 4. Dynamic Form Builder Engine
export { StructBuilder, type DynamicFieldOptions } from './dynamic/structBuilder'
export { getFormFields, inferWidget, type FormFieldDescriptor } from './dynamic/formInspector'

// 5. Interoperability Bridges
export { toJSONSchema, fromJSONSchema } from './bridges/jsonSchema'
export { toZod, fromZod } from './bridges/zod'
export { toAxonPort, isAssignable, getAxonDataType, type AxonPortContract } from './bridges/axon'
export { toVeeValidateSchema, type TypedSchema } from './bridges/veeValidate'

// 6. Utilities
export { generateDefaultValue } from './utils/defaults'
export { cloneDescriptor } from './utils/clone'

// 7. Schema, Storage & DDL Engine
export {
  generateBaseTablesDDL,
  generateStructDDL,
  formatColumnDefinition,
  getStructTableName,
  typeDescriptorToSQLType,
  getStructColumnMappings,
  type SQLDialect,
  type GenerateDDLOptions,
} from './schema/ddl'
export { SQLiteMemoryDatabase, SQLiteEntityStoreAdapter } from './schema/sqliteAdapter'
export type {
  StorageClass,
  FieldVisibility,
  EntityMetadata,
  EntityRecord,
  StructFieldMapping,
  SQLType,
} from './schema/storage'
export {
  SchemaMigrationEngine,
  clearMigrations,
  type SchemaDiff,
  type MigrationScript,
} from './schema/migrator'

// 8. Relational Storage & Universal Edges
export {
  UniversalEdgeEngine,
  type UniversalEdge,
  type EdgeEndpointTuple,
  type EdgeKey,
} from './edges/universalEdge'

// 9. AST In-Memory Computed Properties
export {
  evaluateAST,
  evaluateExpression,
  ComputedPropertiesEngine,
  type ASTExpression,
  type ASTEvaluationContext,
  type ComputedPropertyDef,
} from './computed/astEvaluator'
export {
  parseExpression,
  tokenize,
  extractDependencies,
  type Token,
  type TokenType,
} from './computed/expressionParser'

// 10. Structural Capability Architecture (Odin-Inspired)
export {
  ComponentResolutionError,
  getComponentName,
  getComponent,
  hasComponent,
  satisfies,
  extractComponents,
  StandardComponents,
  StandardCapabilities,
  CapabilityValidator,
  lowerFirst,
  upperFirst,
  type NamedStruct,
  type NamedComponent,
  type ComponentKey,
  type StructuralCapability,
  type CapabilityFieldRequirement,
  type CapabilityValidationResult,
} from './capabilities/index'

// 11. Types
export type * from './types/ast'
export type * from './types/standard'
export type * from './types/inference'
