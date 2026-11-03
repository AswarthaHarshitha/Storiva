import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by requireAuth. The organization always comes from the session, never from the request. */
    auth?: {
      sessionId: string;
      userId: string;
      organizationId: string;
    };
  }
}
