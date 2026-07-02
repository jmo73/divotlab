# Posting — Divot Lab Autopilot

## Overview

After Telegram approval, posts fire simultaneously to X (Twitter) and Instagram. Both use official APIs. Confirmation is sent via Telegram after posting completes.

---

## X (Twitter) API

### Account Requirements
- Account: @divotlabgolf
- API tier: Free tier sufficient (1,500 tweets/month write access — ~10/week target uses ~520/month)
- Must enable Read and Write permissions in the Developer Portal

### Auth Setup
X uses OAuth 1.0a for user-context posting.

Required env vars:
```
X_API_KEY
X_API_KEY_SECRET
X_ACCESS_TOKEN
X_ACCESS_TOKEN_SECRET
```

Generate via developer.twitter.com. Access tokens are tied to the account logged in when generated — confirm @divotlabgolf is the active account.

### Posting Implementation

```typescript
// autopilot/lib/twitter.ts
import { TwitterApi } from 'twitter-api-v2'
import { config } from './config'

const client = new TwitterApi({
  appKey: config.twitter.apiKey,
  appSecret: config.twitter.apiKeySecret,
  accessToken: config.twitter.accessToken,
  accessSecret: config.twitter.accessTokenSecret,
})

export async function postToTwitter(
  caption: string,
  imageBuffer: Buffer
): Promise<{ postId: string; postUrl: string }> {

  // Step 1: Upload media
  const mediaId = await client.v1.uploadMedia(imageBuffer, {
    mimeType: 'image/png',
    target: 'tweet'
  })

  // Step 2: Post tweet with media
  const tweet = await client.v2.tweet({
    text: caption,
    media: { media_ids: [mediaId] }
  })

  return {
    postId: tweet.data.id,
    postUrl: `https://x.com/divotlabgolf/status/${tweet.data.id}`
  }
}
```

### X Rate Limits
- 1,500 tweets/month (free tier)
- Media upload: 5MB max per image (our PNGs are well under 1MB)
- On 429: log the error, return failure — do not retry automatically

---

## Instagram API

### Account Requirements
- Account: @divotlab must be a **Professional account** (Business or Creator)
- Must be connected to a Facebook Page
- Access via **Instagram Graph API**
- Requires a Meta/Facebook Developer App with `instagram_content_publish` permission

### Auth Setup
Uses a long-lived User Access Token (60-day expiry, refreshable).

Required env vars:
```
INSTAGRAM_ACCESS_TOKEN
INSTAGRAM_USER_ID
```

See `ENVIRONMENT.md` for full setup steps.

**Token refresh:** Calendar reminder every 50 days. Refresh call:
```
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token={current_token}
```
Update `INSTAGRAM_ACCESS_TOKEN` in Vercel with the new value.

### Posting Flow (Two-Step)

Instagram requires creating a media container first, then publishing it. The image must be a **publicly accessible URL** — this is why we use Vercel Blob.

```typescript
// autopilot/lib/instagram.ts

export async function postToInstagram(
  caption: string,
  imageBlobUrl: string    // public Vercel Blob URL — Instagram fetches this directly
): Promise<{ postId: string; postUrl: string }> {

  const base = `https://graph.instagram.com/v21.0`
  const userId = config.instagram.userId
  const token = config.instagram.accessToken

  // Step 1: Create media container
  const containerRes = await fetch(`${base}/${userId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageBlobUrl,
      caption,
      access_token: token
    })
  })

  const container = await containerRes.json()
  if (!container.id) {
    throw new Error(`Instagram container creation failed: ${JSON.stringify(container)}`)
  }

  // Step 2: Poll until container is ready
  await waitForContainerReady(container.id, token)

  // Step 3: Publish
  const publishRes = await fetch(`${base}/${userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: token })
  })

  const published = await publishRes.json()
  if (!published.id) {
    throw new Error(`Instagram publish failed: ${JSON.stringify(published)}`)
  }

  // Step 4: Get permalink
  const mediaRes = await fetch(
    `${base}/${published.id}?fields=permalink&access_token=${token}`
  )
  const media = await mediaRes.json()

  return { postId: published.id, postUrl: media.permalink }
}

async function waitForContainerReady(
  containerId: string,
  token: string,
  maxAttempts = 10
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${token}`
    )
    const data = await res.json()
    if (data.status_code === 'FINISHED') return
    if (data.status_code === 'ERROR') {
      throw new Error(`Instagram container processing error: ${JSON.stringify(data)}`)
    }
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  throw new Error('Instagram container processing timed out after 30 seconds')
}
```

### Instagram Image Requirements
- Format: **JPEG only** — Sharp converts PNG → JPEG before the Blob URL is used for Instagram
- Dimensions: 1080×1080px (our standard)
- Max file size: 8MB (our JPEGs will be ~200–400KB)
- The Blob URL must be publicly accessible — Vercel Blob is public by default

### Instagram Rate Limits
- 25 posts per 24 hours (we target ~3/week)
- 200 API calls per hour
- Well within limits

---

## Simultaneous Posting

Both platforms post in parallel via `Promise.allSettled`:

```typescript
// In autopilot/lib/queue.ts — firePosting()

async function firePosting(postId: string): Promise<void> {
  const post = await getQueuedPost(postId)

  // Verify still approved (race condition protection)
  if (post.status !== 'approved') {
    logger.warn('firePosting called on non-approved post', { postId, status: post.status })
    return
  }

  // PNG is already in Blob — use that URL for Instagram
  // Also convert to JPEG for Instagram's format requirement
  const jpegBuffer = await sharp(await fetchBlobAsBuffer(post.imageBlobUrl))
    .jpeg({ quality: 92 })
    .toBuffer()

  // Upload JPEG version to Blob for Instagram (separate key)
  const { url: jpegBlobUrl } = await put(
    `posts/${postId}-instagram.jpg`,
    jpegBuffer,
    { access: 'public', token: config.blobToken }
  )

  // Post to both platforms simultaneously
  const [twitterResult, instagramResult] = await Promise.allSettled([
    postToTwitter(post.captionX, await fetchBlobAsBuffer(post.imageBlobUrl)),
    postToInstagram(post.captionIG, jpegBlobUrl)
  ])

  // Determine final status
  const bothSucceeded = twitterResult.status === 'fulfilled' && instagramResult.status === 'fulfilled'
  const bothFailed = twitterResult.status === 'rejected' && instagramResult.status === 'rejected'
  const finalStatus = bothSucceeded ? 'posted' : bothFailed ? 'failed' : 'partial'

  // Log to post_log
  await logPostResult(postId, {
    status: finalStatus,
    twitterSuccess: twitterResult.status === 'fulfilled',
    twitterPostId: twitterResult.status === 'fulfilled' ? twitterResult.value.postId : null,
    twitterUrl: twitterResult.status === 'fulfilled' ? twitterResult.value.postUrl : null,
    twitterError: twitterResult.status === 'rejected' ? twitterResult.reason?.message : null,
    instagramSuccess: instagramResult.status === 'fulfilled',
    instagramPostId: instagramResult.status === 'fulfilled' ? instagramResult.value.postId : null,
    instagramUrl: instagramResult.status === 'fulfilled' ? instagramResult.value.postUrl : null,
    instagramError: instagramResult.status === 'rejected' ? instagramResult.reason?.message : null,
  })

  await updateQueueStatus(postId, finalStatus, {
    twitterPostId: twitterResult.status === 'fulfilled' ? twitterResult.value.postId : null,
    twitterUrl: twitterResult.status === 'fulfilled' ? twitterResult.value.postUrl : null,
    instagramPostId: instagramResult.status === 'fulfilled' ? instagramResult.value.postId : null,
    instagramUrl: instagramResult.status === 'fulfilled' ? instagramResult.value.postUrl : null,
    postedAt: new Date()
  })

  // Send Telegram confirmation — see APPROVAL.md for message format
  await sendPostConfirmation(post, twitterResult, instagramResult)
}
```

**Key:** `Promise.allSettled` not `Promise.all` — if X fails, Instagram still posts. A partial result is better than no result.

---

## Caption Differences Between Platforms

Two separate captions are generated and stored independently.

| Aspect | X | Instagram |
|---|---|---|
| Length | Max 260 chars (leave room for link) | Up to 800 chars for analytical content |
| Hashtags | 2–3 max, at end | 8–12, always at end |
| Link | Include `divotlab.com` in body | "link in bio" only |
| DataGolf credit | `via @DataGolf` | `via @DataGolf` |
| Tone | Identical brand voice |  Identical brand voice |

---

## Setup Checklist

**X:**
- [ ] developer.twitter.com — apply for developer access (@divotlabgolf)
- [ ] Create Project and App
- [ ] Set app permissions: Read and Write
- [ ] Generate Consumer Keys and Access Token & Secret for @divotlabgolf
- [ ] Add all four X env vars to Vercel
- [ ] `npm install twitter-api-v2`

**Instagram:**
- [ ] @divotlab is a Professional account
- [ ] @divotlab connected to a Facebook Page
- [ ] Meta App created with Instagram Graph API product
- [ ] `instagram_content_publish` permission granted
- [ ] Long-lived access token generated
- [ ] Instagram User ID fetched and stored
- [ ] Both Instagram env vars added to Vercel
- [ ] Calendar reminder set for token refresh (50 days)

**Testing:**
```bash
# Test X only (posts a real tweet — delete after)
npx tsx autopilot/scripts/test-trigger.ts --trigger=evergreen_stat_of_week --post-x-only

# Test Instagram only (posts a real IG post — delete after)
npx tsx autopilot/scripts/test-trigger.ts --trigger=evergreen_stat_of_week --post-ig-only

# Test both simultaneously
npx tsx autopilot/scripts/test-trigger.ts --trigger=evergreen_stat_of_week --post-both
```
