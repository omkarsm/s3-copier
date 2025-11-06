# s3-copier

[![NPM Version](https://img.shields.io/npm/v/s3-copier.svg)](https://www.npmjs.com/package/s3-copier)
[![CI](https://github.com/omkarsm/s3-copier/workflows/CI/badge.svg)](https://github.com/omkarsm/s3-copier/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/omkarsm/s3-copier/graph/badge.svg?token=7285AVKHZT)](https://codecov.io/gh/omkarsm/s3-copier)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org)
[![Downloads](https://img.shields.io/npm/dm/s3-copier.svg)](https://www.npmjs.com/package/s3-copier)

S3 Copier module for copying contents between S3 buckets.
Content can be multiple files/directory/bucket to be copied.

## Version 2.0 - Major Update with Backward Compatibility ✨

Version 2.0 has been completely rewritten to use:
- **Node.js 24+ LTS** (minimum required version - latest LTS 'Krypton')
- **AWS SDK v3** (`@aws-sdk/client-s3`)
- **Modern JavaScript** (ES6+, async/await)
- **No external dependencies** (removed `async` library)
- **90% test coverage** with comprehensive test suite
- **CI/CD pipelines** for automated testing and publishing

### 🔄 Backward Compatibility

**Good news!** Version 2.0 maintains **full backward compatibility** with v1.x callback-based API while also supporting modern Promise/async-await syntax.

**You can use either API style:**
- **async/await** syntax (recommended for new code)
- **Promises** with `.then()/.catch()`
- **Callbacks** (legacy v1.x API - fully supported!)

**No migration required** - your existing v1.x code will continue to work!

## Installation

```bash
npm install s3-copier
```

**Requirements:**
- Node.js >= 24.0.0 (LTS 'Krypton')
- AWS credentials with appropriate S3 permissions

## Usage

### Initiating S3 Copier module

```js
const S3Copier = require('s3-copier');

const awsConfig = {
	region: 'us-east-1',			// AWS region
	secretAccessKey: '*****************',	// AWS secret access key
	accessKeyId: '*********'		// AWS access key ID
};

const options = {
	PartSize: 1024 * 1024 * 100,		// Optional: Defaults to 100 MBytes
	PartConcurrency: 10,			// Optional: Defaults to 10 parallel operations
	RetryCount: 3,				// Optional: Defaults to 3 retries on failure
	RetryDelay: 2000,			// Optional: Defaults to 2 seconds retry delay
	ExpireDuration: 12 * 60 * 60 * 1000,	// Optional: Defaults to 12 Hours for expiring incomplete multipart upload
	SingleConcurrency: 40,			// Optional: Defaults to 40 parallel copy operations for files < 5 GB
	MultipartConcurrency: 10,		// Optional: Defaults to 10 parallel copy operations for files > 5 GB
	Verbose: true				// Optional: Defaults to true (show logs)
};

const s3Copier = new S3Copier(awsConfig, options);	// S3Copier(awsConfig[, options])
```

### Performing directory copy

**Option 1: async/await (recommended for new code):**
```js
try {
	const result = await s3Copier.copy({
		Source: {
			Bucket: 'SOURCE_AWS_BUCKET_NAME',
			Key: 'Bar/Foo'
		},
		Destination: {
			Bucket: 'DESTINATION_AWS_BUCKET_NAME',
			Prefix: 'Bar/'
		}
	});
	console.log(result);
} catch (err) {
	console.error(err);
}
```

**Option 2: Callbacks (v1.x compatible - no changes needed!):**
```js
s3Copier.copy({
	Source: {
		Bucket: 'SOURCE_AWS_BUCKET_NAME',
		Key: 'Bar/Foo'
	},
	Destination: {
		Bucket: 'DESTINATION_AWS_BUCKET_NAME',
		Prefix: 'Bar/'
	}
}, function(err, data) {
	if (err) {
		console.error(err);
	} else {
		console.log(data);
	}
});
```

**Option 3: Promises:**
```js
s3Copier.copy({
	Source: {
		Bucket: 'SOURCE_AWS_BUCKET_NAME',
		Key: 'Bar/Foo'
	},
	Destination: {
		Bucket: 'DESTINATION_AWS_BUCKET_NAME',
		Prefix: 'Bar/'
	}
})
.then(result => console.log(result))
.catch(err => console.error(err));
```

### Performing contents of directory copy

```js
await s3Copier.copy({
	Source: {
		Bucket: 'SOURCE_AWS_BUCKET_NAME',
		Key: 'Bar/Foo/'	// Trailing slash copies contents
	},
	Destination: {
		Bucket: 'DESTINATION_AWS_BUCKET_NAME',
		Prefix: 'Bar/'
	}
});
```

### Performing file copy

```js
await s3Copier.copy({
	Source: {
		Bucket: 'SOURCE_AWS_BUCKET_NAME',
		Key: 'Foo/Bar/hello.txt'
	},
	Destination: {
		Bucket: 'DESTINATION_AWS_BUCKET_NAME',
		Prefix: 'Bar/'
	}
});
```

### Performing file copy by renaming on destination

```js
await s3Copier.copy({
	Source: {
		Bucket: 'SOURCE_AWS_BUCKET_NAME',
		Key: 'Foo/Bar/hello.txt'
	},
	Destination: {
		Bucket: 'DESTINATION_AWS_BUCKET_NAME',
		Key: 'Bar/world.txt'	// Use Key instead of Prefix to rename
	}
});
```

### Performing multiple file/directory copy operations

```js
await s3Copier.copy([
	{
		Source: {
			Bucket: 'SOURCE_AWS_BUCKET_NAME',
			Key: 'Foo/Bar/'
		},
		Destination: {
			Bucket: 'DESTINATION_AWS_BUCKET_NAME',
			Prefix: 'Foo/'
		}
	},
	{
		Source: {
			Bucket: 'SOURCE_AWS_BUCKET_NAME',
			Key: 'Foo/Bar/hello.txt'
		},
		Destination: {
			Bucket: 'DESTINATION_AWS_BUCKET_NAME',
			Key: 'Bar/world.txt'
		}
	},
	{
		Source: {
			Bucket: 'SOURCE_AWS_BUCKET_NAME',
			Key: 'Foo/Bar/hello.txt'
		},
		Destination: {
			Bucket: 'DESTINATION_AWS_BUCKET_NAME',
			Prefix: 'Bar/'
		}
	}
]);
```

### Performing bucket to bucket copy operations

```js
await s3Copier.copy({
	Source: {
		Bucket: 'SOURCE_AWS_BUCKET_NAME',
		Key: '/'	// Root key copies entire bucket
	},
	Destination: {
		Bucket: 'DESTINATION_AWS_BUCKET_NAME'
	}
});
```

### Additional Methods

#### List bucket contents

```js
const files = await s3Copier.list({
	Bucket: 'BUCKET_NAME',
	Prefix: 'path/to/folder/'
});
console.log(files); // Array of S3 object metadata
```

#### Format duration

```js
const startTime = Date.now();
// ... perform operations ...
const endTime = Date.now();
const duration = s3Copier.getFormattedDuration(startTime, endTime);
console.log(duration); // "00:05:23.456"
```

#### Direct single file copy

```js
const result = await s3Copier.copySingle({
	Source: { Bucket: 'source-bucket', Key: 'file.txt' },
	Destination: { Bucket: 'dest-bucket', Key: 'file.txt' },
	Size: 1024
});
```

#### Direct multipart copy

```js
const result = await s3Copier.copyMultipart({
	Source: { Bucket: 'source-bucket', Key: 'large-file.zip' },
	Destination: { Bucket: 'dest-bucket', Key: 'large-file.zip' },
	Size: 6000000000 // 6 GB
});
```

## Features

- ✅ **Automatic file size detection** - Uses single copy for files <5GB, multipart for files ≥5GB
- ✅ **Parallel operations** - Configurable concurrency for optimal performance
- ✅ **Retry logic** - Automatic retry on failures with configurable attempts and delays
- ✅ **Progress tracking** - Verbose logging with percentage completion and elapsed time
- ✅ **Size validation** - Verifies file sizes after copy operations
- ✅ **Duplicate detection** - Skips already copied files based on size comparison
- ✅ **Large file support** - Handles files up to 5TB using multipart copy
- ✅ **Modern JavaScript** - Built with ES6+, async/await, and Promises

## AWS Permissions Required

Your AWS credentials need the following S3 permissions:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": [
				"s3:GetObject",
				"s3:PutObject",
				"s3:ListBucket",
				"s3:AbortMultipartUpload"
			],
			"Resource": [
				"arn:aws:s3:::source-bucket/*",
				"arn:aws:s3:::destination-bucket/*",
				"arn:aws:s3:::source-bucket",
				"arn:aws:s3:::destination-bucket"
			]
		}
	]
}
```

## Changelog

### v2.0.0 (Major Update)
- ✅ **Backward Compatible** - Legacy callback API (v1.x) fully supported
- ✅ **Modern API** - Added Promise/async-await support
- ✅ Upgraded to Node.js 24+ LTS (latest 'Krypton' release)
- ✅ Migrated to AWS SDK v3 (`@aws-sdk/client-s3`)
- ✅ Refactored to ES6+ syntax (classes, const/let, arrow functions)
- ✅ Removed dependency on `async` library (native Promise concurrency)
- ✅ Comprehensive test suite with 90% code coverage
- ✅ CI/CD pipelines for automated testing and NPM publishing
- ✅ Full JSDoc documentation for all public methods
- ✅ Improved error handling with proper Error objects
- ✅ Better memory efficiency with native Promise concurrency control

**Migration:** No changes required! Your v1.x callback-based code will continue to work.
**Recommended:** Gradually migrate to async/await for better code readability.

### v1.0.4
- Fixed JSON formatting
- Bug fixes and improvements

## License

MIT © [Omkar Mujumdar](http://github.com/omkarsm)
