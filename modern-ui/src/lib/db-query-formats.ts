export const ATS_DATABASES = ['ats_db_staging', 'ats_db'] as const

export type AtsDatabase = (typeof ATS_DATABASES)[number]

export interface DbQueryFormat {
  id: string
  /** Short label shown in the Database tab formats menu */
  name: string
  description?: string
  /** When set, selecting the format also switches the active database */
  database?: AtsDatabase
  /** SQL template; replace {{placeholders}} before running */
  sql: string
}

/** Built-in query templates for common ATS lookups. Add more entries here as needed. */
export const DB_QUERY_FORMATS: DbQueryFormat[] = [
  {
    id: 'container-lookup-staging',
    name: 'Container lookup (staging)',
    description: 'Find a row in container by container name',
    database: 'ats_db_staging',
    sql: `SELECT *
FROM container
WHERE container = '{{container}}'`,
  },
  {
    id: 'container-lookup-prod',
    name: 'Container lookup (prod)',
    description: 'Find a row in container by container name',
    database: 'ats_db',
    sql: `SELECT *
FROM container
WHERE container = '{{container}}'`,
  },
  {
    id: 'container-exists-staging',
    name: 'Container exists? (staging)',
    description: 'Quick check whether a container name is present',
    database: 'ats_db_staging',
    sql: `SELECT EXISTS(
  SELECT 1
  FROM container
  WHERE container = '{{container}}'
) AS container_exists`,
  },
  {
    id: 'container-exists-prod',
    name: 'Container exists? (prod)',
    description: 'Quick check whether a container name is present',
    database: 'ats_db',
    sql: `SELECT EXISTS(
  SELECT 1
  FROM container
  WHERE container = '{{container}}'
) AS container_exists`,
  },
]

/**
 * Returns formats applicable to the connected host.
 * When ATS databases are known, only formats for those databases are shown.
 * When not connected (or ATS DBs are missing), all built-in formats are listed.
 */
export function getQueryFormatsForDatabase(availableDatabases: string[]): DbQueryFormat[] {
  const atsAvailable = ATS_DATABASES.filter((name) => availableDatabases.includes(name))
  if (atsAvailable.length === 0) return DB_QUERY_FORMATS
  return DB_QUERY_FORMATS.filter((format) => !format.database || atsAvailable.includes(format.database))
}

/** Substitute {{key}} placeholders in a format SQL string. */
export function buildQueryFromFormat(format: DbQueryFormat, params: Record<string, string>): string {
  return format.sql.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => params[key] ?? `{{${key}}}`)
}
