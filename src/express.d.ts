declare module "express" {
  import * as http from "http";

  export interface Request extends http.IncomingMessage {
    body: any;
    query: any;
    params: any;
    headers: Record<string, string | string[] | undefined>;
  }

  export interface Response extends http.ServerResponse {
    json(body: any): this;
    status(code: number): this;
  }

  export interface Application {
    use(...args: any[]): this;
    get(path: string, ...handlers: any[]): this;
    post(path: string, ...handlers: any[]): this;
    listen(port: number, callback?: () => void): http.Server;
  }

  export interface ExpressStatic {
    (): Application;
    json(options?: any): (req: any, res: any, next: any) => void;
  }

  const express: ExpressStatic;
  export default express;

  export namespace express {
    export { Application, Request, Response };
  }
}
