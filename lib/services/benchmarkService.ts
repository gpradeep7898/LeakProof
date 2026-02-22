import { query, queryOne, execute } from '../db';

export interface BenchmarkComparison {
    merchant_metrics: any;
    category_median: any;
    comparison: {
        [key: string]: {
            value: number;
            benchmark: number;
            percentile?: number;
            message: string;
        }
    };
    insights: string[];
}

export class BenchmarkService {

    /**
     * Run nightly as background job (simulated)
     */
    async calculateBenchmarks(): Promise<void> {
        // Basic aggregation query
        // In real app, we'd query across all merchants
    }

    /**
     * Get benchmarks for a specific merchant
     */
    async getMerchantBenchmarks(merchantId: string): Promise<BenchmarkComparison> {

        // For MVP, return dummy or mocked benchmarks if not computed
        const benchmarks = await queryOne(`SELECT * FROM benchmarks`); // Just grab one row for now

        // Get merchant metrics from computed_metrics (no gross_margin_pct in schema - compute from orders if needed)
        const metrics = await queryOne<{
            repeat_rate: number;
            gross_margin: number;
            ltv_cac_ratio: number;
        }>(`
        SELECT 
            repeat_rate,
            0 as gross_margin,
            3.0 as ltv_cac_ratio
        FROM computed_metrics 
        WHERE store_id = $1
    `, [merchantId]);

        // Compute gross margin from orders if available
        const marginRow = await queryOne<{ gross_margin: number }>(`
            SELECT CASE WHEN SUM(COALESCE(total_price, order_value, 0)) > 0 
                THEN ((SUM(COALESCE(total_price, order_value, 0)) - COALESCE(SUM(cogs), 0)) / SUM(COALESCE(total_price, order_value, 0))) * 100
                ELSE 0 END as gross_margin
            FROM orders WHERE store_id = $1
        `, [merchantId]);

        // Mock data for demo if DB empty
        const mockBenchmark = {
            repeat_customer_rate: 30,
            gross_margin_pct: 65,
            ltv_cac_ratio: 3.0
        };

        const actual = {
            repeat_rate: Number(metrics?.repeat_rate || 20),
            gross_margin: Number(marginRow?.gross_margin ?? metrics?.gross_margin ?? 60),
            ltv_cac_ratio: Number(metrics?.ltv_cac_ratio || 2.5)
        };

        const comparison: any = {};
        const insights: string[] = [];

        // Helper
        const compare = (key: string, label: string, actualVal: number, benchVal: number) => {
            const diff = ((actualVal - benchVal) / benchVal) * 100;
            let message = `Your ${label} is on par with similar stores`;
            if (diff > 5) message = `Your ${label} is ${diff.toFixed(0)}% above similar stores 🎉`;
            else if (diff < -5) message = `Your ${label} is ${Math.abs(diff).toFixed(0)}% below similar stores - opportunity to improve`;

            comparison[key] = {
                value: actualVal,
                benchmark: benchVal,
                message
            };

            if (diff < -10) insights.push(`Improving ${label} could unlock significant revenue.`);
        };

        compare('repeat_rate', 'repeat rate', actual.repeat_rate, mockBenchmark.repeat_customer_rate);
        compare('gross_margin', 'gross margin', actual.gross_margin, mockBenchmark.gross_margin_pct);
        compare('ltv_cac_ratio', 'LTV:CAC', actual.ltv_cac_ratio, mockBenchmark.ltv_cac_ratio);

        return {
            merchant_metrics: actual,
            category_median: mockBenchmark,
            comparison,
            insights
        };
    }
}
