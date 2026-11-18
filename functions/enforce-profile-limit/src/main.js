import { Client, Query, TablesDB } from 'node-appwrite';

const MAX_PROFILES_PER_USER = 4;

export default async ({ req, res, error }) => {
  const dynamicApiKey = req.headers['x-appwrite-key'];
  if (!dynamicApiKey) {
    error('Clé dynamique Appwrite manquante (scopes requis: tables.read, tables.write).');
    return res.json({ ok: false }, 500);
  }

  const payload = req.bodyJson || {};
  const rowId = payload.$id;
  const userId = payload.user_id;

  if (!rowId || !userId) {
    return res.json({ ok: true, skipped: true });
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

  try {
    const existing = await tablesDB.listRows({
      databaseId,
      tableId,
      queries: [Query.equal('user_id', userId), Query.limit(10)],
    });

    if (existing.total > MAX_PROFILES_PER_USER) {
      await tablesDB.deleteRow({
        databaseId,
        tableId,
        rowId,
      });
      return res.json(
        {
          ok: false,
          message: 'Limite de 4 profils maximum par compte atteinte.',
        },
        403
      );
    }

    return res.json({ ok: true, count: existing.total });
  } catch (err) {
    error(`Erreur contrôle limite profils: ${err?.message || err}`);
    return res.json({ ok: false }, 500);
  }
};
