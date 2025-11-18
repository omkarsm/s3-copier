'use strict';

/**
 * Integration Tests for s3-copier
 *
 * These tests run against real AWS S3 infrastructure.
 *
 * Prerequisites:
 * 1. Set environment variables before running:
 *    export AWS_ACCESS_KEY_ID="your-access-key"
 *    export AWS_SECRET_ACCESS_KEY="your-secret-key"
 *    export AWS_REGION="us-east-1"
 *    export TEST_BUCKET="omkar-bucket"
 *
 * 2. Run with: node test/integration.test.js
 *
 * Note: These tests will NOT modify your bucket, only read from it.
 */

const S3Copier = require('../s3.js');

// ANSI color codes for better output
const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
	console.log(`\n${colors.blue}▶ Testing: ${name}${colors.reset}`);
}

function logSuccess(message) {
	console.log(`  ${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message) {
	console.log(`  ${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(message) {
	console.log(`  ${colors.cyan}ℹ ${message}${colors.reset}`);
}

// Check for required environment variables
function validateEnvironment() {
	const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'TEST_BUCKET'];
	const missing = required.filter(key => !process.env[key]);

	if (missing.length > 0) {
		logError(`Missing required environment variables: ${missing.join(', ')}`);
		log('\nPlease set the following environment variables:', 'yellow');
		log('  export AWS_ACCESS_KEY_ID="your-access-key-id"', 'cyan');
		log('  export AWS_SECRET_ACCESS_KEY="your-secret-access-key"', 'cyan');
		log('  export AWS_REGION="us-east-1"', 'cyan');
		log('  export TEST_BUCKET="omkar-bucket"', 'cyan');
		log('\nThen run: node test/integration.test.js\n', 'yellow');
		process.exit(1);
	}

	logSuccess('Environment variables validated');
}

// Initialize S3Copier
function initializeS3Copier() {
	const awsConfig = {
		region: process.env.AWS_REGION,
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
	};

	const options = {
		Verbose: true
	};

	return new S3Copier(awsConfig, options);
}

// Test Suite
async function runIntegrationTests() {
	log('\n='.repeat(70), 'cyan');
	log('S3-Copier Integration Tests', 'cyan');
	log('='.repeat(70), 'cyan');

	// Validate environment
	log('\n📋 Step 1: Validating Environment', 'yellow');
	validateEnvironment();

	logInfo(`Region: ${process.env.AWS_REGION}`);
	logInfo(`Test Bucket: ${process.env.TEST_BUCKET}`);
	logInfo(`Access Key: ${process.env.AWS_ACCESS_KEY_ID.substring(0, 8)}...`);

	// Initialize S3Copier
	log('\n📋 Step 2: Initializing S3Copier', 'yellow');
	let s3Copier;
	try {
		s3Copier = initializeS3Copier();
		logSuccess('S3Copier initialized successfully');
	} catch (error) {
		logError(`Failed to initialize S3Copier: ${error.message}`);
		process.exit(1);
	}

	const testBucket = process.env.TEST_BUCKET;
	let testResults = {
		passed: 0,
		failed: 0,
		tests: []
	};

	// Test 1: List entire bucket (no prefix)
	logTest('list() - List entire bucket without prefix');
	try {
		const startTime = Date.now();
		const objects = await s3Copier.list({
			Bucket: testBucket
		});
		const duration = Date.now() - startTime;

		if (Array.isArray(objects)) {
			logSuccess(`Retrieved ${objects.length} objects in ${duration}ms`);
			if (objects.length > 0) {
				logInfo(`First object: ${objects[0].Key} (${objects[0].Size} bytes)`);
				if (objects.length > 1) {
					logInfo(`Last object: ${objects[objects.length - 1].Key} (${objects[objects.length - 1].Size} bytes)`);
				}
			} else {
				logInfo('Bucket is empty or has no objects');
			}
			testResults.passed++;
			testResults.tests.push({ name: 'List entire bucket', status: 'PASS' });
		} else {
			logError('Expected array, got: ' + typeof objects);
			testResults.failed++;
			testResults.tests.push({ name: 'List entire bucket', status: 'FAIL' });
		}
	} catch (error) {
		logError(`Error: ${error.message}`);
		if (error.name === 'NoSuchBucket') {
			logInfo(`Bucket "${testBucket}" does not exist or is not accessible`);
		} else if (error.name === 'AccessDenied') {
			logInfo('Access denied - check your IAM permissions');
		}
		testResults.failed++;
		testResults.tests.push({ name: 'List entire bucket', status: 'FAIL', error: error.message });
	}

	// Test 2: List with root prefix
	logTest('list() - List with root prefix "/"');
	try {
		const startTime = Date.now();
		const objects = await s3Copier.list({
			Bucket: testBucket,
			Prefix: '/'
		});
		const duration = Date.now() - startTime;

		logSuccess(`Retrieved ${objects.length} objects in ${duration}ms`);
		testResults.passed++;
		testResults.tests.push({ name: 'List with root prefix', status: 'PASS' });
	} catch (error) {
		logError(`Error: ${error.message}`);
		testResults.failed++;
		testResults.tests.push({ name: 'List with root prefix', status: 'FAIL', error: error.message });
	}

	// Test 3: List with empty prefix
	logTest('list() - List with empty prefix ""');
	try {
		const startTime = Date.now();
		const objects = await s3Copier.list({
			Bucket: testBucket,
			Prefix: ''
		});
		const duration = Date.now() - startTime;

		logSuccess(`Retrieved ${objects.length} objects in ${duration}ms`);
		testResults.passed++;
		testResults.tests.push({ name: 'List with empty prefix', status: 'PASS' });
	} catch (error) {
		logError(`Error: ${error.message}`);
		testResults.failed++;
		testResults.tests.push({ name: 'List with empty prefix', status: 'FAIL', error: error.message });
	}

	// Test 4: List with specific prefix (if objects exist)
	logTest('list() - List with specific prefix');
	try {
		// First get all objects to find a prefix
		const allObjects = await s3Copier.list({ Bucket: testBucket });

		if (allObjects.length > 0) {
			// Extract a prefix from the first object
			const firstKey = allObjects[0].Key;
			const prefixParts = firstKey.split('/');

			if (prefixParts.length > 1) {
				const testPrefix = prefixParts[0] + '/';
				logInfo(`Testing with prefix: "${testPrefix}"`);

				const startTime = Date.now();
				const objects = await s3Copier.list({
					Bucket: testBucket,
					Prefix: testPrefix
				});
				const duration = Date.now() - startTime;

				logSuccess(`Retrieved ${objects.length} objects with prefix in ${duration}ms`);

				// Verify all objects have the prefix
				const allHavePrefix = objects.every(obj => obj.Key.startsWith(testPrefix));
				if (allHavePrefix) {
					logSuccess('All returned objects have the correct prefix');
				} else {
					logError('Some objects do not have the expected prefix');
				}
				testResults.passed++;
				testResults.tests.push({ name: 'List with specific prefix', status: 'PASS' });
			} else {
				logInfo('No nested objects found, skipping prefix test');
				testResults.tests.push({ name: 'List with specific prefix', status: 'SKIP' });
			}
		} else {
			logInfo('Bucket is empty, skipping prefix test');
			testResults.tests.push({ name: 'List with specific prefix', status: 'SKIP' });
		}
	} catch (error) {
		logError(`Error: ${error.message}`);
		testResults.failed++;
		testResults.tests.push({ name: 'List with specific prefix', status: 'FAIL', error: error.message });
	}

	// Test 5: Error handling - invalid bucket
	logTest('list() - Error handling with invalid bucket name');
	try {
		await s3Copier.list({
			Bucket: 'non-existent-bucket-12345-invalid'
		});
		logError('Expected error but got success');
		testResults.failed++;
		testResults.tests.push({ name: 'Error handling invalid bucket', status: 'FAIL' });
	} catch (error) {
		logSuccess(`Correctly threw error: ${error.name}`);
		testResults.passed++;
		testResults.tests.push({ name: 'Error handling invalid bucket', status: 'PASS' });
	}

	// Test 6: Error handling - missing bucket parameter
	logTest('list() - Error handling with missing bucket parameter');
	try {
		await s3Copier.list({});
		logError('Expected error but got success');
		testResults.failed++;
		testResults.tests.push({ name: 'Error handling missing bucket', status: 'FAIL' });
	} catch (error) {
		if (error.message.includes('Bucket is required')) {
			logSuccess('Correctly threw error: Bucket is required');
			testResults.passed++;
			testResults.tests.push({ name: 'Error handling missing bucket', status: 'PASS' });
		} else {
			logError(`Unexpected error: ${error.message}`);
			testResults.failed++;
			testResults.tests.push({ name: 'Error handling missing bucket', status: 'FAIL' });
		}
	}

	// Test 7: Performance test with pagination
	logTest('list() - Performance and pagination handling');
	try {
		const startTime = Date.now();
		const objects = await s3Copier.list({
			Bucket: testBucket
		});
		const duration = Date.now() - startTime;

		const objectsPerSecond = objects.length > 0 ? (objects.length / (duration / 1000)).toFixed(2) : 'N/A';

		logSuccess(`Performance: ${objects.length} objects in ${duration}ms (${objectsPerSecond} objects/sec)`);

		if (objects.length > 1000) {
			logInfo('Pagination likely occurred (>1000 objects)');
		}

		testResults.passed++;
		testResults.tests.push({ name: 'Performance test', status: 'PASS', duration, objectCount: objects.length });
	} catch (error) {
		logError(`Error: ${error.message}`);
		testResults.failed++;
		testResults.tests.push({ name: 'Performance test', status: 'FAIL', error: error.message });
	}

	// Print Summary
	log('\n' + '='.repeat(70), 'cyan');
	log('Test Summary', 'cyan');
	log('='.repeat(70), 'cyan');

	console.log('\nTest Results:');
	testResults.tests.forEach(test => {
		const status = test.status === 'PASS' ? colors.green + '✓ PASS' :
		               test.status === 'FAIL' ? colors.red + '✗ FAIL' :
		               colors.yellow + '⊘ SKIP';
		console.log(`  ${status}${colors.reset} - ${test.name}`);
		if (test.error) {
			console.log(`         ${colors.red}${test.error}${colors.reset}`);
		}
	});

	console.log('');
	log(`Total Tests: ${testResults.passed + testResults.failed}`, 'cyan');
	log(`Passed: ${testResults.passed}`, 'green');
	if (testResults.failed > 0) {
		log(`Failed: ${testResults.failed}`, 'red');
	}

	const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
	log(`Success Rate: ${successRate}%`, successRate === '100.0' ? 'green' : 'yellow');

	log('\n' + '='.repeat(70), 'cyan');

	if (testResults.failed === 0) {
		log('\n🎉 All integration tests passed!', 'green');
	} else {
		log(`\n⚠️  ${testResults.failed} test(s) failed`, 'red');
	}

	console.log('');

	// Exit with appropriate code
	process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
runIntegrationTests().catch(error => {
	logError(`\nUnexpected error: ${error.message}`);
	console.error(error.stack);
	process.exit(1);
});
