/**
 * The Contract IR — what CoreEdge knows about an OData service from its own
 * description ($metadata), in one shape for V2 EDMX, V4 CSDL XML and V4 CSDL
 * JSON (P1.3).
 *
 * THE SINGLE SOURCE. Everything downstream that needs to know the shape of an
 * interface — the JSON Schemas, the northbound OpenAPI, the semver diff, and
 * later the twin (P1.6), field grants (P1.5) and the query surface (P1.4) —
 * reads this, never the XML. The XML is parsed exactly once, by csdl-xml.ts.
 *
 * WHAT IT RECORDS AND WHAT IT DOES NOT. Structure (types, keys, properties with
 * their facets, navigations, operations), the capability flags a consumer must
 * respect (V2 `sap:creatable` and friends, V4 `Capabilities.*`), labels
 * (`sap:label`, `Common.Label`) and PersonalData annotations. It does not keep
 * UI annotations, value helps, or any annotation it does not interpret: an IR
 * that carried everything would hash differently every time SAP touched a UI
 * hint, and every such change would look like a new contract.
 *
 * Every optional field is OMITTED rather than set to undefined, so the
 * canonical JSON (canonical.ts) — and with it the content hash — depends only
 * on what the document said.
 */

export const CONTRACT_IR_VERSION = 1 as const;

export type ODataVersion = "V2" | "V4";

/** Personal-data annotations (SAP PersonalData vocabulary [E46]), as stated. */
export interface IrPersonalData {
  /** PersonalData.IsPotentiallyPersonal */
  isPotentiallyPersonal?: boolean;
  /** PersonalData.IsPotentiallySensitive */
  isPotentiallySensitive?: boolean;
  /** PersonalData.FieldSemantics, e.g. "DataSubjectID". */
  fieldSemantics?: string;
}

/** Capability flags of a single property. Absent = the document said nothing. */
export interface IrPropertyCapabilities {
  /** V2 sap:creatable; false = may not be sent on create. */
  creatable?: boolean;
  /** V2 sap:updatable; false = may not be changed. */
  updatable?: boolean;
  /** V2 sap:filterable / V4 FilterRestrictions.NonFilterableProperties. */
  filterable?: boolean;
  /** V2 sap:sortable / V4 SortRestrictions.NonSortableProperties. */
  sortable?: boolean;
  /** V2 sap:required-in-filter / V4 FilterRestrictions.RequiredProperties. */
  requiredInFilter?: boolean;
  /** V4 Core.Computed: set by the service, never by the client. */
  computed?: boolean;
  /** V4 Core.Immutable: set on create, never changed. */
  immutable?: boolean;
  /**
   * The client must send it on create: V4 `Common.FieldControl` Mandatory, or
   * SuccessFactors' `sap:required`. NOT inferred from Nullable="false": SAP
   * fills an omitted non-nullable field with its initial value, so a
   * non-nullable property is not a required input.
   */
  mandatory?: boolean;
}

export interface IrProperty {
  name: string;
  /** Qualified type: `Edm.String`, or a complex/enum type's qualified name. */
  type: string;
  /** `Collection(...)` in the document. */
  collection?: true;
  nullable: boolean;
  /** A number, or "max". */
  maxLength?: number | "max";
  precision?: number;
  /** A number, "variable" or "floating". */
  scale?: number | "variable" | "floating";
  fixedLength?: boolean;
  defaultValue?: string;
  /** sap:label / Common.Label */
  label?: string;
  /** sap:quickinfo / Common.QuickInfo */
  quickInfo?: string;
  /** V2 sap:display-format, e.g. "Date" on an Edm.DateTime that carries a date only. */
  displayFormat?: string;
  /** V2 sap:semantics (vCard and others: "email", "tel", "name", "currency-code", …). */
  semantics?: string;
  capabilities?: IrPropertyCapabilities;
  personalData?: IrPersonalData;
}

export interface IrNavigation {
  name: string;
  /** Qualified target entity type. */
  target: string;
  collection: boolean;
  nullable?: boolean;
  partner?: string;
  containsTarget?: true;
  /** V4 ReferentialConstraint: dependent property → principal property. */
  referentialConstraints?: { property: string; referencedProperty: string }[];
}

export interface IrEntityPersonalData {
  /** PersonalData.EntitySemantics: DataSubject | DataSubjectDetails | Other. */
  entitySemantics?: string;
  /** PersonalData.DataSubjectRole */
  dataSubjectRole?: string;
}

export interface IrStructuredType {
  name: string;
  /** namespace + "." + name */
  qualifiedName: string;
  baseType?: string;
  abstract?: true;
  openType?: true;
  label?: string;
  properties: IrProperty[];
  navigations: IrNavigation[];
}

export interface IrEntityType extends IrStructuredType {
  /** Key property names, in key order (inherited from the base type when not declared). */
  key: string[];
  hasStream?: true;
  personalData?: IrEntityPersonalData;
}

export type IrComplexType = IrStructuredType;

export interface IrEnumType {
  name: string;
  qualifiedName: string;
  underlyingType: string;
  isFlags?: true;
  members: { name: string; value: string }[];
}

/** Capability flags of an entity set. Absent = the document said nothing. */
export interface IrEntitySetCapabilities {
  /** V2 sap:creatable / V4 InsertRestrictions.Insertable */
  creatable?: boolean;
  /** V2 sap:updatable / V4 UpdateRestrictions.Updatable */
  updatable?: boolean;
  /** V2 sap:deletable / V4 DeleteRestrictions.Deletable */
  deletable?: boolean;
  /** V2 sap:addressable (false = no access by key) */
  addressable?: boolean;
  /** V2 sap:pageable / V4 TopSupported+SkipSupported */
  pageable?: boolean;
  topSupported?: boolean;
  skipSupported?: boolean;
  /** V2 sap:countable / V4 CountRestrictions.Countable */
  countable?: boolean;
  /** V2 sap:searchable / V4 SearchRestrictions.Searchable */
  searchable?: boolean;
  /** V4 FilterRestrictions.Filterable */
  filterable?: boolean;
  /** V2 sap:requires-filter / V4 FilterRestrictions.RequiresFilter */
  requiresFilter?: boolean;
  /** V4 SortRestrictions.Sortable */
  sortable?: boolean;
  /** V4 SelectSupport.Supported */
  selectSupported?: boolean;
  /** V4 ExpandRestrictions.Expandable */
  expandable?: boolean;
  /** V4 FilterRestrictions.NonFilterableProperties (property paths). */
  nonFilterableProperties?: string[];
  /** V4 FilterRestrictions.RequiredProperties (property paths). */
  requiredFilterProperties?: string[];
  /** V4 SortRestrictions.NonSortableProperties (property paths). */
  nonSortableProperties?: string[];
}

export interface IrEntitySet {
  name: string;
  /** Qualified entity type. */
  entityType: string;
  /** A V4 singleton: one instance, no collection. */
  singleton?: true;
  label?: string;
  capabilities: IrEntitySetCapabilities;
  /** V4 NavigationPropertyBinding: navigation path → target entity set. */
  navigationBindings?: { path: string; target: string }[];
}

export interface IrParameter {
  name: string;
  type: string;
  collection?: true;
  nullable: boolean;
  /** V2 FunctionImport parameter Mode (In | Out | InOut). */
  mode?: string;
}

export interface IrOperation {
  /** The name a caller invokes: the import's name, or the action/function's. */
  name: string;
  kind: "action" | "function";
  /** Bound to an entity type (V4); its binding parameter is the first parameter. */
  bound?: true;
  /** Qualified type of the binding parameter, for a bound operation. */
  bindingType?: string;
  bindingCollection?: true;
  /** V2 m:HttpMethod (GET → function, POST/PUT/MERGE/DELETE → action). */
  httpMethod?: string;
  /** The entity set the result belongs to (V2 EntitySet, V4 import EntitySet). */
  entitySet?: string;
  parameters: IrParameter[];
  returnType?: { type: string; collection?: true; nullable?: boolean };
  label?: string;
}

export interface ContractIR {
  irVersion: typeof CONTRACT_IR_VERSION;
  odataVersion: ODataVersion;
  /** The Edmx Version attribute ("1.0", "4.0", "4.01") or the JSON $Version. */
  edmxVersion: string;
  /** V2 m:DataServiceVersion, when stated. */
  dataServiceVersion?: string;
  /** Schema namespaces, in document order. */
  namespaces: string[];
  /** The entity container's qualified name. */
  container?: string;
  entityTypes: IrEntityType[];
  complexTypes: IrComplexType[];
  enumTypes: IrEnumType[];
  entitySets: IrEntitySet[];
  operations: IrOperation[];
}

/**
 * The slice of a service ONE INTERFACE is a contract for: its entity set, that
 * set's entity type (with inherited properties folded in), the complex and
 * enum types it reaches, the navigations it declares (targets by name only),
 * and the operations bound to it or returning into it.
 *
 * WHY A SLICE. API_BUSINESS_PARTNER declares some forty entity sets. An
 * interface on A_BusinessPartner must not change version when SAP adds a field
 * to A_BusinessPartnerBank, so the hash, the diff and the snapshot are all over
 * this slice, not the whole service.
 */
export interface InterfaceContract {
  irVersion: typeof CONTRACT_IR_VERSION;
  odataVersion: ODataVersion;
  /** How the slice was described: from the service's own $metadata, or inferred from sampled rows. */
  source: ContractSource;
  entitySet: IrEntitySet;
  entityType: IrEntityType;
  complexTypes: IrComplexType[];
  enumTypes: IrEnumType[];
  operations: IrOperation[];
}

/**
 * METADATA — compiled from the service's own description.
 * SAMPLED — inferred from rows a live read returned (schema-capture.ts), the
 *           fallback when no description could be read. Its properties carry
 *           the observed JSON type in `type` as `x-json:<type>` and no keys.
 */
export type ContractSource = "METADATA" | "SAMPLED";

/** The `type` a sampled property carries: what JSON type was observed, if any. */
export const SAMPLED_TYPE_PREFIX = "x-json:";
