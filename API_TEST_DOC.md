# API Endpoint Interactive Test Doc

Like Flask `flasgger` docs — list all endpoints with test payloads and curl commands you can copy-paste.

---

## `/api/admin/dramas`  
- **File:** `app/api/admin\dramas\route.ts`  
- **Methods:** GET, POST  
- **Query Params:** q, status, limit, offset  
- **Body Fields:** title, slug, cover, synopsis, tags, playCount, likeCount, episodeCount, latestEpisodeLabel, isPublished  

### Example Request Body (JSON):
```json
{
  "title": "Test Title",
  "slug": "test-slug",
  "cover": "https://example.com/img.jpg",
  "synopsis": "Test description here.",
  "tags": [
    "drama",
    "test"
  ],
  "playCount": 1,
  "likeCount": 1,
  "episodeCount": 1,
  "latestEpisodeLabel": "Ep 1",
  "isPublished": true
}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/dramas?q=test&status=test&limit=test&offset=test'
```
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"title": "Test Title", "slug": "test-slug", "cover": "https://example.com/img.jpg", "synopsis": "Test description here.", "tags": ["drama", "test"], "playCount": 1, "likeCount": 1, "episodeCount": 1, "latestEpisodeLabel": "Ep 1", "isPublished": true}' 'http://localhost:3000/api/admin/dramas?q=test&status=test&limit=test&offset=test'
```
---

## `/api/admin/dramas/[dramaId]`  
- **File:** `app/api/admin\dramas\[dramaId]\route.ts`  
- **Methods:** GET, PUT, DELETE  
- **Body Fields:** tags, title, cover, synopsis, playCount, likeCount, episodeCount, latestEpisodeLabel, isPublished  

### Example Request Body (JSON):
```json
{
  "tags": [
    "drama",
    "test"
  ],
  "title": "Test Title",
  "cover": "https://example.com/img.jpg",
  "synopsis": "Test description here.",
  "playCount": 1,
  "likeCount": 1,
  "episodeCount": 1,
  "latestEpisodeLabel": "Ep 1",
  "isPublished": true
}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/dramas/[dramaId]'
```
```bash
curl -X PUT -H 'Content-Type: application/json' -d '{"tags": ["drama", "test"], "title": "Test Title", "cover": "https://example.com/img.jpg", "synopsis": "Test description here.", "playCount": 1, "likeCount": 1, "episodeCount": 1, "latestEpisodeLabel": "Ep 1", "isPublished": true}' 'http://localhost:3000/api/admin/dramas/[dramaId]'
```
```bash
curl -X DELETE 'http://localhost:3000/api/admin/dramas/[dramaId]'
```
---

## `/api/admin/dramas/[dramaId]/episodes`  
- **File:** `app/api/admin\dramas\[dramaId]\episodes\route.ts`  
- **Methods:** GET, POST  
- **Body Fields:** url, ep  

### Example Request Body (JSON):
```json
{
  "url": "https://example.com/img.jpg",
  "ep": "test-value"
}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/dramas/[dramaId]/episodes'
```
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"url": "https://example.com/img.jpg", "ep": "test-value"}' 'http://localhost:3000/api/admin/dramas/[dramaId]/episodes'
```
---

## `/api/admin/dramas/[dramaId]/episodes/[ep]`  
- **File:** `app/api/admin\dramas\[dramaId]\episodes\[ep]\route.ts`  
- **Methods:** DELETE  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X DELETE 'http://localhost:3000/api/admin/dramas/[dramaId]/episodes/[ep]'
```
---

## `/api/admin/dramas/bulk`  
- **File:** `app/api/admin\dramas\bulk\route.ts`  
- **Methods:** POST  
- **Body Fields:** dramaIds, action, all, onlyWithEpisodes  

### Example Request Body (JSON):
```json
{
  "dramaIds": "test-value",
  "action": "test-value",
  "all": "test-value",
  "onlyWithEpisodes": "test-value"
}
```

### Curl Examples:
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"dramaIds": "test-value", "action": "test-value", "all": "test-value", "onlyWithEpisodes": "test-value"}' 'http://localhost:3000/api/admin/dramas/bulk'
```
---

## `/api/admin/login`  
- **File:** `app/api/admin\login\route.ts`  
- **Methods:** POST  
- **Body Fields:** username, password  

### Example Request Body (JSON):
```json
{
  "username": "test-value",
  "password": "test-value"
}
```

### Curl Examples:
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"username": "test-value", "password": "test-value"}' 'http://localhost:3000/api/admin/login'
```
---

## `/api/admin/logout`  
- **File:** `app/api/admin\logout\route.ts`  
- **Methods:** POST  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X POST 'http://localhost:3000/api/admin/logout'
```
---

## `/api/admin/redemptions`  
- **File:** `app/api/admin\redemptions\route.ts`  
- **Methods:** GET  
- **Query Params:** status, userId, limit, offset  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/redemptions?status=test&userId=test&limit=test&offset=test'
```
---

## `/api/admin/redemptions/[id]`  
- **File:** `app/api/admin\redemptions\[id]\route.ts`  
- **Methods:** POST  
- **Body Fields:** action, transactionRef, receiptUrl, adminNotes  

### Example Request Body (JSON):
```json
{
  "action": "test-value",
  "transactionRef": "test-value",
  "receiptUrl": "test-value",
  "adminNotes": "test-value"
}
```

### Curl Examples:
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"action": "test-value", "transactionRef": "test-value", "receiptUrl": "test-value", "adminNotes": "test-value"}' 'http://localhost:3000/api/admin/redemptions/[id]'
```
---

## `/api/admin/reels`  
- **File:** `app/api/admin\reels\route.ts`  
- **Methods:** GET, POST  
- **Query Params:** q, status, dramaId, limit, offset  
- **Body Fields:** title, videoUrl, tags, synopsis, thumbnailUrl, durationSeconds, dramaId, episodeNumber, isPublished  

### Example Request Body (JSON):
```json
{
  "title": "Test Title",
  "videoUrl": "test-value",
  "tags": [
    "drama",
    "test"
  ],
  "synopsis": "Test description here.",
  "thumbnailUrl": "test-value",
  "durationSeconds": "test-value",
  "dramaId": "test-id-123",
  "episodeNumber": "test-value",
  "isPublished": true
}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/reels?q=test&status=test&dramaId=test&limit=test&offset=test'
```
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"title": "Test Title", "videoUrl": "test-value", "tags": ["drama", "test"], "synopsis": "Test description here.", "thumbnailUrl": "test-value", "durationSeconds": "test-value", "dramaId": "test-id-123", "episodeNumber": "test-value", "isPublished": true}' 'http://localhost:3000/api/admin/reels?q=test&status=test&dramaId=test&limit=test&offset=test'
```
---

## `/api/admin/reels/[reelId]`  
- **File:** `app/api/admin\reels\[reelId]\route.ts`  
- **Methods:** GET, PUT, DELETE  
- **Body Fields:** tags, title, synopsis, videoUrl, thumbnailUrl, durationSeconds, dramaId, episodeNumber, isPublished, viewCount, likeCount  

### Example Request Body (JSON):
```json
{
  "tags": [
    "drama",
    "test"
  ],
  "title": "Test Title",
  "synopsis": "Test description here.",
  "videoUrl": "test-value",
  "thumbnailUrl": "test-value",
  "durationSeconds": "test-value",
  "dramaId": "test-id-123",
  "episodeNumber": "test-value",
  "isPublished": true,
  "viewCount": "test-value",
  "likeCount": 1
}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/reels/[reelId]'
```
```bash
curl -X PUT -H 'Content-Type: application/json' -d '{"tags": ["drama", "test"], "title": "Test Title", "synopsis": "Test description here.", "videoUrl": "test-value", "thumbnailUrl": "test-value", "durationSeconds": "test-value", "dramaId": "test-id-123", "episodeNumber": "test-value", "isPublished": true, "viewCount": "test-value", "likeCount": 1}' 'http://localhost:3000/api/admin/reels/[reelId]'
```
```bash
curl -X DELETE 'http://localhost:3000/api/admin/reels/[reelId]'
```
---

## `/api/admin/reels/bulk`  
- **File:** `app/api/admin\reels\bulk\route.ts`  
- **Methods:** POST  
- **Body Fields:** reelIds, action  

### Example Request Body (JSON):
```json
{
  "reelIds": "test-value",
  "action": "test-value"
}
```

### Curl Examples:
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"reelIds": "test-value", "action": "test-value"}' 'http://localhost:3000/api/admin/reels/bulk'
```
---

## `/api/admin/settings`  
- **File:** `app/api/admin\settings\route.ts`  
- **Methods:** GET, PUT  
- **Body Fields:** coinToPkrRate, minRedeemCoins, s3Endpoint, s3Bucket, s3AccessKey, s3SecretKey, s3PublicUrl, b2DramasKeyId, b2DramasAppKey, b2DramasBucketId, b2DramasPublicUrl, b2ReelsKeyId, b2ReelsAppKey, b2ReelsBucketId, b2ReelsPublicUrl, b2PayoutsKeyId, b2PayoutsAppKey, b2PayoutsBucketId, b2PayoutsPublicUrl  

### Example Request Body (JSON):
```json
{
  "coinToPkrRate": "test-value",
  "minRedeemCoins": "test-value",
  "s3Endpoint": "test-value",
  "s3Bucket": "test-value",
  "s3AccessKey": "test-value",
  "s3SecretKey": "test-value",
  "s3PublicUrl": "test-value",
  "b2DramasKeyId": "test-value",
  "b2DramasAppKey": "test-value",
  "b2DramasBucketId": "test-value",
  "b2DramasPublicUrl": "test-value",
  "b2ReelsKeyId": "test-value",
  "b2ReelsAppKey": "test-value",
  "b2ReelsBucketId": "test-value",
  "b2ReelsPublicUrl": "test-value",
  "b2PayoutsKeyId": "test-value",
  "b2PayoutsAppKey": "test-value",
  "b2PayoutsBucketId": "test-value",
  "b2PayoutsPublicUrl": "test-value"
}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/settings'
```
```bash
curl -X PUT -H 'Content-Type: application/json' -d '{"coinToPkrRate": "test-value", "minRedeemCoins": "test-value", "s3Endpoint": "test-value", "s3Bucket": "test-value", "s3AccessKey": "test-value", "s3SecretKey": "test-value", "s3PublicUrl": "test-value", "b2DramasKeyId": "test-value", "b2DramasAppKey": "test-value", "b2DramasBucketId": "test-value", "b2DramasPublicUrl": "test-value", "b2ReelsKeyId": "test-value", "b2ReelsAppKey": "test-value", "b2ReelsBucketId": "test-value", "b2ReelsPublicUrl": "test-value", "b2PayoutsKeyId": "test-value", "b2PayoutsAppKey": "test-value", "b2PayoutsBucketId": "test-value", "b2PayoutsPublicUrl": "test-value"}' 'http://localhost:3000/api/admin/settings'
```
---

## `/api/admin/settings/test-b2`  
- **File:** `app/api/admin\settings\test-b2\route.ts`  
- **Methods:** POST  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X POST 'http://localhost:3000/api/admin/settings/test-b2'
```
---

## `/api/admin/stats`  
- **File:** `app/api/admin\stats\route.ts`  
- **Methods:** GET  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/stats'
```
---

## `/api/admin/transactions`  
- **File:** `app/api/admin\transactions\route.ts`  
- **Methods:** GET  
- **Query Params:** userId, limit, offset  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/transactions?userId=test&limit=test&offset=test'
```
---

## `/api/admin/upload-chunk/cancel`  
- **File:** `app/api/admin\upload-chunk\cancel\route.ts`  
- **Methods:** POST  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X POST 'http://localhost:3000/api/admin/upload-chunk/cancel'
```
---

## `/api/admin/upload-chunk/complete`  
- **File:** `app/api/admin\upload-chunk\complete\route.ts`  
- **Methods:** POST  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X POST 'http://localhost:3000/api/admin/upload-chunk/complete'
```
---

## `/api/admin/upload-chunk/init`  
- **File:** `app/api/admin\upload-chunk\init\route.ts`  
- **Methods:** POST  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X POST 'http://localhost:3000/api/admin/upload-chunk/init'
```
---

## `/api/admin/upload-chunk/part`  
- **File:** `app/api/admin\upload-chunk\part\route.ts`  
- **Methods:** POST  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X POST 'http://localhost:3000/api/admin/upload-chunk/part'
```
---

## `/api/admin/upload-chunk/status`  
- **File:** `app/api/admin\upload-chunk\status\route.ts`  
- **Methods:** GET  
- **Query Params:** sessionId  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/upload-chunk/status?sessionId=test'
```
---

## `/api/admin/upload-folder`  
- **File:** `app/api/admin\upload-folder\route.ts`  
- **Methods:** POST  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X POST 'http://localhost:3000/api/admin/upload-folder'
```
---

## `/api/admin/upload-receipt`  
- **File:** `app/api/admin\upload-receipt\route.ts`  
- **Methods:** POST  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X POST 'http://localhost:3000/api/admin/upload-receipt'
```
---

## `/api/admin/users`  
- **File:** `app/api/admin\users\route.ts`  
- **Methods:** GET, PUT, DELETE  
- **Query Params:** q, limit, offset, userId  
- **Body Fields:** userId, streakDay, description, coins  

### Example Request Body (JSON):
```json
{
  "userId": "test-id-123",
  "streakDay": "test-value",
  "description": "Test description here.",
  "coins": "test-value"
}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/admin/users?q=test&limit=test&offset=test&userId=test'
```
```bash
curl -X PUT -H 'Content-Type: application/json' -d '{"userId": "test-id-123", "streakDay": "test-value", "description": "Test description here.", "coins": "test-value"}' 'http://localhost:3000/api/admin/users?q=test&limit=test&offset=test&userId=test'
```
```bash
curl -X DELETE 'http://localhost:3000/api/admin/users?q=test&limit=test&offset=test&userId=test'
```
---

## `/api/checkin`  
- **File:** `app/api/checkin\route.ts`  
- **Methods:** NONE FOUND  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
---

## `/api/dramas`  
- **File:** `app/api/dramas\route.ts`  
- **Methods:** GET  
- **Query Params:** limit, q, cursor  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/dramas?limit=test&q=test&cursor=test'
```
---

## `/api/dramas/[dramaId]`  
- **File:** `app/api/dramas\[dramaId]\route.ts`  
- **Methods:** GET  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/dramas/[dramaId]'
```
---

## `/api/dramas/[dramaId]/episodes`  
- **File:** `app/api/dramas\[dramaId]\episodes\route.ts`  
- **Methods:** GET  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/dramas/[dramaId]/episodes'
```
---

## `/api/reels`  
- **File:** `app/api/reels\route.ts`  
- **Methods:** GET  
- **Query Params:** cursor, limit, dramaId, sort  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/reels?cursor=test&limit=test&dramaId=test&sort=test'
```
---

## `/api/reels/[reelId]`  
- **File:** `app/api/reels\[reelId]\route.ts`  
- **Methods:** GET, POST  
- **Body Fields:** action  

### Example Request Body (JSON):
```json
{
  "action": "test-value"
}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/reels/[reelId]'
```
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"action": "test-value"}' 'http://localhost:3000/api/reels/[reelId]'
```
---

## `/api/reward/ad`  
- **File:** `app/api/reward\ad\route.ts`  
- **Methods:** NONE FOUND  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
---

## `/api/reward/episode`  
- **File:** `app/api/reward\episode\route.ts`  
- **Methods:** NONE FOUND  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
---

## `/api/reward/reel`  
- **File:** `app/api/reward\reel\route.ts`  
- **Methods:** NONE FOUND  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
---

## `/api/user/checkin`  
- **File:** `app/api/user\checkin\route.ts`  
- **Methods:** POST  
- **Body Fields:** userId, clientDate  

### Example Request Body (JSON):
```json
{
  "userId": "test-id-123",
  "clientDate": "test-value"
}
```

### Curl Examples:
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"userId": "test-id-123", "clientDate": "test-value"}' 'http://localhost:3000/api/user/checkin'
```
---

## `/api/user/redeem`  
- **File:** `app/api/user\redeem\route.ts`  
- **Methods:** GET, POST  
- **Query Params:** userId  
- **Body Fields:** userId, paymentMethod, accountTitle, accountNumber, bankName, coinsAmount  

### Example Request Body (JSON):
```json
{
  "userId": "test-id-123",
  "paymentMethod": "test-value",
  "accountTitle": "test-value",
  "accountNumber": "test-value",
  "bankName": "test-value",
  "coinsAmount": "test-value"
}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/user/redeem?userId=test'
```
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"userId": "test-id-123", "paymentMethod": "test-value", "accountTitle": "test-value", "accountNumber": "test-value", "bankName": "test-value", "coinsAmount": "test-value"}' 'http://localhost:3000/api/user/redeem?userId=test'
```
---

## `/api/user/redeem/settings`  
- **File:** `app/api/user\redeem\settings\route.ts`  
- **Methods:** GET  
- **Body Fields:** (none found)  

### Example Request Body (JSON):
```json
{}
```

### Curl Examples:
```bash
curl -X GET 'http://localhost:3000/api/user/redeem/settings'
```
---

## `/api/user/reward/ad`  
- **File:** `app/api/user\reward\ad\route.ts`  
- **Methods:** POST  
- **Body Fields:** userId, adType, clientDate  

### Example Request Body (JSON):
```json
{
  "userId": "test-id-123",
  "adType": "test-value",
  "clientDate": "test-value"
}
```

### Curl Examples:
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"userId": "test-id-123", "adType": "test-value", "clientDate": "test-value"}' 'http://localhost:3000/api/user/reward/ad'
```
---

## `/api/user/reward/episode`  
- **File:** `app/api/user\reward\episode\route.ts`  
- **Methods:** POST  
- **Body Fields:** userId, clientDate, dramaId, ep  

### Example Request Body (JSON):
```json
{
  "userId": "test-id-123",
  "clientDate": "test-value",
  "dramaId": "test-id-123",
  "ep": "test-value"
}
```

### Curl Examples:
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"userId": "test-id-123", "clientDate": "test-value", "dramaId": "test-id-123", "ep": "test-value"}' 'http://localhost:3000/api/user/reward/episode'
```
---

## `/api/user/reward/reel`  
- **File:** `app/api/user\reward\reel\route.ts`  
- **Methods:** POST  
- **Body Fields:** userId, clientDate, reelId  

### Example Request Body (JSON):
```json
{
  "userId": "test-id-123",
  "clientDate": "test-value",
  "reelId": "test-id-123"
}
```

### Curl Examples:
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"userId": "test-id-123", "clientDate": "test-value", "reelId": "test-id-123"}' 'http://localhost:3000/api/user/reward/reel'
```
---

## `/api/user/sync`  
- **File:** `app/api/user\sync\route.ts`  
- **Methods:** POST  
- **Body Fields:** userId, clientDate  

### Example Request Body (JSON):
```json
{
  "userId": "test-id-123",
  "clientDate": "test-value"
}
```

### Curl Examples:
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"userId": "test-id-123", "clientDate": "test-value"}' 'http://localhost:3000/api/user/sync'
```
