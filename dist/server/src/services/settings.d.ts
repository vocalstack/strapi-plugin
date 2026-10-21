import { Core } from '@strapi/strapi';
import { VocalStackPluginOptions } from '../lib/types';
/**
 * Where a key connected from the admin lives: Strapi's core store, which no REST or
 * GraphQL route reads. Only the plugin's routes touch it, so the key never reaches a browser.
 */
export type StoredSettings = {
    account?: null | string;
    apiKey?: null | string;
    /** A pending one-click connect: PKCE verifier and state, for ten minutes, for the admin who started it. */
    connectAdmin?: null | number | string;
    connectExpiresAt?: null | string;
    connectState?: null | string;
    connectVerifier?: null | string;
};
declare const settings: ({ strapi }: {
    strapi: Core.Strapi;
}) => {
    options(): VocalStackPluginOptions & {
        apiURL: string;
        dashboardURL: string;
    };
    read(): Promise<StoredSettings>;
    write(patch: StoredSettings): Promise<void>;
    /** The key to call VocalStack with: the plugin option first, then a connected one. */
    apiKey(): Promise<string | undefined>;
};
export default settings;
export type SettingsService = ReturnType<typeof settings>;
