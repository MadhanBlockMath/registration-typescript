import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { pool } from './db';
import cors from 'cors';
import { sendConfirmationEmail, sendNetworkCreatedEmail } from './email';
import { PoolClient } from 'pg';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { AuthenticatedRequest } from './types';

interface JwtPayload {
  username: string;
  usermailid: string;
  projectid: number;
}
const app = express();
const port = 4000;

const jwtSecret = 'your_jwt_secret'; // Use a secure key in production

app.use(bodyParser.json());
app.use(cors());

const enablePgcrypto = async () => {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  } catch (error) {
    console.error('Error enabling pgcrypto extension:', error);
  } finally {
    client.release();
  }
};

enablePgcrypto();

const getNextOrgId = async (client: PoolClient) => {
  const result = await client.query('SELECT COALESCE(MAX(orgid), 0) + 1 AS next_orgid FROM Registration');
  return result.rows[0].next_orgid;
};

const generateNetworkId = () => {
  return crypto.randomBytes(4).toString('hex');
};

const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).send('Access denied. No token provided.');
  }

  const [bearer, token] = authHeader.split(' ');

  if (bearer !== 'Bearer' || !token) {
    return res.status(401).send('Invalid authorization header.');
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    req.user = {
      username: decoded.username,
      usermailid: decoded.usermailid,
      projectid: decoded.projectid
    };
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    return res.status(403).send('Invalid token.');
  }
};

app.post('/register', async (req, res) => {
  const { projectname, orgs, gs1Org } = req.body;
  const encryptionKey = 'your_encryption_key'; // Use a secure key in production

  if (!projectname || !orgs || !Array.isArray(orgs) || orgs.length === 0) {
    return res.status(400).send('Invalid input: projectname and a non-empty array of orgs are required.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const projectResult = await client.query(
      'INSERT INTO Projects (projectname, gs1Org) VALUES ($1, $2) RETURNING projectid',
      [projectname, gs1Org]
    );
    const projectid = projectResult.rows[0].projectid;

    const orgNamesSet = new Set();

    for (const org of orgs) {
      const { orgname } = org;
      if (orgNamesSet.has(orgname)) {
        throw new Error(`Invalid input: Duplicate organization name found: ${orgname}`);
      }

      orgNamesSet.add(orgname);
    }

    for (const org of orgs) {
      const { orgname, orgpolicy, users } = org;

      if (!orgname || !orgpolicy || !users || !Array.isArray(users) || users.length === 0) {
        throw new Error('Invalid input: Each org must have orgname, orgpolicy, and a non-empty array of users.');
      }

      const orgid = await getNextOrgId(client);

      for (const user of users) {
        const { usertype, username, usermailId, password } = user;

        if (!usertype || !username || !usermailId || !password) {
          throw new Error('Invalid input: Each user must have usertype, username, usermailId, and password.');
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash the password before storing

        await client.query(
          'INSERT INTO Registration (orgid, orgname, usertype, Username, usermailId, password, orgpolicy, projectid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [orgid, orgname, usertype, username, usermailId, hashedPassword, orgpolicy, projectid]
        );

        sendConfirmationEmail(usermailId, username, orgname);
      }
    }

    await client.query('COMMIT');
    res.status(201).send('Registration successful');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).send(`An error occurred during registration. ${error}`);
  } finally {
    client.release();
  }
});

app.get('/get-decrypted-password', async (req, res) => {
  const { username, orgname, usermailId } = req.query;
  const encryptionKey = 'your_encryption_key';

  if (!username || !orgname || !usermailId) {
    return res.status(400).send('Invalid input: username, orgname, and usermailId are required.');
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      'SELECT pgp_sym_decrypt(password, $1) AS decrypted_password FROM Registration WHERE Username = $2 AND orgname = $3 AND usermailId = $4',
      [encryptionKey, username, orgname, usermailId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('User not found in the specified organization with the given email.');
    }

    res.status(200).json({ decrypted_password: result.rows[0].decrypted_password });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the password.');
  } finally {
    client.release();
  }
});

app.get('/get-auth-token', async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).send('Invalid input: username is required.');
  }

  const client = await pool.connect();

  try {
    const result = await client.query('SELECT token FROM Registration WHERE Username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(404).send('User not found.');
    }

    res.status(200).json({ token: result.rows[0].token });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the auth token.');
  } finally {
    client.release();
  }
});

app.get('/get-swagger-uri', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { username: queryUsername } = req.query;
  const { username, projectid } = req.user!;

  if (!queryUsername) {
    return res.status(400).send('Invalid input: username is required.');
  }

  if (queryUsername !== username) {
    return res.status(403).send('Username does not match the authenticated user.');
  }

  const client = await pool.connect();

  try {
    // Get the Swagger URI associated with the project ID
    const swaggerResult = await client.query(
      'SELECT swagger_url FROM Projects WHERE projectid = $1',
      [projectid]
    );

    if (swaggerResult.rows.length === 0) {
      return res.status(404).send('Project not found.');
    }

    res.status(200).json({ swagger_url: swaggerResult.rows[0].swagger_url });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the Swagger URI.');
  } finally {
    client.release();
  }
});

app.post('/confirm-project', async (req, res) => {
  const { projectid, swagger_url } = req.body;

  if (!projectid || !swagger_url) {
    return res.status(400).send('Invalid input: projectid and swagger_url are required.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const projectResult = await client.query('SELECT * FROM Projects WHERE projectid = $1', [projectid]);
    if (projectResult.rows.length === 0) {
      throw new Error('Project not found.');
    }

    const networkId = generateNetworkId();

    await client.query(
      'UPDATE Projects SET networkid = $1, swagger_url = $2 WHERE projectid = $3',
      [networkId, swagger_url, projectid]
    );

    const usersResult = await client.query('SELECT usermailId, username, orgname FROM Registration WHERE projectid = $1', [projectid]);

    for (const user of usersResult.rows) {
      const { usermailid, username, orgname } = user;
      console.log(usermailid, username, orgname);

      sendNetworkCreatedEmail(usermailid, username, orgname, networkId);
    }

    await client.query('COMMIT');
    res.status(200).send('Project confirmed, network ID created, and swagger URL updated.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).send(`An error occurred while confirming the project. ${error}`);
  } finally {
    client.release();
  }
});

app.get('/check-username', async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).send('Invalid input: username is required.');
  }

  const client = await pool.connect();

  try {
    const result = await client.query('SELECT 1 FROM Registration WHERE Username = $1', [username]);

    if (result.rows.length > 0) {
      return res.status(200).send('true');
    } else {
      return res.status(200).send('false');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while checking the username.');
  } finally {
    client.release();
  }
});

// app.post('/login', async (req, res) => {
//   const { username, password } = req.body;

//   if (!username || !password) {
//     return res.status(400).send('Invalid input: username and password are required.');
//   }

//   const client = await pool.connect();

//   try {
//     const result = await client.query('SELECT usermailId, password FROM Registration WHERE Username = $1', [username]);

//     if (result.rows.length === 0) {
//       return res.status(401).send('Invalid username or password.');
//     }

//     const { usermailid, password: storedPassword } = result.rows[0];

//     const passwordMatch = await bcrypt.compare(password, storedPassword.toString());

//     if (!passwordMatch) {
//       return res.status(401).send('Invalid username or password.');
//     }

//     const token = jwt.sign({ username, usermailid }, jwtSecret, { expiresIn: '1h' });

//     await client.query('UPDATE Registration SET token = $1 WHERE Username = $2', [token, username]);

//     res.status(200).json({ token });
//   } catch (error) {
//     console.error(error);
//     res.status(500).send('An error occurred during login.');
//   } finally {
//     client.release();
//   }
// });

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Invalid input: username and password are required.');
  }

  const client = await pool.connect();

  try {
    const userResult = await client.query('SELECT usermailId, password, projectid FROM Registration WHERE Username = $1', [username]);

    if (userResult.rows.length === 0) {
      return res.status(401).send('Invalid username or password.');
    }

    const { usermailid, password: storedPassword, projectid } = userResult.rows[0];

    const passwordMatch = await bcrypt.compare(password, storedPassword.toString());

    if (!passwordMatch) {
      return res.status(401).send('Invalid username or password.');
    }

    // Check if network ID is created for the project
    const projectResult = await client.query('SELECT networkid FROM Projects WHERE projectid = $1', [projectid]);

    if (projectResult.rows.length === 0 || !projectResult.rows[0].networkid) {
      return res.status(403).send('Network ID not created for the project.');
    }

    const token = jwt.sign({ username, usermailid, projectid }, jwtSecret, { expiresIn: '1h' });

    await client.query('UPDATE Registration SET token = $1 WHERE Username = $2', [token, username]);

    res.status(200).json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred during login.');
  } finally {
    client.release();
  }
});

// Example protected route
app.get('/protected', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(403).send('User not authenticated.');
  }

  const { username, usermailid, projectid } = req.user;

  res.send(`This is a protected route. Username: ${username}, User Mail ID: ${usermailid}, Project ID: ${projectid}`);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);

});
