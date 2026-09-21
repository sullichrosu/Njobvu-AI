const childProcess = require("child_process");

/**
 * child_process.spawn with a guaranteed 'error' listener.
 *
 * spawn() reports launch failures (binary missing, not executable, out of file
 * descriptors) as an 'error' event on the child rather than throwing. With no
 * listener attached, EventEmitter rethrows it as an uncaught exception and the
 * whole server dies because one import pointed at a missing Python or 7z.
 *
 * Node still emits 'close' with a negative exit code after a failed launch, so
 * callers that already handle a non-zero 'close' keep responding to the
 * client. To make that response useful, the launch error's message is also
 * emitted on the child's stderr, which those callers already collect.
 */
function safeSpawn(command, args, options) {
    const child = childProcess.spawn(command, args, options);

    if (child && typeof child.on === "function") {
        child.on("error", (err) => {
            (global.logger || console).error(`Failed to run '${command}': ${err.message}`);

            if (child.stderr && typeof child.stderr.emit === "function") {
                child.stderr.emit("data", Buffer.from(`Failed to run '${command}': ${err.message}`));
            }
        });
    }

    return child;
}

module.exports = safeSpawn;
