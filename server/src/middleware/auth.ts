import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = 'st_charles_academy_secret_token_1892';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    role: 'admin' | 'teacher' | 'student';
    stream?: string;
    email?: string;
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expecting "Bearer <token>"

  if (!token) {
    res.status(401).json({ error: 'Access Denied: No authentication token supplied.' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      res.status(403).json({ error: 'Access Denied: Invalid or expired authentication token.' });
      return;
    }

    req.user = decoded as any;
    next();
  });
}
