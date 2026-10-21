declare const _default: {
    transcript: ({ strapi, }: {
        strapi: import('@strapi/types/dist/core').Strapi;
    }) => Partial<import('@strapi/types/dist/core/core-api/controller').CollectionType> & import('@strapi/types/dist/core/core-api/controller').Generic & import('@strapi/types/dist/core/core-api/controller').CollectionType;
    vocalstack: ({ strapi }: {
        strapi: import('@strapi/types/dist/core').Strapi;
    }) => {
        connection(ctx: {
            body: unknown;
            params: Record<string, string>;
            query: Record<string, string | string[] | undefined>;
            request: {
                body?: unknown;
                origin: string;
            };
            set(field: string, value: string): void;
            state: {
                user?: {
                    id: number | string;
                };
            };
            status: number;
            type: string;
        }): Promise<void>;
        saveKey: (ctx: {
            body: unknown;
            params: Record<string, string>;
            query: Record<string, string | string[] | undefined>;
            request: {
                body?: unknown;
                origin: string;
            };
            set(field: string, value: string): void;
            state: {
                user?: {
                    id: number | string;
                };
            };
            status: number;
            type: string;
        }) => Promise<void>;
        deleteKey: (ctx: {
            body: unknown;
            params: Record<string, string>;
            query: Record<string, string | string[] | undefined>;
            request: {
                body?: unknown;
                origin: string;
            };
            set(field: string, value: string): void;
            state: {
                user?: {
                    id: number | string;
                };
            };
            status: number;
            type: string;
        }) => Promise<void>;
        connect: (ctx: {
            body: unknown;
            params: Record<string, string>;
            query: Record<string, string | string[] | undefined>;
            request: {
                body?: unknown;
                origin: string;
            };
            set(field: string, value: string): void;
            state: {
                user?: {
                    id: number | string;
                };
            };
            status: number;
            type: string;
        }) => Promise<void>;
        callback(ctx: {
            body: unknown;
            params: Record<string, string>;
            query: Record<string, string | string[] | undefined>;
            request: {
                body?: unknown;
                origin: string;
            };
            set(field: string, value: string): void;
            state: {
                user?: {
                    id: number | string;
                };
            };
            status: number;
            type: string;
        }): Promise<void>;
        transcribe: (ctx: {
            body: unknown;
            params: Record<string, string>;
            query: Record<string, string | string[] | undefined>;
            request: {
                body?: unknown;
                origin: string;
            };
            set(field: string, value: string): void;
            state: {
                user?: {
                    id: number | string;
                };
            };
            status: number;
            type: string;
        }) => Promise<void>;
        status: (ctx: {
            body: unknown;
            params: Record<string, string>;
            query: Record<string, string | string[] | undefined>;
            request: {
                body?: unknown;
                origin: string;
            };
            set(field: string, value: string): void;
            state: {
                user?: {
                    id: number | string;
                };
            };
            status: number;
            type: string;
        }) => Promise<void>;
        stop: (ctx: {
            body: unknown;
            params: Record<string, string>;
            query: Record<string, string | string[] | undefined>;
            request: {
                body?: unknown;
                origin: string;
            };
            set(field: string, value: string): void;
            state: {
                user?: {
                    id: number | string;
                };
            };
            status: number;
            type: string;
        }) => Promise<void>;
        files: (ctx: {
            body: unknown;
            params: Record<string, string>;
            query: Record<string, string | string[] | undefined>;
            request: {
                body?: unknown;
                origin: string;
            };
            set(field: string, value: string): void;
            state: {
                user?: {
                    id: number | string;
                };
            };
            status: number;
            type: string;
        }) => Promise<void>;
    };
};
export default _default;
