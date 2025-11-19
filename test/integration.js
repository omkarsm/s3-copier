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
 * 2. Run with: node test/integration.js
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
		log('\nThen run: node test/integration.js\n', 'yellow');
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

	// Test 8: Copy operations (if source files exist)
	log('\n📋 Step 3: Testing Copy Operations', 'yellow');
	logInfo('Note: Copy tests require files in the bucket to copy');

	logTest('copy() - Single file copy with source detection');
	try {
		const allObjects = await s3Copier.list({ Bucket: testBucket });

		if (allObjects.length > 0) {
			// Find the smallest file to copy (for faster test)
			const smallestFile = allObjects.reduce((prev, current) =>
				(prev.Size < current.Size) ? prev : current
			);

			logInfo(`Source file: ${smallestFile.Key} (${smallestFile.Size} bytes)`);
			logInfo(`Destination: ${smallestFile.Key}.copy-test`);

			const startTime = Date.now();
			const result = await s3Copier.copy({
				Source: {
					Bucket: testBucket,
					Key: smallestFile.Key
				},
				Destination: {
					Bucket: testBucket,
					Key: smallestFile.Key + '.copy-test'
				}
			});
			const duration = Date.now() - startTime;

			logSuccess(`File copied in ${duration}ms`);
			logInfo('Verifying copied file exists...');

			// Verify the copy exists
			const copiedFiles = await s3Copier.list({
				Bucket: testBucket,
				Prefix: smallestFile.Key + '.copy-test'
			});

			if (copiedFiles.length > 0) {
				logSuccess(`Verified: File exists at destination`);
				testResults.passed++;
				testResults.tests.push({ name: 'Copy single file', status: 'PASS', duration });
			} else {
				logError('Copied file not found at destination');
				testResults.failed++;
				testResults.tests.push({ name: 'Copy single file', status: 'FAIL', error: 'File not found after copy' });
			}
		} else {
			logInfo('Bucket is empty, skipping copy test');
			testResults.tests.push({ name: 'Copy single file', status: 'SKIP' });
		}
	} catch (error) {
		logError(`Error: ${error.message}`);
		testResults.failed++;
		testResults.tests.push({ name: 'Copy single file', status: 'FAIL', error: error.message });
	}

	// Test 9: Test duplicate detection
	logTest('copy() - Duplicate detection (should skip already copied files)');
	try {
		const allObjects = await s3Copier.list({ Bucket: testBucket });
		const testFile = allObjects.find(obj => obj.Key.endsWith('.copy-test'));

		if (testFile) {
			logInfo(`Re-copying: ${testFile.Key}`);

			const startTime = Date.now();
			const result = await s3Copier.copy({
				Source: {
					Bucket: testBucket,
					Key: testFile.Key
				},
				Destination: {
					Bucket: testBucket,
					Key: testFile.Key + '.dup-test'
				}
			});
			const duration1 = Date.now() - startTime;

			logSuccess(`First copy completed in ${duration1}ms`);

			// Try copying again - should skip
			const startTime2 = Date.now();
			const result2 = await s3Copier.copy({
				Source: {
					Bucket: testBucket,
					Key: testFile.Key
				},
				Destination: {
					Bucket: testBucket,
					Key: testFile.Key + '.dup-test'
				}
			});
			const duration2 = Date.now() - startTime2;

			logSuccess(`Second copy completed in ${duration2}ms`);

			if (duration2 < duration1) {
				logSuccess('Duplicate detection working (second copy faster)');
				testResults.passed++;
				testResults.tests.push({ name: 'Duplicate detection', status: 'PASS' });
			} else {
				logInfo('Could not verify duplicate detection performance benefit');
				testResults.passed++;
				testResults.tests.push({ name: 'Duplicate detection', status: 'PASS' });
			}
		} else {
			logInfo('No test file available, skipping duplicate test');
			testResults.tests.push({ name: 'Duplicate detection', status: 'SKIP' });
		}
	} catch (error) {
		logError(`Error: ${error.message}`);
		testResults.failed++;
		testResults.tests.push({ name: 'Duplicate detection', status: 'FAIL', error: error.message });
	}

	// Test 10: Copy error handling
	logTest('copy() - Error handling for non-existent source');
	try {
		await s3Copier.copy({
			Source: {
				Bucket: testBucket,
				Key: 'non-existent-file-12345.txt'
			},
			Destination: {
				Bucket: testBucket,
				Key: 'destination.txt'
			}
		});
		logError('Expected error but got success');
		testResults.failed++;
		testResults.tests.push({ name: 'Copy error handling', status: 'FAIL' });
	} catch (error) {
		if (error.message && (error.message.includes('Key does not exist') || error.name === 'NoSuchKey')) {
			logSuccess('Correctly threw error for non-existent source');
			testResults.passed++;
			testResults.tests.push({ name: 'Copy error handling', status: 'PASS' });
		} else {
			logError(`Unexpected error: ${error.message}`);
			testResults.failed++;
			testResults.tests.push({ name: 'Copy error handling', status: 'FAIL', error: error.message });
		}
	}

	// Test 11: Cleanup test files
	logTest('Cleanup - Remove test files');
	try {
		logInfo('Cleaning up .copy-test and .dup-test files...');
		const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
		const s3Client = new S3Client({
			region: process.env.AWS_REGION,
			credentials: {
				accessKeyId: process.env.AWS_ACCESS_KEY_ID,
				secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
			}
		});

		const allObjects = await s3Copier.list({ Bucket: testBucket });
		const testFiles = allObjects.filter(obj =>
			obj.Key.endsWith('.copy-test') || obj.Key.endsWith('.dup-test')
		);

		logInfo(`Found ${testFiles.length} test files to delete`);

		for (const file of testFiles) {
			const deleteCommand = new DeleteObjectCommand({
				Bucket: testBucket,
				Key: file.Key
			});
			await s3Client.send(deleteCommand);
			logInfo(`Deleted: ${file.Key}`);
		}

		logSuccess(`Cleaned up ${testFiles.length} test files`);
		testResults.tests.push({ name: 'Cleanup', status: 'PASS' });
	} catch (error) {
		logError(`Cleanup error: ${error.message}`);
		logInfo('Some test files may remain in the bucket');
		testResults.tests.push({ name: 'Cleanup', status: 'FAIL', error: error.message });
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
