"use strict";
/**
 * X (Twitter) posting client.
 * Uses twitter-api-v2 with OAuth 1.0a for user-context posting.
 * Account: @divotlab
 * Free tier: 1,500 tweets/month — our ~10/week target uses ~520/month.
 *
 * On 429: log and return error. Do NOT retry automatically.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToTwitter = postToTwitter;
exports.postTextTweet = postTextTweet;
const twitter_api_v2_1 = require("twitter-api-v2");
const config_1 = require("./config");
const client = new twitter_api_v2_1.TwitterApi({
    appKey: config_1.config.twitter.apiKey,
    appSecret: config_1.config.twitter.apiKeySecret,
    accessToken: config_1.config.twitter.accessToken,
    accessSecret: config_1.config.twitter.accessTokenSecret,
});
/**
 * Upload image and post tweet.
 * @param caption  The tweet text (≤280 chars)
 * @param imageBuffer  PNG image buffer
 */
async function postToTwitter(caption, imageBuffer) {
    // Step 1: upload media (v1.1 media upload required for v2 tweets)
    let mediaId;
    try {
        mediaId = await client.v1.uploadMedia(imageBuffer, {
            mimeType: 'image/png',
            target: 'tweet',
        });
    }
    catch (err) {
        const e = err;
        if (e?.code === 429) {
            throw new Error('X rate limit hit on media upload. Try again in 15 minutes.');
        }
        throw new Error(`X media upload failed: ${e?.message ?? String(err)}`);
    }
    // Step 2: post tweet with media
    let tweet;
    try {
        tweet = await client.v2.tweet({
            text: caption,
            media: { media_ids: [mediaId] },
        });
    }
    catch (err) {
        const e = err;
        if (e?.code === 429) {
            throw new Error('X rate limit hit on tweet post. Try again in 15 minutes.');
        }
        throw new Error(`X tweet failed: ${e?.message ?? String(err)}`);
    }
    const postId = tweet.data.id;
    return {
        postId,
        postUrl: `https://x.com/divotlab/status/${postId}`,
    };
}
/**
 * Post text-only tweet (used for evergreen_stat_of_week — no image).
 */
async function postTextTweet(caption) {
    try {
        const tweet = await client.v2.tweet({ text: caption });
        const postId = tweet.data.id;
        return {
            postId,
            postUrl: `https://x.com/divotlab/status/${postId}`,
        };
    }
    catch (err) {
        const e = err;
        if (e?.code === 429) {
            throw new Error('X rate limit hit. Try again in 15 minutes.');
        }
        throw new Error(`X tweet failed: ${e?.message ?? String(err)}`);
    }
}
//# sourceMappingURL=twitter.js.map