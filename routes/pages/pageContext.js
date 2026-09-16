/**
 * Normalize the values shared by page renderers.
 * Template data keeps the application's existing names, while handlers use
 * semantic names when reading the request.
 */
function getPageParams(req) {
    const query = req.query || {};
    const cookies = req.cookies || {};

    return {
        projectIndex:
            query.IDX === undefined ? undefined : parseInt(query.IDX, 10),
        imageName: String(query.IName),
        currentClass: query.curr_class,
        logged: query.logged,
        username: cookies.Username,
    };
}

module.exports = { getPageParams };
