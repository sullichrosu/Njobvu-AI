const fs = require('fs');
const path = require('path');

const LEVELS = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
};

const LEVEL_SEVERITY = {
    [LEVELS.ERROR]: 0,
    [LEVELS.WARN]: 1,
    [LEVELS.INFO]: 2,
    [LEVELS.DEBUG]: 3
};

const LOG_FILE_PATH = path.join(process.cwd(), 'server.log');

class Logger {
    constructor() {
        this.level = process.env.LOG_LEVEL || LEVELS.INFO;
    }

    setLevel(level) {
        if (Object.values(LEVELS).includes(level)) {
            this.level = level;
        }
    }

    _shouldLog(level) {
        const currentSeverity = LEVEL_SEVERITY[this.level] ?? 2;
        const targetSeverity = LEVEL_SEVERITY[level] ?? 2;
        return targetSeverity <= currentSeverity;
    }

    _getCallerInfo() {
        const obj = {};
        Error.captureStackTrace(obj, this._write);

        const stack = obj.stack;
        if (!stack) return null;

        const lines = stack.split('\n');

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];

            // Path separator is platform-dependent (Windows stack frames use backslashes), so match
            // both to actually skip logger.js's own wrapper frames instead of always falling through.
            if (/utils[\\/]logger\.js/.test(line) || line.includes('node:internal') || line.includes('(node:')) {
                continue;
            }

            const match = line.match(/(?:\(([^)]+)\)|at\s+([^\s]+)$)/);

            if (!match) {
                continue;
            }

            const location = match[1] || match[2];
            // Match trailing ":<line>:<col>" and treat everything before it as the file path.
            // A naive split(':') breaks on Windows absolute paths (e.g. "C:\\...\\file.js:30:36"),
            // since the drive letter's colon gets treated as the first delimiter.
            const locationMatch = location.match(/^(.*):(\d+):(\d+)$/);

            if (locationMatch) {
                const filePath = locationMatch[1];
                const lineNo = locationMatch[2];

                if (filePath.includes('node_modules')) {
                    continue;
                }

                // Normalize to forward slashes so log output is consistent across platforms
                // (path.relative returns backslash-separated paths on Windows).
                const relativePath = path.relative(process.cwd(), filePath).split(path.sep).join('/');

                return {
                    file: relativePath,
                    line: parseInt(lineNo, 10)
                };
            }
        }
        return null;
    }

    _format(level, message, meta) {
        let msgStr = '';
        let stackStr = undefined;
        let additionalMeta = undefined;

        if (message instanceof Error) {
            msgStr = message.message;
            stackStr = message.stack;
        } else if (typeof message === 'object' && message !== null) {
            if (message.error) {
                const errObj = message.error;
                msgStr = errObj.message || String(errObj);
                stackStr = errObj.stack;
                additionalMeta = { error: errObj.message || String(errObj) };
            } else {
                msgStr = message.message || JSON.stringify(message);
                stackStr = message.stack;
            }
        } else {
            msgStr = String(message);
        }

        const logObject = {
            timestamp: new Date().toISOString(),
            level,
            message: msgStr
        };

        const callerInfo = this._getCallerInfo();
        if (callerInfo) {
            logObject.source = callerInfo;
        }

        if (stackStr) {
            logObject.stack = stackStr;
        }

        if (additionalMeta) {
            logObject.meta = additionalMeta;
        }

        if (meta !== undefined && meta !== null) {
            if (meta instanceof Error) {
                logObject.stack = logObject.stack || meta.stack;
                logObject.meta = { ...logObject.meta, message: meta.message };
            } else if (typeof meta === 'object') {
                logObject.meta = { ...logObject.meta, ...meta };
            } else {
                logObject.meta = { ...logObject.meta, value: meta };
            }
        }

        return JSON.stringify(logObject);
    }

    _write(level, message, meta) {
        if (!this._shouldLog(level)) {
            return;
        }

        const formatted = this._format(level, message, meta);

        if (level === LEVELS.ERROR) {
            console.error(formatted);
        } else {
            console.log(formatted);
        }

        // fire and forget
        try {
            fs.appendFile(LOG_FILE_PATH, formatted + '\n', (err) => {
                if (err) {
                    process.stderr.write(`Failed to write to log file: ${err.message}\n`);
                }
            });
        } catch (e) {
            // catch block for filesystem errors
        }
    }

    error(message, meta) {
        this._write(LEVELS.ERROR, message, meta);
    }

    warn(message, meta) {
        this._write(LEVELS.WARN, message, meta);
    }

    info(message, meta) {
        this._write(LEVELS.INFO, message, meta);
    }

    debug(message, meta) {
        this._write(LEVELS.DEBUG, message, meta);
    }
}

const logger = new Logger();

logger.requestMiddleware = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const url = req.originalUrl || req.url;
        // static asset patterns
        const staticAssetRegex = /\.(css|js|png|jpg|jpeg|gif|ico|woff|woff2|ttf|svg|eot|mp4|webm|ogg)$/i;
        const staticPathPrefixes = ['/js/', '/css/', '/images/', '/libraries/', '/node_modules/'];

        const isStatic = staticAssetRegex.test(url) ||
            staticPathPrefixes.some(prefix => url.startsWith(prefix));

        const logData = {
            method: req.method,
            url: url,
            status: res.statusCode,
            durationMs: duration,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        };

        const message = `${req.method} ${url} ${res.statusCode} - ${duration}ms`;
        if (isStatic) {
            logger.debug(message, logData);
        } else {
            logger.info(message, logData);
        }
    });

    next();
};

module.exports = logger;
