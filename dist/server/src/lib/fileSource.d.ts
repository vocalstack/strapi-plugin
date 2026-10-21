import { Core } from '@strapi/strapi';
import { UploadFile, VocalStackPluginOptions } from './types';
/**
 * The server's own address: `server.url` when it is absolute, else the address the
 * request came in on (behind a proxy, with `proxy: true`), else Strapi's guess.
 */
export declare function serverBase(strapi: Core.Strapi, origin?: string): string;
/** The absolute address of a Media Library file. */
export declare function resolveFileURL(strapi: Core.Strapi, file: UploadFile, options: VocalStackPluginOptions, origin?: string): Promise<string | undefined>;
/**
 * Whether VocalStack can fetch this address itself. The API refuses loopback,
 * private and link-local hosts, so for those (local development, an intranet)
 * the plugin sends the bytes instead.
 */
export declare function isPublicURL(url: string): boolean;
/** The file's bytes, for a file VocalStack cannot reach by link. */
export declare function fetchFile(strapi: Core.Strapi, file: UploadFile, url: string): Promise<Blob>;
