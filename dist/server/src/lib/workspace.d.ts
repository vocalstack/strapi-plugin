import { Workspace } from './types';
/**
 * The workspace a key acts in, from the answer of `GET /v1/me` or `POST /v1/connect/token`.
 * An older API leaves it out.
 */
export declare function workspaceOf(answer: unknown): Workspace | undefined;
/** The icon's address: `iconUrl` is relative to the API's address, and only an address under the API is ever fetched. */
export declare function iconLink(apiURL: string, iconUrl: null | string | undefined): string | undefined;
/** Which icon a link shows: it stays the same while the link is only re-signed (`exp`, `sig`). */
export declare function iconVersion(link: string): string;
/**
 * The workspace's icon as a data URL, which Strapi's admin may show (its content security
 * policy allows `data:` images, not the API's address). `load: false` answers only an icon
 * already fetched. No key goes with the request.
 */
export declare function workspaceIcon(apiURL: string, iconUrl: null | string | undefined, load?: boolean, fetcher?: typeof fetch): Promise<null | string>;
