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
                        message: { role: 'assistant', content: '# Run Summary: test_doc_run\n\nCustom LLM Analysis Report: Model yolo11n trained cleanly across 10 epochs with a clean loss trajectory.' },
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

        it('should reject off-topic LLM output and fall back to the deterministic run summary report', async () => {
            const fs = require('fs');
            const path = require('path');
            const testRunDir = path.join(process.cwd(), 'runs', 'train', 'preamble_run');
            if (!fs.existsSync(testRunDir)) {
                fs.mkdirSync(testRunDir, { recursive: true });
            }
            fs.writeFileSync(path.join(testRunDir, 'args.yaml'), 'model: yolo11n.pt\nepochs: 10', 'utf8');

            const originalFetch = global.fetch;
            // A weak model (e.g. small Gemma) ignores the ingested run documents and rambles about
            // something unrelated (here: an HTML tutorial) instead of authoring the report.
            global.fetch = jest.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'llama3',
                    message: {
                        role: 'assistant',
                        content: 'Here is an HTML tutorial explaining how to create a webpage with the Gemma UI.'
                    },
                    done: true
                })
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'Summarize run preamble_run' }],
                    model: 'llama3',
                    intent: 'generate_summary',
                    runId: 'preamble_run',
                    runType: 'train'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.toolResult).not.toBeNull();
            expect(response.body.toolResult.summary).toBeTruthy();

            // The off-topic ramble must be rejected: the deterministic data-backed report is returned
            // and persisted so the user always receives a real run summary.
            const content = response.body.message.content;
            expect(content.startsWith('# Run Summary: preamble_run')).toBe(true);
            expect(content).not.toContain('HTML tutorial');

            const savedContent = fs.readFileSync(path.join(testRunDir, 'run_summary.md'), 'utf8');
            expect(savedContent.startsWith('# Run Summary: preamble_run')).toBe(true);
            expect(savedContent).not.toContain('HTML tutorial');

            global.fetch = originalFetch;
            try { fs.rmSync(testRunDir, { recursive: true, force: true }); } catch (e) {}
        });

        it('should ALWAYS prepend formatted run listings even when the LLM returns conversational text', async () => {
            global.managedDbClient = {
                get: jest.fn().mockImplementation(async (query, params) => {
                    if (query.includes('FROM Projects WHERE PName = ? AND Admin = ?')) {
                        return { count: 1 };
                    }
                    return { count: 0 };
                })
            };

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'llama3',
                    message: {
                        role: 'assistant',
                        content: 'Here are the runs I found. I will list them for you.'
                    },
                    done: true
                })
            });

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
            expect(response.body.message.content.startsWith('### Available Runs')).toBe(true);

            global.fetch = originalFetch;
            delete global.managedDbClient;
        });

        it('should ALWAYS prepend python sandbox output even when the LLM returns conversational text', async () => {
            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'llama3',
                    message: {
                        role: 'assistant',
                        content: 'I executed the python code. Everything looks good.'
                    },
                    done: true
                })
            });

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
            expect(response.body.message.content.startsWith('**Python Sandbox Execution Result:**')).toBe(true);

            global.fetch = originalFetch;
        });

        it('should aggregate ALL runs via free text "give me a summary of the training run" and prepend the report', async () => {
            const fs = require('fs');
            const path = require('path');
            const testRunDir = path.join(process.cwd(), 'runs', 'train', 'freetext_summary_run');
            if (fs.existsSync(testRunDir)) {
                fs.rmSync(testRunDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testRunDir, { recursive: true });
            fs.writeFileSync(path.join(testRunDir, 'args.yaml'), 'model: yolo11n.pt\nepochs: 10', 'utf8');

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'llama3',
                    message: {
                        role: 'assistant',
                        content: '# Run Summary: all_runs_summary\n\nNatural-language analysis of the training runs covering configuration, outcomes, successes, failures, and actionable recommendations for improvement.'
                    },
                    done: true
                })
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'give me a summary of the training run' }],
                    model: 'llama3'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.toolResult).not.toBeNull();
            expect(response.body.toolResult.summary).toBeTruthy();
            const content = response.body.message.content;
            expect(content).toContain('actionable recommendations');

            // Every discovered run must get an LLM-authored summary written into its OWN output folder.
            expect(fs.existsSync(path.join(testRunDir, 'run_summary.md'))).toBe(true);
            expect(fs.existsSync(path.join(testRunDir, 'summary.json'))).toBe(true);
            expect(fs.readFileSync(path.join(testRunDir, 'run_summary.md'), 'utf8')).toContain('actionable recommendations');
            expect(response.body.toolResult.summaryFiles).toContain(path.resolve(path.join(testRunDir, 'run_summary.md')));
            expect(response.body.toolResult.summaryFiles).toContain(path.resolve(path.join(testRunDir, 'summary.json')));

            global.fetch = originalFetch;
            try { fs.rmSync(testRunDir, { recursive: true, force: true }); } catch (e) {}
        });

        it('should trigger run listing tool via free text "list available runs" and prepend formatted runs', async () => {
            global.managedDbClient = {
                get: jest.fn().mockImplementation(async (query, params) => {
                    if (query.includes('FROM Projects WHERE PName = ? AND Admin = ?')) {
                        return { count: 1 };
                    }
                    return { count: 0 };
                })
            };

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'llama3',
                    message: {
                        role: 'assistant',
                        content: 'Here are the available runs for your project.'
                    },
                    done: true
                })
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=test'])
                .send({
                    messages: [{ role: 'user', content: 'list available runs' }],
                    model: 'llama3',
                    projectName: 'classification'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.toolResult).not.toBeNull();
            expect(response.body.toolResult.runs).toBeDefined();
            expect(response.body.message.content.startsWith('### Available Runs')).toBe(true);

            global.fetch = originalFetch;
            delete global.managedDbClient;
        });

        it('should short-circuit a successful run listing deterministically and NOT call the LLM', async () => {
            global.managedDbClient = {
                get: jest.fn().mockImplementation(async (query, params) => {
                    if (query.includes('FROM Projects WHERE PName = ? AND Admin = ?')) {
                        return { count: 1 };
                    }
                    return { count: 0 };
                })
            };

            const originalFetch = global.fetch;
            let fetchCallCount = 0;
            global.fetch = jest.fn(() => {
                fetchCallCount++;
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        model: 'llama3',
                        message: { role: 'assistant', content: 'LLM should never be consulted for a listing' },
                        done: true
                    })
                });
            });

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
            expect(response.body.message.content.startsWith('### Available Runs')).toBe(true);
            expect(response.body.message.content).not.toContain('should never be consulted');
            expect(fetchCallCount).toBe(0);

            global.fetch = originalFetch;
            delete global.managedDbClient;
        });

        it('should find a run under runs/detect/train via free text "summarize my training run" and prepend the report', async () => {
            const fs = require('fs');
            const path = require('path');
            const testRunDir = path.join(process.cwd(), 'runs', 'detect', 'train', 'detect_summary_run');
            if (fs.existsSync(testRunDir)) {
                fs.rmSync(testRunDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testRunDir, { recursive: true });
            fs.writeFileSync(path.join(testRunDir, 'args.yaml'), 'model: yolo11n.pt\nepochs: 10', 'utf8');

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'llama3',
                    message: {
                        role: 'assistant',
                        content: '# Run Summary: all_runs_summary\n\nNatural-language analysis of the training runs covering configuration, outcomes, successes, failures, and actionable recommendations for improvement.'
                    },
                    done: true
                })
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'summarize my training run' }],
                    model: 'llama3'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.toolResult).not.toBeNull();
            expect(response.body.toolResult.success).toBe(true);
            const content = response.body.message.content;
            expect(content).toContain('actionable recommendations');

            // The summary must be written into the run's own output folder, and the tool result must
            // confirm exactly where (no silent failures).
            expect(fs.existsSync(path.join(testRunDir, 'run_summary.md'))).toBe(true);
            expect(fs.existsSync(path.join(testRunDir, 'summary.json'))).toBe(true);
            expect(fs.readFileSync(path.join(testRunDir, 'run_summary.md'), 'utf8')).toContain('actionable recommendations');
            expect(Array.isArray(response.body.toolResult.summaryFiles)).toBe(true);
            expect(response.body.toolResult.summaryFiles).toContain(path.resolve(path.join(testRunDir, 'run_summary.md')));
            expect(response.body.toolResult.summaryFiles).toContain(path.resolve(path.join(testRunDir, 'summary.json')));

            global.fetch = originalFetch;
            try { fs.rmSync(testRunDir, { recursive: true, force: true }); } catch (e) {}
        });

        it('should summarize EVERY run in the nested training/logs/<timestamp>/<run> layout and write per-run summaries', async () => {
            const fs = require('fs');
            const path = require('path');
            const projRoot = path.join(process.cwd(), 'public', 'projects', 'chat_nested_proj');
            const runA = path.join(projRoot, 'training', 'logs', '1785814629898', 'train');
            const runB = path.join(projRoot, 'training', 'logs', '1785814880596', 'train2');
            for (const dir of [runA, runB]) {
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, 'args.yaml'), 'model: yolo11s-cls.pt\ntask: classify\nepochs: 10\nname: train\n', 'utf8');
            }

            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    model: 'llama3',
                    message: {
                        role: 'assistant',
                        content: '# Run Summary: chat_nested_proj_all_runs_summary\n\nHere is your run summary. Natural-language analysis of both training runs with successes, failures, and recommendations.'
                    },
                    done: true
                })
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'summarize my training run' }],
                    model: 'llama3',
                    projectName: 'chat_nested_proj'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.toolResult).not.toBeNull();
            expect(response.body.toolResult.success).toBe(true);
            const content = response.body.message.content;
            expect(content).toContain('Here is your run summary.');

            // Both runs get an LLM-authored run_summary.md + data summary.json inside their OWN output directory.
            for (const runDir of [runA, runB]) {
                expect(fs.existsSync(path.join(runDir, 'run_summary.md'))).toBe(true);
                expect(fs.existsSync(path.join(runDir, 'summary.json'))).toBe(true);
                expect(fs.readFileSync(path.join(runDir, 'run_summary.md'), 'utf8')).toContain('Here is your run summary.');
                expect(response.body.toolResult.summaryFiles).toContain(path.resolve(path.join(runDir, 'run_summary.md')));
                expect(response.body.toolResult.summaryFiles).toContain(path.resolve(path.join(runDir, 'summary.json')));
            }

            // The all-runs report lands once at the project root.
            expect(fs.existsSync(path.join(projRoot, 'run_summary.md'))).toBe(true);
            expect(fs.readFileSync(path.join(projRoot, 'run_summary.md'), 'utf8')).toContain('Here is your run summary.');

            global.fetch = originalFetch;
            try { fs.rmSync(projRoot, { recursive: true, force: true }); } catch (e) {}
        });

        it('should short-circuit with a deterministic error and NO LLM call when no runs are available', async () => {
            const originalFetch = global.fetch;
            global.fetch = jest.fn(() => {
                throw new Error('LLM should not be called for a failed tool');
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'summarize my training run' }],
                    model: 'llama3',
                    projectName: 'chat_no_runs_project'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.toolResult).not.toBeNull();
            expect(response.body.toolResult.success).toBe(false);
            const content = response.body.message.content;
            expect(content.startsWith('**Tool Execution Error:**')).toBe(true);
            expect(content).toContain("No train runs found for project 'chat_no_runs_project'");
            expect(content).toContain('### Available Runs');
            expect(content).toContain('summarize run');

            expect(global.fetch).not.toHaveBeenCalled();

            global.fetch = originalFetch;
        });

        it('should short-circuit with the tool error and available-runs hint when a named run is missing', async () => {
            const originalFetch = global.fetch;
            global.fetch = jest.fn(() => {
                throw new Error('LLM should not be called for a failed tool');
            });

            const response = await request(app)
                .post('/api/chat')
                .set('Cookie', ['Username=TestUser'])
                .send({
                    messages: [{ role: 'user', content: 'summarize run nonexistent_run_xyz' }],
                    model: 'llama3'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body.toolResult).not.toBeNull();
            expect(response.body.toolResult.success).toBe(false);
            const content = response.body.message.content;
            expect(content.startsWith('**Tool Execution Error:**')).toBe(true);
            expect(content).toContain("Run 'nonexistent_run_xyz' not found");
            expect(content).toContain('Available runs');
            expect(content).toContain('summarize run');

            expect(global.fetch).not.toHaveBeenCalled();

            global.fetch = originalFetch;
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
                .expect(400);

            expect(response.body).toHaveProperty('success', false);
        });
    });

    describe('looksLikeRunSummary quality guard', () => {
        const ollamaChat = require('../../routes/chat/ollamaChat');

        it('accepts a report that starts with a Run Summary heading', () => {
            const content = '# Run Summary: train\n\nThe model trained for 10 epochs with a steadily decreasing loss curve, indicating healthy convergence.';
            expect(ollamaChat.looksLikeRunSummary(content)).toBe(true);
        });

        it('accepts a report with a short lead-in sentence before the heading', () => {
            const content = 'Sure, here is the analysis:\n\n# Run Summary: train2\n\nTraining completed successfully across 10 epochs with no errors logged.';
            expect(ollamaChat.looksLikeRunSummary(content)).toBe(true);
        });

        it('rejects an HTML tutorial ramble even if long enough', () => {
            const content = '<html><head><title>My Awesome Photo</title></head><body><h1>Welcome!</h1><p>I am a friendly AI assistant.</p></body></html>';
            expect(ollamaChat.looksLikeRunSummary(content)).toBe(false);
        });

        it('rejects a canned "ready to assist" acknowledgment', () => {
            const content = 'Okay, I understand. I will be ready to assist with your Njobvu AI tasks by providing structured instructions and payloads.';
            expect(ollamaChat.looksLikeRunSummary(content)).toBe(false);
        });

        it('rejects content with no heading at all', () => {
            const content = 'This run performed reasonably well overall with a stable loss trajectory and no notable errors during training or validation.';
            expect(ollamaChat.looksLikeRunSummary(content)).toBe(false);
        });

        it('rejects content that is too short to be a real report', () => {
            expect(ollamaChat.looksLikeRunSummary('# Run Summary: x')).toBe(false);
        });

        it('rejects a heading buried deep after an off-topic ramble', () => {
            const filler = 'A'.repeat(250);
            expect(ollamaChat.looksLikeRunSummary(`${filler}\n# Run Summary: train`)).toBe(false);
        });
    });

    describe('serializeRunArtifacts context trimming', () => {
        const ollamaChat = require('../../routes/chat/ollamaChat');

        it('keeps only the essential config fields instead of dumping the full raw args.yaml', () => {
            const artifact = {
                runName: 'train',
                runType: 'training',
                config: {
                    model: 'yolo11s-cls.pt',
                    epochs: 10,
                    batch: 16,
                    // Real YOLO args.yaml carries ~90 fields like these — they should not appear.
                    nbs: 64,
                    erasing: 0.4,
                    copy_paste_mode: 'flip',
                    hsv_h: 0.015
                },
                metrics: { bestMap50: 0.5 },
                artifactFiles: ['a.jpg', 'b.jpg', 'c.yaml'],
                visualPlots: ['a.jpg', 'b.jpg']
            };

            const serialized = ollamaChat.serializeRunArtifacts([artifact]);

            expect(serialized).toContain('"model":"yolo11s-cls.pt"');
            expect(serialized).toContain('"epochs":10');
            expect(serialized).not.toContain('nbs');
            expect(serialized).not.toContain('erasing');
            expect(serialized).not.toContain('copy_paste_mode');
            // File lists are summarized as counts, not enumerated in full.
            expect(serialized).toContain('Artifacts: 3 files (2 images/plots)');
            expect(serialized).not.toContain('a.jpg');
        });
    });
});


