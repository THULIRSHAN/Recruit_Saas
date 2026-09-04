import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Secure by default: JwtAuthGuard requires a valid access token on every
// route unless it's explicitly marked @Public() -- opt-out, not opt-in.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
