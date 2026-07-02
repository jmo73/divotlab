/**
 * Instagram Graph API posting client.
 * Account: @divotlab (must be Professional + connected to Facebook Page).
 * Uses long-lived User Access Token — refreshes every 50 days (calendar reminder set).
 *
 * Two-step flow: create container → publish.
 * Image must be a publicly accessible URL — Vercel Blob provides this.
 * Instagram requires JPEG, not PNG. Sharp converts before blob upload.
 */
export interface InstagramPostResult {
    postId: string;
    postUrl: string;
}
/**
 * Post an image to Instagram.
 * @param caption        The post caption (up to 2200 chars)
 * @param imageBlobUrl   Public JPEG URL — Instagram fetches this directly
 */
export declare function postToInstagram(caption: string, imageBlobUrl: string): Promise<InstagramPostResult>;
/**
 * Token refresh reminder — call this at startup to warn if token is approaching expiry.
 * Instagram long-lived tokens expire in 60 days. We refresh every 50 days.
 *
 * This is informational only — the actual refresh is a manual step:
 *   GET https://graph.instagram.com/refresh_access_token
 *     ?grant_type=ig_refresh_token
 *     &access_token={current_token}
 * Then update INSTAGRAM_ACCESS_TOKEN in Vercel.
 */
export declare function checkTokenFreshness(): void;
//# sourceMappingURL=instagram.d.ts.map