import { Core } from '@strapi/strapi';
import { Transcript, VocalStackAPI } from '../lib/api';
import { StatusResponse, TranscriptData, TranscriptSentence, UploadFile } from '../lib/types';
/** An error a route answers with its own status and code. */
export declare class RouteError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string);
}
/** A transcript's sentences, each with its words. */
export declare function toSentences(t: Pick<Transcript, 'segments' | 'sentences'>): TranscriptSentence[];
/** A VocalStack refusal, as the route answers it. */
export declare function routeError(err: unknown): RouteError;
declare const transcriber: ({ strapi }: {
    strapi: Core.Strapi;
}) => {
    file(fileId: number): Promise<UploadFile>;
    get(fileId: number): Promise<TranscriptData>;
    /** Merge into the file's transcript entry, creating it on first use. */
    save(file: UploadFile, patch: TranscriptData): Promise<TranscriptData>;
    /** Start a job for this file on VocalStack. */
    start(fileOrId: number | UploadFile, origin?: string): Promise<StatusResponse>;
    /** Where the file's transcript stands; while a job runs, asks VocalStack and saves the outcome once it is over. */
    status(fileId: number): Promise<StatusResponse>;
    /** Stop the job. The transcript goes back to how it was; VocalStack keeps what it transcribed so far. */
    stop(fileId: number): Promise<StatusResponse>;
    /** Where a job stands, saving the outcome once it is over: the whole transcript when done, the reason when it failed. */
    checkJob(client: VocalStackAPI, file: UploadFile, current: TranscriptData, recordingId: string): Promise<StatusResponse>;
    /**
     * A stopped job leaves the entry as it was before Transcribe: the earlier transcript, if
     * there was one (a new job only replaces it once done), or none.
     */
    restore(file: UploadFile, current: TranscriptData): Promise<StatusResponse>;
    saveTranscript(client: VocalStackAPI, file: UploadFile, current: TranscriptData, recordingId: string): Promise<StatusResponse>;
    /** Statuses for several files at once (the Media Library list and the side panel). */
    many(fileIds: number[]): Promise<Record<number, TranscriptData>>;
    /**
     * Follow every running job from the server, so a transcript is saved even when no
     * admin has the file open (autoTranscribe, a closed tab).
     */
    pollAll(): Promise<void>;
    /** The transcript goes with its file. */
    forget(fileId: number): Promise<void>;
};
export default transcriber;
export type TranscriberService = ReturnType<typeof transcriber>;
