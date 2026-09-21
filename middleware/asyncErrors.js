// Express 4 does not observe the promise returned by a route handler, so an
// `async` handler that throws (or awaits something that rejects) outside its
// own try/catch produces an unhandled rejection instead of an error response.
// On modern Node that terminates the whole server, and the requester's socket
// hangs until it does.
//
// Every route registration in Express - app.get(), router.post(), and so on -
// funnels through Route.prototype[method]. Wrapping the handlers there once
// forwards a rejected promise to next(err) for every legacy handler without
// editing any of them.

const http = require("http");

const WRAPPED = Symbol("asyncErrorForwarding");
const PATCHED = Symbol("asyncErrorForwardingPatched");

function wrapHandler(fn) {
    // Arity-4 functions are error handlers; Express dispatches on fn.length,
    // so wrapping them would silently turn them into normal handlers.
    if (typeof fn !== "function" || fn.length === 4 || fn[WRAPPED]) {
        return fn;
    }

    const wrapped = function (req, res, next) {
        let result;
        try {
            result = fn.call(this, req, res, next);
        } catch (err) {
            return next(err);
        }

        if (result && typeof result.then === "function") {
            result.then(undefined, next);
        }
    };
    wrapped[WRAPPED] = true;
    return wrapped;
}

function flattenHandlers(handlers) {
    return handlers.reduce(
        (all, handler) => all.concat(Array.isArray(handler) ? flattenHandlers(handler) : handler),
        [],
    );
}

/**
 * Patches `express.Route` so rejected promises from route handlers are passed
 * to next(err). Idempotent. Must run before any routes are registered, since
 * handlers registered earlier are not retroactively wrapped.
 */
function installAsyncErrorForwarding(express) {
    const routeProto = express.Route.prototype;
    if (routeProto[PATCHED]) {
        return;
    }

    const methods = http.METHODS.map((method) => method.toLowerCase());

    for (const method of [...methods, "all"]) {
        const original = routeProto[method];
        if (typeof original !== "function") {
            continue;
        }

        routeProto[method] = function (...handlers) {
            return original.apply(this, flattenHandlers(handlers).map(wrapHandler));
        };
    }

    routeProto[PATCHED] = true;
}

module.exports = { installAsyncErrorForwarding, wrapHandler };
