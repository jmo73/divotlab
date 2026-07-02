/**
 * X (Twitter) posting client.
 * Uses twitter-api-v2 with OAuth 1.0a for user-context posting.
 * Account: @divotlab
 * Free tier: 1,500 tweets/month — our ~10/week target uses ~520/month.
 *
 * On 429: log and return error. Do NOT retry automatically.
 */
export interface TwitterPostResult {
    postId: string;
    postUrl: string;
}
/**
 * Upload image and post tweet.
 * @param caption  The tweet text (≤280 chars)
 * @param imageBuffer  PNG image buffer
 */
export declare function postToTwitter(caption: string, imageBuffer: Buffer): Promise<TwitterPostResult>;
/**
 * Post text-only tweet (used for evergreen_stat_of_week — no image).
 */
export declare function postTextTweet(caption: string): Promise<TwitterPostResult>;
//# sourceMappingURL=twitter.d.ts.map