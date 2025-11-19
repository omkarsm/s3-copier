'use strict';

const config = require('../config.js');

describe('Config', () => {
	test('should export config object', () => {
		expect(config).toBeDefined();
		expect(typeof config).toBe('object');
	});

	test('should have correct default limits', () => {
		expect(config.limit.aws_size).toBe(1024 * 1024 * 1024 * 5); // 5GB
		expect(config.limit.part.max_size).toBe(1024 * 1024 * 100); // 100MB
		expect(config.limit.part.parallel).toBe(10);
		expect(config.limit.parallel.single).toBe(40);
		expect(config.limit.parallel.multipart).toBe(10);
		expect(config.limit.retry.count).toBe(3);
		expect(config.limit.retry.timeout).toBe(2000);
		expect(config.limit.expires).toBe(12 * 60 * 60 * 1000); // 12 hours
	});

	test('should have verbose enabled by default', () => {
		expect(config.verbose).toBe(true);
	});

	test('should have all required properties', () => {
		expect(config).toHaveProperty('limit');
		expect(config).toHaveProperty('verbose');
		expect(config.limit).toHaveProperty('aws_size');
		expect(config.limit).toHaveProperty('part');
		expect(config.limit).toHaveProperty('parallel');
		expect(config.limit).toHaveProperty('retry');
		expect(config.limit).toHaveProperty('expires');
	});
});
