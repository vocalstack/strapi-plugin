import { AudioFile, TranscriptData } from '../types';
export declare const transcriptPath: (documentId: string) => string;
type Props = {
    file: AudioFile;
    /** The saved transcript, when the caller already has it (the list); otherwise it is fetched. */
    initial?: null | TranscriptData;
    /** Show the file's name above its button (more than one file). */
    showName?: boolean;
};
/** Transcribe, progress and Stop for one Media Library file. Picks a running job back up after a reload. */
export declare const FileTranscriber: ({ file, initial, showName }: Props) => import("react").JSX.Element;
export {};
