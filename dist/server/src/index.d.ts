declare const _default: {
    bootstrap: ({ strapi }: {
        strapi: import('@strapi/types/dist/core').Strapi;
    }) => Promise<void>;
    config: {
        default: {
            autoTranscribe: false;
            enabled: true;
            oneClickConnect: false;
        };
        validator(config: import('./lib/types').VocalStackPluginOptions): void;
    };
    contentTypes: {
        transcript: {
            schema: {
                kind: string;
                collectionName: string;
                info: {
                    singularName: string;
                    pluralName: string;
                    displayName: string;
                    description: string;
                };
                options: {
                    draftAndPublish: boolean;
                };
                pluginOptions: {
                    "content-manager": {
                        visible: boolean;
                    };
                    "content-type-builder": {
                        visible: boolean;
                    };
                };
                attributes: {
                    fileName: {
                        type: string;
                    };
                    file: {
                        type: string;
                        multiple: boolean;
                        allowedTypes: string[];
                    };
                    fileId: {
                        type: string;
                        required: boolean;
                        unique: boolean;
                    };
                    status: {
                        type: string;
                        enum: string[];
                        default: string;
                    };
                    transcript: {
                        type: string;
                    };
                    sentences: {
                        type: string;
                    };
                    language: {
                        type: string;
                    };
                    error: {
                        type: string;
                    };
                    recordingId: {
                        type: string;
                    };
                    transcriptionId: {
                        type: string;
                    };
                    transcribedAt: {
                        type: string;
                    };
                };
            };
        };
    };
    controllers: {
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
    destroy: () => void;
    register: () => void;
    routes: {
        admin: {
            type: string;
            routes: ({
                method: string;
                path: string;
                handler: string;
                config: {
                    policies: (string | {
                        name: string;
                        config: {
                            actions: string[];
                        };
                    })[];
                    auth?: undefined;
                };
            } | {
                method: string;
                path: string;
                handler: string;
                config: {
                    auth: boolean;
                    policies?: undefined;
                };
            })[];
        };
        'content-api': {
            type: string;
            routes: {
                method: string;
                path: string;
                handler: string;
                config: {
                    policies: any[];
                };
            }[];
        };
    };
    services: {
        settings: ({ strapi }: {
            strapi: import('@strapi/types/dist/core').Strapi;
        }) => {
            options(): import('./lib/types').VocalStackPluginOptions & {
                apiURL: string;
                dashboardURL: string;
            };
            read(): Promise<import('./services/settings').StoredSettings>;
            write(patch: import('./services/settings').StoredSettings): Promise<void>;
            apiKey(): Promise<string | undefined>;
        };
        transcript: ({ strapi, }: {
            strapi: import('@strapi/types/dist/core').Strapi;
        }) => Partial<import('@strapi/types/dist/core/core-api/service').CollectionType> & import('@strapi/types/dist/core/core-api/service').Generic & import('@strapi/types/dist/core/core-api/service').CollectionType;
        transcriber: ({ strapi }: {
            strapi: import('@strapi/types/dist/core').Strapi;
        }) => {
            file(fileId: number): Promise<import('./lib/types').UploadFile>;
            get(fileId: number): Promise<import('./lib/types').TranscriptData>;
            save(file: import('./lib/types').UploadFile, patch: import('./lib/types').TranscriptData): Promise<import('./lib/types').TranscriptData>;
            start(fileOrId: number | import('./lib/types').UploadFile, origin?: string): Promise<import('./lib/types').StatusResponse>;
            status(fileId: number): Promise<import('./lib/types').StatusResponse>;
            stop(fileId: number): Promise<import('./lib/types').StatusResponse>;
            checkJob(client: import('./lib/api').VocalStackAPI, file: import('./lib/types').UploadFile, current: import('./lib/types').TranscriptData, recordingId: string): Promise<import('./lib/types').StatusResponse>;
            restore(file: import('./lib/types').UploadFile, current: import('./lib/types').TranscriptData): Promise<import('./lib/types').StatusResponse>;
            saveTranscript(client: import('./lib/api').VocalStackAPI, file: import('./lib/types').UploadFile, recordingId: string): Promise<import('./lib/types').StatusResponse>;
            many(fileIds: number[]): Promise<Record<number, import('./lib/types').TranscriptData>>;
            pollAll(): Promise<void>;
            forget(fileId: number): Promise<void>;
        };
    };
};
export default _default;
