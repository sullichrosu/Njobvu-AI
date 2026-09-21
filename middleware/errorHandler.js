// Terminal middleware: a JSON 404 for unmatched non-page requests, and the
// single place where errors forwarded from routes and middleware (including
// body-parser failures such as malformed JSON) become HTTP responses.
//
// Error details are logged but never sent to the client - stack traces and
// driver messages (SQL, file paths) are not something to expose.

const STATUS_MESSAGES = {
    400: "Bad request.",
    401: "Authentication required.",
    403: "Forbidden.",
    404: "Not found.",
    408: "Request timed out.",
    413: "The request payload is too large.",
    415: "Unsupported media type.",
    500: "An unexpected error occurred. Please try again.",
    503: "The service is temporarily unavailable. Please try again.",
};

// Database contention and busy/locked files are transient: tell the caller to retry.
const TRANSIENT_CODES = new Set(["SQLITE_BUSY", "SQLITE_LOCKED", "EMFILE", "ENFILE"]);

function resolveStatus(err) {
    const status = err && (err.status || err.statusCode);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
        return status;
    }

    const code = err && (err.code || (err.error && err.error.code));
    if (TRANSIENT_CODES.has(code)) {
        return 503;
    }

    return 500;
}

function wantsJson(req) {
    if (req.xhr || req.is("json")) {
        return true;
    }

    // Every page is a GET; anything else is a fetch/XHR from the frontend.
    if (req.method !== "GET" && req.method !== "HEAD") {
        return true;
    }

    if (req.path.startsWith("/api/")) {
        return true;
    }

    return req.accepts(["html", "json"]) === "json";
}

function messageFor(err, status) {
    // 4xx errors raised deliberately (e.g. body-parser) carry a safe message;
    // 5xx messages are internal detail and get the generic text.
    if (status < 500 && err && err.expose === true && err.message) {
        return err.message;
    }

    return STATUS_MESSAGES[status] || (status < 500 ? STATUS_MESSAGES[400] : STATUS_MESSAGES[500]);
}

function notFoundHandler(req, res, next) {
    if (!wantsJson(req)) {
        return next();
    }

    res.status(404).json({ success: false, message: STATUS_MESSAGES[404] });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const logger = global.logger;
    const status = resolveStatus(err);
    const logMeta = { method: req.method, url: req.originalUrl || req.url, status };

    if (status >= 500) {
        logger.error(err instanceof Error ? err : new Error(String(err)), logMeta);
    } else {
        logger.warn(`Request failed: ${err && err.message}`, logMeta);
    }

    if (res.headersSent) {
        // The response is already partly or fully on the wire; a second
        // response is impossible. Only tear the connection down if the body
        // was left incomplete, so the client doesn't treat it as complete.
        if (!res.writableEnded) {
            req.socket.destroy();
        }
        return;
    }

    const message = messageFor(err, status);

    if (wantsJson(req)) {
        return res.status(status).json({ success: false, message });
    }

    res.status(status).render("error", { title: String(status), message, user: req.cookies && req.cookies.Username }, (renderErr, html) => {
        if (renderErr) {
            logger.error(renderErr, { url: logMeta.url, phase: "error page render" });
            return res.status(status).type("text/plain").send(message);
        }

        res.send(html);
    });
}

module.exports = { errorHandler, notFoundHandler, resolveStatus };
