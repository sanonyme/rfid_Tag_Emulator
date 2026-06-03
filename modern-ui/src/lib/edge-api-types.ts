/**
 * Types aligned with Edge OpenAPI (`src/assets/edge-openapi.json`).
 */

/** components.schemas.authenticateBody — POST /ALE/api/auth */
export type AuthenticateBody = {
  username: string
  password: string
}

/** components.schemas.invokeBlockBody_params — Pair { key, value } */
export type InvokeBlockBodyParams = {
  key: string
  value: string
}

/** components.schemas.invokeBlockBody — POST /ALE/api/activity/invoke */
export type InvokeBlockBody = {
  name: string
  activityName?: string
  params?: InvokeBlockBodyParams[]
}

/** components.schemas.serialInvokeBlocks — POST /ALE/api/activity/serialinvoke */
export type SerialInvokeBlocksBody = {
  activityName: string
  params?: InvokeBlockBodyParams[]
}

export type DefineBlockBodyListItem = {
  name: string
  type?: string
  editor?: string
}

export type DefineBlockBody = {
  name?: string
  list?: DefineBlockBodyListItem[]
}

/** Edge GET /param often returns `LogicalDevice:String` — invoke Pair.key must be `LogicalDevice`. */
const EDGE_PARAM_TYPE_SUFFIX =
  /:(String|Integer|Boolean|Long|Double|Float|Short|Byte|Character|Object)$/i

export function edgeParamInvokeKey(nameOrKey: string): string {
  const m = nameOrKey.match(EDGE_PARAM_TYPE_SUFFIX)
  return m ? nameOrKey.slice(0, -m[0].length) : nameOrKey
}

export function parseEdgeParamName(
  raw: string,
  explicitType?: string,
): { name: string; type?: string } {
  const name = edgeParamInvokeKey(raw.trim())
  const typeFromSuffix =
    raw !== name ? raw.slice(name.length + 1) : undefined
  return {
    name,
    type: explicitType ?? typeFromSuffix,
  }
}

export function recordToInvokeParams(
  paramValues: Record<string, unknown>,
  orderedNames?: string[],
): InvokeBlockBodyParams[] {
  const entries: [string, unknown][] = orderedNames?.length
    ? orderedNames.map((name) => [name, paramValues[name]] as [string, unknown])
    : Object.entries(paramValues)

  return entries
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => ({
      key: edgeParamInvokeKey(key),
      value: String(value).trim(),
    }))
}

/**
 * Bruno / Edge UI / serialInvokeBlocks shape:
 * `{ "activityName": "Block1", "params": [{ "key": "In", "value": "true" }] }`
 */
export function buildSerialInvokeBody(
  blockName: string,
  paramValues: Record<string, unknown>,
  orderedNames?: string[],
): SerialInvokeBlocksBody {
  const params = recordToInvokeParams(paramValues, orderedNames)
  const body: SerialInvokeBlocksBody = { activityName: blockName }
  if (params.length > 0) body.params = params
  return body
}

/** OpenAPI invokeBlockBody also lists required `name` — include both for /activity/invoke. */
export function buildInvokeBlockBody(
  blockName: string,
  paramValues: Record<string, unknown>,
  orderedNames?: string[],
): InvokeBlockBody {
  const serial = buildSerialInvokeBody(blockName, paramValues, orderedNames)
  return {
    name: blockName,
    activityName: serial.activityName,
    params: serial.params,
  }
}

export function isLogicalDeviceParam(def: { name: string; type?: string; editor?: string }): boolean {
  if (/logical\s*device/i.test(def.name)) return true
  if (def.type && /logical\s*device/i.test(def.type)) return true
  if (def.editor && /logical\s*device/i.test(def.editor)) return true
  return false
}
