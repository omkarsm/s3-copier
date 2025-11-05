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

class S3Copier {
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

	log(msg) {
		if (this.verbose) {
			console.log(msg);
		}
	}

	// Data validator
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

	// Used for formatting the duration
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

	getKeyPath(srcPath, keyPath) {
		if (srcPath === '/') {
			return keyPath;
		}
		const folders = srcPath.split('/');
		return folders[folders.length - 1] + keyPath.substr(srcPath.length);
	}

	async list(lParam) {
		if (!this.isDataValid(lParam, 'object')) {
			throw new Error('Invalid list param');
		}
		if (!this.isDataValid(lParam.Bucket, 'string', true) ||
		    !this.isDataValid(lParam.Prefix, 'string', true)) {
			throw new Error('Invalid list param');
		}

		let prefix = lParam.Prefix === '/' ? '' : lParam.Prefix;
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

	// Helper function to run tasks in parallel with a limit
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

	async copy(cParam) {
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
	}
}

module.exports = S3Copier;
