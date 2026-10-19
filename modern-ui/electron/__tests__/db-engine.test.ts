import { describe, expect, it } from 'vitest'
import { toPgText, translateMysqlIdentsToPg } from '../db-engine'

describe('PostgreSQL SQL translation', () => {
  it('rewrites MySQL backticks used by Empty table / Drop table', () => {
    expect(translateMysqlIdentsToPg('TRUNCATE TABLE `letters`')).toBe('TRUNCATE TABLE "letters"')
    expect(translateMysqlIdentsToPg('DROP TABLE `order``s`')).toBe('DROP TABLE "order`s"')
    expect(toPgText('TRUNCATE TABLE `users` RESTART IDENTITY')).toBe('TRUNCATE TABLE "users" RESTART IDENTITY')
  })

  it('leaves string literals alone and still renumbers ? placeholders', () => {
    expect(translateMysqlIdentsToPg("SELECT `name` FROM `t` WHERE note = 'keep `ticks`'")).toBe(
      "SELECT \"name\" FROM \"t\" WHERE note = 'keep `ticks`'",
    )
    expect(toPgText('SELECT * FROM `t` WHERE a = ? AND b = ?')).toBe('SELECT * FROM "t" WHERE a = $1 AND b = $2')
  })
})
