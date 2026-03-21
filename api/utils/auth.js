import { verifyToken } from '@clerk/backend';

export async function getAuthenticatedUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);
    try {
        const payload = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY,
        });
        return payload.sub; // Clerk user ID
    } catch (error) {
        console.error('Token verification failed:', error.message);
        return null;
    }
}
