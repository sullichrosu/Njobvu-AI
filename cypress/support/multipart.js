// Cypress does not structurally parse multipart/form-data request bodies -- cy.intercept()
// exposes them as the raw boundary-delimited string. All of this app's training/inference/
// annotation forms submit via `fetch(action, { body: new FormData() })`, which the browser
// always serializes as multipart/form-data (regardless of the <form enctype>), so tests need
// this to turn intercepted bodies back into plain field -> value(s) objects for assertions.
function parseMultipartFormData(rawBody, contentType) {
  const fields = {};

  if (!rawBody || !contentType) {
    return fields;
  }

  // cy.intercept() exposes multipart bodies as a raw string when they're pure text (no file
  // part), but as an ArrayBuffer once a real file is attached (e.g. dataset/image uploads).
  // Text field values stay plain ASCII either way, so decoding as UTF-8 is enough to recover
  // them even though binary file bytes elsewhere in the buffer won't round-trip cleanly.
  // `instanceof ArrayBuffer` is unreliable here: the intercepted request body is constructed
  // in the AUT iframe's realm, not this spec's, so cross-realm instanceof checks can report
  // false for a genuine ArrayBuffer. Object.prototype.toString is realm-safe.
  let body = rawBody;
  if (Object.prototype.toString.call(body) === "[object ArrayBuffer]") {
    body = new TextDecoder("utf-8").decode(body);
  } else if (typeof body !== "string") {
    // Already-parsed object (e.g. a small body Cypress decoded on its own).
    return body;
  }

  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  const boundaryValue = boundaryMatch && (boundaryMatch[1] || boundaryMatch[2]);

  if (!boundaryValue) {
    return fields;
  }

  const boundary = `--${boundaryValue}`;
  const parts = body
    .split(boundary)
    .filter((part) => part && part.trim() !== "" && part.trim() !== "--");

  parts.forEach((part) => {
    const nameMatch = /name="([^"]+)"/.exec(part);

    if (!nameMatch || /filename="/.test(part)) {
      // Skip unnamed parts and file parts -- tests assert on the surrounding text fields.
      return;
    }

    const name = nameMatch[1];
    const splitAt = part.indexOf("\r\n\r\n");

    if (splitAt === -1) {
      return;
    }

    const value = part.slice(splitAt + 4).replace(/\r\n--$/, "").replace(/\r\n$/, "");

    if (Object.prototype.hasOwnProperty.call(fields, name)) {
      fields[name] = [].concat(fields[name], value);
    } else {
      fields[name] = value;
    }
  });

  return fields;
}

module.exports = { parseMultipartFormData };
