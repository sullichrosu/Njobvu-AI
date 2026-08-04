const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

describe('Logger Utility Unit Tests', () => {
    let logSpy;
    let errorSpy;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('should format logs as valid JSON and track caller source', () => {
        logger.setLevel('info');
        logger.info('Test info message', { userId: 123 });

        expect(logSpy).toHaveBeenCalled();
        const output = JSON.parse(logSpy.mock.calls[0][0]);
        expect(output).toHaveProperty('timestamp');
        expect(output.level).toBe('info');
        expect(output.message).toBe('Test info message');
        expect(output.meta).toEqual({ userId: 123 });
        expect(output).toHaveProperty('source');
        expect(output.source.file).toBe('tests/logger.test.js');
        expect(typeof output.source.line).toBe('number');
    });

    it('should filter log levels correctly based on severity', () => {
        logger.setLevel('warn');
        
        logger.debug('Debug msg');
        logger.info('Info msg');
        logger.warn('Warn msg');
        logger.error('Error msg');

        // debug and info should be ignored when set to warn
        expect(logSpy).toHaveBeenCalledTimes(1); // warn msg
        expect(errorSpy).toHaveBeenCalledTimes(1); // error msg

        const warnOutput = JSON.parse(logSpy.mock.calls[0][0]);
        expect(warnOutput.message).toBe('Warn msg');

        const errorOutput = JSON.parse(errorSpy.mock.calls[0][0]);
        expect(errorOutput.message).toBe('Error msg');
    });

    it('should format Error objects properly in logs', () => {
        logger.setLevel('info');
        const testError = new Error('Database connection failed');
        logger.error(testError);

        expect(errorSpy).toHaveBeenCalled();
        const output = JSON.parse(errorSpy.mock.calls[0][0]);
        expect(output.message).toBe('Database connection failed');
        expect(output).toHaveProperty('stack');
    });

    it('should log static asset requests as debug level and regular requests as info level', () => {
        logger.setLevel('debug');
        
        const reqMockStatic = {
            method: 'GET',
            originalUrl: '/js/jquery.min.js',
            ip: '127.0.0.1',
            get: jest.fn().mockReturnValue('Mock-User-Agent')
        };
        const reqMockRegular = {
            method: 'POST',
            originalUrl: '/login',
            ip: '127.0.0.1',
            get: jest.fn().mockReturnValue('Mock-User-Agent')
        };
        
        let finishCallbackStatic;
        const resMockStatic = {
            statusCode: 200,
            on: jest.fn((event, cb) => {
                if (event === 'finish') finishCallbackStatic = cb;
            })
        };
        let finishCallbackRegular;
        const resMockRegular = {
            statusCode: 200,
            on: jest.fn((event, cb) => {
                if (event === 'finish') finishCallbackRegular = cb;
            })
        };

        const nextMock = jest.fn();

        logger.requestMiddleware(reqMockStatic, resMockStatic, nextMock);
        expect(nextMock).toHaveBeenCalled();
        finishCallbackStatic();
        
        logger.requestMiddleware(reqMockRegular, resMockRegular, nextMock);
        finishCallbackRegular();

        expect(logSpy).toHaveBeenCalledTimes(2);

        const firstLog = JSON.parse(logSpy.mock.calls[0][0]);
        expect(firstLog.level).toBe('debug');
        expect(firstLog.message).toContain('GET /js/jquery.min.js 200');

        const secondLog = JSON.parse(logSpy.mock.calls[1][0]);
        expect(secondLog.level).toBe('info');
        expect(secondLog.message).toContain('POST /login 200');
    });
});
