declare const _default: {
    settings: ({ strapi }: {
        strapi: import('@strapi/types/dist/core').Strapi;
    }) => {
        options(): import('../lib/types').VocalStackPluginOptions & {
            apiURL: string;
            dashboardURL: string;
        };
        read(): Promise<import('./settings').StoredSettings>;
        write(patch: import('./settings').StoredSettings): Promise<void>;
        apiKey(): Promise<string | undefined>;
    };
    transcript: ({ strapi, }: {
        strapi: import('@strapi/types/dist/core').Strapi;
    }) => Partial<import('@strapi/types/dist/core/core-api/service').CollectionType> & import('@strapi/types/dist/core/core-api/service').Generic & import('@strapi/types/dist/core/core-api/service').CollectionType;
    transcriber: ({ strapi }: {
        strapi: import('@strapi/types/dist/core').Strapi;
    }) => {
        file(fileId: number): Promise<import('../lib/types').UploadFile>;
        get(fileId: number): Promise<import('../lib/types').TranscriptData>;
        save(file: import('../lib/types').UploadFile, patch: import('../lib/types').TranscriptData): Promise<import('../lib/types').TranscriptData>;
        start(fileOrId: number | import('../lib/types').UploadFile, origin?: string): Promise<import('../lib/types').StatusResponse>;
        status(fileId: number): Promise<import('../lib/types').StatusResponse>;
        stop(fileId: number): Promise<import('../lib/types').StatusResponse>;
        checkJob(client: import('../lib/api').VocalStackAPI, file: import('../lib/types').UploadFile, current: import('../lib/types').TranscriptData, recordingId: string): Promise<import('../lib/types').StatusResponse>;
        restore(file: import('../lib/types').UploadFile, current: import('../lib/types').TranscriptData): Promise<import('../lib/types').StatusResponse>;
        saveTranscript(client: import('../lib/api').VocalStackAPI, file: import('../lib/types').UploadFile, current: import('../lib/types').TranscriptData, recordingId: string): Promise<import('../lib/types').StatusResponse>;
        many(fileIds: number[]): Promise<Record<number, import('../lib/types').TranscriptData>>;
        pollAll(): Promise<void>;
        forget(fileId: number): Promise<void>;
    };
};
export default _default;
