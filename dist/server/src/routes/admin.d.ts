/** Mounted under /vocalstack and signed with the admin's token (except the connect callback). */
declare const _default: {
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
export default _default;
