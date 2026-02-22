import { NextRequest, NextResponse } from 'next/server';
import { CSVIngestionService } from '@/lib/services/csvIngestion';
import { getDefaultStoreId } from '@/lib/store';

export const maxDuration = 300; // 5 min for large CSV imports

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const files = formData.getAll('files') as File[];
    const allFiles = file ? [file, ...files] : files;

    if (allFiles.length === 0) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const storeId = await getDefaultStoreId();
    const ingestor = new CSVIngestionService();
    const aggregated: Record<string, number> = { orders: 0, order_items: 0, products: 0, customers: 0, discounts: 0 };
    const allErrors: string[] = [];
    let anySuccess = false;

    for (const f of allFiles) {
      if (!f || !f.name?.toLowerCase().endsWith('.csv')) continue;
      const buffer = Buffer.from(await f.arrayBuffer());
      const content = buffer.toString('utf-8');
      const result = await ingestor.processCSV(content, storeId, f.name);
      if (result.success) {
        anySuccess = true;
        for (const [k, v] of Object.entries(result.stats)) {
          aggregated[k] = (aggregated[k] || 0) + (typeof v === 'number' ? v : 0);
        }
      }
      allErrors.push(...(result.errors || []));
    }

    if (!anySuccess) {
      return NextResponse.json({
        error: 'Ingestion failed',
        details: allErrors.length ? allErrors : ['No valid CSV files processed'],
      }, { status: 500 });
    }

    return NextResponse.json({
      message: 'CSV processed successfully',
      inserted: aggregated,
      warnings: allErrors.length ? allErrors : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal Server Error';
    console.error('Upload error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
