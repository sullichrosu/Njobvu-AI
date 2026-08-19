const path = require('path');
const fs = require('fs');

describe('utils/config - Environment & File Configuration Loader', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('should load default configuration when no environment variables are set', () => {
        delete process.env.PORT;
        delete process.env.CONFIG_PORT;
        delete process.env.OLLAMA_URL;
        delete process.env.CONFIG_OLLAMA_URL;
        delete process.env.CONFIG_JSON;

        const config = require('../../utils/config');
        const reloaded = config.loadConfig();

        expect(reloaded).toHaveProperty('port');
        expect(reloaded).toHaveProperty('hostname');
        expect(reloaded).toHaveProperty('ollama_url');
        expect(reloaded).toHaveProperty('default_python_path');
    });

    it('should override configuration via standard environment variables (PORT, OLLAMA_URL)', () => {
        process.env.PORT = '8080';
        process.env.OLLAMA_URL = 'http://custom-ollama:11434';
        process.env.DEFAULT_PYTHON_PATH = '/custom/bin/python3';

        const config = require('../../utils/config');
        const loaded = config.loadConfig();

        expect(loaded.port).toBe(8080);
        expect(loaded.ollama_url).toBe('http://custom-ollama:11434');
        expect(loaded.default_python_path).toBe('/custom/bin/python3');
    });

    it('should override configuration via CONFIG_ prefixed environment variables', () => {
        process.env.CONFIG_PORT = '9090';
        process.env.CONFIG_OLLAMA_URL = 'http://config-ollama:11434';
        process.env.CONFIG_TRAINING_MAX_BUFFER_SIZE = '10';

        const config = require('../../utils/config');
        const loaded = config.loadConfig();

        expect(loaded.port).toBe(9090);
        expect(loaded.ollama_url).toBe('http://config-ollama:11434');
        expect(loaded.training_max_buffer_size).toBe(10);
    });

    it('should override configuration via CONFIG_JSON environment variable', () => {
        process.env.CONFIG_JSON = JSON.stringify({
            port: 4000,
            ollama_default_model: 'llama3:70b',
            custom_option: 'test-value'
        });

        const config = require('../../utils/config');
        const loaded = config.loadConfig();

        expect(loaded.port).toBe(4000);
        expect(loaded.ollama_default_model).toBe('llama3:70b');
        expect(loaded.custom_option).toBe('test-value');
    });

    it('should parse arbitrary CONFIG_<KEY> environment variables', () => {
        process.env.CONFIG_FEATURE_FLAG = 'enabled';

        const config = require('../../utils/config');
        const loaded = config.loadConfig();

        expect(loaded.feature_flag).toBe('enabled');
    });
});
