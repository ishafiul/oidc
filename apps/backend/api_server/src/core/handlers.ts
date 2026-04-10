import {RPCHandler} from "@orpc/server/fetch";
import {OpenAPIHandler} from "@orpc/openapi/fetch";
import {ZodSmartCoercionPlugin} from "@orpc/zod";
import {appRouter} from "../router";

export const rpcHandler = new RPCHandler(appRouter, {
    plugins: [new ZodSmartCoercionPlugin()],
});

export const openAPIHandler = new OpenAPIHandler(appRouter, {
    plugins: [new ZodSmartCoercionPlugin()],
});


