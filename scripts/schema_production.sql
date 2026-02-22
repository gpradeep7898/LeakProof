
-- Action Approval Logs (Audit Trail)
CREATE TABLE IF NOT EXISTS action_approval_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID REFERENCES actions(action_id),
    store_id UUID REFERENCES stores(store_id),
    
    actor_id TEXT, -- Who took the action (Merchant User ID or 'AUTOPILOT')
    action_type TEXT, -- APPROVE, REJECT, ROLLBACK, EXECUTE_NOW
    
    snapshot_json JSONB, -- Config at time of approval
    risk_level TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recovery Measurement (Attribution)
CREATE TABLE IF NOT EXISTS recovery_measurements (
    measurement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID REFERENCES actions(action_id),
    store_id UUID REFERENCES stores(store_id),
    
    metric_name TEXT, -- e.g. 'vip_churn_rate', 'cart_abandonment_rate'
    baseline_value DECIMAL(12,4), -- Value before fix
    current_value DECIMAL(12,4), -- Value now
    
    control_group_value DECIMAL(12,4), -- Trend for untreated group (if available)
    
    lift_absolute DECIMAL(12,4), -- (Current - Homogenized Baseline)
    lift_percent DECIMAL(5,2),
    
    profit_recovered DECIMAL(12,2), -- Dollar value of lift
    confidence_score DECIMAL(5,2), -- 0.0 - 1.0 (How sure are we?)
    
    attribution_window_days INT DEFAULT 30,
    measured_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing Events (Ledger)
CREATE TABLE IF NOT EXISTS billing_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(store_id),
    
    related_action_id UUID REFERENCES actions(action_id),
    measurement_id UUID REFERENCES recovery_measurements(measurement_id),
    
    charge_type TEXT, -- 'USAGE', 'SUBSCRIPTION_FLAT'
    amount DECIMAL(12,2),
    currency TEXT DEFAULT 'USD',
    
    shopify_charge_id TEXT, -- ID from Shopify API
    status TEXT DEFAULT 'PENDING', -- PENDING, APPLIED, FAILED, DISPUTED
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_action_approval_store ON action_approval_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_recovery_action ON recovery_measurements(action_id);
