// types.d.ts or a suitable location in your project
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    username: string;
    usermailid: string;
    projectid: number;
  };
}
