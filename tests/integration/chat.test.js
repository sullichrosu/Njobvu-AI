const request = require('supertest');
const app = require('../../app');
const queries = require('../../queries/queries');

describe('Chat Harness API Integration Tests', () => {
    beforeAll(() => {
        // Setup default test configuration
        if (!global.configFile) {
            global.configFile = {};
        }
        global.configFile.ollama_url = "http://localhost:11434";
        global.configFile.ollama_default_model = "llama3";
        global.configFile.chat_required_role = "user";
    });

    describe('GET /api/chat/config', () => {
        it('should return 200 OK with default chat configuration', async () => {
            const response = await request(app)
                .get('/api/chat/config')
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('config');
            expect(response.body.config).toHaveProperty('ollama_url');
            expect(response.body.config).toHaveProperty('ollama_default_model');
            expect(response.body.config).toHaveProperty('chat_required_role');
        });
    });

    describe('POST /api/chat/config', () => {
        it('should return 401 Unauthorized if user is not authenticated', async () => {
            const response = await request(app)
                .post('/api/chat/config')
                .send({
                    ollama_url: 'http://localhost:11434',
                    chat_required_role: 'admin'
                })
                .expect('Content-Type', /json/)
                .expect(401);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toMatch(/Unauthorized/i);
        });

        it('should return 400 Bad Request for invalid URL format', async () => {
            const response = await request(app)
                .post('/api/chat/config')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    ollama_url: 'not-a-valid-url'
                })
                .expect('Content-Type', /json/)
                .expect(400);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toMatch(/Bad Request/i);
        });

        it('should return 200 OK and update chat configuration for authenticated user', async () => {
            const response = await request(app)
                .post('/api/chat/config')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    ollama_url: 'http://127.0.0.1:11434',
                    ollama_default_model: 'mistral',
                    chat_required_role: 'user'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.config.ollama_url).toBe('http://127.0.0.1:11434');
            expect(response.body.config.ollama_default_model).toBe('mistral');
        });
    });

    describe('GET /api/chat/models', () => {
        it('should return 200 OK with available or fallback models', async () => {
            const response = await request(app)
                .get('/api/chat/models')
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('models');
            expect(Array.isArray(response.body.models)).toBe(true);
            expect(response.body.models.length).toBeGreaterThan(0);
        });
    });

    describe('POST /api/chat', () => {
        it('should return 401 Unauthorized when no user session is present', async () => {
            const response = await request(app)
                .post('/api/chat')
                .send({
                    messages: [{ role: 'user', content: 'Hello' }]
                })
                .expect('Content-Type', /json/)
                .expect(401);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toMatch(/Unauthorized/i);
        });

        it('should return 400 Bad Request when messages array is missing or empty', async () => {
            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: []
                })
                .expect('Content-Type', /json/)
                .expect(400);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toMatch(/messages/i);
        });

        it('should return 400 Bad Request when message objects lack required fields', async () => {
            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ invalidKey: 'val' }]
                })
                .expect('Content-Type', /json/)
                .expect(400);

            expect(response.body).toHaveProperty('success', false);
        });

        it('should return 403 Forbidden when role gating requires admin role and user lacks admin rights', async () => {
            // Mock checkUserHasProjectAccess to return 0 (not admin)
            jest.spyOn(queries.managed, 'checkUserHasProjectAccess').mockResolvedValueOnce({
                row: { ExistingAccess: 0 }
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=RegularUser'])
                .send({
                    messages: [{ role: 'user', content: 'Execute admin action' }],
                    projectName: 'SecretProject',
                    roleRequired: 'admin'
                })
                .expect('Content-Type', /json/)
                .expect(403);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toMatch(/Forbidden/i);
        });

        it('should attempt Ollama call and return 502 Bad Gateway if Ollama endpoint is unreachable', async () => {
            // Mock global fetch to simulate connection error / offline Ollama
            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:11434'));

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'What is YOLOv8?' }],
                    model: 'llama3'
                })
                .expect('Content-Type', /json/)
                .expect(502);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toMatch(/unreachable/i);

            global.fetch = originalFetch;
        });

        it('should inject dynamic live system context into system prompt sent to Ollama', async () => {
            const originalFetch = global.fetch;
            let capturedRequestBody = null;

            global.fetch = jest.fn().mockImplementationOnce((url, options) => {
                capturedRequestBody = JSON.parse(options.body);
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        model: 'llama3',
                        message: { role: 'assistant', content: 'System prompt received with live context.' },
                        done: true
                    })
                });
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'How do I run sandbox python?' }],
                    model: 'llama3',
                    projectName: 'TestCVProject'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(capturedRequestBody).not.toBeNull();
            expect(capturedRequestBody.messages[0].role).toBe('system');
            expect(capturedRequestBody.messages[0].content).toContain('DYNAMIC LIVE SYSTEM CONTEXT');
            expect(capturedRequestBody.messages[0].content).toContain('TestCVProject');

            global.fetch = originalFetch;
        });

        it('should return 403 Forbidden if user lacks project access for run-aware summary requests', async () => {
            // Mock checkUserHasProjectAccess to return 0 (no access) when managedDbClient is set
            global.managedDbClient = { get: jest.fn().mockResolvedValue({ ExistingAccess: 0 }) };

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=UnprivilegedUser'])
                .send({
                    messages: [{ role: 'user', content: 'Summarize run exp1' }],
                    model: 'llama3',
                    intent: 'generate_summary',
                    projectName: 'RestrictedProject'
                })
                .expect('Content-Type', /json/)
                .expect(403);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toMatch(/Forbidden/i);

            delete global.managedDbClient;
        });

        it('should parse and execute tool intents like generate_summary and run_python', async () => {
            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'Execute python print("hello sandbox")' }],
                    model: 'llama3',
                    intent: 'run_python',
                    code: 'print("hello sandbox")'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.toolResult).not.toBeNull();
            expect(response.body.toolResult.stdout).toContain('hello sandbox');
        });

        it('should return 200 OK with assistant reply when Ollama returns a valid response', async () => {
            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'llama3',
                    message: { role: 'assistant', content: 'YOLO is an object detection framework.' },
                    done: true
                })
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'Tell me about YOLO' }],
                    model: 'llama3'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('message');
            expect(response.body.message.content).toBe('YOLO is an object detection framework.');
            expect(response.body.model).toBe('llama3');

            global.fetch = originalFetch;
        });
    });

    describe('POST /api/sandbox/python', () => {
        it('should execute python code in sandbox and return output', async () => {
            const response = await request(app)
                .post('/api/sandbox/python')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    code: 'print("API sandbox test")'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.stdout).toContain('API sandbox test');
        });
    });

    describe('POST /api/runs/summary', () => {
        it('should generate run summary or return error if run not found', async () => {
            const response = await request(app)
                .post('/api/runs/summary')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    runId: 'non_existent_run_9999',
                    runType: 'train'
                })
                .expect('Content-Type', /json/)
                .expect(404);

            expect(response.body).toHaveProperty('success', false);
        });
    });
});


