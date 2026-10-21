/**
 * Transcripts over REST, at /api/vocalstack/transcripts. Off for everyone until a role
 * (Users & Permissions) or an API token is given Vocalstack → transcript → find / findOne / update.
 */
declare const _default: {
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
export default _default;
