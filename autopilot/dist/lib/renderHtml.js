"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderHtmlTemplate = renderHtmlTemplate;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const TEMPLATES_HTML_DIR = path.join(__dirname, '..', 'templates-html');
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
async function renderHtmlTemplate(templateName, fields, options = {}) {
    const { width = 1080, height = 1080 } = options;
    const templatePath = path.join(TEMPLATES_HTML_DIR, `${templateName}.html`);
    let html = fs.readFileSync(templatePath, 'utf-8');
    for (const [key, value] of Object.entries(fields)) {
        html = html.replaceAll(`{{${key}}}`, escapeHtml(value));
    }
    // Dynamic import handles puppeteer v22+ (pure ESM) from a CommonJS module
    const puppeteer = await Promise.resolve().then(() => __importStar(require('puppeteer')));
    const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: 'load' });
        const buffer = await page.screenshot({ type: 'png' });
        return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=renderHtml.js.map