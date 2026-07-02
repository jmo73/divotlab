/**
 * X (Twitter) posting client.
 * Uses twitter-api-v2 with OAuth 1.0a for user-context posting.
 * Account: @divotlab
 * Free tier: 1,500 tweets/month — our ~10/week target uses ~520/month.
 *
 * On 429: log and return error. Do NOT retry automatically.
 */

import { TwitterApi } from 'twitter-api-v2'
import { config } from './config'

const client = new TwitterApi({
  appKey:    config.twitter.apiKey,
  appSecret: config.twitter.apiKeySecret,
  accessToken:  config.twitter.accessToken,
  accessSecret: config.twitter.accessTokenSecret,
})

export interface TwitterPostResult {
  postId: string
  postUrl: string
}

/**
 * Upload image and post tweet.
 * @param caption  The tweet text (≤280 chars)
 * @param imageBuffer  PNG image buffer
 */
export async function postToTwitter(
  caption: string,
  imageBuffer: Buffer
): Promise<TwitterPostResult> {
  // Step 1: upload media (v1.1 media upload required for v2 tweets)
  let mediaId: string
  try {
    mediaId = await client.v1.uploadMedia(imageBuffer, {
      mimeType: 'image/png',
      target: 'tweet',
    })
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string }
    if (e?.code === 429) {
      throw new Error('X rate limit hit on media upload. Try again in 15 minutes.')
    }
    throw new Error(`X media upload failed: ${e?.message ?? String(err)}`)
  }

  // Step 2: post tweet with media
  let tweet: { data: { id: string } }
  try {
    tweet = await client.v2.tweet({
      text: caption,
      media: { media_ids: [mediaId] },
    })
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string }
    if (e?.code === 429) {
      throw new Error('X rate limit hit on tweet post. Try again in 15 minutes.')
    }
    throw new Error(`X tweet failed: ${e?.message ?? String(err)}`)
  }

  const postId = tweet.data.id
  return {
    postId,
    postUrl: `https://x.com/divotlab/status/${postId}`,
  }
}

/**
 * Post text-only tweet (used for evergreen_stat_of_week — no image).
 */
export async function postTextTweet(caption: string): Promise<TwitterPostResult> {
  try {
    const tweet = await client.v2.tweet({ text: caption })
    const postId = tweet.data.id
    return {
      postId,
      postUrl: `https://x.com/divotlab/status/${postId}`,
    }
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string }
    if (e?.code === 429) {
      throw new Error('X rate limit hit. Try again in 15 minutes.')
    }
    throw new Error(`X tweet failed: ${e?.message ?? String(err)}`)
  }
}
