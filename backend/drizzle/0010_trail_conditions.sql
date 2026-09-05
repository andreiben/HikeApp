CREATE TABLE IF NOT EXISTS trail_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  condition TEXT NOT NULL,
  notes TEXT,
  reported_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX trail_conditions_route_idx ON trail_conditions(route_id, reported_at DESC);
