module.exports = {
	limit: {
		aws_size: 1024 * 1024 * 1024 * 5, 	// 	5GB standard AWS S3 limit for creating multipart copy
		part: {
			max_size: 1024 * 1024 * 100, 	//	Max Part size of Multipart Copy
			parallel: 10					//	Parallel part copy items limit
		}, 
		parallel:{							//	Count for parallel copy of files 
			single: 40,						//	Files which are less than 5GB
			multipart: 10					//	Files which are more than 5GB
		},
		retry: {
			count: 3, 						//	Failure retry count
			timeout: 2000 					//	Time Delay in millisec to retry
		},
		expires: 12 * 60 * 60 * 1000 		//	Multipart expiry time in milli sec
	},
	verbose: true							// 	enable this to print log on console
}