# s3-copier

S3 Copier module for copying contents between S3 buckets. 
Content can be multiple files/directory/bucket to be copied.


## Installation

```markdown
  npm install s3-copier
```

## Usage

### Initiating S3 Copier module 

```js

	var S3_Copier = require("s3-copier");

	var param = {
		region: "ANY REGION",			//	AWS region
		secretAccessKey: "*****************",	//	AWS secret access key
		accessKeyId: "*********"		//	AWS access key ID
	};

	var options = {
		PartSize: 1024 * 1024 * 100,		//	Optional: Defaults to 100 MBytes
		PartConcurrency: 10,			//	Optional: Defaults to 10 parallel/async operations
		RetryCount: 3,				//	Optional: Defaults to 3 retries on failure
		RetryDelay: 2000,			//	Optional: Defaults to 2 seconds retry delay
		ExpireDuration: 12 * 60 * 60 * 1000,	//	Optional: Defaults to 12 Hours time for expiring incomplete mulipart upload
		SingleConcurrency: 40,			//	Optional: Defaults to 40 parallel/async copy operations for data < 5 GBytes
		MultipartConcurrency: 10		//	Optional: Defaults to 10 parallel/async copy operations for data > 5 GBytes
		Verbose: true				//	Optional: Defaults to show logs
	}

	var s3Copier = new S3_Copier(param, options);	//	S3_Copier(param[, options])

```
Please refer [AWS-Documentation](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property) for more **param** related options.


### Performing directory copy

```js

s3Copier.copy({
	Source: {
		Bucket: "SOURCE_AWS_BUCKET_NAME",
		Key: "Bar/Foo"
	},
	Destination: {
		Bucket: "DESTINATION_AWS_BUCKET_NAME",
		Prefix: "Bar/"
	}
}, function(err, data) {
	console.log(err ? err : data);
});

```

### Performing contents of directory copy

```js

s3Copier.copy({
	Source: {
		Bucket: "SOURCE_AWS_BUCKET_NAME",
		Key: "Bar/Foo/"
	},
	Destination: {
		Bucket: "DESTINATION_AWS_BUCKET_NAME",
		Prefix: "Bar/"
	}
}, function(err, data) {
	console.log(err ? err : data);
});

```


### Performing file copy

```js

s3Copier.copy({
	Source: {
		Bucket: "SOURCE_AWS_BUCKET_NAME",
		Key: "Foo/Bar/hello.txt"
	},
	Destination: {
		Bucket: "DESTINATION_AWS_BUCKET_NAME",
		Prefix: "Bar/"
	}
}, function(err, data) {
	console.log(err ? err : data);
});

```


### Performing file copy by renaming on destination

```js

s3Copier.copy({
	Source: {
		Bucket: "SOURCE_AWS_BUCKET_NAME",
		Key: "Foo/Bar/hello.txt"
	},
	Destination: {
		Bucket: "DESTINATION_AWS_BUCKET_NAME",
		Key: "Bar/world.txt"
	}
}, function(err, data) {
	console.log(err ? err : data);
});

```


### Performing multiple file/directory copy operations

```js

s3Copier.copy([{
	Source: {
		Bucket: "SOURCE_AWS_BUCKET_NAME",
		Key: "Foo/Bar/"
	},
	Destination: {
		Bucket: "DESTINATION_AWS_BUCKET_NAME",
		Prefix: "Foo/"
	}
}, {
	Source: {
		Bucket: "SOURCE_AWS_BUCKET_NAME",
		Key: "Foo/Bar/hello.txt"
	},
	Destination: {
		Bucket: "DESTINATION_AWS_BUCKET_NAME",
		Key: "Bar/world.txt"
	}
}, {
	Source: {
		Bucket: "SOURCE_AWS_BUCKET_NAME",
		Key: "Foo/Bar/hello.txt"
	},
	Destination: {
		Bucket: "DESTINATION_AWS_BUCKET_NAME",
		Prefix: "Bar/"
	}
}], function(err, data) {
	console.log(err ? err : data);
});

```


## License

MIT © [Omkar Mujumdar](http://github.com/omkarsm)
