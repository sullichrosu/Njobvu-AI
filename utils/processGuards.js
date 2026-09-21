// Process-level safety nets for a long-running server. Each installer takes
// its collaborators as options so the behaviour can be tested without
// touching the real `process`.

/**
 * Logs unhandled promise rejections and uncaught exceptions instead of letting
 * them terminate the server.
 *
 * Carrying on after an uncaught exception is only safe while it is
 * occasional: a repeating one means the process is in a broken state that it
 * will never recover from. More than `maxUncaught` within `windowMs` is treated
 * as fatal and the process exits so a supervisor (docker, systemd, pm2) can
 * restart it clean.
 *
 * @returns {Function} uninstall
 */
function installProcessGuards({
    logger = global.logger,
    proc = process,
    exit = process.exit,
    maxUncaught = 5,
    windowMs = 60 * 1000,
    now = Date.now,
} = {}) {
    let uncaughtTimes = [];

    const onUnhandledRejection = (reason) => {
        logger.error(reason instanceof Error ? reason : new Error(`Unhandled promise rejection: ${String(reason)}`), {
            source: "unhandledRejection",
        });
    };

    const onUncaughtException = (err) => {
        logger.error(err instanceof Error ? err : new Error(String(err)), { source: "uncaughtException" });

        const current = now();
        uncaughtTimes = uncaughtTimes.filter((t) => current - t < windowMs);
        uncaughtTimes.push(current);

        if (uncaughtTimes.length > maxUncaught) {
            logger.error(
                `More than ${maxUncaught} uncaught exceptions in ${windowMs}ms; exiting so the process can be restarted clean.`,
            );
            exit(1);
        }
    };

    proc.on("unhandledRejection", onUnhandledRejection);
    proc.on("uncaughtException", onUncaughtException);

    return () => {
        proc.removeListener("unhandledRejection", onUnhandledRejection);
        proc.removeListener("uncaughtException", onUncaughtException);
    };
}

/**
 * Reports a listen() failure - most commonly the port already being in use -
 * as a single readable line and exits, rather than an unhandled 'error' event
 * stack trace.
 */
function handleServerListenError(server, { port, logger = global.logger, exit = process.exit } = {}) {
    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            logger.error(`Port ${port} is already in use. Stop the other process or change 'port' in config.json.`);
        } else if (err.code === "EACCES") {
            logger.error(`Permission denied listening on port ${port}.`);
        } else {
            logger.error(err, { source: "server" });
        }

        exit(1);
    });
}

/**
 * On SIGTERM/SIGINT, stops accepting connections, lets in-flight requests
 * finish, and exits. Exits non-zero if they haven't finished within
 * `timeoutMs`, so a stuck keep-alive connection can't block a restart forever.
 *
 * @returns {Function} uninstall
 */
function installGracefulShutdown(server, {
    logger = global.logger,
    proc = process,
    exit = process.exit,
    timeoutMs = 10 * 1000,
    signals = ["SIGTERM", "SIGINT"],
} = {}) {
    let shuttingDown = false;

    const onSignal = (signal) => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;

        logger.info(`${signal} received; shutting down.`);

        const forceTimer = setTimeout(() => {
            logger.error(`Connections still open after ${timeoutMs}ms; forcing exit.`);
            exit(1);
        }, timeoutMs);
        forceTimer.unref();

        server.close((err) => {
            clearTimeout(forceTimer);
            if (err) {
                logger.error(err, { source: "shutdown" });
                return exit(1);
            }
            exit(0);
        });
    };

    const handlers = signals.map((signal) => {
        const handler = () => onSignal(signal);
        proc.on(signal, handler);
        return [signal, handler];
    });

    return () => handlers.forEach(([signal, handler]) => proc.removeListener(signal, handler));
}

module.exports = { installProcessGuards, handleServerListenError, installGracefulShutdown };
