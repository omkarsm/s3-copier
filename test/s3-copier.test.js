'use strict';

// Mock AWS SDK before requiring S3Copier
const mockSend = jest.fn();
const mockS3Client = jest.fn(() => ({
	send: mockSend
}));

jest.mock('@aws-sdk/client-s3', () => ({
	S3Client: mockS3Client,
	ListObjectsCommand: jest.fn((params) => ({ name: 'ListObjectsCommand', params })),
	HeadObjectCommand: jest.fn((params) => ({ name: 'HeadObjectCommand', params })),
	CopyObjectCommand: jest.fn((params) => ({ name: 'CopyObjectCommand', params })),
	CreateMultipartUploadCommand: jest.fn((params) => ({ name: 'CreateMultipartUploadCommand', params })),
	UploadPartCopyCommand: jest.fn((params) => ({ name: 'UploadPartCopyCommand', params })),
	CompleteMultipartUploadCommand: jest.fn((params) => ({ name: 'CompleteMultipartUploadCommand', params })),
	AbortMultipartUploadCommand: jest.fn((params) => ({ name: 'AbortMultipartUploadCommand', params }))
}));

const S3Copier = require('../s3.js');

describe('S3Copier', () => {
	let s3Copier;
	const awsConfig = {
		region: 'us-east-1',
		accessKeyId: 'test-key',
		secretAccessKey: 'test-secret'
	};

	beforeEach(() => {
		mockSend.mockClear();
		mockS3Client.mockClear();
	});

	describe('Constructor', () => {
		test('should create instance with valid config', () => {
			s3Copier = new S3Copier(awsConfig);
			expect(s3Copier).toBeInstanceOf(S3Copier);
			expect(mockS3Client).toHaveBeenCalledWith({
				region: 'us-east-1',
				credentials: {
					accessKeyId: 'test-key',
					secretAccessKey: 'test-secret'
				}
			});
		});

		test('should throw error without config', () => {
			expect(() => new S3Copier()).toThrow('Please specify an aws config');
		});

		test('should apply custom options', () => {
			const options = {
				PartSize: 1024 * 1024 * 50,
				PartConcurrency: 5,
				RetryCount: 5,
				RetryDelay: 1000,
				SingleConcurrency: 20,
				MultipartConcurrency: 5,
				Verbose: false
			};
			s3Copier = new S3Copier(awsConfig, options);
			expect(s3Copier.limit.part.max_size).toBe(1024 * 1024 * 50);
			expect(s3Copier.limit.part.parallel).toBe(5);
			expect(s3Copier.limit.retry.count).toBe(5);
			expect(s3Copier.limit.retry.timeout).toBe(1000);
			expect(s3Copier.limit.parallel.single).toBe(20);
			expect(s3Copier.limit.parallel.multipart).toBe(5);
			expect(s3Copier.verbose).toBe(false);
		});
	});

	describe('Data Validation', () => {
		beforeEach(() => {
			s3Copier = new S3Copier(awsConfig);
		});

		test('isDataValid should validate null/undefined', () => {
			expect(s3Copier.isDataValid(null)).toBe(false);
			expect(s3Copier.isDataValid(undefined)).toBe(false);
		});

		test('isDataValid should validate types', () => {
			expect(s3Copier.isDataValid('test', 'string')).toBe(true);
			expect(s3Copier.isDataValid(123, 'number')).toBe(true);
			expect(s3Copier.isDataValid({}, 'object')).toBe(true);
			expect(s3Copier.isDataValid('test', 'number')).toBe(false);
		});

		test('isDataValid should validate arrays', () => {
			expect(s3Copier.isDataValid([], 'object', true)).toBe(false);
			expect(s3Copier.isDataValid([1, 2], 'object', true)).toBe(true);
		});

		test('isDataValid should check length', () => {
			expect(s3Copier.isDataValid('', 'string', true)).toBe(false);
			expect(s3Copier.isDataValid('test', 'string', true)).toBe(true);
		});
	});

	describe('getFormattedDuration', () => {
		beforeEach(() => {
			s3Copier = new S3Copier(awsConfig);
		});

		test('should format duration correctly', () => {
			const start = 1000000;
			const stop = 1065432;
			const result = s3Copier.getFormattedDuration(start, stop);
			expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d+$/);
		});

		test('should format hours, minutes, seconds', () => {
			const start = 0;
			const stop = (3 * 3600 + 25 * 60 + 45) * 1000 + 123;
			const result = s3Copier.getFormattedDuration(start, stop);
			expect(result).toBe('03:25:45.123');
		});
	});

	describe('getKeyPath', () => {
		beforeEach(() => {
			s3Copier = new S3Copier(awsConfig);
		});

		test('should handle root path', () => {
			const result = s3Copier.getKeyPath('/', 'file.txt');
			expect(result).toBe('file.txt');
		});

		test('should handle nested paths', () => {
			const result = s3Copier.getKeyPath('foo/bar', 'foo/bar/file.txt');
			expect(result).toBe('bar/file.txt');
		});
	});

	describe('list', () => {
		beforeEach(() => {
			s3Copier = new S3Copier(awsConfig);
		});

		test('should list objects successfully', async () => {
			mockSend.mockResolvedValueOnce({
				Contents: [
					{ Key: 'file1.txt', Size: 100 },
					{ Key: 'file2.txt', Size: 200 }
				],
				IsTruncated: false
			});

			const result = await s3Copier.list({
				Bucket: 'test-bucket',
				Prefix: 'test/'
			});

			expect(result).toHaveLength(2);
			expect(result[0].Key).toBe('file1.txt');
			expect(mockSend).toHaveBeenCalledTimes(1);
		});

		test('should handle pagination', async () => {
			mockSend
				.mockResolvedValueOnce({
					Contents: [{ Key: 'file1.txt', Size: 100 }],
					IsTruncated: true
				})
				.mockResolvedValueOnce({
					Contents: [{ Key: 'file2.txt', Size: 200 }],
					IsTruncated: false
				});

			const result = await s3Copier.list({
				Bucket: 'test-bucket',
				Prefix: 'test/'
			});

			expect(result).toHaveLength(2);
			expect(mockSend).toHaveBeenCalledTimes(2);
		});

		test('should handle root prefix', async () => {
			mockSend.mockResolvedValueOnce({
				Contents: [{ Key: 'file.txt', Size: 100 }],
				IsTruncated: false
			});

			await s3Copier.list({
				Bucket: 'test-bucket',
				Prefix: '/'
			});

			const commandParams = mockSend.mock.calls[0][0].params;
			expect(commandParams.Prefix).toBe('');
		});

		test('should throw error for invalid params', async () => {
			await expect(s3Copier.list({})).rejects.toThrow('Invalid list param');
		});
	});

	describe('isItemCopied', () => {
		beforeEach(() => {
			s3Copier = new S3Copier(awsConfig);
		});

		test('should return true when item exists with same size', async () => {
			mockSend.mockResolvedValueOnce({
				ContentLength: 1024
			});

			const result = await s3Copier.isItemCopied({
				Destination: { Bucket: 'dest', Key: 'file.txt' },
				Size: 1024
			});

			expect(result).toEqual({
				message: 'Data is already copied',
				data: expect.any(Object)
			});
		});

		test('should return null when item does not exist', async () => {
			mockSend.mockRejectedValueOnce(new Error('NotFound'));

			const result = await s3Copier.isItemCopied({
				Destination: { Bucket: 'dest', Key: 'file.txt' },
				Size: 1024
			});

			expect(result).toBeNull();
		});

		test('should return null when size differs', async () => {
			mockSend.mockResolvedValueOnce({
				ContentLength: 2048
			});

			const result = await s3Copier.isItemCopied({
				Destination: { Bucket: 'dest', Key: 'file.txt' },
				Size: 1024
			});

			expect(result).toBeNull();
		});
	});

	describe('copySingle', () => {
		beforeEach(() => {
			s3Copier = new S3Copier(awsConfig, { Verbose: false });
		});

		test('should copy single file successfully', async () => {
			mockSend
				.mockResolvedValueOnce({ ContentLength: 999 }) // isItemCopied check - not found
				.mockRejectedValueOnce(new Error('NotFound')) // Second check confirms not copied
				.mockResolvedValueOnce({}) // copyObject
				.mockResolvedValueOnce({ ContentLength: 1024 }); // validation headObject

			const result = await s3Copier.copySingle({
				Source: { Bucket: 'src', Key: 'file.txt' },
				Destination: { Bucket: 'dest', Key: 'file.txt' },
				Size: 1024
			});

			expect(result).toBeDefined();
		});

		test('should skip already copied file', async () => {
			mockSend.mockResolvedValueOnce({
				ContentLength: 1024
			});

			const result = await s3Copier.copySingle({
				Source: { Bucket: 'src', Key: 'file.txt' },
				Destination: { Bucket: 'dest', Key: 'file.txt' },
				Size: 1024
			});

			expect(result.message).toBe('Data is already copied');
		});

		test('should retry on failure', async () => {
			mockSend
				.mockRejectedValueOnce(new Error('NotFound')) // isItemCopied
				.mockRejectedValueOnce(new Error('NetworkError')) // First copy attempt
				.mockResolvedValueOnce({}) // Second copy attempt succeeds
				.mockResolvedValueOnce({ ContentLength: 1024 }); // validation

			const result = await s3Copier.copySingle({
				Source: { Bucket: 'src', Key: 'file.txt' },
				Destination: { Bucket: 'dest', Key: 'file.txt' },
				Size: 1024
			});

			expect(result).toBeDefined();
		});
	});

	describe('copyMultipart', () => {
		beforeEach(() => {
			s3Copier = new S3Copier(awsConfig, {
				Verbose: false,
				PartSize: 1024 * 1024 * 100
			});
		});

		test('should copy large file with multipart', async () => {
			const fileSize = 1024 * 1024 * 1024 * 6; // 6GB
			const numParts = Math.ceil(fileSize / (1024 * 1024 * 100));

			mockSend
				.mockRejectedValueOnce(new Error('NotFound')); // isItemCopied

			mockSend.mockResolvedValueOnce({ UploadId: 'test-upload-id' }); // createMultipartUpload

			// Mock all uploadPartCopy calls
			for (let i = 0; i < numParts; i++) {
				mockSend.mockResolvedValueOnce({
					CopyPartResult: { ETag: `etag-${i}` }
				});
			}

			mockSend.mockResolvedValueOnce({}); // completeMultipartUpload
			mockSend.mockResolvedValueOnce({ ContentLength: fileSize }); // validation headObject

			const result = await s3Copier.copyMultipart({
				Source: { Bucket: 'src', Key: 'large-file.zip' },
				Destination: { Bucket: 'dest', Key: 'large-file.zip' },
				Size: fileSize
			});

			expect(result).toBeDefined();
		});

		test('should skip already copied multipart file', async () => {
			mockSend.mockResolvedValueOnce({
				ContentLength: 6000000000
			});

			const result = await s3Copier.copyMultipart({
				Source: { Bucket: 'src', Key: 'file.txt' },
				Destination: { Bucket: 'dest', Key: 'file.txt' },
				Size: 6000000000
			});

			expect(result.message).toBe('Data is already copied');
		});

		test('should abort upload on failure', async () => {
			mockSend
				.mockRejectedValueOnce(new Error('NotFound')) // isItemCopied
				.mockResolvedValueOnce({ UploadId: 'test-upload-id' }) // createMultipartUpload
				.mockRejectedValueOnce(new Error('Upload failed')); // uploadPartCopy fails

			await expect(s3Copier.copyMultipart({
				Source: { Bucket: 'src', Key: 'file.txt' },
				Destination: { Bucket: 'dest', Key: 'file.txt' },
				Size: 6000000000
			})).rejects.toThrow();
		});

		test('should reject files with too many parts', async () => {
			mockSend.mockRejectedValueOnce(new Error('NotFound')); // isItemCopied

			const fileSize = 1024 * 1024 * 1024 * 1024; // 1TB (will create >10000 parts with 100MB part size)

			await expect(s3Copier.copyMultipart({
				Source: { Bucket: 'src', Key: 'huge-file.zip' },
				Destination: { Bucket: 'dest', Key: 'huge-file.zip' },
				Size: fileSize
			})).rejects.toThrow('Uploading of more than 10000 parts is not supported');
		});
	});

	describe('copy', () => {
		beforeEach(() => {
			s3Copier = new S3Copier(awsConfig, { Verbose: false });
		});

		test('should copy single file with single copy method', async () => {
			mockSend
				.mockResolvedValueOnce({ // list
					Contents: [{ Key: 'file.txt', Size: 1024 }],
					IsTruncated: false
				})
				.mockRejectedValueOnce(new Error('NotFound')) // isItemCopied
				.mockResolvedValueOnce({}) // copyObject
				.mockResolvedValueOnce({ ContentLength: 1024 }); // validation

			const result = await s3Copier.copy({
				Source: { Bucket: 'src', Key: 'file.txt' },
				Destination: { Bucket: 'dest', Prefix: 'backup/' }
			});

			expect(result).toBe('Copy operation is completed');
		});

		test('should copy files from listing', async () => {
			mockSend
				.mockResolvedValueOnce({ // list
					Contents: [
						{ Key: 'folder/file1.txt', Size: 1024 }
					],
					IsTruncated: false
				})
				.mockRejectedValueOnce(new Error('NotFound')) // isItemCopied
				.mockResolvedValueOnce({}) // copyObject
				.mockResolvedValueOnce({ ContentLength: 1024 }); // validation

			const result = await s3Copier.copy({
				Source: { Bucket: 'src', Key: 'folder/' },
				Destination: { Bucket: 'dest', Prefix: 'backup/' }
			});

			expect(result).toBe('Copy operation is completed');
		});

		test('should throw error for invalid params', async () => {
			await expect(s3Copier.copy(null)).rejects.toThrow('Invalid copy param');
			await expect(s3Copier.copy({})).rejects.toThrow('Invalid copy param');
		});

		test('should support legacy callback API for backward compatibility', (done) => {
			mockSend
				.mockResolvedValueOnce({ // list
					Contents: [{ Key: 'file.txt', Size: 1024 }],
					IsTruncated: false
				})
				.mockRejectedValueOnce(new Error('NotFound')) // isItemCopied
				.mockResolvedValueOnce({}) // copyObject
				.mockResolvedValueOnce({ ContentLength: 1024 }); // validation

			// Use callback API (v1.x compatibility)
			s3Copier.copy({
				Source: { Bucket: 'src', Key: 'file.txt' },
				Destination: { Bucket: 'dest', Prefix: 'backup/' }
			}, function(err, data) {
				expect(err).toBeNull();
				expect(data).toBe('Copy operation is completed');
				done();
			});
		});

		test('should handle errors in legacy callback API', (done) => {
			mockSend.mockRejectedValueOnce(new Error('S3 Error'));

			s3Copier.copy({
				Source: { Bucket: 'src', Key: 'file.txt' },
				Destination: { Bucket: 'dest', Prefix: 'backup/' }
			}, function(err, data) {
				expect(err).toBeDefined();
				expect(err.message).toBe('S3 Error');
				expect(data).toBeUndefined();
				done();
			});
		});
	});

	describe('parallelLimit', () => {
		beforeEach(() => {
			s3Copier = new S3Copier(awsConfig);
		});

		test('should execute tasks in parallel with limit', async () => {
			const items = [1, 2, 3, 4, 5];
			const limit = 2;
			const results = [];

			await s3Copier.parallelLimit(items, limit, async (item) => {
				results.push(item);
				await new Promise(resolve => setTimeout(resolve, 10));
				return item * 2;
			});

			expect(results).toHaveLength(5);
			expect(results.sort()).toEqual([1, 2, 3, 4, 5]);
		});
	});
});
