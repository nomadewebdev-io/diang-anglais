import { Client, Query, TablesDB, Users } from 'node-appwrite';

export default async ({ req, res, error }) => {
  const callerUserId = req.headers['x-appwrite-user-id'];
  const dynamicApiKey = req.headers['x-appwrite-key'];

  if (!callerUserId) {
    return res.json({ ok: false, message: 'Authentification requise.' }, 401);
  }
  if (!dynamicApiKey) {
    error('Clé dynamique Appwrite manquante (scopes requis: tables.read, tables.write, users.write).');
    return res.json({ ok: false, message: 'Configuration serveur invalide.' }, 500);
  }

  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const databaseId = process.env.APPWRITE_DATABASE_ID || 'diang-anglais-db';
  const tableId = process.env.APPWRITE_TABLE_ID || 'learner_profiles';

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(dynamicApiKey);

  const tablesDB = new TablesDB(client);
  const users = new Users(client);

  try {
    const rowsRes = await tablesDB.listRows({
      databaseId,
      tableId,
      queries: [Query.equal('user_id', callerUserId), Query.limit(25)],
    });

    for (const row of rowsRes.rows) {
      await tablesDB.deleteRow({
        databaseId,
        tableId,
        rowId: row.$id,
      });
    }

    await users.delete({ userId: callerUserId });
    return res.json({ ok: true });
  } catch (err) {
    error(`Erreur suppression compte ${callerUserId}: ${err?.message || err}`);
    return res.json({ ok: false, message: 'Suppression impossible.' }, 500);
  }
};
