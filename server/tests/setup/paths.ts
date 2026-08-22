import { join } from 'node:path'

export const TEST_DB_DIR = join(process.cwd(), '.data', 'test')
export const TEMPLATE_DB = join(TEST_DB_DIR, 'template.db')
