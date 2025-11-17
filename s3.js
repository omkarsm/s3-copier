'use strict';

const {
	S3Client,
	ListObjectsCommand,
	HeadObjectCommand,
	CopyObjectCommand,
	CreateMultipartUploadCommand,
	UploadPartCopyCommand,
	CompleteMultipartUploadCommand,
	AbortMultipartUploadCommand
} = require('@aws-sdk/client-s3');
const config = require('./config.js');

/**
 * S3Copier class for copying files and directories between S3 buckets
 * @class
 */
class S3Copier {
	/**
	 * Create an S3Copier instance
	 * @param {Object} awsConfig - AWS configuration object
	 * @param {string} awsConfig.region - AWS region (e.g., 'us-east-1')
	 * @param {string} awsConfig.accessKeyId - AWS access key ID
	 * @param {string} awsConfig.secretAccessKey - AWS secret access key
	 * @param {Object} [options={}] - Optional configuration parameters
	 * @param {number} [options.PartSize] - Part size for multipart uploads (default: 100MB)
	 * @param {number} [options.PartConcurrency] - Number of parts to upload in parallel (default: 10)
	 * @param {number} [options.RetryCount] - Number of retry attempts on failure (default: 3)
	 * @param {number} [options.RetryDelay] - Delay in ms between retries (default: 2000)
	 * @param {number} [options.ExpireDuration] - Multipart upload expiry time in ms (default: 12 hours)
	 * @param {number} [options.SingleConcurrency] - Concurrent single file operations (default: 40)
	 * @param {number} [options.MultipartConcurrency] - Concurrent multipart operations (default: 10)
	 * @param {boolean} [options.Verbose] - Enable verbose logging (default: true)
	 * @throws {Error} When awsConfig is not provided
	 */
	constructor(awsConfig, options = {}) {
		if (typeof awsConfig !== 'object') {
			throw new Error('Please specify an aws config');
		}

		this.limit = JSON.parse(JSON.stringify(config.limit));
		this.verbose = config.verbose;

		// Apply user options
		if (this.isDataValid(options, 'object')) {
			this.limit.part.max_size = options.PartSize || config.limit.part.max_size;
			this.limit.part.parallel = options.PartConcurrency || config.limit.part.parallel;
			this.limit.retry.count = options.RetryCount || config.limit.retry.count;
			this.limit.retry.timeout = options.RetryDelay || config.limit.retry.timeout;
			this.limit.expires = options.ExpireDuration || config.limit.expires;
			this.limit.parallel.single = options.SingleConcurrency || config.limit.parallel.single;
			this.limit.parallel.multipart = options.MultipartConcurrency || config.limit.parallel.multipart;
			this.verbose = options.Verbose !== undefined ? options.Verbose : config.verbose;
		}

		// Create S3 client with AWS SDK v3
		this.s3Client = new S3Client({
			region: awsConfig.region,
			credentials: {
				accessKeyId: awsConfig.accessKeyId,
				secretAccessKey: awsConfig.secretAccessKey
			}
		});
	}

	/**
	 * Log messages if verbose mode is enabled
	 * @private
	 * @param {string} msg - Message to log
	 */
	log(msg) {
		if (this.verbose) {
			console.log(msg);
		}
	}

	/**
	 * Validate data type and constraints
	 * @private
	 * @param {*} data - Data to validate
	 * @param {string} type - Expected type
	 * @param {boolean} checkLength - Whether to check length > 0
	 * @returns {boolean} True if valid
	 */
	isDataValid(data, type, checkLength) {
		if (data == null) return false;
		if (type != null && typeof data !== type) return false;
		if (type === 'object' && checkLength === true) {
			if (!Array.isArray(data)) return false;
		}
		if (checkLength != null && checkLength && data.length === 0) {
			return false;
		}
		return true;
	}

	/**
	 * Format duration in HH:MM:SS.ms format
	 * @param {number} start - Start timestamp in milliseconds
	 * @param {number} stop - Stop timestamp in milliseconds
	 * @returns {string} Formatted duration string
	 */
	getFormattedDuration(start, stop) {
		const diff = parseInt((stop - start) / 1000);
		let hh = '' + parseInt(diff / 3600);
		let mm = '' + (parseInt(diff / 60) % 60);
		let ss = '' + parseInt(diff % 60);
		let ms = '' + parseInt((stop - start) % 1000);
		return (hh.length > 1 ? hh : '0' + hh) + ':' +
		       (mm.length > 1 ? mm : '0' + mm) + ':' +
		       (ss.length > 1 ? ss : '0' + ss) + '.' + ms;
	}

	/**
	 * Check if an item has already been copied
	 * @private
	 * @param {Object} cmParam - Copy parameters with Source, Destination, and Size
	 * @returns {Promise<Object|null>} Object with message if already copied, null otherwise
	 */
	async isItemCopied(cmParam) {
		try {
			const command = new HeadObjectCommand({
				Bucket: cmParam.Destination.Bucket,
				Key: cmParam.Destination.Key
			});
			const mhoData = await this.s3Client.send(command);

			if (mhoData && mhoData.ContentLength === cmParam.Size) {
				return {
					message: 'Data is already copied',
					data: cmParam
				};
			}
			return null;
		} catch (err) {
			// Object doesn't exist, not copied yet
			return null;
		}
	}

	/**
	 * Get destination key path from source path
	 * @private
	 * @param {string} srcPath - Source path
	 * @param {string} keyPath - Key path
	 * @returns {string} Formatted key path
	 */
	getKeyPath(srcPath, keyPath) {
		if (srcPath === '/') {
			return keyPath;
		}
		const folders = srcPath.split('/');
		return folders[folders.length - 1] + keyPath.substr(srcPath.length);
	}

	/**
	 * List all objects in an S3 bucket with given prefix
	 * @param {Object} lParam - List parameters
	 * @param {string} lParam.Bucket - S3 bucket name
	 * @param {string} [lParam.Prefix] - Object key prefix (optional, defaults to root)
	 * @returns {Promise<Array>} Array of S3 objects
	 * @throws {Error} When parameters are invalid
	 */
	async list(lParam) {
		if (!this.isDataValid(lParam, 'object')) {
			throw new Error('Invalid list param');
		}
		if (!this.isDataValid(lParam.Bucket, 'string', true)) {
			throw new Error('Invalid list param: Bucket is required');
		}

		// Prefix is optional - can be undefined, null, empty string, or '/'
		let prefix = '';
		if (lParam.Prefix != null) {
			prefix = lParam.Prefix === '/' ? '' : lParam.Prefix;
		}
		const finalSet = [];
		let marker;

		do {
			const params = {
				Bucket: lParam.Bucket,
				Prefix: prefix
			};
			if (marker) {
				params.Marker = marker;
			}

			const command = new ListObjectsCommand(params);
			const data = await this.s3Client.send(command);

			if (data.Contents && data.Contents.length) {
				finalSet.push(...data.Contents);
			}

			if (data.IsTruncated) {
				marker = data.Contents[data.Contents.length - 1].Key;
			} else {
				marker = null;
			}
		} while (marker);

		return finalSet;
	}

	async copySingleWithRetry(csParam, attempt = 1) {
		try {
			this.log('Started copying : ' + csParam.Source.Key);

			const copyCommand = new CopyObjectCommand({
				Bucket: csParam.Destination.Bucket,
				CopySource: csParam.Source.Bucket + '/' + (csParam.Source.Key === '/' ? '' : csParam.Source.Key),
				Key: csParam.Destination.Key
			});

			const coData = await this.s3Client.send(copyCommand);

			// Validate the copy
			const headCommand = new HeadObjectCommand({
				Bucket: csParam.Destination.Bucket,
				Key: csParam.Destination.Key
			});
			const hoData = await this.s3Client.send(headCommand);

			if (hoData.ContentLength !== csParam.Size) {
				throw new Error(`Size does not match. Expected: ${csParam.Size}, Actual: ${hoData.ContentLength}`);
			}

			this.log('Copy complete : ' + csParam.Source.Key);
			return coData;
		} catch (err) {
			this.log('Copy failed ' + csParam.Destination.Key);
			this.log(err);

			if (attempt < this.limit.retry.count) {
				this.log(`Reattempt ${attempt + 1}/${this.limit.retry.count}`);
				await new Promise(resolve => setTimeout(resolve, this.limit.retry.timeout));
				return this.copySingleWithRetry(csParam, attempt + 1);
			}
			throw err;
		}
	}

	/**
	 * Copy a single file (< 5GB) using standard S3 copyObject
	 * @param {Object} csParam - Copy parameters
	 * @param {Object} csParam.Source - Source bucket and key
	 * @param {Object} csParam.Destination - Destination bucket and key
	 * @param {number} csParam.Size - File size in bytes
	 * @returns {Promise<Object>} Copy result
	 */
	async copySingle(csParam) {
		const isCopied = await this.isItemCopied(csParam);
		if (isCopied) {
			return isCopied;
		}
		return this.copySingleWithRetry(csParam);
	}

	async uploadPartCopyWithRetry(params, pNum, range, attempt = 1) {
		try {
			const command = new UploadPartCopyCommand(params);
			const upcData = await this.s3Client.send(command);
			this.log(`Part ${pNum + 1} with range ${range} is copied.`);
			return upcData;
		} catch (err) {
			this.log(`Failed to upload part ${pNum + 1} with range ${range}`);
			this.log(err);

			if (attempt < this.limit.retry.count) {
				this.log(`Reattempt ${attempt + 1}/${this.limit.retry.count}`);
				await new Promise(resolve => setTimeout(resolve, this.limit.retry.timeout));
				return this.uploadPartCopyWithRetry(params, pNum, range, attempt + 1);
			}
			throw err;
		}
	}

	/**
	 * Copy a large file (>= 5GB) using multipart upload
	 * @param {Object} cmParam - Copy parameters
	 * @param {Object} cmParam.Source - Source bucket and key
	 * @param {Object} cmParam.Destination - Destination bucket and key
	 * @param {number} cmParam.Size - File size in bytes
	 * @returns {Promise<Object>} Copy result
	 * @throws {Error} When file requires more than 10,000 parts
	 */
	async copyMultipart(cmParam) {
		const isCopied = await this.isItemCopied(cmParam);
		if (isCopied) {
			return isCopied;
		}

		const maxSize = this.limit.part.max_size;
		const partsArr = [];
		const completeArr = [];

		// Calculate parts
		for (let i = 0; i < cmParam.Size;) {
			partsArr.push(i + '-' + (i + maxSize >= cmParam.Size ? cmParam.Size - 1 : i + maxSize - 1));
			i += maxSize;
			completeArr.push({});
		}

		this.log(`${partsArr.length} parts with size ${maxSize} bytes are queued to upload`);

		if (partsArr.length > 10000) {
			throw new Error('Uploading of more than 10000 parts is not supported.');
		}

		this.log('Started copying : ' + cmParam.Source.Key);

		// Create multipart upload
		const createCommand = new CreateMultipartUploadCommand({
			Bucket: cmParam.Destination.Bucket,
			Key: cmParam.Destination.Key,
			Expires: new Date(Date.now() + this.limit.expires)
		});

		let cmuData;
		try {
			cmuData = await this.s3Client.send(createCommand);
		} catch (err) {
			throw err;
		}

		const count = { value: 0 };
		const startTime = Date.now();

		try {
			// Upload parts with concurrency control
			await this.parallelLimit(
				partsArr,
				this.limit.part.parallel,
				async (range, pNum) => {
					const uploadParams = {
						Bucket: cmParam.Destination.Bucket,
						Key: cmParam.Destination.Key,
						CopySource: cmParam.Source.Bucket + '/' + (cmParam.Source.Key === '/' ? '' : cmParam.Source.Key),
						CopySourceRange: 'bytes=' + range,
						PartNumber: pNum + 1,
						UploadId: cmuData.UploadId
					};

					const upcData = await this.uploadPartCopyWithRetry(uploadParams, pNum, range);

					this.log('Item Stats: ' + cmParam.Source.Bucket + '/' + cmParam.Source.Key);
					count.value++;
					this.log(`Upload percent: ${Math.round((count.value * 10000) / partsArr.length) / 100} || Time elapsed: ${this.getFormattedDuration(startTime, Date.now())}`);

					completeArr[pNum] = {
						ETag: upcData.CopyPartResult.ETag,
						PartNumber: pNum + 1
					};
				}
			);

			// Complete multipart upload
			const completeCommand = new CompleteMultipartUploadCommand({
				Bucket: cmParam.Destination.Bucket,
				Key: cmParam.Destination.Key,
				UploadId: cmuData.UploadId,
				MultipartUpload: {
					Parts: completeArr
				}
			});

			const cmpData = await this.s3Client.send(completeCommand);

			// Validate final file
			const headCommand = new HeadObjectCommand({
				Bucket: cmParam.Destination.Bucket,
				Key: cmParam.Destination.Key
			});
			const hoData = await this.s3Client.send(headCommand);

			if (hoData.ContentLength !== cmParam.Size) {
				throw new Error(`Size does not match. Expected: ${cmParam.Size}, Actual: ${hoData.ContentLength}`);
			}

			return cmpData;
		} catch (err) {
			this.log(err);
			// Abort multipart upload on failure
			const abortCommand = new AbortMultipartUploadCommand({
				Bucket: cmParam.Destination.Bucket,
				Key: cmParam.Destination.Key,
				UploadId: cmuData.UploadId
			});
			try {
				await this.s3Client.send(abortCommand);
			} catch (amuErr) {
				this.log('Failed to abort multipart upload: ' + amuErr);
			}
			throw err;
		}
	}

	/**
	 * Execute tasks in parallel with concurrency limit
	 * @private
	 * @param {Array} items - Items to process
	 * @param {number} limit - Maximum concurrent operations
	 * @param {Function} iteratorFn - Function to execute for each item
	 * @returns {Promise<Array>} Results from all operations
	 */
	async parallelLimit(items, limit, iteratorFn) {
		const results = [];
		const executing = [];

		for (let i = 0; i < items.length; i++) {
			const promise = Promise.resolve().then(() => iteratorFn(items[i], i));
			results.push(promise);

			if (limit <= items.length) {
				const e = promise.then(() => executing.splice(executing.indexOf(e), 1));
				executing.push(e);
				if (executing.length >= limit) {
					await Promise.race(executing);
				}
			}
		}

		return Promise.all(results);
	}

	/**
	 * Copy files, directories, or entire buckets between S3 locations
	 * Supports both callback and Promise-based APIs for backward compatibility
	 * @param {Object|Array} cParam - Copy parameter(s). Can be single object or array of objects
	 * @param {Object} cParam.Source - Source configuration
	 * @param {string} cParam.Source.Bucket - Source bucket name
	 * @param {string} cParam.Source.Key - Source key or prefix (use '/' for entire bucket)
	 * @param {Object} cParam.Destination - Destination configuration
	 * @param {string} cParam.Destination.Bucket - Destination bucket name
	 * @param {string} [cParam.Destination.Prefix] - Destination prefix for multiple files
	 * @param {string} [cParam.Destination.Key] - Destination key for single file/rename
	 * @param {Function} [callback] - Optional callback function(err, result) for backward compatibility
	 * @returns {Promise<string>} Success message (when used without callback)
	 * @throws {Error} When parameters are invalid
	 * @example
	 * // Modern Promise-based API (v2.0+)
	 * const result = await s3Copier.copy({
	 *   Source: { Bucket: 'source-bucket', Key: 'file.txt' },
	 *   Destination: { Bucket: 'dest-bucket', Prefix: 'backup/' }
	 * });
	 *
	 * @example
	 * // Legacy callback API (v1.x compatibility)
	 * s3Copier.copy({
	 *   Source: { Bucket: 'source-bucket', Key: 'file.txt' },
	 *   Destination: { Bucket: 'dest-bucket', Prefix: 'backup/' }
	 * }, function(err, data) {
	 *   if (err) console.error(err);
	 *   else console.log(data);
	 * });
	 *
	 * @example
	 * // Copy entire bucket
	 * await s3Copier.copy({
	 *   Source: { Bucket: 'source-bucket', Key: '/' },
	 *   Destination: { Bucket: 'dest-bucket' }
	 * });
	 */
	copy(cParam, callback) {
		// Backward compatibility: detect if callback is provided
		const isCallbackMode = typeof callback === 'function';

		// Wrap the async implementation
		const executeAsync = async () => {
			let copyArr = [];

			if (!this.isDataValid(cParam, 'object')) {
				throw new Error('Invalid copy param');
			}

			if (Array.isArray(cParam)) {
				for (let i = 0; i < cParam.length; i++) {
					if (!this.isDataValid(cParam[i].Source, 'object') ||
					    !this.isDataValid(cParam[i].Destination, 'object') ||
					    !this.isDataValid(cParam[i].Source.Bucket, 'string', true) ||
					    !this.isDataValid(cParam[i].Source.Key, 'string', true) ||
					    !this.isDataValid(cParam[i].Destination.Bucket, 'string', true)) {
						throw new Error('Invalid copy param');
					}
				}
				copyArr = cParam;
			} else {
				if (!this.isDataValid(cParam.Source, 'object') ||
				    !this.isDataValid(cParam.Destination, 'object') ||
				    !this.isDataValid(cParam.Source.Bucket, 'string', true) ||
				    !this.isDataValid(cParam.Source.Key, 'string', true) ||
				    !this.isDataValid(cParam.Destination.Bucket, 'string', true)) {
					throw new Error('Invalid copy param');
				}
				copyArr.push(cParam);
			}

			const copier = {
				multi_part: [],
				single: []
			};

			// List all source files
			for (const item of copyArr) {
				const lData = await this.list({
					Bucket: item.Source.Bucket,
					Prefix: item.Source.Key
				});

				lData.forEach(lItem => {
					const copyItem = {
						Source: {
							Bucket: item.Source.Bucket,
							Key: lItem.Key
						},
						Destination: {
							Bucket: item.Destination.Bucket,
							Key: typeof item.Destination.Key === 'string'
								? item.Destination.Key
								: ((typeof item.Destination.Prefix === 'string' ? item.Destination.Prefix : '') +
								   this.getKeyPath(item.Source.Key, lItem.Key))
						},
						Size: lItem.Size
					};

					if (lItem.Size >= config.limit.aws_size) {
						copier.multi_part.push(copyItem);
					} else {
						copier.single.push(copyItem);
					}
				});
			}

			this.log(`${copier.single.length + copier.multi_part.length} files are queued for copy`);

			// Copy single files with concurrency limit
			if (copier.single.length > 0) {
				await this.parallelLimit(
					copier.single,
					this.limit.parallel.single,
					async (cpItem) => {
						const csData = await this.copySingle(cpItem);
						this.log(csData);
					}
				);
			}

			// Copy multipart files with concurrency limit
			if (copier.multi_part.length > 0) {
				await this.parallelLimit(
					copier.multi_part,
					this.limit.parallel.multipart,
					async (cpItem) => {
						const cmData = await this.copyMultipart(cpItem);
						this.log(cmData);
					}
				);
			}

			return 'Copy operation is completed';
		};

		// Execute based on API style (callback or Promise)
		if (isCallbackMode) {
			// Legacy callback API (v1.x compatibility)
			executeAsync()
				.then(result => callback(null, result))
				.catch(err => callback(err));
		} else {
			// Modern Promise API (v2.0+)
			return executeAsync();
		}
	}
}

module.exports = S3Copier;
