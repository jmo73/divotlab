export declare function validateEnv(): void;
export declare const config: {
    readonly datagolf: {
        readonly apiKey: string;
        readonly baseUrl: "https://feeds.datagolf.com";
    };
    readonly anthropic: {
        readonly apiKey: string;
        readonly model: "claude-sonnet-4-6";
    };
    readonly database: {
        readonly url: string;
    };
    readonly telegram: {
        readonly botToken: string;
        readonly chatId: string;
    };
    readonly weather: {
        readonly apiKey: string;
        readonly baseUrl: "https://api.tomorrow.io/v4";
    };
    readonly twitter: {
        readonly apiKey: string;
        readonly apiKeySecret: string;
        readonly accessToken: string;
        readonly accessTokenSecret: string;
        readonly handle: "@divotlab";
    };
    readonly instagram: {
        readonly accessToken: string;
        readonly userId: string;
        readonly handle: "@divotlab";
    };
    readonly blob: {
        readonly token: string;
    };
    readonly autopilot: {
        readonly enabled: boolean;
        readonly dashboardSecret: string;
        readonly cronSecret: string;
    };
    readonly site: {
        readonly baseUrl: string;
    };
};
//# sourceMappingURL=config.d.ts.map