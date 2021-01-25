declare class LinkedIn {
    readonly options: any;
    private browser;
    private sessionCookie;
    constructor();
    setup: () => Promise<void>;
    login(): Promise<string>;
    getMessages(sessionCookie: string): Promise<any[]>;
}
export default LinkedIn;
