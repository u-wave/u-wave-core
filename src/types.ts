/* eslint-disable n/no-missing-import,n/no-unpublished-import */
// This file contains supporting types that can't be expressed in JavaScript/JSDoc.

import type { ParsedQs } from 'qs';
import type { JsonObject } from 'type-fest';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type UwaveServer from './Uwave.js';
import type { HttpApi } from './HttpApi.js';
import type { UserID, User as UwaveUser } from './schema.js';
import type { AuthenticateOptions } from './controllers/authenticate.js';

// Add üWave specific request properties.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      uwave: UwaveServer;
      uwaveHttp: HttpApi;
      /**
       * Only available while social signup is in progress.
       */
      pendingUser?: UwaveUser;
      /**
       * Only available in specific authentication routes.
       */
      authOptions?: AuthenticateOptions;
      fullUrl: string;
    }
    interface AuthInfo {
      /** A session ID provided through some other means than the actual session. */
      sessionID?: string;
    }
  }
}

// Declare custom commands.
declare module 'ioredis' {
  interface Redis {
    /** Run the add-to-waitlist script, declared in src/plugins/waitlist.js. */
    'uw:addToWaitlist'(...args: [...keys: string[], userId: UserID]): Promise<string[]>;
    /** Run the move-waitlist script, declared in src/plugins/waitlist.js. */
    'uw:moveWaitlist'(...args: [...keys: string[], userId: UserID, position: number]): Promise<string[]>;
    /** Run the remove-after-current-play script, declared in src/plugins/booth.js. */
    'uw:removeAfterCurrentPlay'(...args: [...keys: string[], userId: UserID, remove: boolean]): Promise<0 | 1>;
  }
}

type DefaultParams = Record<string, string>;
type DefaultQuery = ParsedQs;
type DefaultBody = JsonObject;

/**
 * A possibly unauthenticated HTTP API request.
 */
export type Request<
  TParams = DefaultParams,
  TQuery = DefaultQuery,
  TBody = DefaultBody,
> = ExpressRequest<TParams, unknown, TBody, TQuery, never> & {
  user?: UwaveUser & { roles: string[] },
};

/**
 * A controller function that does not require authentication.
 */
export type Controller<
  TParams = DefaultParams,
  TQuery = DefaultQuery,
  TBody = DefaultBody,
> = (req: Request<TParams, TQuery, TBody>, res: ExpressResponse) => Promise<object>;

/**
 * An authenticated HTTP API request.
 */
export type AuthenticatedRequest<
  TParams = DefaultParams,
  TQuery = DefaultQuery,
  TBody = DefaultBody,
> = Request<TParams, TQuery, TBody> & {
  user: UwaveUser & { roles: string[] },
};

/**
 * A controller function that requires authentication.
 */
export type AuthenticatedController<
  TParams = DefaultParams,
  TQuery = DefaultQuery,
  TBody = DefaultBody,
> = (req: AuthenticatedRequest<TParams, TQuery, TBody>, res: ExpressResponse) => Promise<object>;

type LegacyPaginationQuery = { page?: string, limit?: string };
type OffsetPaginationQuery = {
  page?: { offset?: string, limit?: string },
};
export type PaginationQuery = LegacyPaginationQuery | OffsetPaginationQuery;
