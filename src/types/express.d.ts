declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string | null; displayName?: string | null };
    }
  }
}

export {};
