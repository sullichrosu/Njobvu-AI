// node-fetch@3 is ESM-only, which Jest in this repo isn't configured to transform.
// Any test that requires app.js pulls it in transitively via routes/chat/ollamaChat.js.
// A manual mock here (adjacent to node_modules) is applied automatically by Jest.
module.exports = jest.fn();
