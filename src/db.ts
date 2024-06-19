import { Pool } from 'pg';

export const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Test',
    password: 'Madhan@1997',
    port: 5432,
});
