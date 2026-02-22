import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { query } from '@/lib/db';
import { getDefaultStoreId } from '@/lib/store';

export async function GET(req: NextRequest) {
  try {
    const storeId = await getDefaultStoreId();
    const { searchParams } = new URL(req.url);
    const sort = searchParams.get('sort') || 'revenue';

    const sortMap: Record<string, string> = {
      revenue: '(COALESCE(total_sold, 0) * COALESCE(avg_selling_price, price, 0)) DESC NULLS LAST',
      repeat: 'COALESCE(repurchase_rate, 0) DESC NULLS LAST',
      churn: 'COALESCE(churn_correlation, 0) DESC NULLS LAST',
      name: 'COALESCE(product_name, product_id) ASC',
    };
    const orderBy = sortMap[sort] || sortMap.revenue;

    const products = await query(`
      SELECT
        product_id,
        sku,
        COALESCE(product_name, product_id) as product_name,
        vendor,
        COALESCE(avg_selling_price, price, 0) as avg_selling_price,
        COALESCE(total_sold, 0) as total_sold,
        (COALESCE(total_sold, 0) * COALESCE(avg_selling_price, price, 0)) as total_revenue,
        COALESCE(repurchase_rate, 0) as repurchase_rate,
        COALESCE(churn_correlation, 0) as churn_correlation,
        COALESCE(gross_margin_pct, 0) as gross_margin_pct,
        COALESCE(discount_usage_rate, 0) as discount_usage_rate
      FROM products
      WHERE store_id = $1 AND COALESCE(is_active, TRUE)
      ORDER BY ${orderBy}
    `, [storeId]);

    return NextResponse.json(products);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
