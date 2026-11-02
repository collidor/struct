// oxlint-disable typescript/no-explicit-any
import { ArraySchema } from '../../builders/array'
import type { BaseSchema } from '../../core/base'
import type { ArrayDescriptor } from '../../types/ast'
import { cloneDescriptor } from '../../utils/clone'
import {
  TableViewConfig,
  ListViewConfig,
  CardsViewConfig,
  TabsViewConfig,
  TagsViewConfig,
  ComboboxViewConfig,
  CollectionViewMode,
} from '../types'
import {
  normalizeVirtualConfig,
  normalizePaginationConfig,
} from '../utils/dataSource'

/**
 * Enhanced ArraySchema with first-class UI Collection View Modes.
 * Allows unifying tables, lists, cards, tabs, and tags directly on array definitions.
 */
export class FormArraySchema<
  TItem extends BaseSchema<any, any> = BaseSchema<any, any>,
> extends ArraySchema<TItem> {
  constructor(itemSchema: TItem, descriptor: Partial<ArrayDescriptor> = {}) {
    super(itemSchema, descriptor)
  }

  public get collectionView(): CollectionViewMode | undefined {
    return (this.descriptor.metadata as Record<string, unknown> | undefined)
      ?.collectionView as CollectionViewMode | undefined
  }

  /**
   * Renders the array as a rich interactive data table.
   */
  public asTable(config: TableViewConfig = {}): this {
    const clone = this._clone()
    const currentMeta = clone.descriptor.metadata || {}
    const virtual = config.virtual !== undefined ? normalizeVirtualConfig(config.virtual) : currentMeta.virtual
    const pagination = config.paginate || config.pageSize ? normalizePaginationConfig(config.pageSize) : currentMeta.pagination

    clone.descriptor.metadata = {
      ...currentMeta,
      widget: 'table',
      collectionView: { mode: 'table', config },
      virtual,
      pagination,
      widgetProps: {
        ...((currentMeta.widgetProps as Record<string, unknown>) || {}),
        ...config,
      },
    }
    return clone as this
  }

  /**
   * Renders the array as a repeater list.
   */
  public asList(config: ListViewConfig = {}): this {
    const clone = this._clone()
    const currentMeta = clone.descriptor.metadata || {}
    const virtual = config.virtual !== undefined ? normalizeVirtualConfig(config.virtual) : currentMeta.virtual

    clone.descriptor.metadata = {
      ...currentMeta,
      widget: 'list',
      collectionView: { mode: 'list', config },
      virtual,
      widgetProps: {
        ...((currentMeta.widgetProps as Record<string, unknown>) || {}),
        ...config,
      },
    }
    return clone as this
  }


  /**
   * Renders the array items as responsive grid cards.
   */
  public asCards(config: CardsViewConfig = {}): this {
    const clone = this._clone()
    const currentMeta = clone.descriptor.metadata || {}
    clone.descriptor.metadata = {
      ...currentMeta,
      widget: 'cards',
      collectionView: { mode: 'cards', config },
      widgetProps: {
        ...((currentMeta.widgetProps as Record<string, unknown>) || {}),
        ...config,
      },
    }
    return clone as this
  }

  /**
   * Renders the array items as interactive tabs.
   */
  public asTabs(config: TabsViewConfig = {}): this {
    const clone = this._clone()
    const currentMeta = clone.descriptor.metadata || {}
    clone.descriptor.metadata = {
      ...currentMeta,
      widget: 'tabs',
      collectionView: { mode: 'tabs', config },
      widgetProps: {
        ...((currentMeta.widgetProps as Record<string, unknown>) || {}),
        ...config,
      },
    }
    return clone as this
  }

  /**
   * Renders the array as tags or chips.
   */
  public asTags(config: TagsViewConfig = {}): this {
    const clone = this._clone()
    const currentMeta = clone.descriptor.metadata || {}
    clone.descriptor.metadata = {
      ...currentMeta,
      widget: 'tags',
      collectionView: { mode: 'tags', config },
      widgetProps: {
        ...((currentMeta.widgetProps as Record<string, unknown>) || {}),
        ...config,
      },
    }
    return clone as this
  }

  /**
   * Renders the array as a searchable multi-select combobox.
   */
  public asCombobox(config: ComboboxViewConfig = {}): this {
    const clone = this._clone()
    const currentMeta = clone.descriptor.metadata || {}
    const virtual = config.virtual !== undefined ? normalizeVirtualConfig(config.virtual) : currentMeta.virtual

    clone.descriptor.metadata = {
      ...currentMeta,
      widget: 'combobox',
      collectionView: { mode: 'combobox', config },
      virtual,
      widgetProps: {
        ...((currentMeta.widgetProps as Record<string, unknown>) || {}),
        ...config,
      },
    }
    return clone as this
  }


  protected override _clone(): this {
    const newDesc = cloneDescriptor(this.descriptor)
    const clone = new FormArraySchema(this.itemSchema, newDesc) as this
    clone.refinements = [...this.refinements]
    return clone
  }
}
