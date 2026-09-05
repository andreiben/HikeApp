CREATE TABLE IF NOT EXISTS route_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_id)
);

CREATE INDEX IF NOT EXISTS route_favorites_user_id_idx ON route_favorites (user_id);
