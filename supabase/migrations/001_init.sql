-- 001_init.sql — Alfa Quattro Finance — Initial schema

-- ─────────────────────────────────────────────
-- TABLE: transacciones
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transacciones (
  uuid          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  banco         TEXT,
  fecha         DATE,
  no_op         TEXT,
  descripcion   TEXT,
  importe       NUMERIC,
  titular       TEXT,
  efecto        TEXT,        -- 'cargo' or 'abono'
  rfc_emisor    TEXT,
  razon_social  TEXT,
  ieps          NUMERIC,
  iva_8         NUMERIC,
  iva_16        NUMERIC,
  subtotal      NUMERIC,
  total         NUMERIC,
  categoria     TEXT,
  proyecto      TEXT,
  frente        TEXT,
  documento     TEXT
);

-- ─────────────────────────────────────────────
-- TABLE: usuarios
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        UNIQUE NOT NULL,
  nombre     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios      ENABLE ROW LEVEL SECURITY;

-- Policies for transacciones
CREATE POLICY "anon can read transacciones"
  ON transacciones FOR SELECT
  USING (true);

CREATE POLICY "anon can insert transacciones"
  ON transacciones FOR INSERT
  WITH CHECK (true);

-- Policies for usuarios
CREATE POLICY "anon can read usuarios"
  ON usuarios FOR SELECT
  USING (true);

CREATE POLICY "anon can insert usuarios"
  ON usuarios FOR INSERT
  WITH CHECK (true);
