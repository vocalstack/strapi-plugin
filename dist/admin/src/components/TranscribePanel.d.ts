import { PanelComponent } from '@strapi/content-manager/strapi-admin';
import { AudioFile } from '../types';
/** Every audio file in an entry: media fields at any depth (components, dynamic zones, repeatables). */
export declare function audioFiles(value: unknown, found?: Map<number, AudioFile>, depth?: number): AudioFile[];
/**
 * The Content Manager side panel: Transcribe for each audio file the entry holds. Hidden on
 * entries with no audio, for admins without the Transcribe permission, and when `enabled: false`.
 */
export declare const TranscribePanel: PanelComponent;
