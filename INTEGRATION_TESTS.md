# Integration Testing Guide

This guide explains how to run integration tests against real AWS S3 infrastructure.

## Prerequisites

1. **AWS Credentials** with S3 read permissions
2. **S3 Bucket** to test against (e.g., `omkar-bucket`)
3. **Node.js 24+** installed

## Security Notice

⚠️ **Your AWS credentials will only be used locally on your machine. They are never committed to git or shared.**

## Setup

### Step 1: Set Environment Variables

Set the following environment variables in your terminal:

#### Linux/Mac:
```bash
export AWS_ACCESS_KEY_ID="your-access-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
export AWS_REGION="us-east-1"
export TEST_BUCKET="omkar-bucket"
```

#### Windows PowerShell:
```powershell
$env:AWS_ACCESS_KEY_ID="your-access-key-id"
$env:AWS_SECRET_ACCESS_KEY="your-secret-access-key"
$env:AWS_REGION="us-east-1"
$env:TEST_BUCKET="omkar-bucket"
```

#### Windows CMD:
```cmd
set AWS_ACCESS_KEY_ID=your-access-key-id
set AWS_SECRET_ACCESS_KEY=your-secret-access-key
set AWS_REGION=us-east-1
set TEST_BUCKET=omkar-bucket
```

### Step 2: Run Integration Tests

```bash
npm run test:integration
```

Or run directly:
```bash
node test/integration.js
```

## What Gets Tested

The integration test suite will verify:

### List API Tests:
1. ✅ **List entire bucket** - List all objects without prefix
2. ✅ **List with root prefix** - List objects with "/" prefix
3. ✅ **List with empty prefix** - List objects with "" prefix
4. ✅ **List with specific prefix** - List objects in a folder
5. ✅ **Error handling** - Invalid bucket names
6. ✅ **Parameter validation** - Missing required parameters
7. ✅ **Performance** - Response time and pagination

### Copy API Tests:
8. ✅ **Copy single file** - Copy and verify file
9. ✅ **Duplicate detection** - Skip already copied files
10. ✅ **Copy error handling** - Non-existent source files
11. ✅ **Cleanup** - Remove test files after testing

## Testing Modes

**The integration test has two modes:**

### Read-Only Mode (No files in bucket)
- Tests 1-7 will run (list operations only)
- Tests 8-11 will be skipped
- No modifications to your bucket

### Full Mode (Files exist in bucket)
- All tests 1-11 will run
- Creates temporary test files (*.copy-test, *.dup-test)
- Automatically cleans up test files after completion
- Requires write permissions (`s3:PutObject`, `s3:DeleteObject`)

## Expected Output

```
======================================================================
S3-Copier Integration Tests
======================================================================

📋 Step 1: Validating Environment
  ✓ Environment variables validated
  ℹ Region: us-east-1
  ℹ Test Bucket: omkar-bucket
  ℹ Access Key: AKIA1234...

📋 Step 2: Initializing S3Copier
  ✓ S3Copier initialized successfully

▶ Testing: list() - List entire bucket without prefix
  ✓ Retrieved 42 objects in 234ms
  ℹ First object: docs/readme.md (1024 bytes)
  ℹ Last object: images/logo.png (5120 bytes)

...

======================================================================
Test Summary
======================================================================

  ✓ PASS - List entire bucket
  ✓ PASS - List with root prefix
  ✓ PASS - List with empty prefix
  ✓ PASS - List with specific prefix
  ✓ PASS - Error handling invalid bucket
  ✓ PASS - Error handling missing bucket
  ✓ PASS - Performance test

Total Tests: 7
Passed: 7
Success Rate: 100.0%

🎉 All integration tests passed!
```

## Troubleshooting

### Error: "Missing required environment variables"
- Make sure all 4 environment variables are set
- Run `echo $AWS_ACCESS_KEY_ID` to verify (Linux/Mac)
- Run `echo %AWS_ACCESS_KEY_ID%` to verify (Windows CMD)

### Error: "NoSuchBucket"
- Verify the bucket name is correct
- Make sure you're using the correct region

### Error: "AccessDenied"
- Check your IAM user has `s3:ListBucket` and `s3:GetObject` permissions
- Verify the bucket policy allows your IAM user

### Error: "InvalidAccessKeyId"
- Double-check your AWS_ACCESS_KEY_ID
- Make sure there are no extra spaces or quotes

## Required IAM Permissions

### For Read-Only Tests (List API only):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:GetObjectMetadata"
      ],
      "Resource": [
        "arn:aws:s3:::omkar-bucket",
        "arn:aws:s3:::omkar-bucket/*"
      ]
    }
  ]
}
```

### For Full Tests (List + Copy APIs):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:GetObjectMetadata",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::omkar-bucket",
        "arn:aws:s3:::omkar-bucket/*"
      ]
    }
  ]
}
```

## Cleanup

After testing, unset the environment variables:

#### Linux/Mac:
```bash
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_REGION
unset TEST_BUCKET
```

#### Windows PowerShell:
```powershell
Remove-Item Env:AWS_ACCESS_KEY_ID
Remove-Item Env:AWS_SECRET_ACCESS_KEY
Remove-Item Env:AWS_REGION
Remove-Item Env:TEST_BUCKET
```

## Security Best Practices

1. ✅ Use IAM user with minimal permissions (read-only for testing)
2. ✅ Never commit credentials to git
3. ✅ Rotate access keys regularly
4. ✅ Consider using temporary credentials (STS)
5. ✅ Use different credentials for testing vs production
