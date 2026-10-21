import { Core } from '@strapi/strapi';
declare const bootstrap: ({ strapi }: {
    strapi: Core.Strapi;
}) => Promise<void>;
export declare const stopPolling: () => void;
export default bootstrap;
