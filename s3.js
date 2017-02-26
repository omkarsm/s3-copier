'use strict';
var async = require("async");
var AWS = require("aws-sdk");
var config = require("./config.js")

var S3Copier = function(awsConfig, options) {
	if (typeof(awsConfig) != "object") {
		throw "Please specify an aws config"
	}

	var limit = JSON.parse(JSON.stringify(config.limit));
	if (isDataValid(options, "object")) {
		limit.part.max_size = options.PartSize || config.limit.part.max_size;
		limit.part.parallel = options.PartConcurrency || config.limit.part.parallel;
		limit.retry.count = options.RetryCount || config.limit.retry.count;
		limit.retry.timeout = options.RetryDelay || config.limit.retry.timeout;
		limit.expires = options.ExpireDuration || config.limit.expires;
		limit.parallel.single = options.SingleConcurrency || config.limit.parallel.single;
		limit.parallel.multipart = options.MultipartConcurrency || config.limit.parallel.multipart;
	}

	awsConfig.apiVersion = '2006-03-01';
	var s3 = new AWS.S3(awsConfig);

	function log(msg) {
		// Add logger
		if (config.verbose) {
			console.log(msg)
		}
	}

	//	Used if callback is not passed
	function nonCB(err, data) {
		console.log(JSON.stringify(err ? err : data));
	}

	// Data validator
	function isDataValid(data, type, checkLength) {
		if (data == null) return false;
		if (type != null && typeof(data) != type) return false;
		if (type == "object" && checkLength === true) {
			if (data.constructor.name !== "Array") return false;
		}
		if ((checkLength != null) && checkLength && data.length == 0) {
			return false;
		}
		return true;
	}

	// Used for formatting the duration
	function getFormattedDuration(start, stop) {
		var diff = parseInt((stop - start) / 1000);
		var hh = "" + parseInt(diff / 3600),
			mm = "" + (parseInt(diff / 60) % 60),
			ss = "" + (parseInt(diff % 60)),
			ms = "" + (parseInt((stop - start) % 1000));
		return (hh.length > 1 ? hh : ("0" + hh)) + ":" + (mm.length > 1 ? mm : ("0" + mm)) + ":" + (ss.length > 1 ? ss : ("0" + ss)) + "." + ms;
	}

	function isItemCopied(cmParam, cb) {
		s3.headObject({
			Bucket: cmParam.Destination.Bucket,
			Key: cmParam.Destination.Key
		}, function(err, mhoData) {
			if (!err && mhoData) {
				if (mhoData.ContentLength == cmParam.Size) {
					cb({
						message: "Data is already copied",
						data: cmParam
					});
					return;
				}
			}
			cb();
		});
	}

	function getKeyPath(srcPath, keyPath) {
		var folders = srcPath.split("/");
		return folders[(folders.length - 1)] + keyPath.substr(srcPath.length);
	}

	function list(lParam, cb) {
		if (!isDataValid(lParam, "object")) {
			throw "Invalid list param"
		}
		if (!isDataValid(lParam.Bucket, "string", true) || !isDataValid(lParam.Prefix, "string", true)) {
			throw "Invalid list param"
		}
		if (!cb) {
			cb = nonCB;
		}
		if (typeof(cb) != "function") {
			throw "callback is not specified"
		}

		var finalSet = [],
			_list = function(nxtMarker) {
				var param = {
					Bucket: lParam.Bucket,
					Prefix: lParam.Prefix
				};
				if (nxtMarker) {
					param.Marker = nxtMarker;
				}
				s3.listObjects(param, function(err, data) {
					if (err) {
						cb(err);
						return;
					}
					if (data.Contents.length) {
						finalSet.push.apply(finalSet, data.Contents);
					}
					if (data.IsTruncated) {
						_list(data.Contents[data.Contents.length - 1].Key);
						return;
					}
					cb(null, finalSet);
				})
			};
		_list();
	}

	function SingleCopy(s3, csParam, cb) {
		this.start = function(cb) {
			isItemCopied(csParam, function(isCopied) {
				if (isCopied) {
					cb(null, isCopied);
					return;
				}
				log("Started copying : " + csParam.Source.Key);

				function copyObject(attempt) {
					if (!attempt) {
						attempt = 1;
					}
					s3.copyObject({
						Bucket: csParam.Destination.Bucket,
						CopySource: csParam.Source.Bucket + "/" + csParam.Source.Key,
						Key: csParam.Destination.Key
					}, function(err, coData) {
						if (err) {
							log("Copy failed " + csParam.Destination.Key);
							log(err);
							if (++attempt <= limit.retry.count) {
								log("Reattempt left " + attempt + "/" + limit.retry.count);
								setTimeout(function(attempt) {
									copyObject(attempt);
								}.bind(null, attempt), limit.retry.timeout);
								return;
							}
							cb(err);
							return;
						}
						s3.headObject({
							Bucket: csParam.Destination.Bucket,
							Key: csParam.Destination.Key
						}, function(err, hoData) {
							if (err) {
								cb(err);
								return;
							}
							if (hoData.ContentLength != csParam.Size) {
								cb({
									message: "Size does not match. Expected: " + csParam.Size + " Actual: " + hoData.ContentLength,
									error: {
										ho: hoData,
										co: coData
									}
								});
								return;
							}
							log("Copy complete : " + csParam.Source.Key)
							cb(null, coData);
						});
					});
				}
				copyObject()
			});
		}
	}

	function MultiPartCopy(s3, cmParam) {
		var maxSize = limit.part.max_size;
		this.start = function(cb) {
			isItemCopied(cmParam, function(isCopied) {
				if (isCopied) {
					cb(null, isCopied);
					return;
				}
				var partsArr = [],
					completeArr = [];
				for (var i = 0; i < cmParam.Size;) {
					partsArr.push(i + "-" + (i + maxSize >= cmParam.Size ? (cmParam.Size - 1) : (i + maxSize - 1)));
					i += maxSize;
					completeArr.push({});
				}
				log(partsArr.length + " parts with size " + maxSize + " bytes are queued to upload");
				if (partsArr.length > 10000) {
					cb("Uploading of more than 10000 parts is not supported.");
					return;
				}
				log("Started copying : " + cmParam.Source.Key);
				s3.createMultipartUpload({
					Bucket: cmParam.Destination.Bucket,
					Key: cmParam.Destination.Key,
					Expires: ((new Date()).getTime() + limit.expires)
				}, function(err, cmuData) {
					if (err) {
						cb(err);
						return;
					}
					var count = 0;
					var start_time = (new Date()).getTime();
					async.forEachOfLimit(partsArr, limit.part.parallel, function(range, pNum, callback) {
						function copyPart(attempt) {
							if (!attempt) {
								attempt = 1;
							}
							s3.uploadPartCopy({
								Bucket: cmParam.Destination.Bucket,
								Key: cmParam.Destination.Key,
								CopySource: cmParam.Source.Bucket + "/" + cmParam.Source.Key,
								CopySourceRange: 'bytes=' + range,
								PartNumber: pNum + 1,
								UploadId: cmuData.UploadId
							}, function(err, upcData) {
								if (err) {
									log("Failed to upload part " + (pNum + 1) + " with range " + range);
									log(err);
									if (++attempt <= limit.retry.count) {
										log("Reattempt left " + attempt + "/" + limit.retry.count);
										setTimeout(function(attempt) {
											copyPart(attempt);
										}.bind(null, attempt), limit.retry.timeout);
										return;
									}
									callback(err);
									return;
								}
								log("Part " + (pNum + 1) + " with range " + range + " is copied.");
								log("Item Stats: " + cmParam.Source.Bucket + "/" + cmParam.Source.Key);
								log("Upload percent: " + (Math.round((++count * 10000) / partsArr.length) / 100) + " || Time elapsed: " + getFormattedDuration(start_time, (new Date()).getTime()));
								completeArr[pNum] = {
									ETag: upcData.CopyPartResult.ETag,
									PartNumber: (pNum + 1)
								};
								callback();
							});
						}
						copyPart();
					}, function(err) {
						if (err) {
							log(err);
							var params = {
								Bucket: cmParam.Destination.Bucket,
								Key: cmParam.Destination.Key,
								UploadId: cmuData.UploadId
							};
							s3.abortMultipartUpload(params, function(amuErr, amuData) {
								cb(amuErr ? amuErr : err)
							});
							return;
						}
						s3.completeMultipartUpload({
							Bucket: cmParam.Destination.Bucket,
							Key: cmParam.Destination.Key,
							UploadId: cmuData.UploadId,
							MultipartUpload: {
								Parts: completeArr
							}
						}, function(err, cmpData) {
							if (err) {
								cb(err);
								return;
							}
							s3.headObject({
								Bucket: cmParam.Destination.Bucket,
								Key: cmParam.Destination.Key
							}, function(err, hoData) {
								if (err) {
									cb({
										error: err,
										message: "Multipart copy failed"
									});
									return;
								}
								if (hoData.ContentLength != cmParam.Size) {
									cb({
										message: "Size does not match. Expected: " + cmParam.Size + " Actual: " + hoData.ContentLength,
										error: {
											ho: hoData,
											cmu: cmpData
										}
									});
									return;
								}
								cb(null, cmpData);
							})
						});
					})
				});
			});
		}
	}

	function copyMultipart(cmParam, cb) {
		if (!cb) {
			cb = nonCB;
		}
		var mPartCpy = new MultiPartCopy(s3, cmParam);
		mPartCpy.start(cb);
	}

	function copySingle(csParam, cb) {
		if (!cb) {
			cb = nonCB;
		}
		var cpySingle = new SingleCopy(s3, csParam);
		cpySingle.start(cb);
	}

	function copy(cParam, cb) {
		var copyArr = [];
		if (!isDataValid(cParam, "object")) {
			throw "Invalid copy param"
		}
		if (cParam.constructor.name === "Array") {
			for (var i = 0; i < cParam; i++) {
				if (!isDataValid(cParam[i].Source, "object") || !isDataValid(cParam[i].Destination, "object") || !isDataValid(cParam[i].Source.Bucket, "string", true) || !isDataValid(cParam[i].Source.Key, "string", true) || !isDataValid(cParam[i].Destination.Bucket, "string", true)) {
					throw "Invalid copy param";
				}
			}
			copyArr = cParam;
		} else {
			if (!isDataValid(cParam.Source, "object") || !isDataValid(cParam.Destination, "object") || !isDataValid(cParam.Source.Bucket, "string", true) || !isDataValid(cParam.Source.Key, "string", true) || !isDataValid(cParam.Destination.Bucket, "string", true)) {
				throw "Invalid copy param"
			}
			copyArr.push(cParam);
		}
		async.waterfall([
			function(callback) {
				var copier = {
					multi_part: [],
					single: []
				}
				async.each(copyArr, function(item, eCallback) {
					list({
						Bucket: item.Source.Bucket,
						Prefix: item.Source.Key
					}, function(err, lData) {
						if (err) {
							eCallback(err)
							return;
						}
						lData.forEach(function(lItem) {
							(lItem.Size >= config.limit.aws_size ? copier.multi_part : copier.single).push({
								Source: {
									Bucket: item.Source.Bucket,
									Key: lItem.Key
								},
								Destination: {
									Bucket: item.Destination.Bucket,
									Key: (typeof(item.Destination.Key) == "string" ? item.Destination.Key : ((typeof(item.Destination.Prefix) == "string" ? item.Destination.Prefix : "") + getKeyPath(item.Source.Key, lItem.Key)))
								},
								Size: lItem.Size
							});
						});
						eCallback();
					});
				}, function(err) {
					callback(err, copier);
				});
			},
			function(copier, callback) {
				log((copier.single.length + copier.multi_part.length) + " files are queued for copy");
				async.forEachOf(copier, function(value, key, feCallback) {
					if (key === "multi_part") {
						async.eachLimit(copier.multi_part, limit.parallel.multipart, function(cpItem, elCallback) {
							copyMultipart(cpItem, function(err, cmData) {
								if (err) {
									elCallback(err);
									return;
								}
								log(cmData);
								elCallback();
							});
						}, function(err) {
							if (err) {
								feCallback(err);
								return;
							}
							feCallback();
						});
						return;
					}
					async.eachLimit(copier.single, limit.parallel.single, function(cpItem, elCallback) {
						copySingle(cpItem, function(err, csData) {
							if (err) {
								elCallback(err);
								return;
							}
							log(csData);
							elCallback();
						});
					}, function(err) {
						if (err) {
							feCallback(err);
							return;
						}
						feCallback();
					});
				}, function(err) {
					if (err) {
						callback(err);
						return;
					}
					callback()
				});
			}
		], function(err) {
			cb(err, err ? null : "Copy operation is completed");
		});
	}

	this.list = list;
	this.copy = copy;
	this.copyMultipart = copyMultipart;
	this.copySingle = copySingle;
	this.getFormattedDuration = getFormattedDuration;
}

module.exports = S3Copier;