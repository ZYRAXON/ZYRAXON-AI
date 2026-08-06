import initSqlJs from "sql.js"

const SQL = await initSqlJs()

class Statement {
  constructor(stmt, db) {
    this._stmt = stmt
    this._db = db
  }
  all(...params) {
    this._stmt.bind(params.length ? params : undefined)
    const rows = []
    while (this._stmt.step()) {
      rows.push(this._stmt.getAsObject())
    }
    this._stmt.reset()
    return rows
  }
  values(...params) {
    this._stmt.bind(params.length ? params : undefined)
    const rows = []
    while (this._stmt.step()) {
      rows.push(this._stmt.get())
    }
    this._stmt.reset()
    return rows
  }
  run(...params) {
    this._stmt.bind(params.length ? params : undefined)
    this._stmt.step()
    this._stmt.reset()
    return { changes: this._db.getRowsModified() }
  }
  safeIntegers() { return this }
}

class Database {
  constructor(filename, options) {
    this._readonly = options?.readonly ?? false
    if (!filename || filename === ":memory:") {
      this._db = new SQL.Database()
    } else {
      let data = undefined
      try {
        const fs = require("node:fs")
        if (fs.existsSync(filename)) {
          data = new Uint8Array(fs.readFileSync(filename))
        }
      } catch {}
      this._db = data ? new SQL.Database(data) : new SQL.Database()
    }
    if (!this._readonly) {
      try { this._db.run("PRAGMA journal_mode = WAL") } catch {}
    }
  }
  query(sql) {
    return new Statement(this._db.prepare(sql), this._db)
  }
  run(sql) {
    this._db.run(sql)
  }
  close() {
    this._db.close()
  }
  serialize() {
    return new Uint8Array(0)
  }
  loadExtension() {}
}

export { Database }
