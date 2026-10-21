CREATE TABLE ingestion_runs (
    batch_id text PRIMARY KEY CHECK (batch_id ~ '^[0-9a-f]{64}$'),
    transform_version text NOT NULL,
    manifest jsonb NOT NULL,
    loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE datasets (
    id text PRIMARY KEY,
    metadata jsonb NOT NULL
);

CREATE TABLE dataset_releases (
    batch_id text NOT NULL REFERENCES ingestion_runs,
    dataset_id text NOT NULL REFERENCES datasets,
    metadata jsonb NOT NULL,
    PRIMARY KEY (batch_id, dataset_id)
);

CREATE TABLE source_snapshots (
    batch_id text NOT NULL,
    resource_id text NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    url text NOT NULL CHECK (url LIKE 'https://%'),
    final_url text NOT NULL,
    retrieved_at timestamptz NOT NULL,
    byte_count bigint NOT NULL CHECK (byte_count > 0),
    PRIMARY KEY (batch_id, resource_id),
    FOREIGN KEY (batch_id, resource_id) REFERENCES dataset_releases (batch_id, dataset_id)
);

CREATE TABLE geographies (
    id text PRIMARY KEY,
    level text NOT NULL CHECK (level IN ('country', 'state', 'county')),
    code text NOT NULL,
    code_system text NOT NULL CHECK (code_system IN ('UN_M49', 'US_FIPS', 'WB')),
    name text NOT NULL,
    iso3 text CHECK (iso3 ~ '^[A-Z]{3}$'),
    parent_id text REFERENCES geographies DEFERRABLE INITIALLY DEFERRED,
    UNIQUE (level, code_system, code),
    CHECK ((level = 'country' AND parent_id IS NULL AND (
               (code_system = 'UN_M49' AND code ~ '^[0-9]{3}$') OR
               (code_system = 'WB' AND code = 'XKX')))
        OR (level = 'state' AND code_system = 'US_FIPS' AND code ~ '^[0-9]{2}$'
            AND parent_id = 'country:840')
        OR (level = 'county' AND code_system = 'US_FIPS' AND code ~ '^[0-9]{5}$'
            AND parent_id = 'state:' || left(code, 2)))
);
CREATE VIEW countries AS SELECT * FROM geographies WHERE level = 'country';
CREATE VIEW us_states AS SELECT * FROM geographies WHERE level = 'state';
CREATE VIEW us_counties AS SELECT * FROM geographies WHERE level = 'county';

CREATE TABLE corridors (
    origin_id text NOT NULL REFERENCES geographies,
    destination_id text NOT NULL REFERENCES geographies,
    PRIMARY KEY (origin_id, destination_id),
    CHECK (origin_id <> destination_id)
);

CREATE TABLE migration_measures (
    measure text PRIMARY KEY,
    unit text NOT NULL,
    UNIQUE (measure, unit)
);
INSERT INTO migration_measures VALUES
    ('stock_persons', 'persons'), ('acs_movers', 'persons'),
    ('tax_returns', 'returns'), ('tax_individuals', 'covered_individuals');

CREATE TABLE migration_observations (
    batch_id text NOT NULL,
    dataset_id text NOT NULL,
    origin_id text NOT NULL,
    destination_id text NOT NULL,
    year_start smallint NOT NULL CHECK (year_start BETWEEN 1900 AND 2100),
    year_end smallint NOT NULL CHECK (year_end BETWEEN year_start AND 2100),
    measure text NOT NULL,
    unit text NOT NULL,
    value numeric CHECK (value >= 0 AND value = trunc(value)),
    status text NOT NULL CHECK (status IN ('observed', 'missing', 'suppressed')),
    moe numeric CHECK (moe >= 0),
    source_row text NOT NULL,
    PRIMARY KEY (batch_id, dataset_id, origin_id, destination_id, year_start, year_end, measure),
    FOREIGN KEY (batch_id, dataset_id) REFERENCES dataset_releases,
    FOREIGN KEY (origin_id, destination_id) REFERENCES corridors,
    FOREIGN KEY (measure, unit) REFERENCES migration_measures (measure, unit),
    CHECK ((status = 'observed') = (value IS NOT NULL)),
    CHECK (moe IS NULL OR measure = 'acs_movers')
);
CREATE INDEX migration_destination ON migration_observations (dataset_id, year_end, destination_id);
CREATE INDEX migration_origin ON migration_observations (dataset_id, year_end, origin_id);

CREATE TABLE economic_indicators (
    code text PRIMARY KEY,
    name text NOT NULL,
    unit text NOT NULL,
    metadata jsonb NOT NULL,
    UNIQUE (code, unit)
);
CREATE TABLE economic_observations (
    batch_id text NOT NULL,
    dataset_id text NOT NULL,
    geography_id text NOT NULL REFERENCES geographies,
    year smallint NOT NULL CHECK (year BETWEEN 1900 AND 2100),
    indicator text NOT NULL,
    unit text NOT NULL,
    value numeric CHECK (value >= 0),
    status text NOT NULL CHECK (status IN ('observed', 'missing')),
    source_row text NOT NULL,
    PRIMARY KEY (batch_id, dataset_id, geography_id, year, indicator),
    FOREIGN KEY (batch_id, dataset_id) REFERENCES dataset_releases,
    FOREIGN KEY (indicator, unit) REFERENCES economic_indicators (code, unit),
    CHECK ((status = 'observed') = (value IS NOT NULL)),
    CHECK (unit <> 'percent_labor_force' OR value <= 100)
);

-- History remains immutable; analytics explicitly selects one complete published batch.
CREATE TABLE active_batch (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    batch_id text NOT NULL REFERENCES ingestion_runs
);
CREATE VIEW migration_current AS
SELECT o.*, r.metadata->>'family' AS family,
       r.metadata->>'observation_type' AS observation_type,
       r.metadata->>'scope' AS scope, r.metadata->>'period' AS period,
       r.metadata->>'geography_level' AS geography_level
FROM migration_observations o
JOIN active_batch a USING (batch_id)
JOIN dataset_releases r USING (batch_id, dataset_id);
CREATE VIEW economic_current AS
SELECT o.* FROM economic_observations o JOIN active_batch a USING (batch_id);
