import { queryOne } from './db'

export async function getDefaultStoreId(): Promise<string> {
  const row = await queryOne<{ store_id: string }>('SELECT store_id FROM stores LIMIT 1')
  if (!row) throw new Error('No store configured. Run db:migrate first.')
  return row.store_id
}
