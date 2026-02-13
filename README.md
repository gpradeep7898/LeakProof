# LeakProof

Find revenue leaks before they sink you. LeakProof turns your Shopify data into plain-English answers about your biggest revenue opportunities.

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL

### Setup

1. **Clone and install**

   ```bash
   cd LeakProof
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env: DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/leakproof
   ```

3. **Create database**

   ```bash
   createdb leakproof
   ```

4. **Run migrations**

   ```bash
   npm run db:migrate
   ```

5. **Start dev server**

   ```bash
   npm run dev
   ```

6. **Open** [http://localhost:3000](http://localhost:3000)

### Load Demo Data

1. Go to **Data Connect** (sidebar) → **Upload CSV**
2. Upload `data/demo-orders.csv` (located at project root: `LeakProof/data/demo-orders.csv`)
3. Wait for parsing and validation (green check = valid)
4. Click **Import Data**
5. After success, go to **Money Snapshot** to see metrics and actions

Or via curl:

```bash
curl -X POST -F "file=@data/demo-orders.csv" http://localhost:3000/api/csv/upload
```

## How to Test (End-to-End)

1. **Start app**: `npm run dev`, open http://localhost:3000
2. **Data Connect**: Click "Try Demo" on homepage → Navigate to Data Connect (left sidebar)
3. **Choose method**: Select "Upload CSV"
4. **Upload**: Drag & drop or browse for `data/demo-orders.csv`
5. **Validate**: Ensure green "Valid format" appears; check detected columns & preview
6. **Import**: Click "Import Data"; wait for success toast
7. **Verify**: Click "View Money Snapshot" or go to `/app`
8. **Money Snapshot**: See repeat_customer_pct, revenue_at_risk, avg_reorder_cycle
9. **Other pages**: Leak Map, Actions, Segments, Products should show data

## CSV Format

Use a single denormalized CSV with columns (names are case-insensitive):

- `order_id`, `customer_id` (or `email`), `order_date`, `order_value`
- `product_id`, `product_name`, `category`, `price`, `quantity`, `line_total`
- `discount_used`, `discount_amount`, `is_subscription` (optional)

Each row can represent one order line (product). Duplicate customers and products are auto-de-duplicated.

## Deployment

- **Frontend + API**: Deploy to Vercel (`vercel`)
- **Database**: Use Vercel Postgres, Neon, or any PostgreSQL host
- Set `DATABASE_URL` in environment

## License

Proprietary
