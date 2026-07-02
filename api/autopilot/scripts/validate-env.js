"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../lib/config");
try {
    (0, config_1.validateEnv)();
    console.log('✓ All required env vars are present.');
}
catch (e) {
    console.log('✗', e.message);
    process.exit(1);
}
//# sourceMappingURL=validate-env.js.map