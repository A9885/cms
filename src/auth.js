const mysql = require('mysql2/promise');
require('dotenv').config();

let authInstance = null;
let nodeHandler = null;

async function getAuth() {
    if (authInstance) return { auth: authInstance, handler: nodeHandler };

    const { betterAuth } = await import('better-auth');
    const { username } = await import('better-auth/plugins');
    const { dash } = await import('@better-auth/infra');
    const { toNodeHandler } = await import('better-auth/node');

    authInstance = betterAuth({
        baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
        trustedOrigins: [
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ],
        secret: process.env.BETTER_AUTH_SECRET,
        database: mysql.createPool({
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'xibo_crm'
        }),
        emailAndPassword: {
            enabled: true
        },
        logger: { level: 'debug' },
        user: {
            modelName: "users",
            additionalFields: {
                role: { type: "string", required: false, defaultValue: "Admin" },
                brand_id: { type: "number", required: false },
                partner_id: { type: "number", required: false },
                force_password_reset: { type: "number", required: false, defaultValue: 0 }
            }
        },
        plugins: [
            username(),
            dash({
                apiKey: process.env.BETTER_AUTH_API_KEY
            })
        ]
    });

    nodeHandler = toNodeHandler(authInstance);
    return { auth: authInstance, handler: nodeHandler };
}

module.exports = { getAuth };
