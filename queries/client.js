const fs = require("fs");
const path = require("path");
const {
    Database,
    OPEN_READWRITE,
    OPEN_CREATE,
    OPEN_FULLMUTEX,
} = require("sqlite3");

class Client {
    /**
     * @param {string} filename The sqlite3 database filename
     */
    constructor(filename) {
        this.db = null;
        this.dbOpen = false;
        this.lastOperation = Date.now();
        this.interval = null;

        /**
         * @description Opens a connection to the database. No-op if the connection is already open.
         * @description Starts an interval. If the last operation
         */
        this.open = () => {
            if (this.dbOpen) {
                return;
            }

            this.dbOpen = true;

            const openMode = OPEN_READWRITE | OPEN_CREATE | OPEN_FULLMUTEX;

            let success = true;

            const db = new Database(filename, openMode, function (error) {
                if (error) {
                    console.error(error);
                    success = false;
                }
            });

            if (success) this.db = db;
            else return success;

            return success;
        };

        /**
         * @description Close the existing database connection
         */
        this.close = () => {
            if (!this.dbOpen || !this.db) return;

            this.db.close(function (error) {
                if (error) {
                    console.error(error);
                }
            });

            clearInterval(this.interval);
            this.interval = null;
        };

        /**
         * @description Check if the database is open. If not, attempt to open it. If error, return a result to be consumed by the client
         */
        this.checkOpenWithResult = () => {
            if (!this.dbOpen || !this.db) {
                const success = this.open();

                if (success) return null;

                return {
                    error: "Database connection is not open yet",
                };
            }

            return null;
        };

        /**
         * @param {string} sql The sql query to run
         * @param {string[]} params The parameters to pass into the query
         * @returns {object} The result object of the query
         */
        this.run = (sql, params) => {
            let result = this.checkOpenWithResult();

            if (result) {
                return result;
            }

            return new Promise((resolve, reject) => {
                this.db.run(sql, params, function (error) {
                    this.lastOperation = Date.now();
                    if (error) {
                        reject({
                            error,
                        });
                    } else {
                        resolve({
                            success: true,
                            changes: this.changes,
                            lastID: this.lastID
                        });
                    }
                });
            });
        };

        /**
         * @param {string} sql The sql query to run
         * @param {string[]} params The parameters to pass into the query
         * @returns {object} The result object of the query containing all rows or an error
         */
        this.all = (sql, params) => {
            let checkError = this.checkOpenWithResult();

            if (checkError) {
                return checkError;
            }

            return new Promise((resolve, reject) => {
                this.db.all(sql, params, (error, rows) => {
                    this.lastOperation = Date.now();
                    if (error) {
                        reject({
                            error,
                            rows: [],
                        });
                    } else {
                        resolve({
                            success: true,
                            rows,
                        });
                    }
                });
            });
        };

        /**
         * @param {string} sql The sql query to run
         * @param {string[]} params The parameters to pass into the query
         * @returns {object} The result object of the query containing the row or an error
         */
        this.get = (sql, params) => {
            let checkError = this.checkOpenWithResult();

            if (checkError) {
                return checkError;
            }

            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (error, row) => {
                    this.lastOperation = Date.now();
                    if (error) {
                        reject({
                            error,
                            row: [],
                        });
                    } else {
                        resolve({
                            success: true,
                            row,
                        });
                    }
                });
            });
        };

        this.migrate = async () => {
            try {
                this.open();

                const migrationsPath = path.join(
                    __dirname,
                    "../db/migrations.sql",
                );

                const migrations = fs.readFileSync(migrationsPath, "utf-8");

                const statements = migrations
                    .split(";")
                    .map((s) => s.trim())
                    .filter(Boolean);

                for (const stmt of statements) {
                    await this.run(stmt, []).catch(() =>
                        console.error(
                            "migration failed, likely because it was already run",
                        ),
                    );
                }
            } catch (err) {
                console.error("error running migrations: " + err);
            }
        };
    }
}

module.exports = { Client };
