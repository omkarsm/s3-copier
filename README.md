# s3-copier

S3 Copier module for copying contents between S3 buckets.
Content can be multiple files/directory/bucket to be copied.

## Version 2.0 - Breaking Changes

Version 2.0 has been completely rewritten to use:
- **Node.js 20+ LTS** (minimum required version)
- **AWS SDK v3** (`@aws-sdk/client-s3`)
- **Modern JavaScript** (ES6+, async/await)
- **No external dependencies** (removed `async` library)

### Migration from v1.x to v2.0

The main API change is that all methods now return **Promises** instead of using callbacks. You can use either:
- **async/await** syntax (recommended)
- **Promises** with `.then()/.catch()`
- **Callbacks** (still supported for backward compatibility - see examples below)

## Installation

```bash
npm install s3-copier
```

**Requirements:**
- Node.js >= 20.0.0
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

**Using async/await (recommended):**
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

**Using Promises:**
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

### v2.0.0 (Breaking Changes)
- Upgraded to Node.js 20+ LTS
- Migrated to AWS SDK v3 (`@aws-sdk/client-s3`)
- Refactored to use async/await instead of callbacks
- Removed dependency on `async` library
- Modernized to ES6+ syntax (classes, const/let, arrow functions)
- All methods now return Promises
- Improved error handling with proper Error objects
- Better memory efficiency with native Promise concurrency control

### v1.0.4
- Fixed JSON formatting
- Bug fixes and improvements

## License

MIT © [Omkar Mujumdar](http://github.com/omkarsm)
