import { verifyToken } from '@clerk/backend';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export async function getAuthenticatedUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('Auth: No Bearer token in Authorization header');
        return null;
    }

    const token = authHeader.substring(7);
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
        console.error('Auth: CLERK_SECRET_KEY is not set');
        return null;
    }

    try {
        const payload = await verifyToken(token, { secretKey });
        console.log('Auth: Verified user', payload.sub);
        return payload.sub;
    } catch (error) {
        console.error('Auth: Token verification failed:', error.message);
        console.error('Auth: Token starts with:', token.substring(0, 20) + '...');
        return null;
    }
}
