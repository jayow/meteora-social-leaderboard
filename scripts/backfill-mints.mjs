#!/usr/bin/env node
import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function fetchMeteora(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function backfillMints() {
  console.log('[backfill] Starting mint backfill...');
  
  // Get all open_positions without mints
  const { rows } = await pool.query(
    'SELECT DISTINCT pool_address FROM open_positions WHERE token_x_mint IS NULL OR token_y_mint IS NULL'
  );
  
  console.log(`[backfill] Found ${rows.length} pools needing mint data`);
  
  for (const row of rows) {
    try {
      const poolInfo = await fetchMeteora(`https://dlmm.datapi.meteora.ag/pools/${row.pool_address}`);
      
      if (poolInfo && poolInfo.token_x && poolInfo.token_y) {
        const xMint = poolInfo.token_x.address || poolInfo.token_x;
        const yMint = poolInfo.token_y.address || poolInfo.token_y;
        
        await pool.query(
          `UPDATE open_positions 
           SET token_x_mint = $1, token_y_mint = $2, updated_at = NOW()
           WHERE pool_address = $3 AND (token_x_mint IS NULL OR token_y_mint IS NULL)`,
          [xMint, yMint, row.pool_address]
        );
        
        console.log(`[backfill] Updated ${row.pool_address}`);
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 250));
    } catch (error) {
      console.error(`[backfill] Error for ${row.pool_address}:`, error.message);
    }
  }
  
  console.log('[backfill] Complete');
}

backfillMints()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
