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

        it('should allow access for project creator in Projects table and format list_runs response', async () => {
            // Mock managedDbClient.get to return project count = 1 for Admin check in Projects table
            global.managedDbClient = {
                get: jest.fn().mockImplementation(async (query, params) => {
                    if (query.includes('FROM Projects WHERE PName = ? AND Admin = ?')) {
                        return { count: 1 };
                    }
                    return { count: 0 };
                })
            };

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=test'])
                .send({
                    messages: [{ role: 'user', content: 'List available runs' }],
                    model: 'llama3',
                    intent: 'list_runs',
                    projectName: 'classification'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.message.content).toContain('Available Runs');

            delete global.managedDbClient;
        });

        it('should correctly normalize and format Array of run objects in formatRunListings', () => {
            const ollamaChat = require('../../routes/chat/ollamaChat');
            const arrayRuns = [
                { runName: 'yolo_train_1', runType: 'train' },
                { runName: 'inf_run_2', runType: 'inference' }
            ];

            const formatted = ollamaChat.formatRunListings(arrayRuns, 'classification');
            expect(formatted).toContain('yolo_train_1');
            expect(formatted).toContain('inf_run_2');
            expect(formatted).toContain('Training Runs (1)');
            expect(formatted).toContain('Inference Runs (1)');
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

        it('should handle python sandbox status check prompts with status diagnostics without syntax error', async () => {
            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'Run python sandbox status check' }],
                    model: 'llama3',
                    intent: 'run_python'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.toolResult).not.toBeNull();
            expect(response.body.toolResult.stdout).toContain('Python Sandbox Status');
        });

        it('should ingest document context and persist LLM narrative into run_summary.md for summary requests', async () => {
            const fs = require('fs');
            const path = require('path');
            const testRunDir = path.join(process.cwd(), 'runs', 'train', 'test_doc_run');
            if (!fs.existsSync(testRunDir)) {
                fs.mkdirSync(testRunDir, { recursive: true });
            }
            fs.writeFileSync(path.join(testRunDir, 'args.yaml'), 'model: yolo11n.pt\nepochs: 10', 'utf8');

            const originalFetch = global.fetch;
            let capturedPromptMessages = null;
            global.fetch = jest.fn().mockImplementation((url, options) => {
                capturedPromptMessages = JSON.parse(options.body).messages;
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        model: 'llama3',
                        message: { role: 'assistant', content: '# Custom LLM Analysis Report\n\nModel yolo11n trained cleanly.' },
                        done: true
                    })
                });
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'Summarize run test_doc_run' }],
                    model: 'llama3',
                    intent: 'generate_summary',
                    runId: 'test_doc_run',
                    runType: 'train'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(capturedPromptMessages).not.toBeNull();
            const systemMsg = capturedPromptMessages.find(m => m.content.includes('INGESTED RUN DOCUMENT ARTIFACTS CONTEXT'));
            expect(systemMsg).toBeDefined();
            expect(systemMsg.content).toContain('args.yaml');

            const summaryFilePath = path.join(testRunDir, 'run_summary.md');
            expect(fs.existsSync(summaryFilePath)).toBe(true);
            const savedContent = fs.readFileSync(summaryFilePath, 'utf8');
            expect(savedContent).toContain('Custom LLM Analysis Report');

            global.fetch = originalFetch;
            try { fs.rmSync(testRunDir, { recursive: true, force: true }); } catch (e) {}
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


