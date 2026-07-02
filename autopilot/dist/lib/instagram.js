"use strict";
/**
 * Instagram Graph API posting client.
 * Account: @divotlab (must be Professional + connected to Facebook Page).
 * Uses long-lived User Access Token — refreshes every 50 days (calendar reminder set).
 *
 * Two-step flow: create container → publish.
 * Image must be a publicly accessible URL — Vercel Blob provides this.
 * Instagram requires JPEG, not PNG. Sharp converts before blob upload.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.postToInstagram = postToInstagram;
exports.checkTokenFreshness = checkTokenFreshness;
const config_1 = require("./config");
const IG_API = 'https://graph.facebook.com/v21.0';
/**
 * Post an image to Instagram.
 * @param caption        The post caption (up to 2200 chars)
 * @param imageBlobUrl   Public JPEG URL — Instagram fetches this directly
 */
async function postToInstagram(caption, imageBlobUrl) {
    const userId = process.env.INSTAGRAM_USER_ID ?? config_1.config.instagram.userId;
    const token = process.env.INSTAGRAM_ACCESS_TOKEN ?? config_1.config.instagram.accessToken;
    // Step 1: create media container
    const containerRes = await fetch(`${IG_API}/${userId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_url: imageBlobUrl,
            caption,
            access_token: token,
        }),
    });
    const container = (await containerRes.json());
    if (!container.id) {
        throw new Error(`Instagram container creation failed: ${container.error?.message ?? JSON.stringify(container)}`);
    }
    // Step 2: poll until container is ready
    await waitForContainerReady(container.id, token);
    // Step 3: publish
    const publishRes = await fetch(`${IG_API}/${userId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: container.id,
            access_token: token,
        }),
    });
    const published = (await publishRes.json());
    if (!published.id) {
        throw new Error(`Instagram publish failed: ${published.error?.message ?? JSON.stringify(published)}`);
    }
    // Step 4: get permalink
    const mediaRes = await fetch(`${IG_API}/${published.id}?fields=permalink&access_token=${token}`);
    const media = (await mediaRes.json());
    return {
        postId: published.id,
        postUrl: media.permalink ?? `https://www.instagram.com/p/${published.id}/`,
    };
}
async function waitForContainerReady(containerId, token, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(`${IG_API}/${containerId}?fields=status_code,status&access_token=${token}`);
        const data = (await res.json());
        if (data.status_code === 'FINISHED')
            return;
        if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
            throw new Error(`Instagram container processing failed: ${data.status_code} — ${data.status ?? 'unknown'}`);
        }
        // PENDING or IN_PROGRESS — wait 3s and retry
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error('Instagram container processing timed out after 30 seconds');
}
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
function checkTokenFreshness() {
    // Token age is tracked externally — this is a runtime guard
    // If the token env var is missing or clearly invalid, warn
    const token = process.env.INSTAGRAM_ACCESS_TOKEN ?? config_1.config.instagram.accessToken;
    if (!token || token.length < 20) {
        console.warn('[autopilot/instagram] INSTAGRAM_ACCESS_TOKEN appears invalid or missing. Instagram posts will fail.');
    }
}
//# sourceMappingURL=instagram.js.map